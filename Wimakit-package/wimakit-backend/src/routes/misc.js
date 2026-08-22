'use strict';

// This file previously also defined profilesRouter, usersRouter, and
// categoriesRouter — a second, fully-built but never-mounted copy of
// profile/user/category logic that duplicated routes/profiles.js,
// routes/users.js, and routes/categories.js (the files that actually
// handle production traffic for those resources, per server.js).
// Only uploadRouter was ever exported and used elsewhere
// (routes/upload.js re-exports it). The dead duplicates have been
// removed so nobody edits the unused copy and wonders why production
// behavior doesn't change.

const express    = require('express');
const multer     = require('multer');
const { protect } = require('../middleware/auth');
const { saveImage, saveImages } = require('../utils/imageStorage');

// ─── Upload Router ────────────────────────────────────────────────────────────
// This used to call `cloudinary.uploader.upload_stream` directly, configured
// from CLOUDINARY_* env vars with no check that they were actually set and
// no fallback if they weren't. That's fine when Cloudinary is configured,
// but the documented local-dev default (.env.example ships these blank) is
// exactly the case where it silently fails every request. Meanwhile
// productController/communityController's uploads already went through
// utils/imageStorage.js, which has a real local-disk fallback plus the
// request-aware URL fix above — this router was the one path that skipped
// all of that. store-setup.tsx (seller logo/banner) is the actual caller of
// this route today, so this was a live local-dev bug, not just a
// theoretical one. Delegating to the same saveImage/saveImages used
// everywhere else makes this route behave consistently with the rest of
// the app instead of being a second, divergent upload implementation.

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

const uploadRouter = express.Router();
uploadRouter.use(protect);

uploadRouter.post('/image', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = await saveImage(req.file, req);
    res.json({ success: true, url });
  } catch (err) { next(err); }
});

uploadRouter.post('/images', upload.array('images', 5), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files uploaded' });
    const urls = await saveImages(req.files, req);
    res.json({ success: true, images: urls.map((url) => ({ url })) });
  } catch (err) { next(err); }
});

module.exports = {
  uploadRouter,
};
