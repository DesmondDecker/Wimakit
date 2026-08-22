'use strict';

/**
 * WimaKit Redis Cache Service
 * Falls back gracefully to no-op if Redis is not configured.
 */

let redisClient = null;

const initRedis = async () => {
  if (!process.env.REDIS_URL) {
    console.log('ℹ️  REDIS_URL not set — caching disabled (safe for dev)');
    return null;
  }
  try {
    const { createClient } = require('redis');
    const client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: (retries) => {
          if (retries > 3) return false;
          return Math.min(retries * 200, 1000);
        },
      },
    });
    client.on('error', (e) => console.warn('[Redis] Error:', e.message));
    client.on('ready', () => console.log('✅ Redis connected'));
    await client.connect();
    return client;
  } catch (e) {
    console.warn('[Redis] Failed to connect:', e.message);
    return null;
  }
};

// Lazily initialise
let initPromise = null;
const getClient = async () => {
  if (!initPromise) initPromise = initRedis();
  return initPromise;
};

// ─── TTLs (seconds) ───────────────────────────────────────────────────────────
const TTL = {
  categories:      3600,   // 1 hour
  productFeatured: 300,    // 5 min
  productList:     180,    // 3 min
  productDetail:   120,    // 2 min
  profile:         300,    // 5 min
  sellerStats:     120,
};

// ─── Cache helpers ────────────────────────────────────────────────────────────
const cache = {
  async get(key) {
    const client = await getClient();
    if (!client) return null;
    try {
      const val = await client.get(key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },

  async set(key, value, ttl = 300) {
    const client = await getClient();
    if (!client) return;
    try {
      await client.setEx(key, ttl, JSON.stringify(value));
    } catch { /* silent */ }
  },

  async del(key) {
    const client = await getClient();
    if (!client) return;
    try { await client.del(key); } catch { /* silent */ }
  },

  async delPattern(pattern) {
    const client = await getClient();
    if (!client) return;
    try {
      const keys = await client.keys(pattern);
      if (keys.length) await client.del(keys);
    } catch { /* silent */ }
  },

  // Wrap a function: return cache hit or call fn, cache result
  async wrap(key, fn, ttl = 300) {
    const hit = await cache.get(key);
    if (hit !== null) return hit;
    const result = await fn();
    await cache.set(key, result, ttl);
    return result;
  },
};

module.exports = { cache, TTL };
