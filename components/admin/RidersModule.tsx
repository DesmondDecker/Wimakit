import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { adminApi } from '../../utils/api';
import { formatPrice, timeAgo, formatDate } from '../../constants/data';

const RIDER_STATUS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  approved:  { label: 'Active',    color: '#10B981', bg: '#ECFDF5', icon: 'check-circle-outline' },
  pending:   { label: 'Pending',   color: '#F59E0B', bg: '#FFFBEB', icon: 'clock-outline'        },
  rejected:  { label: 'Rejected',  color: '#EF4444', bg: '#FEF2F2', icon: 'close-circle-outline' },
  suspended: { label: 'Suspended', color: '#6B7280', bg: '#F3F4F6', icon: 'pause-circle-outline' },
  online:    { label: 'Online',    color: '#0F6E56', bg: '#ECFDF5', icon: 'circle'               },
  offline:   { label: 'Offline',   color: '#9CA3AF', bg: '#F3F4F6', icon: 'circle-outline'       },
};

type FilterTab = 'pending' | 'approved' | 'suspended' | 'all';

function useAdminRidersList(params?: any) {
  return useQuery({
    queryKey: ['admin', 'riders', params],
    queryFn: () => adminApi.riders(params).then(r => r.data),
    staleTime: 30_000,
  });
}
function useApproveRiderAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.approveRider(id).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'riders'] }),
  });
}
function useSuspendRiderAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.suspendRider(id).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'riders'] }),
  });
}
function useRejectRiderAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi.rejectRider(id, reason).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'riders'] }),
  });
}
function useAdminRiderPayoutsList(p?: any) {
  return useQuery({
    queryKey: ['admin', 'rider-payouts', p],
    queryFn: () => adminApi.riderPayouts(p).then(r => r.data),
    staleTime: 30_000,
  });
}

export function RidersModule({ colors }: { colors: any }) {
  const [tab, setTab] = useState<FilterTab>('pending');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'map' | 'payouts'>('list');

  const params = tab === 'all' ? {} : { status: tab };
  const { data, isLoading, refetch } = useAdminRidersList(params);
  const { data: payoutData, isLoading: payoutsLoading } = useAdminRiderPayoutsList();
  const approveMut = useApproveRiderAdmin();
  const suspendMut = useSuspendRiderAdmin();
  const rejectMut  = useRejectRiderAdmin();

  const riders = (data?.riders ?? data?.users ?? []).filter((r: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) || r.phone?.includes(q);
  });

  const stats = {
    total:    data?.total ?? riders.length,
    pending:  data?.pendingCount ?? riders.filter((r: any) => r.storeStatus === 'pending' || r.kycStatus === 'pending').length,
    approved: data?.approvedCount ?? riders.filter((r: any) => r.storeStatus === 'approved' || r.isActive).length,
    online:   data?.onlineCount ?? 0,
  };

  const handleApprove = (r: any) => {
    Alert.alert('Approve Rider', `Approve ${r.name} as a WimaKit rider?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve', onPress: () => approveMut.mutate(r._id ?? r.id, {
          onSuccess: () => Toast.show({ type: 'success', text1: `${r.name} approved as rider` }),
          onError:   (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Approve failed' }),
        }),
      },
    ]);
  };

  const handleSuspend = (r: any) => {
    Alert.alert('Suspend Rider', `Suspend ${r.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Suspend', style: 'destructive', onPress: () => suspendMut.mutate(r._id ?? r.id, {
          onSuccess: () => Toast.show({ type: 'success', text1: `${r.name} suspended` }),
          onError:   (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Suspend failed' }),
        }),
      },
    ]);
  };

  const handleReject = (r: any) => {
    Alert.prompt?.('Reject Rider', 'Enter reason for rejection', (reason) => {
      if (!reason?.trim()) return;
      rejectMut.mutate({ id: r._id ?? r.id, reason: reason.trim() }, {
        onSuccess: () => Toast.show({ type: 'success', text1: `${r.name} rejected` }),
        onError:   (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Reject failed' }),
      });
    });
  };

  const handleBatchPay = () => {
    Alert.alert('Batch Pay Riders', 'Pay all pending rider payouts now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Pay All', onPress: async () => {
          try {
            await adminApi.batchPayRiders();
            Toast.show({ type: 'success', text1: 'Batch payout initiated!' });
            refetch();
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Batch pay failed' });
          }
        },
      },
    ]);
  };

  return (
    <View>
      {/* Stats row */}
      <View style={s.statsRow}>
        {[
          { val: stats.total,    lbl: 'Total',    color: colors.textPrimary },
          { val: stats.online,   lbl: 'Online',   color: '#0F6E56' },
          { val: stats.pending,  lbl: 'Pending',  color: '#F59E0B' },
          { val: stats.approved, lbl: 'Approved', color: '#10B981' },
        ].map(({ val, lbl, color }) => (
          <View key={lbl} style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.statVal, { color }]}>{val}</Text>
            <Text style={[s.statLbl, { color: colors.textMuted }]}>{lbl}</Text>
          </View>
        ))}
      </View>

      {/* View toggle */}
      <View style={[s.viewToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(['list', 'map', 'payouts'] as const).map(v => (
          <TouchableOpacity
            key={v}
            style={[s.viewBtn, view === v && { backgroundColor: '#0F6E56' }]}
            onPress={() => setView(v)}
          >
            <Text style={[s.viewBtnText, { color: view === v ? '#fff' : colors.textMuted }]}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === 'map' && (
        <View style={[s.mapBox, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="map-legend" size={40} color={colors.textMuted} />
          <Text style={[s.mapLabel, { color: colors.textMuted }]}>Live map requires location permissions</Text>
          <Text style={[s.mapSub, { color: colors.textMuted }]}>{stats.online} riders currently online</Text>
          <View style={s.mapLegend}>
            {[['#0F6E56','Delivering'],['#F59E0B','Idle'],['#EF4444','Issue']].map(([c,l]) => (
              <View key={l} style={s.legendRow}>
                <View style={[s.legendDot, { backgroundColor: c }]} />
                <Text style={[s.legendText, { color: colors.textMuted }]}>{l}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {view === 'payouts' && (
        <View>
          <View style={[s.payoutAlert, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B40' }]}>
            <MaterialCommunityIcons name="clock-alert-outline" size={16} color="#F59E0B" />
            <Text style={{ flex: 1, fontSize: FontSize.xs, color: '#92400E' }}>
              {payoutData?.pendingCount ?? '—'} payout requests need review
            </Text>
          </View>
          <TouchableOpacity
            style={[s.batchBtn, { backgroundColor: '#0F6E56' }]}
            onPress={handleBatchPay}
          >
            <MaterialCommunityIcons name="send-check-outline" size={16} color="white" />
            <Text style={s.batchBtnText}>Batch pay all riders</Text>
          </TouchableOpacity>
          {payoutsLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : (
            (payoutData?.payouts ?? []).slice(0, 20).map((p: any, i: number) => (
              <View key={i} style={[s.payoutRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[s.payoutAvatar, { backgroundColor: '#0F6E5618' }]}>
                  <Text style={[s.payoutAvatarText, { color: '#0F6E56' }]}>{p.rider?.name?.[0] ?? 'R'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.payoutName, { color: colors.textPrimary }]}>{p.rider?.name ?? 'Rider'}</Text>
                  <Text style={[s.payoutMeta, { color: colors.textMuted }]}>{p.method ?? 'Orange Money'} · {timeAgo(p.createdAt)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.payoutAmt, { color: '#0F6E56' }]}>{formatPrice(p.amount ?? 0)}</Text>
                  <View style={[s.payoutBadge, { backgroundColor: p.status === 'paid' ? '#ECFDF5' : '#FFFBEB' }]}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: p.status === 'paid' ? '#10B981' : '#F59E0B' }}>
                      {p.status === 'paid' ? 'Paid' : 'Pending'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {view === 'list' && (
        <>
          {/* Search */}
          <View style={[s.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={16} color={colors.textMuted} />
            <TextInput
              style={[s.searchInput, { color: colors.textPrimary }]}
              placeholder="Search rider name, email, phone…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <MaterialCommunityIcons name="close" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter tabs */}
          <View style={s.filterRow}>
            {(['pending','approved','suspended','all'] as FilterTab[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[s.filterChip, tab === t && { backgroundColor: '#0F6E56' }]}
                onPress={() => setTab(t)}
              >
                <Text style={[s.filterText, { color: tab === t ? '#fff' : colors.textMuted }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isLoading
            ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            : riders.length === 0
              ? (
                <View style={[s.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="bike-fast" size={36} color={colors.textMuted} />
                  <Text style={[s.emptyText, { color: colors.textMuted }]}>No {tab} riders found</Text>
                </View>
              )
              : riders.map((rider: any) => (
                <RiderCard
                  key={rider._id ?? rider.id}
                  rider={rider}
                  colors={colors}
                  onApprove={handleApprove}
                  onSuspend={handleSuspend}
                  onReject={handleReject}
                />
              ))
          }
        </>
      )}
    </View>
  );
}

function RiderCard({ rider: r, colors, onApprove, onSuspend, onReject }: any) {
  const [expanded, setExpanded] = useState(false);
  const rStatus = r.isOnline ? RIDER_STATUS.online : (RIDER_STATUS[r.storeStatus ?? r.accountStatus ?? 'pending'] ?? RIDER_STATUS.pending);
  const todayEarnings = r.todayEarnings ?? 0;
  const todayDeliveries = r.todayDeliveries ?? 0;
  const isPending = r.storeStatus === 'pending' || r.kycStatus === 'pending' || r.accountStatus === 'pending_verification';

  return (
    <View style={[s.riderCard, { backgroundColor: colors.surface, borderColor: isPending ? '#F59E0B40' : colors.border }, Shadow.sm]}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
        <View style={s.riderTop}>
          {r.avatar
            ? <Image source={{ uri: r.avatar }} style={s.riderAvatar} contentFit="cover" />
            : (
              <View style={[s.riderAvatarFallback, { backgroundColor: '#0F6E5618' }]}>
                <Text style={[s.riderAvatarText, { color: '#0F6E56' }]}>{r.name?.[0] ?? 'R'}</Text>
              </View>
            )
          }
          <View style={{ flex: 1 }}>
            <Text style={[s.riderName, { color: colors.textPrimary }]} numberOfLines={1}>{r.name}</Text>
            <Text style={[s.riderSub, { color: colors.textMuted }]} numberOfLines={1}>
              {r.phone ?? r.email}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={[s.statusBadge, { backgroundColor: rStatus.bg }]}>
              <MaterialCommunityIcons name={rStatus.icon as any} size={10} color={rStatus.color} />
              <Text style={[s.statusText, { color: rStatus.color }]}>{rStatus.label}</Text>
            </View>
            {r.isOnline && (
              <Text style={[s.onlineText, { color: '#0F6E56' }]}>● Online now</Text>
            )}
          </View>
        </View>

        <View style={s.riderMeta}>
          {r.vehicleType && (
            <View style={s.metaChip}>
              <MaterialCommunityIcons name="bike" size={12} color={colors.textMuted} />
              <Text style={[s.metaText, { color: colors.textMuted }]}>{r.vehicleType}</Text>
            </View>
          )}
          <View style={s.metaChip}>
            <MaterialCommunityIcons name="truck-delivery-outline" size={12} color={colors.textMuted} />
            <Text style={[s.metaText, { color: colors.textMuted }]}>{todayDeliveries} deliveries today</Text>
          </View>
          {todayEarnings > 0 && (
            <View style={s.metaChip}>
              <MaterialCommunityIcons name="currency-usd" size={12} color="#0F6E56" />
              <Text style={[s.metaText, { color: '#0F6E56' }]}>{formatPrice(todayEarnings)}</Text>
            </View>
          )}
          {r.rating && (
            <View style={s.metaChip}>
              <MaterialCommunityIcons name="star" size={12} color="#F59E0B" />
              <Text style={[s.metaText, { color: colors.textMuted }]}>{Number(r.rating).toFixed(1)}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={[s.expandedSection, { borderTopColor: colors.border }]}>
          <View style={s.detailGrid}>
            {[
              { label: 'Zone',         val: r.district ?? r.location ?? '—' },
              { label: 'Total trips',  val: r.totalDeliveries ?? '—' },
              { label: 'KYC',          val: r.kycStatus ?? '—' },
              { label: 'Member since', val: r.createdAt ? formatDate(r.createdAt) : '—' },
              { label: 'Payout',       val: r.payoutMethod ?? '—' },
              { label: 'Plate',        val: r.plateNumber ?? '—' },
            ].map(({ label, val }) => (
              <View key={label} style={s.detailRow}>
                <Text style={[s.detailLabel, { color: colors.textMuted }]}>{label}</Text>
                <Text style={[s.detailVal, { color: colors.textPrimary }]}>{val}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={s.actionRow}>
        {isPending && (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#0F6E5618', borderColor: '#0F6E5640' }]} onPress={() => onApprove(r)}>
            <MaterialCommunityIcons name="check" size={14} color="#0F6E56" />
            <Text style={[s.actionText, { color: '#0F6E56' }]}>Approve</Text>
          </TouchableOpacity>
        )}
        {!isPending && r.storeStatus !== 'suspended' && (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B40' }]} onPress={() => onSuspend(r)}>
            <MaterialCommunityIcons name="pause-circle-outline" size={14} color="#F59E0B" />
            <Text style={[s.actionText, { color: '#F59E0B' }]}>Suspend</Text>
          </TouchableOpacity>
        )}
        {r.storeStatus === 'suspended' && (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#ECFDF5', borderColor: '#10B98140' }]} onPress={() => onApprove(r)}>
            <MaterialCommunityIcons name="play-circle-outline" size={14} color="#10B981" />
            <Text style={[s.actionText, { color: '#10B981' }]}>Reinstate</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#FEF2F2', borderColor: '#EF444440' }]} onPress={() => onReject(r)}>
          <MaterialCommunityIcons name="close" size={14} color="#EF4444" />
          <Text style={[s.actionText, { color: '#EF4444' }]}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setExpanded(!expanded)}>
          <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
          <Text style={[s.actionText, { color: colors.textMuted }]}>{expanded ? 'Less' : 'More'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  statsRow:     { flexDirection:'row', gap:6, marginBottom:12 },
  statCard:     { flex:1, borderRadius:Radius.md, borderWidth:1, padding:8, alignItems:'center' },
  statVal:      { fontSize:16, fontWeight:'900' },
  statLbl:      { fontSize:9, fontWeight:'700', marginTop:2 },
  viewToggle:   { flexDirection:'row', borderRadius:Radius.md, borderWidth:1, overflow:'hidden', marginBottom:12 },
  viewBtn:      { flex:1, padding:8, alignItems:'center' },
  viewBtnText:  { fontSize:FontSize.xs, fontWeight:'700' },
  mapBox:       { borderRadius:Radius.xl, borderWidth:1, padding:Spacing.xl, alignItems:'center', gap:8, marginBottom:12 },
  mapLabel:     { fontSize:FontSize.sm, fontWeight:'600' },
  mapSub:       { fontSize:FontSize.xs },
  mapLegend:    { flexDirection:'row', gap:12, marginTop:8 },
  legendRow:    { flexDirection:'row', alignItems:'center', gap:5 },
  legendDot:    { width:8, height:8, borderRadius:4 },
  legendText:   { fontSize:9 },
  payoutAlert:  { flexDirection:'row', alignItems:'center', gap:8, borderRadius:Radius.md, borderWidth:1, padding:10, marginBottom:10 },
  batchBtn:     { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, borderRadius:Radius.lg, padding:12, marginBottom:12 },
  batchBtnText: { color:'white', fontWeight:'700', fontSize:FontSize.sm },
  payoutRow:    { flexDirection:'row', alignItems:'center', gap:10, borderRadius:Radius.lg, borderWidth:1, padding:10, marginBottom:8 },
  payoutAvatar: { width:34, height:34, borderRadius:17, alignItems:'center', justifyContent:'center' },
  payoutAvatarText: { fontWeight:'800', fontSize:14 },
  payoutName:   { fontSize:FontSize.sm, fontWeight:'700' },
  payoutMeta:   { fontSize:FontSize.xs, marginTop:2 },
  payoutAmt:    { fontSize:FontSize.sm, fontWeight:'800' },
  payoutBadge:  { paddingHorizontal:6, paddingVertical:2, borderRadius:Radius.full, marginTop:3 },
  searchRow:    { flexDirection:'row', alignItems:'center', gap:8, borderRadius:Radius.md, borderWidth:1, padding:10, marginBottom:10 },
  searchInput:  { flex:1, fontSize:FontSize.sm },
  filterRow:    { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:12 },
  filterChip:   { paddingHorizontal:12, paddingVertical:5, borderRadius:Radius.full, backgroundColor:'#0F6E5618' },
  filterText:   { fontSize:FontSize.xs, fontWeight:'700' },
  emptyBox:     { borderRadius:Radius.xl, borderWidth:1, padding:Spacing.xl, alignItems:'center', gap:8 },
  emptyText:    { fontSize:FontSize.sm },
  riderCard:    { borderRadius:Radius.xl, borderWidth:1, padding:Spacing.md, marginBottom:10 },
  riderTop:     { flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:8 },
  riderAvatar:  { width:40, height:40, borderRadius:20 },
  riderAvatarFallback: { width:40, height:40, borderRadius:20, alignItems:'center', justifyContent:'center' },
  riderAvatarText: { fontWeight:'800', fontSize:16 },
  riderName:    { fontSize:FontSize.sm, fontWeight:'700' },
  riderSub:     { fontSize:FontSize.xs, marginTop:2 },
  statusBadge:  { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:7, paddingVertical:3, borderRadius:Radius.full },
  statusText:   { fontSize:9, fontWeight:'700' },
  onlineText:   { fontSize:9, fontWeight:'700' },
  riderMeta:    { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:8 },
  metaChip:     { flexDirection:'row', alignItems:'center', gap:4 },
  metaText:     { fontSize:9, fontWeight:'600' },
  expandedSection: { borderTopWidth:1, paddingTop:10, marginTop:4 },
  detailGrid:   { gap:6 },
  detailRow:    { flexDirection:'row', justifyContent:'space-between' },
  detailLabel:  { fontSize:FontSize.xs },
  detailVal:    { fontSize:FontSize.xs, fontWeight:'700' },
  actionRow:    { flexDirection:'row', gap:6, flexWrap:'wrap', marginTop:8 },
  actionBtn:    { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, paddingVertical:7, paddingHorizontal:10, borderRadius:Radius.md, borderWidth:1, minWidth:70 },
  actionText:   { fontSize:FontSize.xs, fontWeight:'700' },
});
