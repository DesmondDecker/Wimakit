'use strict';

const express  = require('express');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const { body, validationResult } = require('express-validator');
const User     = require('../models/User');
const { protect, restrictTo: authorize } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');
const logger   = require('../utils/logger');
const email    = require('../utils/email');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const signToken = (id, secret, expiresIn) =>
  jwt.sign({ id }, secret, { expiresIn });

// Refresh tokens were never validated against anything stored server-side —
// /refresh only checked the JWT signature/expiry, so a stolen refresh token
// (or one that should have been killed by logout or a password change) stayed
// valid for its full 90-day life no matter what. Hashing it and persisting the
// hash on the user lets /refresh, /logout, and password changes actually
// revoke a token instead of just deleting the client-side cookie.
const sendTokens = async (res, user, statusCode = 200) => {
  const accessToken  = signToken(user._id, process.env.JWT_SECRET, process.env.JWT_EXPIRES_IN || '15m');
  const refreshToken = signToken(user._id, process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_EXPIRES_IN || '90d');

  const hashedRefresh = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await User.findByIdAndUpdate(user._id, { refreshToken: hashedRefresh }, { validateBeforeSave: false });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 90 * 24 * 60 * 60 * 1000,
  });

  // CSRF gap: the refresh cookie uses sameSite:'none' (required so the
  // mobile/web client can call the API cross-origin), which means the
  // browser will attach it on ANY cross-site request — including a blind
  // POST from a malicious page the user happens to have open. That page
  // can't read this csrfToken cookie (browsers block cross-origin cookie
  // reads), so it can't reproduce the value in the X-CSRF-Token header that
  // requireCsrfHeader() checks below. A same-origin client, by contrast, can
  // read the cookie and echo it back, since it's not httpOnly.
  const csrfToken = crypto.randomBytes(24).toString('hex');
  res.cookie('csrfToken', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 90 * 24 * 60 * 60 * 1000,
  });

  return res.status(statusCode).json({
    success:      true,
    accessToken,
    refreshToken,
    csrfToken,
    user:         user.toPublicJSON(),
  });
};

/**
 * Double-submit CSRF check for cookie-based refresh/logout. Only applies when
 * the request is actually relying on the cookie (no Authorization header /
 * no body refreshToken) — a mobile client that sends the refresh token
 * explicitly in the body isn't vulnerable to a browser-driven CSRF in the
 * first place, since there's no ambient cookie for a third-party page to
 * piggyback on.
 */
function requireCsrfHeader(req, res, next) {
  const usingCookieAuth = !!req.cookies?.refreshToken && !req.body?.refreshToken;
  if (!usingCookieAuth) return next();

  const headerToken = req.headers['x-csrf-token'];
  const cookieToken  = req.cookies?.csrfToken;
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({ success: false, message: 'CSRF token missing or invalid' });
  }
  next();
}

/** Generate a raw 32-byte hex token and return both raw (to send) and hashed (to store) */
function makeToken() {
  const raw    = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hashed };
}

// ─── Validation chains ────────────────────────────────────────────────────────
const validateRegister = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['buyer', 'seller', 'rider']),
  body('phone').optional().trim(),
];

const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', authLimiter, validateRegister, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { name, email: rawEmail, password, role: rawRole, phone, storeName, bio, location } = req.body;
    // Never allow self-registration as admin
    const role = ['buyer', 'seller', 'rider'].includes(rawRole) ? rawRole : 'buyer';
    const normalizedEmail = rawEmail.trim().toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    // Build email verification token (24-hour expiry)
    const { raw: verifyRaw, hashed: verifyHashed } = makeToken();

    const userData = {
      name,
      email: normalizedEmail,
      password,
      role: role || 'buyer',
      phone,
      bio,
      location,
      emailVerifyToken:   verifyHashed,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      emailVerified:      false,
    };

    if (role === 'seller') {
      userData.storeName        = storeName || `${name}'s Store`;
      userData.storeDescription = bio;
    }

    const user = await User.create(userData);
    logger.info(`New user registered: ${normalizedEmail} [${role || 'buyer'}]`);

    // Send verification email (non-blocking — don't fail registration if email fails)
    email.sendVerificationEmail(normalizedEmail, name, verifyRaw)
      .then(result => {
        if (!result.success) logger.warn(`[Email] Verification email failed for ${normalizedEmail}: ${result.error}`);
      })
      .catch(err => logger.error('[Email] sendVerificationEmail threw:', err.message));

    await sendTokens(res, user, 201);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', authLimiter, validateLogin, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email: rawEmail, password } = req.body;
    const normalizedEmail = (rawEmail || '').trim().toLowerCase();
    logger.info(`Login attempt: ${normalizedEmail}`);

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      // Logged server-side only — never exposed to the client (the response
      // below stays a generic "Invalid email or password" either way). This
      // is purely so a dev running against freshly seeded data can tell, from
      // their own terminal, whether the problem is "no such user in this DB"
      // (wrong MONGODB_URI / never ran `npm run seed` against this database)
      // vs. a genuine password mismatch, without exposing that distinction
      // to whoever is making the request.
      logger.warn(`Login failed — no user found for ${normalizedEmail}. If you just ran the seed script, confirm MONGODB_URI in .env is the exact same connection string used for both the server and the seed script.`);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    if (!(await user.comparePassword(password))) {
      logger.warn(`Login failed — password mismatch for ${normalizedEmail} (user exists, so this DB connection is correct).`);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.isActive || user.accountStatus === 'banned' || user.accountStatus === 'suspended') {
      const msg = user.accountStatus === 'banned'
        ? 'Your account has been banned. Contact support@wimakit.sl to appeal.'
        : user.accountStatus === 'suspended'
          ? 'Your account is temporarily suspended.'
          : 'Account has been deactivated.';
      return res.status(403).json({ success: false, message: msg });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    logger.info(`User logged in: ${rawEmail}`);
    await sendTokens(res, user);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/verify-email ─────────────────────────────────────────────
// Body: { token }  — raw token from the email link
router.post('/verify-email', authLimiter, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Verification token is required' });

    const hashed = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerifyToken:   hashed,
      emailVerifyExpires: { $gt: Date.now() },
    }).select('+emailVerifyToken +emailVerifyExpires');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Verification link is invalid or has expired. Please request a new one.',
      });
    }

    // Mark verified and clear token
    user.emailVerified      = true;
    user.emailVerifiedAt    = new Date();
    user.emailVerifyToken   = undefined;
    user.emailVerifyExpires = undefined;
    await user.save({ validateBeforeSave: false });

    logger.info(`Email verified: ${user.email}`);

    // Send welcome email after verification
    email.sendWelcomeEmail(user.email, user.name, user.role)
      .catch(err => logger.error('[Email] sendWelcomeEmail threw:', err.message));

    // Return fresh tokens so user is logged in immediately
    await sendTokens(res, user);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/auth/resend-verification ──────────────────────────────────────
// Protected — user must be logged in but unverified
router.post('/resend-verification', authLimiter, protect, async (req, res) => {
  try {
    if (req.user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email already verified' });
    }

    const { raw, hashed } = makeToken();

    await User.findByIdAndUpdate(req.user._id, {
      emailVerifyToken:   hashed,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const result = await email.sendVerificationEmail(req.user.email, req.user.name, raw);

    if (!result.success) {
      logger.warn('[Email] Resend verification failed:', result.error);
      return res.status(500).json({ success: false, message: 'Failed to send email. Please try again shortly.' });
    }

    logger.info(`Verification email resent to: ${req.user.email}`);
    res.json({ success: true, message: 'Verification email sent. Please check your inbox.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
// Body: { email }
router.post(
  '/forgot-password',
  authLimiter,
  [body('email').isEmail().normalizeEmail()],
  async (req, res, next) => {
    try {
      const { email: rawEmail } = req.body;
      const user = await User.findOne({ email: rawEmail });

      // Always return 200 — never leak whether an email exists
      const genericOk = { success: true, message: 'If that email is registered, a reset link has been sent.' };

      if (!user || !user.isActive) {
        return res.json(genericOk);
      }

      const { raw, hashed } = makeToken();
      user.passwordResetToken   = hashed;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save({ validateBeforeSave: false });

      const result = await email.sendPasswordResetEmail(user.email, user.name, raw);

      if (!result.success) {
        // Roll back token so user can retry
        user.passwordResetToken   = undefined;
        user.passwordResetExpires = undefined;
        await user.save({ validateBeforeSave: false });
        logger.error(`[Email] Password reset email failed for ${rawEmail}: ${result.error}`);
        return res.status(500).json({ success: false, message: 'Could not send reset email. Please try again shortly.' });
      }

      logger.info(`Password reset email sent to: ${rawEmail}`);
      res.json(genericOk);
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/auth/reset-password/:token ────────────────────────────────────
// Params: token (raw, from email link)
// Body:   { password }
router.patch(
  '/reset-password/:token',
  authLimiter,
  [body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg });
      }

      const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');

      const user = await User.findOne({
        passwordResetToken:   hashed,
        passwordResetExpires: { $gt: Date.now() },
      }).select('+passwordResetToken +passwordResetExpires');

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Reset link is invalid or has expired. Please request a new one.',
        });
      }

      user.password             = req.body.password;
      user.passwordResetToken   = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      logger.info(`Password reset completed for: ${user.email}`);

      // Send confirmation email (non-blocking)
      email.sendPasswordChangedEmail(user.email, user.name)
        .catch(err => logger.error('[Email] sendPasswordChangedEmail threw:', err.message));

      // Log user in immediately after reset
      await sendTokens(res, user);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/auth/change-password ──────────────────────────────────────────
// Protected — requires current password
router.post('/change-password', authLimiter, protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    // A refresh token captured before this change (e.g. by someone who had
    // the old password and grabbed a token while they still had access)
    // must not keep working afterward — clear the stored hash so any
    // refresh token issued before this point fails the /refresh check.
    await User.findByIdAndUpdate(user._id, { refreshToken: null }, { validateBeforeSave: false });

    logger.info(`Password changed by user: ${user.email}`);

    email.sendPasswordChangedEmail(user.email, user.name)
      .catch(err => logger.error('[Email] sendPasswordChangedEmail threw:', err.message));

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/auth/delete-account ────────────────────────────────────────────
// Self-service soft delete — requires the current password so a hijacked
// session token alone can't nuke an account. Mirrors the same accountStatus
// mechanism the admin ban/suspend flow already uses, so a deleted account is
// blocked at the `protect` middleware exactly like a banned one.
router.post('/delete-account', protect, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Password is incorrect' });
    }
    user.accountStatus = 'deleted';
    user.isActive = false;
    user.refreshToken = null;
    await user.save({ validateBeforeSave: false });
    logger.info(`Account deleted by user: ${user.email}`);
    res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', requireCsrfHeader, async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) return res.status(401).json({ success: false, message: 'No refresh token' });

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || !user.isActive || user.accountStatus === 'banned' || user.accountStatus === 'suspended') {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    // The JWT signature/expiry check above only proves the token was issued
    // by us at some point — it says nothing about whether it's still the
    // CURRENT session. Comparing against the stored hash is what actually
    // lets logout, a password change, or a newer login revoke older tokens;
    // without it, a stolen refresh token keeps working for its full 90-day
    // life no matter what the account owner does.
    const presentedHash = crypto.createHash('sha256').update(token).digest('hex');
    if (!user.refreshToken || user.refreshToken !== presentedHash) {
      return res.status(401).json({ success: false, message: 'Refresh token has been revoked. Please log in again.' });
    }

    await sendTokens(res, user);
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
    next(err);
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', protect, async (req, res) => {
  // Clear the stored hash server-side, not just the cookie — otherwise the
  // refresh token captured before logout (e.g. by malware, a shared device,
  // or a network sniff) still passes JWT verification and keeps working.
  const update = { refreshToken: null };
  // pushTokens was only ever appended to ($addToSet on /push-token) and never
  // cleaned up — a device that logs out (or uninstalls, or the app passes
  // its token here on sign-out) kept receiving push notifications for an
  // account it no longer has a session for. Pull this device's token, if
  // the client sends it, so logging out actually stops pushes to it.
  if (req.body?.pushToken) {
    update.$pull = { pushTokens: req.body.pushToken };
  }
  await User.findByIdAndUpdate(req.user._id, update, { validateBeforeSave: false });
  res.clearCookie('refreshToken');
  res.clearCookie('csrfToken');
  res.json({ success: true, message: 'Logged out successfully' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', protect, (req, res) => {
  res.json({ success: true, user: req.user.toPublicJSON() });
});

// ─── GET/PATCH /api/auth/notification-prefs ────────────────────────────────────
// Backs the three Settings > Notifications switches, which previously had no
// onValueChange at all — see the field comment in models/User.js.
router.get('/notification-prefs', protect, async (req, res) => {
  try {
    res.json({ success: true, notificationPrefs: req.user.notificationPrefs });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/notification-prefs', protect, async (req, res) => {
  try {
    const { orderUpdates, promotions, messages } = req.body;
    const update = {};
    if (typeof orderUpdates === 'boolean') update['notificationPrefs.orderUpdates'] = orderUpdates;
    if (typeof promotions   === 'boolean') update['notificationPrefs.promotions']   = promotions;
    if (typeof messages     === 'boolean') update['notificationPrefs.messages']     = messages;
    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true, runValidators: true });
    res.json({ success: true, notificationPrefs: user.notificationPrefs });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── Blocked Users ──────────────────────────────────────────────────────────────
// Settings > Blocked Users had nothing behind it at all — no screen, no
// field, no route. A blocked user's content is filtered out of this user's
// community feed by communityController (see the $nin blockedUsers check
// added there); this does not (yet) stop the blocked user from viewing this
// user's own public storefront/profile, which is a separate, larger content-
// visibility decision worth its own pass rather than folding in here.
router.get('/blocked-users', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('blockedUsers', 'name avatar storeName role');
    res.json({ success: true, blockedUsers: user.blockedUsers });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/blocked-users/:userId', protect, async (req, res) => {
  try {
    if (req.params.userId === String(req.user._id)) return res.status(400).json({ message: "You can't block yourself" });
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { blockedUsers: req.params.userId } });
    res.json({ success: true, message: 'User blocked' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/blocked-users/:userId', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $pull: { blockedUsers: req.params.userId } });
    res.json({ success: true, message: 'User unblocked' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── POST /api/auth/push-token ────────────────────────────────────────────────
router.post('/push-token', protect, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token required' });
    // $addToSet alone never bounded the array — a user who reinstalls or
    // gets a new device every so often accumulates push tokens forever,
    // including ones Expo/FCM will reject as invalid on every future send.
    // Capping to the most recent 10 keeps the document small and the token
    // list realistic without needing a separate delivery-failure pruning job.
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { pushTokens: token } },
      { new: true }
    );
    if (user && user.pushTokens.length > 10) {
      user.pushTokens = user.pushTokens.slice(-10);
      await user.save({ validateBeforeSave: false });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Admin: List / toggle users ───────────────────────────────────────────────
router.get('/users', protect, authorize('admin'), async (req, res, next) => {
  try {
    const users = await User.find().sort('-createdAt');
    res.json({ success: true, count: users.length, data: users.map(u => u.toPublicJSON()) });
  } catch (err) { next(err); }
});

router.patch('/users/:id/status', protect, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot deactivate an admin' });
    user.isActive = !user.isActive;
    user.accountStatus = user.isActive ? 'active' : 'suspended';
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, isActive: user.isActive, accountStatus: user.accountStatus });
  } catch (err) { next(err); }
});

module.exports = router;
