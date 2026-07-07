import React, { useState, useCallback, memo, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { useTheme } from '../../context/ThemeContext';
import { 
  useMyOrders, 
  useFollowProfile, 
  useUnfollowProfile 
} from '../../hooks/useApi';
import { useOrdersStore, useAuthStore } from '../../store';
import { OrderCardSkeleton } from '../../components/ui/Skeleton';
import { formatPrice } from '../../constants/data';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { io } from 'socket.io-client';

const STATUS_TABS = [
  { id: undefined,        label: 'All' },
  { id: 'pending',        label: 'Pending' },
  { id: 'confirmed',      label: 'Confirmed' },
  { id: 'in_transit',     label: 'Delivering' },
  { id: 'delivered',      label: 'Delivered' },
  { id: 'cancelled',      label: 'Cancelled' },
];

const COMPLAINT_COLORS: Record<string, string> = {
  pending: '#EF4444',
  investigating: '#F59E0B',
  resolved: '#10B981',
  refunded: '#6366F1',
};

// Must match the Order.status enum in the backend's models/Order.js exactly
// (see also ORDER_STATUS_META in constants/data.ts, which covers the same
// ground for other screens — kept in sync with that list).
const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  pending:          { label: 'Order Placed',   color: '#F59E0B', icon: 'clipboard-text-outline' },
  confirmed:        { label: 'Confirmed',      color: '#3B82F6', icon: 'check-circle-outline' },
  preparing:        { label: 'Preparing',      color: '#8B5CF6', icon: 'chef-hat' },
  packed:           { label: 'Packed',         color: '#06B6D4', icon: 'package-variant-closed' },
  awaiting_rider:   { label: 'Finding Rider',  color: '#F97316', icon: 'moped-outline' },
  rider_assigned:   { label: 'Rider Assigned', color: '#3B82F6', icon: 'account-check-outline' },
  picked_up:        { label: 'Picked Up',      color: '#06B6D4', icon: 'package-up' },
  in_transit:       { label: 'On the Way',     color: '#06B6D4', icon: 'moped' },
  near_delivery:    { label: 'Almost Here!',   color: '#10B981', icon: 'map-marker-radius' },
  delivered:        { label: 'Delivered',      color: '#22C55E', icon: 'party-popper' },
  completed:        { label: 'Completed',      color: '#22C55E', icon: 'check-decagram' },
  disputed:         { label: 'Disputed',       color: '#EF4444', icon: 'shield-alert-outline' },
  resolved:         { label: 'Resolved',       color: '#10B981', icon: 'shield-check-outline' },
  refunded:         { label: 'Refunded',       color: '#6366F1', icon: 'cash-refund' },
  failed_delivery:  { label: 'Delivery Failed',color: '#EF4444', icon: 'alert-circle-outline' },
  returned:         { label: 'Returned',       color: '#6B7280', icon: 'keyboard-return' },
  cancelled:        { label: 'Cancelled',      color: '#EF4444', icon: 'close-circle-outline' },
};

const OrderCard = memo(({ order, isFollowing, onFollow, onPress, colors }: { order: any; isFollowing: boolean; onFollow: (s: any) => void; onPress: () => void; colors: any }) => {
  const meta = STATUS_META[order.status] ?? { label: order.status, color: '#999', icon: 'package-variant' };
  const firstItem = order.items?.[0];
  const total = (order.total ?? 0) + (order.deliveryFee ?? 0);

  return (
    <TouchableOpacity
      style={[styles.orderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Image + info */}
      <View style={styles.cardTop}>
        {firstItem?.product?.images?.[0] || firstItem?.image ? (
          <Image
            source={{ uri: firstItem?.product?.images?.[0] ?? firstItem?.image }}
            style={styles.orderImg}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.orderImgPlaceholder, { backgroundColor: colors.background }]}> 
            <MaterialCommunityIcons name="package-variant-closed" size={24} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={[styles.orderId, { color: colors.textMuted }]}>
            #{(order._id ?? order.id ?? '').slice(-8).toUpperCase()}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.storeName, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
              {order.seller?.storeName ?? order.seller?.name ?? 'WimaKit Store'}
            </Text>
            <TouchableOpacity 
              onPress={() => onFollow(order.seller)}
              style={[styles.smallFollowBtn, { borderColor: colors.primary, backgroundColor: isFollowing ? 'transparent' : colors.primary }]}
            >
              <Text style={{ fontSize: 10, fontWeight: '800', color: isFollowing ? colors.primary : '#fff' }}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.itemsText, { color: colors.textSecondary }]} numberOfLines={1}>
            {order.items?.length ?? 1} item{(order.items?.length ?? 1) !== 1 ? 's' : ''} ·{' '}
            {firstItem?.name ?? firstItem?.product?.name ?? 'Product'}
          </Text>
          <Text style={[styles.total, { color: colors.primary }]}>{formatPrice(total)}</Text>
        </View>
      </View>

      {/* Complaint Indicator */}
      {order.complaint?.status !== 'none' && (
        <View style={[styles.complaintBadge, { backgroundColor: COMPLAINT_COLORS[order.complaint.status] || '#999' }]}>
          <Text style={styles.complaintText}>ISSUE: {(order.complaint?.status ?? 'PENDING').toUpperCase()}</Text>
        </View>
      )}

      {/* Status + date */}
      <View style={styles.cardBottom}>
        <View style={[styles.statusBadge, { backgroundColor: meta.color + '22', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
          <MaterialCommunityIcons name={meta.icon as any} size={13} color={meta.color} />
          <Text style={[styles.statusText, { color: meta.color }]}>
            {meta.label}
          </Text>
        </View>
        <Text style={[styles.dateText, { color: colors.textMuted }]}>
          {new Date(order.createdAt).toLocaleDateString('en-SL', {
            day: '2-digit', month: 'short', year: 'numeric',
          })}
        </Text>
      </View>

      {/* Active order progress bar — simplified 4-step buyer view that maps
          the real FSM statuses to meaningful milestones without exposing
          internal operational states. Previously used 'out_for_delivery',
          which doesn't exist in the schema, so the bar never rendered for
          any order that was actually in transit. */}
      {['confirmed','preparing','packed','awaiting_rider','rider_assigned','picked_up','in_transit','near_delivery'].includes(order.status) && (() => {
        const VISUAL_STEPS = [
          { key: 'confirmed',    label: 'Confirmed',   statuses: ['confirmed'] },
          { key: 'preparing',    label: 'Preparing',   statuses: ['preparing','packed'] },
          { key: 'in_transit',   label: 'On the Way',  statuses: ['awaiting_rider','rider_assigned','picked_up','in_transit','near_delivery'] },
          { key: 'delivered',    label: 'Delivered',   statuses: ['delivered','completed'] },
        ];
        const curStep = VISUAL_STEPS.findIndex(step => step.statuses.includes(order.status));
        return (
          <View style={[styles.progressWrap, { backgroundColor: colors.background }]}>
            {VISUAL_STEPS.map((step, i) => (
              <View key={step.key} style={styles.progressStep}>
                <View style={[styles.progressDot, { backgroundColor: i <= curStep ? meta.color : colors.border }]} />
                {i < VISUAL_STEPS.length - 1 && <View style={[styles.progressLine, { backgroundColor: i < curStep ? meta.color : colors.border }]} />}
              </View>
            ))}
            <Text style={[styles.progressLabel, { color: meta.color }]}>{meta.label}</Text>
          </View>
        );
      })()}
    </TouchableOpacity>
  );
});

export default function OrdersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const user = useAuthStore(s => s.user);
  const updateUser = useAuthStore(s => s.updateUser);
  const followMutation = useFollowProfile();
  const unfollowMutation = useUnfollowProfile();

  const tabs = useMemo(() => {
    if (user?.role === 'seller' || user?.role === 'admin') {
      return [...STATUS_TABS.slice(0, 1), { id: 'reported', label: '🚩 Issues' }, ...STATUS_TABS.slice(1)];
    }
    return STATUS_TABS;
  }, [user]);

  // Try API first, fallback to local store
  const { data, isLoading, refetch } = useMyOrders(activeTab ? { status: activeTab } : undefined);
  const localOrders = useOrdersStore((s) => s.orders);

  const orders = data?.orders ?? localOrders;

  const handleFollowToggle = useCallback(async (seller: any) => {
    if (!user) {
      router.push('/(auth)/login');
      return;
    }
    const sellerId = seller.id || seller._id;
    const isFollowing = user.following?.includes(sellerId);
    try {
      if (isFollowing) {
        await unfollowMutation.mutateAsync(sellerId);
        updateUser({ following: user.following?.filter(id => id !== sellerId) });
      } else {
        await followMutation.mutateAsync(sellerId);
        updateUser({ following: [...(user.following || []), sellerId] });
      }
    } catch (e) {}
  }, [user, router, followMutation, unfollowMutation, updateUser]);

  // Real-time socket listener
  useEffect(() => {
    const socket = io(process.env.EXPO_PUBLIC_API_URL!, { query: { userId: user?.id } });
    
    socket.on('order-status-updated', () => {
      refetch(); // Instant UI sync
    });
    
    return () => { socket.disconnect(); }; // Clean up socket on unmount
  }, [user]);

  const filtered = activeTab ? orders.filter((o: any) => o.status === activeTab) : orders;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => (
    <MotiView
      from={{ opacity: 0, translateY: 20 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 350, delay: index * 60 }}
    >
      <OrderCard 
        order={item} 
        colors={colors} 
        isFollowing={user?.following?.includes(item.seller?._id || item.seller?.id) ?? false}
        onFollow={handleFollowToggle}
        onPress={() => router.push(`/order/${item.customOrderId ?? item._id ?? item.id}` as any)} 
      />
    </MotiView>
  ), [colors, router]);

  const keyExtractor = useCallback((item: any) => item._id ?? item.id ?? Math.random().toString(), []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>My Orders</Text>
        <TouchableOpacity onPress={onRefresh} activeOpacity={0.7}>
          <MaterialCommunityIcons name="refresh" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Status tabs */}
      <View style={[styles.tabsWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <FlatList
          data={tabs}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingVertical: Spacing.sm }}
          keyExtractor={(item) => item.id ?? 'all'}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.tab,
                {
                  borderColor: activeTab === item.id ? colors.primary : colors.border,
                  backgroundColor: activeTab === item.id ? colors.primaryMuted : colors.background,
                },
              ]}
              onPress={() => setActiveTab(item.id)}
            >
              <Text style={[styles.tabText, { color: activeTab === item.id ? colors.primary : colors.textMuted }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Order count */}
      <View style={styles.countRow}>
        <Text style={[styles.countText, { color: colors.textMuted }]}>
          {filtered.length} order{filtered.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* List */}
      {isLoading ? (
        <FlatList
          data={[1, 2, 3, 4]}
          keyExtractor={(i) => String(i)}
          renderItem={() => <OrderCardSkeleton />}
          contentContainerStyle={{ padding: Spacing.lg }}
        />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="package-variant-closed" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No orders yet</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {activeTab ? `No ${activeTab} orders` : 'Start shopping to see your orders here'}
          </Text>
          {!activeTab && (
            <TouchableOpacity
              style={[styles.shopBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.replace('/(tabs)')}
            >
              <Text style={styles.shopBtnText}>Start Shopping →</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '900' },
  tabsWrap: { borderBottomWidth: 1 },
  tab: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5 },
  tabText: { fontSize: FontSize.sm, fontWeight: '700' },
  countRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  countText: { fontSize: FontSize.sm, fontWeight: '500' },

  orderCard: { borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.md, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  orderImg: { width: 80, height: 80, borderRadius: Radius.md },
  orderImgPlaceholder: { width: 80, height: 80, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, gap: 3 },
  orderId: { fontSize: FontSize.xs, fontWeight: '600' },
  storeName: { fontSize: FontSize.md, fontWeight: '800' },
  smallFollowBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1 },
  complaintBadge: { paddingHorizontal: Spacing.md, paddingVertical: 4, backgroundColor: '#EF4444' },
  complaintText: { color: '#fff', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  itemsText: { fontSize: FontSize.sm },
  total: { fontSize: FontSize.md, fontWeight: '900', marginTop: 2 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  dateText: { fontSize: FontSize.xs },

  progressWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: 0 },
  progressStep: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  progressDot: { width: 10, height: 10, borderRadius: 5 },
  progressLine: { flex: 1, height: 2 },
  progressLabel: { fontSize: FontSize.xs, fontWeight: '700', marginLeft: Spacing.sm },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '800' },
  emptySub: { fontSize: FontSize.md, textAlign: 'center' },
  shopBtn: { borderRadius: Radius.lg, paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.md, marginTop: Spacing.md },
  shopBtnText: { color: '#fff', fontWeight: '800', fontSize: FontSize.md },
});
