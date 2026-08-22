'use strict';
/**
 * Search history maintenance.
 *
 * Current code caps searchHistory at 10 entries per user via $slice on every
 * write — so new entries are already self-limiting. This task does a one-time
 * (then weekly) sweep to truncate any user whose array grew beyond 10 entries
 * before that cap was in place. It's intentionally lightweight: only touches
 * users who actually have excess entries, uses a stream to avoid loading every
 * user into memory at once, and runs weekly (Saturday 02:00) when traffic is low.
 */
const cron = require('node-cron');
const User = require('../models/User');
const logger = require('../utils/logger');

const MAX_SEARCH_HISTORY = 10;

async function pruneSearchHistory() {
  try {
    logger.info('Running scheduled task: pruneSearchHistory');
    // Only touch documents that actually have excess entries
    const cursor = User.find({
      [`searchHistory.${MAX_SEARCH_HISTORY}`]: { $exists: true },
    })
      .select('_id searchHistory')
      .lean()
      .cursor();

    let pruned = 0;
    for await (const user of cursor) {
      await User.findByIdAndUpdate(user._id, {
        $set: { searchHistory: user.searchHistory.slice(0, MAX_SEARCH_HISTORY) },
      });
      pruned++;
    }

    logger.info(`[SearchHistoryPrune] Pruned ${pruned} user record(s)`);
    return pruned;
  } catch (err) {
    logger.error('[SearchHistoryPrune] Task failed:', err.message);
    return 0;
  }
}

function startSearchHistoryPruner() {
  // Weekly on Saturday at 02:00 — low traffic window; the task is fast anyway
  cron.schedule('0 2 * * 6', pruneSearchHistory);
  logger.info('[SearchHistoryPrune] Scheduler started (weekly Saturday 02:00)');
}

module.exports = { startSearchHistoryPruner, pruneSearchHistory };
