import React, { useState, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { timeAgo, formatNumber } from '../../constants/data';
import { Radius, Spacing, FontSize } from '../../constants/theme';
import { useAuthStore } from '../../store';

export interface CommentAuthor {
  _id?: string;
  id?: string;
  name?: string;
  avatar?: string;
  profileSlug?: string;
  isVerified?: boolean;
  role?: string;
  storeName?: string;
}

export interface CommentItem {
  _id?: string;
  id?: string;
  postId?: string;
  author?: CommentAuthor;
  content?: string;
  createdAt?: string;
  isEdited?: boolean;
  parentId?: string | null;
  repliesCount?: number;
  replies?: CommentItem[];
  reactions?: {
    like?: number;
  };
  isLiked?: boolean;
}

interface CommentCardProps {
  comment: CommentItem;
  postId: string;
  onReply?: (comment: CommentItem) => void;
  onEdit?: (commentId: string, newContent: string) => void;
  onDelete?: (commentId: string) => void;
  onReact?: (commentId: string) => void;
  isReply?: boolean;
}

export const CommentCard = memo(function CommentCard({
  comment,
  postId,
  onReply,
  onEdit,
  onDelete,
  onReact,
  isReply = false,
}: CommentCardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore(s => s.user);

  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(comment.content ?? '');
  const [showReplies, setShowReplies] = useState(true);

  const commentId = comment._id ?? comment.id ?? '';
  const authorId = comment.author?._id ?? comment.author?.id ?? '';
  const currentUserId = user?._id ?? user?.id ?? '';
  const isOwn = currentUserId && authorId && currentUserId === authorId;
  const isAdmin = user?.role === 'admin';

  const authorName = comment.author?.name ?? 'Anonymous';
  const avatarLetter = authorName.charAt(0).toUpperCase() || 'A';
  const likeCount = comment.reactions?.like ?? 0;
  const replies = comment.replies ?? [];

  const handleSaveEdit = () => {
    if (!editedText.trim()) {
      Alert.alert('Error', 'Comment cannot be empty.');
      return;
    }
    if (editedText.trim() === comment.content) {
      setIsEditing(false);
      return;
    }
    onEdit?.(commentId, editedText.trim());
    setIsEditing(false);
  };

  const handleDeletePress = () => {
    Alert.alert('Delete Comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDelete?.(commentId),
      },
    ]);
  };

  const handleAuthorPress = () => {
    if (comment.author?.profileSlug) {
      router.push(`/profile/${comment.author.profileSlug}` as any);
    }
  };

  return (
    <View style={[styles.wrapper, isReply && styles.replyWrapper]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: isReply ? colors.background : colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleAuthorPress} activeOpacity={0.8} style={styles.authorRow}>
            {comment.author?.avatar ? (
              <Image source={{ uri: comment.author.avatar }} style={[styles.avatar, isReply && styles.replyAvatar]} contentFit="cover" />
            ) : (
              <View style={[styles.avatarFallback, isReply && styles.replyAvatar, { backgroundColor: colors.primaryMuted }]}>
                <Text style={[styles.avatarLetter, { color: colors.primary }]}>{avatarLetter}</Text>
              </View>
            )}

            <View style={styles.authorInfo}>
              <View style={styles.nameRow}>
                <Text style={[styles.authorName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {authorName}
                </Text>
                {comment.author?.isVerified && (
                  <MaterialCommunityIcons name="check-decagram" size={13} color={colors.primary} />
                )}
                {comment.author?.role === 'seller' && (
                  <View style={[styles.roleBadge, { backgroundColor: colors.accent + '20' }]}>
                    <Text style={[styles.roleText, { color: colors.accent }]}>Seller</Text>
                  </View>
                )}
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaText, { color: colors.textMuted }]}>
                  {comment.createdAt ? timeAgo(comment.createdAt) : ''}
                </Text>
                {comment.isEdited && (
                  <Text style={[styles.editedBadge, { color: colors.textMuted }]}>• (edited)</Text>
                )}
              </View>
            </View>
          </TouchableOpacity>

          {/* Edit / Delete actions for owner */}
          {(isOwn || isAdmin) && !isEditing && (
            <View style={styles.ownerActions}>
              {isOwn && (
                <TouchableOpacity
                  onPress={() => {
                    setEditedText(comment.content ?? '');
                    setIsEditing(true);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.actionIconButton}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleDeletePress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.actionIconButton}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.error ?? '#ef4444'} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Content or Edit Input */}
        {isEditing ? (
          <View style={styles.editContainer}>
            <TextInput
              style={[
                styles.editInput,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
              value={editedText}
              onChangeText={setEditedText}
              multiline
              autoFocus
            />
            <View style={styles.editButtons}>
              <TouchableOpacity
                style={[styles.editBtn, { backgroundColor: colors.border }]}
                onPress={() => setIsEditing(false)}
              >
                <Text style={[styles.editBtnText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveEdit}
              >
                <Text style={[styles.editBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={[styles.commentText, { color: colors.textPrimary }]}>
            {comment.content ?? ''}
          </Text>
        )}

        {/* Action Bar (Like, Reply) */}
        {!isEditing && (
          <View style={[styles.actionBar, { borderTopColor: colors.border + '60' }]}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onReact?.(commentId)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={comment.isLiked ? 'heart' : 'heart-outline'}
                size={16}
                color={comment.isLiked ? (colors.error ?? '#ef4444') : colors.textMuted}
              />
              <Text
                style={[
                  styles.actionText,
                  { color: comment.isLiked ? (colors.error ?? '#ef4444') : colors.textMuted },
                ]}
              >
                {likeCount > 0 ? formatNumber(likeCount) : 'Like'}
              </Text>
            </TouchableOpacity>

            {!isReply && onReply && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onReply(comment)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="reply-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.actionText, { color: colors.textMuted }]}>Reply</Text>
              </TouchableOpacity>
            )}

            {!isReply && replies.length > 0 && (
              <TouchableOpacity
                style={styles.showRepliesBtn}
                onPress={() => setShowReplies(prev => !prev)}
              >
                <Text style={[styles.showRepliesText, { color: colors.primary }]}>
                  {showReplies ? 'Hide replies' : `Show replies (${replies.length})`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Nested Replies */}
      {!isReply && showReplies && replies.length > 0 && (
        <View style={styles.repliesList}>
          {replies.map(reply => (
            <CommentCard
              key={reply._id ?? reply.id}
              comment={reply}
              postId={postId}
              onEdit={onEdit}
              onDelete={onDelete}
              onReact={onReact}
              isReply={true}
            />
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.sm,
  },
  replyWrapper: {
    marginLeft: 28,
    marginTop: 6,
    marginBottom: 2,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.sm + 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: Spacing.sm,
  },
  replyAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  avatarLetter: {
    fontSize: 14,
    fontWeight: '800',
  },
  authorInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  authorName: {
    fontSize: 13,
    fontWeight: '700',
  },
  roleBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 4,
  },
  roleText: {
    fontSize: 9,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  metaText: {
    fontSize: 11,
  },
  editedBadge: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  ownerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIconButton: {
    padding: 4,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
    marginBottom: 8,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  showRepliesBtn: {
    marginLeft: 'auto',
  },
  showRepliesText: {
    fontSize: 12,
    fontWeight: '600',
  },
  editContainer: {
    marginVertical: 6,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  editBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  repliesList: {
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(128, 128, 128, 0.2)',
    marginLeft: 16,
    paddingLeft: 4,
    marginTop: 4,
  },
});
