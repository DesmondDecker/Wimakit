import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, RefreshControl, Share,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize, Shadow, SCREEN_WIDTH } from '../../constants/theme';
import { useAuthStore } from '../../store';
import { useSellerProducts, useDeleteProduct, useWallet } from '../../hooks/useApi';
import { formatPrice, formatNumber } from '../../constants/data';
import { getCategoryConfig } from '../../constants/categories';

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS: Record<string, { color:string; label:string; bg:string }> = {
  approved:           { color:'#10B981', label:'Live',        bg:'#ECFDF5' },
  pending_moderation: { color:'#F59E0B', label:'Pending',     bg:'#FFFBEB' },
  rejected:           { color:'#EF4444', label:'Rejected',    bg:'#FEF2F2' },
  out_of_stock:       { color:'#EF4444', label:'Out of Stock',bg:'#FEF2F2' },
  draft:              { color:'#6B7280', label:'Draft',       bg:'#F3F4F6' },
  archived:           { color:'#6B7280', label:'Archived',    bg:'#F3F4F6' },
  hidden:             { color:'#6B7280', label:'Hidden',      bg:'#F3F4F6' },
  flagged:            { color:'#EF4444', label:'Flagged',     bg:'#FEF2F2' },
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, colors }: any) {
  return (
    <View style={[sc.card, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}>
      <View style={[sc.iconWrap, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
      </View>
      <Text style={[sc.value, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[sc.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card:     { flex:1, borderRadius: Radius.lg, borderWidth:1, padding:12, alignItems:'center', gap:5 },
  iconWrap: { width:32, height:32, borderRadius:10, alignItems:'center', justifyContent:'center' },
  value:    { fontSize:18, fontWeight:'900' },
  label:    { fontSize:10, fontWeight:'700', textAlign:'center' },
});

// ─── Product row card ─────────────────────────────────────────────────────────
function ProductRow({ product: p, onDelete, onEdit, colors }: any) {
  const stat = STATUS[p.status] ?? STATUS.draft;
  const cat  = getCategoryConfig(p.category?.slug ?? p.category);
  return (
    <View style={[pr.row, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}>
      <Image source={{ uri: p.images?.[0] }} style={pr.img} contentFit="cover" />
      <View style={{ flex:1 }}>
        <Text style={[pr.name, { color: colors.textPrimary }]} numberOfLines={1}>{p.name}</Text>
        <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginTop:3 }}>
          <Text style={[pr.price, { color:'#4F46E5' }]}>{formatPrice(p.price)}</Text>
          {p.originalPrice > p.price && (
            <Text style={[pr.original, { color: colors.textMuted }]}>{formatPrice(p.originalPrice)}</Text>
          )}
        </View>
        <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginTop:5, flexWrap:'wrap' }}>
          <View style={[pr.badge, { backgroundColor: stat.bg }]}>
            <Text style={[pr.badgeText, { color: stat.color }]}>{stat.label}</Text>
          </View>
          <Text style={[pr.meta, { color: colors.textMuted }]}>Stock: {p.stock}</Text>
          {p.isTrending && <Text style={{ fontSize:12 }}>🔥</Text>}
          {p.bnplEligible && <Text style={{ fontSize:12 }}>📅</Text>}
          {cat && <Text style={{ fontSize:12 }}>{cat.emoji}</Text>}
        </View>
      </View>
      <TouchableOpacity
        style={pr.menuBtn}
        onPress={() => Alert.alert('Manage Product', p.name, [
          { text:'Cancel', style:'cancel' },
          { text:'Delete', style:'destructive', onPress: onDelete },
        ])}
      >
        <MaterialCommunityIcons name="dots-vertical" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
const pr = StyleSheet.create({
  row:      { flexDirection:'row', alignItems:'center', gap:12, borderRadius: Radius.lg, borderWidth:1, padding: Spacing.sm, marginBottom:10 },
  img:      { width:62, height:62, borderRadius: Radius.md },
  name:     { fontSize:13, fontWeight:'700' },
  price:    { fontSize:14, fontWeight:'900' },
  original: { fontSize:12, textDecorationLine:'line-through' },
  badge:    { paddingHorizontal:8, paddingVertical:3, borderRadius: Radius.full },
  badgeText:{ fontSize:10, fontWeight:'800' },
  meta:     { fontSize:11, fontWeight:'600' },
  menuBtn:  { padding:4 },
});

// ─── Pending / Rejected / No Access states ────────────────────────────────────
function StatusGate({ storeStatus, storeName, user, colors, router }: any) {
  if (storeStatus === 'rejected') {
    return (
      <View style={[gate.wrap, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#FEF2F2','#FECACA']} style={gate.illustrationBg} start={{x:0,y:0}} end={{x:1,y:1}}>
          <Text style={{ fontSize:60 }}>🚫</Text>
        </LinearGradient>
        <Text style={[gate.title, { color: colors.textPrimary }]}>Application Rejected</Text>
        <Text style={[gate.sub, { color: colors.textMuted }]}>
          Your store application wasn't approved this time. Contact WimaKit support or re-apply with more details.
        </Text>
        <TouchableOpacity style={[gate.btn, { backgroundColor: colors.primary }]} onPress={() => router.push('/seller/store-setup')}>
          <Text style={gate.btnText}>Update & Re-apply</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!storeStatus || storeStatus === 'draft' || storeStatus === 'pending_review') {
    return (
      <View style={[gate.wrap, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#EEF2FF','#DDD6FE']} style={gate.illustrationBg} start={{x:0,y:0}} end={{x:1,y:1}}>
          <Text style={{ fontSize:60 }}>⏳</Text>
        </LinearGradient>
        <View style={[gate.chip, { backgroundColor:'#F59E0B18' }]}>
          <View style={[gate.chipDot, { backgroundColor:'#F59E0B' }]} />
          <Text style={[gate.chipText, { color:'#F59E0B' }]}>Under Review</Text>
        </View>
        <Text style={[gate.title, { color: colors.textPrimary }]}>
          {storeName ? `${storeName} is being reviewed` : 'Store Under Review'}
        </Text>
        <Text style={[gate.sub, { color: colors.textMuted }]}>
          Our team reviews every new seller to protect buyers. This usually takes 24–48 hours. We'll notify you the moment you're approved.
        </Text>
        <View style={[gate.checkList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { done: true,  text:'Application submitted' },
            { done: false, text:'Admin review in progress' },
            { done: false, text:'Store goes live' },
          ].map((item, i) => (
            <View key={i} style={gate.checkRow}>
              <View style={[gate.checkIcon, {
                backgroundColor: item.done ? '#10B981' : colors.border,
              }]}>
                <MaterialCommunityIcons name={item.done ? 'check' : 'dots-horizontal'} size={12} color="#fff" />
              </View>
              <Text style={[gate.checkText, { color: item.done ? '#10B981' : colors.textMuted }]}>{item.text}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={[gate.btn, { backgroundColor: colors.surface, borderWidth:1.5, borderColor: colors.border }]}
          onPress={() => router.push('/seller/store-setup')}>
          <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.textPrimary} />
          <Text style={[gate.btnText, { color: colors.textPrimary }]}>Edit Store Info</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}
const gate = StyleSheet.create({
  wrap:          { flex:1, padding: Spacing.xl, alignItems:'center', justifyContent:'center', gap: Spacing.lg },
  illustrationBg:{ width:140, height:140, borderRadius:70, alignItems:'center', justifyContent:'center', marginBottom: Spacing.md },
  chip:          { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:12, paddingVertical:5, borderRadius: Radius.full },
  chipDot:       { width:7, height:7, borderRadius:4 },
  chipText:      { fontSize:12, fontWeight:'800' },
  title:         { fontSize: FontSize.xl, fontWeight:'900', textAlign:'center' },
  sub:           { fontSize:13, lineHeight:20, textAlign:'center' },
  checkList:     { width:'100%', borderRadius: Radius.xl, borderWidth:1, padding: Spacing.md, gap:12 },
  checkRow:      { flexDirection:'row', alignItems:'center', gap:12 },
  checkIcon:     { width:22, height:22, borderRadius:11, alignItems:'center', justifyContent:'center' },
  checkText:     { fontSize:13, fontWeight:'700' },
  btn:           { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:24, paddingVertical:13, borderRadius: Radius.xl },
  btnText:       { fontSize:14, fontWeight:'800', color:'#fff' },
});

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function SellerDashboard() {
  const { colors }  = useTheme();
  const router      = useRouter();
  const user        = useAuthStore(s => s.user);
  const [filter,    setFilter]    = useState<string | undefined>(undefined);
  const [refreshing,setRefreshing]= useState(false);

  const { data, isLoading, refetch } = useSellerProducts({ status: filter, limit: 50 });
  const { data: walletData, refetch: refetchWallet } = useWallet();
  const deleteMut = useDeleteProduct();

  const products = data?.products ?? [];
  const wallet   = walletData?.wallet ?? walletData;

  const stats = {
    total:    products.length,
    approved: products.filter((p: any) => p.status === 'approved').length,
    pending:  products.filter((p: any) => p.status === 'pending_moderation').length,
    revenue:  formatPrice(user?.totalSales ?? 0, true),
    trending: products.filter((p: any) => p.isTrending).length,
    sold:     products.reduce((s: number, p: any) => s + (p.totalSold ?? 0), 0),
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchWallet()]);
    setRefreshing(false);
  }, [refetch, refetchWallet]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${user?.storeName ?? 'my store'} on WimaKit — Sierra Leone's #1 marketplace! 🛒`,
      });
    } catch {}
  };

  // Not yet approved — show gate screen
  if (user?.storeStatus !== 'approved') {
    return (
      <SafeAreaView style={[{ flex:1, backgroundColor: colors.background }]} edges={['top']}>
        {/* Minimal header */}
        <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>My Store</Text>
          <TouchableOpacity onPress={() => router.push('/seller/store-setup' as any)}>
            <MaterialCommunityIcons name="pencil-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <StatusGate
          storeStatus={user?.storeStatus}
          storeName={user?.storeName}
          user={user} colors={colors} router={router}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        contentContainerStyle={{ paddingBottom: 110 }}
        stickyHeaderIndices={[1]}
      >
        {/* ── STORE HERO ──────────────────────────────────────── */}
        <View>
          {/* Banner */}
          <View style={s.bannerWrap}>
            {user?.storeBanner
              ? <Image source={{ uri: user.storeBanner }} style={StyleSheet.absoluteFill} contentFit="cover" />
              : <LinearGradient colors={['#4F46E5','#7C3AED','#EC4899']} style={StyleSheet.absoluteFill} start={{x:0,y:0}} end={{x:1,y:1}} />
            }
            {/* Overlay gradient */}
            <LinearGradient
              colors={['rgba(0,0,0,0.08)','rgba(0,0,0,0.52)']}
              style={StyleSheet.absoluteFill}
              start={{x:0,y:0}} end={{x:0,y:1}}
            />

            {/* Top bar buttons */}
            <View style={s.bannerTopRow}>
              <TouchableOpacity style={[s.bannerBtn, { backgroundColor:'rgba(0,0,0,0.38)' }]} onPress={handleShare}>
                <MaterialCommunityIcons name="share-variant-outline" size={17} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[s.bannerBtn, { backgroundColor:'rgba(0,0,0,0.38)' }]} onPress={() => router.push('/seller/store-setup' as any)}>
                <MaterialCommunityIcons name="pencil-outline" size={17} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[s.bannerBtn, { backgroundColor:'rgba(0,0,0,0.38)' }]} onPress={() => router.push('/wallet' as any)}>
                <MaterialCommunityIcons name="wallet-outline" size={17} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Store identity at bottom of banner */}
            <View style={s.bannerBottom}>
              <View style={[s.logoWrap, { borderColor: colors.surface }]}>
                {user?.avatar
                  ? <Image source={{ uri: user.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  : <LinearGradient colors={['#4F46E5','#EC4899']} style={StyleSheet.absoluteFill}>
                      <Text style={s.logoInitial}>{(user?.storeName || user?.name || 'S')[0]?.toUpperCase()}</Text>
                    </LinearGradient>
                }
              </View>
              <View style={{ flex:1 }}>
                <View style={s.storeNameRow}>
                  <Text style={s.storeName} numberOfLines={1}>{user?.storeName ?? user?.name}</Text>
                  {user?.isVerified && (
                    <MaterialCommunityIcons name="check-decagram" size={17} color="#60A5FA" />
                  )}
                </View>
                <View style={s.storeMetaRow}>
                  <View style={[s.liveChip]}>
                    <View style={[s.liveDot, { backgroundColor:'#10B981' }]} />
                    <Text style={s.liveText}>Active Store</Text>
                  </View>
                  {user?.rating && (
                    <View style={s.ratingRow}>
                      <Text style={s.starText}>★ {user.rating.toFixed(1)}</Text>
                    </View>
                  )}
                  {user?.isTrending && (
                    <View style={s.trendChip}>
                      <Text style={s.trendText}>🔥 Trending</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>

          {/* Store description & meta */}
          <View style={[s.storeAbout, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {user?.storeDescription ? (
              <Text style={[s.storeDesc, { color: colors.textSecondary }]} numberOfLines={3}>
                {user.storeDescription}
              </Text>
            ) : (
              <TouchableOpacity onPress={() => router.push('/seller/store-setup' as any)}>
                <Text style={[s.storeDescEmpty, { color: colors.primary }]}>
                  ✏️ Add your store description — tell buyers what you're about
                </Text>
              </TouchableOpacity>
            )}
            <View style={s.aboutMetaRow}>
              {user?.location && (
                <View style={s.aboutMeta}>
                  <MaterialCommunityIcons name="map-marker-outline" size={12} color={colors.textMuted} />
                  <Text style={[s.aboutMetaText, { color: colors.textMuted }]}>{user.location}</Text>
                </View>
              )}
              <View style={s.aboutMeta}>
                <MaterialCommunityIcons name="package-variant-closed" size={12} color={colors.textMuted} />
                <Text style={[s.aboutMetaText, { color: colors.textMuted }]}>{stats.total} Products</Text>
              </View>
              <View style={s.aboutMeta}>
                <MaterialCommunityIcons name="account-group-outline" size={12} color={colors.textMuted} />
                <Text style={[s.aboutMetaText, { color: colors.textMuted }]}>{formatNumber(user?.followersCount ?? 0)} Followers</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── STICKY QUICK ACTIONS ─────────────────────────────── */}
        <View style={[s.quickBar, { backgroundColor: colors.background }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm }}>
            <TouchableOpacity style={[s.qBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/seller/add-product' as any)}>
              <MaterialCommunityIcons name="plus" size={15} color="#fff" />
              <Text style={s.qBtnText}>Add Product</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.qBtnOutline, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => router.push('/orders' as any)}>
              <MaterialCommunityIcons name="package-variant-closed" size={15} color={colors.textPrimary} />
              <Text style={[s.qBtnOutlineText, { color: colors.textPrimary }]}>Orders</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.qBtnOutline, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => router.push('/wallet' as any)}>
              <MaterialCommunityIcons name="wallet-outline" size={15} color={colors.textPrimary} />
              <Text style={[s.qBtnOutlineText, { color: colors.textPrimary }]}>Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.qBtnOutline, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => router.push('/seller/store-setup' as any)}>
              <MaterialCommunityIcons name="store-edit-outline" size={15} color={colors.textPrimary} />
              <Text style={[s.qBtnOutlineText, { color: colors.textPrimary }]}>Edit Store</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        <View style={{ padding: Spacing.lg, gap: Spacing.lg }}>

          {/* ── WALLET CARD ──────────────────────────────────────── */}
          <LinearGradient colors={['#4F46E5','#7C3AED']} style={s.walletCard} start={{x:0,y:0}} end={{x:1,y:1}}>
            <View style={s.walletTop}>
              <View>
                <Text style={s.walletLabel}>Wallet Balance</Text>
                <Text style={s.walletValue}>{formatPrice(wallet?.balance ?? 0)}</Text>
              </View>
              <TouchableOpacity style={[s.walletWithdrawBtn]} onPress={() => router.push('/wallet' as any)}>
                <MaterialCommunityIcons name="bank-transfer-out" size={14} color="#fff" />
                <Text style={s.walletWithdrawText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
            <View style={s.walletGrid}>
              {[
                { label:'Pending',    value: formatPrice(wallet?.pendingBalance ?? 0, true) },
                { label:'Total Sales',value: formatPrice(user?.totalSales ?? 0, true) },
                { label:'Items Sold', value: formatNumber(stats.sold) },
              ].map(w => (
                <View key={w.label} style={s.walletCell}>
                  <Text style={s.walletCellValue}>{w.value}</Text>
                  <Text style={s.walletCellLabel}>{w.label}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>

          {/* ── STATS GRID ───────────────────────────────────────── */}
          <View style={s.statsRow}>
            <StatCard icon="package-variant"       value={stats.total}    label="Products"  color="#4F46E5" colors={colors} />
            <StatCard icon="check-circle-outline"  value={stats.approved} label="Live"      color="#10B981" colors={colors} />
            <StatCard icon="clock-outline"         value={stats.pending}  label="Pending"   color="#F59E0B" colors={colors} />
            <StatCard icon="fire"                  value={stats.trending} label="Trending"  color="#EC4899" colors={colors} />
          </View>

          {/* ── EMPTY PROMO ──────────────────────────────────────── */}
          {stats.total === 0 && (
            <View style={[s.emptyPromo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <LinearGradient colors={['#EEF2FF','#F5F3FF']} style={s.emptyPromoIllustration} start={{x:0,y:0}} end={{x:1,y:1}}>
                <Text style={{ fontSize: 48 }}>🛍️</Text>
              </LinearGradient>
              <Text style={[s.emptyPromoTitle, { color: colors.textPrimary }]}>Your store is live — start selling!</Text>
              <Text style={[s.emptyPromoSub, { color: colors.textMuted }]}>
                List your first product across 14 categories. Buyers across Sierra Leone are already waiting.
              </Text>
              <TouchableOpacity style={[s.emptyPromoBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/seller/add-product' as any)}>
                <MaterialCommunityIcons name="plus-circle-outline" size={17} color="#fff" />
                <Text style={s.emptyPromoBtnText}>List Your First Product</Text>
              </TouchableOpacity>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8 }}>
                {['fashion','electronics','food','agric','beauty','shoes'].map(slug => {
                  const cat = getCategoryConfig(slug);
                  if (!cat) return null;
                  return (
                    <View key={slug} style={[s.catChip, { backgroundColor: cat.color + '15' }]}>
                      <Text style={{ fontSize:14 }}>{cat.emoji}</Text>
                      <Text style={[s.catChipText, { color: cat.color }]}>{cat.name}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* ── PRODUCTS ─────────────────────────────────────────── */}
          {stats.total > 0 && (
            <View>
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>My Products</Text>
                {stats.approved > 0 && (
                  <View style={[s.liveCountBadge, { backgroundColor:'#ECFDF5' }]}>
                    <View style={[s.liveDot, { backgroundColor:'#10B981', width:6, height:6 }]} />
                    <Text style={[s.liveCountText, { color:'#10B981' }]}>{stats.approved} Live</Text>
                  </View>
                )}
              </View>

              {/* Filter chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, paddingVertical: Spacing.sm }}>
                {[
                  { v:undefined,          l:'All',          count: stats.total },
                  { v:'approved',         l:'Live',         count: stats.approved },
                  { v:'pending_moderation',l:'Pending',     count: stats.pending },
                  { v:'rejected',         l:'Rejected',     count: undefined },
                  { v:'out_of_stock',     l:'Out of Stock', count: undefined },
                ].map((f, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.filterChip, {
                      backgroundColor: filter === f.v ? colors.primary : colors.surface,
                      borderColor:     filter === f.v ? colors.primary : colors.border,
                    }]}
                    onPress={() => setFilter(f.v)}
                  >
                    <Text style={[s.filterChipText, { color: filter === f.v ? '#fff' : colors.textMuted }]}>{f.l}</Text>
                    {f.count !== undefined && (
                      <View style={[s.filterCount, { backgroundColor: filter === f.v ? 'rgba(255,255,255,0.25)' : colors.border }]}>
                        <Text style={[s.filterCountText, { color: filter === f.v ? '#fff' : colors.textMuted }]}>{f.count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {isLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
              ) : products.length === 0 ? (
                <View style={[s.emptyFilter, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="package-variant-closed" size={36} color={colors.textMuted} />
                  <Text style={[s.emptyFilterText, { color: colors.textMuted }]}>
                    No {filter?.replace('_',' ') ?? ''} products
                  </Text>
                </View>
              ) : (
                products.map((p: any) => (
                  <ProductRow
                    key={p._id}
                    product={p}
                    colors={colors}
                    onDelete={() => deleteMut.mutate(p._id, {
                      onSuccess: () => Toast.show({ type:'success', text1:'Product deleted' }),
                    })}
                  />
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={[s.fab, { backgroundColor: colors.primary }, Shadow.lg]} onPress={() => router.push('/seller/add-product' as any)}>
        <MaterialCommunityIcons name="plus" size={26} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:   { flex:1 },
  header: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal: Spacing.lg, paddingVertical:14, borderBottomWidth:1 },
  headerTitle: { fontSize: FontSize.lg, fontWeight:'900' },

  // Banner
  bannerWrap:   { height:200, position:'relative' },
  bannerTopRow: { position:'absolute', top: Spacing.lg, right: Spacing.md, flexDirection:'row', gap:8 },
  bannerBtn:    { width:34, height:34, borderRadius:17, alignItems:'center', justifyContent:'center' },
  bannerBottom: { position:'absolute', bottom:0, left: Spacing.lg, right: Spacing.lg, flexDirection:'row', alignItems:'flex-end', gap:12, paddingBottom:14 },

  logoWrap:    { width:68, height:68, borderRadius:34, borderWidth:3, overflow:'hidden', alignItems:'center', justifyContent:'center' },
  logoInitial: { color:'#fff', fontSize:26, fontWeight:'900' },

  storeName:     { color:'#fff', fontSize: FontSize.lg, fontWeight:'900' },
  storeNameRow:  { flexDirection:'row', alignItems:'center', gap:6 },
  storeMetaRow:  { flexDirection:'row', alignItems:'center', gap:8, marginTop:4, flexWrap:'wrap' },
  liveChip:      { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'rgba(16,185,129,0.22)', paddingHorizontal:8, paddingVertical:3, borderRadius: Radius.full },
  liveDot:       { width:7, height:7, borderRadius:4 },
  liveText:      { color:'#fff', fontSize:10, fontWeight:'800' },
  ratingRow:     { backgroundColor:'rgba(245,158,11,0.22)', paddingHorizontal:8, paddingVertical:3, borderRadius: Radius.full },
  starText:      { color:'#FDE68A', fontSize:10, fontWeight:'800' },
  trendChip:     { backgroundColor:'rgba(239,68,68,0.22)', paddingHorizontal:8, paddingVertical:3, borderRadius: Radius.full },
  trendText:     { color:'#fff', fontSize:10, fontWeight:'800' },

  storeAbout:   { borderBottomWidth:1, padding: Spacing.lg, gap: Spacing.sm },
  storeDesc:    { fontSize:13, lineHeight:20 },
  storeDescEmpty:{ fontSize:13, fontWeight:'600' },
  aboutMetaRow: { flexDirection:'row', flexWrap:'wrap', gap:12 },
  aboutMeta:    { flexDirection:'row', alignItems:'center', gap:4 },
  aboutMetaText:{ fontSize:11, fontWeight:'600' },

  // Quick actions bar
  quickBar: { paddingTop: Spacing.xs, borderBottomWidth:0 },
  qBtn:     { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:16, paddingVertical:9, borderRadius: Radius.full },
  qBtnText: { color:'#fff', fontSize:13, fontWeight:'800' },
  qBtnOutline:     { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:14, paddingVertical:9, borderRadius: Radius.full, borderWidth:1 },
  qBtnOutlineText: { fontSize:13, fontWeight:'700' },

  // Wallet card
  walletCard: { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.md },
  walletTop:  { flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between' },
  walletLabel:{ color:'rgba(255,255,255,0.8)', fontSize:12, fontWeight:'600' },
  walletValue:{ color:'#fff', fontSize:28, fontWeight:'900', marginTop:4 },
  walletWithdrawBtn: { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'rgba(255,255,255,0.18)', paddingHorizontal:12, paddingVertical:7, borderRadius: Radius.full },
  walletWithdrawText:{ color:'#fff', fontSize:12, fontWeight:'800' },
  walletGrid: { flexDirection:'row', borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.2)', paddingTop: Spacing.md, gap:4 },
  walletCell: { flex:1, alignItems:'center' },
  walletCellValue:{ color:'#fff', fontSize:14, fontWeight:'900' },
  walletCellLabel:{ color:'rgba(255,255,255,0.7)', fontSize:10, marginTop:2 },

  // Stats
  statsRow: { flexDirection:'row', gap:8 },

  // Empty promo
  emptyPromo:          { borderRadius: Radius.xl, borderWidth:1, padding: Spacing.lg, alignItems:'center', gap: Spacing.md },
  emptyPromoIllustration:{ width:100, height:100, borderRadius:50, alignItems:'center', justifyContent:'center' },
  emptyPromoTitle:     { fontSize: FontSize.md, fontWeight:'900', textAlign:'center' },
  emptyPromoSub:       { fontSize:13, textAlign:'center', lineHeight:19 },
  emptyPromoBtn:       { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:20, paddingVertical:12, borderRadius: Radius.xl },
  emptyPromoBtnText:   { color:'#fff', fontSize:14, fontWeight:'800' },
  catChip:             { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:10, paddingVertical:6, borderRadius: Radius.full },
  catChipText:         { fontSize:11, fontWeight:'700' },

  // Products section
  sectionHeader:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: Spacing.sm },
  sectionTitle:    { fontSize: FontSize.md, fontWeight:'900' },
  liveCountBadge:  { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:10, paddingVertical:4, borderRadius: Radius.full },
  liveCountText:   { fontSize:11, fontWeight:'800' },

  filterChip:      { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:12, paddingVertical:7, borderRadius: Radius.full, borderWidth:1 },
  filterChipText:  { fontSize:12, fontWeight:'800' },
  filterCount:     { paddingHorizontal:7, paddingVertical:2, borderRadius: Radius.full },
  filterCountText: { fontSize:10, fontWeight:'800' },

  emptyFilter:     { alignItems:'center', padding:32, borderRadius: Radius.xl, borderWidth:1, gap:10, marginTop: Spacing.md },
  emptyFilterText: { fontSize:14, fontWeight:'600' },

  fab:  { position:'absolute', bottom:24, right:24, width:58, height:58, borderRadius:29, alignItems:'center', justifyContent:'center' },
});
