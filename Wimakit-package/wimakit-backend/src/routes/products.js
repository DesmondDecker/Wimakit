'use strict';
const express    = require('express');
const multer     = require('multer');
const { protect, restrictTo, optionalAuth } = require('../middleware/auth');
const ctrl       = require('../controllers/productController');
const router     = express.Router();

// SECURITY: no fileFilter previously — any file type was accepted and,
// combined with imageStorage.js's unrestricted extension derivation, could
// be saved and served statically from this app's own origin.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

router.get ('/',              optionalAuth,                    ctrl.listProducts);
router.get ('/featured',                                       ctrl.getFeatured);
router.get ('/suggestions',   protect,                         ctrl.getPersonalizedSuggestions);
router.get ('/following',     protect,                         ctrl.getFollowingProducts);
router.get ('/popular',                                        ctrl.getPopularProducts);
router.get ('/trending',                                       ctrl.getTrendingProducts);
router.get ('/trending-searches',                              ctrl.getTrendingSearches);
router.get ('/seller/mine',   protect, restrictTo('seller','admin'), ctrl.getMyProducts);
router.get ('/:id',           optionalAuth,                    ctrl.getProduct);
router.get ('/:id/related',                                    ctrl.getRelatedProducts);
router.post('/',              protect, restrictTo('seller','admin'), upload.array('images', 8), ctrl.createProduct);
router.post('/search-history', protect,                         ctrl.recordSearchInterest);
router.delete('/search-history', protect,                       ctrl.clearSearchHistory);
router.delete('/search-history/:keyword', protect,              ctrl.deleteSearchKeyword);
router.put ('/:id',           protect, restrictTo('seller','admin'), ctrl.updateProduct);
router.patch('/:id/status',   protect, restrictTo('seller','admin'), ctrl.updateProductStatus);
router.delete('/:id',         protect, restrictTo('seller','admin'), ctrl.deleteProduct);

module.exports = router;
