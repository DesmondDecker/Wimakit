import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import { useProducts, useCategoryBySlug } from '../../hooks/useApi';
import { ProductCard } from '../../components/product/ProductCard';
import { ProductCardSkeleton } from '../../components/ui/Skeleton';
import { getCategoryConfig } from '../../constants/categories';

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const config = getCategoryConfig(slug ?? '');
  const [subcat, setSubcat] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<string | undefined>(undefined);

  const { data: catData } = useCategoryBySlug(slug ?? '');
  const apiCat = catData?.category;

  const { data, isLoading } = useProducts({
    category: apiCat?._id ?? apiCat?.id,
    subcategory: subcat,
    sort,
    limit: 30,
  });
  const products = data?.products ?? [];

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {config && <Text style={{ fontSize: 20 }}>{config.emoji}</Text>}
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{config?.name ?? apiCat?.name ?? 'Category'}</Text>
        </View>
        <TouchableOpacity style={{ padding: 4 }} onPress={() => router.push('/search')}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Subcategories */}
      {config?.subcategories?.length ? (
        <View style={[s.subcatWrap, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <FlatList
            horizontal showsHorizontalScrollIndicator={false}
            data={[{ value: undefined, label: 'All' }, ...config.subcategories.map(sc => ({ value: sc, label: sc }))]}
            keyExtractor={(item, i) => item.value ?? `all-${i}`}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: 8, paddingVertical: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.subcatChip, { backgroundColor: subcat === item.value ? (config?.color ?? colors.primary) : colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}
                onPress={() => setSubcat(item.value)}>
                <Text style={{ color: subcat === item.value ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '700' }}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      {/* Sort row */}
      <View style={[s.sortRow, { borderBottomColor: colors.border }]}>
        {[
          { v: undefined, l: 'Suggested' },
          { v: '-totalSold', l: 'Popular' },
          { v: 'price', l: 'Price ↑' },
          { v: '-price', l: 'Price ↓' },
          { v: '-rating', l: 'Top Rated' },
          { v: '-createdAt', l: 'Newest' },
        ].map((opt, i) => (
          <TouchableOpacity key={i} style={[s.sortChip, sort === opt.v && { backgroundColor: colors.primaryMuted }]} onPress={() => setSort(opt.v)}>
            <Text style={{ color: sort === opt.v ? colors.primary : colors.textMuted, fontSize: 11, fontWeight: '700' }}>{opt.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <FlatList data={[1,2,3,4]} keyExtractor={String} numColumns={2}
          contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
          columnWrapperStyle={{ gap: Spacing.md }}
          renderItem={() => <ProductCardSkeleton />} />
      ) : products.length === 0 ? (
        <View style={s.empty}>
          <MaterialCommunityIcons name="package-variant-closed" size={56} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No products yet</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>Check back soon for {config?.name ?? 'this category'}.</Text>
        </View>
      ) : (
        <FlatList
          data={products} keyExtractor={(p: any) => p._id ?? p.id} numColumns={2}
          contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: 60 }}
          columnWrapperStyle={{ gap: Spacing.md }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => <ProductCard product={item} index={index} />}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 8 },
  headerTitle: { fontSize: FontSize.md, fontWeight: '800' },
  subcatWrap: { borderBottomWidth: 1 },
  subcatChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: Spacing.lg, paddingVertical: 8, borderBottomWidth: 1 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center' },
});
