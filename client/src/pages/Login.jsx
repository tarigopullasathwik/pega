import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { api } from '../lib/api';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userData = await api.login(username);
      login(userData);
      navigate(getDefaultRoute(userData.role));
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (u) => {
    setUsername(u);
    setError('');
    setLoading(true);
    try {
      const userData = await api.login(u);
      login(userData);
      navigate(getDefaultRoute(userData.role));
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const getDefaultRoute = (role) => {
    switch (role) {
      case 'customer': return '/movies';
      case 'staff': return '/staff';
      case 'admin': return '/admin';
      default: return '/movies';
    }
  };

  // Load user list for quick login
  React.useEffect(() => {
    api.getUsers().then(setUsers).catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--color-bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-header" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>Movie Ticket Booking</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Sign in to continue</p>
        </div>
        <div className="card-body">
          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                autoFocus
                disabled={loading}
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? <span className="spinner" style={{width: 16, height: 16, borderWidth: 2, margin: '0 auto'}} /> : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 12 }}>
              Quick sign in (demo):
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {users.map(u => (
                <button
                  key={u.username}
                  type="button"
                  onClick={() => handleQuickLogin(u.username)}
                  className="btn-secondary btn-sm"
                  disabled={loading}
                  style={{ flex: 1, minWidth: 80 }}
                >
                  {u.name} ({u.role})
                </button>
              ))}
            </div>
            {users.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                No users found. Run <code>npm run seed</code> first.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}