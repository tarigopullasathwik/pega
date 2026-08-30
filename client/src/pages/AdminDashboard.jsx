import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App';
import { api, formatCurrency, formatDateTime, getStatusBadgeClass, getUrgencyBadgeClass } from '../lib/api';

export function AdminDashboard() {
  const [tabs, setTabs] = useState('overview');
  const [cases, setCases] = useState([]);
  const [slas, setSlas] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [pricing, setPricing] = useState({ config: [], promos: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [tabs]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (tabs === 'overview') {
        const data = await api.getAllWorklist({ limit: 200 });
        setCases(data);
      } else if (tabs === 'sla') {
        setSlas(await api.getSlaDefinitions());
      } else if (tabs === 'routing') {
        setRoutes(await api.getRoutingRules());
      } else if (tabs === 'pricing') {
        setPricing(await api.getPricingConfigAdmin());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingInline />;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Admin Dashboard</h1>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Tab Navigation */}
      <div className="card" style={{ marginBottom: 24, padding: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
          {[
            { id: 'overview', label: '📊 All Cases' },
            { id: 'sla', label: '⏱️ SLA Definitions' },
            { id: 'routing', label: '🔀 Routing Rules' },
            { id: 'pricing', label: '💰 Pricing Config' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setTabs(tab.id)}
              style={{
                padding: '16px 24px',
                background: tabs === tab.id ? 'var(--color-primary)' : 'transparent',
                color: tabs === tab.id ? 'white' : 'var(--color-text)',
                border: 'none',
                borderBottom: tabs === tab.id ? '3px solid var(--color-primary)' : '3px solid transparent',
                fontWeight: 500,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all var(--transition)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {tabs === 'overview' && (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Customer</th>
                  <th>Movie</th>
                  <th>Show Time</th>
                  <th>Workbasket</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Urgency</th>
                  <th>SLA State</th>
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
                    <td>{c.assignment?.workbasket || '—'}</td>
                    <td><span className={`badge ${getStatusBadgeClass(c.status)}`}>{c.statusLabel}</span></td>
                    <td style={{ fontWeight: 600 }}>{c.totalCost ? formatCurrency(c.totalCost) : '—'}</td>
                    <td><span className={`badge ${getUrgencyBadgeClass(c.urgency)}`}>{c.urgency}</span></td>
                    <td>
                      {c.assignment?.slaState && (
                        <span className={`badge ${c.assignment.slaState === 'ON_TRACK' ? 'badge-resolved' : c.assignment.slaState.includes('MISSED') ? 'badge-rejected' : 'badge-open'}`}>
                          {c.assignment.slaState}
                        </span>
                      )}
                    </td>
                    <td>
                      <Link to={`/booking/${c.caseId}`} className="btn-secondary btn-sm">View</Link>
                      {c.assignment && (
                        <button className="btn-primary btn-sm" onClick={() => rerouteCase(c.caseId)}>
                          Reroute
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SLA Tab */}
      {tabs === 'sla' && (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Assignment</th>
                  <th>Show Type</th>
                  <th>Goal (min)</th>
                  <th>Deadline (min)</th>
                  <th>Goal Urgency</th>
                  <th>Deadline Urgency</th>
                  <th>Escalate To</th>
                </tr>
              </thead>
              <tbody>
                {slas.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td>{s.assignment}</td>
                    <td>{s.show_type}</td>
                    <td>{s.goal_minutes}</td>
                    <td>{s.deadline_minutes}</td>
                    <td>{s.goal_urgency}</td>
                    <td>{s.deadline_urgency}</td>
                    <td>{s.escalate_to || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Routing Tab */}
      {tabs === 'routing' && (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Description</th>
                  <th>Show Type</th>
                  <th>Min Total</th>
                  <th>Max Total</th>
                  <th>Min Quantity</th>
                  <th>Workbasket</th>
                </tr>
              </thead>
              <tbody>
                {routes.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.priority}</td>
                    <td>{r.description}</td>
                    <td>{r.show_type}</td>
                    <td>{r.min_total || '—'}</td>
                    <td>{r.max_total || '—'}</td>
                    <td>{r.min_quantity || '—'}</td>
                    <td>{r.workbasket}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pricing Tab */}
      {tabs === 'pricing' && (
        <div>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">Pricing Config</div>
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>Key</th><th>Value</th><th>Description</th></tr>
                </thead>
                <tbody>
                  {pricing.config.map(p => (
                    <tr key={p.key}>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{p.key}</td>
                      <td>{p.value}</td>
                      <td style={{ color: 'var(--color-text-muted)' }}>{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">Promo Codes</div>
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>Code</th><th>Description</th><th>Kind</th><th>Amount</th><th>Max Discount</th><th>Min Qty</th></tr>
                </thead>
                <tbody>
                  {pricing.promos.map(p => (
                    <tr key={p.code}>
                      <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.code}</td>
                      <td>{p.description}</td>
                      <td>{p.kind}</td>
                      <td>{p.amount}</td>
                      <td>{p.max_discount || '—'}</td>
                      <td>{p.min_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function rerouteCase(caseId) {
  if (!confirm('Reroute this case to its default workbasket based on current rules?')) return;
  try {
    await api.rerouteCase(caseId);
    window.location.reload();
  } catch (err) {
    alert(err.message);
  }
}

function LoadingInline() {
  return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;
}