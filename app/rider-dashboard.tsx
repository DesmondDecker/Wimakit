import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, RefreshControl, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { useAuthStore, useOfflineStore } from '../store';
import {
  useRiderOrders, useAvailableDeliveries, useRiderEarnings,
  useAcceptDelivery, useUpdateOrderStatus, useWallet,
} from '../hooks/useApi';
import { deliveryApi } from '../utils/api';
import { formatPrice, formatDate, timeAgo } from '../constants/data';
import { useRiderLocationPing } from '../hooks/useRiderLocationPing';
import { usePushNotifications } from '../hooks/usePushNotifications';

const ORDER_STEPS: Record<string, { label: string; next: string; icon: string; color: string }> = {
  // Must mirror ORDER_TRANSITIONS in the backend's orderController.js exactly.
  // in_transit can only move to 'near_delivery' there, never straight to
  // 'delivered' — without this intermediate step, every order would get
  // permanently stuck at in_transit (the 'Mark delivered' button would 400
  // on every tap, since 'delivered' isn't a valid transition from in_transit).
  rider_assigned: { label: 'Go to pickup',      next: 'picked_up',     icon: 'bike',                     color: '#3B82F6' },
  picked_up:      { label: 'Confirm pickup',    next: 'in_transit',    icon: 'package-up',                color: '#8B5CF6' },
  in_transit:     { label: "I'm nearby",        next: 'near_delivery', icon: 'map-marker-distance',       color: '#F59E0B' },
  near_delivery:  { label: 'Mark delivered',    next: 'delivered',     icon: 'map-marker-check-outline',  color: '#10B981' },
};

function StatChip({ icon, value, label, color, colors }: any) {
  return (
    <View style={[chip.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[chip.icon, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons name={icon} size={16} color={color} />
      </View>
      <Text style={[chip.val, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[chip.lbl, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}
const chip = StyleSheet.create({
  wrap: { flex: 1, borderRadius: Radius.md, borderWidth: 1, padding: 10, alignItems: 'center', gap: 4 },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  val:  { fontSize: 15, fontWeight: '800' },
  lbl:  { fontSize: 9, fontWeight: '600', textAlign: 'center' },
});

function ActiveOrderCard({ order, onNext, colors }: any) {
  const step = ORDER_STEPS[order.status];
  const buyer = order.buyer;
  const addr  = order.deliveryAddress ?? 'Delivery address not set';
  const itemCount = order.items?.length ?? 0;
  return (
    <View style={[aoc.card, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.md]}>
      <LinearGradient colors={['#0F6E56', '#1D9E75']} style={aoc.header}>
        <MaterialCommunityIcons name="package-variant" size={20} color="white" />
        <Text style={aoc.headerText}>Active Delivery</Text>
        <View style={aoc.badge}><Text style={aoc.badgeText}>{order.status?.replace(/_/g,' ')}</Text></View>
      </LinearGradient>
      <View style={{ padding: Spacing.md }}>
        <View style={aoc.row}>
          <MaterialCommunityIcons name="account-circle-outline" size={16} color={colors.textMuted} />
          <Text style={[aoc.label, { color: colors.textPrimary }]}>{buyer?.name ?? 'Customer'}</Text>
          {buyer?.phone && (
            <TouchableOpacity style={[aoc.callBtn, { backgroundColor: '#0F6E5618' }]}>
              <MaterialCommunityIcons name="phone" size={14} color="#0F6E56" />
            </TouchableOpacity>
          )}
        </View>
        <View style={aoc.row}>
          <MaterialCommunityIcons name="map-marker-outline" size={16} color={colors.textMuted} />
          <Text style={[aoc.addr, { color: colors.textSecondary }]} numberOfLines={2}>{addr}</Text>
        </View>
        <View style={aoc.row}>
          <MaterialCommunityIcons name="package-variant-closed" size={16} color={colors.textMuted} />
          <Text style={[aoc.label, { color: colors.textMuted }]}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
          <Text style={[aoc.earn, { color: '#0F6E56' }]}>+{formatPrice(order.deliveryFee ?? 0)}</Text>
        </View>
        {step && (
          <TouchableOpacity
            style={[aoc.nextBtn, { backgroundColor: step.color }]}
            onPress={() => onNext(order._id, step.next)}
          >
            <MaterialCommunityIcons name={step.icon as any} size={16} color="white" />
            <Text style={aoc.nextText}>{step.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
const aoc = StyleSheet.create({
  card:     { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.md },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.md },
  headerText: { color: 'white', fontWeight: '700', fontSize: FontSize.md, flex: 1 },
  badge:    { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText:{ color: 'white', fontSize: 10, fontWeight: '600' },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  label:    { fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  addr:     { fontSize: FontSize.sm, flex: 1, lineHeight: 18 },
  callBtn:  { padding: 6, borderRadius: 8 },
  earn:     { fontSize: FontSize.sm, fontWeight: '800' },
  nextBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.md, borderRadius: Radius.lg, marginTop: 4 },
  nextText: { color: 'white', fontWeight: '700', fontSize: FontSize.md },
});

function AvailableCard({ order, onAccept, onReject, loading, colors }: any) {
  const km = order.distanceKm ?? '?';
  const earn = order.deliveryFee ?? 0;
  return (
    <View style={[av.card, { backgroundColor: colors.surface, borderColor: '#0F6E5640' }, Shadow.sm]}>
      <View style={av.top}>
        <View style={[av.iconWrap, { backgroundColor: '#0F6E5618' }]}>
          <MaterialCommunityIcons name="package-variant-closed" size={22} color="#0F6E56" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[av.seller, { color: colors.textPrimary }]} numberOfLines={1}>
            {order.seller?.storeName ?? 'WimaKit Seller'}
          </Text>
          <Text style={[av.dist, { color: colors.textMuted }]}>
            {km} km · {order.items?.length ?? 1} item{(order.items?.length ?? 1) !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={av.earnBox}>
          <Text style={av.earnAmt}>{formatPrice(earn)}</Text>
          <Text style={[av.earnLabel, { color: colors.textMuted }]}>earn</Text>
        </View>
      </View>
      <View style={av.addrRow}>
        <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.textMuted} />
        <Text style={[av.addr, { color: colors.textMuted }]} numberOfLines={1}>
          {order.deliveryAddress ?? 'Delivery address'}
        </Text>
      </View>
      <View style={av.actions}>
        <TouchableOpacity
          style={[av.rejectBtn, { borderColor: colors.border }]}
          onPress={() => onReject(order._id)}
          disabled={loading}
        >
          <MaterialCommunityIcons name="close" size={16} color={colors.textMuted} />
          <Text style={[av.rejectText, { color: colors.textMuted }]}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[av.acceptBtn, { backgroundColor: '#0F6E56' }]}
          onPress={() => onAccept(order._id)}
          disabled={loading}
        >
          {loading ? <ActivityIndicator size="small" color="white" /> : (
            <>
              <MaterialCommunityIcons name="check" size={16} color="white" />
              <Text style={av.acceptText}>Accept</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
const av = StyleSheet.create({
  card:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  top:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  iconWrap:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  seller:    { fontSize: FontSize.sm, fontWeight: '700' },
  dist:      { fontSize: FontSize.xs, marginTop: 2 },
  earnBox:   { alignItems: 'flex-end' },
  earnAmt:   { fontSize: FontSize.md, fontWeight: '800', color: '#0F6E56' },
  earnLabel: { fontSize: FontSize.xs },
  addrRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  addr:      { fontSize: FontSize.xs, flex: 1 },
  actions:   { flexDirection: 'row', gap: 8 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: Radius.lg, borderWidth: 1 },
  rejectText:{ fontWeight: '700', fontSize: FontSize.sm },
  acceptBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: Radius.lg },
  acceptText:{ color: 'white', fontWeight: '700', fontSize: FontSize.sm },
});

export default function RiderDashboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const [isOnline, setIsOnline] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'wallet' | 'profile'>('home');
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const { data: availableData, refetch: refetchAvailable, isLoading: loadingAvailable } = useAvailableDeliveries();
  const { data: ordersData, refetch: refetchOrders, isLoading: loadingOrders } = useRiderOrders();
  const { data: earningsData, refetch: refetchEarnings } = useRiderEarnings();
  const { data: walletData } = useWallet();
  const acceptMut = useAcceptDelivery();
  const updateStatusMut = useUpdateOrderStatus();

  const available = availableData?.orders ?? availableData?.deliveries ?? [];
  const riderOrders = ordersData?.orders ?? [];
  const activeOrders = riderOrders.filter((o: any) =>
    ['rider_assigned','picked_up','in_transit','near_delivery'].includes(o.status)
  );
  const history = riderOrders.filter((o: any) =>
    ['delivered','completed','cancelled'].includes(o.status)
  );

  // GPS ping loop: sends rider coordinates to the backend every 10s while there's
  // an active delivery, so the buyer's live-tracking map has real data to display.
  const activeOrderId = activeOrders[0]?._id ?? null;
  useRiderLocationPing(activeOrderId);

  // Register Expo push token so the rider gets background notifications (new
  // delivery available, payout processed, etc.) even when the app is closed.
  usePushNotifications();

  const earnings = earningsData?.earnings ?? {};
  const todayEarnings = earnings.today ?? 0;
  const todayDeliveries = earnings.todayCount ?? 0;
  const totalEarnings = earnings.total ?? 0;
  const totalDeliveries = earnings.totalCount ?? 0;
  const rating = user?.rating ?? 4.8;
  const walletBalance = walletData?.wallet?.available ?? walletData?.available ?? 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAvailable(), refetchOrders(), refetchEarnings()]);
    setRefreshing(false);
  }, [refetchAvailable, refetchOrders, refetchEarnings]);

  const handleToggleOnline = useCallback(async (val: boolean) => {
    setIsOnline(val);
    try {
      await deliveryApi.availability(val ? 'online' : 'offline');
      Toast.show({ type: 'success', text1: val ? 'You are now online' : 'You are now offline', text2: val ? 'You can now accept deliveries' : 'You won\'t receive new requests' });
    } catch {
      setIsOnline(!val);
    }
  }, []);

  const handleAccept = useCallback((orderId: string) => {
    setAcceptingId(orderId);
    acceptMut.mutate(orderId, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: 'Delivery accepted!', text2: 'Head to the seller to pick up the order.' });
        refetchOrders(); refetchAvailable();
      },
      onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Failed to accept' }),
      onSettled: () => setAcceptingId(null),
    });
  }, [acceptMut, refetchOrders, refetchAvailable]);

  const handleReject = useCallback((orderId: string) => {
    Alert.alert('Decline delivery', 'Decline this delivery request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await deliveryApi.reject(orderId, 'Rider declined');
            Toast.show({ type: 'info', text1: 'Delivery declined' });
            refetchAvailable();
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Failed to decline' });
          }
        },
      },
    ]);
  }, [refetchAvailable]);

  const handleNextStep = useCallback((orderId: string, nextStatus: string) => {
    Alert.alert('Update Status', `Mark this order as ${nextStatus.replace(/_/g,' ')}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => {
          const { isOnline, enqueue } = useOfflineStore.getState();
          if (!isOnline) {
            // Enqueue for replay when connectivity is restored — critical for
            // riders in areas with poor coverage (tunnels, market interiors).
            enqueue({
              type: 'ORDER_STATUS_UPDATE',
              request: { method: 'patch', url: `/orders/${orderId}/status`, data: { status: nextStatus } },
              maxRetries: 5,
            });
            Toast.show({ type: 'info', text1: 'Saved offline', text2: 'Status update will sync when you reconnect.' });
            return;
          }
          updateStatusMut.mutate({ id: orderId, status: nextStatus }, {
            onSuccess: () => { Toast.show({ type: 'success', text1: 'Status updated!' }); refetchOrders(); },
            onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Update failed' }),
          });
        },
      },
    ]);
  }, [updateStatusMut, refetchOrders]);

  if (user?.role !== 'rider') {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <MaterialCommunityIcons name="bike" size={64} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Rider portal</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>This section is for WimaKit delivery riders.</Text>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={{ color: 'white', fontWeight: '700' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderHome = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
    >
      {/* Header card */}
      <LinearGradient colors={['#085041', '#0F6E56']} style={s.heroCard}>
        <View style={s.heroTop}>
          <View>
            <Text style={s.heroGreet}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</Text>
            <Text style={s.heroName}>{user?.name?.split(' ')[0] ?? 'Rider'}</Text>
          </View>
          <View style={[s.onlineToggle, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <View style={[s.onlineDot, { backgroundColor: isOnline ? '#4ADE80' : '#9CA3AF' }]} />
            <Text style={s.onlineLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
            <Switch
              value={isOnline}
              onValueChange={handleToggleOnline}
              trackColor={{ false: '#374151', true: 'rgba(255,255,255,0.3)' }}
              thumbColor={isOnline ? '#4ADE80' : '#9CA3AF'}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
        </View>
        <View style={s.heroStats}>
          <View style={s.heroStat}>
            <Text style={s.heroStatVal}>{todayDeliveries}</Text>
            <Text style={s.heroStatLabel}>Today's trips</Text>
          </View>
          <View style={[s.heroStatDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
          <View style={s.heroStat}>
            <Text style={s.heroStatVal}>{formatPrice(todayEarnings)}</Text>
            <Text style={s.heroStatLabel}>Today earned</Text>
          </View>
          <View style={[s.heroStatDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
          <View style={s.heroStat}>
            <Text style={s.heroStatVal}>{rating.toFixed(1)}★</Text>
            <Text style={s.heroStatLabel}>Rating</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Active orders */}
      {activeOrders.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Active delivery</Text>
          {activeOrders.map((o: any) => (
            <ActiveOrderCard key={o._id} order={o} onNext={handleNextStep} colors={colors} />
          ))}
        </>
      )}

      {/* Available deliveries */}
      {isOnline && (
        <>
          <View style={s.sectionRow}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              Available ({available.length})
            </Text>
            {loadingAvailable && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          {available.length === 0 && !loadingAvailable ? (
            <View style={[s.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="timer-sand" size={32} color={colors.textMuted} />
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No deliveries yet</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>New requests will appear here. Stay nearby busy areas.</Text>
            </View>
          ) : (
            available.map((o: any) => (
              <AvailableCard
                key={o._id}
                order={o}
                onAccept={handleAccept}
                onReject={handleReject}
                loading={acceptingId === o._id}
                colors={colors}
              />
            ))
          )}
        </>
      )}

      {!isOnline && (
        <View style={[s.offlineBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="power-sleep" size={32} color={colors.textMuted} />
          <Text style={[s.offlineText, { color: colors.textPrimary }]}>You're offline</Text>
          <Text style={[s.offlineSub, { color: colors.textMuted }]}>Toggle online above to start receiving delivery requests.</Text>
        </View>
      )}
    </ScrollView>
  );

  const renderHistory = () => (
    <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}>
      <View style={s.statRow}>
        <StatChip icon="truck-delivery-outline" value={totalDeliveries} label="Total deliveries" color="#0F6E56" colors={colors} />
        <StatChip icon="currency-usd" value={formatPrice(totalEarnings, true)} label="All-time earned" color="#4F46E5" colors={colors} />
      </View>
      <View style={s.statRow}>
        <StatChip icon="star-outline" value={`${rating.toFixed(1)}/5`} label="Average rating" color="#F59E0B" colors={colors} />
        <StatChip icon="percent" value="98%" label="Completion rate" color="#10B981" colors={colors} />
      </View>
      <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Delivery history</Text>
      {loadingOrders ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> :
        history.length === 0 ? (
          <View style={[s.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="history" size={32} color={colors.textMuted} />
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No deliveries yet</Text>
            <Text style={[s.emptySub, { color: colors.textMuted }]}>Completed deliveries will appear here.</Text>
          </View>
        ) : history.map((o: any) => (
          <TouchableOpacity
            key={o._id}
            style={[s.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(`/order/${o._id}` as any)}
          >
            <View style={[s.historyIcon, { backgroundColor: o.status === 'delivered' ? '#0F6E5618' : '#EF444418' }]}>
              <MaterialCommunityIcons
                name={o.status === 'delivered' ? 'check-circle-outline' : 'close-circle-outline'}
                size={20}
                color={o.status === 'delivered' ? '#0F6E56' : '#EF4444'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.historyId, { color: colors.textPrimary }]}>
                {o.seller?.storeName ?? 'Order'} → {o.buyer?.name ?? 'Customer'}
              </Text>
              <Text style={[s.historyMeta, { color: colors.textMuted }]}>{timeAgo(o.updatedAt)}</Text>
            </View>
            <Text style={[s.historyEarn, { color: '#0F6E56' }]}>+{formatPrice(o.deliveryFee ?? 0)}</Text>
          </TouchableOpacity>
        ))
      }
    </ScrollView>
  );

  const renderWallet = () => (
    <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}>
      <LinearGradient colors={['#085041', '#0F6E56']} style={s.walletCard}>
        <Text style={s.walletLabel}>Wallet balance</Text>
        <Text style={s.walletBalance}>{formatPrice(walletBalance)}</Text>
        <Text style={s.walletSub}>Available to withdraw</Text>
        <View style={s.walletActions}>
          <TouchableOpacity style={[s.walletBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <MaterialCommunityIcons name="bank-transfer-out" size={18} color="white" />
            <Text style={s.walletBtnText}>Withdraw</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.walletBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <MaterialCommunityIcons name="receipt" size={18} color="white" />
            <Text style={s.walletBtnText}>Statement</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
      <View style={s.statRow}>
        <StatChip icon="cash-multiple" value={formatPrice(totalEarnings, true)} label="All-time earned" color="#0F6E56" colors={colors} />
        <StatChip icon="truck-check-outline" value={totalDeliveries} label="Total deliveries" color="#4F46E5" colors={colors} />
      </View>
      <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Weekly performance</Text>
      <View style={[s.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.chartBars}>
          {(earnings.weekly ?? [60,80,50,90,70,85,todayEarnings > 0 ? 100 : 65]).map((pct: number, i: number) => (
            <View key={i} style={s.barWrap}>
              <View style={[s.bar, { height: `${pct}%`, backgroundColor: i === 6 ? '#0F6E56' : '#0F6E5630' }]} />
              <Text style={[s.barLabel, { color: colors.textMuted }]}>
                {['M','T','W','T','F','S','S'][i]}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Recent payouts</Text>
      {(earnings.recentPayouts ?? []).map((p: any, i: number) => (
        <View key={i} style={[s.payoutRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="check-circle-outline" size={18} color="#0F6E56" />
          <View style={{ flex: 1 }}>
            <Text style={[s.payoutDate, { color: colors.textPrimary }]}>{formatDate(p.date ?? new Date().toISOString())}</Text>
            <Text style={[s.payoutMeta, { color: colors.textMuted }]}>{p.method ?? 'Orange Money'}</Text>
          </View>
          <Text style={[s.payoutAmt, { color: '#0F6E56' }]}>+{formatPrice(p.amount ?? 0)}</Text>
        </View>
      ))}
      {(earnings.recentPayouts ?? []).length === 0 && (
        <View style={[s.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>No payouts yet. Complete deliveries to earn!</Text>
        </View>
      )}
    </ScrollView>
  );

  const renderProfile = () => (
    <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}>
      <View style={[s.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[s.avatarCircle, { backgroundColor: '#085041' }]}>
          <Text style={s.avatarText}>{user?.name?.charAt(0) ?? 'R'}</Text>
        </View>
        <Text style={[s.profileName, { color: colors.textPrimary }]}>{user?.name}</Text>
        <Text style={[s.profilePhone, { color: colors.textMuted }]}>{user?.phone}</Text>
        <View style={s.ratingRow}>
          <MaterialCommunityIcons name="star" size={16} color="#F59E0B" />
          <Text style={[s.ratingVal, { color: colors.textPrimary }]}>{rating.toFixed(1)}</Text>
          <Text style={[s.ratingMeta, { color: colors.textMuted }]}>· {totalDeliveries} deliveries</Text>
        </View>
      </View>
      <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Badges</Text>
      <View style={s.badgeRow}>
        {totalDeliveries >= 50 && (
          <View style={[s.badgeChip, { backgroundColor: '#085041' }]}>
            <MaterialCommunityIcons name="trophy" size={14} color="#4ADE80" />
            <Text style={[s.badgeChipText, { color: '#9FE1CB' }]}>Top rider</Text>
          </View>
        )}
        {rating >= 4.8 && (
          <View style={[s.badgeChip, { backgroundColor: '#1C1045' }]}>
            <MaterialCommunityIcons name="star" size={14} color="#AFA9EC" />
            <Text style={[s.badgeChipText, { color: '#CECBF6' }]}>Speed star</Text>
          </View>
        )}
        {totalDeliveries >= 100 && (
          <View style={[s.badgeChip, { backgroundColor: '#2C1205' }]}>
            <MaterialCommunityIcons name="fire" size={14} color="#F0997B" />
            <Text style={[s.badgeChipText, { color: '#F5C4B3' }]}>100 streak</Text>
          </View>
        )}
        {totalDeliveries === 0 && (
          <Text style={[s.emptySub, { color: colors.textMuted }]}>Complete deliveries to earn badges!</Text>
        )}
      </View>
      <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Account</Text>
      {[
        { icon: 'account-edit-outline', label: 'Edit profile',         onPress: () => router.push('/edit-profile' as any) },
        { icon: 'bike',                 label: 'Vehicle info',          onPress: () => {} },
        { icon: 'bank-transfer-out',    label: 'Payout settings',       onPress: () => {} },
        { icon: 'help-circle-outline',  label: 'Support',               onPress: () => {} },
        { icon: 'power',                label: 'Log out',               onPress: () => useAuthStore.getState().logout(), danger: true },
      ].map((item) => (
        <TouchableOpacity
          key={item.label}
          style={[s.settingRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={item.onPress}
        >
          <MaterialCommunityIcons name={item.icon as any} size={20} color={item.danger ? colors.error : colors.textMuted} />
          <Text style={[s.settingLabel, { color: item.danger ? colors.error : colors.textPrimary }]}>{item.label}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const TABS = [
    { id: 'home',    icon: 'home-outline',         label: 'Home' },
    { id: 'history', icon: 'history',               label: 'History' },
    { id: 'wallet',  icon: 'wallet-outline',        label: 'Wallet' },
    { id: 'profile', icon: 'account-circle-outline',label: 'Profile' },
  ] as const;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'home'    && renderHome()}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'wallet'  && renderWallet()}
        {activeTab === 'profile' && renderProfile()}
      </View>

      {/* Bottom tab bar */}
      <View style={[s.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {TABS.map(tab => {
          const focused = activeTab === tab.id;
          return (
            <TouchableOpacity key={tab.id} style={s.tabItem} onPress={() => setActiveTab(tab.id)}>
              <View style={[s.tabIconWrap, focused && { backgroundColor: '#0F6E5618' }]}>
                <MaterialCommunityIcons name={tab.icon as any} size={22} color={focused ? '#0F6E56' : colors.textMuted} />
              </View>
              <Text style={[s.tabLabel, { color: focused ? '#0F6E56' : colors.textMuted }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  heroCard: { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: Spacing.md },
  heroGreet: { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.xs },
  heroName: { color: 'white', fontSize: FontSize.xl, fontWeight: '800' },
  onlineToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineLabel: { color: 'white', fontSize: FontSize.xs, fontWeight: '600' },
  heroStats: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatVal: { color: 'white', fontSize: FontSize.md, fontWeight: '800' },
  heroStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 9, marginTop: 2 },
  heroStatDivider: { width: 1, height: 30 },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', marginBottom: Spacing.sm, marginTop: Spacing.md },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm, marginTop: Spacing.md },
  statRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  emptyBox: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.xl, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: FontSize.md, fontWeight: '700' },
  emptySub: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  offlineBox: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.xl, alignItems: 'center', gap: 8, marginTop: Spacing.lg },
  offlineText: { fontSize: FontSize.lg, fontWeight: '800' },
  offlineSub: { fontSize: FontSize.sm, textAlign: 'center' },
  backBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: Radius.lg },
  historyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 8 },
  historyIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  historyId: { fontSize: FontSize.sm, fontWeight: '600' },
  historyMeta: { fontSize: FontSize.xs, marginTop: 2 },
  historyEarn: { fontSize: FontSize.md, fontWeight: '800' },
  walletCard: { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md },
  walletLabel: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm },
  walletBalance: { color: 'white', fontSize: 28, fontWeight: '800', marginVertical: 4 },
  walletSub: { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs },
  walletActions: { flexDirection: 'row', gap: 10, marginTop: Spacing.md },
  walletBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderRadius: Radius.lg },
  walletBtnText: { color: 'white', fontWeight: '700', fontSize: FontSize.sm },
  chartCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md, height: 120 },
  chartBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingBottom: 20 },
  barWrap: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 8, marginTop: 4, fontWeight: '600' },
  payoutRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 8 },
  payoutDate: { fontSize: FontSize.sm, fontWeight: '600' },
  payoutMeta: { fontSize: FontSize.xs, marginTop: 2 },
  payoutAmt: { fontSize: FontSize.md, fontWeight: '800' },
  profileCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.lg, gap: 6 },
  avatarCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#9FE1CB', fontSize: 26, fontWeight: '800' },
  profileName: { fontSize: FontSize.lg, fontWeight: '800' },
  profilePhone: { fontSize: FontSize.sm },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingVal: { fontSize: FontSize.md, fontWeight: '700' },
  ratingMeta: { fontSize: FontSize.sm },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.lg },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  badgeChipText: { fontSize: FontSize.xs, fontWeight: '700' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 8 },
  settingLabel: { flex: 1, fontSize: FontSize.sm, fontWeight: '600' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, paddingBottom: 8, paddingTop: 8 },
  tabItem: { flex: 1, alignItems: 'center', gap: 2 },
  tabIconWrap: { width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 9, fontWeight: '600' },
});
