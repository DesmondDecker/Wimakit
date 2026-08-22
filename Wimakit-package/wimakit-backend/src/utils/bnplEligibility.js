'use strict';
const logger = require('./logger');
/**
 * BNPL Auto-Eligibility
 * ──────────────────────
 * BNPL is NOT available to everyone by default. A buyer becomes eligible
 * automatically once they've both:
 *   1. Spent more than BNPL_SPEND_THRESHOLD (lifetime, on completed orders)
 *   2. Held an account for at least BNPL_TENURE_MONTHS months
 *
 * Admins can always override this directly (open it early for someone, or
 * close it for someone who would otherwise auto-qualify). An admin decision
 * is sticky — recorded via `bnplEligibilityOverride` — and this automatic
 * check will never silently undo it. Only another admin action changes it
 * back to 'auto', at which point this check resumes controlling the flag.
 */

const Order = require('../models/Order');
const User = require('../models/User');

const BNPL_SPEND_THRESHOLD = 5_000_000; // Le 5,000,000 lifetime spend
const BNPL_TENURE_MONTHS = 6;

// Order statuses that count as genuine, completed spend. Anything still
// in-flight, cancelled, refunded, or returned should not count toward
// "money this buyer has actually spent on the platform."
const SPEND_QUALIFYING_STATUSES = ['delivered', 'completed', 'resolved'];

/**
 * Compute a buyer's lifetime qualifying spend.
 */
async function getLifetimeSpend(userId) {
  const result = await Order.aggregate([
    { $match: { buyer: userId, status: { $in: SPEND_QUALIFYING_STATUSES } } },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);
  return result[0]?.total || 0;
}

function monthsSince(date) {
  if (!date) return 0;
  const ms = Date.now() - new Date(date).getTime();
  return ms / (1000 * 60 * 60 * 24 * 30.44); // average month length
}

/**
 * Re-evaluate and persist a buyer's BNPL eligibility based on spend + tenure.
 * No-ops (leaves bnplEligible untouched) if an admin has manually overridden it.
 * Safe to call after every completed order — cheap, idempotent, never throws.
 *
 * @returns {Promise<{ eligible: boolean, overridden: boolean, lifetimeSpend: number, accountAgeMonths: number }|null>}
 */
async function reevaluateBnplEligibility(userId) {
  try {
    const user = await User.findById(userId).select('createdAt bnplEligible bnplEligibilityOverride');
    if (!user) return null;

    const lifetimeSpend = await getLifetimeSpend(user._id);
    const accountAgeMonths = monthsSince(user.createdAt);
    const qualifiesAutomatically =
      lifetimeSpend > BNPL_SPEND_THRESHOLD && accountAgeMonths >= BNPL_TENURE_MONTHS;

    // Admin override is sticky — don't touch bnplEligible either direction.
    if (user.bnplEligibilityOverride !== 'auto') {
      return { eligible: user.bnplEligible, overridden: true, lifetimeSpend, accountAgeMonths };
    }

    if (user.bnplEligible !== qualifiesAutomatically) {
      user.bnplEligible = qualifiesAutomatically;
      await user.save({ validateBeforeSave: false });
    }

    return { eligible: qualifiesAutomatically, overridden: false, lifetimeSpend, accountAgeMonths };
  } catch (err) {
    // Eligibility re-checks must never break the calling flow (e.g. checkout).
    logger.error('[bnplEligibility] reevaluate failed:', err.message);
    return null;
  }
}

module.exports = {
  BNPL_SPEND_THRESHOLD,
  BNPL_TENURE_MONTHS,
  getLifetimeSpend,
  reevaluateBnplEligibility,
};
