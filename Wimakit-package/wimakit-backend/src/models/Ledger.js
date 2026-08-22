const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true }, // Negative for DR, Positive for CR
  type: { 
    type: String, 
    enum: ['ORDER_PAYMENT', 'PAYOUT', 'REFUND', 'COMMISSION', 'DELIVERY_FEE', 'ADJUSTMENT', 'ESCROW_RELEASE', 'ESCROW_REFUND'], 
    required: true 
  },
  status: { type: String, enum: ['PENDING', 'COMPLETED', 'CANCELLED'], default: 'PENDING' },
  referenceId: { type: mongoose.Schema.Types.ObjectId, required: true }, // OrderID or PayoutID
  referenceModel: { type: String, enum: ['Order', 'Payout', 'User', 'Loan', 'BnplPlan'], required: true },
  description: String,
  balanceAfter: { type: Number, required: true }, // Snapshot for audit
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

ledgerSchema.index({ user: 1, createdAt: -1 });
ledgerSchema.index({ referenceId: 1 });
// orderController's cancelOrder/resolveComplaint reverse an escrow-hold
// entry via findOneAndUpdate({ referenceId, type: 'ORDER_PAYMENT', user }) —
// this is the disambiguating lookup that distinguishes the seller's hold
// entry from the buyer's debit entry when both share the same referenceId
// (see the comment at those call sites). The single-field referenceId
// index above only narrows to "documents for this order"; this compound
// index covers the exact shape of that lookup.
ledgerSchema.index({ referenceId: 1, type: 1, user: 1 });

module.exports = mongoose.model('Ledger', ledgerSchema);