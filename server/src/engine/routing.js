import { db } from '../db.js';

/**
 * Capability 10: Route Booking Request by Show Type.
 *
 * Rules are evaluated in ascending priority order; the first rule whose
 * conditions all match wins. A rule with show_type 'ANY' acts as a catch-all.
 */

export function activeRoutingRules() {
  return db
    .prepare('SELECT * FROM routing_rules WHERE active = 1 ORDER BY priority ASC, id ASC')
    .all();
}

export function allRoutingRules() {
  return db.prepare('SELECT * FROM routing_rules ORDER BY priority ASC, id ASC').all();
}

function matches(rule, ctx) {
  if (rule.show_type !== 'ANY' && rule.show_type !== ctx.showType) return false;
  if (rule.min_total != null && !(ctx.total >= rule.min_total)) return false;
  if (rule.max_total != null && !(ctx.total < rule.max_total)) return false;
  if (rule.min_quantity != null && !(ctx.quantity >= rule.min_quantity)) return false;
  return true;
}

/**
 * @param {{showType:string,total:number,quantity:number}} ctx
 * @returns {{workbasket:string,ruleId:number|null,description:string,evaluated:Array}}
 */
export function routeBooking(ctx) {
  const rules = activeRoutingRules();
  const evaluated = [];

  for (const rule of rules) {
    const hit = matches(rule, ctx);
    evaluated.push({
      priority: rule.priority,
      description: rule.description,
      workbasket: rule.workbasket,
      matched: hit,
    });
    if (hit) {
      return {
        workbasket: rule.workbasket,
        ruleId: rule.id,
        description: rule.description,
        evaluated,
      };
    }
  }

  return {
    workbasket: 'BookingOps.General',
    ruleId: null,
    description: 'Fallback: no routing rule matched',
    evaluated,
  };
}

/** Dry-run used by the admin screen to preview routing without a real case. */
export function explainRouting(ctx) {
  const result = routeBooking(ctx);
  return { input: ctx, ...result };
}
