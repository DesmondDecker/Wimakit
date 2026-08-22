'use strict';

const mongoose = require('mongoose');

// Replaces the old followers/following ObjectId arrays that were embedded
// directly on the User document. Those arrays grew without bound — a popular
// store with tens of thousands of followers meant every follow/unfollow
// rewrote that single document, every profile read pulled the entire
// follower-ID list just to report a count, and at real scale the array could
// approach MongoDB's 16MB document size cap. A normal join collection scales
// with the number of edges instead of bloating one document, and each side
// of the relationship can be queried/paginated independently with its own index.
const followSchema = new mongoose.Schema(
  {
    follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // the user doing the following
    followee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // the user/store being followed
  },
  { timestamps: true }
);

// One edge per (follower, followee) pair — also backs $addToSet-style
// idempotent follow calls (duplicate inserts are simply rejected).
followSchema.index({ follower: 1, followee: 1 }, { unique: true });
// Supports "who follows this store" (paginated) and follower-count queries.
followSchema.index({ followee: 1, createdAt: -1 });
// Supports "who does this user follow" (paginated) and following-count queries.
followSchema.index({ follower: 1, createdAt: -1 });

module.exports = mongoose.model('Follow', followSchema);
