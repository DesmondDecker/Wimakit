const mongoose = require('mongoose');

const reactorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:   { type: String, enum: ['like', 'fire', 'wow', 'laugh', 'sad', 'support'], default: 'like' },
}, { _id: false });

const postSchema = new mongoose.Schema({
  author:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:    { type: String, enum: ['general','product_showcase','deal','review','question','poll','announcement'], default: 'general' },
  content: { type: String, required: true, maxlength: 2000, trim: true },
  images:  [String],
  taggedProducts: [{ productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, name: String, price: Number, image: String }],
  taggedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  mentions:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  hashtags:    [String],
  location:    String,
  poll: {
    question: String,
    options:  [{ id: String, text: String, votes: { type: Number, default: 0 }, voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] }],
    endsAt:   Date,
    votedBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  reactions: {
    like:    { type: Number, default: 0 }, fire:    { type: Number, default: 0 },
    wow:     { type: Number, default: 0 }, laugh:   { type: Number, default: 0 },
    sad:     { type: Number, default: 0 }, support: { type: Number, default: 0 },
  },
  reactors:       [reactorSchema],
  commentsCount:  { type: Number, default: 0 },
  sharesCount:    { type: Number, default: 0 },
  bookmarksCount: { type: Number, default: 0 },
  viewsCount:     { type: Number, default: 0 },
  isPinned:     { type: Boolean, default: false },
  isSponsored:  { type: Boolean, default: false },
  adId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
  repost: { originalPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost' }, authorName: String, content: String },
  reportCount:  { type: Number, default: 0 },
  reportedBy:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isHidden:     { type: Boolean, default: false },
  hiddenReason: String,
  hiddenBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ isPinned: -1, createdAt: -1 });
module.exports = mongoose.model('CommunityPost', postSchema);
