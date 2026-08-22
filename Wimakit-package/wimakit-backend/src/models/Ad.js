const mongoose = require('mongoose');
const adSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  subtitle:     String,
  description:  String,
  icon:         String,
  colors:       [String],
  link:         String,
  image:        String,
  targetUrl:    String,
  targetType:   { type: String, enum: ['product','store','external','community'] },
  targetId:     String,
  placement:    { type: String, enum: ['feed','home','home_banner','search','category','profile'], default: 'feed' },
  status:       { type: String, enum: ['draft','active','paused','ended','pending_review'], default: 'active' },
  startDate:    Date, endDate: Date,
  budget:       Number, spent: { type: Number, default: 0 },
  impressions:  { type: Number, default: 0 },
  clicks:       { type: Number, default: 0 },
  advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  audienceRole: { type: String, enum: ['all','buyer','seller','rider'], default: 'all' },
}, { timestamps: true });
adSchema.index({ status: 1, placement: 1 });
module.exports = mongoose.model('Ad', adSchema);
