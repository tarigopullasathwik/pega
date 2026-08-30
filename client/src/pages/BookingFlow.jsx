import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, formatCurrency, formatDateTime } from '../lib/api';

export function BookingFlow() {
  const { showId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: select seats, 2: confirm, 3: success
  const [show, setShow] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [seatClass, setSeatClass] = useState('SILVER');
  const [promoCode, setPromoCode] = useState('');
  const [notes, setNotes] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [cost, setCost] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    loadShow();
    loadAvailability();
  }, [showId]);

  const loadShow = async () => {
    try {
      const shows = await api.getShows();
      const found = shows.find(s => s.id === Number(showId));
      if (found) setShow(found);
    } catch (err) {
      console.error('Failed to load show:', err);
    }
  };

  const loadAvailability = async () => {
    try {
      const data = await api.getShowAvailability(Number(showId));
      setAvailability(data);
      // Default to first available class
      const classes = ['SILVER', 'GOLD', 'PLATINUM', 'RECLINER'];
      const firstAvail = classes.find(c => data.byClass[c]?.available > 0);
      if (firstAvail) setSeatClass(firstAvail);
    } catch (err) {
      console.error('Failed to load availability:', err);
    }
  };

  const calculateCost = async () => {
    if (!selectedSeats.length) return;
    try {
      const result = await api.calculateCost(Number(showId), seatClass, selectedSeats.length, promoCode || null);
      setCost(result);
    } catch (err) {
      console.error('Failed to calculate cost:', err);
    }
  };

  useEffect(() => {
    calculateCost();
  }, [selectedSeats.length, seatClass, promoCode]);

  const handleSeatClick = (seat) => {
    if (seat.state !== 'AVAILABLE') return;
    if (selectedSeats.length >= 10) return;
    
    const seatId = `${seat.row}-${seat.no}`;
    if (selectedSeats.some(s => s.row === seat.row && s.no === seat.no)) {
      setSelectedSeats(selectedSeats.filter(s => !(s.row === seat.row && s.no === seat.no)));
    } else {
      setSelectedSeats([...selectedSeats, seat]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedSeats.length) {
      setError('Please select at least one seat');
      return;
    }
    if (!contactEmail) {
      setError('Contact email is required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await api.submitBooking({
        showId: Number(showId),
        seatClass,
        quantity: selectedSeats.length,
        promoCode: promoCode || null,
        notes: notes || null,
        seatIds: null, // We don't have seat IDs from the map, let backend assign
        contactEmail,
        contactPhone: contactPhone || null,
      });
      setBooking(result);
      setStep(3);
    } catch (err) {
      setError(err.message || 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!booking) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.confirmBooking(booking.caseId);
      setBooking(result);
    } catch (err) {
      setError(err.message || 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!show) return <LoadingInline />;

  // Step 1: Seat Selection
  if (step === 1) {
    const groupedByClass = availability?.byClass || {};
    const seatClasses = ['SILVER', 'GOLD', 'PLATINUM', 'RECLINER'].filter(c => groupedByClass[c]?.available > 0);
    const classData = groupedByClass[seatClass];

    return (
      <div>
        <Link to="/movies" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', marginBottom: 24, fontSize: 14 }}>
          ← Back to Movies
        </Link>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24 }}>
          <div>
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{
                background: 'linear-gradient(135deg, var(--color-primary) 0%, #7c3aed 100%)',
                borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                padding: 20,
                color: 'white'
              }}>
                <h2 style={{ fontSize: 22, fontWeight: 700 }}>{show.title}</h2>
                <p style={{ opacity: 0.9, marginTop: 4 }}>{formatDateTime(show.startsAt)} • {show.cinema} • {show.screen} • {show.showType}</p>
              </div>
              <div className="card-body">
                <h3 style={{ marginBottom: 16 }}>Select Seats ({selectedSeats.length} selected)</h3>
                
                {/* Seat class selector */}
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>Seat Class</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {seatClasses.map(cls => {
                      const data = groupedByClass[cls];
                      const colorMap = { SILVER: '#94a3b8', GOLD: '#f59e0b', PLATINUM: '#a855f7', RECLINER: '#ec4899' };
                      return (
                        <button
                          key={cls}
                          onClick={() => { setSeatClass(cls); setSelectedSeats([]); }}
                          className={seatClass === cls ? 'btn-primary' : 'btn-secondary'}
                          style={{ padding: '10px 16px', borderLeft: `4px solid ${colorMap[cls]}` }}
                          disabled={data.available === 0}
                        >
                          <div style={{ fontWeight: 600 }}>{cls}</div>
                          <div style={{ fontSize: 11, opacity: 0.8 }}>{data.available} available • from {formatCurrency(data.priceFrom)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Seat map */}
                {availability?.seatMap && availability.seatMap.filter(r => r.seats.some(s => s.class === seatClass)).map((row, rowIdx) => (
                  <div key={rowIdx} className="seat-row">
                    <span className="seat-label">{row.row}</span>
                    {row.seats
                      .filter(s => s.class === seatClass)
                      .map((seat, seatIdx) => (
                        <div
                          key={seatIdx}
                          className={`seat ${seat.state === 'AVAILABLE' ? 'seat-available' : seat.state === 'HELD' ? 'seat-held' : 'seat-booked'} ${selectedSeats.some(ss => ss.row === seat.row && ss.no === seat.no) ? 'seat-selected' : ''}`}
                          onClick={() => handleSeatClick(seat)}
                          style={{ opacity: seat.state === 'AVAILABLE' ? 1 : 0.5 }}
                        >
                          {seat.no}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="seat-legend" style={{ marginTop: 12 }}>
              <span className="seat-legend-item"><span className="seat-legend-box seat-available" style={{ background: 'var(--color-border)' }}></span>Available</span>
              <span className="seat-legend-item"><span className="seat-legend-box seat-selected" style={{ background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}></span>Selected</span>
              <span className="seat-legend-item"><span className="seat-legend-box seat-held" style={{ background: '#fef3c7', borderColor: '#f59e0b' }}></span>Held</span>
              <span className="seat-legend-item"><span className="seat-legend-box seat-booked" style={{ background: '#fecaca', borderColor: '#ef4444' }}></span>Booked</span>
            </div>
          </div>

          {/* Booking Summary */}
          <div className="card" style={{ height: 'fit-content', position: 'sticky', top: 100 }}>
            <div className="card-header">Booking Summary</div>
            <div className="card-body">
              {error && <div className="alert alert-error">{error}</div>}

              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>Selected Seats</p>
                {selectedSeats.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No seats selected</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selectedSeats.map((s, i) => (
                      <span key={i} className="badge badge-new" style={{ fontSize: 11 }}>{s.row}{s.no}</span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>{selectedSeats.length} × {seatClass} @ {formatCurrency(classData?.priceFrom || 0)}</span>
                  <span>{formatCurrency((classData?.priceFrom || 0) * selectedSeats.length)}</span>
                </div>
                {cost && cost.promoApplied && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: 'var(--color-success)' }}>
                    <span>Promo: {cost.promoCode}</span>
                    <span>-{formatCurrency(cost.promoDiscount)}</span>
                  </div>
                )}
                {cost && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>Convenience Fee</span>
                      <span>{formatCurrency(cost.convenienceFee)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>GST ({Math.round((cost.taxRate || 0) * 100)}%)</span>
                      <span>{formatCurrency(cost.tax)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 16, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                      <span>Total</span>
                      <span>{formatCurrency(cost.total)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="promoCode">Promo Code</label>
                <input
                  id="promoCode"
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="e.g., FIRSTSHOW, FAMILY4"
                />
              </div>

              <div className="form-group">
                <label htmlFor="contactEmail">Contact Email *</label>
                <input
                  id="contactEmail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="contactPhone">Contact Phone</label>
                <input
                  id="contactPhone"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91-XXXXXXXXXX"
                />
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notes (optional)</label>
                <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any special requests..." />
              </div>

              <button
                onClick={handleSubmit}
                className="btn-primary"
                style={{ width: '100%' }}
                disabled={!selectedSeats.length || loading || !contactEmail}
              >
                {loading ? <span className="spinner" style={{width: 16, height: 16, borderWidth: 2, margin: '0 auto'}} /> : `Continue to Payment — ${cost ? formatCurrency(cost.total) : 'Select seats'}`}
              </button>

              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 12 }}>
                Seats will be held for 20 minutes. Complete payment to confirm.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Success
  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Booking Submitted!</h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 24 }}>
          Your seats have been held. Please confirm to complete the booking.
        </p>

        <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 20, marginBottom: 24, textAlign: 'left' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>Case ID</p>
          <p style={{ fontSize: 18, fontWeight: 600, fontFamily: 'monospace' }}>{booking.caseId}</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 12, marginBottom: 4 }}>Ticket Code</p>
          <p style={{ fontSize: 18, fontWeight: 600, fontFamily: 'monospace' }}>{booking.ticketCode}</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 12, marginBottom: 4 }}>Total</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary)' }}>{formatCurrency(booking.totalCost)}</p>
          <p style={{ fontSize: 13, color: 'var(--color-warning)', marginTop: 12 }}>
            ⏳ Expires: {formatDateTime(booking.holdExpiresAt)}
          </p>
        </div>

        <button onClick={handleConfirm} className="btn-success" style={{ width: '100%', marginBottom: 12 }} disabled={loading}>
          {loading ? <span className="spinner" style={{width: 16, height: 16, borderWidth: 2, margin: '0 auto'}} /> : 'Confirm & Pay Now'}
        </button>

        <Link to="/my-bookings" className="btn-secondary" style={{ width: '100%', display: 'block', textAlign: 'center' }}>
          View My Bookings
        </Link>
      </div>
    </div>
  );
}

function LoadingInline() {
  return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;
}