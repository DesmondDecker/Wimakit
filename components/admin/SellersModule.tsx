/**
 * WimaKit — Admin Sellers Module
 *
 * Store approval queue: approve/reject/suspend seller stores and mark them
 * as trending. Wired into app/admin/index.tsx as the 'sellers' module.
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { adminApi } from '../../utils/api';
import { formatPrice, timeAgo } from '../../constants/data';

// ─── Status config ─────────────────────────────────────────────────────────
const STORE_STATUS: Record<string, { label:string; color:string; bg:string; icon:string }> = {
  approved:  { label:'Approved',  color:'#10B981', bg:'#ECFDF5', icon:'check-circle-outline' },
  pending_review: { label:'Pending', color:'#F59E0B', bg:'#FFFBEB', icon:'clock-outline'     },
  rejected:  { label:'Rejected',  color:'#EF4444', bg:'#FEF2F2', icon:'close-circle-outline' },
  suspended: { label:'Suspended', color:'#6B7280', bg:'#F3F4F6', icon:'pause-circle-outline' },
};

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all';

// ─── Hooks ─────────────────────────────────────────────────────────────────
function usePendingSellers(params?: any) {
  return useQuery({
    queryKey: ['admin', 'sellers', params],
    queryFn:  () => adminApi.sellers(params).then(r => r.data),
    staleTime: 30_000,
  });
}

function useApproveSeller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.approveSeller(id).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin', 'sellers'] }),
  });
}

function useSuspendSeller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.suspendSeller(id).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin', 'sellers'] }),
  });
}

function useTrendStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.trendStore(id).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin', 'sellers'] }),
  });
}

// ─── Store card ────────────────────────────────────────────────────────────
function SellerCard({
  seller, onApprove, onSuspend, onTrend, onViewDetails, colors,
}: {
  seller: any;
  onApprove: () => void;
  onSuspend: () => void;
  onTrend:   () => void;
  onViewDetails: () => void;
  colors: any;
}) {
  const storeStatus = seller.storeStatus ?? 'pending_review';
  const stat = STORE_STATUS[storeStatus] ?? STORE_STATUS.pending_review;
  const isPending   = storeStatus === 'pending_review';
  const isApproved  = storeStatus === 'approved';
  const isRejected  = storeStatus === 'rejected' || storeStatus === 'suspended';

  return (
    <View style={[card.wrap, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}>
      {/* Store banner strip */}
      <View style={card.bannerStrip}>
        {seller.storeBanner
          ? <Image source={{ uri: seller.storeBanner }} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <LinearGradient colors={['#4F46E5','#7C3AED']} style={StyleSheet.absoluteFill} start={{x:0,y:0}} end={{x:1,y:1}} />
        }
        <LinearGradient colors={['transparent','rgba(0,0,0,0.55)']} style={StyleSheet.absoluteFill} />

        {/* Status badge */}
        <View style={[card.statusBadge, { backgroundColor: stat.bg + 'EE' }]}>
          <MaterialCommunityIcons name={stat.icon as any} size={11} color={stat.color} />
          <Text style={[card.statusText, { color: stat.color }]}>{stat.label}</Text>
        </View>

        {/* Trending badge */}
        {seller.isTrending && (
          <View style={[card.trendBadge]}>
            <Text style={card.trendText}>🔥 Trending</Text>
          </View>
        )}
      </View>

      {/* Store identity */}
      <View style={card.body}>
        <View style={[card.logoWrap, { borderColor: colors.surface }]}>
          {seller.avatar
            ? <Image source={{ uri: seller.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
            : <LinearGradient colors={['#4F46E5','#EC4899']} style={StyleSheet.absoluteFill}>
                <Text style={card.logoInitial}>{(seller.storeName || seller.name || 'S')[0]?.toUpperCase()}</Text>
              </LinearGradient>
          }
        </View>

        <View style={{ flex:1 }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:5 }}>
            <Text style={[card.storeName, { color: colors.textPrimary }]} numberOfLines={1}>
              {seller.storeName ?? seller.name}
            </Text>
            {seller.isVerified && (
              <MaterialCommunityIcons name="check-decagram" size={14} color="#60A5FA" />
            )}
          </View>
          <Text style={[card.sellerName, { color: colors.textMuted }]} numberOfLines={1}>{seller.name}</Text>
          <Text style={[card.sellerEmail, { color: colors.textMuted }]} numberOfLines={1}>{seller.email}</Text>
        </View>
      </View>

      {/* Store description */}
      {seller.storeDescription ? (
        <View style={[card.descBox, { backgroundColor: colors.background }]}>
          <Text style={[card.desc, { color: colors.textSecondary }]} numberOfLines={2}>{seller.storeDescription}</Text>
        </View>
      ) : (
        <View style={[card.descBox, { backgroundColor: colors.background }]}>
          <Text style={[card.desc, { color: colors.textMuted, fontStyle:'italic' }]}>No store description provided</Text>
        </View>
      )}

      {/* Meta row */}
      <View style={[card.metaRow, { borderTopColor: colors.border }]}>
        <View style={card.metaItem}>
          <MaterialCommunityIcons name="map-marker-outline" size={12} color={colors.textMuted} />
          <Text style={[card.metaText, { color: colors.textMuted }]}>{seller.location ?? 'No location'}</Text>
        </View>
        <View style={card.metaItem}>
          <MaterialCommunityIcons name="package-variant-closed" size={12} color={colors.textMuted} />
          <Text style={[card.metaText, { color: colors.textMuted }]}>{seller.totalProducts ?? 0} products</Text>
        </View>
        <View style={card.metaItem}>
          <MaterialCommunityIcons name="clock-outline" size={12} color={colors.textMuted} />
          <Text style={[card.metaText, { color: colors.textMuted }]}>{timeAgo(seller.createdAt)}</Text>
        </View>
        {seller.totalSales > 0 && (
          <View style={card.metaItem}>
            <MaterialCommunityIcons name="cash-multiple" size={12} color="#10B981" />
            <Text style={[card.metaText, { color:'#10B981' }]}>{formatPrice(seller.totalSales, true)}</Text>
          </View>
        )}
      </View>

      {/* Payout info if available */}
      {seller.payoutMethod && (
        <View style={[card.payoutRow, { backgroundColor: colors.primaryMuted ?? '#EEF2FF', borderTopColor: colors.border }]}>
          <MaterialCommunityIcons name="bank-outline" size={13} color="#4F46E5" />
          <Text style={[card.payoutText, { color:'#4F46E5' }]}>
            Payout: {seller.payoutMethod?.replace('_',' ')} · {seller.payoutNumber ?? '—'}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={[card.actions, { borderTopColor: colors.border }]}>
        {isPending && (
          <>
            <TouchableOpacity
              style={[card.actionBtn, { backgroundColor:'#10B981' }]}
              onPress={onApprove}
            >
              <MaterialCommunityIcons name="check-circle-outline" size={14} color="#fff" />
              <Text style={card.actionBtnText}>Approve Store</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[card.actionBtnOutline, { borderColor:'#EF4444' }]}
              onPress={onSuspend}
            >
              <MaterialCommunityIcons name="close-circle-outline" size={14} color="#EF4444" />
              <Text style={[card.actionBtnOutlineText, { color:'#EF4444' }]}>Reject</Text>
            </TouchableOpacity>
          </>
        )}

        {isApproved && (
          <>
            <TouchableOpacity
              style={[card.actionBtn, seller.isTrending ? { backgroundColor:'#6B7280' } : { backgroundColor:'#F59E0B' }]}
              onPress={onTrend}
            >
              <Text style={card.actionBtnText}>{seller.isTrending ? '🔥 Remove Trend' : '🔥 Mark Trending'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[card.actionBtnOutline, { borderColor:'#EF4444' }]}
              onPress={onSuspend}
            >
              <MaterialCommunityIcons name="pause-circle-outline" size={14} color="#EF4444" />
              <Text style={[card.actionBtnOutlineText, { color:'#EF4444' }]}>Suspend</Text>
            </TouchableOpacity>
          </>
        )}

        {isRejected && (
          <TouchableOpacity
            style={[card.actionBtn, { backgroundColor:'#10B981' }]}
            onPress={onApprove}
          >
            <MaterialCommunityIcons name="restore" size={14} color="#fff" />
            <Text style={card.actionBtnText}>Re-approve</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
const card = StyleSheet.create({
  wrap:        { borderRadius: Radius.xl, borderWidth:1, overflow:'hidden', marginBottom:14 },
  bannerStrip: { height:80, position:'relative' },
  statusBadge: { position:'absolute', top:8, left:10, flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:4, borderRadius: Radius.full },
  statusText:  { fontSize:10, fontWeight:'800' },
  trendBadge:  { position:'absolute', top:8, right:10, backgroundColor:'rgba(239,68,68,0.85)', paddingHorizontal:8, paddingVertical:4, borderRadius: Radius.full },
  trendText:   { color:'#fff', fontSize:10, fontWeight:'800' },

  body:        { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
  logoWrap:    { width:48, height:48, borderRadius:24, borderWidth:2.5, overflow:'hidden', alignItems:'center', justifyContent:'center', marginTop:-24 },
  logoInitial: { color:'#fff', fontSize:18, fontWeight:'900' },
  storeName:   { fontSize: FontSize.md, fontWeight:'900' },
  sellerName:  { fontSize:12, fontWeight:'600', marginTop:1 },
  sellerEmail: { fontSize:11, marginTop:1 },

  descBox:     { marginHorizontal: Spacing.md, marginBottom: Spacing.sm, padding:10, borderRadius: Radius.lg },
  desc:        { fontSize:12, lineHeight:17 },

  metaRow:    { flexDirection:'row', flexWrap:'wrap', gap:12, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth:1 },
  metaItem:   { flexDirection:'row', alignItems:'center', gap:4 },
  metaText:   { fontSize:11, fontWeight:'600' },

  payoutRow:  { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal: Spacing.md, paddingVertical:8, borderTopWidth:1 },
  payoutText: { fontSize:11, fontWeight:'700', flex:1 },

  actions:          { flexDirection:'row', gap: Spacing.sm, padding: Spacing.md, borderTopWidth:1 },
  actionBtn:        { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:10, borderRadius: Radius.lg },
  actionBtnText:    { color:'#fff', fontSize:12, fontWeight:'800' },
  actionBtnOutline: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:10, borderRadius: Radius.lg, borderWidth:2 },
  actionBtnOutlineText: { fontSize:12, fontWeight:'800' },
});

// ─── Summary stats ─────────────────────────────────────────────────────────
function SummaryStats({ sellers, colors }: { sellers: any[]; colors: any }) {
  const pending  = sellers.filter(s => (s.storeStatus ?? 'pending_review') === 'pending_review').length;
  const approved = sellers.filter(s => s.storeStatus === 'approved').length;
  const rejected = sellers.filter(s => s.storeStatus === 'rejected' || s.storeStatus === 'suspended').length;
  const trending = sellers.filter(s => s.isTrending).length;

  return (
    <View style={stats.row}>
      {[
        { label:'Total',    value: sellers.length, color:'#4F46E5', icon:'store-outline' },
        { label:'Pending',  value: pending,         color:'#F59E0B', icon:'clock-outline' },
        { label:'Approved', value: approved,        color:'#10B981', icon:'check-circle-outline' },
        { label:'Trending', value: trending,        color:'#EC4899', icon:'fire' },
      ].map(item => (
        <View key={item.label} style={[stats.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[stats.iconWrap, { backgroundColor: item.color + '18' }]}>
            <MaterialCommunityIcons name={item.icon as any} size={16} color={item.color} />
          </View>
          <Text style={[stats.value, { color: colors.textPrimary }]}>{item.value}</Text>
          <Text style={[stats.label, { color: colors.textMuted }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
const stats = StyleSheet.create({
  row:     { flexDirection:'row', gap:8, marginBottom: Spacing.md },
  card:    { flex:1, borderRadius: Radius.lg, borderWidth:1, padding:10, alignItems:'center', gap:4 },
  iconWrap:{ width:30, height:30, borderRadius:10, alignItems:'center', justifyContent:'center' },
  value:   { fontSize:17, fontWeight:'900' },
  label:   { fontSize:9, fontWeight:'700', textAlign:'center' },
});

// ─── Main module export ────────────────────────────────────────────────────
export function SellersModule({ colors }: { colors: any }) {
  const [search,    setSearch]    = useState('');
  const [tabFilter, setTabFilter] = useState<FilterTab>('pending');

  const { data, isLoading, refetch } = usePendingSellers();
  const approveMut  = useApproveSeller();
  const suspendMut  = useSuspendSeller();
  const trendMut    = useTrendStore();

  const allSellers: any[] = data?.users ?? data ?? [];

  const filtered = allSellers.filter(s => {
    const matchSearch = !search.trim() || (
      s.storeName?.toLowerCase().includes(search.toLowerCase()) ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase())
    );
    const status = s.storeStatus ?? 'pending_review';
    const matchTab =
      tabFilter === 'all'      ? true :
      tabFilter === 'pending'  ? status === 'pending_review' :
      tabFilter === 'approved' ? status === 'approved'  :
      tabFilter === 'rejected' ? (status === 'rejected' || status === 'suspended') :
      true;
    return matchSearch && matchTab;
  });

  const pendingCount  = allSellers.filter(s => (s.storeStatus ?? 'pending_review') === 'pending_review').length;

  const handleApprove = (seller: any) => {
    Alert.alert(
      'Approve Store',
      `Approve "${seller.storeName ?? seller.name}" and make it live on WimaKit?`,
      [
        { text:'Cancel', style:'cancel' },
        { text:'Approve ✅', onPress: () =>
          approveMut.mutate(seller._id ?? seller.id, {
            onSuccess: () => Toast.show({ type:'success', text1:'✅ Store approved!', text2:`${seller.storeName ?? seller.name} is now live.` }),
            onError:   () => Toast.show({ type:'error', text1:'Approval failed' }),
          })
        },
      ]
    );
  };

  const handleSuspend = (seller: any) => {
    const status = seller.storeStatus ?? 'pending_review';
    const label  = status === 'pending_review' ? 'Reject' : 'Suspend';
    Alert.alert(
      `${label} Store`,
      `This will ${label.toLowerCase()} "${seller.storeName ?? seller.name}". The seller will be notified.`,
      [
        { text:'Cancel', style:'cancel' },
        { text:`${label} 🚫`, style:'destructive', onPress: () =>
          suspendMut.mutate(seller._id ?? seller.id, {
            onSuccess: () => Toast.show({ type:'info', text1:`Store ${label.toLowerCase()}ed`, text2: seller.storeName ?? seller.name }),
            onError:   () => Toast.show({ type:'error', text1:`${label} failed` }),
          })
        },
      ]
    );
  };

  const handleTrend = (seller: any) => {
    const isTrending = seller.isTrending;
    Alert.alert(
      isTrending ? 'Remove Trending' : 'Mark as Trending',
      isTrending
        ? `Remove trending status from "${seller.storeName ?? seller.name}"?`
        : `Mark "${seller.storeName ?? seller.name}" as 🔥 Trending for 7 days?`,
      [
        { text:'Cancel', style:'cancel' },
        { text: isTrending ? 'Remove' : 'Mark Trending 🔥', onPress: () =>
          trendMut.mutate(seller._id ?? seller.id, {
            onSuccess: () => Toast.show({ type:'success', text1: isTrending ? 'Trending removed' : '🔥 Store marked as trending!' }),
            onError:   () => Toast.show({ type:'error', text1:'Failed to update trending' }),
          })
        },
      ]
    );
  };

  return (
    <View style={mod.root}>
      {/* Summary stats */}
      {allSellers.length > 0 && <SummaryStats sellers={allSellers} colors={colors} />}

      {/* Pending alert */}
      {pendingCount > 0 && (
        <View style={[mod.pendingAlert, { backgroundColor:'#FFFBEB', borderColor:'#F59E0B40' }]}>
          <MaterialCommunityIcons name="clock-alert-outline" size={18} color="#F59E0B" />
          <Text style={[mod.pendingAlertText, { color:'#92400E' }]}>
            {pendingCount} store{pendingCount > 1 ? 's' : ''} waiting for approval
          </Text>
          {tabFilter !== 'pending' && (
            <TouchableOpacity onPress={() => setTabFilter('pending')}>
              <Text style={[mod.pendingAlertLink, { color:'#F59E0B' }]}>Review →</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Search */}
      <View style={[mod.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
        <TextInput
          style={[mod.searchInput, { color: colors.textPrimary }]}
          value={search} onChangeText={setSearch}
          placeholder="Search store name, seller, email…"
          placeholderTextColor={colors.textMuted}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tab filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, paddingVertical: Spacing.sm }}>
        {([
          { v:'pending',  l:'Pending',  color:'#F59E0B' },
          { v:'approved', l:'Approved', color:'#10B981' },
          { v:'rejected', l:'Rejected', color:'#EF4444' },
          { v:'all',      l:'All',      color:'#4F46E5' },
        ] as { v: FilterTab; l: string; color: string }[]).map(f => (
          <TouchableOpacity
            key={f.v}
            style={[mod.tabBtn, {
              backgroundColor: tabFilter === f.v ? f.color : colors.surface,
              borderColor:     tabFilter === f.v ? f.color : colors.border,
            }]}
            onPress={() => setTabFilter(f.v)}
          >
            <Text style={[mod.tabBtnText, { color: tabFilter === f.v ? '#fff' : colors.textMuted }]}>{f.l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results */}
      {isLoading ? (
        <View style={mod.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[mod.loadingText, { color: colors.textMuted }]}>Loading sellers…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={[mod.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="store-off-outline" size={40} color={colors.textMuted} />
          <Text style={[mod.emptyTitle, { color: colors.textPrimary }]}>No {tabFilter} sellers</Text>
          <Text style={[mod.emptyText, { color: colors.textMuted }]}>
            {tabFilter === 'pending'
              ? 'All seller applications have been reviewed.'
              : 'No sellers match this filter.'}
          </Text>
        </View>
      ) : (
        filtered.map(seller => (
          <SellerCard
            key={seller._id ?? seller.id}
            seller={seller}
            colors={colors}
            onApprove={() => handleApprove(seller)}
            onSuspend={() => handleSuspend(seller)}
            onTrend={()   => handleTrend(seller)}
            onViewDetails={() => {}}
          />
        ))
      )}
    </View>
  );
}

const mod = StyleSheet.create({
  root: { flex:1, padding: Spacing.md },

  pendingAlert:     { flexDirection:'row', alignItems:'center', gap:8, borderWidth:1, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  pendingAlertText: { flex:1, fontSize:13, fontWeight:'700' },
  pendingAlertLink: { fontSize:12, fontWeight:'800' },

  searchRow:   { flexDirection:'row', alignItems:'center', gap:10, borderWidth:1, borderRadius: Radius.xl, paddingHorizontal:14, paddingVertical:11, marginBottom: Spacing.sm },
  searchInput: { flex:1, fontSize:14 },

  tabBtn:     { paddingHorizontal:14, paddingVertical:7, borderRadius: Radius.full, borderWidth:1.5 },
  tabBtnText: { fontSize:12, fontWeight:'800' },

  loading:     { alignItems:'center', paddingTop:40, gap:10 },
  loadingText: { fontSize:14 },

  empty:       { alignItems:'center', borderRadius: Radius.xl, borderWidth:1, padding:40, gap:10, marginTop: Spacing.md },
  emptyTitle:  { fontSize:16, fontWeight:'800' },
  emptyText:   { fontSize:13, textAlign:'center' },
});
