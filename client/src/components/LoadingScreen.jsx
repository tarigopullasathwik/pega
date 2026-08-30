import React from 'react';

export function LoadingScreen() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--color-bg)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px', width: 40, height: 40, borderWidth: 3 }} />
        <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
      </div>
    </div>
  );
}

export function LoadingInline() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div className="spinner" />
    </div>
  );
}