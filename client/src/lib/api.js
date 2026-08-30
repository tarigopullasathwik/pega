const API_BASE = '/api';

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const user = localStorage.getItem('mtbm_user');
  if (user) {
    try {
      const { username } = JSON.parse(user);
      headers['X-User'] = username;
    } catch {}
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data.code;
    error.details = data.details;
    throw error;
  }

  return data;
}

export const api = {
  // Auth
  getUsers: () => request('/auth/users'),
  login: (username) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username }) }),

  // Catalog
  getMovies: (includeInactive = false) => request(`/movies${includeInactive ? '?all=true' : ''}`),
  getCinemas: () => request('/cinemas'),
  getShows: (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && search.set(k, v));
    return request(`/shows?${search.toString()}`);
  },
  getShowAvailability: (showId) => request(`/shows/${showId}/availability`),
  checkAvailability: (showId, seatClass, quantity) =>
    request('/availability/check', { method: 'POST', body: JSON.stringify({ showId, seatClass, quantity }) }),
  calculateCost: (showId, seatClass, quantity, promoCode) =>
    request('/cost/calculate', { method: 'POST', body: JSON.stringify({ showId, seatClass, quantity, promoCode }) }),
  getPricingConfig: () => request('/pricing-config'),

  // Booking
  submitBooking: (data) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  confirmBooking: (caseId) => request(`/bookings/${caseId}/confirm`, { method: 'POST' }),
  reviewBooking: (caseId, decision, reason, reviewer) =>
    request(`/bookings/${caseId}/review`, { method: 'POST', body: JSON.stringify({ decision, reason, reviewer }) }),
  processBooking: (caseId, paymentReference) =>
    request(`/bookings/${caseId}/process`, { method: 'POST', body: JSON.stringify({ paymentReference }) }),
  cancelBooking: (caseId, reason) =>
    request(`/bookings/${caseId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getBooking: (caseId) => request(`/bookings/${caseId}`),
  listBookings: (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && search.set(k, v));
    return request(`/bookings?${search.toString()}`);
  },

  // Worklist (staff/admin)
  getWorklist: (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && search.set(k, v));
    return request(`/worklist?${search.toString()}`);
  },
  getAllWorklist: (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && search.set(k, v));
    return request(`/worklist/all?${search.toString()}`);
  },
  getSlaDefinitions: () => request('/sla'),
  getRoutingRules: () => request('/routing'),
  getPricingConfigAdmin: () => request('/pricing'),
  getNotifications: (caseId) => request(`/bookings/${caseId}/notifications`),
  getAuditLog: (caseId) => request(`/bookings/${caseId}/audit`),
  getAssignmentHistory: (caseId) => request(`/bookings/${caseId}/assignments`),
  rerouteCase: (caseId) => request(`/bookings/${caseId}/reroute`, { method: 'POST' }),

  // Admin movie/show management
  createMovie: (data) => request('/movies', { method: 'POST', body: JSON.stringify(data) }),
  updateMovie: (id, data) => request(`/movies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMovie: (id) => request(`/movies/${id}`, { method: 'DELETE' }),
  createShow: (data) => request('/shows', { method: 'POST', body: JSON.stringify(data) }),
  updateShow: (id, data) => request(`/shows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteShow: (id) => request(`/shows/${id}`, { method: 'DELETE' }),
  getAdminShows: () => request('/admin/shows'),
};

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(isoString) {
  return new Date(isoString.replace(' ', 'T')).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDate(isoString) {
  return new Date(isoString.replace(' ', 'T')).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function getStatusBadgeClass(status) {
  if (status?.startsWith('New')) return 'badge-new';
  if (status?.startsWith('Open')) return 'badge-open';
  if (status?.startsWith('Pending')) return 'badge-pending';
  if (status?.startsWith('Resolved-Booked')) return 'badge-resolved';
  if (status?.startsWith('Resolved-Rejected')) return 'badge-rejected';
  if (status?.startsWith('Resolved-Cancelled')) return 'badge-cancelled';
  if (status?.startsWith('Resolved-Expired')) return 'badge-expired';
  return 'badge-open';
}

export function getUrgencyBadgeClass(urgency) {
  if (urgency >= 30) return 'badge-urgent';
  if (urgency >= 20) return 'badge-high';
  return 'badge-normal';
}