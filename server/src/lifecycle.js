/**
 * Case lifecycle for the Booking case type.
 *
 * Intake -> Assess -> Approve -> Fulfil -> Resolve, mirroring a case-managed
 * booking process. `status` is the case status, `stage` the current stage.
 */

export const STAGES = ['Intake', 'Assess', 'Approve', 'Fulfil', 'Resolve'];

export const STATUS = {
  NEW: 'New-Submitted',
  AVAILABILITY_CHECKED: 'Open-AvailabilityChecked',
  COSTED: 'Open-Costed',
  PENDING_CONFIRMATION: 'Pending-CustomerConfirmation',
  PENDING_REVIEW: 'Pending-StaffReview',
  PENDING_PROCESSING: 'Pending-Processing',
  BOOKED: 'Resolved-Booked',
  REJECTED: 'Resolved-Rejected',
  CANCELLED: 'Resolved-Cancelled',
  EXPIRED: 'Resolved-Expired',
};

export const STAGE_OF_STATUS = {
  [STATUS.NEW]: 'Intake',
  [STATUS.AVAILABILITY_CHECKED]: 'Assess',
  [STATUS.COSTED]: 'Assess',
  [STATUS.PENDING_CONFIRMATION]: 'Approve',
  [STATUS.PENDING_REVIEW]: 'Approve',
  [STATUS.PENDING_PROCESSING]: 'Fulfil',
  [STATUS.BOOKED]: 'Resolve',
  [STATUS.REJECTED]: 'Resolve',
  [STATUS.CANCELLED]: 'Resolve',
  [STATUS.EXPIRED]: 'Resolve',
};

export const RESOLVED_STATUSES = new Set([
  STATUS.BOOKED,
  STATUS.REJECTED,
  STATUS.CANCELLED,
  STATUS.EXPIRED,
]);

/** Allowed status transitions. Anything not listed is rejected by the API. */
export const TRANSITIONS = {
  [STATUS.NEW]: [STATUS.AVAILABILITY_CHECKED, STATUS.REJECTED, STATUS.CANCELLED],
  [STATUS.AVAILABILITY_CHECKED]: [STATUS.COSTED, STATUS.REJECTED, STATUS.CANCELLED],
  [STATUS.COSTED]: [STATUS.PENDING_CONFIRMATION, STATUS.CANCELLED],
  [STATUS.PENDING_CONFIRMATION]: [STATUS.PENDING_REVIEW, STATUS.CANCELLED, STATUS.EXPIRED],
  [STATUS.PENDING_REVIEW]: [STATUS.PENDING_PROCESSING, STATUS.REJECTED, STATUS.CANCELLED, STATUS.EXPIRED],
  [STATUS.PENDING_PROCESSING]: [STATUS.BOOKED, STATUS.REJECTED, STATUS.CANCELLED, STATUS.EXPIRED],
  [STATUS.BOOKED]: [STATUS.CANCELLED],
  [STATUS.REJECTED]: [],
  [STATUS.CANCELLED]: [],
  [STATUS.EXPIRED]: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`Invalid transition: ${from} -> ${to}`);
    err.status = 409;
    throw err;
  }
}

/** Human-readable label for each status, used by the UI. */
export const STATUS_LABEL = {
  [STATUS.NEW]: 'Submitted',
  [STATUS.AVAILABILITY_CHECKED]: 'Availability confirmed',
  [STATUS.COSTED]: 'Cost calculated',
  [STATUS.PENDING_CONFIRMATION]: 'Awaiting your confirmation',
  [STATUS.PENDING_REVIEW]: 'Awaiting staff review',
  [STATUS.PENDING_PROCESSING]: 'Being processed',
  [STATUS.BOOKED]: 'Booked',
  [STATUS.REJECTED]: 'Rejected',
  [STATUS.CANCELLED]: 'Cancelled',
  [STATUS.EXPIRED]: 'Expired',
};

export const ASSIGNMENT = {
  CONFIRM: 'ConfirmBooking',
  REVIEW: 'ReviewBookingDetails',
  PROCESS: 'ProcessTicketBooking',
};

export const SHOW_TYPES = ['REGULAR', 'PREMIUM', 'IMAX', 'FOURDX'];
export const SEAT_CLASSES = ['SILVER', 'GOLD', 'PLATINUM', 'RECLINER'];
