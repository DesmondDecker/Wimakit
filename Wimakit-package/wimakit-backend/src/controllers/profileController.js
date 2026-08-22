'use strict';

const mongoose = require('mongoose');
const User    = require('../models/User');
const Notification = require('../models/Notification');
const { createNotification } = require('../utils/notifications');
const Product = require('../models/Product');
const Follow  = require('../models/Follow');
const { Order } = require('../models/index');
const { cache, TTL } = require('../config/redis');
const recommendationService = require('../services/recommendationService');

// ─── Public profile by slug ────────────────────────────────────────────────────
exports.getProfile = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const cacheKey  = `profile:${slug}`;
    let response = await cache.get(cacheKey);

    if (!response) {
      const user = await User.findOne({ profileSlug: slug, isActive: true })
        .select('-password -emailVerifyToken -passwordResetToken -passwordResetExpires -refreshToken -searchHistory')
        .lean();

      if (!user) return res.status(404).json({ success: false, message: 'Profile not found' });

      let products = [];
      let stats    = {};

      if (user.role === 'seller') {
        [products] = await Promise.all([
          Product.find({ seller: user._id, isAvailable: true })
            .populate('category', 'name icon')
            .sort('-createdAt -rating')
            .limit(16)
            .lean(),
        ]);

        // Aggregate seller stats
        const revResult = await Order.aggregate([
          { $match: { seller: user._id, paymentStatus: 'paid' } },
          { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
        ]);
        stats = { revenue: revResult[0]?.revenue ?? 0, orders: revResult[0]?.orders ?? 0 };
      }

      // followersCount comes from a denormalized counter kept in sync by
      // follow/unfollow below — previously this loaded the FULL followers
      // ID array (every single follower's ObjectId) just to read .length,
      // which for a popular store could mean pulling tens of thousands of
      // IDs over the wire on every profile view. `following` stayed as a
      // live, bounded array (nobody follows tens of thousands of stores),
      // so its count is just that array's length.
      const followersCount = user.followersCount || 0;
      const followingCount = user.following?.length || 0;
      const { followers, following, ...userWithoutFollowLists } = user;

      response = {
        success: true,
        profile: { ...userWithoutFollowLists, profileUrl: `https://wimakit.sl/profile/${slug}`, followersCount, followingCount },
        products,
        stats,
      };

      await cache.set(cacheKey, response, TTL.profile);
    }

    // isFollowing is relative to the CURRENT viewer, never cached alongside
    // the shared profile payload above — otherwise every visitor would see
    // whatever follow state the first visitor who warmed the cache had.
    // A single indexed existence check on the Follow collection replaces
    // loading the viewer's entire `following` array just to .some() through it.
    let isFollowing = false;
    if (req.user) {
      isFollowing = !!(await Follow.exists({ follower: req.user._id, followee: response.profile._id }));
    }

    res.json({ ...response, profile: { ...response.profile, isFollowing } });
  } catch (err) { next(err); }
};

// ─── Update own profile ────────────────────────────────────────────────────────
exports.updateMyProfile = async (req, res, next) => {
  try {
    const ALLOWED = ['name', 'bio', 'location', 'phone', 'avatar', 'storeName', 'storeDescription', 'storeBanner', 'whatsapp', 'addresses', 'categories'];
    const updates = {};
    ALLOWED.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    // payoutMethod/payoutNumber/accountName come from the store-setup form as
    // flat fields but live in the User schema as a nested payoutDetails
    // object — map them across instead of silently dropping them.
    if (req.body.payoutMethod !== undefined || req.body.payoutNumber !== undefined || req.body.accountName !== undefined) {
      updates.payoutDetails = {
        method:      req.body.payoutMethod,
        number:      req.body.payoutNumber,
        accountName: req.body.accountName,
      };
    }

    // The seller store-setup screen calls this same endpoint to submit a store
    // application. Without this, storeStatus never leaves its 'draft' default —
    // the app shows a "submitted for review!" toast but nothing on the server
    // ever reflects that, so the application can never appear in the admin
    // Sellers queue. Only advance status from draft/rejected (never silently
    // re-queue an already-approved or already-pending store on a routine edit).
    if (req.body.submitForReview) {
      const current = await User.findById(req.user._id).select('storeStatus');
      if (current && ['draft', 'rejected', undefined].includes(current.storeStatus)) {
        updates.storeStatus = 'pending_review';
      }
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });

    // Bust profile cache
    await cache.del(`profile:${user.profileSlug}`);

    res.json({ success: true, user: user.toPublicJSON() });
  } catch (err) { next(err); }
};

// ─── List stores with search ───────────────────────────────────────────────────
// @desc    Get a list of all seller stores, with optional search by store name
// @route   GET /api/profiles/stores
// @access  Public (or Private, depending on desired visibility)
exports.listStores = async (req, res, next) => {
  try {
    const { q } = req.query; // Search query for store name
    // Previously this only checked isActive, not storeStatus — so a store
    // still sitting in 'draft' or 'pending_review' (or even 'rejected') could
    // show up in public search right alongside genuinely approved stores.
    // Restricting to 'approved' here mirrors the same status-gating already
    // applied to products.
    const query = { role: 'seller', isActive: true, storeStatus: 'approved' };

    if (q) {
      query.storeName = { $regex: q, $options: 'i' }; // Case-insensitive search
    }

    const stores = await User.find(query)
      .select('_id storeName profileSlug avatar categories') // Select relevant seller store fields
      .sort('storeName')
      .lean();

    res.status(200).json({ success: true, count: stores.length, data: stores });
  } catch (err) { next(err); }
};

// ─── Follow/Unfollow User ──────────────────────────────────────────────────────
// @desc    Follow a user (seller)
// @route   POST /api/profiles/:id/follow
// @access  Private
exports.followUser = async (req, res, next) => {
  try {
    const { id } = req.params; // ID of the user/store to follow
    const followerId = req.user._id; // ID of the current user

    if (id === followerId.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot follow yourself.' });
    }

    // Follow edges now live in their own collection (models/Follow.js)
    // instead of $addToSet-ing into followers/following arrays embedded on
    // the User document — that pattern meant a popular store's document
    // grew by one ObjectId per follower forever, with no upper bound.
    // The unique (follower, followee) index makes this idempotent: a repeat
    // follow throws E11000, which is caught and treated as "already following".
    let alreadyFollowing = false;
    try {
      await Follow.create({ follower: followerId, followee: id });
    } catch (err) {
      if (err.code === 11000) {
        alreadyFollowing = true;
      } else {
        throw err;
      }
    }

    const [targetUser, currentUser] = await Promise.all([
      alreadyFollowing ? User.findById(id) : User.findByIdAndUpdate(id, { $inc: { followersCount: 1 } }, { new: true }),
      // The $addToSet into User.following used to live here — removed along
      // with the $pull in unfollowUser below. User.following is the legacy
      // array that the Follow collection was specifically introduced to
      // replace (see models/Follow.js's comment: it grew without bound and
      // the whole point of the migration was to stop writing to it). Keeping
      // the $addToSet here after the migration meant the unbounded-array
      // problem survived in parallel with the new collection, just less
      // visibly. Follow.findOne / Follow.countDocuments are the correct
      // read paths now; User.following should not be written to at all.
      alreadyFollowing ? User.findById(followerId) : User.findById(followerId),
    ]);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User/Store not found.' });
    }

    await Promise.all([
      cache.del(`profile:${targetUser.profileSlug}`),
      cache.del(`profile:${currentUser?.profileSlug}`)
    ]);

    if (!alreadyFollowing) {
      // Was: Notification.create() directly — bypassed createNotification,
      // so no Expo push was sent, no notification-preference check happened,
      // and the type 'new_follower' was used without going through the
      // schema-validated path. createNotification handles all of these.
      await createNotification(req.app.get('io'), {
        userId: id, type: 'community_follow',
        title: 'New follower',
        message: `${currentUser?.name} started following your store!`,
      }).catch(() => {});
    }

    res.status(200).json({ success: true, message: 'Successfully followed user.' });
  } catch (err) {
    next(err);
  }
};

// @desc    Unfollow a user (seller)
// @route   DELETE /api/profiles/:id/follow
// @access  Private
exports.unfollowUser = async (req, res, next) => {
  try {
    const { id } = req.params; // ID of the user/store to unfollow
    const followerId = req.user._id; // ID of the current user

    const deleted = await Follow.findOneAndDelete({ follower: followerId, followee: id });

    const [targetUser] = await Promise.all([
      deleted ? User.findByIdAndUpdate(id, { $inc: { followersCount: -1 } }, { new: true }) : User.findById(id),
      // Removed $pull from User.following here for the same reason the
      // $addToSet was removed in followUser — see comment there.
      Promise.resolve(),
    ]);

    if (targetUser) {
      if (targetUser.followersCount < 0) {
        await User.findByIdAndUpdate(id, { followersCount: 0 });
      }
      await cache.del(`profile:${targetUser.profileSlug}`);
    }

    res.status(200).json({ success: true, message: 'Successfully unfollowed user.' });
  } catch (err) {
    next(err);
  }
};

// ─── Get details for a list of followed stores ─────────────────────────────────
// @desc    Get details for a list of user IDs (typically followed stores)
// @route   GET /api/profiles/followed-stores?ids=id1,id2,id3
// @access  Private (requires authentication to get current user's following list)
exports.getFollowedStoresDetails = async (req, res, next) => {
  try {
    const { ids } = req.query;
    if (!ids) {
      return res.status(400).json({ success: false, message: 'Missing IDs query parameter.' });
    }

    const idArray = ids.split(',').map(id => new mongoose.Types.ObjectId(id.trim()));

    const stores = await User.find({ _id: { $in: idArray }, role: 'seller', isActive: true })
      .select('_id storeName profileSlug avatar followersCount') // never select the unbounded `followers` array here — it isn't used by this card view and could be huge for a popular store
      .lean();

    res.status(200).json({ success: true, count: stores.length, data: stores });
  } catch (err) {
    // Handle potential CastError if an ID is invalid
    if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid ID in list.' });
    next(err);
  }
};

// @desc    Get recommended sellers for current user
// @route   GET /api/profiles/recommended
// @access  Private
exports.getRecommendedSellers = async (req, res, next) => {
  try {
    const sellerIds = await recommendationService.getRecommendedSellers(req.user.id);
    
    if (!sellerIds.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    const sellers = await User.find({ _id: { $in: sellerIds }, isActive: true })
      .select('_id storeName profileSlug avatar followersCount rating totalSales')
      .lean();

    res.status(200).json({ success: true, data: sellers });
  } catch (err) {
    next(err);
  }
};


// ─── Addresses ───────────────────────────────────────────────────────────────
exports.getAddresses = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('addresses').lean();
    res.json({ success: true, addresses: user?.addresses ?? [] });
  } catch (err) { next(err); }
};

exports.addAddress = async (req, res, next) => {
  try {
    const { label, address, isDefault } = req.body;
    if (!label || !address) return res.status(400).json({ success: false, message: 'label and address are required' });
    const user = await User.findById(req.user.id);
    if (isDefault) user.addresses.forEach(a => { a.isDefault = false; });
    user.addresses.push({ label, address, isDefault: !!isDefault });
    await user.save();
    res.status(201).json({ success: true, addresses: user.addresses });
  } catch (err) { next(err); }
};

exports.updateAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const addr = user.addresses.id(req.params.addressId);
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
    const { label, address, isDefault } = req.body;
    if (label !== undefined) addr.label = label;
    if (address !== undefined) addr.address = address;
    if (isDefault) { user.addresses.forEach(a => { a.isDefault = false; }); addr.isDefault = true; }
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (err) { next(err); }
};

exports.deleteAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const addr = user.addresses.id(req.params.addressId);
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
    addr.deleteOne();
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (err) { next(err); }
};

exports.setDefaultAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const addr = user.addresses.id(req.params.addressId);
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
    user.addresses.forEach(a => { a.isDefault = false; });
    addr.isDefault = true;
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (err) { next(err); }
};

// ─── Avatar ──────────────────────────────────────────────────────────────────
exports.updateAvatar = async (req, res, next) => {
  try {
    const { avatarUrl } = req.body;
    if (!avatarUrl) return res.status(400).json({ success: false, message: 'avatarUrl is required' });
    const user = await User.findByIdAndUpdate(req.user.id, { avatar: avatarUrl }, { new: true });
    res.json({ success: true, avatar: user.avatar, user: user.toPublic() });
  } catch (err) { next(err); }
};

// ─── KYC ─────────────────────────────────────────────────────────────────────
exports.submitKyc = async (req, res, next) => {
  try {
    const { documents } = req.body; // array of Cloudinary URLs
    if (!documents?.length) return res.status(400).json({ success: false, message: 'At least one document is required' });
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { kycDocuments: documents, kycStatus: 'pending' },
      { new: true }
    );
    res.json({ success: true, kycStatus: user.kycStatus });
  } catch (err) { next(err); }
};

exports.getKycStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('kycStatus kycRejectionReason kycDocuments').lean();
    res.json({ success: true, kycStatus: user.kycStatus, kycRejectionReason: user.kycRejectionReason, hasDocuments: (user.kycDocuments?.length ?? 0) > 0 });
  } catch (err) { next(err); }
};
