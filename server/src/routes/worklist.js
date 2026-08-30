import { Router } from 'express';
import { db } from '../db.js';
import { listCases } from '../service.js';
import { requireRole } from './auth.js';

/**
 * Worklist routes for staff (capability 10 - routing, capability 09 - SLA)
 * Provides filtered views of cases assigned to workbaskets.
 */
export const worklistRouter = Router();

// Staff worklist - shows open assignments for their workbasket(s)
worklistRouter.get('/worklist', requireRole('staff', 'admin'), (req, res) => {
  const { workbasket, status, showType, limit = 100 } = req.query;
  
  // Staff can only see their own workbasket unless admin
  const wb = req.user.role === 'admin' ? workbasket : req.user.workbasket;
  
  const result = listCases({
    workbasket: wb || null,
    status: status || null,
    showType: showType || null,
    resolved: false,
    limit: Number(limit),
  });
  
  res.json(result);
});

// Admin: all cases across workbaskets
worklistRouter.get('/worklist/all', requireRole('admin'), (req, res) => {
  const { workbasket, status, showType, resolved, limit = 200 } = req.query;
  
  const result = listCases({
    workbasket: workbasket || null,
    status: status || null,
    showType: showType || null,
    resolved: resolved === 'true' ? true : resolved === 'false' ? false : null,
    limit: Number(limit),
  });
  
  res.json(result);
});

// SLA definitions - for admin to view/manage
worklistRouter.get('/sla', requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM sla_definitions ORDER BY assignment, show_type').all();
  res.json(rows);
});

// Routing rules - for admin to view/manage
worklistRouter.get('/routing', requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM routing_rules ORDER BY priority').all();
  res.json(rows);
});

// Pricing config - for admin to view/manage
worklistRouter.get('/pricing', requireRole('admin'), (req, res) => {
  const config = db.prepare('SELECT * FROM pricing_config ORDER BY key').all();
  const promos = db.prepare('SELECT * FROM promo_codes ORDER BY code').all();
  res.json({ config, promos });
});

// Notifications for a case
worklistRouter.get('/bookings/:caseId/notifications', (req, res) => {
  const { notificationsFor } = require('../engine/notify.js');
  try {
    const row = db.prepare('SELECT id FROM bookings WHERE case_id = ?').get(req.params.caseId);
    if (!row) return res.status(404).json({ error: 'Case not found' });
    res.json(notificationsFor(row.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit history for a case
worklistRouter.get('/bookings/:caseId/audit', (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM bookings WHERE case_id = ?').get(req.params.caseId);
    if (!row) return res.status(404).json({ error: 'Case not found' });
    const history = db.prepare(
      `SELECT id, actor, action, from_status, to_status, detail, created_at
         FROM audit_log WHERE booking_id = ? ORDER BY id ASC`
    ).all(row.id);
    res.json(history.map(h => ({
      ...h,
      detail: h.detail ? JSON.parse(h.detail) : null,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assignment history for a case
worklistRouter.get('/bookings/:caseId/assignments', (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM bookings WHERE case_id = ?').get(req.params.caseId);
    if (!row) return res.status(404).json({ error: 'Case not found' });
    const { assignmentHistory, decorateAssignment } = require('../engine/sla.js');
    const history = assignmentHistory(row.id).map(decorateAssignment);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Re-route a case (admin only)
worklistRouter.post('/bookings/:caseId/reroute', requireRole('admin'), (req, res) => {
  try {
    const { routeBooking } = require('../engine/routing.js');
    const { createAssignment, completeAssignment, openAssignment, decorateAssignment } = require('../engine/sla.js');
    const { getCase } = require('../service.js');
    
    const row = db.prepare('SELECT * FROM bookings WHERE case_id = ?').get(req.params.caseId);
    if (!row) return res.status(404).json({ error: 'Case not found' });
    
    // Cancel current open assignment
    completeAssignment(row.id, 'ConfirmBooking', req.user.username);
    completeAssignment(row.id, 'ReviewBookingDetails', req.user.username);
    completeAssignment(row.id, 'ProcessTicketBooking', req.user.username);
    
    // Re-route
    const full = getCase({ id: row.id });
    const cost = JSON.parse(full.cost_breakdown);
    const route = routeBooking({
      showType: full.show_type,
      total: cost.total,
      quantity: full.quantity,
    });
    
    // Create new assignment based on current status
    let assignmentName = 'ConfirmBooking';
    if (row.status === 'Pending-StaffReview') assignmentName = 'ReviewBookingDetails';
    else if (row.status === 'Pending-Processing') assignmentName = 'ProcessTicketBooking';
    
    const assignment = createAssignment({
      bookingId: row.id,
      name: assignmentName,
      workbasket: route.workbasket,
      showType: full.show_type,
      routedBy: route.description,
    });
    
    res.json({ ...getCase({ id: row.id }), routing: route, assignmentCreated: assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});