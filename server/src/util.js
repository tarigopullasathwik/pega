import { db } from './db.js';

/** SQLite stores timestamps as 'YYYY-MM-DD HH:MM:SS' in UTC. */
export function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function toIso(date) {
  return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
}

export function addMinutes(iso, minutes) {
  const ms = Date.parse(iso.replace(' ', 'T') + 'Z') + minutes * 60_000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

export function minutesBetween(fromIso, toIsoStr) {
  const a = Date.parse(fromIso.replace(' ', 'T') + 'Z');
  const b = Date.parse(toIsoStr.replace(' ', 'T') + 'Z');
  return Math.round((b - a) / 60_000);
}

/** Sequential business identifier, e.g. B-1001. */
export function nextCaseId() {
  const row = db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM bookings').get();
  return `B-${1000 + Number(row.maxId) + 1}`;
}

export function ticketCode(caseId) {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TKT-${caseId.replace('B-', '')}-${rand}`;
}

export function audit({ bookingId, actor, action, fromStatus = null, toStatus = null, detail = null }) {
  db.prepare(
    `INSERT INTO audit_log (booking_id, actor, action, from_status, to_status, detail)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    bookingId ?? null,
    actor,
    action,
    fromStatus,
    toStatus,
    detail === null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail)
  );
}

export function badRequest(message, details) {
  const err = new Error(message);
  err.status = 400;
  if (details) err.details = details;
  return err;
}

export function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

export function conflict(message) {
  const err = new Error(message);
  err.status = 409;
  return err;
}

export function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  return err;
}
