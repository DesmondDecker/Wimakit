'use strict';

const { Product, User, Category } = require('../models/index');
const logger = require('../utils/logger');
const recommendationService = require('../services/recommendationService');
const Notification = require('../models/Notification');
const Follow = require('../models/Follow');
const mongoose = require('mongoose');

// @desc    Get all products
// @route   GET /api/products
exports.listProducts = async (req, res, next) => {
  try {
    if (global.USE_MEMORY_DB) {
      return res.status(200).json({ success: true, products: global.memoryProducts || [] });
    }

    const { q, category, subcategory, sort, limit = 20, page = 1, trending, bnpl, condition } = req.query;
    const query = { isAvailable: true, status: 'approved' };
    const andConditions = [];

    // Previously 3+ character queries used MongoDB's $text search, which only
    // matches whole, stemmed words (e.g. "yogurt"), not substrings or prefixes
    // (e.g. "yog"). Since search fires as the user types — almost always a
    // partial word — that silently returned zero results for the overwhelming
    // majority of real searches, even for products that were approved and
    // present. A case-insensitive substring regex across name/description/tags
    // trades a bit of query-plan efficiency for actually finding the product,
    // which matters far more at this catalog size. Revisit with a proper
    // index-backed approach once the catalog is large enough for it to matter.
    if (q && q.trim().length > 0) {
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      andConditions.push({
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { description: { $regex: escaped, $options: 'i' } },
          { tags: { $regex: escaped, $options: 'i' } },
        ],
      });
    }

    if (category) {
      if (mongoose.Types.ObjectId.isValid(category)) {
        query.category = category;
      } else {
        const matchedCat = await Category.findOne({
          $or: [{ slug: category }, { name: { $regex: `^${category}$`, $options: 'i' } }],
        }).select('_id').lean();
        if (matchedCat) {
          query.category = matchedCat._id;
        }
      }
    }
    if (subcategory) query.subcategory = subcategory;
    // trendingUntil is written whenever a product is marked trending (see
    // adminController.setProductTrending) but nothing ever read it — there's
    // no cron/job runner in this backend to sweep expired flags, so once set,
    // isTrending stayed true forever. Filtering on trendingUntil here makes
    // expiry lazy/self-healing at read time instead: a product past its
    // trending window just stops matching, no background job required.
    // Combined with the search filter above via $and (both use $or internally,
    // so setting them as two separate query.$or assignments would silently
    // let the second overwrite the first).
    if (trending === 'true') {
      query.isTrending = true;
      andConditions.push({ $or: [{ trendingUntil: null }, { trendingUntil: { $gt: new Date() } }] });
    }
    if (bnpl === 'true') query.bnplEligible = true;
    if (condition) query.condition = condition;
    if (andConditions.length > 0) query.$and = andConditions;

    let productsQuery = Product.find(query)
      .populate('seller', 'storeName name avatar totalSales followersCount rating profileSlug isVerified')
      .populate('category');

    productsQuery = productsQuery.sort(sort || '-createdAt');

    const products = await productsQuery
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const count = await Product.countDocuments(query);

    res.status(200).json({ success: true, count, products, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
};

// @desc    Get featured products
// @route   GET /api/products/featured
exports.getFeatured = async (req, res, next) => {
  try {
    if (global.USE_MEMORY_DB) {
      const featured = (global.memoryProducts || []).filter(p => p.isFeatured);
      return res.status(200).json({ success: true, products: featured });
    }
    const products = await Product.find({ isFeatured: true, isAvailable: true, status: 'approved' }).populate('seller', 'storeName name avatar totalSales followersCount rating profileSlug');
    res.status(200).json({ success: true, products });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public for approved products; seller (own) and admin may preview any status
exports.getProduct = async (req, res, next) => {
  try {
    if (global.USE_MEMORY_DB) {
      const product = (global.memoryProducts || []).find(p => p._id === req.params.id || p.id === req.params.id);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      return res.status(200).json({ success: true, data: product });
    }
    const product = await Product.findById(req.params.id).populate('seller').populate('category');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Moderation gate: only the owning seller or an admin may view a product
    // that isn't approved/available. Everyone else gets a 404 — this prevents
    // pending/rejected/flagged/hidden listings from being viewed or purchased
    // by guessing/sharing a direct link, while keeping search/listing already safe.
    const ownerId = product.seller?._id ? product.seller._id.toString() : product.seller?.toString();
    const isOwner = req.user && ownerId === req.user.id;
    const isAdmin = req.user && req.user.role === 'admin';
    const isPubliclyVisible = product.status === 'approved' && product.isAvailable;

    if (!isPubliclyVisible && !isOwner && !isAdmin) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Async view count increment — non-blocking (skip for owner/admin previews)
    if (isPubliclyVisible) {
      Product.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).catch(() => {});
    }
    res.status(200).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

// @desc    Get products for current seller
// @route   GET /api/products/seller/mine
exports.getMyProducts = async (req, res, next) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const filter = { seller: req.user.id };
    if (status) filter.status = status;
    const products = await Product.find(filter)
      .populate('category', 'name icon color')
      .sort('-createdAt')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    const count = await Product.countDocuments(filter);
    res.status(200).json({ success: true, products, count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
};

// @desc    Create product
// @route   POST /api/products
exports.createProduct = async (req, res, next) => {
  try {
    const { saveImages } = require('../utils/imageStorage');
    const body = req.body;

    let attributes = {};
    if (body.attributes) {
      try { attributes = typeof body.attributes === 'string' ? JSON.parse(body.attributes) : body.attributes; } catch {}
    }

    let tags = [];
    if (body['tags[]']) tags = Array.isArray(body['tags[]']) ? body['tags[]'] : [body['tags[]']];
    else if (body.tags) tags = Array.isArray(body.tags) ? body.tags : String(body.tags).split(',').map(t => t.trim()).filter(Boolean);

    const images = req.files?.length ? await saveImages(req.files, req) : (body.images ? (Array.isArray(body.images) ? body.images : [body.images]) : []);

    const product = await Product.create({
      name: body.name,
      description: body.description,
      price: Number(body.price),
      originalPrice: body.originalPrice ? Number(body.originalPrice) : undefined,
      images,
      category: body.category,
      subcategory: body.subcategory || undefined,
      attributes,
      seller: req.user.id,
      stock: Number(body.stock) || 0,
      minOrder: Number(body.minOrder) || 1,
      condition: body.condition || 'new',
      deliveryTime: body.deliveryTime || '1-3 days',
      // Accept {lat, lng} coords or fallback to address string on Product.address field
      ...(body.lat && body.lng
        ? { location: { type: 'Point', coordinates: [parseFloat(body.lng), parseFloat(body.lat)] }, address: body.address || body.location || 'Freetown, Sierra Leone' }
        : { address: body.location || body.address || 'Freetown, Sierra Leone' }
      ),
      tags,
      bnplEligible: body.bnplEligible === 'true' || body.bnplEligible === true,
      status: 'pending_moderation',
    });

    await User.findByIdAndUpdate(req.user.id, { $inc: { totalProducts: 1 } });
    res.status(201).json({ success: true, product, data: product });
  } catch (err) {
    next(err);
  }
};

// @desc    Update product
exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Ownership check — sellers can only edit their own products
    if (req.user.role !== 'admin' && product.seller.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorised to edit this product' });
    }

    const update = { ...req.body };
    // Strip fields sellers should not self-set
    if (req.user.role !== 'admin') {
      delete update.status;
      delete update.isFeatured;
      delete update.isTrending;
      delete update.seller;
    }
    if (update.attributes && typeof update.attributes === 'string') {
      try { update.attributes = JSON.parse(update.attributes); } catch { delete update.attributes; }
    }
    // Reset to pending_moderation when key fields change so admin re-approves
    const moderationFields = ['name', 'description', 'price', 'images'];
    if (req.user.role !== 'admin' && moderationFields.some(f => update[f] !== undefined)) {
      update.status = 'pending_moderation';
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    res.status(200).json({ success: true, data: updated, product: updated });
  } catch (err) {
    next(err);
  }
};

// @desc    Update product status (admin moderation alias)
exports.updateProductStatus = async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    const update = { status };
    if (reason) update.rejectionReason = reason;
    const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true });
    res.status(200).json({ success: true, product });
  } catch (err) { next(err); }
};

// @desc    Delete product (soft delete)
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Ownership check
    if (req.user.role !== 'admin' && product.seller.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorised to delete this product' });
    }

    // Soft delete — preserves order history, reviews, etc.
    await Product.findByIdAndUpdate(req.params.id, { isDeleted: true, isAvailable: false, status: 'archived' });
    await User.findByIdAndUpdate(product.seller, { $inc: { totalProducts: -1 } });

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

// @desc    Get AI-refined personalized suggestions
// @route   GET /api/products/suggestions
// @access  Private
exports.getPersonalizedSuggestions = async (req, res, next) => {
  try {
    const user = req.user;
    const limit = parseInt(req.query.limit) || 10;

    if (global.USE_MEMORY_DB) {
      const suggested = [...(await Product.find({ isAvailable: true, status: 'approved' }).select('_id name images price rating category isTrending').lean())]
        .sort(() => Math.random() - 0.5)
        .slice(0, limit)
        .map(p => ({ ...p, suggestionReason: 'Hand-picked' }));
      return res.status(200).json({ success: true, products: suggested });
    }

    let recommendedProductIds = [];
    try {
      recommendedProductIds = await recommendationService.getRecommendations(user._id, limit);
    } catch (recError) {
      logger.error('Error getting recommendations from engine:', recError.message);
    }

    // Every pillar below only ever checked isAvailable — not status — so a
    // product still sitting in pending_moderation (or rejected/flagged) could
    // leak into a buyer's "suggested" feed before an admin ever approved it.
    // status: 'approved' is now required everywhere a pillar reads Product.
    let aiRecommendations = [];
    if (recommendedProductIds.length > 0) {
      const rawAi = await Product.find({ _id: { $in: recommendedProductIds }, isAvailable: true, status: 'approved' })
        .populate('seller', 'storeName name avatar totalSales followersCount rating profileSlug')
        .limit(5)
        .lean();
      aiRecommendations = rawAi.map(p => ({ ...p, suggestionReason: 'Personal Preference' }));
    }

    // 1. Proximity Pillar: Find items within 10km of user's current GPS
    let proximityItems = [];
    if (user.location?.coordinates?.length === 2) {
      const rawProx = await Product.find({
        location: {
          $near: {
            $geometry: user.location,
            $maxDistance: 10000
          }
        },
        isAvailable: true,
        status: 'approved',
        _id: { $nin: aiRecommendations.map(p => p._id) }
      }).limit(3).populate('seller', 'storeName name avatar totalSales followersCount rating profileSlug').lean();
      proximityItems = rawProx.map(p => ({ ...p, suggestionReason: 'Near You' }));
    }

    // 2. Interest Pillar: Items matching categories in User's Wishlist (content-based)
    let interestItems = [];
    if (user.wishlist?.length > 0) {
      const wishlistProducts = await Product.find({ _id: { $in: user.wishlist } }).select('category');
      const favoriteCategories = [...new Set(wishlistProducts.map(p => p.category))];
      
      const rawInterest = await Product.find({
        category: { $in: favoriteCategories },
        _id: { $nin: [...user.wishlist, ...aiRecommendations.map(p => p._id), ...proximityItems.map(p => p._id)] },
        isAvailable: true,
        status: 'approved'
      }).limit(3).populate('seller', 'storeName name').lean();
      interestItems = rawInterest.map(p => ({ ...p, suggestionReason: 'Based on Wishlist' }));
    }

    // 3. Performance Pillar: Top Rated & Trending (fallback)
    const rawTrending = await Product.find({ 
      isAvailable: true,
      status: 'approved',
      rating: { $gte: 4 },
      _id: { $nin: [...aiRecommendations.map(p => p._id), ...proximityItems.map(p => p._id), ...interestItems.map(p => p._id)] }
    })
    .sort({ totalSold: -1, rating: -1 })
    .limit(5)
    .populate('seller', 'storeName name avatar totalSales followersCount rating profileSlug')
    .lean();
    const trendingItems = rawTrending.map(p => ({ ...p, suggestionReason: 'Trending Now' }));

    let combined = [...aiRecommendations, ...proximityItems, ...interestItems, ...trendingItems];
    const seen = new Set();
    let finalSuggestions = combined.filter(p => {
      const id = (p._id || p.id).toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, limit);

    // 4. Discovery Pillar (guaranteed fallback): a freshly approved product
    // has no ratings, no sales, no wishlist appearances, and (unless the
    // buyer happens to be nearby) no proximity match either — so it could
    // fail all three pillars above and never surface, no matter how long it
    // stayed live. Top up any remaining slots with the newest approved
    // products not already picked, so every approved product is reachable
    // from the suggested feed at least until newer approvals push it down.
    if (finalSuggestions.length < limit) {
      const excludeIds = [...seen];
      const rawNewest = await Product.find({
        isAvailable: true,
        status: 'approved',
        _id: { $nin: excludeIds }
      })
        .sort('-createdAt')
        .limit(limit - finalSuggestions.length)
        .populate('seller', 'storeName name avatar totalSales followersCount rating profileSlug')
        .lean();
      finalSuggestions = finalSuggestions.concat(
        rawNewest.map(p => ({ ...p, suggestionReason: 'New On WimaKit' }))
      );
    }

    res.status(200).json({ success: true, products: finalSuggestions });
  } catch (err) {
    next(err);
  }
};

// @desc    Get popular products (by totalSold)
// @route   GET /api/products/popular
exports.getPopularProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ isAvailable: true, status: 'approved', totalSold: { $gt: 0 } })
      .sort({ totalSold: -1 })
      .limit(10).populate('seller', 'storeName name avatar totalSales followersCount rating profileSlug').lean();
    res.status(200).json({ success: true, products });
  } catch (err) { next(err); }
};

// @desc    Get trending products
// @route   GET /api/products/trending
exports.getTrendingProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ isAvailable: true, status: 'approved' })
      .sort({ createdAt: -1 })
      .limit(10).populate('seller', 'storeName name avatar totalSales followersCount rating profileSlug').lean();
    res.status(200).json({ success: true, products });
  } catch (err) { next(err); }
};

// @desc    Get products related to a specific product
// @route   GET /api/products/:id/related
exports.getRelatedProducts = async (req, res, next) => {
  try {
    const relatedProductIds = await recommendationService.getPeopleAlsoBought(req.params.id, 5);
    const products = await Product.find({ _id: { $in: relatedProductIds }, isAvailable: true, status: 'approved' })
      .populate('seller', 'storeName name avatar totalSales followersCount rating profileSlug').lean();
    res.status(200).json({ success: true, products });
  } catch (err) { next(err); }
};

// @desc    Record user search interest
// @route   POST /api/products/search-history
exports.recordSearchInterest = async (req, res, next) => {
  try {
    const { keyword } = req.body;
    if (!keyword) return res.status(400).json({ success: false });
    const normalized = keyword.toLowerCase().trim();
    if (!normalized) return res.status(400).json({ success: false });

    // This was firing on every settled debounce tick from the client
    // (every ~350ms pause while typing), writing unconditionally — so
    // typing "shoes" with even one short pause could leave both "sho" and
    // "shoes" in history, or the same term several times in a row. Skipping
    // the write when the normalized keyword matches the most recent entry
    // collapses that down to one entry per distinct search, without needing
    // any change to the client's existing debounce.
    const user = await User.findById(req.user.id).select('searchHistory');
    if (user?.searchHistory?.[0] === normalized) {
      return res.status(200).json({ success: true });
    }

    await User.findByIdAndUpdate(req.user.id, {
      $push: { searchHistory: { $each: [normalized], $position: 0, $slice: 10 } }
    });
    res.status(200).json({ success: true });
  } catch (err) { next(err); }
};

// @desc    Get trending search terms platform-wide
// @route   GET /api/products/trending-searches
exports.getTrendingSearches = async (req, res, next) => {
  try {
    const trending = await User.aggregate([
      { $unwind: '$searchHistory' },
      { $group: { _id: '$searchHistory', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    res.status(200).json({ success: true, data: trending.map((t) => t._id) });
  } catch (err) { next(err); }
};

// @desc    Get products from followed sellers
// @route   GET /api/products/following
// @access  Private
exports.getFollowingProducts = async (req, res, next) => {
  try {
    // User.following is deprecated in favor of the Follow collection
    // (models/Follow.js) — see profileController's follow/unfollow handlers.
    const edges = await Follow.find({ follower: req.user.id }).select('followee').lean();
    if (!edges.length) {
      return res.status(200).json({ success: true, count: 0, products: [] });
    }
    const followingIds = edges.map(e => e.followee);

    const products = await Product.find({ 
      seller: { $in: followingIds },
      isAvailable: true,
      status: 'approved',
    })
    .populate('seller', 'storeName name avatar profileSlug rating')
    .populate('category', 'name icon')
    .sort('-createdAt')
    .limit(30)
    .lean();

    res.status(200).json({ success: true, count: products.length, products });
  } catch (err) {
    next(err);
  }
};

// @desc    Clear entire search history
// @route   DELETE /api/products/search-history
exports.clearSearchHistory = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $set: { searchHistory: [] } });
    res.status(200).json({ success: true, message: 'Search history cleared.' });
  } catch (err) { next(err); }
};

// @desc    Delete specific keyword from search history
// @route   DELETE /api/products/search-history/:keyword
exports.deleteSearchKeyword = async (req, res, next) => {
  try {
    const { keyword } = req.params;
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { searchHistory: decodeURIComponent(keyword).toLowerCase() }
    });
    res.status(200).json({ success: true, message: 'Keyword removed.' });
  } catch (err) { next(err); }
};