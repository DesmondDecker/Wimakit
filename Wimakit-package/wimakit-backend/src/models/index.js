'use strict';

const mongoose = require('mongoose');
const User = require('./User');
const Product = require('./Product');
const Order = require('./Order');
const Category = require('./Category');

// ─── Review ───────────────────────────────────────────────────────────────────
const reviewSchema = new mongoose.Schema(
  {
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    order:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order',   required: true },
    seller:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating:  { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 1000 },
    images:  [{ type: String }],
    sellerReply: String,
    helpful: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One review per user per product per order
reviewSchema.index({ user: 1, product: 1, order: 1 }, { unique: true });
reviewSchema.index({ product: 1, rating: -1 });
reviewSchema.index({ seller: 1, rating: -1 });

// Auto-update product AND seller aggregate rating/count on save. Previously
// only the product side was handled here — seller.rating and
// seller.totalReviews were left for the route controller to maintain
// separately (and totalReviews wasn't tracked there at all, so it stayed
// permanently at 0 regardless of how many reviews a seller actually had).
// Centralizing both here means every review write keeps both in sync,
// regardless of which code path created/updated the review.
reviewSchema.post('save', async function () {
  const Product = require('./Product');
  const User = require('./User');
  const [productStats, sellerStats] = await Promise.all([
    this.constructor.aggregate([
      { $match: { product: this.product } },
      { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
    this.seller ? this.constructor.aggregate([
      { $match: { seller: this.seller } },
      { $group: { _id: '$seller', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
  ]);
  if (productStats.length > 0) {
    await Product.findByIdAndUpdate(this.product, {
      rating: Math.round(productStats[0].avg * 10) / 10,
      totalReviews: productStats[0].count,
    });
  }
  if (sellerStats.length > 0) {
    await User.findByIdAndUpdate(this.seller, {
      rating: Math.round(sellerStats[0].avg * 10) / 10,
      totalReviews: sellerStats[0].count,
    });
  }
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = { User, Product, Order, Review, Category };
