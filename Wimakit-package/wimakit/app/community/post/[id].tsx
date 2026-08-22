import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, Stack } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useAuthStore } from '@/store';
import PostCard from '@/components/community/PostCard';
import { CommentCard, CommentItem } from '@/components/community/CommentCard';
import { ThemedView } from '@/components/Themed';
import { useTheme } from '@/context/ThemeContext';
import {
  useCommunityPost, useCommunityComments, useAddComment,
  useUpdateComment, useDeleteComment, useReactComment,
} from '@/hooks/useApi';
import { Spacing, Radius, FontSize } from '@/constants/theme';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const postIdStr = Array.isArray(id) ? id[0] : (id ?? '');
  const user = useAuthStore((state) => state.user);
  const navigation = useNavigation();
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);

  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);

  const {
    data: postData, isLoading: isLoadingPost, isError: isPostError, error: postError, refetch: refetchPost,
  } = useCommunityPost(postIdStr);

  const {
    data: commentsData, isLoading: isLoadingComments, refetch: refetchComments,
  } = useCommunityComments(postIdStr);

  const addCommentMut = useAddComment();
  const updateCommentMut = useUpdateComment();
  const deleteCommentMut = useDeleteComment();
  const reactCommentMut = useReactComment();

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refetchPost();
      refetchComments();
    });
    return unsubscribe;
  }, [postIdStr, refetchPost, refetchComments]);

  const currentPost = postData?.post ?? postData;
  const comments = (commentsData?.comments ?? []) as CommentItem[];

  const handleSendComment = useCallback(async () => {
    if (!user) {
      Toast.show({ type: 'info', text1: 'Please sign in to comment' });
      return;
    }
    if (!newComment.trim() || addCommentMut.isPending || !postIdStr) return;

    const parentId = replyingTo?.id;

    addCommentMut.mutate(
      {
        postId: postIdStr,
        content: newComment.trim(),
        parentId,
      },
      {
        onSuccess: (data: any) => {
          setNewComment('');
          setReplyingTo(null);
          if (data?.queued) {
            Toast.show({ type: 'info', text1: "Comment saved — will post when you're back online" });
          }
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? err?.message ?? 'Could not post your comment. Please try again.';
          Toast.show({ type: 'error', text1: msg });
        },
      }
    );
  }, [newComment, postIdStr, replyingTo, addCommentMut, user]);

  const handleReplyPress = useCallback((comment: CommentItem) => {
    const commentId = comment._id ?? comment.id ?? '';
    const name = comment.author?.name ?? 'User';
    setReplyingTo({ id: commentId, name });
    inputRef.current?.focus();
  }, []);

  const handleEditComment = useCallback((commentId: string, newContent: string) => {
    if (!postIdStr || !commentId) return;
    updateCommentMut.mutate(
      { postId: postIdStr, commentId, content: newContent },
      {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: 'Comment updated' });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? 'Could not update comment.';
          Toast.show({ type: 'error', text1: msg });
        },
      }
    );
  }, [postIdStr, updateCommentMut]);

  const handleDeleteComment = useCallback((commentId: string) => {
    if (!postIdStr || !commentId) return;
    deleteCommentMut.mutate(
      { postId: postIdStr, commentId },
      {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: 'Comment deleted' });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? 'Could not delete comment.';
          Toast.show({ type: 'error', text1: msg });
        },
      }
    );
  }, [postIdStr, deleteCommentMut]);

  const handleReactComment = useCallback((commentId: string) => {
    if (!user) {
      Toast.show({ type: 'info', text1: 'Please sign in to like comments' });
      return;
    }
    if (!postIdStr || !commentId) return;
    reactCommentMut.mutate({ postId: postIdStr, commentId });
  }, [postIdStr, reactCommentMut, user]);

  const onRefresh = useCallback(() => {
    refetchPost();
    refetchComments();
  }, [refetchPost, refetchComments]);

  if (isLoadingPost) {
    return (
      <ThemedView style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </ThemedView>
    );
  }

  if (isPostError && (postError as any)?.response?.status !== 404) {
    return (
      <ThemedView style={[s.center, { padding: 24, gap: 12 }]}>
        <Text style={{ color: colors.textPrimary, textAlign: 'center' }}>
          Couldn't load this post. Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={() => refetchPost()}
          style={[s.retryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  if (!currentPost) {
    return (
      <ThemedView style={s.center}>
        <Text style={{ color: colors.textMuted }}>Post not found.</Text>
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Post Details', headerBackTitle: 'Back' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Spacing.lg }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isLoadingPost} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <View style={{ backgroundColor: colors.surface, padding: Spacing.md, marginBottom: 8 }}>
            <PostCard post={currentPost} />
          </View>

          <View style={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.sm }}>
            <View style={s.commentsHeader}>
              <Text style={[s.commentsTitle, { color: colors.textPrimary }]}>
                Comments ({currentPost.commentsCount ?? comments.length ?? 0})
              </Text>
            </View>

            {isLoadingComments && (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            )}

            {!isLoadingComments && comments.length === 0 && (
              <View style={s.emptyComments}>
                <MaterialCommunityIcons name="comment-text-outline" size={40} color={colors.textMuted + '60'} />
                <Text style={[s.emptyCommentsText, { color: colors.textMuted }]}>
                  No comments yet. Be the first to start the conversation!
                </Text>
              </View>
            )}

            {comments.map((comment) => (
              <CommentCard
                key={comment._id ?? comment.id}
                comment={comment}
                postId={postIdStr}
                onReply={handleReplyPress}
                onEdit={handleEditComment}
                onDelete={handleDeleteComment}
                onReact={handleReactComment}
              />
            ))}
          </View>
        </ScrollView>

        {/* Comment Input Bar */}
        <View
          style={[
            s.inputBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          ]}
        >
          {/* Replying banner */}
          {replyingTo && (
            <View style={[s.replyingBanner, { backgroundColor: colors.primaryMuted, borderColor: colors.primary + '30' }]}>
              <Text style={[s.replyingText, { color: colors.primary }]}>
                Replying to <Text style={{ fontWeight: '800' }}>@{replyingTo.name}</Text>
              </Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          <View style={s.inputRow}>
            <TextInput
              ref={inputRef}
              style={[
                s.textInput,
                {
                  backgroundColor: colors.background,
                  color: colors.textPrimary,
                  borderColor: colors.border,
                },
              ]}
              placeholder={replyingTo ? `Reply to @${replyingTo.name}...` : 'Write a comment...'}
              placeholderTextColor={colors.textMuted}
              value={newComment}
              onChangeText={setNewComment}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              onPress={handleSendComment}
              disabled={addCommentMut.isPending || !newComment.trim()}
              style={[
                s.sendBtn,
                {
                  backgroundColor: newComment.trim() ? colors.primary : colors.border,
                },
              ]}
            >
              {addCommentMut.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="arrow-up" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: Radius.full },
  commentsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  commentsTitle: { fontSize: FontSize.md, fontWeight: '800' },
  emptyComments: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyCommentsText: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 240,
  },
  inputBar: {
    width: '100%',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs + 4,
    paddingBottom: Spacing.sm + 4,
    borderTopWidth: 1,
  },
  replyingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  replyingText: {
    fontSize: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
});