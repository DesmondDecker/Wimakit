'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/deliveryPricingController');
const { protect, restrictTo } = require('../middleware/auth');

const adminOnly = [protect, restrictTo('admin')];

// ─── Public endpoints ─────────────────────────────────────────────────────────
router.post('/calculate',      ctrl.calculateFee);
router.get ('/locations',      ctrl.getLocations);
router.get ('/distance',       ctrl.getDistance);
router.get ('/nearest',        ctrl.getNearestLocation);
router.post('/optimise-route', protect, ctrl.optimiseRoute);

// ─── Admin endpoints ──────────────────────────────────────────────────────────
router.get  ('/admin/config',                                      ...adminOnly, ctrl.getDeliveryConfig);
router.put  ('/admin/config',                                      ...adminOnly, ctrl.updateDeliveryConfig);
router.patch('/admin/config/per-km-rate',                          ...adminOnly, ctrl.updatePerKmRate);
router.post ('/admin/config/zones',                                ...adminOnly, ctrl.updateZone);
router.patch('/admin/config/zones/:district/surge',                ...adminOnly, ctrl.toggleSurge);
router.get  ('/admin/analytics',                                   ...adminOnly, ctrl.getDeliveryAnalytics);

module.exports = router;
