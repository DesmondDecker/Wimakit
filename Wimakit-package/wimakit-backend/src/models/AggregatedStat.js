const mongoose = require('mongoose');

const aggregatedStatSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      unique: true, // Ensure only one entry per day
    },
    dailyTotal: {
      type: Number,
      default: 0,
    },
    orderCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AggregatedStat', aggregatedStatSchema);