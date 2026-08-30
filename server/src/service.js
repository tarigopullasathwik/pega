import { db, tx } from './db.js';
import {
  STATUS, STAGE_OF_STATUS, STATUS_LABEL, ASSIGNMENT,
  assertTransition, RESOLVED_STATUSES,
} from './lifecycle.js';
import {
  nowIso, addMinutes, nextCaseId, ticketCode, audit,
  badRequest, notFound, conflict, forbidden,
} from './util.js';
import {
  checkRequest, holdSeats, seatsForBooking, getShowOrThrow, releaseExpiredHolds,
} from './engine/availability.js';
import { calculateCost, loadPricingConfig } from './engine/pricing.js';
import { routeBooking } from './engine/routing.js';
import {
  createAssignment, completeAssignment, openAssignment,
  assignmentHistory, decorateAssignment,
} from './engine/sla.js';
import { notify, notificationsFor } from './engine/notify.js';

/** Shared context builder for notification templates and API responses. */
function caseContext(bookingId) {
  const row = db
    .prepare(
      `SELECT b.*, u.display_name AS customer_name, u.username AS customer_username,
              s.starts_at, s.show_type, s.base_price, s.status AS show_status,
              m.title, m.language, m.certification, m.duration_min,
              sc.name AS screen_name, c.name AS cinema_name, c.city
         FROM bookings b
         JOIN users u    ON u.id = b.customer_id
         JOIN shows s    ON s.id = b.show_id
         JOIN movies m   ON m.id = s.movie_id
         JOIN screens sc ON sc.id = s.screen_id
         JOIN cinemas c  ON c.id = sc.cinema_id
        WHERE b.id = ?`
    )
    .get(bookingId);
  if (!row) throw notFound(`Booking ${bookingId} not found`);
  return row;
}

function notifyContext(row, extra = {}) {
  const seats = seatsForBooking(row.id).filter((s) => s.state !== 'RELEASED');
  return {
    caseId: row.case_id,
    customerName: row.customer_name,
    title: row.title,
    language: row.language,
    certification: row.certification,
    showType: row.show_type,
    startsAt: row.starts_at,
    cinema: row.cinema_name,
    screen: row.screen_name,
    seatClass: row.seat_class,
    quantity: row.quantity,
    seatLabels: seats.map((s) => s.label).join(', ') || '(released)',
    currency: 'INR',
    total: row.total_cost != null ? row.total_cost.toFixed(2) : '0.00',
    ticketCode: row.ticket_code,
    holdExpiresAt: row.hold_expires_at,
    ...extra,
  };
}

/** Full case view returned by GET /api/bookings/:caseId. */
export function getCase(caseIdOrRow) {
  const row =
    typeof caseIdOrRow === 'object'
      ? caseIdOrRow
      : db.prepare('SELECT id FROM bookings WHERE case_id = ?').get(caseIdOrRow);
  if (!row) throw notFound(`Case ${caseIdOrRow} not found`);

  const b = caseContext(row.id);
  const seats = seatsForBooking(b.id);
  const history = db
    .prepare(
      `SELECT id, actor, action, from_status, to_status, detail, created_at
         FROM audit_log WHERE booking_id = ? ORDER BY id ASC`
    )
    .all(b.id);

  return {
    caseId: b.case_id,
    id: b.id,
    status: b.status,
    statusLabel: STATUS_LABEL[b.status] ?? b.status,
    stage: b.stage,
    urgency: b.urgency,
    resolved: RESOLVED_STATUSES.has(b.status),
    customer: {
      id: b.customer_id,
      username: b.customer_username,
      name: b.customer_name,
      email: b.contact_email,
      phone: b.contact_phone,
    },
    show: {
      id: b.show_id,
      title: b.title,
      language: b.language,
      certification: b.certification,
      durationMin: b.duration_min,
      showType: b.show_type,
      startsAt: b.starts_at,
      basePrice: b.base_price,
      status: b.show_status,
      cinema: b.cinema_name,
      screen: b.screen_name,
      city: b.city,
    },
    request: {
      seatClass: b.seat_class,
      quantity: b.quantity,
      promoCode: b.promo_code,
      notes: b.notes,
    },
    seats,
    availabilityNote: b.availability_note,
    cost: b.cost_breakdown ? JSON.parse(b.cost_breakdown) : null,
    totalCost: b.total_cost,
    holdExpiresAt: b.hold_expires_at,
    ticketCode: b.ticket_code,
    resolution: b.resolution,
    resolutionReason: b.resolution_reason,
    assignment: decorateAssignment(openAssignment(b.id)),
    assignments: assignmentHistory(b.id).map(decorateAssignment),
    notifications: notificationsFor(b.id),
    history: history.map((h) => ({
      ...h,
      detail: safeParse(h.detail),
    })),
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

function safeParse(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function setStatus(bookingId, from, to, actor, detail, extraColumns = {}) {
  assertTransition(from, to);
  const stage = STAGE_OF_STATUS[to];
  const sets = ['status = ?', 'stage = ?', "updated_at = datetime('now')"];
  const values = [to, stage];
  for (const [col, val] of Object.entries(extraColumns)) {
    sets.push(`${col} = ?`);
    values.push(val);
  }
  db.prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ?`).run(...values, bookingId);
  audit({ bookingId, actor, action: 'StatusChanged', fromStatus: from, toStatus: to, detail });
}

/**
 * Capability 01: Submit Movie Ticket Request.
 * Runs availability (02) and pricing (03) inline, holds seats, and parks the
 * case on a ConfirmBooking assignment governed by the confirm SLA (09).
 */
export function submitRequest({ actor, customerId, showId, seatClass, quantity, promoCode, notes, seatIds, contactEmail, contactPhone }) {
  const customer = db.prepare('SELECT * FROM users WHERE id = ?').get(customerId);
  if (!customer) throw badRequest(`Unknown customer ${customerId}`);

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw badRequest('Quantity must be a whole number between 1 and 10');
  }

  const email = (contactEmail || customer.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('A valid contact email is required');
  }

  releaseExpiredHolds();

  const requestedSeatIds = Array.isArray(seatIds) && seatIds.length ? seatIds.map(Number) : null;
  if (requestedSeatIds && requestedSeatIds.length !== qty) {
    throw badRequest(`Selected ${requestedSeatIds.length} seats but quantity is ${qty}`);
  }

  const check = checkRequest({ showId: Number(showId), seatClass, quantity: qty });
  if (!check.ok) {
    throw conflict(check.reason);
  }

  return tx(() => {
    const caseId = nextCaseId();
    const info = db
      .prepare(
        `INSERT INTO bookings
           (case_id, customer_id, show_id, seat_class, quantity, promo_code,
            contact_email, contact_phone, notes, status, stage, urgency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10)`
      )
      .run(
        caseId, customer.id, Number(showId), seatClass, qty,
        promoCode ? promoCode.trim().toUpperCase() : null,
        email, contactPhone || customer.phone || null,
        notes || null, STATUS.NEW, STAGE_OF_STATUS[STATUS.NEW]
      );
    const bookingId = Number(info.lastInsertRowid);

    audit({
      bookingId, actor, action: 'CaseCreated', toStatus: STATUS.NEW,
      detail: { showId: Number(showId), seatClass, quantity: qty, promoCode: promoCode || null },
    });

    const show = getShowOrThrow(Number(showId));

    // 02: availability confirmed, seats held
    const held = holdSeats({ bookingId, showId: Number(showId), seatClass, quantity: qty, explicitSeatIds: requestedSeatIds });
    const availabilityNote = `${held.length} ${seatClass} seat(s) held: ${held.map((s) => s.label).join(', ')}`;
    setStatus(bookingId, STATUS.NEW, STATUS.AVAILABILITY_CHECKED, actor,
      { seats: held.map((s) => s.label) }, { availability_note: availabilityNote });

    // 03: cost calculated
    const cost = calculateCost({ show, seatClass, quantity: qty, promoCode });
    setStatus(bookingId, STATUS.AVAILABILITY_CHECKED, STATUS.COSTED, actor,
      { total: cost.total, promoApplied: cost.promoApplied, promoError: cost.promoError },
      { cost_breakdown: JSON.stringify(cost), total_cost: cost.total });

    // Park on customer confirmation with a hold window
    const cfg = loadPricingConfig();
    const holdMinutes = cfg['hold.minutes'] ?? 20;
    const holdExpiresAt = addMinutes(nowIso(), holdMinutes);
    setStatus(bookingId, STATUS.COSTED, STATUS.PENDING_CONFIRMATION, actor,
      { holdMinutes }, { hold_expires_at: holdExpiresAt });

    // 10: routing decided up front so staff queues are predictable
    const route = routeBooking({ showType: show.show_type, total: cost.total, quantity: qty });
    const assignment = createAssignment({
      bookingId,
      name: ASSIGNMENT.CONFIRM,
      workbasket: route.workbasket,
      showType: show.show_type,
      routedBy: route.description,
    });
    audit({ bookingId, actor: 'system', action: 'Routed', detail: route });

    const row = caseContext(bookingId);
    notify({
      bookingId, template: 'BookingSubmitted', recipient: email,
      context: notifyContext(row), actor,
    });
    notify({
      bookingId, template: 'CostQuoted', recipient: email,
      context: notifyContext(row), actor,
    });

    return { ...getCase({ id: bookingId }), routing: route, assignmentCreated: assignment };
  });
}

/**
 * Capability 04: Confirm Booking Request.
 * Customer accepts the quote; case moves to staff review (06) routed by show
 * type (10) under the review SLA (09).
 */
export function confirmRequest({ actor, caseId, actingUser }) {
  releaseExpiredHolds();
  const row = db.prepare('SELECT * FROM bookings WHERE case_id = ?').get(caseId);
  if (!row) throw notFound(`Case ${caseId} not found`);

  if (actingUser?.role === 'customer' && actingUser.id !== row.customer_id) {
    throw forbidden('You can only confirm your own bookings');
  }
  if (row.status !== STATUS.PENDING_CONFIRMATION) {
    throw conflict(`Case ${caseId} is ${STATUS_LABEL[row.status] ?? row.status}, not awaiting confirmation`);
  }

  return tx(() => {
    completeAssignment(row.id, ASSIGNMENT.CONFIRM, actor);

    const full = caseContext(row.id);
    const cost = JSON.parse(full.cost_breakdown);
    const route = routeBooking({
      showType: full.show_type, total: cost.total, quantity: full.quantity,
    });

    setStatus(row.id, STATUS.PENDING_CONFIRMATION, STATUS.PENDING_REVIEW, actor,
      { confirmedTotal: cost.total }, { hold_expires_at: null });

    const assignment = createAssignment({
      bookingId: row.id,
      name: ASSIGNMENT.REVIEW,
      workbasket: route.workbasket,
      showType: full.show_type,
      routedBy: route.description,
    });
    audit({ bookingId: row.id, actor: 'system', action: 'Routed', detail: route });

    const updated = caseContext(row.id);
    notify({
      bookingId: row.id, template: 'BookingConfirmed', recipient: updated.contact_email,
      context: notifyContext(updated, {
        workbasket: assignment.workbasket,
        deadlineAt: assignment.deadlineAt ?? 'n/a',
      }),
      actor,
    });

    return { ...getCase({ id: row.id }), routing: route, assignmentCreated: assignment };
  });
}

/**
 * Capability 06: Review Booking Details.
 * Staff approves (-> processing) or rejects (-> resolved) with a reason.
 */
export function reviewCase({ actor, caseId, decision, reason, reviewer }) {
  const row = db.prepare('SELECT * FROM bookings WHERE case_id = ?').get(caseId);
  if (!row) throw notFound(`Case ${caseId} not found`);
  if (row.status !== STATUS.PENDING_REVIEW) {
    throw conflict(`Case ${caseId} is not awaiting review (currently ${row.status})`);
  }
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    throw badRequest("decision must be 'APPROVE' or 'REJECT'");
  }
  if (decision === 'REJECT' && !reason?.trim()) {
    throw badRequest('A reason is required when rejecting a booking');
  }

  return tx(() => {
    completeAssignment(row.id, ASSIGNMENT.REVIEW, actor);
    const full = caseContext(row.id);

    if (decision === 'REJECT') {
      releaseSeats(row.id);
      setStatus(row.id, STATUS.PENDING_REVIEW, STATUS.REJECTED, actor, { reason },
        { resolution: 'Rejected', resolution_reason: reason.trim() });
      const updated = caseContext(row.id);
      notify({
        bookingId: row.id, template: 'BookingRejected', recipient: updated.contact_email,
        context: notifyContext(updated, { reason: reason.trim() }), actor,
      });
      return getCase({ id: row.id });
    }

    const cost = JSON.parse(full.cost_breakdown);
    const route = routeBooking({
      showType: full.show_type, total: cost.total, quantity: full.quantity,
    });
    setStatus(row.id, STATUS.PENDING_REVIEW, STATUS.PENDING_PROCESSING, actor,
      { reviewedBy: reviewer ?? actor, note: reason || null });

    const assignment = createAssignment({
      bookingId: row.id,
      name: ASSIGNMENT.PROCESS,
      workbasket: route.workbasket,
      showType: full.show_type,
      routedBy: route.description,
    });

    return { ...getCase({ id: row.id }), routing: route, assignmentCreated: assignment };
  });
}

/**
 * Capability 07: Process Ticket Booking.
 * Converts held seats to BOOKED, issues a ticket code, resolves the case, and
 * fires the confirmation notifications (08).
 */
export function processBooking({ actor, caseId, paymentReference }) {
  const row = db.prepare('SELECT * FROM bookings WHERE case_id = ?').get(caseId);
  if (!row) throw notFound(`Case ${caseId} not found`);
  if (row.status !== STATUS.PENDING_PROCESSING) {
    throw conflict(`Case ${caseId} is not ready for processing (currently ${row.status})`);
  }

  return tx(() => {
    const held = db
      .prepare(`SELECT COUNT(*) AS n FROM booking_seats WHERE booking_id = ? AND state = 'HELD'`)
      .get(row.id).n;
    if (Number(held) !== row.quantity) {
      throw conflict(`Expected ${row.quantity} held seat(s) but found ${held}; re-check availability`);
    }

    db.prepare(`UPDATE booking_seats SET state = 'BOOKED' WHERE booking_id = ? AND state = 'HELD'`).run(row.id);
    completeAssignment(row.id, ASSIGNMENT.PROCESS, actor);

    const code = ticketCode(row.case_id);
    setStatus(row.id, STATUS.PENDING_PROCESSING, STATUS.BOOKED, actor,
      { ticketCode: code, paymentReference: paymentReference || null },
      { ticket_code: code, resolution: 'Booked', resolution_reason: null });

    const updated = caseContext(row.id);
    const ctx = notifyContext(updated);
    notify({ bookingId: row.id, template: 'BookingCompleted', recipient: updated.contact_email, context: ctx, actor });
    if (updated.contact_phone) {
      notify({
        bookingId: row.id, template: 'SmsBookingCompleted', channel: 'SMS',
        recipient: updated.contact_phone, context: ctx, actor,
      });
    }

    return getCase({ id: row.id });
  });
}

function releaseSeats(bookingId) {
  db.prepare(
    `UPDATE booking_seats SET state = 'RELEASED' WHERE booking_id = ? AND state IN ('HELD','BOOKED')`
  ).run(bookingId);
}

/** Cancel from any non-terminal status, or reverse a completed booking. */
export function cancelCase({ actor, caseId, reason, actingUser }) {
  const row = db.prepare('SELECT * FROM bookings WHERE case_id = ?').get(caseId);
  if (!row) throw notFound(`Case ${caseId} not found`);
  if (actingUser?.role === 'customer' && actingUser.id !== row.customer_id) {
    throw forbidden('You can only cancel your own bookings');
  }
  if ([STATUS.CANCELLED, STATUS.REJECTED, STATUS.EXPIRED].includes(row.status)) {
    throw conflict(`Case ${caseId} is already resolved as ${row.status}`);
  }

  return tx(() => {
    db.prepare(
      `UPDATE assignments SET status = 'CANCELLED', completed_at = datetime('now')
        WHERE booking_id = ? AND status = 'OPEN'`
    ).run(row.id);
    releaseSeats(row.id);
    setStatus(row.id, row.status, STATUS.CANCELLED, actor, { reason: reason || null },
      { resolution: 'Cancelled', resolution_reason: reason?.trim() || null, hold_expires_at: null });

    const updated = caseContext(row.id);
    notify({
      bookingId: row.id, template: 'BookingCancelled', recipient: updated.contact_email,
      context: notifyContext(updated, { reason: reason?.trim() || '' }), actor,
    });

    return getCase({ id: row.id });
  });
}

/** Worklist / customer list query with filters. */
export function listCases({ customerId, workbasket, status, showType, resolved, limit = 100 }) {
  releaseExpiredHolds();
  const where = [];
  const params = [];

  if (customerId) { where.push('b.customer_id = ?'); params.push(customerId); }
  if (status) { where.push('b.status = ?'); params.push(status); }
  if (showType) { where.push('s.show_type = ?'); params.push(showType); }
  if (workbasket) { where.push('a.workbasket = ?'); params.push(workbasket); }
  if (resolved === true) where.push(`b.status LIKE 'Resolved-%'`);
  if (resolved === false) where.push(`b.status NOT LIKE 'Resolved-%'`);

  const rows = db
    .prepare(
      `SELECT b.id, b.case_id, b.status, b.stage, b.urgency, b.quantity, b.seat_class,
              b.total_cost, b.hold_expires_at, b.ticket_code, b.created_at, b.updated_at,
              u.display_name AS customer_name,
              m.title, s.show_type, s.starts_at,
              sc.name AS screen_name, c.name AS cinema_name,
              a.name AS assignment_name, a.workbasket, a.sla_name,
              a.goal_at, a.deadline_at, a.sla_state
         FROM bookings b
         JOIN users u    ON u.id = b.customer_id
         JOIN shows s    ON s.id = b.show_id
         JOIN movies m   ON m.id = s.movie_id
         JOIN screens sc ON sc.id = s.screen_id
         JOIN cinemas c  ON c.id = sc.cinema_id
         LEFT JOIN assignments a ON a.booking_id = b.id AND a.status = 'OPEN'
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY b.urgency DESC, b.created_at ASC
        LIMIT ?`
    )
    .all(...params, limit);

  return rows.map((r) => ({
    id: r.id,
    caseId: r.case_id,
    status: r.status,
    statusLabel: STATUS_LABEL[r.status] ?? r.status,
    stage: r.stage,
    urgency: r.urgency,
    customerName: r.customer_name,
    title: r.title,
    showType: r.show_type,
    startsAt: r.starts_at,
    cinema: r.cinema_name,
    screen: r.screen_name,
    seatClass: r.seat_class,
    quantity: r.quantity,
    totalCost: r.total_cost,
    holdExpiresAt: r.hold_expires_at,
    ticketCode: r.ticket_code,
    assignment: r.assignment_name
      ? {
          name: r.assignment_name,
          workbasket: r.workbasket,
          slaName: r.sla_name,
          goalAt: r.goal_at,
          deadlineAt: r.deadline_at,
          slaState: r.sla_state,
        }
      : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
