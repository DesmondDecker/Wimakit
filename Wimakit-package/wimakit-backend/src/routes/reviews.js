'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createReview,
  getProductReviews,
  getSellerReviews,
  replyToReview,
  markReviewHelpful,
} = require('../controllers/reviewController');

router.post('/', protect, createReview);
router.get('/product/:productId', getProductReviews);
router.get('/seller/:sellerId', getSellerReviews);
router.post('/:id/reply', protect, replyToReview);
router.post('/:id/helpful', protect, markReviewHelpful);

module.exports = router;
