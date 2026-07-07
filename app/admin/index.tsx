import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuthStore } from '../../store';
import {
  useAdminDashboard, useAdminUsers, useAdminProducts, useAdminDisputes,
  useAdminPayouts, useAdminKyc, useAdminLoans, useAdminBnpl, useAdminAds, useAdminReported,
  useAdminOrders, useAdminFinancial, useAdminSystemHealth,
  useApproveKyc, useReviewLoan, useApproveProduct, useApprovePayout, useRejectPayout, useBanUser, useUnbanUser,
  useSetBnplEligibility, useSetLoanEligibility,
  useResolveDispute, useForceCancelOrder, useForceRefundOrder,
} from '../../hooks/useApi';
import { adminApi } from '../../utils/api';
import { formatPrice, formatNumber, timeAgo } from '../../constants/data';
import { SellersModule } from '../../components/admin/SellersModule';
import { RidersModule } from '../../components/admin/RidersModule';

type ModuleId = 'dashboard'|'users'|'products'|'sellers'|'riders'|'kyc'|'orders'|'disputes'|'payouts'|'bnpl'|'loans'|'ads'|'community'|'broadcast'|'health'|'escrow'|'delivery'|'financial';

const MODULES: { id: ModuleId; label: string; icon: string; color: string }[] = [
  { id:'dashboard', label:'Dashboard',  icon:'view-dashboard-outline', color:'#4F46E5' },
  { id:'users',     label:'Users',      icon:'account-group-outline',  color:'#8B5CF6' },
  { id:'sellers',   label:'Sellers',    icon:'storefront-outline',     color:'#10B981' },
  { id:'riders',    label:'Riders',     icon:'bike',                   color:'#0F6E56' },
  { id:'products',  label:'Products',   icon:'package-variant-closed', color:'#10B981' },
  { id:'orders',    label:'Orders',     icon:'truck-fast-outline',     color:'#8B5CF6' },
  { id:'kyc',       label:'KYC Queue',  icon:'card-account-details-outline', color:'#F59E0B' },
  { id:'disputes',  label:'Disputes',   icon:'shield-alert-outline',   color:'#EF4444' },
  { id:'payouts',   label:'Payouts',    icon:'bank-transfer-out',      color:'#06B6D4' },
  { id:'financial', label:'Financial',  icon:'chart-line',             color:'#22C55E' },
  { id:'escrow',    label:'Escrow',     icon:'shield-lock-outline',    color:'#D97706' },
  { id:'delivery',  label:'Delivery',   icon:'map-marker-distance',    color:'#0EA5E9' },
  { id:'bnpl',      label:'BNPL',       icon:'calendar-month',         color:'#EC4899' },
  { id:'loans',     label:'Loans',      icon:'bank-outline',           color:'#F97316' },
  { id:'ads',       label:'Ads',        icon:'bullhorn-outline',       color:'#3B82F6' },
  { id:'community', label:'Community',  icon:'forum-outline',          color:'#A855F7' },
  { id:'broadcast', label:'Broadcast',  icon:'bullhorn-outline',      color:'#0EA5E9' },
  { id:'health',    label:'System Health', icon:'heart-pulse',        color:'#6366F1' },
];

export default function AdminDashboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const { module: moduleParam } = useLocalSearchParams<{ module?: string }>();
  const initialModule = (MODULES.some(m => m.id === moduleParam) ? moduleParam : 'dashboard') as ModuleId;
  const [active, setActive] = useState<ModuleId>(initialModule);

  // Admin-portal's quick-link cards deep-link here with a specific module
  // (e.g. /admin?module=payouts). Keep the open module in sync if the param
  // changes across navigations within the same mounted screen.
  useEffect(() => {
    if (moduleParam && MODULES.some(m => m.id === moduleParam)) {
      setActive(moduleParam as ModuleId);
    }
  }, [moduleParam]);

  if (user?.role !== 'admin') {
    return (
      <SafeAreaView style={[{ flex:1, backgroundColor: colors.background, alignItems:'center', justifyContent:'center' }]}>
        <MaterialCommunityIcons name="lock-outline" size={48} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>Admin access required</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Command Center</Text>
          <Text style={[s.headerSub, { color: colors.textMuted }]}>WimaKit Admin · {user?.name}</Text>
        </View>
        <TouchableOpacity style={[s.logoutBtn, { backgroundColor: colors.errorMuted }]}
          onPress={() => router.push('/(tabs)' as any)}>
          <MaterialCommunityIcons name="exit-to-app" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>

      {/* Module tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[s.tabsScroll, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: 8, paddingVertical: 10 }}>
        {MODULES.map(m => (
          <TouchableOpacity key={m.id}
            style={[s.tab, { backgroundColor: active === m.id ? m.color : colors.surfaceAlt ?? colors.surface, borderColor: active === m.id ? m.color : colors.border }]}
            onPress={() => setActive(m.id)}>
            <MaterialCommunityIcons name={m.icon as any} size={14} color={active === m.id ? '#fff' : colors.textMuted} />
            <Text style={[s.tabText, { color: active === m.id ? '#fff' : colors.textMuted }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }}>
        {active === 'dashboard' && <DashboardModule colors={colors} />}
        {active === 'users'     && <UsersModule colors={colors} />}
        {active === 'sellers'   && <SellersModule colors={colors} />}
        {active === 'riders'    && <RidersModule colors={colors} />}
        {active === 'products'  && <ProductsModule colors={colors} />}
        {active === 'orders'    && <OrdersModule colors={colors} />}
        {active === 'kyc'       && <KycModule colors={colors} />}
        {active === 'disputes'  && <DisputesModule colors={colors} />}
        {active === 'payouts'   && <PayoutsModule colors={colors} />}
        {active === 'financial' && <FinancialModule colors={colors} />}
        {active === 'bnpl'      && <BnplModule colors={colors} />}
        {active === 'loans'     && <LoansModule colors={colors} />}
        {active === 'ads'       && <AdsModule colors={colors} />}
        {active === 'community' && <CommunityModule colors={colors} />}
        {active === 'broadcast' && <BroadcastModule colors={colors} />}
        {active === 'escrow'    && <EscrowModule colors={colors} />}
        {active === 'delivery'  && <DeliveryModule  colors={colors} />}
        {active === 'health'    && <HealthModule    colors={colors} />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Dashboard Module ─────────────────────────────────────────────────────────
function DashboardModule({ colors }: any) {
  const { data, isLoading } = useAdminDashboard();
  if (isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
  const kpis = data?.kpis ?? [];
  const health = data?.systemHealth ?? {};
  const alerts = data?.alerts ?? {};
  const revenueChart = data?.revenueChart ?? [];
  const maxVal = Math.max(...revenueChart.map((r: any) => r.value), 1);

  return (
    <View>
      <View style={s.kpiGrid}>
        {kpis.map((k: any) => (
          <View key={k.id} style={[s.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}>
            <View style={[s.kpiIcon, { backgroundColor: k.color + '20' }]}>
              <MaterialCommunityIcons name={k.icon} size={20} color={k.color} />
            </View>
            <Text style={[s.kpiValue, { color: colors.textPrimary }]}>
              {k.prefix ? formatPrice(k.value, true) : formatNumber(k.value)}
            </Text>
            <Text style={[s.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
          </View>
        ))}
      </View>

      {/* Revenue chart */}
      <SectionCard title="Revenue — Last 12 Months" colors={colors}>
        <View style={s.chart}>
          {revenueChart.map((r: any, i: number) => (
            <View key={i} style={s.chartCol}>
              <View style={[s.chartBar, { height: Math.max(4, (r.value / maxVal) * 100), backgroundColor: colors.primary }]} />
              <Text style={[s.chartLabel, { color: colors.textMuted }]}>{r.label}</Text>
            </View>
          ))}
        </View>
      </SectionCard>

      {/* System health */}
      <SectionCard title="System Health" colors={colors}>
        <View style={s.healthGrid}>
          {Object.entries(health).map(([k, v]: any) => (
            <View key={k} style={s.healthItem}>
              <View style={[s.healthDot, { backgroundColor: v === 'healthy' ? colors.success : colors.error }]} />
              <Text style={[s.healthLabel, { color: colors.textPrimary }]}>{k[0].toUpperCase() + k.slice(1)}</Text>
              <Text style={[s.healthStatus, { color: v === 'healthy' ? colors.success : colors.error }]}>{v}</Text>
            </View>
          ))}
        </View>
      </SectionCard>

      {/* Alerts */}
      <SectionCard title="Action Required" colors={colors}>
        {[
          { label:'Pending KYC',     value: alerts.pendingKyc,     color:'#F59E0B' },
          { label:'Pending Products',value: alerts.pendingProducts,color:'#10B981' },
          { label:'Open Disputes',   value: alerts.openDisputes,   color:'#EF4444' },
          { label:'Pending Loans',   value: alerts.pendingLoans,   color:'#F97316' },
          { label:'Pending Payouts', value: alerts.pendingPayouts, color:'#06B6D4' },
        ].map(a => (
          <View key={a.label} style={[s.alertRow, { borderBottomColor: colors.border }]}>
            <View style={[s.alertDot, { backgroundColor: a.color }]} />
            <Text style={[s.alertLabel, { color: colors.textPrimary }]}>{a.label}</Text>
            <View style={[s.alertBadge, { backgroundColor: (a.value ?? 0) > 0 ? a.color + '20' : colors.surfaceAlt ?? colors.surface }]}>
              <Text style={[s.alertValue, { color: (a.value ?? 0) > 0 ? a.color : colors.textMuted }]}>{a.value ?? 0}</Text>
            </View>
          </View>
        ))}
      </SectionCard>
    </View>
  );
}

// ─── Users Module ─────────────────────────────────────────────────────────────
function UsersModule({ colors }: any) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const { data, isLoading } = useAdminUsers({ q: search || undefined, role: roleFilter, limit: 30 });
  const banMut = useBanUser();
  const unbanMut = useUnbanUser();
  const bnplMut = useSetBnplEligibility();
  const loanMut = useSetLoanEligibility();
  const users = data?.users ?? [];

  const handleBan = (u: any) => {
    Alert.prompt?.('Ban User', `Reason for banning ${u.name}?`, (reason) => {
      if (reason) banMut.mutate({ id: u._id ?? u.id, reason }, { onSuccess: () => Toast.show({ type:'success', text1:'User banned' }) });
    }) ?? Alert.alert('Ban User', `Ban ${u.name}?`, [
      { text:'Cancel', style:'cancel' },
      { text:'Ban', style:'destructive', onPress: () => banMut.mutate({ id: u._id ?? u.id, reason: 'Policy violation' }, { onSuccess: () => Toast.show({ type:'success', text1:'User banned' }) }) },
    ]);
  };

  return (
    <View>
      <View style={[s.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
        <TextInput style={[s.searchInput, { color: colors.textPrimary }]} value={search} onChangeText={setSearch}
          placeholder="Search by name, email, phone…" placeholderTextColor={colors.textMuted} />
      </View>
      <View style={s.filterRow}>
        {['all','buyer','seller','rider'].map(r => (
          <TouchableOpacity key={r}
            style={[s.filterChip, { backgroundColor: (roleFilter ?? 'all') === r ? colors.primary : colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}
            onPress={() => setRoleFilter(r === 'all' ? undefined : r)}>
            <Text style={{ color: (roleFilter ?? 'all') === r ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '700' }}>{r[0].toUpperCase()+r.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : (
        users.map((u: any) => (
          <View key={u._id ?? u.id} style={[s.userCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.userAvatar, { backgroundColor: colors.primaryMuted }]}>
              <Text style={{ color: colors.primary, fontWeight: '900' }}>{(u.name?.[0] ?? 'U').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.textPrimary }]}>{u.name}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]}>{u.email} · {u.role}</Text>
              <View style={s.userBadges}>
                <View style={[s.statusBadge, { backgroundColor: u.accountStatus === 'active' ? colors.success+'20' : colors.error+'20' }]}>
                  <Text style={{ color: u.accountStatus === 'active' ? colors.success : colors.error, fontSize: 10, fontWeight:'700' }}>{u.accountStatus}</Text>
                </View>
                {u.isVerified && <MaterialCommunityIcons name="check-decagram" size={14} color={colors.primary} />}
              </View>
              {/* Loan & BNPL eligibility — tap to grant, tap again to revoke.
                  Previously there was no UI anywhere to do this per-account;
                  the backend endpoints existed but nothing called them. */}
              <View style={[s.userBadges, { marginTop: 6 }]}>
                <TouchableOpacity
                  disabled={bnplMut.isPending}
                  onPress={() => bnplMut.mutate(
                    { id: u._id ?? u.id, action: u.bnplEligible ? 'revoke' : 'grant' },
                    { onSuccess: () => Toast.show({ type: 'success', text1: u.bnplEligible ? 'BNPL revoked' : 'BNPL granted' }) }
                  )}
                  style={[s.eligChip, { backgroundColor: u.bnplEligible ? colors.success + '20' : colors.surfaceAlt ?? colors.surface, borderColor: u.bnplEligible ? colors.success : colors.border }]}
                >
                  <MaterialCommunityIcons name="credit-card-clock-outline" size={12} color={u.bnplEligible ? colors.success : colors.textMuted} />
                  <Text style={{ color: u.bnplEligible ? colors.success : colors.textMuted, fontSize: 10, fontWeight: '700' }}>BNPL {u.bnplEligible ? 'On' : 'Off'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={loanMut.isPending}
                  onPress={() => loanMut.mutate(
                    { id: u._id ?? u.id, action: u.loanEligible ? 'revoke' : 'grant' },
                    { onSuccess: () => Toast.show({ type: 'success', text1: u.loanEligible ? 'Loan access revoked' : 'Loan access granted' }) }
                  )}
                  style={[s.eligChip, { backgroundColor: u.loanEligible ? colors.success + '20' : colors.surfaceAlt ?? colors.surface, borderColor: u.loanEligible ? colors.success : colors.border }]}
                >
                  <MaterialCommunityIcons name="bank-outline" size={12} color={u.loanEligible ? colors.success : colors.textMuted} />
                  <Text style={{ color: u.loanEligible ? colors.success : colors.textMuted, fontSize: 10, fontWeight: '700' }}>Loan {u.loanEligible ? 'On' : 'Off'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ gap: 6 }}>
              {u.accountStatus === 'banned' ? (
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.success+'20' }]} onPress={() => unbanMut.mutate(u._id ?? u.id, { onSuccess: () => Toast.show({ type:'success', text1:'User unbanned' }) })}>
                  <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>Unban</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.error+'20' }]} onPress={() => handleBan(u)}>
                  <Text style={{ color: colors.error, fontSize: 11, fontWeight: '700' }}>Ban</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.primaryMuted }]}
                onPress={() => adminApi.warnUser(u._id ?? u.id, 'Community Guidelines', 'Please review our community guidelines.').then(() => Toast.show({ type:'success', text1:'Warning sent' }))}>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Warn</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Products Module ──────────────────────────────────────────────────────────
function ProductsModule({ colors }: any) {
  // Deep-linked from the dashboard's "Low Stock Alerts" KPI as
  // /admin?module=products&stock=low. Read it once on mount so the module
  // opens straight into the low-stock view instead of silently ignoring it.
  const { stock: stockParam } = useLocalSearchParams<{ stock?: string }>();
  const [filter, setFilter] = useState<string | undefined>('pending_moderation');
  const [lowStockOnly, setLowStockOnly] = useState(stockParam === 'low');
  useEffect(() => { if (stockParam === 'low') { setLowStockOnly(true); setFilter(undefined); } }, [stockParam]);

  const { data, isLoading, refetch } = useAdminProducts({
    status: lowStockOnly ? undefined : filter,
    stock: lowStockOnly ? 'low' : undefined,
    limit: 30,
  });
  const approveMut = useApproveProduct();
  const products = data?.products ?? [];

  const handleReject = (p: any) => {
    Alert.alert('Reject Product', 'Reason for rejection?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Poor image quality', onPress: () => adminApi.rejectProduct(p._id, 'Poor image quality').then(() => refetch()) },
      { text: 'Misleading info', onPress: () => adminApi.rejectProduct(p._id, 'Misleading product information').then(() => refetch()) },
      { text: 'Prohibited item', onPress: () => adminApi.rejectProduct(p._id, 'Prohibited item').then(() => refetch()) },
    ]);
  };

  const handleTrend = (p: any) => {
    adminApi.trendProduct(p._id).then(() => { Toast.show({ type:'success', text1:'Product set as trending 🔥' }); refetch(); });
  };

  return (
    <View>
      <View style={s.filterRow}>
        {[{v:'pending_moderation',l:'Pending'},{v:'approved',l:'Approved'},{v:'rejected',l:'Rejected'},{v:undefined,l:'All'}].map((f,i) => (
          <TouchableOpacity key={i}
            style={[s.filterChip, { backgroundColor: !lowStockOnly && filter === f.v ? colors.primary : colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}
            onPress={() => { setLowStockOnly(false); setFilter(f.v); }}>
            <Text style={{ color: !lowStockOnly && filter === f.v ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '700' }}>{f.l}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[s.filterChip, { backgroundColor: lowStockOnly ? '#FB923C' : colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}
          onPress={() => setLowStockOnly(v => !v)}>
          <Text style={{ color: lowStockOnly ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '700' }}>⚠️ Low Stock</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : products.length === 0 ? (
        <EmptyState icon="package-variant" text={lowStockOnly ? 'No low-stock products' : 'No products in this category'} colors={colors} />
      ) : (
        products.map((p: any) => (
          <View key={p._id} style={[s.productCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.textPrimary }]} numberOfLines={1}>{p.name}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]}>
                {p.seller?.storeName ?? p.seller?.name} · {p.category?.name} · {formatPrice(p.price)}
              </Text>
              <Text style={[s.userMeta, { color: (p.stock ?? 0) <= 5 ? colors.error : colors.textMuted, fontWeight: (p.stock ?? 0) <= 5 ? '700' : '400' }]}>
                {(p.stock ?? 0) <= 5 ? `⚠️ ${p.stock ?? 0} left in stock` : `${p.stock ?? 0} in stock`}
              </Text>
            </View>
            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              {p.status === 'pending_moderation' && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.success+'20' }]}
                    onPress={() => approveMut.mutate(p._id, { onSuccess: () => Toast.show({ type:'success', text1:'Product approved' }) })}>
                    <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.error+'20' }]} onPress={() => handleReject(p)}>
                    <Text style={{ color: colors.error, fontSize: 11, fontWeight: '700' }}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
              {p.status === 'approved' && !p.isTrending && (
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: '#F59E0B20' }]} onPress={() => handleTrend(p)}>
                  <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>🔥 Set Trending</Text>
                </TouchableOpacity>
              )}
              {p.isTrending && <View style={[s.statusBadge,{backgroundColor:'#F59E0B20'}]}><Text style={{color:'#F59E0B',fontSize:10,fontWeight:'700'}}>🔥 Trending</Text></View>}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── KYC Module ───────────────────────────────────────────────────────────────
function KycModule({ colors }: any) {
  const { data, isLoading, refetch } = useAdminKyc();
  const approveMut = useApproveKyc();
  const requests = data?.requests ?? [];

  return (
    <View>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : requests.length === 0 ? (
        <EmptyState icon="card-account-details-outline" text="No pending KYC requests" colors={colors} />
      ) : (
        requests.map((r: any) => (
          <View key={r._id} style={[s.kycCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.userAvatar, { backgroundColor: colors.primaryMuted }]}>
              <Text style={{ color: colors.primary, fontWeight: '900' }}>{(r.userName?.[0] ?? 'U').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.textPrimary }]}>{r.userName}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]}>{r.email} · {r.phone}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]}>Submitted {timeAgo(r.submittedAt)}</Text>
            </View>
            <View style={{ gap: 6 }}>
              <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.success+'20' }]}
                onPress={() => approveMut.mutate(r.userId, { onSuccess: () => { Toast.show({ type:'success', text1:'KYC approved! BNPL/loans unlocked.' }); refetch(); } })}>
                <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.error+'20' }]}
                onPress={() => adminApi.rejectKyc(r.userId, 'Documents unclear, please resubmit').then(() => refetch())}>
                <Text style={{ color: colors.error, fontSize: 11, fontWeight: '700' }}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Disputes Module ──────────────────────────────────────────────────────────
function DisputesModule({ colors }: any) {
  const { data, isLoading, refetch } = useAdminDisputes();
  const resolveMut = useResolveDispute();
  const [activeDispute, setActiveDispute] = useState<any>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [clawback, setClawback] = useState(true);
  const disputes = data?.disputes ?? [];

  const openResolve = (d: any) => {
    setActiveDispute(d);
    setResolutionNote('');
    setRefundAmount(d.orderTotal ? String(d.orderTotal) : '');
    setClawback(true);
  };

  const submitResolution = (status: 'resolved' | 'refunded') => {
    if (!activeDispute) return;
    if (!resolutionNote.trim()) {
      Toast.show({ type: 'error', text1: 'Add a short note before resolving' });
      return;
    }
    const amount = status === 'refunded' ? Number(refundAmount) || 0 : undefined;
    resolveMut.mutate(
      { id: activeDispute._id, status, resolution: resolutionNote.trim(), refundAmount: amount, clawback },
      {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: status === 'refunded' ? 'Dispute resolved — refund issued' : 'Dispute marked resolved' });
          setActiveDispute(null);
          refetch();
        },
        onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Failed to resolve dispute' }),
      }
    );
  };

  return (
    <View>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : disputes.length === 0 ? (
        <EmptyState icon="shield-check-outline" text="No open disputes" colors={colors} />
      ) : (
        disputes.map((d: any) => (
          <View key={d._id} style={[s.disputeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.textPrimary }]}>Order #{d.customOrderId}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]} numberOfLines={1}>{d.subject}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]}>{d.buyerName} vs {d.sellerName}</Text>
            </View>
            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              <View style={[s.statusBadge, { backgroundColor: colors.error+'20' }]}>
                <Text style={{ color: colors.error, fontSize: 10, fontWeight:'700' }}>{d.status}</Text>
              </View>
              {d.status !== 'resolved' && d.status !== 'refunded' && (
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.primaryMuted }]} onPress={() => openResolve(d)}>
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Resolve</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}

      <Modal visible={!!activeDispute} transparent animationType="fade" onRequestClose={() => setActiveDispute(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
              Resolve dispute — Order #{activeDispute?.customOrderId}
            </Text>
            <Text style={[s.userMeta, { color: colors.textMuted, marginBottom: 10 }]}>{activeDispute?.subject}</Text>
            <TextInput
              style={[s.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Resolution note for both parties…"
              placeholderTextColor={colors.textMuted}
              value={resolutionNote}
              onChangeText={setResolutionNote}
              multiline
            />
            <TextInput
              style={[s.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Refund amount (only if refunding)"
              placeholderTextColor={colors.textMuted}
              value={refundAmount}
              onChangeText={setRefundAmount}
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 }}
              onPress={() => setClawback(v => !v)}
            >
              <MaterialCommunityIcons name={clawback ? 'checkbox-marked' : 'checkbox-blank-outline'} size={20} color={clawback ? colors.primary : colors.textMuted} />
              <Text style={{ color: colors.textPrimary, fontSize: 12, flex: 1 }}>
                Deduct refund from seller's wallet (uncheck if the seller wasn't at fault — the platform will cover it instead)
              </Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[s.smallBtn, { flex: 1, alignItems: 'center', backgroundColor: colors.success+'20' }]}
                disabled={resolveMut.isPending}
                onPress={() => submitResolution('resolved')}>
                <Text style={{ color: colors.success, fontSize: 12, fontWeight: '700' }}>Mark Resolved</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.smallBtn, { flex: 1, alignItems: 'center', backgroundColor: colors.error+'20' }]}
                disabled={resolveMut.isPending}
                onPress={() => submitResolution('refunded')}>
                <Text style={{ color: colors.error, fontSize: 12, fontWeight: '700' }}>Resolve + Refund</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={{ marginTop: 12, alignItems: 'center' }} onPress={() => setActiveDispute(null)}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Payouts Module ───────────────────────────────────────────────────────────
function PayoutsModule({ colors }: any) {
  const [filter, setFilter] = useState('pending');
  const { data, isLoading, refetch } = useAdminPayouts({ status: filter });
  const approveMut = useApprovePayout();
  const rejectMut = useRejectPayout();
  const payouts = data?.payouts ?? [];

  const handleReject = (p: any) => {
    Alert.alert('Reject Payout', `Reject the ${formatPrice(p.amount)} payout to ${p.sellerId?.storeName ?? p.sellerId?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject', style: 'destructive', onPress: () =>
          rejectMut.mutate({ id: p._id, reason: 'Rejected by admin' }, {
            onSuccess: () => Toast.show({ type: 'info', text1: 'Payout rejected' }),
            onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Rejection failed' }),
          }),
      },
    ]);
  };

  return (
    <View>
      <View style={s.filterRow}>
        {['pending','completed','cancelled'].map(f => (
          <TouchableOpacity key={f} style={[s.filterChip, { backgroundColor: filter === f ? colors.primary : colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]} onPress={() => setFilter(f)}>
            <Text style={{ color: filter === f ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '700' }}>{f[0].toUpperCase()+f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : payouts.length === 0 ? (
        <EmptyState icon="bank-transfer-out" text="No payouts" colors={colors} />
      ) : (
        payouts.map((p: any) => (
          <View key={p._id} style={[s.disputeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.textPrimary }]}>{p.sellerId?.storeName ?? p.sellerId?.name}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]}>{formatPrice(p.amount)} · {p.method}</Text>
            </View>
            {p.status === 'pending' && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.success+'20' }]}
                  onPress={() => approveMut.mutate(p._id, { onSuccess: () => Toast.show({ type:'success', text1:'Payout approved' }) })}>
                  <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.error+'20' }]} onPress={() => handleReject(p)}>
                  <Text style={{ color: colors.error, fontSize: 11, fontWeight: '700' }}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );
}

// ─── BNPL Module ──────────────────────────────────────────────────────────────
function BnplModule({ colors }: any) {
  const { data, isLoading } = useAdminBnpl();
  const plans = data?.plans ?? [];
  return (
    <View>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : plans.length === 0 ? (
        <EmptyState icon="calendar-month" text="No BNPL plans" colors={colors} />
      ) : (
        plans.map((p: any) => (
          <View key={p._id} style={[s.disputeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.textPrimary }]}>{p.userId?.name}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]}>
                {p.planType} · {formatPrice(p.totalAmount)} · {p.paidInstalments}/{p.instalments} paid
              </Text>
            </View>
            <View style={[s.statusBadge, { backgroundColor: p.status === 'active' ? colors.success+'20' : p.status === 'overdue' ? colors.error+'20' : colors.surfaceAlt }]}>
              <Text style={{ color: p.status === 'active' ? colors.success : p.status === 'overdue' ? colors.error : colors.textMuted, fontSize: 10, fontWeight:'700' }}>{p.status}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Loans Module ─────────────────────────────────────────────────────────────
function LoansModule({ colors }: any) {
  const [filter, setFilter] = useState('under_review');
  const { data, isLoading, refetch } = useAdminLoans({ status: filter });
  const reviewMut = useReviewLoan();
  const loans = data?.loans ?? [];

  return (
    <View>
      <View style={s.filterRow}>
        {['under_review','approved','disbursed','repaid','rejected'].map(f => (
          <TouchableOpacity key={f} style={[s.filterChip, { backgroundColor: filter === f ? colors.primary : colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]} onPress={() => setFilter(f)}>
            <Text style={{ color: filter === f ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '700' }}>{f.replace('_',' ')}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : loans.length === 0 ? (
        <EmptyState icon="bank-outline" text="No loans here" colors={colors} />
      ) : (
        loans.map((l: any) => (
          <View key={l._id} style={[s.kycCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.textPrimary }]}>{l.userId?.name}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]}>
                {l.productType} · {formatPrice(l.amount)} · {(l.interestRate*100).toFixed(0)}% · {l.termDays}d
              </Text>
              {l.purpose && <Text style={[s.userMeta, { color: colors.textMuted }]} numberOfLines={1}>"{l.purpose}"</Text>}
            </View>
            {l.status === 'under_review' && (
              <View style={{ gap: 6 }}>
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.success+'20' }]}
                  onPress={() => reviewMut.mutate({ id: l._id, status: 'approved', note: 'Approved based on creditworthiness' }, { onSuccess: () => Toast.show({ type:'success', text1:'Loan approved' }) })}>
                  <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.error+'20' }]}
                  onPress={() => reviewMut.mutate({ id: l._id, status: 'rejected', note: 'Insufficient eligibility' }, { onSuccess: () => Toast.show({ type:'info', text1:'Loan rejected' }) })}>
                  <Text style={{ color: colors.error, fontSize: 11, fontWeight: '700' }}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
            {l.status === 'approved' && (
              <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.primaryMuted }]}
                onPress={() => reviewMut.mutate({ id: l._id, status: 'disbursed', note: 'Funds disbursed to wallet' }, { onSuccess: () => Toast.show({ type:'success', text1:'Loan disbursed!' }) })}>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Disburse</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </View>
  );
}

// ─── Ads Module ───────────────────────────────────────────────────────────────
const PLACEMENTS = ['feed', 'home', 'home_banner', 'search', 'category', 'profile'];
const AUDIENCES  = ['all', 'buyer', 'seller', 'rider'];

function CreateAdForm({ colors, onCreated }: any) {
  const [title, setTitle]   = useState('');
  const [subtitle, setSub]  = useState('');
  const [targetUrl, setUrl] = useState('');
  const [placement, setPlacement] = useState('feed');
  const [audienceRole, setAudienceRole] = useState('all');
  const [saving, setSaving] = useState(false);

  const submit = () => {
    if (!title.trim()) { Toast.show({ type: 'error', text1: 'Ad title is required' }); return; }
    setSaving(true);
    adminApi.createAd({ title: title.trim(), subtitle: subtitle.trim() || undefined, targetUrl: targetUrl.trim() || undefined, placement, audienceRole })
      .then(() => {
        Toast.show({ type: 'success', text1: 'Ad created', text2: 'It is now live in the selected placement.' });
        setTitle(''); setSub(''); setUrl(''); setPlacement('feed'); setAudienceRole('all');
        onCreated();
      })
      .catch((err: any) => Toast.show({ type: 'error', text1: 'Failed to create ad', text2: err?.response?.data?.message ?? err?.message }))
      .finally(() => setSaving(false));
  };

  return (
    <SectionCard title="Create Ad" colors={colors}>
      <TextInput placeholder="Ad title" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle}
        style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt ?? colors.surface }]} />
      <TextInput placeholder="Subtitle / description (optional)" placeholderTextColor={colors.textMuted} value={subtitle} onChangeText={setSub}
        style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt ?? colors.surface, marginTop: 8 }]} />
      <TextInput placeholder="Target URL / deep link (optional)" placeholderTextColor={colors.textMuted} value={targetUrl} onChangeText={setUrl}
        style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt ?? colors.surface, marginTop: 8 }]} />

      <Text style={[s.formLabel, { color: colors.textMuted }]}>Placement</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {PLACEMENTS.map(p => (
          <TouchableOpacity key={p} onPress={() => setPlacement(p)}
            style={[s.filterChip, { backgroundColor: placement === p ? colors.primary : colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: placement === p ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '700' }}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.formLabel, { color: colors.textMuted }]}>Audience</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {AUDIENCES.map(a => (
          <TouchableOpacity key={a} onPress={() => setAudienceRole(a)}
            style={[s.filterChip, { backgroundColor: audienceRole === a ? colors.primary : colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: audienceRole === a ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '700' }}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity disabled={saving} onPress={submit} style={[s.sendBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.sendBtnText}>Create Ad</Text>}
      </TouchableOpacity>
    </SectionCard>
  );
}

function AdsModule({ colors }: any) {
  const { data, isLoading, refetch } = useAdminAds();
  const ads = data?.ads ?? [];
  return (
    <View>
      <CreateAdForm colors={colors} onCreated={refetch} />
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : ads.length === 0 ? (
        <EmptyState icon="bullhorn-outline" text="No ads created yet" colors={colors} />
      ) : (
        ads.map((a: any) => (
          <View key={a._id} style={[s.disputeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.textPrimary }]}>{a.title}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]}>{a.placement} · {a.impressions} views · {a.clicks} clicks</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {a.status === 'active' ? (
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.error+'20' }]}
                  onPress={() => adminApi.updateAdStatus(a._id, 'paused').then(() => refetch())}>
                  <Text style={{ color: colors.error, fontSize: 11, fontWeight: '700' }}>Pause</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.success+'20' }]}
                  onPress={() => adminApi.updateAdStatus(a._id, 'active').then(() => refetch())}>
                  <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>Activate</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Community Moderation Module ─────────────────────────────────────────────
function CommunityModule({ colors }: any) {
  const { data, isLoading, refetch } = useAdminReported();
  const posts = data?.posts ?? [];
  return (
    <View>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : posts.length === 0 ? (
        <EmptyState icon="forum-outline" text="No reported posts" colors={colors} />
      ) : (
        posts.map((p: any) => (
          <View key={p._id} style={[s.disputeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.textPrimary }]}>{p.author?.name}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]} numberOfLines={2}>{p.content}</Text>
              <Text style={[s.userMeta, { color: colors.error }]}>{p.reportCount} reports</Text>
            </View>
            <View style={{ gap: 6 }}>
              {!p.isHidden ? (
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.error+'20' }]}
                  onPress={() => adminApi.hidePost(p._id, 'Multiple reports').then(() => refetch())}>
                  <Text style={{ color: colors.error, fontSize: 11, fontWeight: '700' }}>Hide</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.success+'20' }]}
                  onPress={() => adminApi.unhidePost(p._id).then(() => refetch())}>
                  <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>Unhide</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Broadcast Module ─────────────────────────────────────────────────────────
function BroadcastModule({ colors }: any) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);

  const handleSend = () => {
    if (!title.trim() || !message.trim()) { Toast.show({ type:'error', text1:'Title and message required' }); return; }
    setSending(true);
    adminApi.broadcast(title.trim(), message.trim(), role).then((r) => {
      Toast.show({ type:'success', text1: r.data.message });
      setTitle(''); setMessage('');
    }).catch((e) => Toast.show({ type:'error', text1: e?.response?.data?.message ?? 'Failed' })).finally(() => setSending(false));
  };

  return (
    <View>
      <SectionCard title="Send Broadcast Notification" colors={colors}>
        <Text style={[s.label, { color: colors.textMuted }]}>Title</Text>
        <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}
          value={title} onChangeText={setTitle} placeholder="e.g. New Feature Launch!" placeholderTextColor={colors.textMuted} />
        <Text style={[s.label, { color: colors.textMuted, marginTop: 12 }]}>Message</Text>
        <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border, minHeight: 90, textAlignVertical: 'top' }]}
          value={message} onChangeText={setMessage} placeholder="Write your message…" placeholderTextColor={colors.textMuted} multiline />
        <Text style={[s.label, { color: colors.textMuted, marginTop: 12 }]}>Audience</Text>
        <View style={s.filterRow}>
          {[{v:undefined,l:'Everyone'},{v:'buyer',l:'Buyers'},{v:'seller',l:'Sellers'},{v:'rider',l:'Riders'}].map((r,i) => (
            <TouchableOpacity key={i} style={[s.filterChip, { backgroundColor: role === r.v ? colors.primary : colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]} onPress={() => setRole(r.v)}>
              <Text style={{ color: role === r.v ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '700' }}>{r.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={[s.sendBtn, { backgroundColor: colors.primary, opacity: sending ? 0.7 : 1 }]} onPress={handleSend} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" /> : (
            <>
              <MaterialCommunityIcons name="send" size={16} color="#fff" />
              <Text style={s.sendBtnText}>Send Broadcast</Text>
            </>
          )}
        </TouchableOpacity>
      </SectionCard>
    </View>
  );
}

function SectionCard({ title, children, colors }: any) {
  return (
    <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[s.sectionCardTitle, { color: colors.textPrimary }]}>{title}</Text>
      {children}
    </View>
  );
}

function EmptyState({ icon, text, colors }: any) {
  return (
    <View style={s.emptyState}>
      <MaterialCommunityIcons name={icon} size={48} color={colors.textMuted} />
      <Text style={[s.emptyText, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.lg },
  modalCard: { borderRadius: Radius.xl, padding: Spacing.lg },
  modalTitle: { fontSize: FontSize.md, fontWeight: '800' },
  modalInput: { borderWidth: 1, borderRadius: Radius.lg, padding: 10, fontSize: 13, marginTop: 8, minHeight: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '900' },
  headerSub: { fontSize: 12, marginTop: 2 },
  logoutBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tabsScroll: { borderBottomWidth: 1 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  tabText: { fontSize: 12, fontWeight: '700' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  kpiCard: { width: '47%', borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 6 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: 18, fontWeight: '900' },
  kpiLabel: { fontSize: 11 },
  sectionCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  sectionCardTitle: { fontSize: 14, fontWeight: '800', marginBottom: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end', height: '100%' },
  chartBar: { width: '70%', borderRadius: 4, minHeight: 4 },
  chartLabel: { fontSize: 9 },
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  healthItem: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '48%', paddingVertical: 4 },
  healthDot: { width: 8, height: 8, borderRadius: 4 },
  healthLabel: { fontSize: 12, flex: 1 },
  healthStatus: { fontSize: 11, fontWeight: '700' },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  alertDot: { width: 8, height: 8, borderRadius: 4 },
  alertLabel: { flex: 1, fontSize: 13 },
  alertBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full, minWidth: 32, alignItems: 'center' },
  alertValue: { fontSize: 12, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, marginBottom: 8 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 13, fontWeight: '700' },
  userMeta: { fontSize: 11, marginTop: 1 },
  userBadges: { flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' },
  eligChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, marginBottom: 8 },
  kycCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, marginBottom: 8 },
  disputeCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, marginBottom: 8 },
  emptyState: { alignItems: 'center', padding: 40, gap: 10 },
  emptyText: { fontSize: 14 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: Radius.lg, padding: 12, fontSize: 14 },
  formLabel: { fontSize: 11, fontWeight: '700', marginTop: 4, marginBottom: 6, textTransform: 'uppercase' },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, marginTop: 12 },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  analyticsRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  analyticsLabel: { fontSize: 13, color: '#6B7280' },
  analyticsValue: { fontSize: 18, fontWeight: '800' as const, color: '#111827' },
});

// ─── Delivery Module (admin) ──────────────────────────────────────────────────
function DeliveryModule({ colors }: any) {
  const router = useRouter();
  const [config, setConfig]     = React.useState<any>(null);
  const [analytics, setAnalytics]= React.useState<any>(null);
  const [loading, setLoading]   = React.useState(true);
  const [perKmRate, setPerKmRate] = React.useState('');
  const [saving, setSaving]     = React.useState(false);

  React.useEffect(() => {
    const { deliveryPricingApi } = require('../../utils/api');
    Promise.all([
      deliveryPricingApi.adminConfig(),
      deliveryPricingApi.analytics(),
    ]).then(([cfg, an]: any) => {
      setConfig(cfg.data.config);
      setAnalytics(an.data.analytics);
      setPerKmRate(String(cfg.data.config?.defaultPerKmRate ?? 3000));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const quickUpdateRate = async () => {
    if (!perKmRate || isNaN(+perKmRate)) {
      Toast.show({ type: 'error', text1: 'Enter a valid rate' }); return;
    }
    setSaving(true);
    try {
      const { deliveryPricingApi } = require('../../utils/api');
      await deliveryPricingApi.updatePerKmRate(+perKmRate, 'Admin quick update');
      Toast.show({ type: 'success', text1: `✅ Rate updated to Le ${(+perKmRate).toLocaleString()}/km` });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Update failed' });
    } finally { setSaving(false); }
  };

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />;

  return (
    <View style={{ gap: Spacing.sm }}>
      {/* Quick rate editor */}
      <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[s.sectionCardTitle, { color: colors.textPrimary }]}>⚡ Quick Rate Update</Text>
        <Text style={[{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }]}>
          Current: Le {config?.defaultPerKmRate?.toLocaleString()}/km · Config v{config?.version}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 10, borderColor: colors.border, backgroundColor: colors.surfaceAlt ?? colors.background }]}>
            <Text style={[{ color: colors.textMuted, fontSize: 13, marginRight: 4 }]}>Le</Text>
            <TextInput
              style={[{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.textPrimary }]}
              value={perKmRate} onChangeText={setPerKmRate}
              keyboardType="numeric" selectTextOnFocus />
            <Text style={[{ color: colors.textMuted, fontSize: 12 }]}>/km</Text>
          </View>
          <TouchableOpacity
            style={[{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radius.lg, opacity: saving ? 0.7 : 1 }]}
            onPress={quickUpdateRate} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Update</Text>}
          </TouchableOpacity>
        </View>
        <Text style={[{ color: colors.textMuted, fontSize: 11, marginTop: 8 }]}>
          All riders will be notified of the rate change automatically.
        </Text>
      </View>

      {/* Live analytics */}
      {analytics && (
        <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.sectionCardTitle, { color: colors.textPrimary }]}>7-Day Delivery Stats</Text>
          {[
            ['Deliveries',    analytics.weeklyDeliveries],
            ['Revenue',       `Le ${(analytics.weeklyRevenue || 0).toLocaleString()}`],
            ['Avg Fee',       `Le ${(analytics.avgDeliveryFee || 0).toLocaleString()}`],
            ['Riders Online', analytics.availableRiders],
          ].map(([k, v]: any) => (
            <View key={k} style={[(s as any).analyticsRow, { borderBottomColor: colors.border }]}>
              <Text style={[(s as any).analyticsLabel, { color: colors.textMuted }]}>{k}</Text>
              <Text style={[(s as any).analyticsValue, { color: colors.textPrimary }]}>{v}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Full config button */}
      <TouchableOpacity
        style={[{ backgroundColor: colors.primaryMuted, borderRadius: Radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 }]}
        onPress={() => router.push('/delivery-pricing' as any)}>
        <MaterialCommunityIcons name="map-marker-distance" size={18} color={colors.primary} />
        <Text style={[{ color: colors.primary, fontWeight: '800', fontSize: 14 }]}>Open Full Delivery Pricing Engine</Text>
        <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Orders Module ────────────────────────────────────────────────────────────
function OrdersModule({ colors }: any) {
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const { status: statusParam } = useLocalSearchParams<{ status?: string }>();
  useEffect(() => { if (statusParam) setFilter(statusParam); }, [statusParam]);

  const { data, isLoading, refetch } = useAdminOrders({ status: filter, limit: 30 });
  const cancelMut = useForceCancelOrder();
  const refundMut = useForceRefundOrder();
  const orders = data?.orders ?? [];

  const STATUS_OPTIONS = [undefined,'pending','confirmed','preparing','awaiting_rider','in_transit','delivered','completed','disputed','cancelled'];

  const handleCancel = (o: any) => {
    Alert.alert('Force-Cancel Order', `Cancel order #${o.customOrderId}? The buyer and seller will be notified.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Force Cancel', style: 'destructive', onPress: () =>
        cancelMut.mutate({ id: o._id, reason: 'Cancelled by admin' }, {
          onSuccess: () => { Toast.show({ type:'info', text1:'Order cancelled' }); refetch(); },
          onError: (e: any) => Toast.show({ type:'error', text1: e?.response?.data?.message ?? 'Cancel failed' }),
        })
      },
    ]);
  };

  const handleRefund = (o: any) => {
    Alert.alert('Force-Refund Order', `Refund the full ${formatPrice(o.total)} to the buyer for order #${o.customOrderId}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Refund', style: 'destructive', onPress: () =>
        refundMut.mutate({ id: o._id, amount: o.total, reason: 'Admin-issued refund' }, {
          onSuccess: () => { Toast.show({ type:'success', text1:'Refund issued' }); refetch(); },
          onError: (e: any) => Toast.show({ type:'error', text1: e?.response?.data?.message ?? 'Refund failed' }),
        })
      },
    ]);
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: Spacing.sm }}>
        {STATUS_OPTIONS.map((f, i) => (
          <TouchableOpacity key={i}
            style={[s.filterChip, { backgroundColor: filter === f ? colors.primary : colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}
            onPress={() => setFilter(f)}>
            <Text style={{ color: filter === f ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '700' }}>{f ? f[0].toUpperCase()+f.slice(1).replace(/_/g,' ') : 'All'}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : orders.length === 0 ? (
        <EmptyState icon="truck-fast-outline" text="No orders match this filter" colors={colors} />
      ) : (
        orders.map((o: any) => (
          <View key={o._id} style={[s.disputeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.textPrimary }]}>#{o.customOrderId}</Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]} numberOfLines={1}>
                {o.buyer?.name ?? o.guestInfo?.name ?? 'Guest'} → {o.seller?.storeName ?? o.seller?.name}
              </Text>
              <Text style={[s.userMeta, { color: colors.textMuted }]}>{formatPrice(o.total)} · {timeAgo(o.createdAt)}</Text>
            </View>
            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              <View style={[s.statusBadge, { backgroundColor: colors.primaryMuted }]}>
                <Text style={{ color: colors.primary, fontSize: 10, fontWeight:'700' }}>{(o.status ?? '').replace(/_/g,' ')}</Text>
              </View>
              {!['cancelled','refunded','completed'].includes(o.status) && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.error+'20' }]} onPress={() => handleCancel(o)}>
                    <Text style={{ color: colors.error, fontSize: 11, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.smallBtn, { backgroundColor: '#F59E0B20' }]} onPress={() => handleRefund(o)}>
                    <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>Refund</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Financial Module ─────────────────────────────────────────────────────────
function FinancialModule({ colors }: any) {
  const { data, isLoading } = useAdminFinancial();
  const f = data?.summary ?? data ?? {};
  const ROWS = [
    { label: 'Total Revenue',      value: formatPrice(f.totalRevenue ?? 0),       icon: 'cash-multiple',      color: '#10B981' },
    { label: 'Platform Fees',      value: formatPrice(f.totalPlatformFee ?? 0),   icon: 'wallet-outline',     color: '#F59E0B' },
    { label: 'Delivery Fees',      value: formatPrice(f.totalDeliveryFee ?? 0),   icon: 'truck-fast-outline', color: '#4F46E5' },
    { label: 'Total Orders',       value: formatNumber(f.orderCount ?? 0),        icon: 'package-variant',    color: '#8B5CF6' },
    { label: 'Delivered Orders',   value: formatNumber(f.deliveredOrders ?? 0),   icon: 'check-circle-outline', color: '#22C55E' },
    { label: 'Cancelled Orders',   value: formatNumber(f.cancelledOrders ?? 0),   icon: 'close-circle-outline', color: '#EF4444' },
    { label: 'Guest Orders',       value: formatNumber(f.guestOrders ?? 0),       icon: 'account-question-outline', color: '#06B6D4' },
  ];

  if (isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  return (
    <View>
      <SectionCard title="Platform Financial Summary" colors={colors}>
        {ROWS.map(r => (
          <View key={r.label} style={[s.alertRow, { borderBottomColor: colors.border }]}>
            <MaterialCommunityIcons name={r.icon as any} size={18} color={r.color} style={{ marginRight: 8 }} />
            <Text style={[s.alertLabel, { color: colors.textPrimary }]}>{r.label}</Text>
            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 14 }}>{r.value}</Text>
          </View>
        ))}
      </SectionCard>
    </View>
  );
}

// ─── System Health Module ─────────────────────────────────────────────────────
function HealthModule({ colors }: any) {
  const { data, isLoading } = useAdminSystemHealth();
  const STATUS_KEYS = ['api', 'database', 'queue', 'payments', 'email'];
  const statusEntries = STATUS_KEYS.filter(k => data?.[k] !== undefined).map(k => [k, data[k]]);

  if (isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  return (
    <View>
      <SectionCard title="System Health" colors={colors}>
        {statusEntries.length === 0 ? (
          <EmptyState icon="heart-pulse" text="No health data available" colors={colors} />
        ) : statusEntries.map(([k, v]: any) => (
          <View key={k} style={[s.alertRow, { borderBottomColor: colors.border }]}>
            <View style={[s.healthDot, { backgroundColor: v === 'healthy' ? colors.success : colors.error, marginRight: 10 }]} />
            <Text style={[s.alertLabel, { color: colors.textPrimary }]}>{k[0].toUpperCase() + k.slice(1)}</Text>
            <Text style={{ color: v === 'healthy' ? colors.success : colors.error, fontWeight: '700', fontSize: 13 }}>{String(v)}</Text>
          </View>
        ))}
      </SectionCard>
      {(data?.uptime !== undefined || data?.memoryMB !== undefined) && (
        <SectionCard title="Server Stats" colors={colors}>
          {data?.uptime !== undefined && (
            <View style={[s.alertRow, { borderBottomColor: colors.border }]}>
              <Text style={[s.alertLabel, { color: colors.textPrimary }]}>Uptime</Text>
              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 13 }}>{Math.floor(data.uptime / 3600)}h {Math.floor((data.uptime % 3600) / 60)}m</Text>
            </View>
          )}
          {data?.memoryMB !== undefined && (
            <View style={[s.alertRow, { borderBottomColor: colors.border }]}>
              <Text style={[s.alertLabel, { color: colors.textPrimary }]}>Memory used</Text>
              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 13 }}>{data.memoryMB} MB</Text>
            </View>
          )}
        </SectionCard>
      )}
    </View>
  );
}

// ─── Escrow Module ────────────────────────────────────────────────────────────
function EscrowModule({ colors }: any) {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.escrow();
      setData(res.data);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Failed to load escrow' });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleVerify = (orderId: string, orderRef: string) => {
    Alert.alert(
      'Verify Payment',
      `Confirm the buyer's payment for order #${orderRef} actually reached the platform?\n\nThis doesn't pay the seller — that happens automatically once the order is delivered. It only unlocks the order to be marked delivered.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify', onPress: async () => {
            setActionLoading(orderId);
            try {
              await adminApi.verifyEscrowPayment(orderId);
              Toast.show({ type: 'success', text1: 'Payment verified' });
              load();
            } catch (e: any) {
              Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Verification failed' });
            } finally { setActionLoading(null); }
          },
        },
      ]
    );
  };

  const handleRefund = (orderId: string, orderRef: string) => {
    Alert.alert('Refund Buyer', `Refund the buyer for order #${orderRef}? Only use this before the order is delivered — once delivered, use dispute resolution instead.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Refund', style: 'destructive', onPress: async () => {
          setActionLoading(orderId);
          try {
            await adminApi.refundEscrow(orderId, 'Admin refund');
            Toast.show({ type: 'success', text1: 'Refund processed' });
            load();
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Refund failed' });
          } finally { setActionLoading(null); }
        },
      },
    ]);
  };

  const held = data?.held ?? data?.orders ?? [];
  const verifiedAwaitingDelivery = data?.verifiedAwaitingDelivery ?? [];
  const total = data?.totalHeld ?? held.reduce((s: number, o: any) => s + (o.total ?? 0), 0);

  return (
    <View>
      <View style={[{ backgroundColor: '#D9770618', borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#D9770640' }]}>
        <Text style={[{ color: colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' }]}>AWAITING VERIFICATION</Text>
        <Text style={[{ color: '#D97706', fontSize: 26, fontWeight: '800', marginTop: 4 }]}>{formatPrice(total)}</Text>
        <Text style={[{ color: colors.textMuted, fontSize: FontSize.xs, marginTop: 2 }]}>{held.length} order(s) need payment verified before they can be delivered</Text>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : held.length === 0 ? (
        <View style={[{ backgroundColor: colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: colors.border, padding: Spacing.xl, alignItems: 'center', gap: 8 }]}>
          <MaterialCommunityIcons name="shield-check-outline" size={36} color={colors.textMuted} />
          <Text style={[{ color: colors.textPrimary, fontWeight: '700', fontSize: FontSize.md }]}>No pending escrow</Text>
          <Text style={[{ color: colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' }]}>All orders have been settled.</Text>
        </View>
      ) : held.map((order: any) => (
        <View key={order._id} style={[{ backgroundColor: colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: colors.border, padding: Spacing.md, marginBottom: Spacing.sm }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: colors.textPrimary, fontWeight: '700', fontSize: FontSize.sm }]}>
                Order #{order.customOrderId ?? order._id?.slice(-6)}
              </Text>
              <Text style={[{ color: colors.textMuted, fontSize: FontSize.xs, marginTop: 2 }]}>
                {order.buyer?.name ?? 'Buyer'} → {order.seller?.storeName ?? 'Seller'}
              </Text>
            </View>
            <Text style={[{ color: '#D97706', fontWeight: '800', fontSize: FontSize.md }]}>
              {formatPrice(order.total ?? 0)}
            </Text>
          </View>
          <Text style={[{ color: colors.textMuted, fontSize: FontSize.xs, marginBottom: 10 }]}>
            Status: <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{(order.status ?? '').replace(/_/g, ' ')}</Text>
            {order.createdAt ? `  ·  ${timeAgo(order.createdAt)}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[{ flex: 1, backgroundColor: '#EF444418', borderRadius: Radius.lg, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#EF444440' }]}
              onPress={() => handleRefund(order._id, order.customOrderId ?? order._id?.slice(-6))}
              disabled={actionLoading === order._id}
            >
              {actionLoading === order._id
                ? <ActivityIndicator size="small" color="#EF4444" />
                : <Text style={[{ color: '#EF4444', fontWeight: '700', fontSize: FontSize.sm }]}>Refund buyer</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[{ flex: 1, backgroundColor: '#10B98118', borderRadius: Radius.lg, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#10B98140' }]}
              onPress={() => handleVerify(order._id, order.customOrderId ?? order._id?.slice(-6))}
              disabled={actionLoading === order._id}
            >
              {actionLoading === order._id
                ? <ActivityIndicator size="small" color="#10B981" />
                : <Text style={[{ color: '#10B981', fontWeight: '700', fontSize: FontSize.sm }]}>Verify payment</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {verifiedAwaitingDelivery.length > 0 && (
        <>
          <Text style={[{ color: colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', marginTop: Spacing.lg, marginBottom: 8, textTransform: 'uppercase' }]}>
            Verified — awaiting delivery ({verifiedAwaitingDelivery.length})
          </Text>
          {verifiedAwaitingDelivery.map((order: any) => (
            <View key={order._id} style={[{ backgroundColor: colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.md, marginBottom: Spacing.sm, opacity: 0.7 }]}>
              <Text style={[{ color: colors.textPrimary, fontWeight: '700', fontSize: FontSize.sm }]}>
                Order #{order.customOrderId ?? order._id?.slice(-6)}
              </Text>
              <Text style={[{ color: colors.textMuted, fontSize: FontSize.xs, marginTop: 2 }]}>
                {order.buyer?.name ?? 'Buyer'} → {order.seller?.storeName ?? 'Seller'} · {formatPrice(order.total ?? 0)} · seller paid automatically on delivery
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
