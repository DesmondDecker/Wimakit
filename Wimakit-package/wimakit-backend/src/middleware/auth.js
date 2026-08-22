'use strict';
const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ─── protect (require login) ──────────────────────────────────────────────────
exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    if (user.accountStatus === 'banned')    return res.status(403).json({ success: false, message: 'Account banned' });
    if (user.accountStatus === 'suspended') return res.status(403).json({ success: false, message: 'Account suspended' });
    if (user.accountStatus === 'deleted')   return res.status(403).json({ success: false, message: 'Account deleted' });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ─── restrictTo / authorize (role guard) ───────────────────────────────────────
const restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
  }
  next();
};
exports.restrictTo = restrictTo;
exports.authorize  = restrictTo; // alias used by admin routes

// ─── optionalAuth ─────────────────────────────────────────────────────────────
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      const user = await User.findById(decoded.id);
      if (user && user.accountStatus !== 'banned') req.user = user;
    }
  } catch {}
  next();
};
