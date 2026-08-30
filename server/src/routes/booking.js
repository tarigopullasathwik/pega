import { Router } from 'express';
import {
  submitRequest, confirmRequest, reviewCase, processBooking, cancelCase, getCase, listCases,
} from '../service.js';
import { badRequest, notFound } from '../util.js';
import { requireRole } from './auth.js';

/**
 * Capabilities 01, 04, 06, 07, 11, 12:
 * 01 Submit Movie Ticket Request
 * 04 Confirm Booking Request
 * 06 Review Booking Details
 * 07 Process Ticket Booking
 * 11 View Case Details
 * 12 List Cases (Worklist)
 */
export const bookingRouter = Router();

// Capability 01: Submit Movie Ticket Request
bookingRouter.post('/bookings', async (req, res, next) => {
  try {
    const { showId, seatClass, quantity, promoCode, notes, seatIds, contactEmail, contactPhone } = req.body || {};
    if (!showId || !seatClass || !quantity) {
      throw badRequest('showId, seatClass and quantity are required');
    }
    const result = submitRequest({
      actor: req.user.username,
      customerId: req.user.id,
      showId: Number(showId),
      seatClass: String(seatClass).toUpperCase(),
      quantity: Number(quantity),
      promoCode: promoCode?.trim().toUpperCase() || null,
      notes: notes?.trim() || null,
      seatIds: seatIds ? seatIds.map(Number) : null,
      contactEmail: contactEmail?.trim() || null,
      contactPhone: contactPhone?.trim() || null,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Capability 04: Confirm Booking Request (customer)
bookingRouter.post('/bookings/:caseId/confirm', async (req, res, next) => {
  try {
    const result = confirmRequest({
      actor: req.user.username,
      caseId: req.params.caseId,
      actingUser: req.user,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Capability 06: Review Booking Details (staff)
bookingRouter.post('/bookings/:caseId/review', requireRole('staff', 'admin'), async (req, res, next) => {
  try {
    const { decision, reason, reviewer } = req.body || {};
    const result = reviewCase({
      actor: req.user.username,
      caseId: req.params.caseId,
      decision: String(decision).toUpperCase(),
      reason: reason?.trim() || null,
      reviewer: reviewer?.trim() || null,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Capability 07: Process Ticket Booking (staff)
bookingRouter.post('/bookings/:caseId/process', requireRole('staff', 'admin'), async (req, res, next) => {
  try {
    const { paymentReference } = req.body || {};
    const result = processBooking({
      actor: req.user.username,
      caseId: req.params.caseId,
      paymentReference: paymentReference?.trim() || null,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Capability 11: View Case Details
bookingRouter.get('/bookings/:caseId', async (req, res, next) => {
  try {
    const result = getCase(req.params.caseId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Cancel booking
bookingRouter.post('/bookings/:caseId/cancel', async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    const result = cancelCase({
      actor: req.user.username,
      caseId: req.params.caseId,
      reason: reason?.trim() || null,
      actingUser: req.user,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Capability 12: List Cases (with filters)
bookingRouter.get('/bookings', async (req, res, next) => {
  try {
    const { customerId, workbasket, status, showType, resolved, limit } = req.query;
    const result = listCases({
      customerId: customerId ? Number(customerId) : null,
      workbasket: workbasket || null,
      status: status || null,
      showType: showType || null,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : null,
      limit: limit ? Number(limit) : 100,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});