import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App';
import { api, formatCurrency, formatDateTime, getStatusBadgeClass } from '../lib/api';

export function CustomerDashboard() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadBookings();
  }, []);

  const loadBookings = async () => {
    try {
      setLoading(true);
      const data = await api.listBookings({ customerId: user.id });
      setBookings(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingInline />;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>My Bookings</h1>

      {error && <div className="alert alert-error">{error}</div>}

      {bookings.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎫</div>
          <h3>No bookings yet</h3>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 8, marginBottom: 24 }}>
            Start by browsing movies and booking your first tickets!
          </p>
          <Link to="/movies" className="btn-primary">Browse Movies</Link>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Movie</th>
                  <th>Show Time</th>
                  <th>Cinema / Screen</th>
                  <th>Seats</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{b.caseId}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{b.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{b.showType}</div>
                    </td>
                    <td>{formatDateTime(b.startsAt)}</td>
                    <td>
                      <div>{b.cinema}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{b.screen}</div>
                    </td>
                    <td>
                      {b.quantity} × {b.seatClass}
                      {b.ticketCode && <div style={{ fontSize: 11, color: 'var(--color-primary)', fontFamily: 'monospace', marginTop: 2 }}>{b.ticketCode}</div>}
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(b.status)}`}>
                        {b.statusLabel}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{b.totalCost ? formatCurrency(b.totalCost) : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link to={`/booking/${b.caseId}`} className="btn-secondary btn-sm">View</Link>
                        {['Pending-CustomerConfirmation'].includes(b.status) && (
                          <button className="btn-success btn-sm" onClick={() => window.location.reload()}>
                            Confirm
                          </button>
                        )}
                        {['New-Submitted', 'Open-AvailabilityChecked', 'Open-Costed', 'Pending-CustomerConfirmation', 'Pending-StaffReview'].includes(b.status) && (
                          <button className="btn-danger btn-sm" onClick={() => cancelBooking(b.caseId)}>Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

async function cancelBooking(caseId) {
  if (!confirm('Are you sure you want to cancel this booking?')) return;
  try {
    await api.cancelBooking(caseId, 'Cancelled by customer');
    window.location.reload();
  } catch (err) {
    alert(err.message);
  }
}

function LoadingInline() {
  return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;
}