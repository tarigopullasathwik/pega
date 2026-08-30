import { db } from '../db.js';
import { badRequest } from '../util.js';

/**
 * Capability 03: Calculate Booking Cost.
 *
 * Declarative pricing: every component is derived from config rows in
 * pricing_config, the show's base price, seat-class and show-type multipliers,
 * time-of-day surcharge, then promo discount and taxes/fees.
 */

const SEAT_CLASS_KEY = {
  SILVER: 'multiplier.seat.SILVER',
  GOLD: 'multiplier.seat.GOLD',
  PLATINUM: 'multiplier.seat.PLATINUM',
  RECLINER: 'multiplier.seat.RECLINER',
};

const SHOW_TYPE_KEY = {
  REGULAR: 'multiplier.show.REGULAR',
  PREMIUM: 'multiplier.show.PREMIUM',
  IMAX: 'multiplier.show.IMAX',
  FOURDX: 'multiplier.show.FOURDX',
};

export function loadPricingConfig() {
  const rows = db.prepare('SELECT key, value, description FROM pricing_config').all();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export function pricingConfigRows() {
  return db.prepare('SELECT key, value, description, updated_at FROM pricing_config ORDER BY key').all();
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** 'YYYY-MM-DD HH:MM:SS' -> hour as integer. */
function hourOf(startsAt) {
  return Number(startsAt.slice(11, 13));
}

export function findPromo(code, quantity) {
  if (!code) return null;
  const promo = db
    .prepare('SELECT * FROM promo_codes WHERE code = ? AND active = 1')
    .get(code.trim().toUpperCase());
  if (!promo) return { error: `Promo code ${code} is not valid` };
  if (quantity < promo.min_quantity) {
    return { error: `Promo ${promo.code} requires at least ${promo.min_quantity} tickets` };
  }
  return promo;
}

/**
 * Pure calculation. Returns a breakdown array plus totals so the UI can show
 * each line item and the API can persist an auditable record.
 */
export function calculateCost({ show, seatClass, quantity, promoCode }) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw badRequest('Quantity must be between 1 and 10');
  }

  const cfg = loadPricingConfig();
  const seatMultiplier = cfg[SEAT_CLASS_KEY[seatClass]] ?? 1;
  const showMultiplier = cfg[SHOW_TYPE_KEY[show.show_type ?? show.showType]] ?? 1;
  const basePrice = show.base_price ?? show.basePrice;
  const startsAt = show.starts_at ?? show.startsAt;

  const lines = [];

  const unitBase = basePrice * seatMultiplier * showMultiplier;
  lines.push({
    label: `Base fare (${seatClass} x ${show.show_type ?? show.showType})`,
    detail: `${basePrice.toFixed(2)} base x ${seatMultiplier} seat x ${showMultiplier} format`,
    unit: round2(unitBase),
    quantity,
    amount: round2(unitBase * quantity),
  });

  const hour = hourOf(startsAt);
  let surchargeRate = 0;
  let surchargeLabel = null;
  if (hour >= 18 || hour < 3) {
    surchargeRate = cfg['surcharge.primetime'] ?? 0;
    surchargeLabel = 'Prime-time surcharge (18:00-03:00)';
  } else if (hour < 12) {
    surchargeRate = -(cfg['discount.morning'] ?? 0);
    surchargeLabel = 'Morning show discount (before 12:00)';
  }

  let subtotal = round2(unitBase * quantity);
  if (surchargeRate !== 0) {
    const amount = round2(subtotal * surchargeRate);
    lines.push({
      label: surchargeLabel,
      detail: `${(surchargeRate * 100).toFixed(0)}% of base fare`,
      amount,
    });
    subtotal = round2(subtotal + amount);
  }

  const conv = cfg['fee.convenience.perTicket'] ?? 0;
  if (conv > 0) {
    lines.push({
      label: 'Convenience fee',
      detail: `${conv.toFixed(2)} per ticket`,
      unit: conv,
      quantity,
      amount: round2(conv * quantity),
    });
    subtotal = round2(subtotal + conv * quantity);
  }

  let discount = 0;
  let promoApplied = null;
  let promoError = null;
  const promo = findPromo(promoCode, quantity);
  if (promo?.error) {
    promoError = promo.error;
  } else if (promo) {
    discount =
      promo.kind === 'PERCENT'
        ? round2((subtotal * promo.amount) / 100)
        : round2(promo.amount);
    if (promo.max_discount != null) discount = Math.min(discount, promo.max_discount);
    discount = Math.min(discount, subtotal);
    promoApplied = promo.code;
    lines.push({
      label: `Promo ${promo.code}`,
      detail: promo.kind === 'PERCENT' ? `${promo.amount}% off` : `flat ${promo.amount} off`,
      amount: -discount,
    });
    subtotal = round2(subtotal - discount);
  }

  const gstRate = cfg['tax.gst.rate'] ?? 0;
  const gst = round2(subtotal * gstRate);
  if (gst > 0) {
    lines.push({
      label: 'GST',
      detail: `${(gstRate * 100).toFixed(0)}% of net amount`,
      amount: gst,
    });
  }

  const total = round2(subtotal + gst);

  return {
    currency: 'INR',
    quantity,
    seatClass,
    showType: show.show_type ?? show.showType,
    unitBase: round2(unitBase),
    lines,
    net: subtotal,
    tax: gst,
    discount,
    promoApplied,
    promoError,
    total,
    calculatedAt: new Date().toISOString(),
  };
}
