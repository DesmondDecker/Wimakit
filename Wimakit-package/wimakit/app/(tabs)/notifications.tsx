import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store';
import { useNotificationStore } from '../../store/notifications';
import { 
  useNotifications, 
  useFollowedStoresDetails, 
  useUnfollowProfile, 
  useFollowProfile,
  useMarkAllRead,
  useMarkNotificationRead,
  useDeleteNotification,
  useBatchDeleteNotifications,
  useClearAllNotifications,
} from '../../hooks/useApi';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { Image } from 'expo-image';
import Toast from 'react-native-toast-message';

type NotifFilter = 'all' | 'orders' | 'trending' | 'community' | 'system';

const TABS: { id: NotifFilter; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'orders',    label: 'Orders' },
  { id: 'trending',  label: 'Trending & Ads' },
  { id: 'community', label: 'Community' },
  { id: 'system',    label: 'System' },
];

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user: currentUser, updateUser } = useAuthStore();

  const { data: notificationsData, isLoading: isLoadingNotifications, refetch: refetchNotifications } = useNotifications();
  const setUnread = useNotificationStore((s) => s.setUnread);
  const { data: followedStoresData, isLoading: isLoadingFollowing, refetch: refetchFollowing } = useFollowedStoresDetails(currentUser?.following);

  const [filter, setFilter] = useState<NotifFilter>('all');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const unfollowMutation = useUnfollowProfile();
  const followMutation = useFollowProfile();
  const markAllReadMutation = useMarkAllRead();
  const markReadMutation = useMarkNotificationRead();
  const deleteMutation = useDeleteNotification();
  const batchDeleteMutation = useBatchDeleteNotifications();
  const clearAllMutation = useClearAllNotifications();

  const [refreshing, setRefreshing] = useState(false);

  const notifications = notificationsData?.data || [];
  const unreadCount = notifications.filter((n: any) => !n.read).length;

  const followingStores = useMemo(() => {
    return followedStoresData?.data || [];
  }, [followedStoresData]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'orders') {
      return notifications.filter((n: any) => 
        n.type === 'order_status' || n.type === 'new_order' || n.type === 'wallet_credit' || n.type === 'wallet_debit'
      );
    }
    if (filter === 'trending') {
      return notifications.filter((n: any) => 
        n.type === 'ad' || n.type === 'product_trending' || n.type === 'promotion' || n.type === 'new_product'
      );
    }
    if (filter === 'community') {
      return notifications.filter((n: any) => 
        n.type?.startsWith('community_') || n.type === 'new_follower' || n.type === 'message'
      );
    }
    if (filter === 'system') {
      return notifications.filter((n: any) => 
        n.type === 'system' || n.type === 'warning' || n.type === 'kyc_approved' || n.type === 'kyc_rejected' || n.type === 'loan_approved'
      );
    }
    return notifications;
  }, [notifications, filter]);

  const handleUnfollow = useCallback(async (id: string) => {
    try {
      await unfollowMutation.mutateAsync(id);
      Toast.show({ type: 'success', text1: 'Unfollowed store' });
      refetchNotifications();
      refetchFollowing();
      if (currentUser) {
        updateUser({ ...currentUser, following: (currentUser.following ?? []).filter((fId: any) => fId !== id) });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to unfollow' });
    }
  }, [unfollowMutation, refetchNotifications, refetchFollowing, currentUser, updateUser]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchNotifications(), refetchFollowing()]);
    setRefreshing(false);
  }, [refetchNotifications, refetchFollowing]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllReadMutation.mutateAsync();
      setUnread(0);
      Toast.show({ type: 'success', text1: 'All notifications marked as read' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to mark all read' });
    }
  }, [markAllReadMutation, setUnread]);

  // Single delete
  const handleSingleDelete = useCallback((id: string) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(id);
              Toast.show({ type: 'success', text1: 'Notification deleted' });
            } catch (err) {
              Toast.show({ type: 'error', text1: 'Failed to delete notification' });
            }
          }
        }
      ]
    );
  }, [deleteMutation]);

  // Batch selection toggle
  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredNotifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map((n: any) => n._id)));
    }
  }, [selectedIds.size, filteredNotifications]);

  // Batch delete
  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    Alert.alert(
      'Delete Selected',
      `Are you sure you want to delete ${ids.length} selected notification(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await batchDeleteMutation.mutateAsync(ids);
              setSelectedIds(new Set());
              setIsSelectMode(false);
              Toast.show({ type: 'success', text1: `${ids.length} notifications deleted` });
            } catch (err) {
              Toast.show({ type: 'error', text1: 'Failed to delete notifications' });
            }
          }
        }
      ]
    );
  }, [selectedIds, batchDeleteMutation]);

  // Clear all
  const handleClearAll = useCallback(() => {
    Alert.alert(
      'Clear All Notifications',
      'This will remove all notifications from your activity feed. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllMutation.mutateAsync();
              setSelectedIds(new Set());
              setIsSelectMode(false);
              Toast.show({ type: 'success', text1: 'All notifications cleared' });
            } catch (err) {
              Toast.show({ type: 'error', text1: 'Failed to clear notifications' });
            }
          }
        }
      ]
    );
  }, [clearAllMutation]);

  const handleFollowBack = async (userId: string) => {
    try {
      await followMutation.mutateAsync(userId);
      updateUser({ following: [...(currentUser?.following || []), userId] });
      Toast.show({ type: 'success', text1: 'Followed back!' });
    } catch (e) {}
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'ad': return 'bullhorn';
      case 'product_trending': return 'fire';
      case 'order_status':
      case 'new_order': return 'truck-fast-outline';
      case 'wallet_credit':
      case 'wallet_debit': return 'wallet-outline';
      case 'new_product': return 'tag-outline';
      case 'message': return 'message-text-outline';
      case 'promotion': return 'sale';
      case 'community_post': return 'post-outline';
      case 'community_like': return 'heart-outline';
      case 'community_comment': return 'comment-text-outline';
      case 'community_mention': return 'at';
      case 'community_follow':
      case 'new_follower': return 'account-plus-outline';
      case 'kyc_approved':
      case 'loan_approved': return 'check-decagram-outline';
      case 'warning': return 'alert-circle-outline';
      case 'system':
      default: return 'bell-outline';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'ad': return '#F59E0B';
      case 'product_trending': return '#EF4444';
      case 'order_status':
      case 'new_order': return '#10B981';
      case 'wallet_credit': return '#10B981';
      case 'wallet_debit': return '#EF4444';
      case 'community_post': return '#3B82F6';
      case 'community_like': return '#EC4899';
      case 'community_comment':
      case 'community_mention': return '#3B82F6';
      case 'warning': return '#EF4444';
      case 'promotion': return '#8B5CF6';
      default: return colors.primary;
    }
  };

  const handlePressNotification = useCallback((item: any) => {
    if (isSelectMode) {
      toggleSelectId(item._id);
      return;
    }

    if (!item.read && item._id) {
      markReadMutation.mutate(item._id);
    }
    const data = item.data || {};
    if (data.url) {
      router.push(data.url as any);
      return;
    }
    if (data.postId) {
      router.push(`/community/post/${data.postId}` as any);
      return;
    }
    if (data.productId) {
      router.push(`/product/${data.productId}` as any);
      return;
    }
    if (data.orderId) {
      router.push(`/orders/${data.orderId}` as any);
      return;
    }
    if (item.link) {
      router.push(item.link as any);
      return;
    }
  }, [isSelectMode, toggleSelectId, router, markReadMutation]);

  const renderNotification = useCallback(({ item }: { item: any }) => {
    const isFollowNotif = item.type === 'new_follower' || item.type === 'community_follow' || item.message?.includes('started following');
    const senderId = item.sender?._id || item.sender;
    const isFollowingBack = currentUser?.following?.includes(senderId);
    const color = getNotificationColor(item.type);
    const isUnread = !item.read;
    const isSelected = selectedIds.has(item._id);

    return (
      <TouchableOpacity 
        style={[
          styles.notificationCard, 
          { 
            backgroundColor: isSelected ? colors.primaryMuted + '35' : (isUnread ? colors.primaryMuted + '15' : colors.surface), 
            borderColor: isSelected ? colors.primary : (isUnread ? colors.primary + '40' : colors.border),
          }
        ]}
        onPress={() => handlePressNotification(item)}
        onLongPress={() => {
          if (!isSelectMode) {
            setIsSelectMode(true);
            setSelectedIds(new Set([item._id]));
          }
        }}
        activeOpacity={0.8}
      >
        {isSelectMode ? (
          <View style={styles.selectCheckbox}>
            <MaterialCommunityIcons 
              name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} 
              size={24} 
              color={isSelected ? colors.primary : colors.textMuted} 
            />
          </View>
        ) : (
          <View style={[styles.notifIconWrap, { backgroundColor: color + '1A' }]}>
            <MaterialCommunityIcons name={getNotificationIcon(item.type) as any} size={22} color={color} />
          </View>
        )}

        <View style={{ flex: 1 }}>
          {item.title ? (
            <View style={styles.titleRow}>
              <Text style={[styles.notificationTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {item.title}
              </Text>
              {isUnread && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
            </View>
          ) : null}

          <Text style={[styles.notificationMessage, { color: isUnread ? colors.textPrimary : colors.textSecondary }]}>
            {item.message}
          </Text>

          <Text style={[styles.notificationTime, { color: colors.textMuted }]}>
            {new Date(item.createdAt).toLocaleDateString()} · {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        {!isSelectMode && isFollowNotif && !isFollowingBack && senderId ? (
          <TouchableOpacity 
            style={[styles.followBackBtn, { backgroundColor: colors.primary }]}
            onPress={() => handleFollowBack(senderId)}
          >
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Follow Back</Text>
          </TouchableOpacity>
        ) : !isSelectMode ? (
          <TouchableOpacity 
            style={styles.singleDeleteBtn} 
            onPress={() => handleSingleDelete(item._id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={19} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  }, [colors, currentUser, isSelectMode, selectedIds, handlePressNotification, handleFollowBack, handleSingleDelete]);

  const renderFollowingStore = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity 
      style={[styles.followingCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.sm }]} 
      onPress={() => router.push(`/profile/${item.profileSlug}` as any)}
    >
      <Image source={{ uri: item.avatar }} style={styles.followingAvatar} />
      <View style={styles.followingInfo}>
        <Text style={[styles.followingName, { color: colors.textPrimary }]}>{item.storeName || item.name}</Text>
        <Text style={[styles.followingCount, { color: colors.textMuted }]}>{item.followersCount ?? item.followers?.length ?? 0} Followers</Text>
      </View>
      <TouchableOpacity 
        style={[styles.unfollowBtn, { borderColor: colors.error }]}
        onPress={() => handleUnfollow(item._id)}
      >
        <Text style={[styles.unfollowBtnText, { color: colors.error }]}>Unfollow</Text>
      </TouchableOpacity>
    </TouchableOpacity> 
  ), [colors, handleUnfollow, router]);

  if (isLoadingNotifications || isLoadingFollowing) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}>
            <Text style={[styles.backText, { color: colors.primary }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Notifications</Text>
          <View style={{ width: 40 }} />
        </View>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1, justifyContent: 'center' }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
        {isSelectMode ? (
          <TouchableOpacity onPress={() => { setIsSelectMode(false); setSelectedIds(new Set()); }}>
            <Text style={[styles.cancelSelectText, { color: colors.textPrimary }]}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}>
            <Text style={[styles.backText, { color: colors.primary }]}>‹</Text>
          </TouchableOpacity>
        )}

        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {isSelectMode ? (selectedIds.size > 0 ? `${selectedIds.size} Selected` : 'Select Items') : 'Activity'}
          </Text>
          {!isSelectMode && unreadCount > 0 && (
            <Text style={[styles.headerSub, { color: colors.primary, fontWeight: '700' }]}>{unreadCount} unread</Text>
          )}
        </View>

        {isSelectMode ? (
          <TouchableOpacity onPress={handleSelectAll}>
            <Text style={[styles.markAllText, { color: colors.primary }]}>
              {selectedIds.size === filteredNotifications.length && filteredNotifications.length > 0 ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerRightActions}>
            {filteredNotifications.length > 0 && (
              <TouchableOpacity 
                style={styles.headerIconBtn} 
                onPress={() => setIsSelectMode(true)}
              >
                <MaterialCommunityIcons name="checkbox-multiple-marked-outline" size={21} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
            {notifications.length > 0 && (
              <TouchableOpacity 
                style={styles.headerIconBtn} 
                onPress={handleClearAll}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={21} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Normal mode top actions bar */}
      {!isSelectMode && unreadCount > 0 && (
        <View style={[styles.unreadBanner, { backgroundColor: colors.primaryMuted + '15', borderBottomColor: colors.border + '15' }]}>
          <Text style={[styles.unreadBannerText, { color: colors.textSecondary }]}>You have {unreadCount} unread notifications</Text>
          <TouchableOpacity onPress={handleMarkAllRead} disabled={markAllReadMutation.isPending}>
            <Text style={[styles.unreadBannerAction, { color: colors.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter tabs */}
      <View style={[styles.tabsRow, { borderBottomColor: colors.border + '20' }]}>
        {TABS.map((tab) => {
          const isActive = filter === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setFilter(tab.id)}
            >
              <Text style={[styles.tabText, { color: isActive ? colors.primary : colors.textMuted }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {!isSelectMode && filter === 'all' && (currentUser?.following?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Stores You Follow</Text>
            <FlatList
              data={followingStores}
              keyExtractor={(item) => item._id}
              renderItem={renderFollowingStore}
              scrollEnabled={false}
            /> 
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {filter === 'all' ? 'All Notifications' : `${TABS.find(t => t.id === filter)?.label}`}
          </Text>
          {filteredNotifications.length === 0 ? (
            <View style={styles.emptyState}> 
              <MaterialCommunityIcons name="bell-off-outline" size={44} color={colors.textMuted + '80'} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No notifications in this category</Text>
            </View>
          ) : (
            <FlatList
              data={filteredNotifications}
              keyExtractor={(item) => item._id}
              renderItem={renderNotification}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>

      {/* Batch Actions Footer */}
      {isSelectMode && (
        <View style={[styles.batchFooter, { backgroundColor: colors.surface, borderTopColor: colors.border, ...Shadow.md }]}>
          <Text style={[styles.batchFooterCount, { color: colors.textSecondary }]}>
            {selectedIds.size} selected
          </Text>
          <TouchableOpacity 
            style={[
              styles.batchDeleteBtn, 
              { backgroundColor: selectedIds.size > 0 ? colors.error : colors.border }
            ]}
            onPress={handleBatchDelete}
            disabled={selectedIds.size === 0 || batchDeleteMutation.isPending}
          >
            <MaterialCommunityIcons name="trash-can" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.batchDeleteBtnText}>
              Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 36, fontWeight: '100', marginTop: -4 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  headerSub: { fontSize: FontSize.xs, marginTop: 1 },
  markAllText: { fontSize: FontSize.xs, fontWeight: '700' },
  cancelSelectText: { fontSize: FontSize.sm, fontWeight: '700' },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIconBtn: { padding: 6 },
  unreadBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: 8, borderBottomWidth: 0.5 },
  unreadBannerText: { fontSize: FontSize.xs, fontWeight: '600' },
  unreadBannerAction: { fontSize: FontSize.xs, fontWeight: '800' },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 0.5 },
  tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  section: { padding: Spacing.lg },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', marginBottom: Spacing.md },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  selectCheckbox: {
    paddingTop: 8,
    paddingRight: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  notificationTitle: {
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    marginRight: 6,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  notificationMessage: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  notificationTime: {
    fontSize: 11,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  emptyText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  followingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  followingAvatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    marginRight: Spacing.md,
  },
  followingInfo: { flex: 1 },
  followingName: { fontSize: FontSize.sm, fontWeight: '700' },
  followingCount: { fontSize: FontSize.xs, marginTop: 2 },
  unfollowBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  unfollowBtnText: { fontSize: FontSize.xs, fontWeight: '700' },
  notifIconWrap: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  followBackBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    marginLeft: 'auto',
    alignSelf: 'center',
  },
  singleDeleteBtn: {
    padding: 6,
    alignSelf: 'flex-start',
  },
  batchFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderTopWidth: 0.5,
  },
  batchFooterCount: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  batchDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.full,
  },
  batchDeleteBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
});