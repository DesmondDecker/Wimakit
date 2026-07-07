import React, { memo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store';
import { useReactToPost, useBookmarkPost } from '../../hooks/useApi';
import { timeAgo, formatNumber, formatPrice, REACTIONS } from '../../constants/data';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import type { CommunityPost } from '../../constants/types';

interface Props {
  post: CommunityPost;
  onPress?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}

const PostCard = memo(({ post, onPress, onComment, onShare, onReport, onDelete, compact = false }: Props) => {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const [showReactions, setShowReactions] = useState(false);
  const reactMut   = useReactToPost();
  const bookmarkMut = useBookmarkPost();

  const uid       = user?._id ?? user?.id ?? '';
  const authorId  = post.author?.id ?? (post.author as any)?._id ?? '';
  const isOwn     = uid === authorId;
  const pid       = post._id ?? post.id ?? '';

  const totalReactions = Object.values(post.reactions || {}).reduce((a, b) => a + (b as number), 0);

  const handleReact = useCallback((type: string) => {
    setShowReactions(false);
    reactMut.mutate({ id: pid, type });
  }, [pid, reactMut]);

  const handleBookmark = useCallback(() => {
    bookmarkMut.mutate(pid);
  }, [pid, bookmarkMut]);

  const topReactionTypes = Object.entries(post.reactions || {})
    .filter(([, v]) => (v as number) > 0)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 3)
    .map(([k]) => REACTIONS.find(r => r.id === k));

  const isAd = (post as any)._isAd;

  if (isAd) {
    const ad = post as any;
    return (
      <TouchableOpacity
        style={[s.adCard, { backgroundColor: colors.primaryMuted, borderColor: colors.primary + '40' }]}
        onPress={() => ad.targetId && router.push(`/product/${ad.targetId}` as any)}
        activeOpacity={0.85}
      >
        <View style={s.adHeader}>
          <MaterialCommunityIcons name="bullhorn-outline" size={13} color={colors.primary} />
          <Text style={[s.adLabel, { color: colors.primary }]}>Sponsored</Text>
        </View>
        {ad.image && (
          <Image source={{ uri: ad.image }} style={s.adImage} contentFit="cover" />
        )}
        <View style={{ padding: Spacing.md }}>
          <Text style={[s.adTitle, { color: colors.textPrimary }]}>{ad.title}</Text>
          {ad.description && <Text style={[s.adDesc, { color: colors.textMuted }]}>{ad.description}</Text>}
          <View style={[s.adBtn, { backgroundColor: colors.primary }]}>
            <Text style={s.adBtnText}>Learn More</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}
      onPress={onPress}
      activeOpacity={0.97}
    >
      {/* Pinned banner */}
      {post.isPinned && (
        <View style={[s.pinnedBanner, { backgroundColor: colors.accent + '20' }]}>
          <MaterialCommunityIcons name="pin" size={12} color={colors.accent} />
          <Text style={[s.pinnedText, { color: colors.accent }]}>Pinned post</Text>
        </View>
      )}

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.authorRow}
          onPress={() => post.author?.profileSlug && router.push(`/profile/${post.author.profileSlug}` as any)}
        >
          <View style={s.avatarWrap}>
            {post.author?.avatar ? (
              <Image source={{ uri: post.author.avatar }} style={s.avatar} contentFit="cover" />
            ) : (
              <View style={[s.avatarFallback, { backgroundColor: colors.primaryMuted }]}>
                <Text style={[s.avatarLetter, { color: colors.primary }]}>
                  {(post.author?.name ?? 'U')[0].toUpperCase()}
                </Text>
              </View>
            )}
            {post.author?.role === 'seller' && (
              <View style={[s.roleIndicator, { backgroundColor: colors.success }]} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.nameRow}>
              <Text style={[s.authorName, { color: colors.textPrimary }]} numberOfLines={1}>
                {post.author?.name}
              </Text>
              {post.author?.isVerified && (
                <MaterialCommunityIcons name="check-decagram" size={14} color={colors.primary} />
              )}
              {post.author?.isTrending && (
                <View style={[s.trendingBadge, { backgroundColor: '#F59E0B20' }]}>
                  <Text style={[s.trendingBadgeText, { color: '#F59E0B' }]}>🔥 Trending</Text>
                </View>
              )}
            </View>
            <View style={s.metaRow}>
              {post.author?.storeName && (
                <Text style={[s.storeName, { color: colors.primary }]} numberOfLines={1}>
                  {post.author.storeName} ·{' '}
                </Text>
              )}
              <Text style={[s.timeText, { color: colors.textMuted }]}>{post.createdAt ? timeAgo(post.createdAt) : ''}</Text>
              {post.location && (
                <Text style={[{ color: colors.textMuted, fontSize: 11 }]}> · 📍{post.location}</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {/* Menu */}
        <TouchableOpacity
          style={s.moreBtn}
          onPress={() => {
            const opts = ['Report'];
            if (isOwn) opts.unshift('Delete Post');
            const buttons: any[] = opts.map(o => ({
              text: o,
              style: o === 'Delete Post' ? 'destructive' : 'default',
              onPress: o === 'Delete Post' ? onDelete : onReport,
            }));
            buttons.push({ text: 'Cancel', style: 'cancel', onPress: () => {} });
            Alert.alert('Post Options', '', buttons);
          }}
        >
          <MaterialCommunityIcons name="dots-horizontal" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Post type badge */}
      {post.type !== 'general' && (
        <View style={{ paddingHorizontal: Spacing.md, paddingBottom: 4 }}>
          <View style={[s.typeBadge, {
            backgroundColor:
              post.type === 'deal' ? colors.success + '20' :
              post.type === 'question' ? colors.info + '20' :
              post.type === 'announcement' ? colors.accent + '20' :
              colors.primaryMuted,
          }]}>
            <Text style={[s.typeBadgeText, {
              color:
                post.type === 'deal' ? colors.success :
                post.type === 'question' ? colors.info :
                post.type === 'announcement' ? colors.accent :
                colors.primary,
            }]}>
              {post.type === 'deal' ? '🏷️ Deal' :
               post.type === 'question' ? '❓ Question' :
               post.type === 'announcement' ? '📣 Announcement' :
               post.type === 'product_showcase' ? '🛍️ Showcase' :
               post.type === 'review' ? '⭐ Review' :
               post.type === 'poll' ? '📊 Poll' : post.type}
            </Text>
          </View>
        </View>
      )}

      {/* Repost indicator */}
      {post.repost && (
        <View style={[s.repostBanner, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="repeat" size={13} color={colors.textMuted} />
          <Text style={[s.repostText, { color: colors.textMuted }]} numberOfLines={1}>
            Reposted from {post.repost.authorName}: {post.repost.content}
          </Text>
        </View>
      )}

      {/* Content */}
      <View style={s.content}>
        <Text style={[s.contentText, { color: colors.textPrimary }]} numberOfLines={compact ? 3 : undefined}>
          {post.content}
        </Text>
      </View>

      {/* Images */}
      {post.images && post.images.length > 0 && (
        <View style={s.imagesWrap}>
          {post.images.length === 1 ? (
            <Image source={{ uri: post.images[0] }} style={s.singleImage} contentFit="cover" />
          ) : post.images.length === 2 ? (
            <View style={s.twoImages}>
              {post.images.map((img, i) => (
                <Image key={i} source={{ uri: img }} style={s.halfImage} contentFit="cover" />
              ))}
            </View>
          ) : (
            <View style={s.gridImages}>
              {post.images.slice(0, 4).map((img, i) => (
                <View key={i} style={s.gridImageWrap}>
                  <Image source={{ uri: img }} style={{ flex: 1 }} contentFit="cover" />
                  {i === 3 && post.images!.length > 4 && (
                    <View style={s.moreOverlay}>
                      <Text style={s.moreOverlayText}>+{post.images!.length - 4}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Poll */}
      {post.poll && (
        <View style={[s.pollWrap, { borderColor: colors.border }]}>
          <Text style={[s.pollQuestion, { color: colors.textPrimary }]}>{post.poll.question}</Text>
          {post.poll.options.map((opt: any) => {
            const totalVotes = post.poll!.options.reduce((a: any, o: any) => a + o.votes, 0);
            const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
            return (
              <View key={opt.id} style={[s.pollOption, { borderColor: colors.border, backgroundColor: colors.surfaceAlt ?? colors.surface }]}>
                <View style={[s.pollFill, { width: `${pct}%` as any, backgroundColor: colors.primary + '30' }]} />
                <Text style={[s.pollOptionText, { color: colors.textPrimary }]}>{opt.text}</Text>
                <Text style={[s.pollPct, { color: colors.textMuted }]}>{pct}%</Text>
              </View>
            );
          })}
          {post.poll.endsAt && (
            <Text style={[s.pollEnds, { color: colors.textMuted }]}>
              Ends {timeAgo(post.poll.endsAt)}
            </Text>
          )}
        </View>
      )}

      {/* Tagged products */}
      {post.taggedProducts && post.taggedProducts.length > 0 && (
        <View style={s.taggedProducts}>
          {post.taggedProducts.slice(0, 2).map((tp: any, i) => (
            <TouchableOpacity
              key={i}
              style={[s.taggedProduct, { backgroundColor: colors.primaryMuted, borderColor: colors.primary + '30' }]}
              onPress={() => router.push(`/product/${tp.productId ?? tp.id}` as any)}
            >
              {tp.image && <Image source={{ uri: tp.image }} style={s.tpImage} contentFit="cover" />}
              <View style={{ flex: 1 }}>
                <Text style={[s.tpName, { color: colors.textPrimary }]} numberOfLines={1}>{tp.name}</Text>
                <Text style={[s.tpPrice, { color: colors.primary }]}>{formatPrice(tp.price, true)}</Text>
              </View>
              <MaterialCommunityIcons name="cart-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Hashtags */}
      {post.hashtags && post.hashtags.length > 0 && (
        <View style={s.hashtagsRow}>
          {post.hashtags.slice(0, 5).map((tag) => (
            <TouchableOpacity
              key={tag}
              onPress={() => router.push(`/community/hashtag/${tag}` as any)}
            >
              <Text style={[s.hashtag, { color: colors.primary }]}>#{tag}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Reaction summary */}
      {totalReactions > 0 && (
        <View style={[s.reactionSummary, { borderTopColor: colors.border }]}>
          <View style={s.reactionEmojis}>
            {topReactionTypes.filter(Boolean).map((r, i) => (
              <Text key={i} style={s.reactionEmoji}>{r!.emoji}</Text>
            ))}
          </View>
          <Text style={[s.reactionCount, { color: colors.textMuted }]}>
            {formatNumber(totalReactions)} reaction{totalReactions !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={[s.actions, { borderTopColor: colors.border }]}>
        {/* React button with long-press for picker */}
        <View style={s.reactWrap}>
          {showReactions && (
            <MotiView
              from={{ opacity: 0, scale: 0.8, translateY: 8 }}
              animate={{ opacity: 1, scale: 1, translateY: 0 }}
              style={[s.reactionPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {REACTIONS.map((r) => (
                <TouchableOpacity key={r.id} style={s.reactionPickerItem} onPress={() => handleReact(r.id)}>
                  <Text style={s.reactionPickerEmoji}>{r.emoji}</Text>
                </TouchableOpacity>
              ))}
            </MotiView>
          )}
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => handleReact('like')}
            onLongPress={() => setShowReactions(p => !p)}
          >
            {post.myReaction ? (
              <Text style={{ fontSize: 16 }}>{REACTIONS.find(r => r.id === post.myReaction)?.emoji ?? '❤️'}</Text>
            ) : (
              <MaterialCommunityIcons name="heart-outline" size={18} color={colors.textMuted} />
            )}
            <Text style={[s.actionText, { color: post.myReaction ? colors.error : colors.textMuted }]}>
              {totalReactions > 0 ? formatNumber(totalReactions) : 'Like'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.actionBtn} onPress={onComment}>
          <MaterialCommunityIcons name="comment-outline" size={18} color={colors.textMuted} />
          <Text style={[s.actionText, { color: colors.textMuted }]}>
            {(post.commentsCount ?? 0) > 0 ? formatNumber(post.commentsCount ?? 0) : 'Comment'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.actionBtn} onPress={onShare}>
          <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.textMuted} />
          <Text style={[s.actionText, { color: colors.textMuted }]}>
            {(post.sharesCount ?? 0) > 0 ? formatNumber(post.sharesCount ?? 0) : 'Share'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.actionBtn} onPress={handleBookmark}>
          <MaterialCommunityIcons
            name={post.isBookmarked ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={post.isBookmarked ? colors.primary : colors.textMuted}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

export default PostCard;

const s = StyleSheet.create({
  card: { borderRadius: Radius.xl, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  pinnedText: { fontSize: 11, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, gap: 10 },
  authorRow: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatarWrap: { position: 'relative' },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 16, fontWeight: '900' },
  roleIndicator: { position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  authorName: { fontSize: 14, fontWeight: '700' },
  trendingBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  trendingBadgeText: { fontSize: 9, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  storeName: { fontSize: 11, fontWeight: '600' },
  timeText: { fontSize: 11 },
  moreBtn: { padding: 4 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  repostBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: Spacing.md, padding: 8, borderRadius: Radius.md, borderWidth: 1, marginBottom: 8 },
  repostText: { flex: 1, fontSize: 12 },
  content: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  contentText: { fontSize: 14, lineHeight: 21 },
  imagesWrap: { marginBottom: 8 },
  singleImage: { width: '100%', height: 260 },
  twoImages: { flexDirection: 'row', gap: 2 },
  halfImage: { flex: 1, height: 180 },
  gridImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  gridImageWrap: { width: '49.7%', height: 130, position: 'relative', overflow: 'hidden' },
  moreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  moreOverlayText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  pollWrap: { marginHorizontal: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 8, marginBottom: 8 },
  pollQuestion: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  pollOption: { borderRadius: Radius.md, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', position: 'relative' },
  pollFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  pollOptionText: { flex: 1, fontSize: 13, fontWeight: '600' },
  pollPct: { fontSize: 12, fontWeight: '700' },
  pollEnds: { fontSize: 11, textAlign: 'center' },
  taggedProducts: { paddingHorizontal: Spacing.md, gap: 8, marginBottom: 8 },
  taggedProduct: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: Radius.lg, borderWidth: 1 },
  tpImage: { width: 40, height: 40, borderRadius: Radius.md },
  tpName: { fontSize: 12, fontWeight: '600' },
  tpPrice: { fontSize: 12, fontWeight: '800' },
  hashtagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: Spacing.md, paddingBottom: 8 },
  hashtag: { fontSize: 13, fontWeight: '600' },
  reactionSummary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 8, borderTopWidth: 1 },
  reactionEmojis: { flexDirection: 'row' },
  reactionEmoji: { fontSize: 14, marginRight: -3 },
  reactionCount: { fontSize: 12 },
  actions: { flexDirection: 'row', borderTopWidth: 1 },
  reactWrap: { flex: 1, position: 'relative' },
  reactionPicker: { position: 'absolute', bottom: 44, left: 0, flexDirection: 'row', borderRadius: Radius.xl, borderWidth: 1, padding: 8, gap: 4, zIndex: 10 },
  reactionPickerItem: { padding: 4 },
  reactionPickerEmoji: { fontSize: 22 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  actionText: { fontSize: 12, fontWeight: '600' },
  adCard: { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  adHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingTop: 10 },
  adLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  adImage: { width: '100%', height: 160 },
  adTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  adDesc: { fontSize: 12, marginBottom: 12 },
  adBtn: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full },
  adBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
