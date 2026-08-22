const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // alias for recipient (v3)
    sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: {
      type: String,
      enum: [
        'new_product', 'order_status', 'message', 'promotion', 'system', 'new_follower',
        // v3 additions
        'warning', 'kyc_approved', 'kyc_rejected', 'product_approved', 'product_rejected',
        'product_trending', 'loan_approved', 'wallet_debit', 'wallet_credit',
        'community_like', 'community_comment', 'community_mention', 'community_follow', 'community_post',
        'bnpl_reminder', 'ad',
      ],
      required: true,
      default: 'system',
    },
    title:   { type: String },
    message: { type: String, required: true },
    read:    { type: Boolean, default: false },
    readAt:  Date,
    link:    { type: String },
    data:    { type: mongoose.Schema.Types.Mixed },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
// userId is aliased to recipient on pre-save — only recipient index needed
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // Auto-delete after 90 days
notificationSchema.pre('save', function (next) {
  if (!this.recipient && this.userId) this.recipient = this.userId;
  if (!this.userId && this.recipient) this.userId = this.recipient;
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);
