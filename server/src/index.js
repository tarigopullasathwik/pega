import express from 'express';
import { authRouter, identify, requireUser, requireRole } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { bookingRouter } from './routes/booking.js';
import { worklistRouter } from './routes/worklist.js';

const app = express();
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Identify user from X-User header (demo auth)
app.use(identify);

// Public routes
app.use('/api/auth', authRouter);
app.use('/api', catalogRouter);

// Protected routes
app.use('/api', requireUser, bookingRouter);
app.use('/api', requireUser, worklistRouter);

// Admin routes
app.use('/api/admin', requireUser, requireRole('admin'), catalogRouter);

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const status = err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    code: err.code,
    details: err.details,
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});