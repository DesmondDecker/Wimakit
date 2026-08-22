const mongoose = require('mongoose');

const commentReactorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:   { type: String, default: 'like' },
}, { _id: false });

const commentSchema = new mongoose.Schema({
  postId:   { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
  author:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:  { type: String, required: true, maxlength: 1000, trim: true },
  images:   [String],
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  reactions: {
    like:     { type: Number, default: 0 },
    reactors: [commentReactorSchema],
  },
  repliesCount: { type: Number, default: 0 },
  isEdited: { type: Boolean, default: false },
  isHidden: { type: Boolean, default: false },
}, { timestamps: true });
commentSchema.index({ postId: 1, createdAt: 1 });
commentSchema.index({ parentId: 1 });
module.exports = mongoose.model('Comment', commentSchema);
