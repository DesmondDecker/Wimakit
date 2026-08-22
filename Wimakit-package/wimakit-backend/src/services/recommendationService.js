const { Product, Category, Order } = require('../models'); 
const User = require('../models/User');
const logger = require('../utils/logger');

let recommenderEngine = null;
let lastBuildTime = 0;

/**
 * Builds or rebuilds the recommendation engine from user interaction data.
 * In a real application, this would be done periodically or on specific events,
 * and the engine would be cached.
 */
const buildEngine = async () => {
  logger.info('Building recommendation engine...');
  if (global.USE_MEMORY_DB) {
    logger.info('ℹ️ AI Engine: Skipping build in memory mode.');
    return;
  }

  const users = await User.find({}).select('_id wishlist').lean();
  const products = await Product.find({}).select('_id').lean();

  logger.info(`📊 AI Engine: Initialized with ${users.length} users and ${products.length} products.`);
  recommenderEngine = true; // Mark as initialized
};

/**
 * Gets personalized product recommendations for a given user.
 */
exports.getRecommendations = async (userId, limit = 10) => {
  if (!recommenderEngine) {
    await buildEngine(); // Ensure engine is "built" (initialized)
  }

  const user = await User.findById(userId).select('wishlist searchHistory');
  if (!user) return [];

  // 1. Get interests from wishlist and search history
  const wishlistProducts = await Product.find({ _id: { $in: user.wishlist } }).select('category tags');
  const searchInterests = user.searchHistory || [];
  
  const favoriteCategoryIds = [...new Set(wishlistProducts.map(p => p.category.toString()))];
  const favoriteTags = [...new Set(wishlistProducts.flatMap(p => p.tags || []))];

  const recommendations = await Product.find({
    $or: [
      { category: { $in: favoriteCategoryIds } },
      { tags: { $in: [...favoriteTags, ...searchInterests] } },
      { name: { $in: searchInterests.map(i => new RegExp(i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } }
    ],
    _id: { $nin: user.wishlist }, 
    isAvailable: true,
    status: 'approved'
  })
  .limit(limit)
  .select('_id'); // Only fetch IDs for now

  return recommendations.map(r => r._id.toString());
};

/**
 * Gets sellers specialized in the user's favorite categories.
 */
exports.getRecommendedSellers = async (userId, limit = 5) => {
  const user = await User.findById(userId).select('wishlist');
  if (!user || !user.wishlist?.length) return [];

  // 1. Identify favorite categories from wishlist
  const wishlistProducts = await Product.find({ _id: { $in: user.wishlist } }).select('category');
  const favoriteCategoryIds = [...new Set(wishlistProducts.map(p => p.category.toString()))];

  // 2. Find sellers with high-rated products in those categories
  const matchingProducts = await Product.find({
    category: { $in: favoriteCategoryIds },
    isAvailable: true
  })
  .select('seller rating')
  .lean();

  // 3. Rank sellers by frequency and rating in those categories
  const frequency = matchingProducts.reduce((acc, p) => {
    const sId = p.seller.toString();
    acc[sId] = (acc[sId] || 0) + (p.rating || 4);
    return acc;
  }, {});

  return Object.keys(frequency).sort((a, b) => frequency[b] - frequency[a]).slice(0, limit);
};

exports.getPeopleAlsoBought = async (productId, limit = 5) => {
  // Find orders containing this product
  const orders = await Order.find({ 'items.product': productId }).limit(20).lean();
  const otherProductIds = orders.flatMap(o => o.items.map(i => i.product.toString()))
    .filter(id => id !== productId.toString());
    
  // Get most common occurrences
  const frequency = otherProductIds.reduce((acc, id) => { acc[id] = (acc[id] || 0) + 1; return acc; }, {});
  return Object.keys(frequency).sort((a, b) => frequency[b] - frequency[a]).slice(0, limit);
};