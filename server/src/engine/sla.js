import { db } from '../db.js';
import { nowIso, addMinutes, minutesBetween, audit } from '../util.js';

/**
 * Capability 09: Define Booking SLA.
 *
 * An SLA definition is looked up by (assignment, show type) with 'ANY' as
 * fallback. When an assignment is created its goal and deadline timestamps are
 * stamped; a sweeper re-evaluates open assignments and raises urgency and
 * escalates when goal/deadline pass.
 */

export function slaDefinitions() {
  return db
    .prepare('SELECT * FROM sla_definitions ORDER BY assignment, show_type')
    .all();
}

export function resolveSla(assignmentName, showType) {
  return (
    db
      .prepare(
        `SELECT * FROM sla_definitions
          WHERE assignment = ? AND show_type = ? AND active = 1`
      )
      .get(assignmentName, showType) ||
    db
      .prepare(
        `SELECT * FROM sla_definitions
          WHERE assignment = ? AND show_type = 'ANY' AND active = 1`
      )
      .get(assignmentName) ||
    null
  );
}

/**
 * Creates the open assignment for a stage and stamps its SLA.
 * Caller supplies the workbasket from the routing engine.
 */
export function createAssignment({ bookingId, name, workbasket, showType, routedBy, assignedTo = null }) {
  db.prepare(
    `UPDATE assignments SET status = 'COMPLETED', completed_at = datetime('now')
      WHERE booking_id = ? AND status = 'OPEN'`
  ).run(bookingId);

  const sla = resolveSla(name, showType);
  const created = nowIso();
  const goalAt = sla ? addMinutes(created, sla.goal_minutes) : null;
  const deadlineAt = sla ? addMinutes(created, sla.deadline_minutes) : null;

  const info = db
    .prepare(
      `INSERT INTO assignments
         (booking_id, name, workbasket, assigned_to, status, sla_name, goal_at, deadline_at, sla_state, routed_by, created_at)
       VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, 'ON_TRACK', ?, ?)`
    )
    .run(
      bookingId,
      name,
      workbasket,
      assignedTo,
      sla?.name ?? null,
      goalAt,
      deadlineAt,
      routedBy ?? null,
      created
    );

  return {
    id: Number(info.lastInsertRowid),
    name,
    workbasket,
    slaName: sla?.name ?? null,
    goalAt,
    deadlineAt,
  };
}

export function completeAssignment(bookingId, name, actor) {
  const assignment = db
    .prepare(`SELECT * FROM assignments WHERE booking_id = ? AND name = ? AND status = 'OPEN'`)
    .get(bookingId, name);
  if (!assignment) return null;

  const now = nowIso();
  const metGoal = !assignment.goal_at || now <= assignment.goal_at;
  const state = metGoal
    ? 'MET'
    : !assignment.deadline_at || now <= assignment.deadline_at
      ? 'GOAL_MISSED'
      : 'DEADLINE_MISSED';

  db.prepare(
    `UPDATE assignments
        SET status = 'COMPLETED', completed_at = ?, sla_state = ?
      WHERE id = ?`
  ).run(now, state, assignment.id);

  audit({
    bookingId,
    actor,
    action: 'AssignmentCompleted',
    detail: {
      assignment: name,
      slaState: state,
      minutesTaken: minutesBetween(assignment.created_at, now),
    },
  });

  return { ...assignment, sla_state: state, completed_at: now };
}

/**
 * Re-evaluates every open assignment. Returns the list of escalations applied
 * so the caller can surface them. Safe to call repeatedly.
 */
export function runSlaSweep() {
  const now = nowIso();
  const open = db
    .prepare(
      `SELECT a.*, b.case_id, b.urgency, b.contact_email, sd.goal_urgency, sd.deadline_urgency, sd.escalate_to
         FROM assignments a
         JOIN bookings b ON b.id = a.booking_id
         LEFT JOIN sla_definitions sd ON sd.name = a.sla_name
        WHERE a.status = 'OPEN'`
    )
    .all();

  const changes = [];
  const setState = db.prepare('UPDATE assignments SET sla_state = ?, workbasket = ? WHERE id = ?');
  const setUrgency = db.prepare(
    `UPDATE bookings SET urgency = ?, updated_at = datetime('now') WHERE id = ?`
  );

  for (const a of open) {
    let nextState = 'ON_TRACK';
    if (a.deadline_at && now > a.deadline_at) nextState = 'DEADLINE_MISSED';
    else if (a.goal_at && now > a.goal_at) nextState = 'GOAL_MISSED';
    if (nextState === a.sla_state) continue;

    const escalate = nextState === 'DEADLINE_MISSED' && a.escalate_to ? a.escalate_to : a.workbasket;
    setState.run(nextState, escalate, a.id);

    const urgencyBump =
      nextState === 'DEADLINE_MISSED' ? (a.deadline_urgency ?? 40) : (a.goal_urgency ?? 20);
    const newUrgency = Math.min(100, 10 + urgencyBump);
    setUrgency.run(newUrgency, a.booking_id);

    audit({
      bookingId: a.booking_id,
      actor: 'system',
      action: `SLA_${nextState}`,
      detail: {
        assignment: a.name,
        sla: a.sla_name,
        goalAt: a.goal_at,
        deadlineAt: a.deadline_at,
        urgency: newUrgency,
        movedTo: escalate !== a.workbasket ? escalate : undefined,
      },
    });

    changes.push({
      caseId: a.case_id,
      assignment: a.name,
      slaState: nextState,
      workbasket: escalate,
      urgency: newUrgency,
    });
  }

  return changes;
}

export function openAssignment(bookingId) {
  return db
    .prepare(`SELECT * FROM assignments WHERE booking_id = ? AND status = 'OPEN' ORDER BY id DESC LIMIT 1`)
    .get(bookingId);
}

export function assignmentHistory(bookingId) {
  return db
    .prepare('SELECT * FROM assignments WHERE booking_id = ? ORDER BY id ASC')
    .all(bookingId);
}

/** Adds remaining-time info for UI display. */
export function decorateAssignment(a) {
  if (!a) return null;
  const now = nowIso();
  return {
    id: a.id,
    name: a.name,
    workbasket: a.workbasket,
    assignedTo: a.assigned_to,
    status: a.status,
    slaName: a.sla_name,
    goalAt: a.goal_at,
    deadlineAt: a.deadline_at,
    slaState: a.sla_state,
    routedBy: a.routed_by,
    createdAt: a.created_at,
    completedAt: a.completed_at,
    minutesToGoal: a.goal_at && a.status === 'OPEN' ? minutesBetween(now, a.goal_at) : null,
    minutesToDeadline: a.deadline_at && a.status === 'OPEN' ? minutesBetween(now, a.deadline_at) : null,
  };
}
