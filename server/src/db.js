import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), 'server', 'data', 'booking.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role         TEXT NOT NULL CHECK (role IN ('customer','staff','admin')),
      email        TEXT,
      phone        TEXT,
      workbasket   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cinemas (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      city     TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata'
    );

    CREATE TABLE IF NOT EXISTS screens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      cinema_id  INTEGER NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      show_type  TEXT NOT NULL CHECK (show_type IN ('REGULAR','PREMIUM','IMAX','FOURDX')),
      UNIQUE (cinema_id, name)
    );

    CREATE TABLE IF NOT EXISTS seats (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      screen_id  INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
      row_label  TEXT NOT NULL,
      seat_no    INTEGER NOT NULL,
      seat_class TEXT NOT NULL CHECK (seat_class IN ('SILVER','GOLD','PLATINUM','RECLINER')),
      UNIQUE (screen_id, row_label, seat_no)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS movies (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      language      TEXT NOT NULL,
      genre         TEXT NOT NULL,
      certification TEXT NOT NULL CHECK (certification IN ('U','UA','A')),
      duration_min  INTEGER NOT NULL CHECK (duration_min > 0),
      release_date  TEXT,
      synopsis      TEXT,
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shows (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      screen_id   INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
      show_type   TEXT NOT NULL CHECK (show_type IN ('REGULAR','PREMIUM','IMAX','FOURDX')),
      starts_at   TEXT NOT NULL,
      base_price  REAL NOT NULL CHECK (base_price > 0),
      status      TEXT NOT NULL DEFAULT 'SCHEDULED'
                    CHECK (status IN ('SCHEDULED','CANCELLED','COMPLETED')),
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (screen_id, starts_at)
    );

    CREATE INDEX IF NOT EXISTS idx_shows_movie ON shows(movie_id);
    CREATE INDEX IF NOT EXISTS idx_shows_start ON shows(starts_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id           TEXT NOT NULL UNIQUE,
      customer_id       INTEGER NOT NULL REFERENCES users(id),
      show_id           INTEGER NOT NULL REFERENCES shows(id),
      seat_class        TEXT NOT NULL,
      quantity          INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
      promo_code        TEXT,
      contact_email     TEXT NOT NULL,
      contact_phone     TEXT,
      notes             TEXT,
      status            TEXT NOT NULL,
      stage             TEXT NOT NULL,
      urgency           INTEGER NOT NULL DEFAULT 10,
      cost_breakdown    TEXT,
      total_cost        REAL,
      availability_note TEXT,
      ticket_code       TEXT,
      resolution        TEXT,
      resolution_reason TEXT,
      hold_expires_at   TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_show     ON bookings(show_id);

    CREATE TABLE IF NOT EXISTS booking_seats (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      show_id    INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
      seat_id    INTEGER NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
      state      TEXT NOT NULL CHECK (state IN ('HELD','BOOKED','RELEASED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_seat_per_show
      ON booking_seats(show_id, seat_id) WHERE state IN ('HELD','BOOKED');
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS assignments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      workbasket   TEXT,
      assigned_to  INTEGER REFERENCES users(id),
      status       TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','CANCELLED')),
      sla_name     TEXT,
      goal_at      TEXT,
      deadline_at  TEXT,
      sla_state    TEXT NOT NULL DEFAULT 'ON_TRACK'
                     CHECK (sla_state IN ('ON_TRACK','GOAL_MISSED','DEADLINE_MISSED','MET')),
      routed_by    TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_assign_open ON assignments(status, workbasket);

    CREATE TABLE IF NOT EXISTS sla_definitions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      assignment    TEXT NOT NULL,
      show_type     TEXT NOT NULL DEFAULT 'ANY',
      goal_minutes  INTEGER NOT NULL CHECK (goal_minutes > 0),
      deadline_minutes INTEGER NOT NULL CHECK (deadline_minutes > 0),
      goal_urgency     INTEGER NOT NULL DEFAULT 20,
      deadline_urgency INTEGER NOT NULL DEFAULT 40,
      escalate_to   TEXT,
      active        INTEGER NOT NULL DEFAULT 1,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (assignment, show_type)
    );

    CREATE TABLE IF NOT EXISTS routing_rules (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      priority    INTEGER NOT NULL,
      description TEXT NOT NULL,
      show_type   TEXT NOT NULL DEFAULT 'ANY',
      min_total   REAL,
      max_total   REAL,
      min_quantity INTEGER,
      workbasket  TEXT NOT NULL,
      active      INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pricing_config (
      key         TEXT PRIMARY KEY,
      value       REAL NOT NULL,
      description TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS promo_codes (
      code        TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      kind        TEXT NOT NULL CHECK (kind IN ('PERCENT','FLAT')),
      amount      REAL NOT NULL CHECK (amount > 0),
      max_discount REAL,
      min_quantity INTEGER NOT NULL DEFAULT 1,
      active      INTEGER NOT NULL DEFAULT 1
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
      channel    TEXT NOT NULL CHECK (channel IN ('EMAIL','SMS')),
      recipient  TEXT NOT NULL,
      template   TEXT NOT NULL,
      subject    TEXT NOT NULL,
      body       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'SENT',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notif_booking ON notifications(booking_id);

    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
      actor      TEXT NOT NULL,
      action     TEXT NOT NULL,
      from_status TEXT,
      to_status   TEXT,
      detail     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_booking ON audit_log(booking_id);
  `);
}

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

initSchema();
