'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User   = require('../models/User');
const Follow = require('../models/Follow');

/**
 * One-time backfill: migrates the deprecated followers/following arrays
 * embedded on User documents into the new Follow collection, and sets
 * followersCount/followingCount on every user to match.
 *
 * Safe to run more than once — Follow edges are inserted with
 * { ordered: false } and the unique (follower, followee) index means
 * duplicates from a re-run are silently skipped (E11000), not double-counted,
 * since the counters are recomputed from a fresh aggregate each run rather
 * than incremented.
 *
 * Run with: node src/utils/migrateFollowsToCollection.js
 */
async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/wimakit');
  console.log('✅ Connected to MongoDB');

  const users = await User.find({
    $or: [{ followers: { $exists: true, $ne: [] } }, { following: { $exists: true, $ne: [] } }],
  }).select('_id followers following').lean();

  console.log(`Found ${users.length} user(s) with legacy follow data`);

  const edges = [];
  for (const u of users) {
    for (const followeeId of u.following || []) {
      edges.push({ follower: u._id, followee: followeeId });
    }
  }

  if (edges.length) {
    try {
      await Follow.insertMany(edges, { ordered: false });
    } catch (err) {
      // Duplicate-key errors are expected on a re-run (edge already migrated)
      // and are not a failure — anything else should still surface.
      if (err.code !== 11000 && !(err.writeErrors && err.writeErrors.every(e => e.code === 11000))) {
        throw err;
      }
    }
  }
  console.log(`✅ Migrated ${edges.length} follow edge(s) (duplicates from a prior run are skipped, not double-inserted)`);

  // Recompute counters from the Follow collection itself rather than from
  // the old arrays, so the counts reflect reality even if this script is
  // run again after some follows/unfollows have already happened via the
  // new code path.
  const followerCounts = await Follow.aggregate([
    { $group: { _id: '$followee', count: { $sum: 1 } } },
  ]);
  const followingCounts = await Follow.aggregate([
    { $group: { _id: '$follower', count: { $sum: 1 } } },
  ]);

  const bulkOps = [];
  for (const { _id, count } of followerCounts) {
    bulkOps.push({ updateOne: { filter: { _id }, update: { followersCount: count } } });
  }
  for (const { _id, count } of followingCounts) {
    bulkOps.push({ updateOne: { filter: { _id }, update: { followingCount: count } } });
  }
  if (bulkOps.length) await User.bulkWrite(bulkOps);
  console.log(`✅ Updated counters for ${followerCounts.length} followee(s) and ${followingCounts.length} follower(s)`);

  console.log('\nMigration complete. Once verified, the followers/following array fields on User can be dropped.');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
