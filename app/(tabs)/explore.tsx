import React, { useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { useTheme } from '../../context/ThemeContext';
import { 
  useCategories, 
  useFeaturedProducts, 
  useFollowProfile, 
  useUnfollowProfile,
  useStores
} from '../../hooks/useApi';
import { ProductCard } from '../../components/product/ProductCard';
import { CategoryPillSkeleton, ProductGridSkeleton } from '../../components/ui/Skeleton';
import { MOCK_CATEGORIES, formatPrice, getCategoryColor } from '../../constants/data';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuthStore } from '../../store';

const { width } = Dimensions.get('window');
const CAT_W = (width - Spacing.lg * 2 - Spacing.md * 3) / 4;

const CategoryTile = memo(({ cat, onPress, colors }: any) => {
  const color = getCategoryColor(cat);
  return (
    <TouchableOpacity
      style={[styles.catTile, { backgroundColor: color + '22', borderColor: color + '44' }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <MaterialCommunityIcons name={cat.icon ?? 'shape-outline'} size={26} color={color} />
      <Text style={[styles.catTileName, { color: colors.textPrimary }]} numberOfLines={2}>
        {cat.name}
      </Text>
      <Text style={[styles.catTileCount, { color: colors.textMuted }]}>
        {cat.productCount ?? '50+'} items
      </Text>
    </TouchableOpacity>
  );
});

const SellerCard = memo(({ seller, isFollowing, onFollow, onPress, colors }: any) => (
  <TouchableOpacity
    style={[styles.sellerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <LinearGradient
      colors={[colors.primary, colors.primaryLight]}
      style={styles.sellerBanner}
    >
      <MaterialCommunityIcons name="store-outline" size={32} color="#fff" />
    </LinearGradient>
    <View style={styles.sellerAvatarWrap}>
      <View style={[styles.sellerAvatar, { backgroundColor: colors.primaryMuted, borderColor: colors.surface }]}>
        <MaterialCommunityIcons name="account-outline" size={24} color={colors.primary} />
      </View>
    </View>
    <View style={styles.sellerInfo}>
      <Text style={[styles.sellerName, { color: colors.textPrimary }]} numberOfLines={1}>
        {seller.storeName ?? seller.name}
      </Text>
      <Text style={[styles.sellerSub, { color: colors.textMuted }]} numberOfLines={1}>
        {seller.location ?? 'Freetown'}
      </Text>
      <View style={styles.sellerMeta}>
        <Text style={[styles.sellerRating, { color: colors.accent }]}>
          ★ {seller.rating?.toFixed(1) ?? '4.8'}
        </Text>
        <Text style={[styles.sellerSales, { color: colors.textMuted }]}>
          · {seller.totalSales ?? 0} sales · {seller.followersCount ?? seller.followers?.length ?? 0} followers
        </Text>
      </View>
      {seller.isVerified && (
        <View style={[styles.verifiedBadge, { backgroundColor: colors.successLight }]}>
          <Text style={[styles.verifiedText, { color: colors.success }]}>✓ Verified</Text>
        </View>
      )}
    </View>
    <TouchableOpacity 
      style={[styles.followBtn, { backgroundColor: isFollowing ? colors.background : colors.primary, borderColor: colors.primary }]}
      onPress={() => onFollow(seller)}
    >
      <Text style={[styles.followBtnText, { color: isFollowing ? colors.primary : '#fff' }]}>
        {isFollowing ? 'Following' : 'Follow Store'}
      </Text>
    </TouchableOpacity>
  </TouchableOpacity>
));

export default function ExploreScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, updateUser } = useAuthStore();
  const followMutation = useFollowProfile();
  const unfollowMutation = useUnfollowProfile();
  const { data: storesData } = useStores(''); // Fetch real stores

  const { data: catsData,     isLoading: catsLoading }   = useCategories();
  const { data: featuredData, isLoading: featuredLoading } = useFeaturedProducts();

  const categories = catsData?.categories ?? [];
  const featured   = featuredData?.products ?? [];
  const topSellers = storesData?.data?.slice(0, 10) ?? [];

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

  const renderCat = useCallback(({ item, index }: { item: any; index: number }) => (
    <MotiView
      from={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'timing', duration: 300, delay: index * 40 }}
    >
      <CategoryTile
        cat={item}
        colors={colors}
        onPress={() => router.push(`/category/${item.slug ?? item.id}` as any)} // Navigate to new Category Details page
      />
    </MotiView>
  ), [colors, router]);

  const renderSeller = useCallback(({ item }: { item: any }) => (
    <SellerCard
      seller={item}
      isFollowing={user?.following?.includes(item.id || item._id)}
      onFollow={handleFollowToggle}
      colors={colors}
      onPress={() => router.push(`/profile/${item.profileSlug}` as any)}
    />
  ), [colors, router, user, handleFollowToggle]);

  const renderProduct = useCallback(({ item, index }: { item: any; index: number }) => (
    <ProductCard product={item} index={index} />
  ), []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Explore</Text>
        <TouchableOpacity
          style={[styles.searchBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => router.push('/search' as any)}
        >
          <Text style={{ fontSize: 16 }}>🔍</Text>
          <Text style={[styles.searchPlaceholder, { color: colors.textMuted }]}>Search WimaKit...</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>

        {/* Categories grid */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Shop by Category</Text>
          </View>
          {catsLoading ? (
            <CategoryPillSkeleton />
          ) : (
            <FlatList
              data={categories}
              numColumns={4}
              scrollEnabled={false}
              keyExtractor={(item: any) => item.id ?? item.slug}
              renderItem={renderCat}
              contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: 0 }}
              columnWrapperStyle={{ gap: Spacing.md, marginBottom: Spacing.md }}
              initialNumToRender={8}
              windowSize={5}
              maxToRenderPerBatch={5}
              removeClippedSubviews={true}
            />
          )}
        </View>

        {/* Promo banner */}
        <MotiView
          from={{ opacity: 0, translateX: -20 }}
          animate={{ opacity: 1, translateX: 0 }}
          transition={{ type: 'timing', duration: 500, delay: 200 }}
          style={styles.promoBannerWrap}
        >
          <LinearGradient
            colors={['#1A4D1A', '#2D7A2D']}
            style={styles.promoBanner}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.promoTag}>New Arrivals</Text>
              <Text style={styles.promoTitle}>New arrivals{'\n'}this week</Text>
              <TouchableOpacity
                style={styles.promoBtn}
                onPress={() => router.push('/search?sort=-createdAt' as any)}
              >
                <Text style={styles.promoBtnText}>Explore New</Text>
              </TouchableOpacity>
            </View>
            <MaterialCommunityIcons name={"sparkles" as any} size={64} color="#fff" />
          </LinearGradient>
        </MotiView>

        {/* Top Sellers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>⭐ Top Sellers</Text>
            <TouchableOpacity>
              <Text style={[styles.seeAll, { color: colors.primary }]}>See all →</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={topSellers}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}
            keyExtractor={(item) => item.id}
            renderItem={renderSeller}
            initialNumToRender={3}
              windowSize={5}
              maxToRenderPerBatch={5}
              removeClippedSubviews={true}
          />
        </View>

        {/* Featured products */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🔥 Trending Now</Text>
            <TouchableOpacity onPress={() => router.push('/search' as any)}>
              <Text style={[styles.seeAll, { color: colors.primary }]}>See all →</Text>
            </TouchableOpacity>
          </View>
          {featuredLoading ? (
            <ProductGridSkeleton count={4} />
          ) : (
            <FlatList
              data={featured}
              numColumns={2}
              scrollEnabled={false}
              keyExtractor={(item: any) => item._id ?? item.id}
              renderItem={renderProduct}
              contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
              columnWrapperStyle={{ gap: Spacing.md }}
              initialNumToRender={4}
              windowSize={5}
              maxToRenderPerBatch={5}
              removeClippedSubviews={true}
            />
          )}
        </View>

        {/* Browse by price */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, paddingHorizontal: Spacing.lg }]}>
            💰 Browse by Price
          </Text>
          <View style={styles.priceGrid}>
            {[
              { label: 'Under Le 20K',      max: 20000,   icon: 'cash' },
              { label: 'Le 20K – 100K',     min: 20000,   max: 100000, icon: 'cash-multiple' },
              { label: 'Le 100K – 500K',    min: 100000,  max: 500000, icon: 'credit-card-outline' },
              { label: 'Over Le 500K',      min: 500000,  icon: 'diamond-outline' },
            ].map((range) => (
              <TouchableOpacity
                key={range.label}
                style={[styles.priceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(`/search?minPrice=${range.min ?? 0}&maxPrice=${range.max ?? 9999999}` as any)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name={range.icon as any} size={24} color={colors.textPrimary} />
                <Text style={[styles.priceCardLabel, { color: colors.textPrimary }]}>{range.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: 1, gap: Spacing.md },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '900' },
  searchBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1.5, borderRadius: Radius.xl, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  searchPlaceholder: { fontSize: FontSize.md },

  section: { marginTop: Spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  seeAll: { fontSize: FontSize.sm, fontWeight: '700' },

  catTile: { width: CAT_W, borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', gap: 4, borderWidth: 1 },
  catTileIcon: { fontSize: 28 },
  catTileName: { fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 13 },
  catTileCount: { fontSize: 9 },

  promoBannerWrap: { marginHorizontal: Spacing.lg, borderRadius: Radius.xl, overflow: 'hidden' },
  promoBanner: { flexDirection: 'row', alignItems: 'center', padding: Spacing.xl, minHeight: 150 },
  promoTag: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.xs, fontWeight: '700', marginBottom: 6 },
  promoTitle: { color: '#fff', fontSize: FontSize.xxl, fontWeight: '900', lineHeight: 28, marginBottom: 16 },
  promoBtn: { backgroundColor: '#fff', borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, alignSelf: 'flex-start' },
  promoBtnText: { color: '#1A4D1A', fontWeight: '800', fontSize: FontSize.sm },

  sellerCard: { width: 180, borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  sellerBanner: { height: 70, alignItems: 'center', justifyContent: 'center' },
  sellerBannerEmoji: { fontSize: 32 },
  sellerAvatarWrap: { alignItems: 'center', marginTop: -24 },
  sellerAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  sellerInfo: { padding: Spacing.md, alignItems: 'center', gap: 3 },
  sellerName: { fontSize: FontSize.sm, fontWeight: '800', textAlign: 'center' },
  sellerSub: { fontSize: FontSize.xs, textAlign: 'center' },
  sellerMeta: { flexDirection: 'row', alignItems: 'center' },
  sellerRating: { fontSize: FontSize.sm, fontWeight: '700' },
  sellerSales: { fontSize: FontSize.xs },
  verifiedBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  verifiedText: { fontSize: 10, fontWeight: '700' },
  followBtn: { margin: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center' },
  followBtnText: { fontSize: FontSize.xs, fontWeight: '800' },

  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, paddingHorizontal: Spacing.lg, marginTop: Spacing.md },
  priceCard: { width: (width - Spacing.lg * 2 - Spacing.md) / 2, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  priceCardIcon: { fontSize: 24 },
  priceCardLabel: { fontSize: FontSize.sm, fontWeight: '700', flex: 1 },
});
