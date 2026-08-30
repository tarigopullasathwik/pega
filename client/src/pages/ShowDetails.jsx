import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, formatDateTime, formatCurrency, getStatusBadgeClass } from '../lib/api';

export function ShowDetails() {
  const { movieId, showId } = useParams();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadShow();
    loadAvailability();
  }, [showId]);

  const loadShow = async () => {
    try {
      const shows = await api.getShows({ movieId: Number(movieId) });
      const found = shows.find(s => s.id === Number(showId));
      if (found) setShow(found);
      else setError('Show not found');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async () => {
    try {
      const data = await api.getShowAvailability(Number(showId));
      setAvailability(data);
    } catch (err) {
      console.error('Failed to load availability:', err);
    }
  };

  const handleBook = () => {
    navigate(`/booking/${showId}`);
  };

  if (loading && !show) return <LoadingInline />;

  if (error || !show) return (
    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
      <h3>Show not found</h3>
      <p style={{ color: 'var(--color-text-muted)', marginTop: 8 }}>{error}</p>
      <Link to="/movies" className="btn-primary" style={{ marginTop: 16, display: 'inline-block' }}>
        Back to Movies
      </Link>
    </div>
  );

  const groupedByClass = availability?.byClass || {};
  const seatClasses = ['SILVER', 'GOLD', 'PLATINUM', 'RECLINER'].filter(c => groupedByClass[c]?.available > 0);

  return (
    <div>
      <Link to="/movies" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', marginBottom: 24, fontSize: 14 }}>
        ← Back to Movies
      </Link>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--color-primary) 0%, #7c3aed 100%)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          padding: 24,
          color: 'white'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                  {show.certification}
                </span>
                <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                  {show.showType}
                </span>
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{show.title}</h1>
              <p style={{ fontSize: 14, opacity: 0.9 }}>{show.language} • {show.genre} • {show.durationMin} min</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>Show Time</p>
              <p style={{ fontSize: 24, fontWeight: 600 }}>{formatDateTime(show.startsAt)}</p>
            </div>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Cinema</p>
              <p style={{ fontWeight: 500 }}>{show.cinema}</p>
            </div>
            <div>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Screen</p>
              <p style={{ fontWeight: 500 }}>{show.screen}</p>
            </div>
            <div>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>City</p>
              <p style={{ fontWeight: 500 }}>{show.city}</p>
            </div>
            <div>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Base Price</p>
              <p style={{ fontWeight: 600, fontSize: 18 }}>{formatCurrency(show.basePrice)}</p>
            </div>
          </div>
        </div>
      </div>

      {availability && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            Seat Availability
            <span style={{ fontWeight: 400, fontSize: 14, color: 'var(--color-text-muted)', marginLeft: 12 }}>
              {availability.totalSeats} total • {availability.availableSeats} available
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              {seatClasses.map(cls => {
                const data = groupedByClass[cls];
                const colorMap = {
                  SILVER: '#94a3b8',
                  GOLD: '#f59e0b',
                  PLATINUM: '#a855f7',
                  RECLINER: '#ec4899',
                };
                return (
                  <div key={cls} style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 16,
                    textAlign: 'center',
                    borderLeft: `4px solid ${colorMap[cls]}`
                  }}>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      {cls} Class
                    </p>
                    <p style={{ fontSize: 28, fontWeight: 700, color: colorMap[cls] }}>{data.available}</p>
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {data.available} of {data.total} available
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>
                      from {formatCurrency(data.priceFrom)}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Seat map preview */}
            {availability.seatMap && (
              <div>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                  Seat Map Preview (click to book)
                </p>
                <div className="seat-map">
                  {availability.seatMap.map((row, rowIdx) => (
                    <div key={rowIdx} className="seat-row">
                      <span className="seat-label">{row.row}</span>
                      {row.seats.map((seat, seatIdx) => (
                        <div
                          key={seatIdx}
                          className={`seat ${seat.state === 'AVAILABLE' ? 'seat-available' : seat.state === 'HELD' ? 'seat-held' : 'seat-booked'}`}
                          style={{ opacity: seat.state === 'AVAILABLE' ? 1 : 0.6 }}
                        >
                          {seat.no}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="seat-legend">
                  <span className="seat-legend-item"><span className="seat-legend-box seat-available" style={{ background: 'var(--color-border)' }}></span>Available</span>
                  <span className="seat-legend-item"><span className="seat-legend-box seat-held" style={{ background: '#fef3c7', borderColor: '#f59e0b' }}></span>Held</span>
                  <span className="seat-legend-item"><span className="seat-legend-box seat-booked" style={{ background: '#fecaca', borderColor: '#ef4444' }}></span>Booked</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Link to="/movies" className="btn-secondary">Back to Movies</Link>
        <button onClick={handleBook} className="btn-primary" disabled={!availability?.availableSeats || loading}>
          {loading ? <span className="spinner" style={{width: 16, height: 16, borderWidth: 2}} /> : 'Book Tickets'}
        </button>
      </div>
    </div>
  );
}

function LoadingInline() {
  return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;
}