import React, { useCallback, useMemo, memo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, RefreshControl, Dimensions, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore, useCartStore } from '../../store';
import { 
  useFeaturedProducts, 
  useProducts, 
  useCategories, 
  useSuggestions,
  useFollowProfile,
  useUnfollowProfile,
  useFollowingProducts,
  useRecommendedSellers,
} from '../../hooks/useApi';
import { formatPrice, MOCK_CATEGORIES, getCategoryColor } from '../../constants/data';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { ProductCard } from '../../components/product/ProductCard';
import {
  ProductGridSkeleton, CategoryPillSkeleton, HomeBannerSkeleton,
} from '../../components/ui/Skeleton';
import { StarRating, Badge } from '../../components/ui/Atoms';
import { Button } from '../../components/ui/Button';
import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';

const { width } = Dimensions.get('window');
const BANNER_WIDTH = width - Spacing.lg * 2;
const BANNER_GAP = 12; // Matches style.bannerScroll gap
const BANNER_SNAP_INTERVAL = BANNER_WIDTH + BANNER_GAP;

// Adjusted to show ~2.2 cards for better balance and vertical "fit"
const SUGGESTION_CARD_WIDTH = (width - (Spacing.lg * 2) - Spacing.md) / 2.2;
const SUGGESTION_SNAP_INTERVAL = SUGGESTION_CARD_WIDTH + Spacing.md;

// ─── Memoised sub-components ──────────────────────────────────────────────────
const CategoryPill = memo(({ item, onPress, colors }: any) => {
  const color = getCategoryColor(item);
  return (
    <TouchableOpacity
      style={[styles.catPill, { backgroundColor: color + '22', borderColor: color + '66' }]}
      onPress={() => onPress(item)}
      activeOpacity={0.8}
    >
      <MaterialCommunityIcons name={item.icon ?? 'shape-outline'} size={16} color={color} />
      <Text style={[styles.catName, { color: colors.textPrimary }]}>{item.name}</Text>
    </TouchableOpacity>
  );
});

const SellerCard = memo(({ seller, isFollowing, onFollow, onPress, colors }: any) => (
  <TouchableOpacity
    style={[styles.sellerCard, { backgroundColor: colors.surface }]}
    onPress={() => onPress(seller)}
    activeOpacity={0.85}
  >
    <View style={[styles.sellerAvatar, { backgroundColor: colors.primaryMuted }]}>
      <MaterialCommunityIcons name="store-outline" size={22} color={colors.primary} />
      <Text style={styles.sellerAvatarText}>
        {seller.storeName?.[0] ?? seller.name?.[0] ?? '?'}
      </Text>
    </View>
    <Text style={[styles.sellerName, { color: colors.textPrimary }]} numberOfLines={1}>
      {seller.storeName || seller.name}
    </Text>
    <StarRating rating={seller.rating || seller.storeRating || 4.5} size={11} />
    <Text style={[styles.sellerSales, { color: colors.textMuted }]}>
      {seller.totalSales || 0} sales
    </Text>
    <TouchableOpacity 
      style={[styles.tinyFollowBtn, { backgroundColor: isFollowing ? colors.background : colors.primary, borderColor: colors.primary }]}
      onPress={() => onFollow(seller)}
    >
      <Text style={[styles.tinyFollowBtnText, { color: isFollowing ? colors.primary : '#fff' }]}> 
        {isFollowing ? 'Following' : 'Follow'}
      </Text>
    </TouchableOpacity>
  </TouchableOpacity>
));

// ─── Banner data — fetched live from /api/admin/ads ─────────────────────────
// Fallback banners shown only when the API returns nothing (e.g. first launch
// before admin has created any ads). Remove this array once ads are live.
const FALLBACK_BANNERS = [
  { id: 'fb1', title: 'Welcome to WimaKit', sub: 'Sierra Leone\'s commerce platform', color: ['#1A4D1A', '#2D7A2D'], icon: 'storefront-outline' },
];

const FEED_TABS = [
  { id: 'suggested', label: 'Suggested', icon: 'lightbulb-on-outline' },
  { id: 'following', label: 'Following', icon: 'account-group-outline' },
  { id: 'exploring', label: 'Exploring', icon: 'earth' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const user    = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { data: adsData } = useQuery({
    queryKey: ['home-banners'],
    queryFn: () => api.get('/admin/ads/public').then((r: any) => r.data?.ads ?? []),
    staleTime: 5 * 60 * 1000,
    select: (ads: any[]) => ads.filter((a: any) => a.status === 'active' && a.placement === 'home_banner'),
  });
  const BANNERS = (adsData && adsData.length > 0)
    ? adsData.map((a: any) => ({ id: a._id, title: a.title, sub: a.subtitle ?? a.description ?? '', color: a.colors ?? ['#1A4D1A', '#2D7A2D'], icon: a.icon ?? 'storefront-outline', link: a.link }))
    : FALLBACK_BANNERS;
  const followMutation = useFollowProfile();
  const unfollowMutation = useUnfollowProfile();

  const [activeFeed, setActiveFeed] = useState<'suggested' | 'following' | 'exploring'>('suggested');
  const cartCount = useCartStore((s) => s.getTotalItems());

  const {
    data: featuredData, isLoading: loadingFeatured, refetch: refetchFeatured,
  } = useFeaturedProducts();

  const {
    data: newData, isLoading: loadingNew, refetch: refetchNew,
  } = useProducts({ sort: '-createdAt', limit: 10 });

  const {
    data: catData, isLoading: loadingCats,
  } = useCategories();
  const { data: recSellersData } = useRecommendedSellers();

  const { 
    data: followingData, isLoading: loadingFollowing, refetch: refetchFollowing 
  } = useFollowingProducts();

  const { 
    data: exploringData, isLoading: loadingExploring, refetch: refetchExploring 
  } = useProducts({ limit: 20 });

  // Call the hook to get suggestions
  const { data: suggestData } = useSuggestions(); // This will now use the enhanced recommendation service

  const featured = featuredData?.products ?? [];
  const newest   = newData?.products   ?? [];
  const followingProducts = followingData?.products ?? [];
  const exploringProducts = exploringData?.products ?? [];
  const categories = catData?.categories ?? [];
  const recommendedSellers = recSellersData?.data ?? [];
  const suggestions = suggestData?.products ?? [];

  // Mock top sellers derived from featured products
  const topSellers = useMemo(() => {
    const seen = new Set<string>();
    return featured
      .filter((p: any) => { if (seen.has(p.seller?.id ?? p.seller?._id)) return false; seen.add(p.seller?.id ?? p.seller?._id); return true; })
      .slice(0, 5)
      .map((p: any) => p.seller);
  }, [featured]);

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

  const onRefresh = useCallback(() => {
    refetchFeatured();
    refetchNew();
    refetchFollowing();
    refetchExploring();
  }, [refetchFeatured, refetchNew, refetchFollowing, refetchExploring]);

  const goCategory = useCallback((cat: any) => {
    router.push({ pathname: '/search', params: { category: cat.id ?? cat._id, categoryName: cat.name } } as any);
  }, [router]);

  const goSeller = useCallback((seller: any) => {
    router.push(`/profile/${seller.profileSlug}` as any);
  }, [router]);

  // Optimised render for horizontal list
  const renderSuggestion = useCallback(({ item, index }: any) => (
    <MotiView 
      from={{ opacity: 0, scale: 0.9 }} 
      animate={{ opacity: 1, scale: 1 }} 
      transition={{ delay: index < 4 ? index * 100 : 0 }}
      style={{ width: SUGGESTION_CARD_WIDTH }}
    >
      <ProductCard product={item} />
    </MotiView>
  ), []);

  const getSuggestionLayout = useCallback((_: any, index: number) => ({
    length: SUGGESTION_SNAP_INTERVAL,
    offset: SUGGESTION_SNAP_INTERVAL * index,
    index,
  }), []);

  const renderFeatured = useCallback(({ item }: any) => (
    <ProductCard product={item} />
  ), []);

  const keyExtractor = useCallback((item: any) => item.id ?? item._id, []);

  const feedData = useMemo(() => {
    switch(activeFeed) {
      case 'following': return followingProducts;
      case 'suggested': return suggestions;
      case 'exploring': return exploringProducts;
      default: return suggestions;
    }
  }, [activeFeed, suggestions, followingProducts, exploringProducts]);

  const isFeedLoading = 
    (activeFeed === 'following' && loadingFollowing) || 
    (activeFeed === 'suggested' && loadingFeatured) ||
    (activeFeed === 'exploring' && loadingExploring);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <View style={[styles.headerContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.logo, { color: colors.textPrimary }]}>wima<Text style={{ color: colors.primary }}>kit</Text></Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>Deliver to Freetown · Millions of products, endless deals</Text>
          </View>
          <TouchableOpacity
            style={[styles.cartBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/cart' as any)}
          >
            <MaterialCommunityIcons name="cart-outline" size={20} color="#fff" />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.notificationBtn, { backgroundColor: colors.surface }]}
            onPress={() => router.push('/community' as any)}
          >
            <MaterialCommunityIcons name="forum-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.notificationBtn, { backgroundColor: colors.surface }]}
            onPress={() => router.push('/notifications' as any)}
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.searchBar, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => router.push('/search' as any)}
          activeOpacity={0.85}
        >
          <Text style={[styles.searchPlaceholder, { color: colors.textSecondary }]}>Search products, brands, deals...</Text> 
          <MaterialCommunityIcons name="magnify" size={18} color={colors.secondary} style={styles.searchIcon} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            onRefresh={onRefresh}
            refreshing={loadingFeatured || loadingNew}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* ── Greeting ───────────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 400 }}
          style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm }}
        >
          <Text style={[styles.greeting, { color: colors.textMuted }]}>
            {user ? `Hello, ${user.name.split(' ')[0]} 👋` : 'Hello, welcome! 👋'}
          </Text>
          <Text style={[styles.greetingSub, { color: colors.textPrimary }]}>
            What would you like today?
          </Text>
        </MotiView>

        {/* ── Hero Banners ────────────────────────────────────────────────── */}
        {loadingFeatured ? (
          <HomeBannerSkeleton />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            pagingEnabled
            contentContainerStyle={styles.bannerScroll}
            decelerationRate="fast"
            snapToInterval={BANNER_SNAP_INTERVAL}
          >
            {BANNERS.map((b: any, i: number) => (
              <MotiView
                key={b.id}
                from={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'timing', duration: 400, delay: i * 100 }}
              >
                <LinearGradient colors={b.color as [string, string]} style={styles.banner}>
                  <View style={styles.bannerContent}>
                    <Text style={styles.bannerTitle}>{b.title}</Text>
                    <Text style={styles.bannerSub}>{b.sub}</Text>
                    <TouchableOpacity
                      style={styles.bannerBtn}
                      onPress={() => router.push('/search' as any)}
                    >
                      <Text style={styles.bannerBtnText}>Shop Now →</Text>
                    </TouchableOpacity>
                  </View>
                  <MaterialCommunityIcons name={b.icon as any} size={64} color="rgba(255,255,255,0.3)" style={styles.bannerIcon} />
                </LinearGradient>
              </MotiView>
            ))}
          </ScrollView>
        )}

        {/* ── Categories ──────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader 
            title="Marketplace Hub" 
            sub="Explore by department" 
            onSeeAll={() => router.push('/search' as any)} 
            colors={colors} 
          />
          {loadingCats ? (
            <CategoryPillSkeleton />
          ) : ( // Changed emoji to MaterialCommunityIcons name
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
              {categories.map((cat: any) => (
                <CategoryPill key={cat.id ?? cat._id} item={cat} onPress={() => router.push(`/category/${cat.slug ?? cat.id}` as any)} colors={colors} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Top Sellers ─────────────────────────────────────────────────── */}
        {topSellers.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Top Sellers" onSeeAll={() => {}} colors={colors} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
              {topSellers.map((s: any, i: number) => {
                const isFollowing = user?.following?.includes(s.id || s._id);
                return (
                  <SellerCard 
                    key={s.id || s._id || i} 
                    seller={s} 
                    isFollowing={isFollowing} 
                    onFollow={handleFollowToggle} 
                    onPress={goSeller} colors={colors} 
                  />
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Recommended For You (Sellers) ── */}
        {recommendedSellers.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Shops You'll Love" sub="Based on your interests" colors={colors} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
              {recommendedSellers.map((s: any, i: number) => {
                const isFollowing = user?.following?.includes(s._id);
                return <SellerCard key={s._id} seller={s} isFollowing={isFollowing} onFollow={handleFollowToggle} onPress={goSeller} colors={colors} />;
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Main Feed Switcher ── */}
        <View style={styles.feedContainer}>
          <View style={[styles.feedTabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {FEED_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.feedTab, activeFeed === tab.id && { backgroundColor: colors.primaryMuted }]}
                onPress={() => setActiveFeed(tab.id as any)}
              >
                <Text style={[styles.feedTabText, { color: activeFeed === tab.id ? colors.primary : colors.textMuted }]}>
                  {tab.icon} {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isFeedLoading ? (
            <ProductGridSkeleton count={4} />
          ) : feedData.length === 0 ? (
            <View style={styles.emptyFeed}>
              <Text style={{ fontSize: 48 }}>{activeFeed === 'following' ? '👥' : '🔎'}</Text>
              <Text style={[styles.emptyFeedTitle, { color: colors.textPrimary }]}>
                {activeFeed === 'following' ? 'Not following anyone yet' : 'No products found'}
              </Text>
              <Text style={[styles.emptyFeedSub, { color: colors.textMuted }]}>
                {activeFeed === 'following' 
                  ? 'Follow your favorite stores to see their latest products here!' 
                  : 'Check back later for more updates.'}
              </Text>
              {activeFeed === 'following' && (
                <Button title="Explore Sellers" onPress={() => router.push('/explore')} style={{ marginTop: 12 }} />
              )}
            </View>
          ) : (
            <FlatList
              data={feedData}
              renderItem={renderFeatured}
              keyExtractor={keyExtractor}
              numColumns={2}
              columnWrapperStyle={{ gap: Spacing.md }}
              contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.md, paddingBottom: 20 }}
              scrollEnabled={false}
              removeClippedSubviews
              maxToRenderPerBatch={6}
              windowSize={5}
              initialNumToRender={4}
            />
          )}
        </View>

        {/* ── New Arrivals ────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="🆕 New Arrivals"
            onSeeAll={() => router.push({ pathname: '/search', params: { sort: '-createdAt' } } as any)}
            colors={colors}
          />
          <FlatList
            data={newest.slice(0, 6)}
            renderItem={renderFeatured}
            keyExtractor={keyExtractor}
            numColumns={2}
            columnWrapperStyle={{ gap: Spacing.md }}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}
            scrollEnabled={false}
            removeClippedSubviews
            maxToRenderPerBatch={4}
            windowSize={3}
          />
        </View>

        {/* ── Promo banner ────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.promoBanner, { backgroundColor: colors.secondaryMuted }]}
          onPress={() => router.push('/(auth)/register' as any)}
          activeOpacity={0.9}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.promoTitle, { color: colors.secondary }]}>
              Start Selling on WimaKit 🏪
            </Text> 
            <Text style={[styles.promoSub, { color: colors.textSecondary }]}>
              Join thousands of Freetown vendors already making money online
            </Text>
            <Text style={[styles.promoLink, { color: colors.secondary }]}>
              Become a Seller →
            </Text>
          </View>
          <MaterialCommunityIcons name="moped" size={56} color={colors.secondary} />
        </TouchableOpacity>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const SectionHeader = memo(({ title, onSeeAll, colors }: any) => (
  <View style={styles.sectionHeader}>
    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
    {onSeeAll && (
      <TouchableOpacity onPress={onSeeAll}>
        <Text style={[styles.seeAll, { color: colors.primary }]}>See all →</Text>
      </TouchableOpacity>
    )}
  </View>
));

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  logo: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { fontSize: FontSize.sm, marginTop: 4, lineHeight: 20 },
  cartBtn: { width: 46, height: 46, borderRadius: Radius.xxl, alignItems: 'center', justifyContent: 'center', position: 'relative', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 18, elevation: 5 },
  cartBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#111', borderRadius: 10,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  cartBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  notificationBtn: {
    width: 46, height: 46, borderRadius: Radius.xxl, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 18, elevation: 5,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.xxl,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 50,
  },
  searchPlaceholder: { flex: 1, fontSize: FontSize.md, fontWeight: '500' },
  searchIcon: { fontSize: 18, paddingLeft: Spacing.sm },

  greeting: { fontSize: FontSize.sm },
  greetingSub: { fontSize: FontSize.xxl, fontWeight: '900', marginTop: 4, letterSpacing: 0.2 },

  bannerScroll: { paddingHorizontal: Spacing.lg, gap: 12, paddingBottom: Spacing.md },
  banner: {
    width: BANNER_WIDTH, minHeight: 200, borderRadius: Radius.xl,
    flexDirection: 'row', alignItems: 'center', padding: Spacing.xl, overflow: 'hidden', borderWidth: 1, borderColor: '#E3E2E0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 18, elevation: 4,
  },
  bannerContent: { flex: 1 },
  bannerTitle: { color: '#fff', fontSize: FontSize.xl, fontWeight: '900', lineHeight: 26 },
  bannerSub: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, marginTop: 4, lineHeight: 18 },
  bannerBtn: {
    marginTop: Spacing.md, backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'flex-start', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  bannerBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  bannerIcon: { position: 'absolute', right: -10, bottom: -10 },

  section: { marginBottom: Spacing.lg },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  seeAll: { fontSize: FontSize.sm, fontWeight: '700' },

  catRow: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  catPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1, borderColor: '#E3E2E0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  catEmoji: { fontSize: 16 },
  catName: { fontSize: FontSize.sm, fontWeight: '600', color: '#F8FAFC' },

  sellerCard: {
    width: 108, alignItems: 'center', padding: Spacing.md,
    borderRadius: Radius.xl, gap: 6,
    borderWidth: 1, borderColor: '#E3E2E0', backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4,
  },
  sellerAvatar: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F5C442',
  },
  sellerAvatarText: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  sellerName: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  sellerSales: { fontSize: 10, color: '#94A3B8' },
  tinyFollowBtn: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1, width: '100%', alignItems: 'center' },
  tinyFollowBtnText: { fontSize: 9, fontWeight: '800' },

  feedContainer: { marginTop: Spacing.md },
  feedTabs: { flexDirection: 'row', marginHorizontal: Spacing.lg, borderRadius: Radius.lg, padding: 4, marginBottom: Spacing.lg, borderWidth: 1 },
  feedTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md },
  feedTabText: { fontSize: FontSize.xs, fontWeight: '800' },
  emptyFeed: { alignItems: 'center', padding: Spacing.xxl, gap: 8 },
  emptyFeedTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  emptyFeedSub: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },

  promoBanner: {
    marginHorizontal: Spacing.lg, borderRadius: Radius.xl,
    padding: Spacing.xl, flexDirection: 'row',
    alignItems: 'center', marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: '#E3E2E0', backgroundColor: '#E8F0FE',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
  },
  promoTitle: { fontSize: FontSize.lg, fontWeight: '800', marginBottom: Spacing.xs },
  promoSub: { fontSize: FontSize.sm, lineHeight: 20, marginBottom: Spacing.md },
  promoLink: { fontSize: FontSize.sm, fontWeight: '800' },
});
