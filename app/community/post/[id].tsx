import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Share,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../../context/ThemeContext';
import { Spacing, Radius, FontSize } from '../../../constants/theme';
import { useAuthStore } from '../../../store';
import {
  useCommunityPost, useCommunityComments,
  useAddComment, useDeleteComment, useReactToPost, useBookmarkPost, useVotePoll,
} from '../../../hooks/useApi';
import PostCard from '../../../components/community/PostCard';
import { timeAgo, REACTIONS } from '../../../constants/data';
import { communityApi } from '../../../utils/api';

function CommentItem({ comment, onReply, onDelete, colors, user }: any) {
  const [showReactions, setShowReactions] = useState(false);
  const isOwn = (user?._id ?? user?.id) === (comment.author?.id ?? comment.author?._id);

  return (
    <MotiView from={{ opacity: 0, translateY: 4 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 250 }}>
      <View style={[c.commentWrap, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => {}}>
          <View style={[c.commentAvatar, { backgroundColor: colors.primaryMuted }]}>
            {comment.author?.avatar
              ? <Image source={{ uri: comment.author.avatar }} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" />
              : <Text style={[c.commentAvatarLetter, { color: colors.primary }]}>{(comment.author?.name ?? 'U')[0].toUpperCase()}</Text>
            }
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={[c.commentBubble, { backgroundColor: colors.surfaceAlt ?? colors.surface }]}>
            <View style={c.commentMeta}>
              <Text style={[c.commentAuthor, { color: colors.textPrimary }]}>{comment.author?.name}</Text>
              {comment.author?.isVerified && (
                <MaterialCommunityIcons name="check-decagram" size={12} color={colors.primary} />
              )}
            </View>
            <Text style={[c.commentContent, { color: colors.textSecondary }]}>{comment.content}</Text>
          </View>
          <View style={c.commentActions}>
            <Text style={[c.commentTime, { color: colors.textMuted }]}>{timeAgo(comment.createdAt)}</Text>
            <TouchableOpacity onLongPress={() => setShowReactions(p => !p)} onPress={() => setShowReactions(p => !p)}>
              <Text style={[c.commentActionText, { color: colors.textMuted }]}>
                {comment.reactions?.like > 0 ? `❤️ ${comment.reactions.like}` : 'Like'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onReply(comment)}>
              <Text style={[c.commentActionText, { color: colors.textMuted }]}>Reply</Text>
            </TouchableOpacity>
            {isOwn && (
              <TouchableOpacity onPress={() => onDelete(comment)}>
                <Text style={[c.commentActionText, { color: colors.error }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Mini reaction picker */}
          {showReactions && (
            <MotiView from={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              style={[c.miniReactions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {REACTIONS.map(r => (
                <TouchableOpacity key={r.id} style={c.miniReactionBtn} onPress={() => { setShowReactions(false); }}>
                  <Text style={{ fontSize: 20 }}>{r.emoji}</Text>
                </TouchableOpacity>
              ))}
            </MotiView>
          )}

          {/* Replies */}
          {comment.replies?.map((reply: any) => (
            <View key={reply._id ?? reply.id} style={c.replyWrap}>
              <View style={[c.replyAvatar, { backgroundColor: colors.primaryMuted }]}>
                {reply.author?.avatar
                  ? <Image source={{ uri: reply.author.avatar }} style={{ width: 26, height: 26, borderRadius: 13 }} contentFit="cover" />
                  : <Text style={[c.replyAvatarLetter, { color: colors.primary }]}>{(reply.author?.name ?? 'U')[0].toUpperCase()}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <View style={[c.commentBubble, { backgroundColor: colors.surfaceAlt ?? colors.surface }]}>
                  <Text style={[c.commentAuthor, { color: colors.textPrimary }]}>{reply.author?.name}</Text>
                  <Text style={[c.commentContent, { color: colors.textSecondary }]}>{reply.content}</Text>
                </View>
                <Text style={[c.commentTime, { color: colors.textMuted }]}>{timeAgo(reply.createdAt)}</Text>
              </View>
            </View>
          ))}
          {comment.repliesCount > (comment.replies?.length ?? 0) && (
            <TouchableOpacity style={c.viewMoreReplies}>
              <Text style={[c.viewMoreRepliesText, { color: colors.primary }]}>
                View {comment.repliesCount - (comment.replies?.length ?? 0)} more replies
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </MotiView>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [commentText, setCommentText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const { data: postData, isLoading: postLoading } = useCommunityPost(id ?? '');
  const { data: commentsData, isLoading: commentsLoading, refetch: refetchComments } = useCommunityComments(id ?? '');
  const addCommentMut  = useAddComment();
  const deleteCommentMut = useDeleteComment();

  const post     = postData?.post ?? postData;
  const comments = commentsData?.comments ?? [];

  const handleSendComment = useCallback(async () => {
    if (!commentText.trim()) return;
    addCommentMut.mutate({
      postId: id,
      content: commentText.trim(),
      parentId: replyTo?._id ?? replyTo?.id ?? null,
    }, {
      onSuccess: () => {
        setCommentText('');
        setReplyTo(null);
        refetchComments();
        Toast.show({ type: 'success', text1: 'Comment added!' });
      },
      onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Failed to comment' }),
    });
  }, [commentText, id, replyTo, addCommentMut, refetchComments]);

  const handleDeleteComment = useCallback((comment: any) => {
    Alert.alert('Delete Comment', 'Delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => deleteCommentMut.mutate({ postId: id, commentId: comment._id ?? comment.id }, {
          onSuccess: () => { refetchComments(); Toast.show({ type: 'info', text1: 'Comment deleted' }); },
        }),
      },
    ]);
  }, [id, deleteCommentMut, refetchComments]);

  const handleShare = useCallback(async () => {
    if (!post) return;
    await Share.share({ message: `${post.content?.slice(0, 120)}\n\nWimaKit Community`, title: `Post by ${post.author?.name}` });
  }, [post]);

  if (postLoading) {
    return (
      <SafeAreaView style={[{ flex: 1, backgroundColor: colors.background }]} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Post</Text>
        <TouchableOpacity style={{ padding: 4 }} onPress={handleShare}>
          <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <FlatList
          data={comments}
          keyExtractor={(item: any) => item._id ?? item.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            post ? (
              <View>
                <PostCard
                  post={post}
                  onComment={() => inputRef.current?.focus()}
                  onShare={handleShare}
                />
                <View style={[s.commentsHeader, { borderBottomColor: colors.border }]}>
                  <MaterialCommunityIcons name="comment-multiple-outline" size={16} color={colors.primary} />
                  <Text style={[s.commentsTitle, { color: colors.textPrimary }]}>
                    {post.commentsCount ?? 0} Comment{post.commentsCount !== 1 ? 's' : ''}
                  </Text>
                </View>
                {commentsLoading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />}
              </View>
            ) : null
          }
          renderItem={({ item: comment }) => (
            <CommentItem
              comment={comment}
              onReply={(c: any) => { setReplyTo(c); inputRef.current?.focus(); }}
              onDelete={handleDeleteComment}
              colors={colors}
              user={user}
            />
          )}
          ListEmptyComponent={
            !commentsLoading ? (
              <View style={s.noComments}>
                <MaterialCommunityIcons name="comment-outline" size={48} color={colors.textMuted} />
                <Text style={[s.noCommentsText, { color: colors.textMuted }]}>No comments yet. Be the first!</Text>
              </View>
            ) : null
          }
        />

        {/* Reply banner */}
        {replyTo && (
          <View style={[s.replyBanner, { backgroundColor: colors.primaryMuted, borderTopColor: colors.primary }]}>
            <MaterialCommunityIcons name="reply" size={16} color={colors.primary} />
            <Text style={[s.replyBannerText, { color: colors.primary }]} numberOfLines={1}>
              Replying to {replyTo.author?.name}: {replyTo.content?.slice(0, 40)}
            </Text>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <MaterialCommunityIcons name="close" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Comment input */}
        <View style={[s.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={[s.inputAvatar, { backgroundColor: colors.primaryMuted }]}>
            {user?.avatar
              ? <Image source={{ uri: user.avatar }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
              : <Text style={[s.inputAvatarLetter, { color: colors.primary }]}>{(user?.name ?? 'U')[0].toUpperCase()}</Text>
            }
          </View>
          <View style={[s.inputWrap, { backgroundColor: colors.surfaceAlt ?? colors.background, borderColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[s.commentInput, { color: colors.textPrimary }]}
              value={commentText}
              onChangeText={setCommentText}
              placeholder={replyTo ? `Reply to ${replyTo.author?.name}…` : 'Write a comment…'}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={1000}
            />
          </View>
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: commentText.trim() ? colors.primary : colors.border }]}
            onPress={handleSendComment}
            disabled={!commentText.trim() || addCommentMut.isPending}
          >
            {addCommentMut.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialCommunityIcons name="send" size={18} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  headerTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '800' },
  commentsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderBottomWidth: 1 },
  commentsTitle: { fontSize: 15, fontWeight: '700' },
  noComments: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  noCommentsText: { fontSize: 14 },
  replyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 8, borderTopWidth: 2 },
  replyBannerText: { flex: 1, fontSize: 12, fontWeight: '600' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: Spacing.lg, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 12, borderTopWidth: 1 },
  inputAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  inputAvatarLetter: { fontSize: 14, fontWeight: '900' },
  inputWrap: { flex: 1, borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, maxHeight: 120 },
  commentInput: { fontSize: 15, lineHeight: 21 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});

const c = StyleSheet.create({
  commentWrap: { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderBottomWidth: 1 },
  commentAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, marginTop: 2 },
  commentAvatarLetter: { fontSize: 14, fontWeight: '900' },
  commentBubble: { borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  commentAuthor: { fontSize: 13, fontWeight: '700' },
  commentContent: { fontSize: 14, lineHeight: 20 },
  commentActions: { flexDirection: 'row', gap: 14, paddingLeft: 4 },
  commentTime: { fontSize: 11 },
  commentActionText: { fontSize: 12, fontWeight: '600' },
  miniReactions: { flexDirection: 'row', gap: 4, borderRadius: 24, borderWidth: 1, padding: 6, marginTop: 4, alignSelf: 'flex-start' },
  miniReactionBtn: { padding: 2 },
  replyWrap: { flexDirection: 'row', gap: 8, marginTop: 8, marginLeft: 8 },
  replyAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, marginTop: 2 },
  replyAvatarLetter: { fontSize: 11, fontWeight: '900' },
  viewMoreReplies: { paddingVertical: 6 },
  viewMoreRepliesText: { fontSize: 12, fontWeight: '700' },
});
