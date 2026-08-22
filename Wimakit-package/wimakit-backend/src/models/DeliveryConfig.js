'use strict';
const mongoose = require('mongoose');

// Zone-based pricing with time-of-day and weight modifiers
const zoneSchema = new mongoose.Schema({
  name:           { type: String, required: true },        // e.g. "Freetown Central"
  district:       { type: String, required: true },        // e.g. "Western Area Urban"
  baseFee:        { type: Number, required: true },        // base fee in SLL (Le)
  perKmRate:      { type: Number, required: true },        // Le per km
  minFee:         { type: Number, default: 5000  },        // minimum fee
  maxFee:         { type: Number, default: 100000 },       // cap
  estimatedMins:  { type: Number, default: 30 },           // delivery time estimate
  surgeMultiplier:{ type: Number, default: 1.0 },          // surge pricing (set by admin)
  isSurgeActive:  { type: Boolean, default: false },
}, { _id: false });

const configSchema = new mongoose.Schema({
  // ─── Base Rates ────────────────────────────────────────────────────────────
  defaultPerKmRate:      { type: Number, default: 3000  }, // Le per km (default)
  defaultBaseFee:        { type: Number, default: 5000  }, // base pickup fee
  defaultMinFee:         { type: Number, default: 5000  },
  defaultMaxFee:         { type: Number, default: 80000 },
  freeDeliveryThreshold: { type: Number, default: 500000 }, // Le 500K = free delivery

  // ─── Weight Surcharges ─────────────────────────────────────────────────────
  weightBreakpoints: [{
    maxKg:       Number,  // up to this weight
    surchargeLePerKg: Number,  // extra per kg over base
  }],

  // ─── Time-of-Day Modifiers ─────────────────────────────────────────────────
  peakHourSurcharge:    { type: Number, default: 0.25 },   // +25% during peak
  peakHours: {
    morning: { from: { type: Number, default: 7 }, to: { type: Number, default: 9 } },
    evening: { from: { type: Number, default: 17 }, to: { type: Number, default: 20 } },
  },
  nightSurcharge:       { type: Number, default: 0.5 },    // +50% after 10pm
  nightHourStart:       { type: Number, default: 22 },
  nightHourEnd:         { type: Number, default: 6 },

  // ─── Zone-Based Overrides ─────────────────────────────────────────────────
  zones: [zoneSchema],

  // ─── District Cross-District Penalty ─────────────────────────────────────
  crossDistrictPenalty: { type: Number, default: 10000 }, // extra Le for cross-district
  crossZonePenaltyPerKm: { type: Number, default: 500 },  // extra per km out-of-zone

  // ─── Rider Earnings Share ─────────────────────────────────────────────────
  riderEarningsPercent: { type: Number, default: 85 },     // 85% of fee goes to rider
  platformDeliveryPercent: { type: Number, default: 15 },

  // ─── Market Women Optimisation ────────────────────────────────────────────
  bulkOrderDiscount:    { type: Number, default: 0.10 },   // 10% off for 3+ items
  multiDropDiscount:    { type: Number, default: 0.15 },   // 15% if multiple stops
  regularCustomerDiscount: { type: Number, default: 0.05}, // 5% for repeat customers

  // ─── Active Flag ──────────────────────────────────────────────────────────
  isActive: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  version: { type: Number, default: 1 },

}, { timestamps: true });

module.exports = mongoose.model('DeliveryConfig', configSchema);
