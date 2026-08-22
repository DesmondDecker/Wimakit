'use strict';
const mongoose = require('mongoose');
const { Order, User, Product, Review } = require('../models');
const Ad            = require('../models/Ad');
const Notification  = require('../models/Notification');
const CommunityPost = require('../models/CommunityPost');
const AggregatedStat = require('../models/AggregatedStat');
const AuditLog      = require('../models/AuditLog');
const Ledger        = require('../models/Ledger');
const Category      = require('../models/Category');
const Warning       = require('../models/Warning');
const BnplPlan      = require('../models/BnplPlan');
const Loan          = require('../models/Loan');
const { createNotification, broadcastNotification } = require('../utils/notifications');
const { sendPushToUser } = require('../utils/push');
const { sendMoneyAlert } = require('../utils/moneyAlert');
const { sendPayoutEmail, sendWalletAdjustmentEmail, sendWarningEmail, sendBanEmail, sendAccountRecoveryEmail } = require('../utils/email');
const { buildPayoutMessage, buildWalletAdjustmentMessage } = require('../utils/whatsapp');

/**
 * Helper to calculate growth percentage
 */
const calculateGrowth = (current, previous) => {
  if (!previous || previous === 0) return 0;
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
};

/**
 * Enterprise Dashboard Aggregation
 * Calculates KPIs with Period-over-Period (PoP) growth metrics
 */
exports.getDashboardOverview = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0); // Start of the day

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    sixtyDaysAgo.setHours(0, 0, 0, 0); // Start of the day

    const [
      userStats,
      productStats,
      currentPeriodOrders,
      previousPeriodOrders,
      revenueTrendData,
      recentActivity
    ] = await Promise.all([
      // 0. System Health & Incident facets
      Order.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $facet: {
          disputes: [{ $match: { 'complaint.status': { $ne: 'none' } } }, { $count: 'count' }],
          failedPayments: [{ $match: { paymentStatus: 'failed' } }, { $count: 'count' }],
          lateDeliveries: [{ $match: { status: 'delivered', updatedAt: { $gt: '$estimatedDelivery' } } }, { $count: 'count' }]
        }}
      ]),
      // 1. User Statistics
      User.aggregate([
        { $facet: {
          total: [{ $count: 'count' }],
          active: [{ $match: { isActive: true } }, { $count: 'count' }],
          sellers: [{ $match: { role: 'seller' } }, { $count: 'count' }],
          verifiedSsellers: [{ $match: { role: 'seller', isVerified: true } }, { $count: 'count' }],
          riders: [{ $match: { role: 'rider' } }, { $count: 'count' }],
          admins: [{ $match: { role: 'admin' } }, { $count: 'count' }],
        }}
      ]),
      // 2. Product Statistics
      Product.aggregate([
        { $facet: {
          total: [{ $count: 'count' }],
          active: [{ $match: { isAvailable: true } }, { $count: 'count' }],
          // isApproved was never a real field on Product — the schema uses
          // a `status` enum ('pending_moderation', 'approved', etc), not a
          // boolean. { isApproved: false } therefore matched zero documents
          // on every request (a literal `false` match doesn't match missing
          // fields the way `null` would), so this KPI silently showed 0
          // regardless of how large the actual moderation backlog was —
          // exactly the number an admin would check to know if products are
          // piling up unapproved.
          pendingApproval: [{ $match: { status: 'pending_moderation' } }, { $count: 'count' }],
          outOfStock: [{ $match: { stock: { $lte: 5 } } }, { $count: 'count' }], // Low stock alert
        }}
      ]),
      // 3. Current Period Order/Revenue Stats (Last 30 days)
      Order.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo }, status: { $ne: 'cancelled' } } },
        { $group: {
          _id: null,
          totalGMV: { $sum: '$total' },
          totalPlatformFees: { $sum: '$platformFee' },
          totalOrders: { $sum: 1 },
          pendingOrders: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          disputedOrders: { $sum: { $cond: [{ $ne: ['$complaint.status', 'none'] }, 1, 0] } },
          refundedAmount: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, '$total', 0] } },
        }}
      ]),
      // 4. Previous Period Order/Revenue Stats (30-60 days ago)
      Order.aggregate([
        { $match: { createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }, status: { $ne: 'cancelled' } } },
        { $group: {
          _id: null,
          totalGMV: { $sum: '$total' },
          totalPlatformFees: { $sum: '$platformFee' },
          totalOrders: { $sum: 1 },
        }}
      ]),
      // 5. Time-series Revenue Data (for chart)
      AggregatedStat.find({ date: { $gte: thirtyDaysAgo } }).sort({ date: 1 }).lean(),
      // 6. Recent Audit Activity
      AuditLog.find().populate('admin', 'name avatar').sort('-createdAt').limit(5).lean()
    ]);

    const curOrders = currentPeriodOrders[0] || {};
    const prevOrders = previousPeriodOrders[0] || {};

    const incidents = currentPeriodOrders[0] || { disputes: [], failedPayments: [], lateDeliveries: [] };

    const stats = {
      operationalHealth: {
        disputeRate: calculateGrowth(incidents.disputes[0]?.count || 0, curOrders.totalOrders || 0),
        fulfillmentSLA: calculateGrowth(curOrders.totalOrders - (incidents.lateDeliveries[0]?.count || 0), curOrders.totalOrders || 1),
      },
      kpis: [
        {
          id: 'totalUsers',
          label: 'Total Users',
          value: userStats[0].total[0]?.count || 0,
          growth: calculateGrowth(userStats[0].total[0]?.count || 0, userStats[0].total[0]?.count || 0), // Placeholder for actual user growth
          icon: 'account-group-outline',
          color: '#3B82F6', // blue
          link: '/admin?module=users'
        },
        {
          id: 'totalGMV',
          label: 'Gross Merchandise Value',
          value: curOrders.totalGMV || 0,
          growth: calculateGrowth(curOrders.totalGMV || 0, prevOrders.totalGMV || 0),
          icon: 'cash-multiple',
          color: '#22C55E', // green
          prefix: 'Le ',
          link: '/admin?module=orders'
        },
        {
          id: 'platformRevenue',
          label: 'Platform Revenue',
          value: curOrders.totalPlatformFees || 0,
          growth: calculateGrowth(curOrders.totalPlatformFees || 0, prevOrders.totalPlatformFees || 0),
          icon: 'wallet-outline',
          color: '#F59E0B', // amber
          prefix: 'Le ',
          link: '/admin?module=financial'
        },
        {
          id: 'totalOrders',
          label: 'Total Orders',
          value: curOrders.totalOrders || 0,
          growth: calculateGrowth(curOrders.totalOrders || 0, prevOrders.totalOrders || 0),
          icon: 'truck-fast-outline',
          color: '#8B5CF6', // purple
          link: '/admin?module=orders'
        },
        {
          id: 'pendingOrders',
          label: 'Pending Orders',
          value: curOrders.pendingOrders || 0,
          growth: 0, // No growth calculation for pending count directly
          icon: 'timer-sand',
          color: '#06B6D4', // cyan
          link: '/admin?module=orders&status=pending'
        },
        {
          id: 'disputedOrders',
          label: 'Disputed Orders',
          value: curOrders.disputedOrders || 0,
          growth: 0, // No growth calculation for disputes directly
          icon: 'alert-octagon-outline',
          color: '#EF4444', // red
          link: '/admin?module=disputes'
        },
        {
          id: 'pendingProducts',
          label: 'Pending Products',
          value: productStats[0].pendingApproval[0]?.count || 0,
          growth: 0,
          icon: 'package-variant-closed',
          color: '#F43F5E', // rose
          link: '/admin?module=products'
        },
        {
          id: 'lowStock',
          label: 'Low Stock Alerts',
          value: productStats[0].outOfStock[0]?.count || 0,
          growth: 0,
          icon: 'alert-circle-outline',
          color: '#FB923C', // orange
          link: '/admin?module=products&stock=low'
        },
      ],
      revenueChart: revenueTrendData.map(d => ({
        date: d.date.toISOString().split('T')[0],
        value: d.dailyTotal
      })),
      recentActivity: recentActivity.map(log => ({
        ...log,
        adminName: log.admin?.name || 'System',
        adminAvatar: log.admin?.avatar,
      }))
    };

    res.status(200).json({ success: true, data: stats });
  } catch (err) { next(err); }
};

exports.getAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find()
      .populate('admin', 'name email')
      .sort('-createdAt')
      .limit(50);
    res.status(200).json({ success: true, data: logs });
  } catch (err) { next(err); }
};
// ════════════════════════════════════════════════════════════════════════════
// ─── WimaKit v3 Admin Command Center Extensions ──────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

// ─── Simple dashboard (v3 shape expected by frontend) ────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers, ordersMonth, activeDisputes, pendingPayouts, pendingKyc,
      pendingProducts, pendingLoans, monthRevAgg, activeBnpl, overdueLoans, totalPosts, overdueBnpl,
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      Order.countDocuments({ createdAt: { $gte: monthStart } }),
      Order.countDocuments({ 'complaint.status': { $nin: ['none', null] } }),
      User.countDocuments({ role: 'seller', 'payoutRequests.status': 'pending' }).catch(() => 0),
      User.countDocuments({ kycStatus: 'pending' }),
      Product.countDocuments({ status: 'pending_moderation' }),
      Loan.countDocuments({ status: 'under_review' }),
      Order.aggregate([
        { $match: { status: { $in: ['delivered', 'completed'] }, createdAt: { $gte: monthStart } } },
        { $group: { _id: null, t: { $sum: '$total' } } },
      ]),
      BnplPlan.countDocuments({ status: 'active' }),
      Loan.countDocuments({ status: 'defaulted' }),
      CommunityPost.countDocuments({ isHidden: false }),
      // Previously nothing here reflected BNPL delinquency at all — the
      // 'overdue'/'defaulted' states existed in the schema but were never
      // actually reachable (see tasks/bnplOverdueSweep.js), so there was
      // nothing to surface. Grouped into `alerts` below, next to the
      // equivalent loan metric.
      BnplPlan.countDocuments({ status: { $in: ['overdue', 'defaulted'] } }),
    ]);

    const monthRev = monthRevAgg[0]?.t || 0;

    const revenueChart = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const agg = await Order.aggregate([
        { $match: { status: { $in: ['delivered', 'completed'] }, createdAt: { $gte: d, $lt: next } } },
        { $group: { _id: null, value: { $sum: '$total' }, count: { $sum: 1 } } },
      ]);
      revenueChart.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), value: agg[0]?.value || 0, orders: agg[0]?.count || 0, date: d.toISOString() });
    }

    const dbOk = mongoose.connection.readyState === 1;

    res.json({
      kpis: [
        { id:'revenue',   label:'Revenue (Month)',   value: monthRev,       prefix: true,  icon:'cash-multiple',         color:'#10B981' },
        { id:'orders',    label:'Orders (Month)',    value: ordersMonth,    prefix: false, icon:'package-variant',       color:'#4F46E5' },
        { id:'users',     label:'Total Users',       value: totalUsers,     prefix: false, icon:'account-group-outline', color:'#8B5CF6' },
        { id:'disputes',  label:'Open Disputes',     value: activeDisputes, prefix: false, icon:'shield-alert-outline',  color:'#EF4444' },
        { id:'payouts',   label:'Pending Payouts',   value: pendingPayouts, prefix: false, icon:'bank-transfer-out',     color:'#F59E0B' },
        { id:'bnpl',      label:'Active BNPL Plans', value: activeBnpl,     prefix: false, icon:'calendar-month',        color:'#06B6D4' },
        { id:'loans',     label:'Pending Loans',     value: pendingLoans,   prefix: false, icon:'bank',                  color:'#F97316' },
        { id:'community', label:'Community Posts',   value: totalPosts,     prefix: false, icon:'account-group',         color:'#EC4899' },
      ],
      revenueChart,
      systemHealth: { api: 'healthy', database: dbOk ? 'healthy' : 'down', queue: 'healthy', payments: 'healthy', email: 'healthy' },
      alerts: { fraudAlerts: overdueLoans, openDisputes: activeDisputes, pendingKyc, pendingProducts, pendingLoans, pendingPayouts, overdueBnpl },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getSystemHealth = async (req, res) => {
  res.json({
    api: 'healthy', database: mongoose.connection.readyState === 1 ? 'healthy' : 'down',
    queue: 'healthy', payments: 'healthy', email: 'healthy',
    uptime: process.uptime(), memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
};

// ─── User Management ──────────────────────────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const { role, status, storeStatus, q, page = 1, limit = 20, sort = '-createdAt' } = req.query;
    const filter = {};
    if (role)   filter.role = role;
    if (status) filter.accountStatus = status;
    if (storeStatus) filter.storeStatus = storeStatus;
    if (q) {
      const escaped = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } },
      ];
    }
    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).limit(+limit).skip((+page - 1) * +limit),
      User.countDocuments(filter),
    ]);
    res.json({ users: users.map((u) => u.toPublic()), total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Lets admin pull up what a user has actually posted and, if they've sold
// or bought anything, that order history too — needed for support/dispute
// investigation without digging through the database by hand.
exports.getUserActivity = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('role name');
    if (!user) return res.status(404).json({ message: 'Not found' });

    const [posts, sales, purchases] = await Promise.all([
      CommunityPost.find({ author: req.params.id }).sort('-createdAt').limit(50).lean(),
      Order.find({ seller: req.params.id }).sort('-createdAt').limit(50).lean(),
      Order.find({ buyer: req.params.id }).sort('-createdAt').limit(50).lean(),
    ]);

    res.json({ posts, sales, purchases });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.banUser = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: 'Ban reason is required' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Cannot ban an admin account' });
    user.accountStatus = 'banned';
    user.isActive      = false;
    user.bannedReason  = reason;
    user.bannedAt      = new Date();
    user.bannedBy      = req.user._id;
    await user.save({ validateBeforeSave: false });
    sendBanEmail(user.email, user.name, reason).catch(() => {});
    AuditLog.create({ admin: req.user._id, action: 'BAN_USER', targetId: user._id, targetModel: 'User', details: reason, ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'User banned', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.unbanUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id,
      { accountStatus: 'active', isActive: true, $unset: { bannedReason: 1, bannedAt: 1, bannedBy: 1 } }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    await createNotification(req.app.get('io'), { userId: user._id, type: 'system', title: 'Account Reinstated', message: 'Your account ban has been lifted. Welcome back to WimaKit.' });
    AuditLog.create({ admin: req.user._id, action: 'UNBAN_USER', targetId: user._id, targetModel: 'User', ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'User unbanned', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.suspendUser = async (req, res) => {
  try {
    const { reason } = req.body;
    const target = await User.findById(req.params.id).select('role');
    if (!target) return res.status(404).json({ message: 'User not found' });
    if (target.role === 'admin') return res.status(403).json({ message: 'Cannot suspend an admin account' });
    const user = await User.findByIdAndUpdate(req.params.id, { accountStatus: 'suspended', suspendedReason: reason }, { new: true });
    await createNotification(req.app.get('io'), { userId: user._id, type: 'warning', title: 'Account Suspended', message: `Your account has been suspended. Reason: ${reason}` });
    AuditLog.create({ admin: req.user._id, action: 'SUSPEND_USER', targetId: user._id, targetModel: 'User', details: reason, ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'User suspended', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.unsuspendUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { accountStatus: 'active', $unset: { suspendedReason: 1 } }, { new: true });
    if (!user) return res.status(404).json({ message: 'Not found' });
    AuditLog.create({ admin: req.user._id, action: 'UNSUSPEND_USER', targetId: user._id, targetModel: 'User', ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'Unsuspended', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.resetUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'Min 6 characters' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Not found' });
    user.password = newPassword;
    await user.save();
    await createNotification(req.app.get('io'), { userId: user._id, type: 'system', title: 'Password Changed', message: 'An admin has reset your password. Contact support if this was unexpected.' });
    AuditLog.create({ admin: req.user._id, action: 'RESET_USER_PASSWORD', targetId: user._id, targetModel: 'User', ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'Password reset successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.resetUserEmail = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!newEmail || !EMAIL_RE.test(newEmail)) {
      return res.status(400).json({ message: 'A valid email address is required' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Not found' });

    const normalized = newEmail.trim().toLowerCase();
    const oldEmail = user.email;
    if (normalized === oldEmail) return res.status(400).json({ message: 'That is already this user\'s email' });

    user.email = normalized;
    // An admin manually verified this address by setting it directly —
    // don't leave the account stuck pending a verification email that may
    // never reach an address that may itself be a typo fix.
    user.emailVerified = true;
    try {
      await user.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        return res.status(409).json({ message: 'That email is already in use by another account' });
      }
      throw saveErr;
    }

    await createNotification(req.app.get('io'), {
      userId: user._id, type: 'system', title: 'Email Address Changed',
      message: `An admin changed your account email to ${normalized}. Contact support if this was unexpected.`,
    });
    AuditLog.create({
      admin: req.user._id, action: 'RESET_USER_EMAIL', targetId: user._id, targetModel: 'User',
      details: `${oldEmail} → ${normalized}`, ipAddress: req.ip,
    }).catch(() => {});
    res.json({ message: 'Email updated successfully', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.resetUserPhone = async (req, res) => {
  try {
    const { newPhone } = req.body;
    if (!newPhone || newPhone.trim().replace(/\D/g, '').length < 6) {
      return res.status(400).json({ message: 'A valid phone number is required' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Not found' });

    const oldPhone = user.phone;
    user.phone = newPhone.trim();
    await user.save({ validateBeforeSave: false });

    await createNotification(req.app.get('io'), {
      userId: user._id, type: 'system', title: 'Phone Number Changed',
      message: `An admin changed your account phone number to ${user.phone}. Contact support if this was unexpected.`,
    });
    AuditLog.create({
      admin: req.user._id, action: 'RESET_USER_PHONE', targetId: user._id, targetModel: 'User',
      details: `${oldPhone || '(none)'} → ${user.phone}`, ipAddress: req.ip,
    }).catch(() => {});
    res.json({ message: 'Phone number updated successfully', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/**
 * Open or close BNPL for a specific user — overrides the automatic
 * spend + tenure eligibility check (see utils/bnplEligibility.js).
 * The override is sticky: once an admin sets this, the automatic
 * re-check on each checkout will not change it again until another
 * admin action resets it back to 'auto'.
 */
exports.setBnplEligibility = async (req, res) => {
  try {
    const { action } = req.body; // 'grant' | 'revoke' | 'auto'
    if (!['grant', 'revoke', 'auto'].includes(action)) {
      return res.status(400).json({ message: "action must be 'grant', 'revoke', or 'auto'" });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Not found' });

    if (action === 'grant') {
      user.bnplEligible = true;
      user.bnplEligibilityOverride = 'admin_granted';
    } else if (action === 'revoke') {
      user.bnplEligible = false;
      user.bnplEligibilityOverride = 'admin_revoked';
    } else {
      // Hand control back to the automatic spend+tenure check. Don't flip
      // bnplEligible here — let the next checkout's re-evaluation decide it
      // correctly rather than guessing at a value now.
      user.bnplEligibilityOverride = 'auto';
    }
    user.bnplEligibilityUpdatedBy = req.user._id;
    user.bnplEligibilityUpdatedAt = new Date();
    await user.save({ validateBeforeSave: false });

    if (action !== 'auto') {
      await createNotification(req.app.get('io'), {
        userId: user._id, type: 'system',
        title: action === 'grant' ? '🎉 Buy Now Pay Later Unlocked' : 'Buy Now Pay Later Update',
        message: action === 'grant'
          ? 'An admin has opened Buy Now Pay Later on your account. You can now use it at checkout.'
          : 'Buy Now Pay Later has been turned off for your account. Contact support with any questions.',
      });
    }
    AuditLog.create({
      admin: req.user._id, action: 'SET_BNPL_ELIGIBILITY', targetId: user._id, targetModel: 'User',
      details: action, ipAddress: req.ip,
    }).catch(() => {});
    res.json({ message: 'BNPL eligibility updated', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Loan eligibility previously only ever flipped to true as a side effect of
// KYC approval — there was no way for an admin to grant it directly (e.g.
// for a trusted long-time buyer who hasn't gone through KYC yet), and no way
// to revoke it either. Mirrors setBnplEligibility above.
exports.setLoanEligibility = async (req, res) => {
  try {
    const { action } = req.body; // 'grant' | 'revoke'
    if (!['grant', 'revoke'].includes(action)) {
      return res.status(400).json({ message: "action must be 'grant' or 'revoke'" });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Not found' });

    user.loanEligible = action === 'grant';
    await user.save({ validateBeforeSave: false });

    await createNotification(req.app.get('io'), {
      userId: user._id, type: 'system',
      title: action === 'grant' ? '🎉 Loans Unlocked' : 'Loan Access Update',
      message: action === 'grant'
        ? 'An admin has enabled loan access on your account. You can now apply for a loan.'
        : 'Loan access has been turned off for your account. Contact support with any questions.',
    });
    AuditLog.create({
      admin: req.user._id, action: 'SET_LOAN_ELIGIBILITY', targetId: user._id, targetModel: 'User',
      details: action, ipAddress: req.ip,
    }).catch(() => {});
    res.json({ message: 'Loan eligibility updated', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.recoverAccount = async (req, res) => {
  try {
    const crypto = require('crypto');
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Not found' });
    const rawToken    = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetToken   = hashedToken;  // store hashed, send raw
    user.passwordResetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    user.accountStatus = 'active';
    user.isActive      = true;
    await user.save({ validateBeforeSave: false });
    sendAccountRecoveryEmail(user.email, user.name, rawToken).catch(() => {});
    res.json({ message: 'Recovery email sent' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.sendWarning = async (req, res) => {
  try {
    const { reason, message, severity = 'low' } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Not found' });
    await Warning.create({ userId: user._id, reason, message, severity, createdBy: req.user._id });
    user.warningsCount = (user.warningsCount || 0) + 1;
    user.lastWarningAt = new Date();
    await user.save({ validateBeforeSave: false });
    sendWarningEmail(user.email, user.name, reason, message).catch(() => {});
    await createNotification(req.app.get('io'), { userId: user._id, type: 'warning', title: '⚠️ Account Warning', message: `${reason}: ${message}` });
    res.json({ message: 'Warning sent' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.changeUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const VALID_ROLES = ['buyer', 'seller', 'rider', 'admin'];
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }
    const existing = await User.findById(req.params.id).select('role');
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (existing.role === 'admin' && role !== 'admin') {
      return res.status(403).json({ message: 'Downgrading an admin account requires direct database access as a safety measure' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    AuditLog.create({ admin: req.user._id, action: 'CHANGE_USER_ROLE', targetId: user._id, targetModel: 'User', details: `Role changed from ${existing.role} to ${role}`, ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'Role updated', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.awardBadge = async (req, res) => {
  try {
    const { type, label } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Not found' });
    const exists = user.badges.find((b) => b.type === type);
    if (!exists) user.badges.push({ type, label: label || type, awardedAt: new Date() });
    if (type === 'verified') user.isVerified = true;
    await user.save({ validateBeforeSave: false });
    await createNotification(req.app.get('io'), { userId: user._id, type: 'system', title: '🏅 Badge Awarded', message: `You've been awarded the "${label || type}" badge!` });
    res.json({ message: 'Badge awarded', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addAdminNote = async (req, res) => {
  try {
    const { note } = req.body;
    await User.findByIdAndUpdate(req.params.id, { $push: { adminNotes: { note, createdBy: req.user._id, createdAt: new Date() } } });
    res.json({ message: 'Note added' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Product Management ───────────────────────────────────────────────────────
exports.getProducts = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, stock } = req.query;
    const filter = status ? { status } : {};
    // Low-stock filter backs the "Low Stock Alerts" KPI on the dashboard —
    // uses the same <=5 threshold as the dashboard's own outOfStock stat so
    // the KPI count and this list always agree.
    if (stock === 'low') filter.stock = { $lte: 5 };
    const [products, total] = await Promise.all([
      Product.find(filter).populate('seller', 'name storeName').populate('category', 'name').sort({ createdAt: -1 }).limit(+limit).skip((+page - 1) * +limit),
      Product.countDocuments(filter),
    ]);
    res.json({ products, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.approveProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true });
    if (!product) return res.status(404).json({ message: 'Not found' });
    const io = req.app.get('io');
    await createNotification(io, { userId: product.seller, type: 'product_approved', title: '✅ Product Approved', message: `"${product.name}" is now live on WimaKit!` });
    
    // Notify store followers
    const Follow = require('../models/Follow');
    const follows = await Follow.find({ followee: product.seller }).select('follower').lean();
    const usersWithFollowing = await User.find({ following: product.seller }).select('_id').lean();
    const followerIds = [...new Set([
      ...follows.map(f => f.follower?.toString()),
      ...usersWithFollowing.map(u => u._id?.toString()),
    ])].filter(id => id && id !== product.seller.toString());

    if (followerIds.length > 0) {
      const sellerUser = await User.findById(product.seller).select('name storeName').lean();
      const storeDisplayName = sellerUser?.storeName || sellerUser?.name || 'A store you follow';
      for (const fId of followerIds) {
        createNotification(io, {
          userId: fId,
          type: 'new_product',
          title: `✨ New product from ${storeDisplayName}`,
          message: `${storeDisplayName} just listed "${product.name}" for Le ${(product.price || 0).toLocaleString()}`,
          data: {
            productId: product._id.toString(),
            url: `/product/${product._id}`,
          },
        }).catch(() => {});
      }
    }

    res.json({ message: 'Approved', product });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.rejectProduct = async (req, res) => {
  try {
    const { reason } = req.body;
    const product = await Product.findByIdAndUpdate(req.params.id, { status: 'rejected', rejectionReason: reason }, { new: true });
    if (!product) return res.status(404).json({ message: 'Not found' });
    await createNotification(req.app.get('io'), { userId: product.seller, type: 'product_rejected', title: 'Product Rejected', message: `"${product.name}" was rejected. Reason: ${reason}` });
    res.json({ message: 'Rejected', product });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.setProductTrending = async (req, res) => {
  try {
    const { until, isTrending = true } = req.body;
    const update = isTrending
      ? { isTrending: true, trendingUntil: until ? new Date(until) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
      : { isTrending: false, trendingUntil: null };
    const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!product) return res.status(404).json({ message: 'Not found' });
    if (isTrending) {
      const io = req.app.get('io');
      // 1. Notify the seller
      await createNotification(io, {
        userId: product.seller,
        type: 'product_trending',
        title: '🔥 Your product is trending!',
        message: `"${product.name}" has been featured as trending by admin!`,
        data: { productId: product._id.toString(), url: `/product/${product._id}` },
      });
      // 2. Broadcast to ALL users so it appears in their notification page
      broadcastNotification(io, {
        type: 'product_trending',
        title: '🔥 Trending Product Alert!',
        message: `"${product.name}" is now trending on WimaKit! Check it out now.`,
        data: { productId: product._id.toString(), url: `/product/${product._id}` },
        excludeUserId: product.seller,
      }).catch(() => {});
    }
    res.json({ message: isTrending ? 'Set as trending' : 'Trending removed', product });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.flagProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { status: 'flagged', flagReason: req.body.reason }, { new: true });
    res.json({ product });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Sellers / Riders ──────────────────────────────────────────────────────────

// Store applications live on the User doc (storeStatus), independent of role —
// a user stays role:'buyer' until their store is approved. Filtering /admin/users
// by role:'seller' therefore misses every pending application. This dedicated
// endpoint filters on storeStatus instead so new submissions actually show up.
exports.getSellers = async (req, res) => {
  try {
    const { status, q, page = 1, limit = 50, sort = '-createdAt' } = req.query;
    // `$ne`/`$exists` can't use the { storeStatus: 1, isTrending: 1 } index —
    // Mongo has to scan every non-matching document to rule it out, which
    // gets slower as the users collection grows. `$in` over the known
    // non-draft statuses hits the index directly instead.
    const filter = { storeStatus: { $in: ['pending_review', 'approved', 'rejected', 'suspended'] } };
    if (status) filter.storeStatus = status;
    if (q) {
      const escaped = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { storeName: { $regex: escaped, $options: 'i' } },
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }
    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).limit(+limit).skip((+page - 1) * +limit),
      User.countDocuments(filter),
    ]);
    res.json({ users: users.map((u) => u.toPublic()), total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.approveSeller = async (req, res) => {
  try {
    // Promote role to 'seller' as well as flipping storeStatus — otherwise the
    // account stays role:'buyer' forever and never unlocks seller-only screens
    // (seller-dashboard tab, add-product, my-products, etc.) even though their
    // store shows as "approved" in the admin dashboard.
    const u = await User.findByIdAndUpdate(req.params.id, { storeStatus: 'approved', role: 'seller' }, { new: true });
    if (!u) return res.status(404).json({ message: 'Not found' });
    await createNotification(req.app.get('io'), { userId: req.params.id, type: 'system', title: 'Store Approved! 🎉', message: 'Your store is now live on WimaKit.' });
    res.json({ message: 'Seller approved', user: u.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.suspendSeller = async (req, res) => {
  try {
    const u = await User.findByIdAndUpdate(req.params.id, { storeStatus: 'suspended' }, { new: true });
    res.json({ message: 'Seller suspended', user: u.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.rejectSeller = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: 'Rejection reason is required' });
    const u = await User.findByIdAndUpdate(req.params.id, { storeStatus: 'rejected' }, { new: true });
    if (!u) return res.status(404).json({ message: 'Not found' });
    await createNotification(req.app.get('io'), { userId: req.params.id, type: 'system', title: 'Store Application Update', message: `Your store application was not approved. Reason: ${reason}` });
    res.json({ message: 'Seller rejected', user: u.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.setStoreTrending = async (req, res) => {
  try {
    const { until, isTrending = true } = req.body;
    const update = isTrending
      ? { isTrending: true, trendingUntil: until ? new Date(until) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), isFeaturedStore: true }
      : { isTrending: false, trendingUntil: null, isFeaturedStore: false };
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!user) return res.status(404).json({ message: 'Not found' });
    if (isTrending) {
      const io = req.app.get('io');
      // 1. Notify store owner
      await createNotification(io, {
        userId: user._id,
        type: 'system',
        title: '⭐ Your store is featured!',
        message: 'Your store has been set as a featured trending store by admin.',
        data: { url: `/profile/${user.profileSlug}` },
      });
      // 2. Broadcast to ALL users
      broadcastNotification(io, {
        type: 'system',
        title: '⭐ Featured Store Alert!',
        message: `${user.storeName || user.name} is now a featured trending seller on WimaKit! Check out their store.`,
        data: { sellerId: user._id.toString(), slug: user.profileSlug, url: `/profile/${user.profileSlug}` },
        excludeUserId: user._id,
      }).catch(() => {});
    }
    res.json({ message: isTrending ? 'Store set as trending' : 'Store trending removed', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getRiders = async (req, res) => {
  try {
    const riders = await User.find({ role: 'rider' }).sort({ createdAt: -1 }).limit(500);
    res.json({ riders: riders.map((r) => r.toPublic()) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getLiveRiders = async (req, res) => {
  try {
    const riders = await User.find({ role: 'rider', riderStatus: 'available' }).select('name riderLocation riderZone riderStatus riderScore').limit(200).lean();
    res.json({ riders });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.approveRider = async (req, res) => {
  try {
    const u = await User.findByIdAndUpdate(req.params.id, { accountStatus: 'active', isVerified: true }, { new: true });
    if (!u) return res.status(404).json({ message: 'Not found' });
    await createNotification(req.app.get('io'), { userId: req.params.id, type: 'system', title: 'Rider Approved! 🎉', message: 'You can now start accepting deliveries.' });
    res.json({ message: 'Rider approved', user: u.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.suspendRider = async (req, res) => {
  try {
    const { reason = 'Your account has been suspended. Please contact support.' } = req.body;
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ message: 'Rider not found' });
    if (u.role !== 'rider') return res.status(400).json({ message: 'User is not a rider' });
    u.accountStatus = 'suspended';
    u.riderStatus = 'offline'; // take them off the available pool immediately
    await u.save({ validateBeforeSave: false });
    await createNotification(req.app.get('io'), {
      userId: u._id,
      type: 'warning',
      title: 'Account suspended',
      message: reason,
    });
    await AuditLog.create({
      admin: req.user._id,
      action: 'SUSPEND_RIDER',
      targetId: u._id,
      targetModel: 'User',
      details: reason,
    });
    res.json({ success: true, message: 'Rider suspended', user: u.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.rejectRider = async (req, res) => {
  try {
    const { reason = 'Your rider application has been rejected.' } = req.body;
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ message: 'Rider not found' });
    if (u.role !== 'rider') return res.status(400).json({ message: 'User is not a rider' });
    u.accountStatus = 'suspended';
    u.riderStatus = 'offline';
    u.isVerified = false;
    await u.save({ validateBeforeSave: false });
    await createNotification(req.app.get('io'), {
      userId: u._id,
      type: 'warning',
      title: 'Rider application rejected',
      message: reason,
    });
    await AuditLog.create({
      admin: req.user._id,
      action: 'REJECT_RIDER',
      targetId: u._id,
      targetModel: 'User',
      details: reason,
    });
    res.json({ success: true, message: 'Rider rejected', user: u.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getRiderPayouts = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    // Pull all riders who have at least one payout request
    const riders = await User.find({
      role: 'rider',
      'payoutRequests.0': { $exists: true },
    })
      .select('name phone email avatar wallet payoutRequests')
      .sort({ updatedAt: -1 })
      .lean();

    // Flatten into individual payout records so the frontend can paginate/filter easily
    let payouts = [];
    riders.forEach((rider) => {
      (rider.payoutRequests || []).forEach((p, idx) => {
        if (status && p.status !== status) return;
        payouts.push({
          _id: p._id || `${rider._id}-${idx}`,
          riderId: rider._id,
          riderName: rider.name,
          riderPhone: rider.phone,
          riderEmail: rider.email,
          riderAvatar: rider.avatar,
          amount: p.amount,
          method: p.method,
          status: p.status,
          accountDetails: p.accountDetails,
          note: p.note,
          createdAt: p.createdAt,
          // handy: current available balance for context
          walletAvailable: rider.wallet?.available || 0,
        });
      });
    });

    // Sort newest first
    payouts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = payouts.length;
    const start = (page - 1) * limit;
    const data = payouts.slice(start, start + Number(limit));

    res.json({ success: true, data, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.batchPayRiders = async (req, res) => {
  try {
    // Find all riders with at least one pending payout request
    const riders = await User.find({
      role: 'rider',
      payoutRequests: { $elemMatch: { status: 'pending' } },
    });

    let processed = 0;
    let totalAmount = 0;

    for (const rider of riders) {
      let changed = false;
      for (const p of rider.payoutRequests) {
        if (p.status === 'pending') {
          p.status = 'completed';
          totalAmount += p.amount || 0;
          processed++;
          changed = true;
        }
      }
      if (changed) {
        // Deduct from wallet pending → finalise
        rider.wallet.pending = Math.max(0, (rider.wallet.pending || 0) - totalAmount);
        await rider.save({ validateBeforeSave: false });
        await createNotification(req.app.get('io'), {
          userId: rider._id,
          type: 'system',
          title: 'Payout processed',
          message: `Your payout of Le ${totalAmount.toLocaleString()} has been sent.`,
        });
        sendMoneyAlert({
          emailFn: () => sendPayoutEmail(rider.email, rider.name, totalAmount, 'mobile money', rider._id.toString().slice(-8)),
          whatsapp: rider.phone ? { to: rider.phone, message: buildPayoutMessage({ name: rider.name, amount: totalAmount, method: 'mobile money', ref: rider._id.toString().slice(-8) }) } : null,
        }).catch(() => {});
      }
    }

    await AuditLog.create({
      admin: req.user._id,
      action: 'BATCH_PAY_RIDERS',
      // This is a batch action across many riders rather than one target —
      // the schema requires targetId/targetModel, so the admin's own record
      // is used as the anchor and the real detail lives in metadata.
      targetId: req.user._id,
      targetModel: 'User',
      details: `Batch payout: ${processed} payout(s), Le ${totalAmount.toLocaleString()} total`,
      metadata: { processed, totalAmount, riderIds: riders.map(r => r._id) },
    });

    res.json({
      success: true,
      message: `Batch payout complete — ${processed} payout(s) processed (Le ${totalAmount.toLocaleString()} total)`,
      processed,
      totalAmount,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── KYC ──────────────────────────────────────────────────────────────────────
exports.getPendingKyc = async (req, res) => {
  try {
    const users = await User.find({ kycStatus: 'pending' }).select('name email phone kycDocuments kycStatus role createdAt updatedAt').sort({ createdAt: 1 }).lean();
    const requests = users.map((u) => ({ _id: u._id, userId: u._id, userName: u.name, email: u.email, phone: u.phone, documentType: 'Government ID', documents: u.kycDocuments, submittedAt: u.updatedAt }));
    res.json({ requests, total: requests.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.approveKyc = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.userId, { kycStatus: 'approved', isKycVerified: true, isVerified: true, bnplEligible: true, loanEligible: true }, { new: true });
    if (!user) return res.status(404).json({ message: 'Not found' });
    await createNotification(req.app.get('io'), { userId: req.params.userId, type: 'kyc_approved', title: '✅ KYC Verified!', message: 'Your identity has been verified. BNPL and loan features are now unlocked.' });
    if (user.phone) {
      const { sendWhatsAppMessage } = require('../utils/whatsapp');
      sendWhatsAppMessage({ to: user.phone, message: `✅ *WimaKit KYC Approved*\n\nHi ${user.name}, your identity has been verified!\n\nBNPL and loan features are now unlocked on your account.\n\nThank you for verifying with WimaKit! 🇸🇱` }).catch(() => {});
    }
    res.json({ message: 'KYC approved', user: user.toPublic() });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.rejectKyc = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(req.params.userId, { kycStatus: 'rejected', kycRejectionReason: reason }, { new: true });
    await createNotification(req.app.get('io'), { userId: req.params.userId, type: 'kyc_rejected', title: 'KYC Rejected', message: `Your KYC submission was rejected. Reason: ${reason}` });
    if (user?.phone) {
      const { sendWhatsAppMessage } = require('../utils/whatsapp');
      sendWhatsAppMessage({ to: user.phone, message: `⚠️ *WimaKit KYC Update*\n\nHi ${user.name}, your KYC submission was not approved.\n\nReason: ${reason || 'Please resubmit clearer document photos.'}\n\nOpen the WimaKit app to resubmit or contact support for help.` }).catch(() => {});
    }
    res.json({ message: 'KYC rejected' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Orders ────────────────────────────────────────────────────────────────────
exports.getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, q, guestOnly, paymentMethod } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (q) filter.customOrderId = { $regex: q, $options: 'i' };
    if (guestOnly === 'true') filter.isGuestOrder = true;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('buyer', 'name phone email')
        .populate('seller', 'name storeName phone')
        .select('+isGuestOrder +guestInfo +whatsappShareText +platformPayment')
        .sort({ createdAt: -1 })
        .limit(+limit)
        .skip((+page - 1) * +limit)
        .lean(),
      Order.countDocuments(filter),
    ]);
    // Enrich each order with WhatsApp URL for admin sharing
    const enriched = orders.map(o => ({
      ...o,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(
        o.whatsappShareText || `WimaKit Order #${o.customOrderId} — Total: Le ${(o.total || 0).toLocaleString()}`
      )}`,
      buyerDisplay: o.isGuestOrder
        ? { name: o.guestInfo?.name || 'Guest', phone: o.guestInfo?.phone || o.buyerPhone, isGuest: true }
        : { name: o.buyer?.name || 'Unknown', phone: o.buyer?.phone || o.buyerPhone, isGuest: false },
    }));
    res.json({ success: true, orders: enriched, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Financial summary for admin ─────────────────────────────────────────────
exports.getFinancialSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to)   dateFilter.$lte = new Date(to);
    const matchStage = Object.keys(dateFilter).length ? { $match: { createdAt: dateFilter } } : { $match: {} };

    const [summary] = await Order.aggregate([
      matchStage,
      {
        $group: {
          _id: null,
          totalRevenue:    { $sum: '$total' },
          totalPlatformFee:{ $sum: '$platformFee' },
          totalDeliveryFee:{ $sum: '$deliveryFee' },
          orderCount:      { $sum: 1 },
          guestOrders:     { $sum: { $cond: ['$isGuestOrder', 1, 0] } },
          paidOrders:      { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
          deliveredOrders: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'completed']] }, 1, 0] } },
          cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        },
      },
    ]);

    const byPaymentMethod = await Order.aggregate([
      matchStage,
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$total' } } },
      { $sort: { total: -1 } },
    ]);

    res.json({
      success: true,
      summary: summary || {
        totalRevenue: 0, totalPlatformFee: 0, totalDeliveryFee: 0,
        orderCount: 0, guestOrders: 0, paidOrders: 0, deliveredOrders: 0, cancelledOrders: 0,
      },
      byPaymentMethod,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.forceCancelOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        status: 'cancelled',
        $push: { trackingUpdates: { status: 'cancelled', message: `Admin cancellation: ${reason || 'No reason given'}`, timestamp: new Date(), updatedBy: req.user._id } },
      },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });
    AuditLog.create({ admin: req.user._id, action: 'RESOLVE_DISPUTE', targetId: order._id, targetModel: 'User', details: `Force-cancelled order #${order.customOrderId}. Reason: ${reason || 'none'}`, ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'Cancelled', order });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.forceRefundOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const rawAmt = Number(req.body.amount);
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status === 'refunded' || order.paymentStatus === 'refunded') {
      return res.status(409).json({ message: 'This order has already been refunded' });
    }

    // Validate amount: must be a positive finite number and cannot exceed
    // what the buyer actually paid for the order (order.total is the source
    // of truth). An unvalidated admin-supplied amount could otherwise credit
    // any arbitrary figure to the buyer's wallet through a slip-of-the-finger
    // or a rogue admin action.
    if (!rawAmt || !Number.isFinite(rawAmt) || rawAmt <= 0) {
      return res.status(400).json({ message: 'A valid positive refund amount is required' });
    }
    const amount = Math.min(rawAmt, order.total || rawAmt); // never refund more than what was charged

    if (order.buyer) {
      const buyer = await User.findById(order.buyer);
      if (buyer) {
        buyer.wallet = buyer.wallet || { available: 0, pending: 0 };
        buyer.wallet.available = (buyer.wallet.available || 0) + amount;
        await buyer.save({ validateBeforeSave: false });
      }
    }

    await Order.findByIdAndUpdate(req.params.id, {
      status: 'refunded',
      refundAmount: amount,
      paymentStatus: 'refunded',
      $push: { trackingUpdates: { status: 'refunded', message: `Admin refund of Le ${amount.toLocaleString()}. Reason: ${reason || 'none'}`, timestamp: new Date(), updatedBy: req.user._id } },
    });

    AuditLog.create({ admin: req.user._id, action: 'ADJUST_WALLET', targetId: order.buyer || req.user._id, targetModel: 'User', details: `Force-refunded Le ${amount.toLocaleString()} for order #${order.customOrderId}. Reason: ${reason || 'none'}`, ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'Refunded', amount });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Disputes ──────────────────────────────────────────────────────────────────
exports.getDisputes = async (req, res) => {
  try {
    const filter = { 'complaint.status': { $nin: ['none', null] } };
    if (req.query.status) filter['complaint.status'] = req.query.status;
    const orders = await Order.find(filter).populate('buyer', 'name email').populate('seller', 'name storeName').sort({ updatedAt: -1 }).limit(50);
    const disputes = orders.map((o) => ({
      _id: o._id, orderId: o._id, customOrderId: o.customOrderId,
      subject: o.complaint?.subject, status: o.complaint?.status,
      buyerName: o.buyer?.name, sellerName: o.seller?.storeName || o.seller?.name,
      createdAt: o.complaint?.createdAt || o.updatedAt,
    }));
    res.json({ disputes, total: disputes.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.resolveDispute = async (req, res) => {
  try {
    // `clawback` defaults to true: when the admin refunds a buyer, the same
    // amount is pulled back from whatever the seller received/would receive
    // for this order — mirroring the seller-initiated resolveComplaint flow
    // in orderController.js, which already does this correctly. Previously
    // this endpoint only ever credited the buyer and never touched the
    // seller at all, so the seller kept 100% of the order *and* the buyer
    // got refunded — the platform silently ate the entire cost on every
    // single admin-resolved refund. Set clawback:false explicitly for cases
    // where the seller genuinely wasn't at fault and the platform should
    // cover it as a goodwill/insurance refund instead.
    const { status, resolution, refundAmount, note, clawback = true } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const updateFields = {
      'complaint.status': status,
      'complaint.resolution': resolution,
      'complaint.resolvedBy': req.user._id,
      'complaint.resolvedAt': new Date(),
      'complaint.refundAmount': refundAmount || 0,
    };
    if (status === 'refunded') updateFields.status = 'refunded';
    if (status === 'resolved') updateFields.status = 'resolved';

    const amount = Number(refundAmount) || 0;

    if (amount > 0 && clawback) {
      const seller = await User.findById(order.seller);
      if (seller) {
        seller.wallet = seller.wallet || { available: 0, pending: 0, platformFeesPaid: 0 };
        const net = order.subtotal - (order.platformFee || 0);
        // Never claw back more than the seller actually received for this
        // order, and never drive either bucket negative — a refund can't
        // take money the seller was never actually given.
        const wasReleased = !!order.deliveredAt;
        const clawbackAmount = Math.min(amount, net);
        if (wasReleased) {
          seller.wallet.available = Math.max(0, (seller.wallet.available || 0) - clawbackAmount);
        } else {
          seller.wallet.pending = Math.max(0, (seller.wallet.pending || 0) - clawbackAmount);
        }
        await seller.save({ validateBeforeSave: false });
        Ledger.create({
          user: seller._id, amount: -clawbackAmount, type: 'REFUND', status: 'COMPLETED',
          referenceId: order._id, referenceModel: 'Order',
          description: `Dispute refund clawback for order #${order.customOrderId}`,
          balanceAfter: wasReleased ? seller.wallet.available : seller.wallet.pending,
        }).catch(() => {});
      }
    }

    // If a refundAmount is specified, actually credit the buyer's wallet —
    // the previous version recorded the number on the order document but
    // never touched the buyer's wallet, making every "refunded" dispute
    // resolution a financial no-op: the buyer was told they'd been refunded
    // but never actually received the money.
    if (amount > 0 && order.buyer) {
      const buyer = await User.findById(order.buyer);
      if (buyer) {
        buyer.wallet = buyer.wallet || { available: 0, pending: 0 };
        buyer.wallet.available += amount;
        await buyer.save({ validateBeforeSave: false });
        Ledger.create({
          user: buyer._id, amount, type: 'REFUND', status: 'COMPLETED',
          referenceId: order._id, referenceModel: 'Order',
          description: `Dispute refund for order #${order.customOrderId}${clawback ? '' : ' (platform-funded, no seller clawback)'}`,
          balanceAfter: buyer.wallet.available,
        }).catch(() => {});
      }
    }

    const o = await Order.findByIdAndUpdate(
      req.params.id,
      {
        ...updateFields,
        $push: { trackingUpdates: { status: status || 'resolved', message: `Dispute resolved by admin: ${resolution || note || ''}`, timestamp: new Date(), updatedBy: req.user._id } },
      },
      { new: true }
    );

    AuditLog.create({ admin: req.user._id, action: 'RESOLVE_DISPUTE', targetId: order._id, targetModel: 'User', details: `Resolved dispute for order #${order.customOrderId} as '${status}'${refundAmount ? `. Refunded Le ${Number(refundAmount).toLocaleString()}.` : ''} ${resolution || ''}`, ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'Resolved', order: o });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Payouts (embedded on seller users) ────────────────────────────────────────
exports.getPayouts = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const match = status ? { 'payoutRequests.status': status } : { 'payoutRequests.0': { $exists: true } };
    const sellers = await User.find(match)
      .select('name storeName email phone payoutRequests')
      .limit(200) // hard ceiling — payout queues are processed in batches
      .lean();
    const payouts = [];
    sellers.forEach((s) => {
      (s.payoutRequests || []).forEach((p) => {
        if (!status || p.status === status) payouts.push({ _id: p._id, sellerId: { _id: s._id, name: s.name, storeName: s.storeName, email: s.email, phone: s.phone }, amount: p.amount, method: p.method, status: p.status, createdAt: p.createdAt });
      });
    });
    payouts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const paginated = payouts.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    res.json({ payouts: paginated, total: payouts.length, page: pageNum, pages: Math.ceil(payouts.length / limitNum) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.approvePayout = async (req, res) => {
  try {
    const seller = await User.findOne({ 'payoutRequests._id': req.params.id });
    if (!seller) return res.status(404).json({ message: 'Not found' });
    const payout = seller.payoutRequests.find((p) => p._id.toString() === req.params.id);
    if (!payout) return res.status(404).json({ message: 'Not found' });
    if (payout.status !== 'pending') {
      return res.status(400).json({ message: `This payout has already been ${payout.status}` });
    }

    // Atomically flip this specific payout's status from pending ->
    // completed AND debit wallet.pending in the same update — the filter
    // re-checks payoutRequests.status === 'pending' at write time, so a
    // concurrent second approval (or a retried request) finds nothing to
    // match and gets a clean 404 instead of debiting pending a second time.
    const updated = await User.findOneAndUpdate(
      { _id: seller._id, payoutRequests: { $elemMatch: { _id: payout._id, status: 'pending' } } },
      {
        $set: { 'payoutRequests.$[elem].status': 'completed' },
        $inc: { 'wallet.pending': -payout.amount },
      },
      { arrayFilters: [{ 'elem._id': payout._id }], new: true }
    );
    if (!updated) return res.status(409).json({ message: 'This payout was already processed by another request' });

    sendMoneyAlert({
      emailFn: () => sendPayoutEmail(seller.email, seller.name, payout.amount, payout.method, payout._id.toString()),
      whatsapp: seller.phone ? { to: seller.phone, message: buildPayoutMessage({ name: seller.name, amount: payout.amount, method: payout.method, ref: payout._id.toString() }) } : null,
    }).catch(() => {});

    AuditLog.create({ admin: req.user._id, action: 'ADJUST_WALLET', targetId: seller._id, targetModel: 'User', details: `Approved payout of Le ${payout.amount.toLocaleString()} via ${payout.method}`, ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'Payout approved', payout: { ...payout.toObject(), status: 'completed' } });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.rejectPayout = async (req, res) => {
  try {
    const seller = await User.findOne({ 'payoutRequests._id': req.params.id });
    if (!seller) return res.status(404).json({ message: 'Not found' });
    const payout = seller.payoutRequests.find((p) => p._id.toString() === req.params.id);
    if (!payout) return res.status(404).json({ message: 'Not found' });
    if (payout.status !== 'pending') {
      return res.status(400).json({ message: `This payout has already been ${payout.status}` });
    }

    // Same atomic guard as approvePayout — without re-checking
    // status:'pending' at write time, a double-click or retried request
    // would refund `payout.amount` back to `available` twice, creating
    // money that was never actually held.
    const updated = await User.findOneAndUpdate(
      { _id: seller._id, payoutRequests: { $elemMatch: { _id: payout._id, status: 'pending' } } },
      {
        $set: { 'payoutRequests.$[elem].status': 'cancelled' },
        $inc: { 'wallet.available': payout.amount, 'wallet.pending': -payout.amount },
      },
      { arrayFilters: [{ 'elem._id': payout._id }], new: true }
    );
    if (!updated) return res.status(409).json({ message: 'This payout was already processed by another request' });

    AuditLog.create({ admin: req.user._id, action: 'ADJUST_WALLET', targetId: seller._id, targetModel: 'User', details: `Rejected payout of Le ${payout.amount.toLocaleString()} via ${payout.method}; refunded to available balance`, ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'Payout rejected', payout: { ...payout.toObject(), status: 'cancelled' } });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── BNPL / Loans ───────────────────────────────────────────────────────────────
exports.getBnplPlans = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const [plans, total] = await Promise.all([
      BnplPlan.find(filter).populate('userId', 'name email phone').populate('orderId', 'customOrderId total').sort({ createdAt: -1 }).limit(+limit).skip((+page - 1) * +limit),
      BnplPlan.countDocuments(filter),
    ]);
    res.json({ plans, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Previously a single PATCH /admin/bnpl/:id set `status` to whatever the
// frontend sent, with zero validation of the transition and zero side
// effects — no wallet.bnplOutstanding reversal on cancel, no eligibility
// restoration on forgiving a default, no ledger entry, no notification, no
// audit trail. It also matched the BnplModule frontend having no action
// buttons at all, just a read-only status badge — this is what actually
// backs the three real actions added there now.

exports.forgiveBnplDefault = async (req, res) => {
  try {
    const plan = await BnplPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    if (plan.status !== 'defaulted') return res.status(400).json({ message: 'Only a defaulted plan can be forgiven' });

    const remaining = plan.instalmentSchedule.filter((i) => i.status !== 'paid');
    plan.status = remaining.length === 0 ? 'paid' : 'active';
    // Un-defaulting an instalment that's still technically past its due
    // date would just get re-flagged 'overdue' again by tomorrow's sweep,
    // which is correct — forgiving the default doesn't erase that the
    // payment really is late, it just restores the account rather than
    // leaving it permanently locked out.
    await plan.save();

    // Mirrors setBnplEligibility's own pattern — restoring access after an
    // admin-reviewed forgiveness is exactly the kind of decision that
    // should be sticky against the automatic spend/tenure re-check the same
    // way a manual grant is, not silently reset to 'auto' where a later
    // default could re-trigger the exact same cycle without another human
    // looking at it first.
    await User.findByIdAndUpdate(plan.userId, {
      bnplEligible: true, bnplEligibilityOverride: 'admin_granted',
      bnplEligibilityUpdatedBy: req.user._id, bnplEligibilityUpdatedAt: new Date(),
    });

    await AuditLog.create({ admin: req.user._id, action: 'FORGIVE_BNPL_DEFAULT', targetId: plan._id, targetModel: 'BnplPlan', details: req.body.note || '', ipAddress: req.ip }).catch(() => {});
    await createNotification(req.app.get('io'), {
      userId: plan.userId, type: 'system', title: 'BNPL default forgiven',
      message: 'Your defaulted BNPL plan has been reviewed and reinstated. Buy Now Pay Later access has been restored.',
    }).catch(() => {});

    res.json({ message: 'Default forgiven, plan reinstated', plan });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.cancelBnplPlan = async (req, res) => {
  try {
    const plan = await BnplPlan.findById(req.params.id).populate('orderId', 'customOrderId');
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    if (['paid', 'cancelled'].includes(plan.status)) return res.status(400).json({ message: `Plan is already ${plan.status}` });

    // The unpaid remainder (whatever's left on the schedule) is what
    // wallet.bnplOutstanding was incremented by at /apply time — this is
    // the reversal that was missing from the old raw status setter. Without
    // it, cancelling a plan (e.g. because the underlying order was
    // refunded) left the user's outstanding-BNPL-debt figure permanently
    // inflated by an amount they no longer actually owe.
    const outstanding = plan.instalmentSchedule.filter((i) => i.status !== 'paid').reduce((sum, i) => sum + i.amount, 0);
    plan.status = 'cancelled';
    await plan.save();
    if (outstanding > 0) {
      await User.findByIdAndUpdate(plan.userId, { $inc: { 'wallet.bnplOutstanding': -outstanding } });
    }

    await AuditLog.create({ admin: req.user._id, action: 'CANCEL_BNPL_PLAN', targetId: plan._id, targetModel: 'BnplPlan', details: req.body.reason || '', ipAddress: req.ip, metadata: { outstandingReversed: outstanding } }).catch(() => {});
    await createNotification(req.app.get('io'), {
      userId: plan.userId, type: 'system', title: 'BNPL plan cancelled',
      message: `Your BNPL plan for order ${plan.orderId?.customOrderId ?? ''} has been cancelled by support.${outstanding > 0 ? ` Remaining balance of Le ${outstanding.toLocaleString()} has been cleared.` : ''}`,
    }).catch(() => {});

    res.json({ message: 'Plan cancelled', plan });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.waiveBnplLateFees = async (req, res) => {
  try {
    const plan = await BnplPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    const waived = plan.totalLateFees || 0;
    if (waived === 0) return res.status(400).json({ message: 'No late fees on this plan to waive' });

    for (const inst of plan.instalmentSchedule) {
      if (inst.status !== 'paid' && inst.lateFee > 0) {
        inst.amount -= inst.lateFee; // undo the sweep's inflation, back to the original instalment amount
        inst.lateFee = 0;
      }
    }
    plan.totalLateFees = 0;
    await plan.save();

    await Ledger.create({
      user: plan.userId, amount: -waived, type: 'ADJUSTMENT', status: 'COMPLETED',
      referenceId: plan._id, referenceModel: 'BnplPlan', description: `BNPL late fees waived by admin`,
    });
    await AuditLog.create({ admin: req.user._id, action: 'WAIVE_BNPL_LATE_FEE', targetId: plan._id, targetModel: 'BnplPlan', details: req.body.note || '', ipAddress: req.ip, metadata: { waived } }).catch(() => {});
    await createNotification(req.app.get('io'), {
      userId: plan.userId, type: 'system', title: 'Late fees waived',
      message: `Le ${waived.toLocaleString()} in BNPL late fees have been waived on your plan.`,
    }).catch(() => {});

    res.json({ message: 'Late fees waived', plan });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getLoans = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const [loans, total] = await Promise.all([
      Loan.find(filter).populate('userId', 'name email phone creditScore').sort({ createdAt: -1 }).limit(+limit).skip((+page - 1) * +limit),
      Loan.countDocuments(filter),
    ]);
    res.json({ loans, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.reviewLoan = async (req, res) => {
  try {
    const { status, adminNote, approvedAmount } = req.body;
    const loan = await Loan.findById(req.params.id).populate('userId');
    if (!loan) return res.status(404).json({ message: 'Not found' });
    loan.status = status;
    loan.adminNote = adminNote;
    loan.reviewedBy = req.user._id;
    loan.reviewedAt = new Date();
    if (approvedAmount) loan.approvedAmount = approvedAmount;
    if (status === 'approved') {
      const principal = approvedAmount || loan.amount;
      loan.remainingAmount = principal * (1 + loan.interestRate);
      loan.monthlyRepayment = Math.ceil(loan.remainingAmount / Math.max(1, Math.ceil(loan.termDays / 30)));
      loan.dueDate = new Date(Date.now() + loan.termDays * 24 * 60 * 60 * 1000);
    }
    if (status === 'disbursed') {
      const user = await User.findById(loan.userId._id);
      const amount = loan.approvedAmount || loan.amount;
      user.wallet.available = (user.wallet.available || 0) + amount;
      // loanOutstanding is the user-facing "what you still owe" figure
      // (app/wallet.tsx renders it directly). It must track the same
      // quantity that repayments pay down — remainingAmount, which
      // already includes interest (set two lines up in the 'approved'
      // branch: principal * (1 + interestRate)). Crediting it with just
      // the bare principal here meant it undercounted real debt for
      // every interest-bearing loan and hit zero — silently clamped by
      // the repay handler below — before the loan was actually repaid.
      user.wallet.loanOutstanding = (user.wallet.loanOutstanding || 0) + (loan.remainingAmount || amount);
      await user.save({ validateBeforeSave: false });
      loan.disbursedAt = new Date();
      sendMoneyAlert({
        emailFn: () => sendWalletAdjustmentEmail(user.email, user.name, amount, `Loan disbursed — due ${new Date(loan.dueDate).toLocaleDateString('en-GB')}`, user.wallet.available),
        whatsapp: user.phone ? { to: user.phone, message: buildWalletAdjustmentMessage({ name: user.name, amount, reason: `Loan disbursed — due ${new Date(loan.dueDate).toLocaleDateString('en-GB')}`, balanceAfter: user.wallet.available }) } : null,
      }).catch(() => {});
    }
    await loan.save();
    await createNotification(req.app.get('io'), { userId: loan.userId._id, type: status === 'approved' ? 'loan_approved' : 'system', title: status === 'approved' ? 'Loan Approved! 🎉' : `Loan ${status}`, message: adminNote || `Your loan application has been ${status}.` });
    res.json({ message: `Loan ${status}`, loan });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Ads ────────────────────────────────────────────────────────────────────────
exports.createAd = async (req, res) => {
  try {
    const ad = await Ad.create({ ...req.body, advertiserId: req.user._id, status: 'active' });
    const io = req.app.get('io');
    // Broadcast ad notification to all users
    broadcastNotification(io, {
      type: 'ad',
      title: '📢 ' + (ad.title || 'Featured Deal'),
      message: ad.description || 'Check out the latest featured promotion on WimaKit!',
      data: {
        adId: ad._id.toString(),
        link: ad.link || ad.ctaUrl || '',
      },
    }).catch(() => {});
    res.status(201).json({ message: 'Ad created', ad });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getAds = async (req, res) => {
  try {
    const { status, placement, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (placement) filter.placement = placement;
    const [ads, total] = await Promise.all([
      Ad.find(filter).populate('advertiserId', 'name email storeName').sort({ createdAt: -1 }).limit(+limit).skip((+page - 1) * +limit),
      Ad.countDocuments(filter),
    ]);
    res.json({ ads, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateAdStatus = async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (ad && req.body.status === 'active') {
      const io = req.app.get('io');
      broadcastNotification(io, {
        type: 'ad',
        title: '📢 ' + (ad.title || 'Featured Deal'),
        message: ad.description || 'Check out the latest featured promotion on WimaKit!',
        data: {
          adId: ad._id.toString(),
          link: ad.link || ad.ctaUrl || '',
        },
      }).catch(() => {});
    }
    res.json({ message: 'Updated', ad });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Community moderation ───────────────────────────────────────────────────────
exports.getReportedPosts = async (req, res) => {
  try {
    const posts = await CommunityPost.find({ reportCount: { $gt: 0 } }).populate('author', 'name email profileSlug').sort({ reportCount: -1 }).limit(50);
    res.json({ posts });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.hidePost = async (req, res) => {
  try {
    const post = await CommunityPost.findByIdAndUpdate(req.params.id, { isHidden: true, hiddenReason: req.body.reason, hiddenBy: req.user._id }, { new: true });
    res.json({ message: 'Post hidden', post });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.unhidePost = async (req, res) => {
  try {
    const post = await CommunityPost.findByIdAndUpdate(req.params.id, { isHidden: false, $unset: { hiddenReason: 1, hiddenBy: 1 } }, { new: true });
    res.json({ message: 'Post unhidden', post });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.pinPost = async (req, res) => {
  try {
    await CommunityPost.updateMany({}, { isPinned: false });
    const post = await CommunityPost.findByIdAndUpdate(req.params.id, { isPinned: true }, { new: true });
    if (post) {
      const io = req.app.get('io');
      const snippet = post.content?.length > 100 ? post.content.slice(0, 97) + '...' : (post.content || 'Check out the pinned post!');
      broadcastNotification(io, {
        type: 'system',
        title: '📌 Pinned Post: ' + (post.title || 'Community Highlight'),
        message: snippet,
        data: {
          postId: post._id.toString(),
          url: `/community/post/${post._id}`,
        },
      }).catch(() => {});
    }
    res.json({ message: 'Post pinned', post });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Broadcast ───────────────────────────────────────────────────────────────────
exports.sendBroadcast = async (req, res) => {
  try {
    const { title, message, role, type = 'system' } = req.body;
    const io = req.app.get('io');
    const result = await broadcastNotification(io, {
      title,
      message,
      role,
      type,
    });
    res.json({ message: `Broadcast sent to ${result.count || 0} users` });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Warnings list ────────────────────────────────────────────────────────────────
exports.getWarnings = async (req, res) => {
  try {
    const warnings = await Warning.find().populate('userId', 'name email').populate('createdBy', 'name').sort({ createdAt: -1 }).limit(50);
    res.json({ warnings });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Wallets ────────────────────────────────────────────────────────────────────
exports.getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('name wallet');
    if (!user) return res.status(404).json({ message: 'Not found' });
    res.json({ wallet: user.wallet, transactions: [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.freezeWallet = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.userId, { 'wallet.status': 'frozen' });
    res.json({ message: 'Wallet frozen' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.unfreezeWallet = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.userId, { 'wallet.status': 'active' });
    res.json({ message: 'Wallet unfrozen' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.adjustBalance = async (req, res) => {
  try {
    const { reason } = req.body;
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ message: 'A valid non-zero numeric amount is required (negative to deduct)' });
    }
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'Not found' });
    user.wallet = user.wallet || { available: 0, pending: 0 };
    user.wallet.available = Math.max(0, (user.wallet.available || 0) + amount);
    await user.save({ validateBeforeSave: false });
    Ledger.create({ user: user._id, amount, type: 'ADJUSTMENT', status: 'COMPLETED', referenceId: req.user._id, referenceModel: 'User', description: reason || 'Admin balance adjustment', balanceAfter: user.wallet.available }).catch(() => {});
    AuditLog.create({ admin: req.user._id, action: 'ADJUST_WALLET', targetId: user._id, targetModel: 'User', details: `Adjusted balance by Le ${amount > 0 ? '+' : ''}${amount.toLocaleString()}. Reason: ${reason || 'none'}`, ipAddress: req.ip }).catch(() => {});
    sendMoneyAlert({
      emailFn: () => sendWalletAdjustmentEmail(user.email, user.name, amount, reason, user.wallet.available),
      whatsapp: user.phone ? { to: user.phone, message: buildWalletAdjustmentMessage({ name: user.name, amount, reason, balanceAfter: user.wallet.available }) } : null,
    }).catch(() => {});
    res.json({ message: 'Balance adjusted', wallet: user.wallet });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Audit logs (v3 alias) ──────────────────────────────────────────────────────
exports.getAuditLogsV3 = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, admin } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (admin) filter.admin = admin;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('admin', 'name email role')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ logs, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Public Ads ───────────────────────────────────────────────────────────────
exports.getPublicAds = async (req, res, next) => {
  try {
    const ads = await Ad.find({ status: 'active' }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, ads });
  } catch (err) { next(err); }
};

// ════════════════════════════════════════════════════════════════════════════
// ─── Platform Escrow ──────────────────────────────────────────────────────────
// The admin Escrow tab (EscrowModule in app/admin/index.tsx) was already built
// against adminApi.escrow()/releaseEscrow()/refundEscrow(), but no backend
// route or controller for any of the three ever existed — every request from
// that tab was a 404. These fill that gap using the existing
// order.platformPayment fields (isPlatformEscrow / buyerPaidAt / sellerPaidAt).
//
// IMPORTANT — this used to also pay the seller directly out of this endpoint
// (using an incorrect formula that overpaid by the delivery fee, on top of
// the seller *already* being auto-paid a second time whenever the order
// later reached 'delivered' — the normal delivery flow moves
// subtotal-platformFee from pending to available for every order regardless
// of payment method, with no awareness of this admin action). The seller
// should only ever be paid once, through that single existing path. This
// endpoint's real job is just to confirm the buyer's payment claim is
// genuine — updateOrderStatus now refuses to mark a platform-escrow order
// 'delivered' until that confirmation exists, which is what actually
// prevents an unverified order from being paid out.
// ════════════════════════════════════════════════════════════════════════════

// Orders where the buyer claims to have paid the platform directly, but an
// admin hasn't confirmed that claim yet. This is the actionable queue.
exports.getEscrow = async (req, res) => {
  try {
    const filter = {
      'platformPayment.isPlatformEscrow': true,
      'platformPayment.buyerPaidAt': { $ne: null },
      'platformPayment.verifiedAt': null,
      status: { $nin: ['cancelled', 'refunded'] },
    };
    const held = await Order.find(filter)
      .populate('buyer', 'name')
      .populate('seller', 'name storeName')
      .sort({ createdAt: -1 })
      .lean();
    const totalHeld = held.reduce((sum, o) => sum + (o.total || 0), 0);

    // Secondary, informational-only list: already verified, just waiting on
    // the delivery to actually happen (at which point payout is automatic).
    const verifiedAwaitingDelivery = await Order.find({
      'platformPayment.isPlatformEscrow': true,
      'platformPayment.verifiedAt': { $ne: null },
      status: { $nin: ['cancelled', 'refunded', 'delivered', 'completed'] },
    }).populate('buyer', 'name').populate('seller', 'name storeName').sort({ createdAt: -1 }).lean();

    res.json({ held, totalHeld, verifiedAwaitingDelivery });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Confirms the buyer's payment claim is genuine. Deliberately does NOT touch
// any wallet — the seller is still paid exactly once, automatically, by the
// existing delivery-confirmation flow, exactly like every other payment
// method. This just unlocks the 'delivered' transition (see the guard in
// updateOrderStatus) for this specific order.
exports.verifyEscrowPayment = async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.orderId, 'platformPayment.isPlatformEscrow': true, 'platformPayment.verifiedAt': null },
      { $set: { 'platformPayment.verifiedAt': new Date(), 'platformPayment.verifiedBy': req.user._id } },
      { new: true }
    );
    if (!order) return res.status(409).json({ message: 'Order not found, not a platform-escrow order, or already verified' });

    await createNotification(req.app.get('io'), { userId: order.seller, type: 'system', title: 'Payment verified ✅', message: `Payment for order #${order.customOrderId} has been verified. You'll be paid automatically once it's delivered.` });
    if (order.buyer) {
      await createNotification(req.app.get('io'), { userId: order.buyer, type: 'system', title: 'Payment confirmed', message: `We've confirmed your payment for order #${order.customOrderId}. Your order can now proceed.` });
    }

    AuditLog.create({ admin: req.user._id, action: 'VERIFY_ESCROW_PAYMENT', targetId: order._id, targetModel: 'Order', details: `Verified platform-escrow payment for order #${order.customOrderId}`, ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'Payment verified', order });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Refund the buyer instead of proceeding with the order: credits the
// buyer's wallet with what they paid the platform directly, reverses the
// seller's `pending` balance (every order — including platform-escrow ones —
// credits the seller's pending the full subtotal at checkout; refunding
// without reversing that left it permanently inflated), and marks the order
// refunded. Blocked once the order has actually been delivered — at that
// point the seller has already been paid for real out of `available`, and
// clawing that back needs the dispute-resolution flow instead, not this one.
exports.refundEscrow = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.orderId, 'platformPayment.isPlatformEscrow': true });
    if (!order) return res.status(404).json({ message: 'Not a platform-escrow order' });
    if (order.status === 'refunded' || order.status === 'cancelled') {
      return res.status(409).json({ message: 'Order already settled' });
    }
    if (order.deliveredAt) {
      return res.status(409).json({ message: 'Order already delivered and paid out — use dispute resolution to refund instead' });
    }

    order.status = 'refunded';
    order.paymentStatus = 'refunded';
    order.platformPayment.refundedAt = new Date();
    await order.save({ validateBeforeSave: false });

    const seller = await User.findById(order.seller);
    if (seller) {
      seller.wallet = seller.wallet || { available: 0, pending: 0 };
      seller.wallet.pending = Math.max(0, (seller.wallet.pending || 0) - order.subtotal);
      await seller.save({ validateBeforeSave: false });
    }

    if (order.buyer) {
      const buyer = await User.findById(order.buyer);
      if (buyer) {
        buyer.wallet = buyer.wallet || { available: 0, pending: 0 };
        buyer.wallet.available = (buyer.wallet.available || 0) + (order.total || 0);
        await buyer.save({ validateBeforeSave: false });
        Ledger.create({ user: buyer._id, amount: order.total || 0, type: 'ESCROW_REFUND', status: 'COMPLETED', referenceId: order._id, referenceModel: 'Order', description: reason || `Escrow refund for order #${order.customOrderId}`, balanceAfter: buyer.wallet.available }).catch(() => {});
        await createNotification(req.app.get('io'), { userId: buyer._id, type: 'system', title: 'Order refunded', message: `Your order #${order.customOrderId} was refunded. Reason: ${reason || 'Admin decision'}` });
      }
    }

    AuditLog.create({ admin: req.user._id, action: 'REFUND_ESCROW', targetId: order._id, targetModel: 'Order', details: `Refunded escrow for order #${order.customOrderId}. Reason: ${reason || 'none'}`, ipAddress: req.ip }).catch(() => {});
    res.json({ message: 'Escrow refunded', order });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
