'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const slugify  = require('slugify');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true, maxlength: 100 },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:    { type: String, trim: true },
    password: { type: String, required: true, select: false, minlength: 6 },
    avatar:   { type: String, default: null }, // null means frontend renders initials avatar
    coverPhoto: { type: String, default: null },
    role:     { type: String, enum: ['buyer', 'seller', 'rider', 'admin'], default: 'buyer' },

    // Profile
    bio:           { type: String, maxlength: 500 },
    location:      { type: String },
    profileSlug:   { type: String, unique: true, sparse: true },
    isVerified:    { type: Boolean, default: false },
    isActive:      { type: Boolean, default: true },
    accountStatus: { type: String, enum: ['active','suspended','banned','frozen','pending_verification','deleted'], default: 'active' },
    suspendedReason: String,
    bannedReason: String,
    bannedAt: Date,
    bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // KYC
    isKycVerified: { type: Boolean, default: false },
    kycStatus:     { type: String, enum: ['not_submitted','pending','approved','rejected'], default: 'not_submitted' },
    kycDocuments:  [String],
    kycRejectionReason: String,
    bnplEligible:  { type: Boolean, default: false },
    // Tracks WHY bnplEligible has its current value:
    //  'auto'           — set automatically by the spend+tenure check, may change again automatically
    //  'admin_granted'  — an admin opened BNPL manually; the auto-check will not revoke it
    //  'admin_revoked'  — an admin closed BNPL manually; the auto-check will not re-grant it
    // Admin actions always win — only another admin action changes the override state.
    // 'auto_revoked_default' is set by tasks/bnplOverdueSweep.js when a plan
    // defaults — treated as sticky exactly like an admin override (see
    // reevaluateBnplEligibility's `!== 'auto'` check), so a buyer who
    // defaulted doesn't silently regain BNPL access the next time the
    // automatic spend/tenure re-check happens to pass. Only an explicit
    // admin action (setBnplEligibility) can reset it back to 'auto'.
    bnplEligibilityOverride: { type: String, enum: ['auto', 'admin_granted', 'admin_revoked', 'auto_revoked_default'], default: 'auto' },
    bnplEligibilityUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bnplEligibilityUpdatedAt: Date,
    loanEligible:  { type: Boolean, default: false },
    creditScore:   { type: Number, default: 500, min: 0, max: 1000 },

    // Social / community
    postsCount:     { type: Number, default: 0 },
    bookmarks:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost' }],
    badges:         [{ type: { type: String }, label: String, awardedAt: { type: Date, default: Date.now } }],
    warningsCount:  { type: Number, default: 0 },
    lastWarningAt:  Date,
    adminNotes:     [{ note: String, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, createdAt: { type: Date, default: Date.now } }],

    // Push notifications
    pushTokens: [String],
    // Settings > Notifications previously rendered three switches with a
    // hardcoded `value` prop and no onValueChange handler at all — tapping
    // them visibly flipped (uncontrolled native switch state) but nothing
    // was ever read or written anywhere. These fields plus the
    // /api/auth/notification-prefs endpoint below make them real.
    notificationPrefs: {
      orderUpdates: { type: Boolean, default: true },
      promotions:   { type: Boolean, default: true },
      messages:     { type: Boolean, default: true },
    },
    // Settings > Blocked Users had no screen, no backend field, nothing —
    // it wasn't a bug in an existing feature, the feature didn't exist.
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Seller fields
    storeName:        { type: String, trim: true },
    storeDescription: { type: String, maxlength: 1000 },
    storeBanner:      { type: String },
    whatsapp:         { type: String, trim: true },
    storeStatus:      { type: String, enum: ['draft','pending_review','approved','rejected','suspended'], default: 'draft' },
    // Where a seller's payout money actually goes. Previously collected on
    // the store-setup form but never persisted anywhere — payoutMethod/
    // payoutNumber/accountName weren't in the User schema or the profile
    // update allowlist, so this data was silently dropped on submission.
    payoutDetails: {
      method:      { type: String, enum: ['orange_money', 'afrimoney', 'bank_transfer', 'qmoney'] },
      number:      { type: String, trim: true },
      accountName: { type: String, trim: true },
    },
    totalSales:       { type: Number, default: 0 },
    totalProducts:    { type: Number, default: 0 },
    storeRating:      { type: Number, default: 0, min: 0, max: 5 },
    rating:           { type: Number, default: 0, min: 0, max: 5 },
    totalReviews:     { type: Number, default: 0 },
    isTrending:       { type: Boolean, default: false },
    isFeaturedStore:  { type: Boolean, default: false },
    trendingUntil:    Date,

    // Rider fields
    vehicleType:     { type: String, enum: ['bike','motorcycle','car','van'] },
    vehicleNumber:   String,
    riderZone:       String,
    riderStatus:     { type: String, enum: ['available','busy','offline'], default: 'offline' },
    totalDeliveries: { type: Number, default: 0 },
    riderScore:      { type: Number, default: 0 },
    riderLocation:   { lat: Number, lng: Number, updatedAt: Date },

    // Buyer fields
    totalOrders:   { type: Number, default: 0 },
    loyaltyPoints: { type: Number, default: 0 },
    // `followers` is DEPRECATED in favor of the Follow collection
    // (models/Follow.js) for any given store. It's the unbounded side of the
    // relationship — a popular seller's followers list has no natural upper
    // bound and risked approaching MongoDB's 16MB document cap. Kept here
    // only so utils/migrateFollowsToCollection.js can read the pre-existing
    // data once; no code path writes to it anymore. Safe to drop after that
    // migration has been run in every environment.
    followers:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // `following` (what THIS user follows) stays live and bounded — no real
    // person follows tens of thousands of stores, so it never approaches the
    // document-size problem `followers` had. It's still kept in sync with
    // the Follow collection by follow/unfollow so the two never disagree,
    // and the client reads it directly off the logged-in user's own profile
    // for instant follow-button state across the app.
    following:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Denormalized followersCount is kept in sync by follow/unfollow so a
    // profile view never has to load another user's full follower list (or
    // run a count query) just to display a number.
    followersCount: { type: Number, default: 0 },
    wishlist:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    searchHistory: [{ type: String, trim: true }], // Stores recent search keywords
    addresses:     [{ label: String, address: String, isDefault: Boolean }],

    // Auth
    emailVerified:        { type: Boolean, default: false },
    emailVerifyToken:     { type: String, select: false },
    emailVerifyExpires:   { type: Date,   select: false },
    passwordResetToken:   { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    refreshToken:         { type: String, select: false }, // For JWT refresh tokens
    lastLogin:            { type: Date }, // Track last login

    // Wallet (embedded document)
    wallet: {
      available:      { type: Number, default: 0 },
      pending:        { type: Number, default: 0 },
      platformFeesPaid: { type: Number, default: 0 },
      bnplOutstanding: { type: Number, default: 0 },
      loanOutstanding: { type: Number, default: 0 },
      status:          { type: String, enum: ['active','frozen','restricted'], default: 'active' },
    },

    // Payout requests (embedded)
    payoutRequests: [{
      amount: Number,
      method: { type: String, enum: ['orange_money','afrimoney','moneymi','bank_transfer'] },
      status: { type: String, enum: ['pending','completed','cancelled'], default: 'pending' },
      accountDetails: { type: Map, of: String },
      note: String,
      createdAt: { type: Date, default: Date.now },
    }],

    // Seller specific categories
    categories: [{ type: String, trim: true }], // Store categories for sellers
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Add optimistic concurrency for wallet updates and product stock
userSchema.set('optimisticConcurrency', true);
userSchema.set('versionKey', '__v'); // Ensure version key is enabled

// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ role: 1 });
userSchema.index({ storeStatus: 1, isTrending: 1 });
userSchema.index({ accountStatus: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ name: 'text', storeName: 'text' });
userSchema.index({ kycStatus: 1 });
// The indexes above only cover the filter half of the admin list queries
// (adminController: getUsers, getSellers, getRiders) — every one of them
// also does .sort({ createdAt: -1 }) on top of the filter, which none of
// these single-field indexes include. Mongo can use e.g. { storeStatus: 1 }
// to find matching sellers, but then has to sort that whole result set in
// memory afterward since the index itself doesn't store them in createdAt
// order. That's invisible with a handful of test users and gets
// progressively slower as the collection grows — this app's own stated
// target is hundreds of thousands of users, so this was always going to
// bite in production. These compound indexes let a single index serve both
// the filter and the sort together for the actual shapes those three admin
// endpoints query, which is what "too slow" at a size that matters was
// really about, not the underlying query logic being wrong.
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ accountStatus: 1, createdAt: -1 });
userSchema.index({ storeStatus: 1, createdAt: -1 });

// ─── Virtuals ─────────────────────────────────────────────────────────────────
userSchema.virtual('profileUrl').get(function () {
  return `https://wimakit.sl/profile/${this.profileSlug}`;
});

// Virtual for wallet (if it were a separate model, but it's embedded now)
// userSchema.virtual('wallet', { ref: 'Wallet', localField: '_id', foreignField: 'owner', justOne: true });


// ─── Pre-save hooks ───────────────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  // Hash password
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  // Auto-generate profileSlug
  if (!this.profileSlug) {
    const base = this.storeName || this.name;
    const slug = slugify(base, { lower: true, strict: true });
    // Append short uuid to ensure uniqueness
    this.profileSlug = `${slug}-${uuidv4().slice(0, 8)}`;
  }
  
  // Limit search history to a reasonable number (e.g., 10)
  if (this.isModified('searchHistory') && this.searchHistory.length > 10) {
    this.searchHistory = this.searchHistory.slice(0, 10);
  }

  next();
});

// ─── Methods ──────────────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerifyToken;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.refreshToken;
  delete obj.kycDocuments;
  // `followers` is deprecated (see the Follow collection in models/Follow.js)
  // and may still hold legacy data on users created before the migration —
  // never serialize it. Nothing in the client reads currentUser.followers;
  // it only ever reads followersCount for another user's profile.
  delete obj.followers;
  // toPublicJSON is the one serializer used everywhere in this codebase —
  // both for "here's the logged-in user" (/auth/me, login) and "here's
  // someone else's public profile/storefront". notificationPrefs and
  // blockedUsers are per-account settings, not public profile data — they
  // need to reach the owning user, but never through this shared method, or
  // every visitor to any seller's storefront would see that seller's
  // notification toggles and exactly who they've blocked. The
  // notification-prefs and blocked-users endpoints below return these
  // explicitly instead, scoped to req.user.
  delete obj.notificationPrefs;
  delete obj.blockedUsers;
  return obj;
};
userSchema.methods.toPublic = userSchema.methods.toPublicJSON;

module.exports = mongoose.model('User', userSchema);
