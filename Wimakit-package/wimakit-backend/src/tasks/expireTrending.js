'use strict';
/**
 * Trending expiry sweep.
 *
 * adminController.setProductTrending / setStoreTrending write isTrending: true
 * plus a trendingUntil expiry date, but until this task nothing ever read
 * trendingUntil back out — isTrending stayed true forever once set, with no
 * way for it to lapse on its own. productController.listProducts now also
 * filters trending queries by trendingUntil directly (belt-and-braces, so
 * expiry is self-healing within that one endpoint even between sweeps), but
 * isTrending is also read directly in a few other places — e.g.
 * communityController populates `isTrending` straight onto a post's author —
 * that don't go through listProducts' filter. Actually flipping the flag off
 * here, on the same schedule pattern as the other tasks in this folder, is
 * what fixes it everywhere at the source instead of one query at a time.
 */
const cron = require('node-cron');
const { Product, User } = require('../models');
const logger = require('../utils/logger');

async function expireTrending() {
  try {
    logger.info('Running scheduled task: expireTrending');

    const now = new Date();
    const expiredFilter = { isTrending: true, trendingUntil: { $lte: now } };

    const [productResult, storeResult] = await Promise.all([
      Product.updateMany(expiredFilter, { $set: { isTrending: false }, $unset: { trendingUntil: 1 } }),
      User.updateMany(expiredFilter, { $set: { isTrending: false, isFeaturedStore: false }, $unset: { trendingUntil: 1 } }),
    ]);

    logger.info(`[ExpireTrending] Un-trended ${productResult.modifiedCount} product(s), ${storeResult.modifiedCount} store(s)`);
    return { products: productResult.modifiedCount, stores: storeResult.modifiedCount };
  } catch (err) {
    logger.error('[ExpireTrending] Task failed:', err.message);
    return { products: 0, stores: 0 };
  }
}

function startExpireTrendingScheduler() {
  // Every 15 minutes — trending is a homepage-visible marketing flag, not a
  // financial one, so sub-minute precision isn't needed, but leaving it
  // stale for a full day (like the weekly search-history prune) would mean
  // a product could visibly outstay its trending window for hours.
  cron.schedule('*/15 * * * *', expireTrending);
  logger.info('[ExpireTrending] Scheduler started (every 15 minutes)');
}

module.exports = { startExpireTrendingScheduler, expireTrending };
