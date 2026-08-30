import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../lib/api';

export function MovieList() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMovies();
  }, []);

  const loadMovies = async () => {
    try {
      setLoading(true);
      const data = await api.getMovies();
      setMovies(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingInline />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Movies</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
            Browse now showing and upcoming movies
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {movies.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
          <h3>No movies found</h3>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 8 }}>
            Run <code>npm run seed</code> to populate sample data.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {movies.map(movie => (
            <Link key={movie.id} to={`/movies/${movie.id}/shows`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ transition: 'transform var(--transition), box-shadow var(--transition)', height: '100%' }}>
                <div style={{ position: 'relative', aspectRatio: '2/3', background: 'linear-gradient(135deg, var(--color-primary) 0%, #7c3aed 100%)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', display: 'flex', alignItems: 'flex-end', padding: 16, color: 'white' }}>
                  <div>
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', marginBottom: 8 }}>
                      {movie.certification}
                    </span>
                    <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{movie.title}</h3>
                    <p style={{ fontSize: 13, opacity: 0.9 }}>{movie.language} • {movie.genre} • {movie.durationMin} min</p>
                  </div>
                </div>
                <div className="card-body">
                  <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {movie.synopsis || 'No description available.'}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      {movie.showCount} show{movie.showCount !== 1 ? 's' : ''} available
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 500 }}>
                      View Shows →
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingInline() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="card" style={{ height: 380 }}>
          <div style={{ aspectRatio: '2/3', background: 'var(--color-border)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div className="card-body">
            <div style={{ height: 20, background: 'var(--color-border)', borderRadius: 'var(--radius-sm)', marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ height: 14, background: 'var(--color-border)', borderRadius: 'var(--radius-sm)', marginBottom: 8, width: '60%', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ height: 14, background: 'var(--color-border)', borderRadius: 'var(--radius-sm)', marginBottom: 16, width: '40%', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ height: 14, background: 'var(--color-border)', borderRadius: 'var(--radius-sm)', marginBottom: 8, width: '80%', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ height: 14, background: 'var(--color-border)', borderRadius: 'var(--radius-sm)', width: '50%', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      ))}
    </div>
  );
}