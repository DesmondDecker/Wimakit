'use strict';
const express = require('express');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const Order = require('../models/Order');
const User  = require('../models/User');
const { createNotification } = require('../utils/notifications');
const rateLimit = require('express-rate-limit');

// Caps a buggy/runaway client to a sane GPS ping rate (one ping every few
// seconds is plenty for live tracking) instead of letting it spam thousands
// of writes/socket emits per minute. Keyed per-rider, not per-IP, since
// riders are authenticated and share NAT/cell-tower IPs in practice.
const locationPingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // up to 1 ping every 2s on average
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { message: 'Too many location updates — slow down.' },
});

// GET /api/delivery/available — rider picks up available orders
router.get('/available', protect, restrictTo('rider'), async (req, res) => {
  try {
    const orders = await Order.find({ status: 'awaiting_rider', rider: null })
      .populate('seller','storeName location name')
      .populate('buyer','name phone addresses')
      .sort('-createdAt').limit(20);
    res.json({ success: true, orders });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/delivery/track/:orderId
router.get('/track/:orderId', async (req, res) => {
  try {
    // riderLocation/riderStatus live on the User schema, not Order — there
    // is no such field on Order itself. estimatedDelivery and deliveryOtp
    // were never real fields on either schema; statusHistory was a typo for
    // trackingUpdates, the array this model actually defines.
    const order = await Order.findById(req.params.orderId)
      .select('status deliveryAddress customOrderId trackingUpdates buyer rider deliveredAt')
      .populate('rider', 'name phone avatar riderLocation riderStatus');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ success: true, tracking: order });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/delivery/:orderId/accept — rider accepts
router.post('/:orderId/accept', protect, restrictTo('rider'), async (req, res) => {
  try {
    // Atomic claim: the filter requires rider:null and the right status, so
    // if two riders tap "accept" on the same order within milliseconds of
    // each other, only the first update actually matches a document — the
    // second gets null back and a clear "already taken" response, instead
    // of both succeeding and silently overwriting each other's assignment.
    const order = await Order.findOneAndUpdate(
      { _id: req.params.orderId, rider: null, status: 'awaiting_rider' },
      {
        rider: req.user._id,
        status: 'rider_assigned',
        riderName: req.user.name,
        riderPhone: req.user.phone,
        $push: { trackingUpdates: { status: 'rider_assigned', message: `Assigned to rider ${req.user.name}`, timestamp: new Date() } },
      },
      { new: true }
    ).populate('buyer', 'name phone').populate('seller', 'storeName name location');

    if (!order) {
      return res.status(409).json({ message: 'This delivery has already been accepted by another rider, or is no longer available' });
    }

    await User.findByIdAndUpdate(req.user._id, { riderStatus: 'busy' });

    const io = req.app.get('io');
    if (io) io.to(`order:${order._id}`).emit('order:status_updated', { orderId: order._id, status: 'rider_assigned' });
    if (order.buyer) {
      await createNotification(io, { userId: order.buyer._id || order.buyer, type: 'order_status', title: 'Rider Assigned', message: `${req.user.name} is heading to pick up your order #${order.customOrderId}.` });
    }

    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/delivery/:orderId/reject — rider declines an offered delivery
router.post('/:orderId/reject', protect, restrictTo('rider'), async (req, res) => {
  try {
    // Previously a pure no-op (returned success without touching anything),
    // which is harmless only because nothing ever called it with a specific
    // order in mind on the read side — but it gave riders a "reject" action
    // that silently did nothing, leaving the order looking untouched while
    // the rider believed they'd declined it. Record the decline so this
    // order doesn't keep getting offered to the same rider again, and leave
    // it open for every other rider.
    const { reason } = req.body;
    await Order.findOneAndUpdate(
      { _id: req.params.orderId, status: 'awaiting_rider' },
      { $push: { trackingUpdates: { status: 'awaiting_rider', message: `Declined by rider ${req.user.name}${reason ? ': ' + reason : ''}`, timestamp: new Date() } } }
    );
    res.json({ success: true, message: 'Order declined' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/delivery/:orderId/location — rider's live GPS ping
router.post('/:orderId/location', protect, restrictTo('rider'), locationPingLimiter, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ message: 'lat and lng must be numbers' });
    }
    // riderLocation belongs on the rider's User document (that's where the
    // schema defines it) — writing it onto the Order document, as this did
    // before, silently created a field Order never declared and that
    // nothing else in the app could ever read back out.
    await User.findByIdAndUpdate(req.user._id, { riderLocation: { lat, lng, updatedAt: new Date() } });
    const io = req.app.get('io'); if (io) io.to(`order:${req.params.orderId}`).emit('delivery:location_updated', { orderId: req.params.orderId, lat, lng });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/delivery/earnings
router.get('/earnings', protect, restrictTo('rider'), async (req, res) => {
  try {
    const DeliveryConfig = require('../models/DeliveryConfig');
    const [orders, config] = await Promise.all([
      Order.find({ rider: req.user._id, status: { $in: ['delivered','completed'] } })
        .select('total deliveryFee createdAt').sort({ createdAt: -1 }).limit(30),
      DeliveryConfig.findOne({ isActive: true }).sort({ updatedAt: -1 }).select('riderEarningsPercent').lean(),
    ]);
    const riderPct = (config?.riderEarningsPercent ?? 85) / 100;
    const totalEarnings = orders.reduce((sum, o) => sum + (o.deliveryFee || 0) * riderPct, 0);
    res.json({ success: true, orders, totalEarnings, deliveriesCount: orders.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/delivery/availability
router.post('/availability', protect, restrictTo('rider'), async (req, res) => {
  try {
    const { status } = req.body;
    // The schema's riderStatus enum is ['available','busy','offline'] — the
    // client sends 'online'/'offline' (matching its own UI toggle labels),
    // which previously got written verbatim (findByIdAndUpdate skips schema
    // validators by default, so an invalid enum value doesn't even error,
    // it just silently sits there). Every query elsewhere in the codebase
    // that looks for riderStatus:'available' — the admin live-rider map,
    // delivery pricing's rider-density calculation — would never match a
    // rider who had only ever set themselves to 'online'. Mapping the
    // client's vocabulary onto the schema's here is what actually makes
    // "go online" affect dispatch/admin visibility.
    const mapped = status === 'online' ? 'available' : status === 'offline' ? 'offline' : status;
    if (!['available', 'busy', 'offline'].includes(mapped)) {
      return res.status(400).json({ message: 'status must be online/available, busy, or offline' });
    }
    await User.findByIdAndUpdate(req.user._id, { riderStatus: mapped });
    res.json({ success: true, riderStatus: mapped });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
