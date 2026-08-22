'use strict';

/**
 * ─── WimaKit Delivery Pricing Engine ──────────────────────────────────────────
 * Location data sourced from VTO Sierra Leone district database.
 * Covers all 16 districts + major towns in Freetown and provinces.
 */

// ─── Sierra Leone Location Database ─────────────────────────────────────────
const SL_LOCATIONS = {
  // Western Area
  'Freetown Center':       { lat: 8.4841,  lng: -13.2344, district: 'Western Area Urban',   zone: 'freetown_central' },
  'Aberdeen':              { lat: 8.4745,  lng: -13.2739, district: 'Western Area Urban',   zone: 'freetown_central' },
  'Lumley':                { lat: 8.4598,  lng: -13.2828, district: 'Western Area Urban',   zone: 'freetown_central' },
  'Hill Station':          { lat: 8.4950,  lng: -13.2260, district: 'Western Area Urban',   zone: 'freetown_central' },
  'Wilberforce':           { lat: 8.4862,  lng: -13.2317, district: 'Western Area Urban',   zone: 'freetown_central' },
  'Congo Cross':           { lat: 8.4694,  lng: -13.2583, district: 'Western Area Urban',   zone: 'freetown_central' },
  'Brookfields':           { lat: 8.4783,  lng: -13.2388, district: 'Western Area Urban',   zone: 'freetown_central' },
  'Murray Town':           { lat: 8.4722,  lng: -13.2500, district: 'Western Area Urban',   zone: 'freetown_central' },
  'Tengbeh Town':          { lat: 8.4800,  lng: -13.2444, district: 'Western Area Urban',   zone: 'freetown_central' },
  'Kissy':                 { lat: 8.4894,  lng: -13.1988, district: 'Western Area Urban',   zone: 'freetown_east'    },
  'Wellington':            { lat: 8.4917,  lng: -13.1792, district: 'Western Area Urban',   zone: 'freetown_east'    },
  'Waterloo':              { lat: 8.3381,  lng: -13.0756, district: 'Western Area Rural',   zone: 'western_rural'    },
  'Hastings':              { lat: 8.3758,  lng: -13.1086, district: 'Western Area Rural',   zone: 'western_rural'    },
  'Tombo':                 { lat: 8.2564,  lng: -13.0761, district: 'Western Area Rural',   zone: 'western_rural'    },
  'Regent':                { lat: 8.5194,  lng: -13.1908, district: 'Western Area Rural',   zone: 'western_rural'    },
  'Grafton':               { lat: 8.3906,  lng: -13.1217, district: 'Western Area Rural',   zone: 'western_rural'    },

  // Southern Province
  'Bo':                    { lat: 7.9647,  lng: -11.7383, district: 'Bo',                   zone: 'southern_province'},
  'Kenema':                { lat: 7.8764,  lng: -11.1908, district: 'Kenema',                zone: 'eastern_province' },
  'Pujehun':               { lat: 7.3547,  lng: -11.7186, district: 'Pujehun',              zone: 'southern_province'},
  'Bonthe':                { lat: 7.5261,  lng: -12.5050, district: 'Bonthe',               zone: 'southern_province'},
  'Moyamba':               { lat: 8.1592,  lng: -12.4317, district: 'Moyamba',              zone: 'southern_province'},

  // Northern Province
  'Makeni':                { lat: 8.8869,  lng: -12.0472, district: 'Bombali',              zone: 'northern_province'},
  'Magburaka':             { lat: 8.7167,  lng: -11.9500, district: 'Tonkolili',            zone: 'northern_province'},
  'Kabala':                { lat: 9.5847,  lng: -11.5544, district: 'Koinadugu',            zone: 'northern_province'},
  'Kambia':                { lat: 9.1239,  lng: -12.9181, district: 'Kambia',               zone: 'northern_province'},
  'Port Loko':             { lat: 8.7653,  lng: -12.7875, district: 'Port Loko',            zone: 'northern_province'},
  'Lunsar':                { lat: 8.6850,  lng: -12.5333, district: 'Port Loko',            zone: 'northern_province'},
  'Freetown Airport (LFW)':{ lat: 8.6161,  lng: -13.1950, district: 'Western Area Urban',   zone: 'freetown_central' },

  // Eastern Province
  'Kono':                  { lat: 8.5000,  lng: -10.9833, district: 'Kono',                 zone: 'eastern_province' },
  'Koidu':                 { lat: 8.6500,  lng: -10.9667, district: 'Kono',                 zone: 'eastern_province' },
  'Kailahun':              { lat: 8.2803,  lng: -10.5714, district: 'Kailahun',             zone: 'eastern_province' },
  'Segbwema':              { lat: 7.9833,  lng: -10.9500, district: 'Kenema',               zone: 'eastern_province' },

  // North West Province
  'Kamakwie':              { lat: 9.8000,  lng: -12.6667, district: 'Karene',               zone: 'northwest_province'},
  'Mange':                 { lat: 8.9558,  lng: -12.8119, district: 'Karene',               zone: 'northwest_province'},
  'Kukuna':                { lat: 9.5000,  lng: -12.8167, district: 'Karene',               zone: 'northwest_province'},
};

// Zone surcharge multipliers for cross-zone travel
const ZONE_MULTIPLIERS = {
  freetown_central:  1.0,  // base
  freetown_east:     1.1,
  western_rural:     1.25,
  southern_province: 2.5,
  northern_province: 2.5,
  eastern_province:  2.5,
  northwest_province:2.8,
};

/**
 * Calibrated road distance factors per zone pair.
 * Derived from known GPS straight-line vs actual road distances in SL.
 * - Freetown urban: 1.3x (dense streets, some one-ways)
 * - Western Rural (Waterloo, Hastings): 1.45x
 * - Southern Province (Bo): 1.55x (decent A2/A5 highway)
 * - Northern Province (Makeni): 1.6x
 * - Eastern Province (Kenema): 1.7x (Kenema Hwy ok), (Koidu/Kailahun): 1.95x (poor diamond-belt roads)
 * - Northwest Province: 1.8x
 */
const ZONE_ROAD_FACTORS = {
  freetown_central:   1.30,
  freetown_east:      1.35,
  western_rural:      1.45,
  southern_province:  1.55,
  northern_province:  1.60,
  eastern_province:   1.75,  // avg; eastern_deep locations get a bonus below
  northwest_province: 1.80,
};

// Extra multiplier for deep-eastern locations (Koidu, Kailahun) due to very poor road quality
const DEEP_EASTERN_LOCATIONS = new Set(['Koidu', 'Kailahun', 'Segbwema']);

/**
 * Haversine formula — great-circle distance between two GPS points
 * Returns distance in kilometres
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius km
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find closest named Sierra Leone location to given coordinates
 */
function findNearestLocation(lat, lng) {
  let nearest = null, minDist = Infinity;
  for (const [name, loc] of Object.entries(SL_LOCATIONS)) {
    const d = haversineKm(lat, lng, loc.lat, loc.lng);
    if (d < minDist) { minDist = d; nearest = { name, ...loc, distanceKm: d }; }
  }
  return nearest;
}

/**
 * Get zone from coordinates
 */
function getZoneFromCoords(lat, lng) {
  const nearest = findNearestLocation(lat, lng);
  if (!nearest) return 'freetown_central';
  if (nearest.distanceKm > 20) return 'southern_province';
  return nearest.zone;
}

/**
 * Estimate road distance using calibrated per-zone factors.
 * Uses the destination zone factor (the harder road), bounded by a minimum of 1.3x.
 */
function estimateRoadDistanceKm(lat1, lng1, lat2, lng2) {
  const straightLine = haversineKm(lat1, lng1, lat2, lng2);

  const zone1 = getZoneFromCoords(lat1, lng1);
  const zone2 = getZoneFromCoords(lat2, lng2);

  // Use the worse (larger) factor between the two zones
  const factor1 = ZONE_ROAD_FACTORS[zone1] ?? 1.55;
  const factor2 = ZONE_ROAD_FACTORS[zone2] ?? 1.55;
  let factor = Math.max(factor1, factor2);

  // Extra penalty for deep eastern locations
  const drop = findNearestLocation(lat2, lng2);
  if (drop && DEEP_EASTERN_LOCATIONS.has(drop.name)) {
    factor = Math.max(factor, 1.95);
  }

  return straightLine * factor;
}

/**
 * Estimate delivery time in minutes based on distance and traffic
 */
function estimateDeliveryMinutes(distanceKm, hour = new Date().getHours()) {
  const speedKmh = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20)
    ? 15   // peak hour — slow urban traffic
    : hour >= 22 || hour <= 5
      ? 35 // night — faster roads
      : 25; // normal
  const travelMins = (distanceKm / speedKmh) * 60;
  const preparationMins = 5; // rider pickup + handoff
  return Math.round(travelMins + preparationMins);
}

/**
 * ─── Core Pricing Function ─────────────────────────────────────────────────
 * @param {Object} params
 * @param {number} params.pickupLat
 * @param {number} params.pickupLng
 * @param {number} params.dropLat
 * @param {number} params.dropLng
 * @param {Object} params.config         – DeliveryConfig document from DB
 * @param {number} params.orderValue     – in SLL, for free delivery check
 * @param {number} params.weightKg       – package weight
 * @param {boolean} params.isBulk        – 3+ different items (market woman discount)
 * @param {boolean} params.isRegularCustomer – loyalty discount
 */
function calculateDeliveryFee(params) {
  const {
    pickupLat, pickupLng, dropLat, dropLng,
    config, orderValue = 0, weightKg = 0.5,
    isBulk = false, isRegularCustomer = false,
  } = params;

  // ─── Actual distance (always computed, needed even for free delivery) ───────
  const distanceKm = estimateRoadDistanceKm(pickupLat, pickupLng, dropLat, dropLng);
  const hour = new Date().getHours();

  // ─── Free delivery threshold ──────────────────────────────────────────────
  const freeThreshold = config?.freeDeliveryThreshold ?? 500000;
  if (orderValue >= freeThreshold) {
    return buildResult(0, distanceKm, hour,
      'Free delivery on orders over Le ' + freeThreshold.toLocaleString(),
      params, {
        isFree: true,
        estimatedMinutes: estimateDeliveryMinutes(distanceKm, hour),
      });
  }

  // ─── Zone detection ───────────────────────────────────────────────────────
  const pickupZone = getZoneFromCoords(pickupLat, pickupLng);
  const dropZone   = getZoneFromCoords(dropLat, dropLng);
  const crossZone  = pickupZone !== dropZone;

  // ─── Check for zone-specific rate override ────────────────────────────────
  const zoneConfig = config?.zones?.find(z =>
    z.district === findNearestLocation(dropLat, dropLng)?.district
  );

  const baseFee   = zoneConfig?.baseFee   ?? config?.defaultBaseFee   ?? 5000;
  const perKmRate = zoneConfig?.perKmRate ?? config?.defaultPerKmRate ?? 3000;
  const minFee    = zoneConfig?.minFee    ?? config?.defaultMinFee    ?? 5000;
  const maxFee    = zoneConfig?.maxFee    ?? config?.defaultMaxFee    ?? 80000;

  // ─── Base calculation ─────────────────────────────────────────────────────
  let fee = baseFee + (distanceKm * perKmRate);

  // ─── Cross-zone penalty ───────────────────────────────────────────────────
  if (crossZone) {
    const zoneMultiplier = Math.max(
      ZONE_MULTIPLIERS[pickupZone] ?? 1.0,
      ZONE_MULTIPLIERS[dropZone]   ?? 1.0
    );
    fee *= zoneMultiplier;
    if (config?.crossDistrictPenalty) fee += config.crossDistrictPenalty;
  }

  // ─── Surge pricing (admin-set per zone) ──────────────────────────────────
  if (zoneConfig?.isSurgeActive && zoneConfig?.surgeMultiplier > 1) {
    fee *= zoneConfig.surgeMultiplier;
  }

  // ─── Time-of-day modifiers ────────────────────────────────────────────────
  const peakMorning = config?.peakHours?.morning ?? { from: 7, to: 9 };
  const peakEvening = config?.peakHours?.evening ?? { from: 17, to: 20 };
  const isPeakHour  = (hour >= peakMorning.from && hour < peakMorning.to)
                    || (hour >= peakEvening.from && hour < peakEvening.to);
  const isNight     = hour >= (config?.nightHourStart ?? 22) || hour < (config?.nightHourEnd ?? 6);

  if (isPeakHour) fee *= (1 + (config?.peakHourSurcharge ?? 0.25));
  if (isNight)    fee *= (1 + (config?.nightSurcharge    ?? 0.50));

  // ─── Weight surcharge ─────────────────────────────────────────────────────
  if (weightKg > 1 && config?.weightBreakpoints?.length) {
    const bp = config.weightBreakpoints
      .sort((a, b) => a.maxKg - b.maxKg)
      .find(b => weightKg <= b.maxKg);
    if (bp) fee += (weightKg - 1) * bp.surchargeLePerKg;
  } else if (weightKg > 5) {
    fee += (weightKg - 5) * 2000; // default Le 2,000/kg over 5kg
  }

  // ─── Discounts ────────────────────────────────────────────────────────────
  let discountLabel = '';
  if (isBulk) {
    const disc = config?.bulkOrderDiscount ?? 0.10;
    fee *= (1 - disc);
    discountLabel = `Bulk discount (${Math.round(disc * 100)}% off)`;
  }
  if (isRegularCustomer) {
    const disc = config?.regularCustomerDiscount ?? 0.05;
    fee *= (1 - disc);
    discountLabel += discountLabel ? ' + Loyalty discount' : 'Loyalty discount';
  }

  // ─── Bounds — minimum enforced BEFORE rounding ────────────────────────────
  fee = Math.max(minFee, Math.min(maxFee, fee));
  fee = Math.round(fee / 100) * 100; // round to nearest Le 100

  // ─── Rider earnings ───────────────────────────────────────────────────────
  const riderPct     = (config?.riderEarningsPercent ?? 85) / 100;
  const riderEarning = Math.round(fee * riderPct);
  const platformEarning = fee - riderEarning;

  return buildResult(fee, distanceKm, hour, discountLabel, params, {
    pickupZone, dropZone, crossZone, isPeakHour, isNight,
    riderEarning, platformEarning, weightKg,
    estimatedMinutes: estimateDeliveryMinutes(distanceKm, hour),
  });
}

function buildResult(fee, distanceKm, hour, note, params, extra = {}) {
  const { pickupLat, pickupLng, dropLat, dropLng } = params;
  const pickupInfo = findNearestLocation(pickupLat, pickupLng);
  const dropInfo   = findNearestLocation(dropLat, dropLng);
  const estMins    = extra.estimatedMinutes ?? estimateDeliveryMinutes(distanceKm, hour);
  return {
    fee,
    distanceKm: +distanceKm.toFixed(2),
    isFree: fee === 0,
    note,
    pickup:  pickupInfo ? { name: pickupInfo.name, district: pickupInfo.district } : null,
    dropoff: dropInfo   ? { name: dropInfo.name,   district: dropInfo.district   } : null,
    estimatedMinutes: estMins,
    estimatedTime: formatDeliveryTime(estMins),
    breakdown: {
      distanceKm:      +distanceKm.toFixed(2),
      isPeakHour:      extra.isPeakHour      ?? false,
      isNight:         extra.isNight         ?? false,
      crossZone:       extra.crossZone       ?? false,
      pickupZone:      extra.pickupZone      ?? 'unknown',
      dropZone:        extra.dropZone        ?? 'unknown',
      weightKg:        extra.weightKg        ?? 0.5,
      riderEarning:    extra.riderEarning    ?? Math.round(fee * 0.85),
      platformEarning: extra.platformEarning ?? Math.round(fee * 0.15),
      discountNote:    note,
    },
  };
}

function formatDeliveryTime(minutes) {
  if (minutes < 60) return `${minutes} mins`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
}

/**
 * Calculate optimal route for market women making multiple stops
 * Uses nearest-neighbour heuristic (efficient for <10 stops)
 */
function optimiseMultiStopRoute(stops) {
  if (stops.length <= 1) return { stops, totalDistanceKm: 0, estimatedMinutes: 0 };

  const visited = new Set();
  const route   = [];
  let current   = stops[0];
  let totalDist = 0;

  visited.add(0);
  route.push(current);

  while (route.length < stops.length) {
    let nearest = null, nearestDist = Infinity, nearestIdx = -1;
    stops.forEach((stop, i) => {
      if (visited.has(i)) return;
      const d = haversineKm(current.lat, current.lng, stop.lat, stop.lng);
      if (d < nearestDist) { nearestDist = d; nearest = stop; nearestIdx = i; }
    });
    if (!nearest) break;
    visited.add(nearestIdx);
    route.push(nearest);
    totalDist += nearestDist * 1.4; // road factor
    current = nearest;
  }

  const estimatedMinutes = estimateDeliveryMinutes(totalDist);

  return {
    stops: route,
    totalDistanceKm: +totalDist.toFixed(2),
    estimatedMinutes,
    estimatedTime: formatDeliveryTime(estimatedMinutes),
  };
}

/**
 * Get default delivery config (used when no DB config exists)
 */
function getDefaultConfig() {
  return {
    defaultPerKmRate: 3000,
    defaultBaseFee:   5000,
    defaultMinFee:    5000,
    defaultMaxFee:    80000,
    freeDeliveryThreshold: 500000,
    peakHourSurcharge: 0.25,
    nightSurcharge:    0.50,
    peakHours: { morning: { from: 7, to: 9 }, evening: { from: 17, to: 20 } },
    nightHourStart: 22, nightHourEnd: 6,
    crossDistrictPenalty: 10000,
    riderEarningsPercent: 85,
    bulkOrderDiscount: 0.10,
    regularCustomerDiscount: 0.05,
    weightBreakpoints: [
      { maxKg: 2,  surchargeLePerKg: 500  },
      { maxKg: 5,  surchargeLePerKg: 1000 },
      { maxKg: 20, surchargeLePerKg: 2000 },
    ],
    zones: [],
  };
}

module.exports = {
  calculateDeliveryFee,
  optimiseMultiStopRoute,
  estimateRoadDistanceKm,
  haversineKm,
  findNearestLocation,
  getZoneFromCoords,
  estimateDeliveryMinutes,
  getDefaultConfig,
  SL_LOCATIONS,
  ZONE_MULTIPLIERS,
  ZONE_ROAD_FACTORS,
};
