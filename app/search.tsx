import React, { useState, useCallback, useMemo, memo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList, ActivityIndicator,
  TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store';
import { 
  useDebouncedSearch, 
  useCategories, 
  useStores, 
  useMe, 
  useFollowProfile, 
  useUnfollowProfile,
  useClearSearchHistory,
  useDeleteSearchHistoryItem
} from '../hooks/useApi';
import { ProductCard } from '../components/product/ProductCard';
import { ProductGridSkeleton } from '../components/ui/Skeleton';
import { Spacing, Radius, FontSize } from '../constants/theme';
import { productsApi } from '../utils/api';
import type { Product } from '../constants/data';

const SORT_OPTIONS = [
  { id: 'suggested',    label: 'Suggested For You',  sort: undefined }, // This will trigger the suggestions API
  { id: 'popular',      label: 'Popular',            sort: '-totalSold' },
  { id: 'trending',     label: 'Trending',           sort: '-createdAt' }, // For now, trending is newest. Can be enhanced.
  { id: 'price_asc',    label: 'Price: Low → High',   sort: 'price' },
  { id: 'price_desc',   label: 'Price: High → Low',   sort: '-price' },
  { id: 'top_rated',    label: 'Top Rated',            sort: '-rating' },
  { id: 'newest',       label: 'Newest',               sort: '-createdAt' },
  { id: 'best_selling', label: 'Best Selling',         sort: '-totalSold' },
];

const SortChip = memo(({ opt, selected, onPress, colors }: any) => (
  <TouchableOpacity
    style={[styles.sortChip, { backgroundColor: selected ? colors.primary : colors.surfaceRaised, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 }]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={[styles.sortChipText, { color: selected ? colors.primary : colors.textSecondary }]}>
      {opt.label}
    </Text>
  </TouchableOpacity>
));

const CatChip = memo(({ item, selected, onPress, colors }: any) => (
  <TouchableOpacity
    style={[styles.catChip, { backgroundColor: selected ? colors.primary + '10' : colors.surface, borderWidth: 0.5, borderColor: 'transparent' }]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={{ fontSize: 14 }}>{item.icon}</Text>
    <Text style={[styles.catChipText, { color: selected ? colors.primary : colors.textSecondary }]}>
      {item.name}
    </Text>
  </TouchableOpacity>
));

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const { colors } = useTheme();

  const [selectedCat,  setSelectedCat]  = useState<string | null>(params.category ?? null); // For category filtering
  const [sortId,       setSortId]       = useState('suggested'); // Default to suggested
  const [showFilters,  setShowFilters]  = useState(false);
  const [activeTab,    setActiveTab]    = useState<'products' | 'stores' | 'history'>('products');

  const { user: currentUser, updateUser } = useAuthStore();
  const followMutation = useFollowProfile();
  const unfollowMutation = useUnfollowProfile();
  const clearHistoryMutation = useClearSearchHistory();
  const deleteHistoryItemMutation = useDeleteSearchHistoryItem();

  // useDebouncedSearch now takes sortId and selectedCat
  const { 
    query, setQuery, debounced, 
    data, isLoading, isFetching, 
    hasNextPage, fetchNextPage, isFetchingNextPage 
  } = useDebouncedSearch(350, sortId, selectedCat);

  const { data: catsData } = useCategories();
  const { data: userData } = useMe();
  
  // useStores hook needs to be created/updated to accept a search query
  const { data: storesData, isLoading: isLoadingStores } = useStores(activeTab === 'stores' ? debounced : '');
  const categories = catsData?.categories ?? [];
  const searchHistory = userData?.user?.searchHistory || [];

  // Record search history for personalization, but only once the user has
  // genuinely stopped typing — not on every settle of the 350ms debounce
  // that drives live results. That debounce alone fires on every short
  // pause ("sho" -> brief pause -> "shoes"), which would write a near-
  // duplicate history entry per pause rather than one entry per real search.
  // A second, longer debounce here (independent of the search-results one)
  // catches only the "stopped typing" moment.
  // NOTE: this previously called productsApi.recordInterest(debounced),
  // which posts to /products/:id/interest expecting a product ID — a
  // route that doesn't exist on the backend. recordSearch is the
  // correct, already-implemented endpoint for recording a search
  // keyword (POST /products/search-history). It requires auth, so it's
  // skipped for guests, and wrapped in .catch() so a failed request
  // can't surface as an unhandled promise rejection.
  useEffect(() => {
    if (!currentUser || debounced.length <= 2) return;
    const settleTimer = setTimeout(() => {
      productsApi.recordSearch(debounced).catch(() => {
        // Personalization is best-effort; a failure here shouldn't
        // affect the user's search experience.
      });
    }, 1200);
    return () => clearTimeout(settleTimer);
  }, [debounced, currentUser]);

  const handleFollowToggle = async (store: any) => {
    if (!currentUser) {
      router.push('/(auth)/login');
      return;
    }
    const isFollowing = currentUser.following?.includes(store._id);
    try {
      if (isFollowing) {
        await unfollowMutation.mutateAsync(store._id);
        updateUser({ ...currentUser, following: currentUser.following?.filter(id => id !== store._id) });
      } else {
        await followMutation.mutateAsync(store._id);
        updateUser({ ...currentUser, following: [...(currentUser.following || []), store._id] });
      }
    } catch (e) {
      // Error handled by mutation
    }
  };

  const handleClearAllHistory = () => {
    Alert.alert('Clear History', 'Are you sure you want to delete all recent searches?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: () => clearHistoryMutation.mutate() }
    ]);
  };

  const handleDeleteHistoryItem = (keyword: string) => {
    deleteHistoryItemMutation.mutate(keyword);
  };

  const selectedSort = SORT_OPTIONS.find((s) => s.id === sortId)!;
  const isSuggestedSort = sortId === 'suggested';

  // Merge search results with local filter/sort
  const products: Product[] = useMemo(() => {
    if (!data?.pages) return [];
    
    // Flatten all pages of results from useInfiniteQuery
    let list = data.pages.flatMap(page => isSuggestedSort ? (page.suggestions ?? []) : (page.products ?? []));
    
    // If suggested, the API already handles the filtering.
    // If not suggested, apply local category filter if needed.
    // Note: The backend should ideally handle category filtering for non-suggested searches too.
    // For now, if selectedCat is present and it's not a suggested search, filter locally.
    // This might be redundant if backend search endpoint handles category.
    // The `useDebouncedSearch` hook will need to pass `selectedCat` to the API.
    // The current `useDebouncedSearch` only passes `q`.
    // This implies `productsApi.list` needs to accept `category` and `sort` parameters.
    // The backend `listProducts` controller has been updated to handle `q`, `category`, and `sort`.
    return list;
  }, [data, selectedCat]);

  const renderItem = useCallback(({ item }: { item: Product }) => (
    <ProductCard product={item} />
  ), []);

  const keyExtractor = useCallback((item: any) => item._id || item.id || `cat-${item.name || Math.random()}`, []);

  const catData = useMemo(
    () => [{ id: 'all-pill', name: 'All', icon: '🏪' } as any, ...categories],
    [categories]
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Tab Switcher */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity 
          onPress={() => setActiveTab('products')}
          style={[styles.tabItem, activeTab === 'products' && { borderBottomColor: colors.primary }]}>
          <Text style={[styles.tabText, { color: activeTab === 'products' ? colors.primary : colors.textMuted }]}>Products</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => setActiveTab('stores')}
          style={[styles.tabItem, activeTab === 'stores' && { borderBottomColor: colors.primary }]}>
          <Text style={[styles.tabText, { color: activeTab === 'stores' ? colors.primary : colors.textMuted }]}>Browse Stores</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => setActiveTab('history')}
          style={[styles.tabItem, activeTab === 'history' && { borderBottomColor: colors.primary }]}>
          <Text style={[styles.tabText, { color: activeTab === 'history' ? colors.primary : colors.textMuted }]}>History</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[styles.searchHeader, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}>
          <Text style={[styles.backText, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border + '20', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 3 }]}>
          <Text style={{ fontSize: 16 }}>🔍</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary }]}
            placeholder="Search products, sellers, categories..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onFocus={() => activeTab === 'history' && setActiveTab('products')}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text style={[styles.clearBtn, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, showFilters && { backgroundColor: colors.primaryMuted }]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Text style={{ fontSize: 18 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Category pills */}
      <View style={[styles.catRow, { backgroundColor: colors.background }]}>
        <FlatList
          data={catData}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm }}
          keyExtractor={(item) => (item._id || item.id || 'all-pill')}
          renderItem={({ item }: { item: any }) => (
            <CatChip
              item={item}
              selected={selectedCat === (item._id || item.id) || (item.id === 'all-pill' && (selectedCat === null || selectedCat === 'all-pill'))}
              onPress={() => setSelectedCat((prev) => (prev === (item.id ?? item._id) ? null : (item.id ?? item._id)))}
              colors={colors}
            />
          )}
          initialNumToRender={6}
          removeClippedSubviews
        />
      </View>

      {/* Filters panel */}
      {showFilters && (
        <MotiView
          from={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ type: 'timing', duration: 250 }}
          style={[styles.filtersPanel, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        >
          <Text style={[styles.filterLabel, { color: colors.textMuted }]}>SORT BY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
            {SORT_OPTIONS.map((opt) => (
              <SortChip // Use the new SORT_OPTIONS
                key={opt.id}
                opt={opt}
                selected={sortId === opt.id}
                onPress={() => setSortId(opt.id)}
                colors={colors}
              />
            ))}
          </ScrollView>
        </MotiView>
      )}

      {/* Results bar */}
      <View style={[styles.resultsBar, { borderBottomColor: colors.border + '20' }]}>
        <Text style={[styles.resultsText, { color: colors.textMuted }]}>{
          isLoading || isFetching
            ? 'Searching...' // Update message for suggested/stores
            : debounced.length >= 2
              ? `${products.length} result${products.length !== 1 ? 's' : ''} for "${debounced}"`
              : 'Start typing to search'
        }</Text>{isFetching && !isLoading && (
          <View style={[styles.refreshingDot, { backgroundColor: colors.primary }]} />
        )}</View>

      {/* Product grid */}
      {activeTab === 'history' ? (
        <FlatList
          data={searchHistory}
          keyExtractor={(item, index) => `${item}-${index}`}
          contentContainerStyle={{ padding: Spacing.lg }}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 40, color: colors.textMuted }}>Your search history is empty</Text>
          }
          ListHeaderComponent={searchHistory.length > 0 ? (
            <View style={styles.historyHeader}>
              <Text style={[styles.historyTitle, { color: colors.textSecondary }]}>RECENT SEARCHES</Text>
              <TouchableOpacity onPress={handleClearAllHistory}>
                <Text style={[styles.clearAllText, { color: colors.primary }]}>Clear All</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          renderItem={({ item }) => (
            <View style={[styles.historyRow, { borderBottomColor: colors.border + '20' }]}>
              <TouchableOpacity 
                style={styles.historyItemBtn}
                onPress={() => { setQuery(item); setActiveTab('products'); }}
              >
              <MaterialCommunityIcons name="history" size={16} color={colors.textMuted} />
                <Text style={[styles.historyText, { color: colors.textPrimary }]}>{item}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteHistoryItem(item)} style={styles.deleteItemBtn}>
                <Text style={[styles.deleteIcon, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      ) : activeTab === 'stores' ? ( // Store browsing
        <FlatList
          data={storesData?.data || []}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: Spacing.lg }}
          renderItem={({ item }) => {
            const isFollowing = currentUser?.following?.includes(item._id);
            return (
              <TouchableOpacity 
                style={[styles.storeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(`/profile/${item.profileSlug}` as any)}
              >
                <MaterialCommunityIcons name="store-outline" size={24} color={colors.textPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.storeName, { color: colors.textPrimary }]}>{item.storeName}</Text>
                  <Text style={[styles.storeSub, { color: colors.textMuted }]}>{item.categories?.join(' • ') || 'General Store'}</Text>
                </View>
                <TouchableOpacity 
                  style={[
                    styles.inlineFollowBtn, 
                    { backgroundColor: isFollowing ? colors.background : colors.primary, borderColor: colors.primary }
                  ]}
                  onPress={() => handleFollowToggle(item)}
                >
                  <Text style={[styles.inlineFollowText, { color: isFollowing ? colors.primary : '#fff' }]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      ) : isLoading || (isSuggestedSort && isLoading) ? ( // Product grid or suggested
        <ProductGridSkeleton count={6} />
      ) : products.length === 0 && debounced.length >= 2 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="magnify" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No results found</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Try a different keyword or browse categories
          </Text>
        </View>
      ) : debounced.length < 2 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="cart-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Search WimaKit</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Find fresh produce, food, electronics, fashion and more from Freetown sellers
          </Text>
        </View>
      ) : (
        <FlatList
          data={products}
          key={activeTab} // Add key prop to force re-render on tab change
          numColumns={2}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: 100 }}
          columnWrapperStyle={{ gap: Spacing.md }}
          showsVerticalScrollIndicator={false}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={isFetchingNextPage ? (
            <View style={{ paddingVertical: 20 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabSwitcher: { flexDirection: 'row', paddingHorizontal: Spacing.lg, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.05)' },
  tabItem: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: FontSize.sm, fontWeight: '700' },
  searchHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 36, fontWeight: '100', marginTop: -4 }, // Consistent with other headers
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 0.5, borderRadius: Radius.full, paddingHorizontal: Spacing.lg, height: 54 },
  input: { flex: 1, fontSize: FontSize.md, fontWeight: '400' }, // Refined font weight
  clearBtn: { fontSize: 14, padding: 4 },
  filterBtn: { width: 48, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: 'transparent' },
  catRow: { marginBottom: Spacing.md }, // Keep some spacing
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderRadius: Radius.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 6, elevation: 1 }, // Subtle shadow
  catChipText: { fontSize: FontSize.sm, fontWeight: '600' },
  filtersPanel: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl, borderBottomWidth: 0.5, gap: Spacing.lg }, // More padding
  filterLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.8 },
  sortChip: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.full, borderWidth: 0.5, borderColor: 'transparent' }, // Subtle border
  sortChipText: { fontSize: FontSize.xs, fontWeight: '700' },
  resultsBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg }, // More padding
  resultsText: { fontSize: FontSize.xs, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1.2, flex: 1 },
  refreshingDot: { width: 8, height: 8, borderRadius: 4 },
  storeCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.md },
  storeName: { fontSize: FontSize.md, fontWeight: '700' },
  storeSub: { fontSize: FontSize.xs, marginTop: 2 },
  inlineFollowBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1 },
  inlineFollowText: { fontSize: 11, fontWeight: '800' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  historyTitle: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  clearAllText: { fontSize: FontSize.xs, fontWeight: '700' },
  historyRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  historyItemBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  historyText: { fontSize: FontSize.md },
  deleteItemBtn: { padding: Spacing.md },
  deleteIcon: { fontSize: 14 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
});
