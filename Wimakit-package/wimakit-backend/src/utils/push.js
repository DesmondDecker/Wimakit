'use strict';
/**
 * WimaKit Push Notification Service — powered by Expo Push API
 * ─────────────────────────────────────────────────────────────
 * Sends background push notifications via Expo's free push delivery
 * infrastructure. No Firebase/APNs credentials are needed here — Expo
 * handles that layer. You only need:
 *
 *   1. expo-notifications installed in the mobile app (already in package.json)
 *   2. The app calls `Notifications.getExpoPushTokenAsync()` on launch and
 *      saves the token to the backend via PATCH /api/auth/push-token
 *      (see routes/auth.js — that endpoint already exists and saves it to
 *      User.pushTokens[])
 *   3. No extra env vars required — the Expo Push API is public and free
 *
 * When no valid tokens are found for a user, the function logs and returns
 * gracefully so in-app notifications still work even if push is misconfigured.
 *
 * Usage:
 *   const { sendPushToUser } = require('./push');
 *   await sendPushToUser(userId, { title: 'Order shipped!', body: 'Your order is on the way.' });
 */
const User = require('../models/User');
const logger = require('./logger');

let Expo, expo; // Both initialized on first use — Expo must be module-scoped, not
                 // block-scoped inside the `if`, or every reference below throws
                 // ReferenceError (which was previously swallowed silently).

/**
 * Send a push notification to all registered devices for a given user.
 * Silently skips invalid/expired tokens (Expo reports these as
 * DeviceNotRegistered — we remove them to keep the array clean).
 *
 * @param {string|import('mongoose').ObjectId} userId
 * @param {{ title: string, body: string, data?: object, sound?: string }} payload
 */
async function sendPushToUser(userId, { title, body, data = {}, sound = 'default' }) {
  try {
    // Dynamically import and initialize Expo if it hasn't been already.
    // This handles the ESM module in a CommonJS file.
    if (!expo) {
      ({ Expo } = await import('expo-server-sdk'));
      expo = new Expo();
    }

    const user = await User.findById(userId).select('pushTokens name').lean();
    if (!user?.pushTokens?.length) return;

    // Filter to valid Expo tokens only
    const validTokens = user.pushTokens.filter(t => Expo.isExpoPushToken(t));
    if (!validTokens.length) return;

    const messages = validTokens.map(pushToken => ({
      to: pushToken,
      sound,
      title,
      body,
      data,
    }));

    // Expo recommends chunking in batches of 100
    const chunks = expo.chunkPushNotifications(messages);
    const invalidTokens = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        ticketChunk.forEach((ticket, idx) => {
          if (ticket.status === 'error') {
            logger.warn(`[Push] Error for token ${chunk[idx].to}: ${ticket.message}`);
            if (ticket.details?.error === 'DeviceNotRegistered') {
              invalidTokens.push(chunk[idx].to);
            }
          }
        });
      } catch (err) {
        logger.error('[Push] Chunk send failed:', err.message);
      }
    }

    // Prune stale tokens — don't await, best-effort cleanup
    if (invalidTokens.length) {
      User.findByIdAndUpdate(userId, {
        $pull: { pushTokens: { $in: invalidTokens } },
      }).catch(() => {});
      logger.info(`[Push] Removed ${invalidTokens.length} invalid token(s) for user ${userId}`);
    }

    logger.info(`[Push] Sent "${title}" to ${validTokens.length} device(s) for user ${userId}`);
  } catch (err) {
    // Never let push failure bubble up and break the calling flow
    logger.error('[Push] sendPushToUser failed:', err.message);
  }
}

module.exports = { sendPushToUser };
