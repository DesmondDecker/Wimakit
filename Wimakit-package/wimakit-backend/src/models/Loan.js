const mongoose = require('mongoose');
const loanSchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productType:     { type: String, enum: ['micro','small','business'], required: true },
  amount:          { type: Number, required: true },
  approvedAmount:  Number,
  interestRate:    { type: Number, required: true },
  termDays:        { type: Number, required: true },
  purpose:         String,
  status:          { type: String, enum: ['applied','under_review','approved','rejected','disbursed','repaid','defaulted'], default: 'under_review' },
  monthlyRepayment: Number,
  remainingAmount:  Number,
  dueDate:          Date,
  disbursedAt:      Date,
  repaidAt:         Date,
  repaidAmount:     { type: Number, default: 0 },
  adminNote:        String,
  reviewedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt:       Date,
  employmentStatus: String,
  monthlyIncome:    Number,
  guarantorName:    String,
  guarantorPhone:   String,
  lastReminderSentAt: Date,
}, { timestamps: true });
loanSchema.index({ userId: 1, status: 1 });
module.exports = mongoose.model('Loan', loanSchema);
