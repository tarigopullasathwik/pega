import { db } from '../db.js';
import { audit } from '../util.js';

/**
 * Capability 08: Notify Booking Confirmation.
 *
 * Correspondence is rendered from templates and written to the notifications
 * table, which acts as the outbox. No external provider is contacted; swap
 * `deliver` for a real transport when integrating SMTP or an SMS gateway.
 */

const templates = {
  BookingSubmitted: (ctx) => ({
    subject: `[${ctx.caseId}] We received your booking request`,
    body: `Hi ${ctx.customerName},

Your booking request ${ctx.caseId} has been received.

  Movie   : ${ctx.title} (${ctx.language}, ${ctx.certification})
  Show    : ${ctx.showType} on ${ctx.startsAt}
  Venue   : ${ctx.cinema}, ${ctx.screen}
  Seats   : ${ctx.quantity} x ${ctx.seatClass}

We are checking availability and will send you the cost shortly.`,
  }),

  CostQuoted: (ctx) => ({
    subject: `[${ctx.caseId}] Your booking cost is ${ctx.currency} ${ctx.total}`,
    body: `Hi ${ctx.customerName},

Seats are held for booking ${ctx.caseId} until ${ctx.holdExpiresAt} (UTC).

  Seats   : ${ctx.seatLabels}
  Total   : ${ctx.currency} ${ctx.total}

Confirm before the hold expires or the seats will be released.`,
  }),

  BookingConfirmed: (ctx) => ({
    subject: `[${ctx.caseId}] Confirmation received, booking in progress`,
    body: `Hi ${ctx.customerName},

Thanks for confirming booking ${ctx.caseId}. It is now with our ${ctx.workbasket} team
for review. Expected completion by ${ctx.deadlineAt} (UTC).`,
  }),

  BookingCompleted: (ctx) => ({
    subject: `[${ctx.caseId}] Booked - ${ctx.ticketCode}`,
    body: `Hi ${ctx.customerName},

Your tickets are confirmed.

  Ticket  : ${ctx.ticketCode}
  Movie   : ${ctx.title}
  Show    : ${ctx.showType} on ${ctx.startsAt}
  Venue   : ${ctx.cinema}, ${ctx.screen}
  Seats   : ${ctx.seatLabels}
  Paid    : ${ctx.currency} ${ctx.total}

Show this code at the counter. Enjoy the film.`,
  }),

  BookingRejected: (ctx) => ({
    subject: `[${ctx.caseId}] Booking could not be completed`,
    body: `Hi ${ctx.customerName},

We could not complete booking ${ctx.caseId}.

  Reason  : ${ctx.reason}

Any held seats have been released. You are welcome to try another show.`,
  }),

  BookingCancelled: (ctx) => ({
    subject: `[${ctx.caseId}] Booking cancelled`,
    body: `Hi ${ctx.customerName},

Booking ${ctx.caseId} has been cancelled${ctx.reason ? `: ${ctx.reason}` : '.'}
Seats have been released back to inventory.`,
  }),

  SmsBookingCompleted: (ctx) => ({
    subject: `Booking ${ctx.caseId} confirmed`,
    body: `${ctx.ticketCode} | ${ctx.title} | ${ctx.startsAt} | ${ctx.seatLabels} | ${ctx.currency} ${ctx.total}`,
  }),
};

export function availableTemplates() {
  return Object.keys(templates);
}

function deliver({ bookingId, channel, recipient, template, subject, body }) {
  const info = db
    .prepare(
      `INSERT INTO notifications (booking_id, channel, recipient, template, subject, body, status)
       VALUES (?, ?, ?, ?, ?, ?, 'SENT')`
    )
    .run(bookingId ?? null, channel, recipient, template, subject, body);
  return Number(info.lastInsertRowid);
}

/**
 * Renders and stores a notification.
 * @returns {{id:number,channel:string,recipient:string,subject:string}|null}
 */
export function notify({ bookingId, template, channel = 'EMAIL', recipient, context, actor = 'system' }) {
  const render = templates[template];
  if (!render) throw new Error(`Unknown notification template: ${template}`);
  if (!recipient) return null;

  const { subject, body } = render(context);
  const id = deliver({ bookingId, channel, recipient, template, subject, body });

  audit({
    bookingId,
    actor,
    action: 'NotificationSent',
    detail: { template, channel, recipient, subject },
  });

  return { id, channel, recipient, subject, body, template };
}

export function notificationsFor(bookingId) {
  return db
    .prepare(
      `SELECT id, channel, recipient, template, subject, body, status, created_at
         FROM notifications WHERE booking_id = ? ORDER BY id ASC`
    )
    .all(bookingId);
}

export function allNotifications(limit = 100) {
  return db
    .prepare(
      `SELECT n.id, n.booking_id, b.case_id, n.channel, n.recipient, n.template,
              n.subject, n.body, n.status, n.created_at
         FROM notifications n
         LEFT JOIN bookings b ON b.id = n.booking_id
        ORDER BY n.id DESC LIMIT ?`
    )
    .all(limit);
}
