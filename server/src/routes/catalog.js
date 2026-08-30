import { Router } from 'express';
import { db, tx } from '../db.js';
import { SHOW_TYPES } from '../lifecycle.js';
import { badRequest, notFound, conflict, audit } from '../util.js';
import { showAvailability, checkRequest, releaseExpiredHolds } from '../engine/availability.js';
import { calculateCost, pricingConfigRows } from '../engine/pricing.js';
import { requireRole } from './auth.js';

/**
 * Capability 02 (Check Show Availability), 03 (Calculate Booking Cost) and
 * 05 (Maintain Movie and Show Data).
 */
export const catalogRouter = Router();

// ---- Read: movies, shows, availability ----------------------------------

catalogRouter.get('/movies', (req, res) => {
  const includeInactive = req.query.all === 'true';
  const movies = db
    .prepare(
      `SELECT m.*, (SELECT COUNT(*) FROM shows s WHERE s.movie_id = m.id) AS show_count
         FROM movies m
        ${includeInactive ? '' : 'WHERE m.active = 1'}
        ORDER BY m.title`
    )
    .all();
  res.json(movies.map(shapeMovie));
});

catalogRouter.get('/cinemas', (req, res) => {
  const cinemas = db.prepare('SELECT * FROM cinemas ORDER BY name').all();
  const screens = db
    .prepare(
      `SELECT sc.*, (SELECT COUNT(*) FROM seats st WHERE st.screen_id = sc.id) AS seat_count
         FROM screens sc ORDER BY sc.name`
    )
    .all();
  res.json(
    cinemas.map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      screens: screens
        .filter((s) => s.cinema_id === c.id)
        .map((s) => ({ id: s.id, name: s.name, showType: s.show_type, seatCount: Number(s.seat_count) })),
    }))
  );
});

catalogRouter.get('/shows', (req, res, next) => {
  try {
    releaseExpiredHolds();
    const { movieId, showType, date, city } = req.query;
    const where = [`s.status = 'SCHEDULED'`, `datetime(s.starts_at) > datetime('now')`];
    const params = [];
    if (movieId) { where.push('s.movie_id = ?'); params.push(Number(movieId)); }
    if (showType) { where.push('s.show_type = ?'); params.push(String(showType)); }
    if (date) { where.push('date(s.starts_at) = ?'); params.push(String(date)); }
    if (city) { where.push('c.city = ?'); params.push(String(city)); }

    const rows = db
      .prepare(
        `SELECT s.*, m.title, m.language, m.certification, m.duration_min,
                sc.name AS screen_name, c.name AS cinema_name, c.city,
                (SELECT COUNT(*) FROM seats st WHERE st.screen_id = s.screen_id) AS total_seats,
                (SELECT COUNT(*) FROM booking_seats bs
                  WHERE bs.show_id = s.id AND bs.state IN ('HELD','BOOKED')) AS taken_seats
           FROM shows s
           JOIN movies m   ON m.id = s.movie_id
           JOIN screens sc ON sc.id = s.screen_id
           JOIN cinemas c  ON c.id = sc.cinema_id
          WHERE ${where.join(' AND ')}
          ORDER BY s.starts_at`
      )
      .all(...params);

    res.json(rows.map(shapeShow));
  } catch (err) {
    next(err);
  }
});

/** Capability 02: full availability and seat map for one show. */
catalogRouter.get('/shows/:id/availability', (req, res, next) => {
  try {
    res.json(showAvailability(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
});

/** Capability 02: can this specific request be satisfied? */
catalogRouter.post('/availability/check', (req, res, next) => {
  try {
    const { showId, seatClass, quantity } = req.body || {};
    if (!showId || !seatClass || !quantity) {
      throw badRequest('showId, seatClass and quantity are required');
    }
    const result = checkRequest({
      showId: Number(showId),
      seatClass: String(seatClass),
      quantity: Number(quantity),
    });
    res.json({
      ok: result.ok,
      reason: result.reason,
      availableInClass: result.availableInClass ?? null,
      suggestions: result.suggestions ?? [],
      show: result.availability.show,
      byClass: result.availability.byClass,
    });
  } catch (err) {
    next(err);
  }
});

/** Capability 03: price a request without creating a case. */
catalogRouter.post('/cost/calculate', (req, res, next) => {
  try {
    const { showId, seatClass, quantity, promoCode } = req.body || {};
    if (!showId || !seatClass || !quantity) {
      throw badRequest('showId, seatClass and quantity are required');
    }
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(Number(showId));
    if (!show) throw notFound(`Show ${showId} not found`);
    res.json(
      calculateCost({
        show,
        seatClass: String(seatClass),
        quantity: Number(quantity),
        promoCode: promoCode || null,
      })
    );
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/pricing-config', (req, res) => {
  res.json({
    config: pricingConfigRows(),
    promos: db.prepare('SELECT * FROM promo_codes ORDER BY code').all(),
  });
});

// ---- Capability 05: Maintain Movie and Show Data -------------------------

const movieFields = ['title', 'language', 'genre', 'certification', 'duration_min', 'release_date', 'synopsis', 'active'];

catalogRouter.post('/movies', requireRole('admin'), (req, res, next) => {
  try {
    const m = validateMovie(req.body, true);
    const info = db
      .prepare(
        `INSERT INTO movies (title, language, genre, certification, duration_min, release_date, synopsis, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(m.title, m.language, m.genre, m.certification, m.duration_min, m.release_date, m.synopsis, m.active);
    audit({ bookingId: null, actor: req.user.username, action: 'MovieCreated', detail: m });
    res.status(201).json(shapeMovie(db.prepare('SELECT *, 0 AS show_count FROM movies WHERE id = ?').get(Number(info.lastInsertRowid))));
  } catch (err) {
    next(err);
  }
});

catalogRouter.put('/movies/:id', requireRole('admin'), (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM movies WHERE id = ?').get(Number(req.params.id));
    if (!existing) throw notFound(`Movie ${req.params.id} not found`);
    const m = validateMovie({ ...shapeMovieInput(existing), ...req.body }, false);
    db.prepare(
      `UPDATE movies
          SET title = ?, language = ?, genre = ?, certification = ?, duration_min = ?,
              release_date = ?, synopsis = ?, active = ?, updated_at = datetime('now')
        WHERE id = ?`
    ).run(m.title, m.language, m.genre, m.certification, m.duration_min, m.release_date, m.synopsis, m.active, existing.id);
    audit({ bookingId: null, actor: req.user.username, action: 'MovieUpdated', detail: { id: existing.id, ...m } });
    res.json(shapeMovie(db.prepare(
      `SELECT m.*, (SELECT COUNT(*) FROM shows s WHERE s.movie_id = m.id) AS show_count
         FROM movies m WHERE m.id = ?`
    ).get(existing.id)));
  } catch (err) {
    next(err);
  }
});

catalogRouter.delete('/movies/:id', requireRole('admin'), (req, res, next) => {
  try {
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(Number(req.params.id));
    if (!movie) throw notFound(`Movie ${req.params.id} not found`);
    const active = db
      .prepare(
        `SELECT COUNT(*) AS n FROM bookings b JOIN shows s ON s.id = b.show_id
          WHERE s.movie_id = ? AND b.status NOT LIKE 'Resolved-%'`
      )
      .get(movie.id).n;
    if (Number(active) > 0) {
      throw conflict(`Cannot retire '${movie.title}': ${active} booking(s) still in progress`);
    }
    // Retire rather than delete so historical bookings keep their references.
    db.prepare(`UPDATE movies SET active = 0, updated_at = datetime('now') WHERE id = ?`).run(movie.id);
    db.prepare(
      `UPDATE shows SET status = 'CANCELLED', updated_at = datetime('now')
        WHERE movie_id = ? AND status = 'SCHEDULED'`
    ).run(movie.id);
    audit({ bookingId: null, actor: req.user.username, action: 'MovieRetired', detail: { id: movie.id, title: movie.title } });
    res.json({ retired: true, id: movie.id, title: movie.title });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/admin/shows', requireRole('admin'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, m.title, m.language, m.certification, m.duration_min,
              sc.name AS screen_name, c.name AS cinema_name, c.city,
              (SELECT COUNT(*) FROM seats st WHERE st.screen_id = s.screen_id) AS total_seats,
              (SELECT COUNT(*) FROM booking_seats bs
                WHERE bs.show_id = s.id AND bs.state IN ('HELD','BOOKED')) AS taken_seats
         FROM shows s
         JOIN movies m   ON m.id = s.movie_id
         JOIN screens sc ON sc.id = s.screen_id
         JOIN cinemas c  ON c.id = sc.cinema_id
        ORDER BY s.starts_at DESC`
    )
    .all();
  res.json(rows.map(shapeShow));
});

catalogRouter.post('/shows', requireRole('admin'), (req, res, next) => {
  try {
    const s = validateShow(req.body);
    const screen = db.prepare('SELECT * FROM screens WHERE id = ?').get(s.screen_id);
    if (!screen) throw badRequest(`Screen ${s.screen_id} not found`);
    const movie = db.prepare('SELECT * FROM movies WHERE id = ? AND active = 1').get(s.movie_id);
    if (!movie) throw badRequest(`Movie ${s.movie_id} not found or retired`);

    assertNoOverlap(screen.id, s.starts_at, movie.duration_min, null);

    const info = db
      .prepare(
        `INSERT INTO shows (movie_id, screen_id, show_type, starts_at, base_price, status)
         VALUES (?, ?, ?, ?, ?, 'SCHEDULED')`
      )
      .run(s.movie_id, screen.id, screen.show_type, s.starts_at, s.base_price);
    audit({ bookingId: null, actor: req.user.username, action: 'ShowCreated', detail: { ...s, showType: screen.show_type } });
    res.status(201).json(oneShow(Number(info.lastInsertRowid)));
  } catch (err) {
    next(err);
  }
});

catalogRouter.put('/shows/:id', requireRole('admin'), (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM shows WHERE id = ?').get(Number(req.params.id));
    if (!existing) throw notFound(`Show ${req.params.id} not found`);

    const startsAt = req.body?.startsAt ? normaliseTimestamp(req.body.startsAt) : existing.starts_at;
    const basePrice = req.body?.basePrice != null ? Number(req.body.basePrice) : existing.base_price;
    const status = req.body?.status ?? existing.status;
    if (!['SCHEDULED', 'CANCELLED', 'COMPLETED'].includes(status)) {
      throw badRequest('status must be SCHEDULED, CANCELLED or COMPLETED');
    }
    if (!(basePrice > 0)) throw badRequest('basePrice must be greater than 0');

    const movie = db.prepare('SELECT duration_min FROM movies WHERE id = ?').get(existing.movie_id);
    if (startsAt !== existing.starts_at) {
      assertNoOverlap(existing.screen_id, startsAt, movie.duration_min, existing.id);
    }

    const inFlight = db
      .prepare(`SELECT COUNT(*) AS n FROM bookings WHERE show_id = ? AND status NOT LIKE 'Resolved-%'`)
      .get(existing.id).n;
    if (status === 'CANCELLED' && Number(inFlight) > 0) {
      throw conflict(`Cannot cancel show: ${inFlight} booking(s) still in progress. Cancel those cases first.`);
    }

    db.prepare(
      `UPDATE shows SET starts_at = ?, base_price = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(startsAt, basePrice, status, existing.id);
    audit({
      bookingId: null, actor: req.user.username, action: 'ShowUpdated',
      detail: { id: existing.id, startsAt, basePrice, status },
    });
    res.json(oneShow(existing.id));
  } catch (err) {
    next(err);
  }
});

catalogRouter.delete('/shows/:id', requireRole('admin'), (req, res, next) => {
  try {
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(Number(req.params.id));
    if (!show) throw notFound(`Show ${req.params.id} not found`);
    const anyBooking = db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE show_id = ?').get(show.id).n;
    if (Number(anyBooking) > 0) {
      throw conflict(`Show has ${anyBooking} booking(s); cancel the show instead of deleting it`);
    }
    db.prepare('DELETE FROM shows WHERE id = ?').run(show.id);
    audit({ bookingId: null, actor: req.user.username, action: 'ShowDeleted', detail: { id: show.id } });
    res.json({ deleted: true, id: show.id });
  } catch (err) {
    next(err);
  }
});

// ---- helpers ------------------------------------------------------------

function assertNoOverlap(screenId, startsAt, durationMin, excludeShowId) {
  const clash = db
    .prepare(
      `SELECT s.id, s.starts_at, m.title, m.duration_min
         FROM shows s JOIN movies m ON m.id = s.movie_id
        WHERE s.screen_id = ? AND s.status = 'SCHEDULED'
          AND (? IS NULL OR s.id != ?)`
    )
    .all(screenId, excludeShowId, excludeShowId)
    .find((other) => {
      const otherStart = Date.parse(other.starts_at.replace(' ', 'T') + 'Z');
      const otherEnd = otherStart + (other.duration_min + 20) * 60_000;
      const newStart = Date.parse(startsAt.replace(' ', 'T') + 'Z');
      const newEnd = newStart + (durationMin + 20) * 60_000;
      return newStart < otherEnd && otherStart < newEnd;
    });
  if (clash) {
    throw conflict(
      `Screen is busy: '${clash.title}' starts at ${clash.starts_at} (includes 20 min changeover)`
    );
  }
}

function normaliseTimestamp(value) {
  const raw = String(value).trim();
  const ms = Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
  if (Number.isNaN(ms)) throw badRequest(`Could not parse timestamp '${value}'`);
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function validateShow(body) {
  const movie_id = Number(body?.movieId);
  const screen_id = Number(body?.screenId);
  const base_price = Number(body?.basePrice);
  if (!movie_id || !screen_id) throw badRequest('movieId and screenId are required');
  if (!(base_price > 0)) throw badRequest('basePrice must be greater than 0');
  if (!body?.startsAt) throw badRequest('startsAt is required');
  const starts_at = normaliseTimestamp(body.startsAt);
  if (Date.parse(starts_at.replace(' ', 'T') + 'Z') <= Date.now()) {
    throw badRequest('startsAt must be in the future');
  }
  return { movie_id, screen_id, base_price, starts_at };
}

function validateMovie(body, isNew) {
  const title = String(body?.title ?? '').trim();
  const language = String(body?.language ?? '').trim();
  const genre = String(body?.genre ?? '').trim();
  const certification = String(body?.certification ?? '').trim().toUpperCase();
  const duration_min = Number(body?.durationMin ?? body?.duration_min);

  if (!title) throw badRequest('title is required');
  if (!language) throw badRequest('language is required');
  if (!genre) throw badRequest('genre is required');
  if (!['U', 'UA', 'A'].includes(certification)) throw badRequest('certification must be U, UA or A');
  if (!Number.isInteger(duration_min) || duration_min <= 0 || duration_min > 400) {
    throw badRequest('durationMin must be a whole number of minutes between 1 and 400');
  }
  if (isNew) {
    const dupe = db.prepare('SELECT id FROM movies WHERE lower(title) = ? AND language = ?').get(title.toLowerCase(), language);
    if (dupe) throw conflict(`'${title}' (${language}) already exists`);
  }
  return {
    title, language, genre, certification, duration_min,
    release_date: body?.releaseDate ?? body?.release_date ?? null,
    synopsis: body?.synopsis ?? null,
    active: body?.active === false || body?.active === 0 ? 0 : 1,
  };
}

function shapeMovieInput(m) {
  return {
    title: m.title, language: m.language, genre: m.genre, certification: m.certification,
    durationMin: m.duration_min, releaseDate: m.release_date, synopsis: m.synopsis,
    active: m.active === 1,
  };
}

function shapeMovie(m) {
  return {
    id: m.id,
    title: m.title,
    language: m.language,
    genre: m.genre,
    certification: m.certification,
    durationMin: m.duration_min,
    releaseDate: m.release_date,
    synopsis: m.synopsis,
    active: m.active === 1,
    showCount: Number(m.show_count ?? 0),
    updatedAt: m.updated_at,
  };
}

function shapeShow(s) {
  const total = Number(s.total_seats ?? 0);
  const taken = Number(s.taken_seats ?? 0);
  return {
    id: s.id,
    movieId: s.movie_id,
    title: s.title,
    language: s.language,
    certification: s.certification,
    durationMin: s.duration_min,
    showType: s.show_type,
    startsAt: s.starts_at,
    basePrice: s.base_price,
    status: s.status,
    screenId: s.screen_id,
    screen: s.screen_name,
    cinema: s.cinema_name,
    city: s.city,
    totalSeats: total,
    availableSeats: total - taken,
  };
}

function oneShow(id) {
  return shapeShow(
    db
      .prepare(
        `SELECT s.*, m.title, m.language, m.certification, m.duration_min,
                sc.name AS screen_name, c.name AS cinema_name, c.city,
                (SELECT COUNT(*) FROM seats st WHERE st.screen_id = s.screen_id) AS total_seats,
                (SELECT COUNT(*) FROM booking_seats bs
                  WHERE bs.show_id = s.id AND bs.state IN ('HELD','BOOKED')) AS taken_seats
           FROM shows s
           JOIN movies m   ON m.id = s.movie_id
           JOIN screens sc ON sc.id = s.screen_id
           JOIN cinemas c  ON c.id = sc.cinema_id
          WHERE s.id = ?`
      )
      .get(id)
  );
}

export { SHOW_TYPES };
