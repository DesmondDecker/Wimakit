const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:      { type: String, required: true },
  image:     { type: String },
  price:     { type: Number, required: true },
  quantity:  { type: Number, required: true, min: 1 },
});

const OrderSchema = new mongoose.Schema(
  {
    customOrderId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    // buyer is optional for guest orders — use guestInfo instead
    buyer: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      default: null,
    },
    // ── Guest checkout support ────────────────────────────────────────────────
    isGuestOrder: { type: Boolean, default: false },
    guestInfo: {
      name:  { type: String },
      phone: { type: String },
      email: { type: String },
    },
    seller: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    rider: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      default: null,
    },
    items: { type: [orderItemSchema], required: true },
    deliveryAddress: {
      type: String,
      required: true,
    },
    deliveryCoordinates: {
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
    buyerPhone: String,
    notes: { type: String },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'packed', 'awaiting_rider',
             'rider_assigned', 'picked_up', 'in_transit', 'near_delivery',
             'delivered', 'completed', 'disputed', 'resolved', 'refunded',
             'failed_delivery', 'returned', 'cancelled'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['orange_money', 'afrimoney', 'moneymi', 'wallet', 'bnpl', 'cod', 'platform_escrow'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    // ── Platform escrow / payment flow ──────────────────────────────────────
    platformPayment: {
      // Buyer pays platform; platform pays seller on delivery
      isPlatformEscrow: { type: Boolean, default: false },
      buyerPaidAt:      { type: Date },   // buyer's own claim that they paid
      verifiedAt:       { type: Date },   // admin confirmed the claim is real
      verifiedBy:       { type: mongoose.Schema.ObjectId, ref: 'User' },
      sellerPaidAt:     { type: Date },
      refundedAt:       { type: Date },
      paymentRef:       { type: String }, // mobile money txn ref
      mobileMoneyNumber:{ type: String },
    },

    subtotal:    { type: Number, required: true },
    total:       { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },

    // ── WhatsApp sharing ────────────────────────────────────────────────────
    whatsappShareText: { type: String }, // pre-built share string
    whatsappSharedAt:  { type: Date },

    riderName:  { type: String },
    riderPhone: { type: String },
    deliveredAt:    { type: Date },
    cancelledAt:    { type: Date },
    cancelReason:   { type: String },

    complaint: {
      subject:    { type: String },
      message:    { type: String },
      status:     { type: String, enum: ['none', 'pending', 'investigating', 'resolved', 'refunded'], default: 'none' },
      reportedAt: { type: Date },
      resolution: { type: String },
    },
    trackingUpdates: [
      {
        status: String,
        message: String,
        timestamp: { type: Date, default: Date.now },
        location: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: [Number],
        },
      },
    ],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

OrderSchema.index({ buyer: 1, createdAt: -1 });
OrderSchema.index({ seller: 1, createdAt: -1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ isGuestOrder: 1 });
OrderSchema.index({ rider: 1, status: 1 });
// getMyOrders lets a buyer/seller/rider filter their own order list by
// status (the frontend's tab filters in (tabs)/orders.tsx pass this
// straight through as req.query.status) while also sorting by createdAt.
// The 2-field compounds above cover the unfiltered "all my orders, newest
// first" case well; they don't cover role+status+sort together, which
// needs its own index or falls back to an in-memory sort over whatever the
// role index found. Both sets of indexes are kept since they serve
// genuinely different shapes of the same query.
OrderSchema.index({ buyer: 1, status: 1, createdAt: -1 });
OrderSchema.index({ seller: 1, status: 1, createdAt: -1 });
OrderSchema.index({ rider: 1, status: 1, createdAt: -1 });

OrderSchema.virtual('shareUrl').get(function () {
  return `https://wimakit.sl/order/${this.customOrderId}`;
});

/**
 * Auto-build WhatsApp share text before save if not already set
 */
OrderSchema.pre('save', function (next) {
  if (!this.whatsappShareText && this.customOrderId) {
    const itemLines = (this.items || [])
      .map(i => `  • ${i.name} x${i.quantity} — Le ${(i.price * i.quantity).toLocaleString()}`)
      .join('\n');
    this.whatsappShareText =
      `🛍 *WimaKit Order #${this.customOrderId}*\n` +
      `${itemLines}\n` +
      `📦 Delivery: ${this.deliveryAddress}\n` +
      `💳 Payment: ${this.paymentMethod.replace(/_/g, ' ').toUpperCase()}\n` +
      `💰 Total: Le ${(this.total || 0).toLocaleString()}\n` +
      `🔗 Track: https://wimakit.sl/order/${this.customOrderId}`;
  }
  next();
});

const Order = mongoose.models && mongoose.models.Order
  ? mongoose.models.Order
  : mongoose.model('Order', OrderSchema);

module.exports = Order;
