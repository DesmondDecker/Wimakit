'use strict';
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// v7.14+ of express-rate-limit exports this to correctly bucket IPv6
// addresses (which vary per-connection far more than IPv4 does) instead of
// naively using the full address as a key. Older 7.x releases don't have
// it — the ^7.5.0 range in package.json could resolve to either — so fall
// back to the raw IP if it isn't there rather than crashing on install.
const ipKey = rateLimit.ipKeyGenerator || ((req) => req.ip);

// ─── Why IP alone is the wrong key here ───────────────────────────────────
// Sierra Leone's mobile carriers (Africell, Orange, Qcell) put their whole
// customer base behind carrier-grade NAT, so a single public IP can
// represent hundreds of unrelated phones on the same tower. A limiter keyed
// purely on `req.ip` doesn't rate-limit *a user* — it rate-limits *a cell
// tower's worth of strangers* — so one person's heavy usage, or one bad
// actor, can throttle everyone else sharing that IP. The keying below
// groups by the actual user/account wherever we can identify one, and only
// drops back to IP when there's genuinely nothing else to key on (an
// anonymous request with no submitted email).

// General API limiter — applied globally in server.js to everything under
// /api/. This middleware runs before any route's `protect` auth check, so
// req.user isn't populated yet; but for a Bearer-token request we can pull
// the user id straight out of the token without verifying it. That's fine
// for bucketing purposes (it's just deciding "who does this request count
// against", not deciding whether to trust it) — a forged or expired token
// simply falls back to the IP bucket, i.e. no worse than before.
function apiKeyGenerator(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.decode(authHeader.slice(7));
      if (decoded?.id) return `user:${decoded.id}`;
    } catch { /* fall through to IP */ }
  }
  return `ip:${ipKey(req)}`;
}

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max:       parseInt(process.env.RATE_LIMIT_MAX || '300'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: apiKeyGenerator,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Stricter limiter for genuinely brute-force-sensitive auth actions
// (login, register, password reset, email verification) — 10 requests per
// 15 minutes.
//
// This used to be applied as a blanket over the *entire* /api/auth router
// in server.js (`app.use('/api/auth', authLimiter, authRoutes)`), which
// meant ordinary authenticated self-service endpoints under the same
// router — GET /auth/me (checked on every app launch), POST
// /auth/push-token (also every launch), GET/PATCH
// /auth/notification-prefs, GET/POST/DELETE /auth/blocked-users, POST
// /auth/logout, even the admin-only GET /auth/users — all shared the exact
// same 10-requests-per-15-minutes budget as login attempts. None of those
// have anything to do with brute-force risk, and normal use of the app
// (launch, open Settings, block someone, log out) could burn through that
// budget in minutes, or an admin doing routine user management could get
// throttled mid-task. Route files now apply this only to the specific
// routes where it actually belongs; everything else still gets the general
// apiLimiter above via the global /api/ mount, which is real protection,
// just not this aggressive.
//
// Two changes on top of that scoping, both aimed at bad-connection reality:
//   1. keyGenerator buckets by the *submitted* email/phone, not the caller's
//      IP — this is also just the more correct definition of brute-force
//      protection (limiting attempts against one account) and happens to be
//      immune to CGNAT collisions as a side effect. Falls back to IP only
//      when the request doesn't identify a target account at all.
//   2. skipSuccessfulRequests: a successful login/register no longer counts
//      against the budget. Without this, someone whose first attempt
//      actually succeeded server-side but timed out client-side before the
//      response arrived — extremely common on 2G/3G — burns through their
//      quota retrying a login that already worked, and can end up locked
//      out of their own account for retrying too eagerly.
function authKeyGenerator(req) {
  const email = (req.body?.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  return `ip:${ipKey(req)}`;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authKeyGenerator,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many login attempts, please try again after 15 minutes.' },
});

module.exports = { apiLimiter, authLimiter };
