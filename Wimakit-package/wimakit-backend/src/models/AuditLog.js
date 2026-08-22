const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { 
    type: String, 
    required: true, 
    enum: [
      'BAN_USER', 'UNBAN_USER', 'SUSPEND_USER', 'UNSUSPEND_USER', 'WARN_USER', 'RECOVER_ACCOUNT',
      'VERIFY_SELLER', 'APPROVE_PRODUCT', 'RESOLVE_DISPUTE', 'UPDATE_SETTINGS', 'ADJUST_WALLET',
      'RESET_USER_PASSWORD', 'RESET_USER_EMAIL', 'RESET_USER_PHONE', 'SET_BNPL_ELIGIBILITY', 'SET_LOAN_ELIGIBILITY',
      'CHANGE_USER_ROLE', 'AWARD_BADGE', 'SUSPEND_RIDER', 'REJECT_RIDER', 'BATCH_PAY_RIDERS',
      'VERIFY_ESCROW_PAYMENT', 'REFUND_ESCROW',
      'FORGIVE_BNPL_DEFAULT', 'CANCEL_BNPL_PLAN', 'WAIVE_BNPL_LATE_FEE',
    ] 
  },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  targetModel: { type: String, required: true, enum: ['User', 'Product', 'Order', 'BnplPlan', 'LegalPage', 'SiteSettings'] },
  details: { type: String },
  ipAddress: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

auditLogSchema.index({ admin: 1, createdAt: -1 });
auditLogSchema.index({ targetId: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);