'use strict';
const logger = require('../utils/logger');
const DeliveryConfig = require('../models/DeliveryConfig');
const {
  calculateDeliveryFee, optimiseMultiStopRoute,
  findNearestLocation, SL_LOCATIONS, getDefaultConfig,
  estimateRoadDistanceKm, getZoneFromCoords,
} = require('../utils/deliveryPricing');
const { createNotification } = require('../utils/notifications');

// Cache config in memory (refreshed every 5 mins)
let cachedConfig = null;
let cacheTime    = 0;
const CACHE_TTL  = 5 * 60 * 1000;

async function getConfig() {
  if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) return cachedConfig;
  let cfg = await DeliveryConfig.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();
  if (!cfg) {
    cfg = getDefaultConfig();
    // Seed defaults on first use
    await DeliveryConfig.create(cfg);
  }
  cachedConfig = cfg;
  cacheTime = Date.now();
  return cfg;
}

function clearCache() { cachedConfig = null; cacheTime = 0; }

// ─── Public: Calculate delivery fee quote ─────────────────────────────────────
// POST /api/delivery/calculate
exports.calculateFee = async (req, res) => {
  try {
    const {
      pickupLat, pickupLng, dropLat, dropLng,
      orderValue = 0, weightKg = 0.5,
      isBulk = false, isRegularCustomer = false,
    } = req.body;

    if (!pickupLat || !pickupLng || !dropLat || !dropLng) {
      return res.status(400).json({ message: 'Pickup and drop coordinates required' });
    }

    const config = await getConfig();
    const result = calculateDeliveryFee({
      pickupLat: +pickupLat, pickupLng: +pickupLng,
      dropLat: +dropLat,     dropLng: +dropLng,
      config, orderValue: +orderValue, weightKg: +weightKg,
      isBulk, isRegularCustomer,
    });

    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Public: Get all SL locations for dropdown / map picker ──────────────────
// GET /api/delivery/locations
exports.getLocations = async (req, res) => {
  try {
    const { q } = req.query;
    let list = Object.entries(SL_LOCATIONS).map(([name, data]) => ({ name, ...data }));
    if (q) {
      const search = q.toLowerCase();
      list = list.filter(l =>
        l.name.toLowerCase().includes(search) ||
        l.district.toLowerCase().includes(search)
      );
    }
    // Sort by name
    list.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, locations: list, total: list.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Public: Distance between two coordinates ─────────────────────────────────
// GET /api/delivery/distance?lat1=&lng1=&lat2=&lng2=
exports.getDistance = async (req, res) => {
  try {
    const { lat1, lng1, lat2, lng2 } = req.query;
    if (!lat1 || !lng1 || !lat2 || !lng2) return res.status(400).json({ message: 'lat1,lng1,lat2,lng2 required' });
    const distanceKm = estimateRoadDistanceKm(+lat1, +lng1, +lat2, +lng2);
    const pickup = findNearestLocation(+lat1, +lng1);
    const drop   = findNearestLocation(+lat2, +lng2);
    res.json({
      success: true,
      distanceKm: +distanceKm.toFixed(2),
      pickup:  pickup  ? { name: pickup.name,  district: pickup.district  } : null,
      dropoff: drop    ? { name: drop.name,    district: drop.district    } : null,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Public: Nearest location to coordinates ─────────────────────────────────
// GET /api/delivery/nearest?lat=&lng=
exports.getNearestLocation = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: 'lat and lng required' });
    const location = findNearestLocation(+lat, +lng);
    const zone     = getZoneFromCoords(+lat, +lng);
    res.json({ success: true, location, zone });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Public: Multi-stop route optimisation (market women) ────────────────────
// POST /api/delivery/optimise-route
exports.optimiseRoute = async (req, res) => {
  try {
    const { stops } = req.body;
    if (!Array.isArray(stops) || stops.length < 2) {
      return res.status(400).json({ message: 'At least 2 stops required' });
    }
    const config    = await getConfig();
    const optimised = optimiseMultiStopRoute(stops);

    // Calculate fee for entire route (with multi-stop discount)
    const firstStop = optimised.stops[0];
    const lastStop  = optimised.stops[optimised.stops.length - 1];
    const feeResult = calculateDeliveryFee({
      pickupLat: firstStop.lat, pickupLng: firstStop.lng,
      dropLat:   lastStop.lat,  dropLng:   lastStop.lng,
      config, isBulk: true,
    });

    // Apply multi-drop discount
    const multiDropDiscount = config?.multiDropDiscount ?? 0.15;
    const discountedFee = Math.round(feeResult.fee * (1 - multiDropDiscount) / 100) * 100;

    res.json({
      success: true,
      route: optimised,
      fee: discountedFee,
      originalFee: feeResult.fee,
      discountApplied: Math.round(multiDropDiscount * 100),
      estimatedTime: optimised.estimatedTime,
      savings: feeResult.fee - discountedFee,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Admin: Get current delivery config ───────────────────────────────────────
// GET /api/admin/delivery-config
exports.getDeliveryConfig = async (req, res) => {
  try {
    let config = await DeliveryConfig.findOne({ isActive: true })
      .sort({ updatedAt: -1 })
      .populate('updatedBy', 'name email');
    if (!config) {
      config = await DeliveryConfig.create({ ...getDefaultConfig(), updatedBy: req.user._id });
    }
    res.json({ success: true, config });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Admin: Update full delivery config ───────────────────────────────────────
// PUT /api/admin/delivery-config
exports.updateDeliveryConfig = async (req, res) => {
  try {
    clearCache(); // invalidate cache
    const updates = { ...req.body, updatedBy: req.user._id };
    delete updates._id; delete updates.__v; delete updates.version;

    let config = await DeliveryConfig.findOne({ isActive: true }).sort({ updatedAt: -1 });
    if (config) {
      // Increment version on update
      config = await DeliveryConfig.findByIdAndUpdate(
        config._id,
        { ...updates, $inc: { version: 1 } },
        { new: true, runValidators: true }
      );
    } else {
      config = await DeliveryConfig.create({ ...getDefaultConfig(), ...updates });
    }

    // Notify all riders about the rate change
    const User = require('../models/User');
    const riders = await User.find({ role: 'rider', accountStatus: 'active' }).select('_id').limit(1000).lean();
    const { createNotification } = require('../utils/notifications');
    for (const rider of riders) {
      await createNotification(req.app.get('io'), {
        userId: rider._id, type: 'system',
        title: '📦 Delivery Rates Updated',
        message: `New rate: Le ${config.defaultPerKmRate?.toLocaleString()}/km. Check your earnings dashboard.`,
      });
    }

    res.json({ success: true, config, message: 'Delivery config updated. All riders notified.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Admin: Update just the per-km rate (quick update) ────────────────────────
// PATCH /api/admin/delivery-config/per-km-rate
exports.updatePerKmRate = async (req, res) => {
  try {
    const { rate, reason } = req.body;
    if (!rate || rate < 500 || rate > 50000) {
      return res.status(400).json({ message: 'Rate must be between Le 500 and Le 50,000 per km' });
    }
    clearCache();
    let config = await DeliveryConfig.findOne({ isActive: true }).sort({ updatedAt: -1 });
    if (!config) config = await DeliveryConfig.create(getDefaultConfig());

    const oldRate = config.defaultPerKmRate;
    config.defaultPerKmRate = +rate;
    config.updatedBy = req.user._id;
    config.version   = (config.version || 1) + 1;
    await config.save();

    // Log the change
    logger.info(`[DeliveryConfig] Rate updated: Le ${oldRate} → Le ${rate}/km by ${req.user.name}. Reason: ${reason}`);

    res.json({
      success: true,
      oldRate, newRate: +rate,
      message: `Per-km rate updated from Le ${oldRate.toLocaleString()} to Le ${(+rate).toLocaleString()}`,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Admin: Add/update zone pricing override ──────────────────────────────────
// POST /api/admin/delivery-config/zones
exports.updateZone = async (req, res) => {
  try {
    const { name, district, baseFee, perKmRate, minFee, maxFee, estimatedMins, surgeMultiplier, isSurgeActive } = req.body;
    if (!name || !district || !baseFee || !perKmRate) {
      return res.status(400).json({ message: 'name, district, baseFee, perKmRate required' });
    }
    clearCache();
    let config = await DeliveryConfig.findOne({ isActive: true }).sort({ updatedAt: -1 });
    if (!config) config = await DeliveryConfig.create(getDefaultConfig());

    const existing = config.zones.find(z => z.district === district);
    if (existing) {
      Object.assign(existing, { name, baseFee, perKmRate, minFee: minFee || existing.minFee, maxFee: maxFee || existing.maxFee, estimatedMins: estimatedMins || existing.estimatedMins, surgeMultiplier: surgeMultiplier || 1, isSurgeActive: isSurgeActive ?? false });
    } else {
      config.zones.push({ name, district, baseFee, perKmRate, minFee: minFee || 5000, maxFee: maxFee || 80000, estimatedMins: estimatedMins || 30, surgeMultiplier: surgeMultiplier || 1, isSurgeActive: isSurgeActive ?? false });
    }
    config.updatedBy = req.user._id;
    await config.save();
    res.json({ success: true, config, message: `Zone "${name}" updated` });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Admin: Toggle surge pricing for a zone ───────────────────────────────────
// PATCH /api/admin/delivery-config/zones/:district/surge
exports.toggleSurge = async (req, res) => {
  try {
    const { district } = req.params;
    const { isSurgeActive, multiplier } = req.body;
    clearCache();
    const config = await DeliveryConfig.findOne({ isActive: true }).sort({ updatedAt: -1 });
    if (!config) return res.status(404).json({ message: 'No delivery config found' });
    const zone = config.zones.find(z => z.district === district);
    if (!zone) return res.status(404).json({ message: 'Zone not found' });
    zone.isSurgeActive    = isSurgeActive;
    zone.surgeMultiplier  = multiplier || zone.surgeMultiplier;
    config.updatedBy      = req.user._id;
    await config.save();

    // Broadcast to buyers in that zone
    await createNotification(req.app.get('io'), {
      userId: null, type: 'system',
      title: isSurgeActive ? '⚠️ Surge Pricing Active' : 'Surge Pricing Ended',
      message: isSurgeActive
        ? `High demand in ${district}. Delivery fees are temporarily ${Math.round((multiplier-1)*100)}% higher.`
        : `Delivery fees in ${district} are back to normal.`,
    });

    res.json({ success: true, zone, message: `Surge ${isSurgeActive ? 'activated' : 'deactivated'} for ${district}` });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Admin: Get live delivery analytics ───────────────────────────────────────
// GET /api/admin/delivery-config/analytics
exports.getDeliveryAnalytics = async (req, res) => {
  try {
    const Order = require('../models/Order');
    const User  = require('../models/User');
    const now   = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const config = await getConfig();
    const riderPct = (config?.riderEarningsPercent ?? 85) / 100;

    const [deliveries, totalRevenue, avgFeeAgg, riderCount, topRiders] = await Promise.all([
      Order.countDocuments({ status: { $in: ['delivered','completed'] }, createdAt: { $gte: weekAgo } }),
      Order.aggregate([
        { $match: { status: { $in: ['delivered','completed'] }, createdAt: { $gte: weekAgo } } },
        { $group: { _id: null, total: { $sum: '$deliveryFee' }, avg: { $avg: '$deliveryFee' } } },
      ]),
      Order.aggregate([
        { $match: { deliveryFee: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$deliveryFee' } } },
      ]),
      User.countDocuments({ role: 'rider', riderStatus: 'available' }),
      Order.aggregate([
        { $match: { rider: { $ne: null }, status: { $in: ['delivered','completed'] } } },
        { $group: { _id: '$rider', deliveries: { $sum: 1 }, earnings: { $sum: { $multiply: ['$deliveryFee', riderPct] } } } },
        { $sort: { deliveries: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'rider' } },
        { $unwind: '$rider' },
        { $project: { name: '$rider.name', deliveries: 1, earnings: 1 } },
      ]),
    ]);

    res.json({
      success: true,
      analytics: {
        weeklyDeliveries: deliveries,
        weeklyRevenue:    totalRevenue[0]?.total || 0,
        avgDeliveryFee:   Math.round(avgFeeAgg[0]?.avg || 0),
        availableRiders:  riderCount,
        topRiders,
        currentConfig: {
          perKmRate: config.defaultPerKmRate,
          baseFee:   config.defaultBaseFee,
          freeThreshold: config.freeDeliveryThreshold,
          riderEarningsPercent: config.riderEarningsPercent,
        },
      },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
