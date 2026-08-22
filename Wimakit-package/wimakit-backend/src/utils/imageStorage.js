'use strict';
// Lightweight local image storage (free, no external service required).
// Cloudinary is used automatically if CLOUDINARY_* env vars are present.
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const hasCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
let cloudinary;
if (hasCloudinary) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  // ROOT CAUSE of "blank white image cards" in production: this used to
  // fall back to `process.env.APP_URL`, but APP_URL is already used
  // everywhere in utils/email.js (verify-email, reset-password, wallet
  // links, etc.) to mean the *frontend* app's URL — not this API server's
  // own URL, which is what a static /uploads/<file> link actually needs to
  // point at. Setting APP_URL correctly for its documented purpose (email
  // links) silently broke every locally-stored image URL, and vice versa.
  // API_URL below is a dedicated variable for this server's own origin.
  // Falling back further to Fly's auto-injected FLY_APP_NAME covers this
  // deployment's actual setup (see fly.toml) without needing a manual
  // step, but this is still local-disk storage on Fly's ephemeral
  // filesystem — see the [[mounts]] block added to fly.toml, and note that
  // a mounted volume only makes files durable across restarts, it doesn't
  // make them fast or CDN-cached the way Cloudinary is. Cloudinary is the
  // real fix; this whole branch is a fallback for local dev.
  if (process.env.NODE_ENV === 'production') {
    logger.error(
      '[imageStorage] CLOUDINARY_* env vars are not set in production. ' +
      'Falling back to local disk storage, which is NOT durable on Fly.io ' +
      'without a mounted volume (see fly.toml) and will produce broken ' +
      'image URLs for every user if API_URL / FLY_APP_NAME are also unset. ' +
      'Run: fly secrets set CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...'
    );
  }
}

function apiBaseUrl(req) {
  // THE actual root cause of blank image cards, including in local dev
  // (not just production): utils/api.ts on the frontend deliberately picks
  // a *different* host depending on platform — 10.0.2.2 for the Android
  // emulator, the dev machine's real LAN IP for a physical device pulled
  // from Expo's hostUri, plain localhost only on web/iOS simulator. That's
  // because "localhost" means "this device" to whoever's asking, and a
  // phone is not the dev laptop. This function used to hardcode
  // `http://localhost:${PORT}` regardless of how the client actually
  // reached the server, so on a physical device or the Android emulator the
  // API handed back an image URL pointing at the device itself — nothing is
  // listening there, so the image request silently fails and the card
  // renders blank. The fix: don't guess the host at all. Express already
  // knows exactly what the client dialed — it's the incoming Host header —
  // so build the URL from the request itself. This is automatically
  // correct for LAN IP, emulator, web, tunnels, and production alike (the
  // production/Fly case already has `app.set('trust proxy', 1)` in
  // server.js, so req.protocol correctly reports 'https' there via
  // X-Forwarded-Proto instead of Fly's internal http).
  if (req) return `${req.protocol}://${req.get('host')}`;
  // Fallback for any call site that can't pass req (e.g. a background job).
  if (process.env.API_URL) return process.env.API_URL;
  if (process.env.FLY_APP_NAME) return `https://${process.env.FLY_APP_NAME}.fly.dev`;
  return `http://localhost:${process.env.PORT || 5000}`;
}

/**
 * Save a single multer file buffer; returns a public URL string.
 * Pass the Express `req` so local-disk URLs are built from the host the
 * client actually connected on (see apiBaseUrl above) — omit only for
 * callers with no request in scope (e.g. scheduled tasks), which fall back
 * to the API_URL/FLY_APP_NAME/localhost guesses.
 */
async function saveImage(file, req) {
  if (!file?.buffer) return null;
  if (hasCloudinary) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: 'wimakit' }, (err, res) => err ? reject(err) : resolve(res));
      stream.end(file.buffer);
    });
    return result.secure_url;
  }
  // SECURITY: the extension used to be derived directly from the
  // client-supplied mimetype with no whitelist. Combined with the upload
  // routes historically having no fileFilter, this allowed any file type to
  // be saved and served statically from this app's own origin (see
  // routes/community.js and routes/products.js — both now filter to
  // image/* at the multer level too). Whitelisted here as well, defensively,
  // so this function is safe even if called from somewhere that forgets to
  // filter upstream.
  const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
  const rawExt = (file.mimetype?.split('/')[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : 'jpg';
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);
  return `${apiBaseUrl(req)}/uploads/${name}`;
}

async function saveImages(files = [], req) {
  // Each call to saveImage is a network round trip when Cloudinary is
  // configured (the recommended production path). Awaiting them one at a
  // time in a loop means an 8-photo upload pays for 8 sequential round
  // trips back-to-back instead of paying for the slowest one — on a
  // high-latency connection that difference alone can be several extra
  // seconds on top of the transfer time itself. Promise.all runs them
  // concurrently; a failure in any one still rejects the whole batch, same
  // as before, so error handling upstream (product/post creation) is
  // unchanged.
  const out = await Promise.all(files.map((f) => saveImage(f, req)));
  return out.filter(Boolean);
}

module.exports = { saveImage, saveImages, UPLOAD_DIR };
