import { Router } from 'express';
import { db } from '../db.js';
import { notFound } from '../util.js';

/** Lightweight identity: pick a seeded user, no password. Demo-only. */
export const authRouter = Router();

authRouter.get('/users', (req, res) => {
  const users = db
    .prepare('SELECT id, username, display_name, role, email, phone, workbasket FROM users ORDER BY role, username')
    .all();
  res.json(users.map(shape));
});

authRouter.post('/login', (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const user = db
      .prepare('SELECT id, username, display_name, role, email, phone, workbasket FROM users WHERE username = ?')
      .get(username);
    if (!user) throw notFound(`No user named '${username}'. Try asha, sanjay or maya.`);
    res.json(shape(user));
  } catch (err) {
    next(err);
  }
});

function shape(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.display_name,
    role: u.role,
    email: u.email,
    phone: u.phone,
    workbasket: u.workbasket,
  };
}

/**
 * Reads the acting user from the X-User header on every request.
 * Real deployments must replace this with authenticated sessions or tokens;
 * this trusts a client-supplied header and is only safe for local demos.
 */
export function identify(req, res, next) {
  const username = req.header('X-User');
  if (username) {
    const user = db
      .prepare('SELECT id, username, display_name, role, email, phone, workbasket FROM users WHERE username = ?')
      .get(String(username).trim().toLowerCase());
    if (user) req.user = shape(user);
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Sign in required. Send an X-User header.' });
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}
