const mongoose = require('mongoose');
const instalmentSchema = new mongoose.Schema({
  dueDate:  { type: Date, required: true },
  amount:   { type: Number, required: true },
  status:   { type: String, enum: ['pending','paid','overdue'], default: 'pending' },
  paidAt:   Date, lateFee: { type: Number, default: 0 },
  // Separate from lateFee > 0 so a genuinely free (0% lateFeeRate) plan
  // doesn't get re-evaluated as "not yet charged" every day the sweep runs
  // — see tasks/bnplOverdueSweep.js.
  lateFeeCharged: { type: Boolean, default: false },
  reminderSentAt: Date,
});
const bnplSchema = new mongoose.Schema({
  userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  planType:         { type: String, enum: ['2x','3x','6x','12x'], required: true },
  totalAmount:      { type: Number, required: true },
  instalmentAmount: { type: Number, required: true },
  instalments:      { type: Number, required: true },
  paidInstalments:  { type: Number, default: 0 },
  nextDueDate:      Date,
  interestRate:     { type: Number, default: 0 },
  lateFeeRate:      { type: Number, default: 0.02 },
  status:           { type: String, enum: ['active','paid','overdue','defaulted','cancelled'], default: 'active' },
  instalmentSchedule: [instalmentSchema],
  totalLateFees:    { type: Number, default: 0 },
}, { timestamps: true });
bnplSchema.index({ userId: 1, status: 1 });
module.exports = mongoose.model('BnplPlan', bnplSchema);
