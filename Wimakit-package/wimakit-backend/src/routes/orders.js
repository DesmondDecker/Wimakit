const express = require('express');
const { protect, restrictTo: authorize } = require('../middleware/auth');
const {
  createOrder,
  getOrder,
  getMyOrders,
  updateOrderStatus,
  deleteOrder,
  reportIssue,
  resolveComplaint,
  getPlatformStats,
  shareOrderWhatsApp,
  markBuyerPaid,
  cancelOrder,
  verifyDelivery,
} = require('../controllers/orderController');

const router = express.Router();

// Guest checkout — no auth required (protect middleware made optional via tryProtect below)
const tryProtect = (req, res, next) => {
  // If Authorization header present, verify token. Otherwise continue as guest.
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return protect(req, res, next);
  }
  next();
};

router.route('/')
  .post(tryProtect, createOrder);         // authenticated OR guest

router.route('/my')
  .get(protect, getMyOrders);            // authenticated only

router.route('/stats/platform')
  .get(protect, authorize('admin'), getPlatformStats);

// ─── Seller & Rider order lists ──────────────────────────────────────────────
// IMPORTANT: these literal routes must be registered BEFORE '/:id' below.
// Express matches routes in registration order, and '/:id' is a wildcard
// that matches any single path segment — including the literal strings
// "seller" and "rider". Previously these were registered after '/:id',
// so GET /api/orders/seller and GET /api/orders/rider were silently
// swallowed by the '/:id' handler (treating "seller"/"rider" as an order
// ID) and always returned 404 instead of reaching getMyOrders.
router.route('/seller')
  .get(protect, authorize('seller', 'admin'), getMyOrders);   // reuse with role filter

router.route('/rider')
  .get(protect, authorize('rider', 'admin'), getMyOrders);    // reuse with role filter

router.route('/:id')
  .get(protect, getOrder)
  .put(protect, authorize('seller', 'admin', 'rider'), updateOrderStatus)  // legacy compat
  .delete(protect, authorize('admin'), deleteOrder);

// Preferred: explicit /status sub-route
router.route('/:id/status')
  .put(protect, authorize('seller', 'admin', 'rider'), updateOrderStatus);

router.route('/:id/report')
  .post(protect, reportIssue);

router.route('/:id/resolve')
  .put(protect, authorize('seller', 'admin'), resolveComplaint);

// WhatsApp sharing — accessible to authenticated users
router.route('/:id/whatsapp')
  .post(tryProtect, shareOrderWhatsApp);

// Platform payment confirmation (buyer paid to platform mobile money)
// Uses tryProtect (not a hard `protect`) because guest checkout is allowed
// to use platform escrow — markBuyerPaid itself verifies ownership: an
// authenticated caller must be the order's buyer, and a guest order is
// matched against the phone number given at checkout instead.
router.route('/:id/mark-paid')
  .post(tryProtect, markBuyerPaid);


// ─── Cancel ──────────────────────────────────────────────────────────────────
router.route('/:id/cancel')
  .post(protect, cancelOrder);

// ─── Verify delivery (buyer confirms receipt) ────────────────────────────────
router.route('/:id/verify-delivery')
  .post(protect, verifyDelivery);

module.exports = router;
