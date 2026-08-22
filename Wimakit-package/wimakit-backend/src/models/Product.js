'use strict';

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true, maxlength: 200 },
    slug:        { type: String, unique: true },
    description: { type: String, required: true, maxlength: 2000 },
    price:       { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },

    images: [{ type: String }],

    category:     { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    subcategory:  { type: String },
    attributes:   { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    seller:       { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },

    stock:        { type: Number, required: true, min: 0, default: 0 },
    minOrder:     { type: Number, default: 1 },
    condition:    { type: String, enum: ['new','used','refurbished'], default: 'new' },
    isAvailable:  { type: Boolean, default: true },
    isFeatured:   { type: Boolean, default: false },
    isTrending:   { type: Boolean, default: false },
    trendingUntil:Date,
    bnplEligible: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ['draft','pending_moderation','approved','rejected','archived','out_of_stock','hidden','flagged'],
      default: 'pending_moderation',
    },
    rejectionReason: String,
    flagReason: String,

    tags:         [{ type: String, lowercase: true }],
    deliveryTime: { type: String, default: '2-3 hours' },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: '2dsphere',
      },
    },
    address: { type: String },

    rating:       { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },

    totalSold:    { type: Number, default: 0 },
    views:        { type: Number, default: 0 },

    isDeleted: { type: Boolean, default: false, select: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ seller: 1 });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ isFeatured: 1 });
productSchema.index({ status: 1, isAvailable: 1 });
productSchema.index({ isTrending: 1, status: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ flashSaleEnd: 1 }, { sparse: true });
productSchema.index({ totalSold: -1 });
productSchema.index({ isDeleted: 1, isAvailable: 1 });
// getMyProducts (productController) filters by seller and sorts by
// createdAt together — every seller's "My Products" screen hits this.
// The single-field seller and createdAt indexes above can each serve half
// of that, but Mongo can only use one of them per query; without this,
// it uses the seller index to find matches and then sorts that result set
// in memory rather than walking an index already in the right order.
productSchema.index({ seller: 1, createdAt: -1 });

// ─── Pre-save ────────────────────────────────────────────────────────────────
productSchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) {
    const slugify = require('slugify');
    const { v4: uuidv4 } = require('uuid');
    this.slug = `${slugify(this.name, { lower: true, strict: true })}-${uuidv4().slice(0, 6)}`;
  }
  next();
});

// ─── Query middleware — exclude soft-deleted ──────────────────────────────────
productSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: { $ne: true } });
  next();
});

// ─── Virtuals ─────────────────────────────────────────────────────────────────
productSchema.virtual('discountPercent').get(function () {
  if (this.originalPrice && this.originalPrice > this.price) {
    return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
  }
  return null;
});

productSchema.virtual('shareUrl').get(function () {
  return `https://wimakit.sl/product/${this._id}`;
});

module.exports = mongoose.model('Product', productSchema);
