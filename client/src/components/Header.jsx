import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { api } from '../lib/api';

export function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getNavLinks = () => {
    switch (user?.role) {
      case 'customer':
        return [
          { path: '/movies', label: 'Movies' },
          { path: '/my-bookings', label: 'My Bookings' },
        ];
      case 'staff':
        return [
          { path: '/staff', label: 'Worklist' },
        ];
      case 'admin':
        return [
          { path: '/admin', label: 'Admin Dashboard' },
          { path: '/staff', label: 'Worklist' },
          { path: '/movies', label: 'Movies' },
        ];
      default:
        return [];
    }
  };

  const navLinks = getNavLinks();

  return (
    <header style={{
      background: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      padding: '12px 24px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ fontWeight: 700, fontSize: 20, color: 'var(--color-primary)', textDecoration: 'none' }}>
          🎬 Movie Ticket Booking
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {navLinks.map(link => (
            <Link
              key={link.path}
              to={link.path}
              style={{
                color: location.pathname === link.path ? 'var(--color-primary)' : 'var(--color-text)',
                fontWeight: location.pathname === link.path ? 600 : 500,
                textDecoration: 'none',
                fontSize: 14,
              }}
            >
              {link.label}
            </Link>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingLeft: 16, borderLeft: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {user?.name} ({user?.role})
            </span>
            <button onClick={handleLogout} className="btn-secondary btn-sm">
              Logout
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}