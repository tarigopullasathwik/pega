import { db } from '../db.js';
import { nowIso, conflict, notFound } from '../util.js';

/**
 * Capability 02: Check Show Availability.
 *
 * A seat is unavailable when a booking_seats row holds it in HELD or BOOKED
 * state for that show. Expired holds are released first so their seats free up.
 */

export function releaseExpiredHolds() {
  const now = nowIso();
  const expired = db
    .prepare(
      `SELECT id, case_id FROM bookings
        WHERE status = 'Pending-CustomerConfirmation'
          AND hold_expires_at IS NOT NULL
          AND hold_expires_at < ?`
    )
    .all(now);

  if (expired.length === 0) return [];

  const releaseSeats = db.prepare(
    `UPDATE booking_seats SET state = 'RELEASED' WHERE booking_id = ? AND state = 'HELD'`
  );
  const expireBooking = db.prepare(
    `UPDATE bookings
        SET status = 'Resolved-Expired', stage = 'Resolve',
            resolution = 'Expired',
            resolution_reason = 'Seat hold expired before customer confirmation',
            updated_at = datetime('now')
      WHERE id = ?`
  );
  const closeAssignments = db.prepare(
    `UPDATE assignments SET status = 'CANCELLED', completed_at = datetime('now')
      WHERE booking_id = ? AND status = 'OPEN'`
  );
  const logAudit = db.prepare(
    `INSERT INTO audit_log (booking_id, actor, action, from_status, to_status, detail)
     VALUES (?, 'system', 'HoldExpired', 'Pending-CustomerConfirmation', 'Resolved-Expired', ?)`
  );

  for (const booking of expired) {
    releaseSeats.run(booking.id);
    expireBooking.run(booking.id);
    closeAssignments.run(booking.id);
    logAudit.run(booking.id, `Hold expired for case ${booking.case_id}`);
  }
  return expired.map((b) => b.case_id);
}

export function getShowOrThrow(showId) {
  const show = db
    .prepare(
      `SELECT s.*, m.title, m.language, m.duration_min, m.certification,
              sc.name AS screen_name, c.name AS cinema_name, c.city
         FROM shows s
         JOIN movies m   ON m.id = s.movie_id
         JOIN screens sc ON sc.id = s.screen_id
         JOIN cinemas c  ON c.id = sc.cinema_id
        WHERE s.id = ?`
    )
    .get(showId);
  if (!show) throw notFound(`Show ${showId} not found`);
  return show;
}

/** Per-seat-class availability for one show. */
export function showAvailability(showId) {
  releaseExpiredHolds();
  const show = getShowOrThrow(showId);

  const rows = db
    .prepare(
      `SELECT st.seat_class,
              COUNT(*) AS total,
              SUM(CASE WHEN bs.id IS NULL THEN 1 ELSE 0 END) AS available
         FROM seats st
         LEFT JOIN booking_seats bs
                ON bs.seat_id = st.id
               AND bs.show_id = ?
               AND bs.state IN ('HELD','BOOKED')
        WHERE st.screen_id = ?
        GROUP BY st.seat_class
        ORDER BY st.seat_class`
    )
    .all(showId, show.screen_id);

  const byClass = rows.map((r) => ({
    seatClass: r.seat_class,
    total: Number(r.total),
    available: Number(r.available),
    occupied: Number(r.total) - Number(r.available),
  }));

  const totalSeats = byClass.reduce((sum, c) => sum + c.total, 0);
  const totalAvailable = byClass.reduce((sum, c) => sum + c.available, 0);

  return {
    show: {
      id: show.id,
      movieId: show.movie_id,
      title: show.title,
      language: show.language,
      certification: show.certification,
      durationMin: show.duration_min,
      showType: show.show_type,
      startsAt: show.starts_at,
      basePrice: show.base_price,
      status: show.status,
      screen: show.screen_name,
      cinema: show.cinema_name,
      city: show.city,
    },
    totalSeats,
    totalAvailable,
    byClass,
    seatMap: seatMap(showId, show.screen_id),
  };
}

/** Every seat on the screen with its current state for this show. */
export function seatMap(showId, screenId) {
  return db
    .prepare(
      `SELECT st.id, st.row_label, st.seat_no, st.seat_class,
              COALESCE(bs.state, 'FREE') AS state
         FROM seats st
         LEFT JOIN booking_seats bs
                ON bs.seat_id = st.id
               AND bs.show_id = ?
               AND bs.state IN ('HELD','BOOKED')
        WHERE st.screen_id = ?
        ORDER BY st.row_label, st.seat_no`
    )
    .all(showId, screenId)
    .map((r) => ({
      seatId: r.id,
      row: r.row_label,
      number: r.seat_no,
      seatClass: r.seat_class,
      state: r.state,
    }));
}

/**
 * Answers "can this request be met?" without changing anything.
 * Returns { ok, reason, availableInClass, suggestions }.
 */
export function checkRequest({ showId, seatClass, quantity }) {
  const availability = showAvailability(showId);
  const show = availability.show;

  if (show.status !== 'SCHEDULED') {
    return { ok: false, reason: `Show is ${show.status.toLowerCase()}`, availability };
  }

  const startMs = Date.parse(show.startsAt.replace(' ', 'T') + 'Z');
  if (startMs <= Date.now()) {
    return { ok: false, reason: 'Show has already started', availability };
  }

  const cls = availability.byClass.find((c) => c.seatClass === seatClass);
  if (!cls) {
    return {
      ok: false,
      reason: `Seat class ${seatClass} does not exist on screen ${show.screen}`,
      availability,
    };
  }

  if (cls.available < quantity) {
    const suggestions = availability.byClass
      .filter((c) => c.seatClass !== seatClass && c.available >= quantity)
      .map((c) => ({ seatClass: c.seatClass, available: c.available }));
    return {
      ok: false,
      reason: `Only ${cls.available} ${seatClass} seat(s) left, ${quantity} requested`,
      availableInClass: cls.available,
      suggestions,
      availability,
    };
  }

  return { ok: true, reason: 'Seats available', availableInClass: cls.available, availability };
}

/**
 * Reserves `quantity` contiguous-where-possible seats in the class.
 * Caller must already be inside a transaction.
 */
export function holdSeats({ bookingId, showId, seatClass, quantity, explicitSeatIds }) {
  const show = getShowOrThrow(showId);

  let chosen;
  if (explicitSeatIds?.length) {
    const placeholders = explicitSeatIds.map(() => '?').join(',');
    chosen = db
      .prepare(
        `SELECT st.id, st.row_label, st.seat_no, st.seat_class
           FROM seats st
          WHERE st.screen_id = ? AND st.id IN (${placeholders})`
      )
      .all(show.screen_id, ...explicitSeatIds);
    if (chosen.length !== explicitSeatIds.length) {
      throw conflict('One or more selected seats do not belong to this screen');
    }
  } else {
    chosen = db
      .prepare(
        `SELECT st.id, st.row_label, st.seat_no, st.seat_class
           FROM seats st
           LEFT JOIN booking_seats bs
                  ON bs.seat_id = st.id
                 AND bs.show_id = ?
                 AND bs.state IN ('HELD','BOOKED')
          WHERE st.screen_id = ?
            AND st.seat_class = ?
            AND bs.id IS NULL
          ORDER BY st.row_label, st.seat_no
          LIMIT ?`
      )
      .all(showId, show.screen_id, seatClass, quantity);

    if (chosen.length < quantity) {
      throw conflict(`Only ${chosen.length} ${seatClass} seat(s) available, ${quantity} requested`);
    }
  }

  const insert = db.prepare(
    `INSERT INTO booking_seats (booking_id, show_id, seat_id, state) VALUES (?, ?, ?, 'HELD')`
  );
  for (const seat of chosen) {
    try {
      insert.run(bookingId, showId, seat.id);
    } catch {
      throw conflict(`Seat ${seat.row_label}${seat.seat_no} was just taken, please retry`);
    }
  }

  return chosen.map((s) => ({
    seatId: s.id,
    row: s.row_label,
    number: s.seat_no,
    seatClass: s.seat_class,
    label: `${s.row_label}${s.seat_no}`,
  }));
}

export function seatsForBooking(bookingId) {
  return db
    .prepare(
      `SELECT bs.state, st.id AS seat_id, st.row_label, st.seat_no, st.seat_class
         FROM booking_seats bs
         JOIN seats st ON st.id = bs.seat_id
        WHERE bs.booking_id = ?
        ORDER BY st.row_label, st.seat_no`
    )
    .all(bookingId)
    .map((r) => ({
      seatId: r.seat_id,
      row: r.row_label,
      number: r.seat_no,
      seatClass: r.seat_class,
      state: r.state,
      label: `${r.row_label}${r.seat_no}`,
    }));
}
