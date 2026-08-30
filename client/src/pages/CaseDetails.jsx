import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../App';
import { api, formatCurrency, formatDateTime, getStatusBadgeClass, getUrgencyBadgeClass } from '../lib/api';

export function CaseDetails() {
  const { caseId } = useParams();
  const { user } = useAuth();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    loadCase();
  }, [caseId]);

  const loadCase = async () => {
    try {
      setLoading(true);
      const data = await api.getBooking(caseId);
      setCaseData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action) => {
    setActing(true);
    setError('');
    try {
      if (action === 'confirm') {
        await api.confirmBooking(caseId);
      } else if (action === 'review') {
        const decision = prompt('APPROVE or REJECT?');
        if (!decision) { setActing(false); return; }
        const rejectReason = decision.toUpperCase() === 'REJECT' ? prompt('Reason for rejection:') || '' : '';
        await api.reviewBooking(caseId, decision.toUpperCase(), rejectReason);
      } else if (action === 'process') {
        const paymentRef = prompt('Payment reference (optional):') || '';
        await api.processBooking(caseId, paymentRef);
      } else if (action === 'cancel') {
        if (!window.confirm('Are you sure you want to cancel this booking?')) { setActing(false); return; }
        const reason = prompt('Reason for cancellation:') || 'Cancelled by user';
        await api.cancelBooking(caseId, reason);
      } else if (action === 'reroute') {
        await api.rerouteCase(caseId);
      }
      await loadCase();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  };

  if (loading || !caseData) return <LoadingInline />;

  const seats = caseData.seats || [];
  const heldSeats = seats.filter(s => s.state === 'HELD');
  const bookedSeats = seats.filter(s => s.state === 'BOOKED');
  const releasedSeats = seats.filter(s => s.state === 'RELEASED');
  const show = caseData.show || {};
  const customer = caseData.customer || {};
  const cost = caseData.cost;

  const canConfirm = caseData.status === 'Pending-CustomerConfirmation';
  const canReview = caseData.status === 'Pending-StaffReview' && (user?.role === 'staff' || user?.role === 'admin');
  const canProcess = caseData.status === 'Pending-Processing' && (user?.role === 'staff' || user?.role === 'admin');
  const canReroute = caseData.assignment && user?.role === 'admin';
  const canCancel = !caseData.resolved;

  const backLink = user?.role === 'customer' ? '/my-bookings' : user?.role === 'staff' ? '/staff' : '/admin';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Link to={backLink} className="btn-secondary btn-sm">← Back</Link>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, fontFamily: 'monospace' }}>{caseData.caseId}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{show.title}</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontWeight: 400 }}>
              {show.language} • {show.certification} • {show.durationMin} min • {show.showType}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 400 }}>Show Time</p>
            <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 600 }}>
              {show.startsAt ? formatDateTime(show.startsAt) : '—'}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 20px', borderBottom: '1px solid var(--color-border)' }}>
          {[['details', 'Case Details'], ['seats', 'Seat Map'], ['timeline', 'Timeline'], ['notifications', 'Notifications']].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-muted)',
                background: 'transparent',
                fontWeight: 500,
                borderRadius: 0,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="card-body">
          {activeTab === 'details' && (
            <div>
              <div className="form-row" style={{ marginBottom: 24 }}>
                <div>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>Customer</p>
                  <p style={{ fontSize: 16, fontWeight: 500 }}>{customer.name}</p>
                  {customer.email && <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{customer.email}</div>}
                  {customer.phone && <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{customer.phone}</div>}
                </div>
                <div>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>Booking</p>
                  <p style={{ fontSize: 16, fontWeight: 500 }}>{caseData.request?.quantity} × {caseData.request?.seatClass}</p>
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{show.cinema} • {show.screen}</div>
                  {caseData.request?.promoCode && (
                    <div style={{ fontSize: 13, color: 'var(--color-primary)' }}>Promo: {caseData.request.promoCode}</div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 16, flex: 1, minWidth: 200 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>Status</p>
                  <span className={`badge ${getStatusBadgeClass(caseData.status)}`}>{caseData.statusLabel}</span>
                  <div style={{ marginTop: 8 }}>
                    <span className={`badge ${getUrgencyBadgeClass(caseData.urgency)}`}>Urgency: {caseData.urgency}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>Stage: {caseData.stage}</p>
                </div>

                <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 16, flex: 1, minWidth: 200 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>Assignment</p>
                  {caseData.assignment ? (
                    <>
                      <p style={{ fontWeight: 500 }}>{caseData.assignment.name}</p>
                      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{caseData.assignment.workbasket}</p>
                      {caseData.assignment.slaState && (
                        <span className={`badge ${caseData.assignment.slaState === 'ON_TRACK' ? 'badge-resolved' : 'badge-rejected'}`} style={{ marginTop: 4 }}>
                          {caseData.assignment.slaState}
                        </span>
                      )}
                      {caseData.assignment.deadlineAt && (
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                          Due: {formatDateTime(caseData.assignment.deadlineAt)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p style={{ color: 'var(--color-text-muted)' }}>No active assignment</p>
                  )}
                </div>

                <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 16, flex: 1, minWidth: 200 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>Total</p>
                  <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-primary)' }}>
                    {caseData.totalCost != null ? formatCurrency(caseData.totalCost) : '—'}
                  </p>
                  {caseData.ticketCode && (
                    <div style={{ marginTop: 8, fontSize: 14, fontFamily: 'monospace', letterSpacing: 1 }}>
                      🎫 {caseData.ticketCode}
                    </div>
                  )}
                  {caseData.holdExpiresAt && !caseData.resolved && (
                    <p style={{ fontSize: 12, color: 'var(--color-warning)', marginTop: 8 }}>
                      Hold expires: {formatDateTime(caseData.holdExpiresAt)}
                    </p>
                  )}
                </div>
              </div>

              {cost?.lines && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>Cost Breakdown</p>
                  <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                    {cost.lines.map((line, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                        <span>{line.label}{line.detail ? <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}> ({line.detail})</span> : null}</span>
                        <span style={{ fontWeight: 600, color: line.amount < 0 ? 'var(--color-success)' : 'inherit' }}>
                          {formatCurrency(line.amount)}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--color-border)', fontWeight: 700 }}>
                      <span>Total</span>
                      <span>{formatCurrency(cost.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {caseData.request?.notes && (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>Notes</p>
                  <p style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 12 }}>{caseData.request.notes}</p>
                </div>
              )}

              {caseData.resolutionReason && (
                <div className="alert alert-warning" style={{ marginTop: 16 }}>
                  <strong>{caseData.resolution}:</strong> {caseData.resolutionReason}
                </div>
              )}
            </div>
          )}

          {activeTab === 'seats' && (
            <div>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: 12 }}>
                {heldSeats.length} held • {bookedSeats.length} booked • {releasedSeats.length} released
              </p>
              {seats.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)' }}>No seats assigned yet.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {seats.map((s, i) => (
                    <div
                      key={i}
                      className={`seat ${s.state === 'HELD' ? 'seat-held' : s.state === 'BOOKED' ? 'seat-booked' : 'seat-available'}`}
                      style={{ width: 44, height: 44 }}
                      title={`${s.label} — ${s.state}`}
                    >
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
              <div className="seat-legend" style={{ marginTop: 16 }}>
                <span className="seat-legend-item"><span className="seat-legend-box seat-held" style={{ background: '#fef3c7', borderColor: '#f59e0b' }}></span>Held</span>
                <span className="seat-legend-item"><span className="seat-legend-box seat-booked" style={{ background: '#fecaca', borderColor: '#ef4444' }}></span>Booked</span>
                <span className="seat-legend-item"><span className="seat-legend-box seat-available" style={{ background: 'var(--color-border)' }}></span>Released</span>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div>
              {(!caseData.history || caseData.history.length === 0) ? (
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 40 }}>No history available</p>
              ) : (
                <div style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 16 }}>
                  {caseData.history.map((h, idx) => (
                    <div key={idx} style={{ marginBottom: 16, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -23, top: 4, width: 12, height: 12, background: 'var(--color-primary)', borderRadius: '50%' }} />
                      <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                        <p style={{ fontSize: 14, fontWeight: 500 }}>
                          {h.action}
                          {h.from_status && h.to_status && (
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 8 }}>
                              ({h.from_status} → {h.to_status})
                            </span>
                          )}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                          {h.actor} • {formatDateTime(h.created_at)}
                        </p>
                        {h.detail && (
                          <pre style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                            {typeof h.detail === 'string' ? h.detail : JSON.stringify(h.detail)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div>
              {(!caseData.notifications || caseData.notifications.length === 0) ? (
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 40 }}>No notifications sent</p>
              ) : (
                caseData.notifications.map(n => (
                  <div key={n.id} className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${n.channel === 'EMAIL' ? 'var(--color-primary)' : 'var(--color-success)'}` }}>
                    <div className="card-body">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <p style={{ fontWeight: 500 }}>{n.template}</p>
                        <span className={`badge ${n.channel === 'EMAIL' ? 'badge-open' : 'badge-resolved'}`}>{n.channel}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                        To: {n.recipient} • {formatDateTime(n.created_at)}
                      </p>
                      <p style={{ fontWeight: 500, marginBottom: 4 }}>{n.subject}</p>
                      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>{n.body}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {(canConfirm || canReview || canProcess || canReroute || canCancel) && (
        <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {canConfirm && (
            <button onClick={() => handleAction('confirm')} className="btn-success" disabled={acting}>
              {acting ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Confirm Booking'}
            </button>
          )}
          {canReview && (
            <button onClick={() => handleAction('review')} className="btn-primary" disabled={acting}>Review</button>
          )}
          {canProcess && (
            <button onClick={() => handleAction('process')} className="btn-success" disabled={acting}>Process Ticket</button>
          )}
          {canReroute && (
            <button onClick={() => handleAction('reroute')} className="btn-secondary" disabled={acting}>Reroute</button>
          )}
          {canCancel && (
            <button onClick={() => handleAction('cancel')} className="btn-danger" disabled={acting} style={{ marginLeft: 'auto' }}>Cancel</button>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingInline() {
  return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;
}