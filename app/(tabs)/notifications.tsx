import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store'; // Removed useOrdersStore as it's not used
import { useNotificationStore } from '../../store/notifications';
import { 
  useNotifications, 
  useFollowedStoresDetails, 
  useUnfollowProfile, 
  useFollowProfile,
  useMarkAllRead 
} from '../../hooks/useApi';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { Image } from 'expo-image';
import Toast from 'react-native-toast-message';

type NotifType = 'all' | 'new_product' | 'order_status' | 'message' | 'promotion' | 'system';

const TABS: { id: NotifType; label: string }[] = [
  { id: 'all',         label: 'All' }, // No icon here, handled by renderNotification
  { id: 'new_product', label: 'New Products' },
  { id: 'order_status',label: 'Order Updates' },
  { id: 'message',     label: 'Messages' },
  { id: 'promotion',   label: 'Promos' },
  { id: 'system',      label: 'System' },
];

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user: currentUser, updateUser } = useAuthStore();

  const { data: notificationsData, isLoading: isLoadingNotifications, refetch: refetchNotifications } = useNotifications();
  const setUnread = useNotificationStore((s) => s.setUnread);
  const { data: followedStoresData, isLoading: isLoadingFollowing, refetch: refetchFollowing } = useFollowedStoresDetails(currentUser?.following);

  const [filter, setFilter] = useState<NotifType>('all');
  const unfollowMutation = useUnfollowProfile();
  const followMutation = useFollowProfile();
  const markAllReadMutation = useMarkAllRead();
  const [refreshing, setRefreshing] = useState(false);

  const notifications = notificationsData?.data || [];
  const unreadCount = notifications.filter((n: any) => !n.read).length;

  const followingStores = useMemo(() => {
    return followedStoresData?.data || [];
  }, [followedStoresData]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications;
    return notifications.filter((n: any) => n.type === filter);
  }, [notifications, filter]);

  const handleUnfollow = useCallback(async (id: string) => {
    try {
      await unfollowMutation.mutateAsync(id);
      Toast.show({ type: 'success', text1: 'Unfollowed store' });
      refetchNotifications();
      refetchFollowing();
      // Manually update local user state if needed, or rely on refetch
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
      setUnread(0); // Optimistically update unread count
      Toast.show({ type: 'success', text1: 'All notifications marked as read' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to mark all read' });
    }
  }, [markAllReadMutation]);

  const handleFollowBack = async (userId: string) => {
    try {
      await followMutation.mutateAsync(userId);
      updateUser({ following: [...(currentUser?.following || []), userId] });
      Toast.show({ type: 'success', text1: 'Followed back!' });
    } catch (e) {}
  };

  const getNotificationIcon = (type: NotifType) => {
    switch (type) {
      case 'new_product': return 'package-variant-closed';
      case 'order_status': return 'truck-fast-outline';
      case 'message': return 'message-text-outline';
      case 'promotion': return 'tag-outline';
      case 'system': return 'cog-outline';
      case 'all':
      default: return 'bell-outline';
    }
  };

  const getNotificationColor = (type: NotifType) => colors.primary; // Customize colors based on type if needed

  const renderNotification = useCallback(({ item }: { item: any }) => {
    const isFollowNotif = item.type === 'new_follower' || item.message.includes('started following');
    const senderId = item.sender?._id || item.sender;
    const isFollowingBack = currentUser?.following?.includes(senderId);

    return (
      <TouchableOpacity 
        style={[styles.notificationCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => item.link && router.push(item.link as any)}
        activeOpacity={0.85}
      >
        <View style={[styles.notifIconWrap, { backgroundColor: getNotificationColor(item.type) + '22' }]}>
          <MaterialCommunityIcons name={getNotificationIcon(item.type)} size={24} color={getNotificationColor(item.type)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.notificationMessage, { color: colors.textPrimary }]}>{item.message}</Text>
          <Text style={[styles.notificationTime, { color: colors.textMuted }]}>{new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        {isFollowNotif && !isFollowingBack && senderId && (
          <TouchableOpacity 
            style={[styles.followBackBtn, { backgroundColor: colors.primary }]}
            onPress={() => handleFollowBack(senderId)}
          >
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>Follow Back</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [colors, router, currentUser, handleFollowBack, getNotificationIcon, getNotificationColor]);

  const renderFollowingStore = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity style={[styles.followingCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.sm }]} onPress={() => router.push(`/profile/${item.profileSlug}` as any)}>
      <Image source={{ uri: item.avatar }} style={styles.followingAvatar} />
      <View style={styles.followingInfo}>
        <Text style={[styles.followingName, { color: colors.textPrimary }]}>{item.storeName}</Text>
        <Text style={[styles.followingCount, { color: colors.textMuted }]}>{item.followersCount ?? item.followers?.length ?? 0} Followers</Text>
      </View>
      <TouchableOpacity 
        style={[styles.unfollowBtn, { borderColor: colors.error }]}
        onPress={() => handleUnfollow(item._id)}
      >
        <Text style={[styles.unfollowBtnText, { color: colors.error }]}>Unfollow</Text>
      </TouchableOpacity>
    </TouchableOpacity> 
  ), [colors, handleUnfollow]);

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
    // The previous version of notifications.tsx had a different header structure.
    // I'm adapting the new header structure from the previous diff for consistency.
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}>
          <Text style={[styles.backText, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Activity</Text>
          {unreadCount > 0 && (
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} disabled={markAllReadMutation.isPending}>
            <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs */}
      <View style={[styles.tabsRow, { borderBottomColor: colors.border + '20' }]}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, filter === tab.id && { borderBottomColor: colors.primary }]} // No icon here, handled by renderNotification
            onPress={() => setFilter(tab.id)}
          >
            <Text style={[styles.tabText, { color: filter === tab.id ? colors.primary : colors.textMuted }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
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
        {(currentUser?.following?.length ?? 0) > 0 && (
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
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your Notifications</Text>
          {notifications.length === 0 ? (
            <View style={styles.emptyState}> 
              <MaterialCommunityIcons name="bell-off-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No new notifications</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 36, fontWeight: '100', marginTop: -4 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700' },
  headerSub: { fontSize: FontSize.xs },
  markAllText: { fontSize: FontSize.sm, fontWeight: '700' },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 0.5 },
  tab: { flex: 1, paddingVertical: Spacing.xl, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'transparent' },
  tabText: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  section: { padding: Spacing.lg, borderBottomWidth: 0.5 },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.lg },
  notificationCard: {
    padding: Spacing.lg, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.sm,
    // Add styling for unread notifications if desired, e.g., a different background color
  },
  notificationMessage: { fontSize: FontSize.md, fontWeight: '500' },
  notificationTime: { fontSize: FontSize.xs, color: '#999', marginTop: Spacing.xs },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md, borderWidth: 1, borderColor: 'transparent', borderRadius: Radius.xl, marginHorizontal: Spacing.lg, backgroundColor: 'rgba(0,0,0,0.02)' },
  emptyText: { fontSize: FontSize.md, color: '#666' },
  followingCard: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.sm,
  },
  followingAvatar: { width: 48, height: 48, borderRadius: Radius.full, marginRight: Spacing.md },
  followingInfo: { flex: 1 },
  followingName: { fontSize: FontSize.md, fontWeight: '700' },
  followingCount: { fontSize: FontSize.sm, color: '#999' },
  unfollowBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  unfollowBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
  notifIconWrap: { width: 48, height: 48, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  followBackBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginLeft: 'auto' },
});