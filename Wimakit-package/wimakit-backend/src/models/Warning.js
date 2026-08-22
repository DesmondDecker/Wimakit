const mongoose = require('mongoose');
const warningSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason:    { type: String, required: true },
  severity:  { type: String, enum: ['low','medium','high'], default: 'low' },
  message:   { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  acknowledged: { type: Boolean, default: false },
  acknowledgedAt: Date,
}, { timestamps: true });
// adminController.getWarnings does Warning.find().sort({createdAt:-1}).limit(50)
// with no filter at all — without an index on createdAt, that sort has
// nothing to walk in order and has to load + sort the entire collection in
// memory before returning the top 50. Fine at a few hundred warnings,
// exactly the same class of problem as the Users/Sellers admin tabs before
// their compound indexes were added, and this app's own stated scale target
// is hundreds of thousands of users.
warningSchema.index({ createdAt: -1 });
module.exports = mongoose.model('Warning', warningSchema);
