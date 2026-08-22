'use strict';
const express  = require('express');
const multer   = require('multer');
// SECURITY: no fileFilter previously — any file type was accepted and,
// combined with imageStorage.js's unrestricted extension derivation, could
// be saved and served statically from this app's own origin.
const upload   = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});
const router   = express.Router();
const ctrl     = require('../controllers/communityController');
const { protect, optionalAuth } = require('../middleware/auth');

router.get  ('/',                  optionalAuth,                      ctrl.getFeed);
router.get  ('/trending',          optionalAuth,                      ctrl.getTrending);
router.get  ('/search',            optionalAuth,                      ctrl.searchPosts);
router.get  ('/hashtags/trending',                                    ctrl.getTrendingHashtags);
router.get  ('/hashtag/:tag',      optionalAuth,                      ctrl.getHashtagPosts);
router.get  ('/bookmarks',         protect,                           ctrl.getBookmarks);
router.get  ('/user/:slug',        optionalAuth,                      ctrl.getUserPosts);
router.post ('/',                  protect, upload.array('images',6), ctrl.createPost);
router.get  ('/:id',               optionalAuth,                      ctrl.getPost);
router.delete('/:id',              protect,                           ctrl.deletePost);
router.post ('/:id/react',         protect,                           ctrl.reactToPost);
router.post ('/:id/bookmark',      protect,                           ctrl.bookmarkPost);
router.post ('/:id/report',        protect,                           ctrl.reportPost);
router.post ('/:id/poll/vote',     protect,                           ctrl.votePoll);
router.get  ('/:id/comments',      optionalAuth,                      ctrl.getComments);
router.post ('/:id/comments',      protect,                           ctrl.addComment);
router.put  ('/:id/comments/:commentId', protect,                     ctrl.updateComment);
router.delete('/:id/comments/:commentId', protect,                   ctrl.deleteComment);
router.post ('/:id/comments/:commentId/react', protect,              ctrl.reactToComment);
module.exports = router;
