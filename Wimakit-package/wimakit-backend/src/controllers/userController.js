'use strict';
const logger = require('../utils/logger');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

exports.getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, role, accountStatus, q } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (accountStatus) filter.accountStatus = accountStatus;
    if (q) {
      const escaped = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } },
      ];
    }
    const pageNum  = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50)); // hard ceiling so a caller can't request an unbounded page size and recreate the original problem

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -emailVerifyToken -passwordResetToken -passwordResetExpires -refreshToken')
        .sort('name')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      User.countDocuments(filter),
    ]);
    res.status(200).json({ success: true, data: users, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    next(err);
  }
};

exports.toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot change the status of an admin account through this endpoint' });
    }

    user.isActive      = !user.isActive;
    user.accountStatus = user.isActive ? 'active' : 'suspended';
    await user.save({ validateBeforeSave: false });

    try {
      await AuditLog.create({
        admin: req.user.id,
        // ACTIVATE_USER/DEACTIVATE_USER are not in the AuditLog action enum,
        // so this insert was silently failing Mongoose validation on every
        // call (caught below and logged, but the audit record never wrote).
        // SUSPEND_USER/UNSUSPEND_USER already exist and cover this exact
        // active <-> suspended transition.
        action: user.isActive ? 'UNSUSPEND_USER' : 'SUSPEND_USER',
        targetId: user._id,
        targetModel: 'User',
        details: `User ${user.name} status changed to ${user.isActive ? 'active' : 'inactive'}`,
        ipAddress: req.ip,
      });
    } catch (auditErr) {
      // Non-fatal: log but don't fail the request
      logger.error('[AuditLog]', auditErr.message);
    }

    res.status(200).json({ success: true, data: user.toPublicJSON() });
  } catch (err) {
    next(err);
  }
};