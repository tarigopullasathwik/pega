import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App';
import { api, formatCurrency, formatDateTime, getStatusBadgeClass, getUrgencyBadgeClass } from '../lib/api';

export function StaffDashboard() {
  const { user } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ status: '', showType: '' });

  useEffect(() => {
    loadCases();
  }, [filters]);

  const loadCases = async () => {
    try {
      setLoading(true);
      const data = await api.getWorklist({ ...filters, workbasket: user.workbasket, limit: 200 });
      setCases(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (caseId, action, reason = '') => {
    try {
      if (action === 'review') {
        const decision = prompt('APPROVE or REJECT?');
        if (!decision) return;
        const rejectReason = decision.toUpperCase() === 'REJECT' ? prompt('Reason for rejection:') : '';
        await api.reviewBooking(caseId, decision, rejectReason);
      } else if (action === 'process') {
        const paymentRef = prompt('Payment reference (optional):') || '';
        await api.processBooking(caseId, paymentRef);
      }
      loadCases();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <LoadingInline />;

  const pendingReview = cases.filter(c => c.status === 'Pending-StaffReview');
  const pendingProcessing = cases.filter(c => c.status === 'Pending-Processing');
  const other = cases.filter(c => !['Pending-StaffReview', 'Pending-Processing'].includes(c.status));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Staff Worklist</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>Workbasket: {user.workbasket}</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Filters */}
      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ minWidth: 180 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Status</label>
            <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="btn-secondary" style={{ padding: '8px 12px' }}>
              <option value="">All</option>
              <option value="Pending-StaffReview">Pending Review</option>
              <option value="Pending-Processing">Pending Processing</option>
              <option value="Resolved-Booked">Booked</option>
              <option value="Resolved-Rejected">Rejected</option>
              <option value="Resolved-Cancelled">Cancelled</option>
            </select>
          </div>
          <div style={{ minWidth: 180 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Show Type</label>
            <select value={filters.showType} onChange={e => setFilters({...filters, showType: e.target.value})} className="btn-secondary" style={{ padding: '8px 12px' }}>
              <option value="">All</option>
              <option value="REGULAR">Regular</option>
              <option value="PREMIUM">Premium</option>
              <option value="IMAX">IMAX</option>
              <option value="FOURDX">4DX</option>
            </select>
          </div>
          <button onClick={() => setFilters({ status: '', showType: '' })} className="btn-secondary btn-sm">Clear Filters</button>
        </div>
      </div>

      {/* Pending Review Section */}
      {pendingReview.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: 'var(--color-warning)' }}>
            📋 Awaiting Review ({pendingReview.length})
          </h2>
          <CaseTable cases={pendingReview} onAction={handleAction} showReview={true} />
        </section>
      )}

      {/* Pending Processing Section */}
      {pendingProcessing.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: 'var(--color-primary)' }}>
            ⚙️ Awaiting Processing ({pendingProcessing.length})
          </h2>
          <CaseTable cases={pendingProcessing} onAction={handleAction} showProcess={true} />
        </section>
      )}

      {/* Other Cases */}
      {other.length > 0 && (
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Other Cases ({other.length})</h2>
          <CaseTable cases={other} onAction={handleAction} />
        </section>
      )}

      {cases.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <h3>No cases in your workbasket</h3>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 8 }}>All caught up!</p>
        </div>
      )}
    </div>
  );
}

function CaseTable({ cases, onAction, showReview, showProcess }) {
  return (
    <div className="card">
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Case ID</th>
              <th>Customer</th>
              <th>Movie</th>
              <th>Show Time</th>
              <th>Seats</th>
              <th>Total</th>
              <th>Urgency</th>
              <th>SLA</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cases.map(c => (
              <tr key={c.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.caseId}</td>
                <td>{c.customerName}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{c.showType}</div>
                </td>
                <td>{formatDateTime(c.startsAt)}</td>
                <td>{c.quantity} × {c.seatClass}</td>
                <td style={{ fontWeight: 600 }}>{c.totalCost ? formatCurrency(c.totalCost) : '—'}</td>
                <td>
                  <span className={`badge ${getUrgencyBadgeClass(c.urgency)}`}>
                    {c.urgency}
                  </span>
                </td>
                <td>
                  {c.assignment && (
                    <div style={{ fontSize: 12 }}>
                      <div>{c.assignment.slaName || '—'}</div>
                      <div style={{ color: c.assignment.slaState === 'ON_TRACK' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {c.assignment.slaState}
                      </div>
                      {c.assignment.deadlineAt && (
                        <div style={{ color: 'var(--color-text-muted)' }}>
                          Due: {formatDateTime(c.assignment.deadlineAt)}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Link to={`/booking/${c.caseId}`} className="btn-secondary btn-sm">View</Link>
                    {showReview && (
                      <button className="btn-primary btn-sm" onClick={() => onAction(c.caseId, 'review')}>
                        Review
                      </button>
                    )}
                    {showProcess && (
                      <button className="btn-success btn-sm" onClick={() => onAction(c.caseId, 'process')}>
                        Process
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LoadingInline() {
  return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;
}