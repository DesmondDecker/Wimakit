'use strict';
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const CommunityPost = require('../models/CommunityPost');
const Comment       = require('../models/Comment');
const User          = require('../models/User');
const Follow        = require('../models/Follow');
const Ad            = require('../models/Ad');
const { createNotification, broadcastNotification } = require('../utils/notifications');
const { saveImages }         = require('../utils/imageStorage');

// ─── Feed ─────────────────────────────────────────────────────────────────────
exports.getFeed = async (req, res) => {
  try {
    const { page = 1, limit = 15, type, hashtag } = req.query;
    const userId = req.user?._id;
    const skip   = (+page - 1) * +limit;
    const filter = { isHidden: false };
    if (type)    filter.type = type;
    if (hashtag) filter.hashtags = hashtag.toLowerCase();

    // Settings > Blocked Users used to have nothing behind it at all — the
    // list is stored on the User doc now (see models/User.js), but a list
    // nobody reads doesn't actually block anything. Filtering it here is
    // what makes blocking a person mean something in the one place blocked
    // users would otherwise keep showing up unprompted: the main feed.
    if (userId) {
      const me = await User.findById(userId).select('blockedUsers').lean();
      if (me?.blockedUsers?.length) filter.author = { $nin: me.blockedUsers };
    }

    const ads = await Ad.find({ status: 'active', placement: 'feed' }).limit(3);

    const [posts, total] = await Promise.all([
      CommunityPost.find(filter)
        .populate('author', 'name avatar profileSlug isVerified role storeName isTrending badges')
        .populate('taggedProducts.productId', 'name price images')
        .sort({ isPinned: -1, createdAt: -1 })
        .skip(skip).limit(+limit).lean(),
      CommunityPost.countDocuments(filter),
    ]);

    const enriched = posts.map(post => {
      const myReactor = userId ? post.reactors?.find(r => r.userId?.toString() === userId.toString()) : null;
      const { reactors, ...rest } = post;
      return { ...rest, myReaction: myReactor?.type ?? null };
    });

    const result = [];
    let adInserted = false;
    enriched.forEach((p, i) => {
      result.push(p);
      if ((i + 1) % 5 === 0 && ads.length > 0) {
        const adIndex = Math.floor(i / 5) % ads.length;
        result.push({ ...ads[adIndex].toObject(), _isAd: true });
        adInserted = true;
      }
    });
    // The every-5th-post rule above meant an ad never appeared at all on
    // any feed with fewer than 5 posts in it — which is most feeds early
    // on, and exactly the scenario an admin testing "did my ad post?"
    // would hit. Guarantee at least one ad on the first page of results
    // whenever any active feed-placement ads exist and weren't otherwise
    // shown, without changing behaviour once there's enough content to
    // hit the normal every-5th-post cadence.
    if (!adInserted && ads.length > 0 && enriched.length > 0 && +page === 1) {
      const adIndex = 0;
      result.push({ ...ads[adIndex].toObject(), _isAd: true });
    }

    res.json({ posts: result, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Trending ─────────────────────────────────────────────────────────────────
exports.getTrending = async (req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const posts = await CommunityPost.find({ isHidden: false, createdAt: { $gte: since } }).lean()
      .populate('author', 'name avatar profileSlug isVerified role storeName isTrending')
      .sort({ 'reactions.like': -1, commentsCount: -1, viewsCount: -1 })
      .limit(20).lean();
    res.json({ posts });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Get single post ──────────────────────────────────────────────────────────
exports.getPost = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Post not found' });
    const userId = req.user?._id;
    const post = await CommunityPost.findById(req.params.id)
      .populate('author', 'name avatar profileSlug isVerified role storeName isTrending badges')
      .populate('taggedProducts.productId', 'name price images')
      .lean();
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.isHidden && post.author._id.toString() !== userId?.toString()) {
      return res.status(404).json({ message: 'Post not found' });
    }
    await CommunityPost.findByIdAndUpdate(req.params.id, { $inc: { viewsCount: 1 } });
    const myReactor = userId ? post.reactors?.find(r => r.userId?.toString() === userId.toString()) : null;
    const { reactors, ...rest } = post;
    res.json({ post: { ...rest, myReaction: myReactor?.type ?? null } });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Create post ──────────────────────────────────────────────────────────────
exports.createPost = async (req, res) => {
  try {
    const { content, type, hashtags, location, poll, repostId, taggedProducts, taggedUsers } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: 'Content is required' });

    // Images
    let images = [];
    if (req.files?.length) {
      images = await saveImages(req.files, req);
    } else if (req.body.images) {
      images = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    }

    // Extract hashtags from content + explicit hashtags
    const contentTags = (content.match(/#(\w+)/g) || []).map(h => h.slice(1).toLowerCase());
    let parsedHashtags = [];
    if (hashtags) {
      try { parsedHashtags = typeof hashtags === 'string' ? JSON.parse(hashtags) : hashtags; } catch {}
    }
    const allHashtags = [...new Set([...contentTags, ...parsedHashtags])];

    // Extract @mentions
    const mentionSlugs = (content.match(/@(\w+)/g) || []).map(m => m.slice(1));
    let mentionIds = [];
    if (mentionSlugs.length) {
      const mentioned = await User.find({ profileSlug: { $in: mentionSlugs } }).select('_id name').limit(20).lean();
      mentionIds = mentioned.map(u => u._id);
    }

    // Repost
    let repostData;
    if (repostId) {
      const original = await CommunityPost.findById(repostId).populate('author', 'name');
      if (original) {
        repostData = { originalPostId: repostId, authorName: original.author?.name, content: original.content.slice(0, 200) };
        await CommunityPost.findByIdAndUpdate(repostId, { $inc: { sharesCount: 1 } });
      }
    }

    let parsedPoll;
    if (poll) {
      try { parsedPoll = typeof poll === 'string' ? JSON.parse(poll) : poll; } catch {}
    }

    const post = await CommunityPost.create({
      author: req.user._id,
      content: content.trim(),
      type: type || 'general',
      images, hashtags: allHashtags, location, mentions: mentionIds,
      taggedUsers: taggedUsers ? (typeof taggedUsers === 'string' ? JSON.parse(taggedUsers) : taggedUsers) : [],
      taggedProducts: taggedProducts ? (typeof taggedProducts === 'string' ? JSON.parse(taggedProducts) : taggedProducts) : [],
      poll: parsedPoll,
      repost: repostData,
      reactions: { like:0, fire:0, wow:0, laugh:0, sad:0, support:0 },
    });

    await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: 1 } });

    // Notify mentions
    for (const uid of mentionIds) {
      if (uid.toString() !== req.user._id.toString()) {
        await createNotification(req.app.get('io'), {
          userId: uid, type: 'community_mention',
          title: `${req.user.name} mentioned you`,
          message: content.slice(0, 100),
          data: { postId: post._id.toString() },
        });
      }
    }

    // Broadcast admin posts to ALL users
    const io = req.app.get('io');
    if (req.user.role === 'admin') {
      const snippet = content.trim().length > 100 ? content.trim().slice(0, 97) + '...' : content.trim();
      broadcastNotification(io, {
        type: 'system',
        title: '📢 Admin Announcement: ' + (req.user.name || 'WimaKit Team'),
        message: snippet,
        data: {
          postId: post._id.toString(),
          url: `/community/post/${post._id}`,
        },
        excludeUserId: req.user._id,
      }).catch(() => {});
    } else {
      // Notify followers of this store/user
      const follows = await Follow.find({ followee: req.user._id }).select('follower').lean();
      const usersWithFollowing = await User.find({ following: req.user._id }).select('_id').lean();
      const followerIds = [...new Set([
        ...follows.map(f => f.follower?.toString()),
        ...usersWithFollowing.map(u => u._id?.toString()),
      ])].filter(id => id && id !== req.user._id.toString());

      if (followerIds.length > 0) {
        const authorDisplayName = req.user.storeName || req.user.name || 'A store you follow';
        const snippet = content.trim().length > 100 ? content.trim().slice(0, 97) + '...' : content.trim();
        for (const fId of followerIds) {
          createNotification(io, {
            userId: fId,
            type: 'community_post',
            title: `📝 New post from ${authorDisplayName}`,
            message: snippet,
            data: {
              postId: post._id.toString(),
              url: `/community/post/${post._id}`,
            },
          }).catch(() => {});
        }
      }
    }

    const populated = await CommunityPost.findById(post._id)
      .populate('author', 'name avatar profileSlug isVerified role storeName isTrending');
    res.status(201).json({ post: populated });
  } catch (err) { logger.error('[createPost]', err); res.status(500).json({ message: err.message }); }
};

// ─── Delete post ──────────────────────────────────────────────────────────────
exports.deletePost = async (req, res) => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Not found' });
    const isOwner = post.author.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });
    await post.deleteOne();
    await Comment.deleteMany({ postId: post._id });
    await User.findByIdAndUpdate(post.author, { $inc: { postsCount: -1 } });
    res.json({ message: 'Post deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── React ────────────────────────────────────────────────────────────────────
exports.reactToPost = async (req, res) => {
  try {
    const { type } = req.body;
    const validTypes = ['like','fire','wow','laugh','sad','support'];
    if (!validTypes.includes(type)) return res.status(400).json({ message: 'Invalid reaction' });

    const uid = req.user._id;

    // Read first to know what state we're transitioning FROM — this is the
    // same pattern used for optimistic-locking read steps elsewhere in this
    // codebase. We can't do this atomically in a single findOneAndUpdate
    // without an aggregation pipeline update, so we use the same
    // conditional-update pattern used in other places: read, decide, then
    // apply changes atomically per-operation. Race conditions between the
    // read and the write are guarded by the $elemMatch conditions below —
    // if the state changed between our read and our write, the update
    // simply won't match and we'll re-read. That's significantly safer
    // than the previous read-modify-then-.save() which had no such guard.
    const post = await CommunityPost.findById(req.params.id).select('reactions reactors author').lean();
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const existing = post.reactors?.find(r => r.userId?.toString() === uid.toString());

    let updatedPost;

    if (existing && existing.type === type) {
      // Toggle off: remove reactor entry and decrement the count atomically
      updatedPost = await CommunityPost.findOneAndUpdate(
        { _id: post._id, 'reactors.userId': uid, 'reactors.type': type },
        {
          $inc:  { [`reactions.${type}`]: -1 },
          $pull: { reactors: { userId: uid } },
        },
        { new: true, select: 'reactions reactors' }
      );
      if (!updatedPost) {
        // Raced — return current state safely
        const current = await CommunityPost.findById(post._id).select('reactions reactors').lean();
        return res.json({ reactions: current?.reactions ?? {}, myReaction: null });
      }
      return res.json({ reactions: updatedPost.reactions, myReaction: null });
    }

    if (existing) {
      // Switch reaction type: decrement old, increment new, update reactor entry
      updatedPost = await CommunityPost.findOneAndUpdate(
        { _id: post._id, 'reactors.userId': uid, 'reactors.type': existing.type },
        {
          $inc: { [`reactions.${existing.type}`]: -1, [`reactions.${type}`]: 1 },
          $set: { 'reactors.$.type': type },
        },
        { new: true, select: 'reactions reactors' }
      );
    } else {
      // New reaction: increment and push reactor entry
      updatedPost = await CommunityPost.findOneAndUpdate(
        { _id: post._id, 'reactors.userId': { $ne: uid } },
        {
          $inc:  { [`reactions.${type}`]: 1 },
          $push: { reactors: { userId: uid, type } },
        },
        { new: true, select: 'reactions reactors author' }
      );
      if (updatedPost && post.author.toString() !== uid.toString()) {
        await createNotification(req.app.get('io'), {
          userId: post.author, type: 'community_like',
          title: `${req.user.name} reacted to your post`,
          message: `${type} reaction`,
          data: { postId: post._id.toString() },
        });
      }
    }

    if (!updatedPost) {
      const current = await CommunityPost.findById(post._id).select('reactions reactors').lean();
      const myReaction = current?.reactors?.find(r => r.userId?.toString() === uid.toString())?.type ?? null;
      return res.json({ reactions: current?.reactions ?? {}, myReaction });
    }

    const myReaction = updatedPost.reactors?.find(r => r.userId?.toString() === uid.toString())?.type ?? null;

    // Real-time broadcast — anyone viewing this post live sees the updated counts
    const io = req.app.get('io');
    if (io) io.to(`post:${post._id}`).emit('reaction:updated', { postId: post._id, reactions: updatedPost.reactions });

    res.json({ reactions: updatedPost.reactions, myReaction });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Poll vote ────────────────────────────────────────────────────────────────
exports.votePoll = async (req, res) => {
  try {
    const { optionId } = req.body;
    const post = await CommunityPost.findById(req.params.id);
    if (!post?.poll) return res.status(404).json({ message: 'Poll not found' });
    if (post.poll.endsAt && new Date() > post.poll.endsAt) return res.status(400).json({ message: 'Poll has ended' });
    const uid = req.user._id.toString();
    if (post.poll.votedBy.map(v => v.toString()).includes(uid)) return res.status(400).json({ message: 'Already voted' });
    const option = post.poll.options.find(o => o.id === optionId || o._id?.toString() === optionId);
    if (!option) return res.status(404).json({ message: 'Option not found' });
    option.votes += 1;
    option.voters.push(req.user._id);
    post.poll.votedBy.push(req.user._id);
    await post.save();
    res.json({ poll: post.poll });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Bookmark ─────────────────────────────────────────────────────────────────
exports.bookmarkPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const user = await User.findById(req.user._id);
    const hasBookmark = (user.bookmarks || []).map(b => b.toString()).includes(postId);
    if (hasBookmark) {
      user.bookmarks = user.bookmarks.filter(b => b.toString() !== postId);
      await CommunityPost.findByIdAndUpdate(postId, { $inc: { bookmarksCount: -1 } });
    } else {
      if (!user.bookmarks) user.bookmarks = [];
      user.bookmarks.push(postId);
      await CommunityPost.findByIdAndUpdate(postId, { $inc: { bookmarksCount: 1 } });
    }
    await user.save({ validateBeforeSave: false });
    res.json({ bookmarked: !hasBookmark });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getBookmarks = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const posts = await CommunityPost.find({ _id: { $in: user.bookmarks || [] }, isHidden: false }).limit(50).lean()
      .populate('author', 'name avatar profileSlug isVerified role storeName')
      .sort({ createdAt: -1 }).lean();
    res.json({ posts });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Comments ─────────────────────────────────────────────────────────────────
exports.getComments = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Post not found' });
    const { page = 1, limit = 50 } = req.query;
    const uid = req.user?._id?.toString();

    const comments = await Comment.find({ postId: req.params.id, parentId: null, isHidden: false })
      .populate('author', 'name avatar profileSlug isVerified role storeName')
      .sort({ createdAt: 1 })
      .skip((+page - 1) * +limit).limit(+limit).lean();

    // Batch-fetch all replies in one query
    const commentIds = comments.map(c => c._id);
    const allReplies = await Comment.find({ parentId: { $in: commentIds }, isHidden: false })
      .populate('author', 'name avatar profileSlug isVerified role storeName')
      .sort({ createdAt: 1 }).lean();

    const repliesByParent = {};
    for (const r of allReplies) {
      const key = r.parentId.toString();
      if (!repliesByParent[key]) repliesByParent[key] = [];
      r.isLiked = uid ? (r.reactions?.reactors || []).some(re => re.userId?.toString() === uid) : false;
      repliesByParent[key].push(r);
    }

    for (const c of comments) {
      c.replies = repliesByParent[c._id.toString()] || [];
      c.isLiked = uid ? (c.reactions?.reactors || []).some(re => re.userId?.toString() === uid) : false;
    }

    const total = await Comment.countDocuments({ postId: req.params.id, parentId: null, isHidden: false });
    res.json({ comments, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addComment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Post not found' });
    const { content, parentId } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: 'Comment content is required' });
    const post = await CommunityPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const mentionSlugs = (content.match(/@(\w+)/g) || []).map(m => m.slice(1));
    let mentionIds = [];
    if (mentionSlugs.length) {
      const mentioned = await User.find({ profileSlug: { $in: mentionSlugs } }).select('_id').limit(20).lean();
      mentionIds = mentioned.map(u => u._id);
    }

    const comment = await Comment.create({
      postId: req.params.id,
      author: req.user._id,
      content: content.trim(),
      parentId: parentId || null,
      mentions: mentionIds,
      reactions: { like: 0, reactors: [] },
    });

    if (parentId) {
      await Comment.findByIdAndUpdate(parentId, { $inc: { repliesCount: 1 } });
    }
    await CommunityPost.findByIdAndUpdate(req.params.id, { $inc: { commentsCount: 1 } });

    if (post.author.toString() !== req.user._id.toString()) {
      await createNotification(req.app.get('io'), {
        userId: post.author,
        type: 'community_comment',
        title: `${req.user.name} commented on your post`,
        message: content.slice(0, 100),
        data: { postId: req.params.id, commentId: comment._id },
      });
    }

    const populated = await Comment.findById(comment._id)
      .populate('author', 'name avatar profileSlug isVerified role storeName');
    res.status(201).json({ comment: populated });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateComment = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: 'Comment content is required' });
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    const isOwner = comment.author.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized to edit this comment' });

    comment.content = content.trim();
    comment.isEdited = true;
    await comment.save();

    const populated = await Comment.findById(comment._id)
      .populate('author', 'name avatar profileSlug isVerified role storeName');
    res.json({ comment: populated });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    const isOwner = comment.author.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized to delete this comment' });

    if (comment.parentId) {
      await Comment.findByIdAndUpdate(comment.parentId, { $inc: { repliesCount: -1 } });
      await CommunityPost.findByIdAndUpdate(comment.postId, { $inc: { commentsCount: -1 } });
    } else {
      const childRepliesCount = await Comment.countDocuments({ parentId: comment._id });
      await Comment.deleteMany({ parentId: comment._id });
      await CommunityPost.findByIdAndUpdate(comment.postId, { $inc: { commentsCount: -(1 + childRepliesCount) } });
    }

    await comment.deleteOne();
    res.json({ message: 'Comment deleted successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.reactToComment = async (req, res) => {
  try {
    const uid = req.user._id;
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (!comment.reactions) {
      comment.reactions = { like: 0, reactors: [] };
    }
    if (!Array.isArray(comment.reactions.reactors)) {
      comment.reactions.reactors = [];
    }

    const existingIndex = comment.reactions.reactors.findIndex(r => r.userId?.toString() === uid.toString());
    let isLiked = false;

    if (existingIndex > -1) {
      comment.reactions.reactors.splice(existingIndex, 1);
      comment.reactions.like = Math.max(0, (comment.reactions.like || 1) - 1);
      isLiked = false;
    } else {
      comment.reactions.reactors.push({ userId: uid, type: 'like' });
      comment.reactions.like = (comment.reactions.like || 0) + 1;
      isLiked = true;
    }

    await comment.save();
    res.json({ reactions: comment.reactions, isLiked });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Report ───────────────────────────────────────────────────────────────────
exports.reportPost = async (req, res) => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Not found' });
    const uid = req.user._id.toString();
    if (!(post.reportedBy || []).map(r => r.toString()).includes(uid)) {
      if (!post.reportedBy) post.reportedBy = [];
      post.reportedBy.push(req.user._id);
      post.reportCount = (post.reportCount || 0) + 1;
      if (post.reportCount >= 5) { post.isHidden = true; post.hiddenReason = 'Auto-hidden: too many reports'; }
      await post.save();
    }
    res.json({ message: 'Report submitted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Search ───────────────────────────────────────────────────────────────────
exports.searchPosts = async (req, res) => {
  try {
    const { q, hashtag } = req.query;
    const filter = { isHidden: false };
    if (q) {
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ content: { $regex: escaped, $options: 'i' } }, { hashtags: { $in: [new RegExp(`^${escaped}$`, 'i')] } }];
    }
    if (hashtag) filter.hashtags = hashtag.toLowerCase();
    const posts = await CommunityPost.find(filter)
      .populate('author', 'name avatar profileSlug isVerified role storeName')
      .sort({ createdAt: -1 }).limit(30).lean();
    res.json({ posts });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── User posts ───────────────────────────────────────────────────────────────
exports.getUserPosts = async (req, res) => {
  try {
    const user = await User.findOne({ profileSlug: req.params.slug });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const { page = 1, limit = 12 } = req.query;
    const filter = { author: user._id, isHidden: false };
    const [posts, total] = await Promise.all([
      CommunityPost.find(filter)
        .populate('author', 'name avatar profileSlug isVerified role storeName')
        .sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit).lean(),
      CommunityPost.countDocuments(filter),
    ]);
    res.json({ posts, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Hashtag posts ────────────────────────────────────────────────────────────
exports.getHashtagPosts = async (req, res) => {
  try {
    const tag = req.params.tag.toLowerCase();
    const posts = await CommunityPost.find({ hashtags: tag, isHidden: false }).limit(30).lean()
      .populate('author', 'name avatar profileSlug isVerified role storeName')
      .sort({ createdAt: -1 }).limit(40).lean();
    res.json({ posts, hashtag: tag });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Trending hashtags ────────────────────────────────────────────────────────
exports.getTrendingHashtags = async (req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await CommunityPost.aggregate([
      { $match: { isHidden: false, createdAt: { $gte: since } } },
      { $unwind: '$hashtags' },
      { $group: { _id: '$hashtags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);
    res.json({ hashtags: result.map(r => ({ tag: r._id, count: r.count })) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
