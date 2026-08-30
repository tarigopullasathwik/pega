import { db, initSchema, tx } from '../server/src/db.js';

/**
 * Seeds reference data: users, cinemas, screens, seats, movies, shows, and the
 * configuration that drives pricing, SLA and routing. Idempotent - clears
 * transactional and reference tables, then re-inserts.
 */

initSchema();

const SEAT_LAYOUT = {
  REGULAR: [
    { rows: ['A', 'B', 'C'], seats: 10, seatClass: 'SILVER' },
    { rows: ['D', 'E'], seats: 10, seatClass: 'GOLD' },
  ],
  PREMIUM: [
    { rows: ['A', 'B'], seats: 8, seatClass: 'GOLD' },
    { rows: ['C', 'D'], seats: 8, seatClass: 'PLATINUM' },
  ],
  IMAX: [
    { rows: ['A', 'B', 'C'], seats: 12, seatClass: 'GOLD' },
    { rows: ['D', 'E'], seats: 12, seatClass: 'PLATINUM' },
  ],
  FOURDX: [
    { rows: ['A', 'B'], seats: 6, seatClass: 'PLATINUM' },
    { rows: ['C'], seats: 6, seatClass: 'RECLINER' },
  ],
};

/** Returns 'YYYY-MM-DD HH:MM:SS' for today+offsetDays at the given local-ish hour. */
function showTime(offsetDays, hour, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

tx(() => {
  for (const table of [
    'audit_log', 'notifications', 'booking_seats', 'assignments', 'bookings',
    'shows', 'movies', 'seats', 'screens', 'cinemas', 'users',
    'sla_definitions', 'routing_rules', 'pricing_config', 'promo_codes',
  ]) {
    db.exec(`DELETE FROM ${table}`);
  }
  db.exec(`DELETE FROM sqlite_sequence`);

  // ---- Users -------------------------------------------------------------
  const insertUser = db.prepare(
    `INSERT INTO users (username, display_name, role, email, phone, workbasket)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const users = [
    ['asha', 'Asha Menon', 'customer', 'asha@example.com', '+91-90000-11111', null],
    ['ravi', 'Ravi Kumar', 'customer', 'ravi@example.com', '+91-90000-22222', null],
    ['neha', 'Neha Iyer', 'customer', 'neha@example.com', '+91-90000-33333', null],
    ['sanjay', 'Sanjay Rao', 'staff', 'sanjay@cineops.example', null, 'BookingOps.General'],
    ['priya', 'Priya Nair', 'staff', 'priya@cineops.example', null, 'BookingOps.Premium'],
    ['imran', 'Imran Shaikh', 'staff', 'imran@cineops.example', null, 'BookingOps.LargeFormat'],
    ['maya', 'Maya Krishnan', 'admin', 'maya@cineops.example', null, 'BookingOps.Escalations'],
  ];
  for (const u of users) insertUser.run(...u);

  // ---- Cinemas, screens, seats ------------------------------------------
  const insertCinema = db.prepare('INSERT INTO cinemas (name, city) VALUES (?, ?)');
  const cinemaIds = {};
  for (const [name, city] of [
    ['Aurora Cineplex', 'Bengaluru'],
    ['Lumina Grand', 'Hyderabad'],
  ]) {
    cinemaIds[name] = Number(insertCinema.run(name, city).lastInsertRowid);
  }

  const insertScreen = db.prepare(
    'INSERT INTO screens (cinema_id, name, show_type) VALUES (?, ?, ?)'
  );
  const insertSeat = db.prepare(
    'INSERT INTO seats (screen_id, row_label, seat_no, seat_class) VALUES (?, ?, ?, ?)'
  );

  const screenIds = {};
  const screenDefs = [
    ['Aurora Cineplex', 'Screen 1', 'REGULAR'],
    ['Aurora Cineplex', 'Screen 2', 'PREMIUM'],
    ['Aurora Cineplex', 'IMAX Hall', 'IMAX'],
    ['Lumina Grand', 'Screen A', 'REGULAR'],
    ['Lumina Grand', '4DX Studio', 'FOURDX'],
  ];
  for (const [cinema, screenName, showType] of screenDefs) {
    const id = Number(insertScreen.run(cinemaIds[cinema], screenName, showType).lastInsertRowid);
    screenIds[`${cinema}|${screenName}`] = { id, showType };
    for (const block of SEAT_LAYOUT[showType]) {
      for (const row of block.rows) {
        for (let n = 1; n <= block.seats; n += 1) {
          insertSeat.run(id, row, n, block.seatClass);
        }
      }
    }
  }

  // ---- Movies ------------------------------------------------------------
  const insertMovie = db.prepare(
    `INSERT INTO movies (title, language, genre, certification, duration_min, release_date, synopsis)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const movieIds = {};
  const movies = [
    ['Monsoon Circuit', 'English', 'Thriller', 'UA', 128, '2026-08-14',
      'A grid engineer races a failing power network during record rains.'],
    ['Kadal Nizhal', 'Tamil', 'Drama', 'U', 145, '2026-08-21',
      'Three generations of a fishing family confront a changing coastline.'],
    ['Orbit Nine', 'English', 'Sci-Fi', 'UA', 156, '2026-08-28',
      'A salvage crew finds a station that should not exist.'],
    ['Chai Aur Chaos', 'Hindi', 'Comedy', 'U', 112, '2026-08-07',
      'A tea stall becomes the unlikely centre of a city-wide scandal.'],
    ['Silent Ledger', 'Malayalam', 'Crime', 'A', 134, '2026-07-31',
      'An auditor uncovers a decade of buried entries.'],
  ];
  for (const m of movies) movieIds[m[0]] = Number(insertMovie.run(...m).lastInsertRowid);

  // ---- Shows -------------------------------------------------------------
  const insertShow = db.prepare(
    `INSERT INTO shows (movie_id, screen_id, show_type, starts_at, base_price)
     VALUES (?, ?, ?, ?, ?)`
  );
  const showDefs = [
    ['Monsoon Circuit', 'Aurora Cineplex|Screen 1', 0, 10, 0, 180],
    ['Monsoon Circuit', 'Aurora Cineplex|Screen 1', 0, 19, 30, 180],
    ['Monsoon Circuit', 'Aurora Cineplex|IMAX Hall', 1, 20, 0, 320],
    ['Kadal Nizhal', 'Aurora Cineplex|Screen 2', 0, 14, 0, 240],
    ['Kadal Nizhal', 'Aurora Cineplex|Screen 2', 1, 21, 0, 240],
    ['Orbit Nine', 'Aurora Cineplex|IMAX Hall', 0, 15, 30, 320],
    ['Orbit Nine', 'Lumina Grand|4DX Studio', 1, 18, 45, 420],
    ['Chai Aur Chaos', 'Lumina Grand|Screen A', 0, 11, 15, 160],
    ['Chai Aur Chaos', 'Lumina Grand|Screen A', 1, 20, 15, 160],
    ['Silent Ledger', 'Lumina Grand|Screen A', 2, 17, 45, 170],
    ['Silent Ledger', 'Aurora Cineplex|Screen 2', 2, 19, 45, 250],
    ['Orbit Nine', 'Lumina Grand|4DX Studio', 2, 21, 30, 420],
  ];
  for (const [title, screenKey, dayOffset, hour, minute, basePrice] of showDefs) {
    const screen = screenIds[screenKey];
    insertShow.run(
      movieIds[title],
      screen.id,
      screen.showType,
      showTime(dayOffset, hour, minute),
      basePrice
    );
  }

  // ---- Pricing configuration --------------------------------------------
  const insertPricing = db.prepare(
    'INSERT INTO pricing_config (key, value, description) VALUES (?, ?, ?)'
  );
  const pricing = [
    ['multiplier.seat.SILVER', 1.0, 'Silver seat class multiplier'],
    ['multiplier.seat.GOLD', 1.25, 'Gold seat class multiplier'],
    ['multiplier.seat.PLATINUM', 1.6, 'Platinum seat class multiplier'],
    ['multiplier.seat.RECLINER', 2.0, 'Recliner seat class multiplier'],
    ['multiplier.show.REGULAR', 1.0, 'Regular format multiplier'],
    ['multiplier.show.PREMIUM', 1.2, 'Premium format multiplier'],
    ['multiplier.show.IMAX', 1.45, 'IMAX format multiplier'],
    ['multiplier.show.FOURDX', 1.7, '4DX format multiplier'],
    ['surcharge.primetime', 0.12, 'Surcharge applied to shows starting 18:00-03:00'],
    ['discount.morning', 0.1, 'Discount applied to shows starting before 12:00'],
    ['fee.convenience.perTicket', 25, 'Convenience fee charged per ticket'],
    ['tax.gst.rate', 0.18, 'GST rate applied to net amount'],
    ['hold.minutes', 20, 'Minutes seats stay held awaiting customer confirmation'],
  ];
  for (const p of pricing) insertPricing.run(...p);

  // ---- Promo codes -------------------------------------------------------
  const insertPromo = db.prepare(
    `INSERT INTO promo_codes (code, description, kind, amount, max_discount, min_quantity)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertPromo.run('FIRSTSHOW', '10% off, capped at 150', 'PERCENT', 10, 150, 1);
  insertPromo.run('FAMILY4', 'Flat 200 off on 4 or more tickets', 'FLAT', 200, null, 4);
  insertPromo.run('WEEKDAY50', 'Flat 50 off any booking', 'FLAT', 50, null, 1);

  // ---- SLA definitions (capability 09) ----------------------------------
  const insertSla = db.prepare(
    `INSERT INTO sla_definitions
       (name, assignment, show_type, goal_minutes, deadline_minutes, goal_urgency, deadline_urgency, escalate_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const slas = [
    ['ConfirmBookingSLA', 'ConfirmBooking', 'ANY', 15, 20, 20, 40, null],
    ['ReviewBookingSLA', 'ReviewBookingDetails', 'ANY', 60, 120, 20, 40, 'BookingOps.Escalations'],
    ['ReviewBookingPremiumSLA', 'ReviewBookingDetails', 'IMAX', 30, 60, 25, 50, 'BookingOps.Escalations'],
    ['ReviewBookingFourDxSLA', 'ReviewBookingDetails', 'FOURDX', 30, 60, 25, 50, 'BookingOps.Escalations'],
    ['ProcessBookingSLA', 'ProcessTicketBooking', 'ANY', 30, 60, 25, 50, 'BookingOps.Escalations'],
    ['ProcessBookingImaxSLA', 'ProcessTicketBooking', 'IMAX', 15, 30, 30, 60, 'BookingOps.Escalations'],
  ];
  for (const s of slas) insertSla.run(...s);

  // ---- Routing rules (capability 10) ------------------------------------
  const insertRoute = db.prepare(
    `INSERT INTO routing_rules
       (priority, description, show_type, min_total, max_total, min_quantity, workbasket)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const routes = [
    [10, 'IMAX bookings go to the large-format desk', 'IMAX', null, null, null, 'BookingOps.LargeFormat'],
    [20, '4DX bookings go to the large-format desk', 'FOURDX', null, null, null, 'BookingOps.LargeFormat'],
    [30, 'Premium format bookings go to the premium desk', 'PREMIUM', null, null, null, 'BookingOps.Premium'],
    [40, 'High-value bookings (>= 3000) go to escalations', 'ANY', 3000, null, null, 'BookingOps.Escalations'],
    [50, 'Bulk bookings (6+ tickets) go to the premium desk', 'ANY', null, null, 6, 'BookingOps.Premium'],
    [60, 'All other bookings go to the general queue', 'ANY', null, null, null, 'BookingOps.General'],
  ];
  for (const r of routes) insertRoute.run(...r);
});

const counts = Object.fromEntries(
  ['users', 'cinemas', 'screens', 'seats', 'movies', 'shows', 'sla_definitions', 'routing_rules', 'pricing_config', 'promo_codes'].map(
    (t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]
  )
);

console.log('Seed complete:');
for (const [table, n] of Object.entries(counts)) {
  console.log(`  ${table.padEnd(18)} ${n}`);
}
console.log('\nSign in with any username: asha, ravi, neha (customer) | sanjay, priya, imran (staff) | maya (admin)');
