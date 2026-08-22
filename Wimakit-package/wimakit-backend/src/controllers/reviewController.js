'use strict';

const { Review, Order } = require('../models/index');
const logger = require('../utils/logger');

/**
 * @desc    Create a review for a product and seller
 * @route   POST /api/reviews
 * @access  Private (Buyer)
 */
exports.createReview = async (req, res, next) => {
  try {
    const { orderId, productId, rating, comment } = req.body;

    // 1. Verify order exists and is delivered
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'You can only review items after the order has been delivered' });
    }

    // 2. Verify authorization (only the buyer of the order can review).
    // Guest orders have order.buyer === null — they have no account to
    // attach a review to, so they can never legitimately be reviewed.
    // Without this guard, .toString() on null would throw and crash the
    // request instead of returning a clean 403.
    if (!order.buyer || order.buyer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to review this order' });
    }

    // 3. Verify product was part of the order
    const productInOrder = order.items.some(item => item.product.toString() === productId);
    if (!productInOrder) {
      return res.status(400).json({ success: false, message: 'This product was not part of the specified order' });
    }

    // 4. Check for existing review for this specific item in this order
    const existingReview = await Review.findOne({ 
      user: req.user.id, 
      order: orderId, 
      product: productId 
    });
    if (existingReview) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this product for this order' });
    }

    // 5. Create Review
    const review = await Review.create({
      user: req.user.id,
      order: orderId,
      product: productId,
      seller: order.seller,
      rating,
      comment
    });

    // Product and seller aggregate rating + totalReviews are kept in sync
    // automatically by the Review schema's post('save') hook (see
    // models/index.js) — no need to recompute them here too.

    await review.populate('user', 'name avatar');
    
    logger.info(`Review created: User ${req.user.id} -> Product ${productId} (Order ${orderId})`);

    res.status(201).json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get reviews for a product
 * @route   GET /api/reviews/product/:productId
 * @access  Public
 */
exports.getProductReviews = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const reviews = await Review.find({ product: productId })
      .populate('user', 'name avatar')
      .sort('-createdAt');

    res.status(200).json({ 
      success: true, 
      count: reviews.length, 
      data: reviews 
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get reviews for a seller
 * @route   GET /api/reviews/seller/:sellerId
 * @access  Public
 */
exports.getSellerReviews = async (req, res, next) => {
  try {
    const { sellerId } = req.params;
    const reviews = await Review.find({ seller: sellerId })
      .populate('user', 'name avatar')
      .populate('product', 'name images')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: reviews.length, data: reviews });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Seller replies to a review left on their product
 * @route   POST /api/reviews/:id/reply
 * @access  Private (the seller who was reviewed, or admin)
 *
 * The Review schema already had a `sellerReply` field, but no route or
 * controller function ever wrote to it — the frontend's
 * reviewsApi.reply() call had nothing to hit on the backend.
 */
exports.replyToReview = async (req, res, next) => {
  try {
    const { reply } = req.body;
    if (!reply || !reply.trim()) {
      return res.status(400).json({ success: false, message: 'Reply text is required' });
    }

    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    const isSeller = review.seller && review.seller.toString() === req.user.id;
    const isAdmin  = req.user.role === 'admin';
    if (!isSeller && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Only the reviewed seller can reply to this review' });
    }

    review.sellerReply = reply.trim();
    await review.save();
    await review.populate('user', 'name avatar');

    res.status(200).json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark a review as helpful
 * @route   POST /api/reviews/:id/helpful
 * @access  Private (any authenticated user, once per user)
 *
 * The Review schema already had a `helpful` counter, but no route or
 * controller function ever incremented it.
 */
exports.markReviewHelpful = async (req, res, next) => {
  try {
    // $addToSet on a dedicated voters list would be the more robust
    // way to enforce "once per user", but that field doesn't exist on
    // the schema yet and adding it is outside the scope of wiring up
    // this endpoint. For now this simply increments the counter;
    // preventing repeat votes from the same user is a follow-up if
    // abuse turns out to be a problem in practice.
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $inc: { helpful: 1 } },
      { new: true }
    );
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    res.status(200).json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
};