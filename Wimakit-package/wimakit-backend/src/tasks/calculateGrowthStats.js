const cron = require('node-cron');
const Order = require('../models/Order');
const AggregatedStat = require('../models/AggregatedStat');
const logger = require('../utils/logger');

const calculateAndStoreGrowthStats = async () => {
  try {
    logger.info('Running scheduled task: calculateAndStoreGrowthStats');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0); // Start of the day

    const stats = await Order.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          dailyTotal: { $sum: "$total" },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    for (const stat of stats) {
      const date = new Date(stat._id.year, stat._id.month - 1, stat._id.day);
      await AggregatedStat.findOneAndUpdate(
        { date: date },
        { dailyTotal: stat.dailyTotal, orderCount: stat.orderCount },
        { upsert: true, new: true }
      );
    }

    logger.info('Successfully updated aggregated growth stats.');
  } catch (error) {
    logger.error('Error in scheduled task calculateAndStoreGrowthStats:', error);
  }
};

const startGrowthStatsScheduler = () => {
  // Schedule to run every hour
  cron.schedule('0 * * * *', calculateAndStoreGrowthStats);
  logger.info('Growth stats scheduler started. Runs hourly.');
};

module.exports = { startGrowthStatsScheduler, calculateAndStoreGrowthStats };