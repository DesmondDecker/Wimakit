'use strict';
const logger = require('./logger');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendPushToUser } = require('./push');

// Maps every Notification `type` (see models/Notification.js's enum) to one
// of the three categories Settings > Notifications actually exposes.
// 'system' and 'warning' are deliberately not in here — those are account/
// moderation-critical and always get delivered live regardless of
// preference, the same way order/security emails aren't something an app
// lets you silence.
const CATEGORY_BY_TYPE = {
  order_status: 'orderUpdates', wallet_debit: 'orderUpdates', wallet_credit: 'orderUpdates',
  bnpl_reminder: 'orderUpdates', kyc_approved: 'orderUpdates', kyc_rejected: 'orderUpdates',
  product_approved: 'orderUpdates', product_rejected: 'orderUpdates', loan_approved: 'orderUpdates',
  promotion: 'promotions', ad: 'promotions', product_trending: 'promotions', new_product: 'promotions',
  message: 'messages', community_like: 'messages', community_comment: 'messages',
  community_mention: 'messages', community_follow: 'messages', community_post: 'messages', new_follower: 'messages',
};

/**
 * Create a notification and emit it via Socket.IO to the recipient's room.
 * Also fires a background Expo push notification so users who have closed
 * the app are still reached.
 * @param {import('socket.io').Server} io
 * @param {{ userId, type, title, message, data }} payload
 */
async function createNotification(io, { userId, type, title, message, data }) {
  try {
    const notif = await Notification.create({
      recipient: userId, userId, type, title, message,
      data: data || {},
    });

    // notificationPrefs gates live delivery (push + real-time socket toast)
    // only — the row above is always written regardless, so disabling
    // "Promotions" mutes the interruption without deleting the user's
    // notification history. A category with no mapping (system, warning)
    // is always delivered live; it's not something a settings toggle here
    // is meant to silence.
    const category = CATEGORY_BY_TYPE[type];
    let allowLiveDelivery = true;
    if (category) {
      const recipient = await User.findById(userId).select(`notificationPrefs.${category}`).lean();
      allowLiveDelivery = recipient?.notificationPrefs?.[category] !== false;
    }

    if (allowLiveDelivery) {
      if (io && userId) {
        io.to(`user:${userId}`).emit('notification:new', {
          _id: notif._id, type, title, message, data, createdAt: notif.createdAt, read: false,
        });
      }
      // Background push — fire-and-forget; push failures never break the caller.
      sendPushToUser(userId, { title, body: message, data: { type, ...(data || {}) } }).catch(() => {});
    }
    return notif;
  } catch (err) {
    logger.error('[createNotification]', err.message);
    return null;
  }
}

/**
 * Broadcast a notification to all active users (or filtered by role/exclusions).
 * Persists Notification documents to DB in bulk, emits Socket.IO events, and dispatches push notifications.
 * @param {import('socket.io').Server} io
 * @param {{ type, title, message, data, role, excludeUserId }} payload
 */
async function broadcastNotification(io, { type, title, message, data, role, excludeUserId }) {
  try {
    const filter = { accountStatus: 'active' };
    if (role) filter.role = role;
    if (excludeUserId) filter._id = { $ne: excludeUserId };

    const users = await User.find(filter).select('_id notificationPrefs').lean();
    if (!users || users.length === 0) return { count: 0 };

    const notifs = users.map((u) => ({
      recipient: u._id,
      userId: u._id,
      type: type || 'system',
      title: title || 'Notice',
      message: message || '',
      data: data || {},
      read: false,
    }));

    // Batch insert for performance
    const CHUNK_SIZE = 500;
    for (let i = 0; i < notifs.length; i += CHUNK_SIZE) {
      await Notification.insertMany(notifs.slice(i, i + CHUNK_SIZE), { ordered: false });
    }

    const category = CATEGORY_BY_TYPE[type];

    // Real-time socket delivery
    if (io) {
      for (const u of users) {
        const allowLive = !category || u.notificationPrefs?.[category] !== false;
        if (allowLive) {
          io.to(`user:${u._id}`).emit('notification:new', {
            type, title, message, data, createdAt: new Date(), read: false,
          });
        }
      }
    }

    // Push notifications in background
    Promise.allSettled(
      users
        .filter((u) => !category || u.notificationPrefs?.[category] !== false)
        .map((u) => sendPushToUser(u._id, { title, body: message, data: { type, ...(data || {}) } }))
    ).catch(() => {});

    return { count: users.length };
  } catch (err) {
    logger.error('[broadcastNotification]', err.message);
    return { count: 0, error: err.message };
  }
}

module.exports = { createNotification, broadcastNotification };
