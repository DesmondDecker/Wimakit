import React, { useCallback, memo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { useSellerProducts, useDeleteProduct } from '../../hooks/useApi';
import { HorizontalProductSkeleton } from '../../components/ui/Skeleton';
import { formatPrice } from '../../constants/data';
import { Button } from '../../components/ui/Button';
import { Spacing, Radius, FontSize } from '../../constants/theme';

const ProductRow = memo(({ product, onEdit, onDelete, colors }: any) => (
  <MotiView
    from={{ opacity: 0, translateX: -16 }}
    animate={{ opacity: 1, translateX: 0 }}
    transition={{ type: 'timing', duration: 300 }}
  >
    <View style={[styles.productRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Image
        source={{ uri: product.images?.[0] ?? '' }}
        style={styles.productImg}
        contentFit="cover"
        placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
      />
      <View style={styles.productInfo}>
        <Text style={[styles.productName, { color: colors.textPrimary }]} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={[styles.productPrice, { color: colors.primary }]}>
          {formatPrice(product.price)}
        </Text>
        <View style={styles.productMeta}>
          <View style={[
            styles.stockBadge,
            { backgroundColor: product.stock > 0 ? colors.successLight : colors.errorLight },
          ]}>
            <Text style={[
              styles.stockText,
              { color: product.stock > 0 ? colors.success : colors.error },
            ]}>
              {product.stock > 0 ? `✓ ${product.stock} in stock` : '✗ Out of stock'}
            </Text>
          </View>
          <Text style={[styles.soldText, { color: colors.textMuted }]}>
            {product.totalSold ?? 0} sold
          </Text>
        </View>
        <Text style={[styles.catText, { color: colors.textMuted }]}>
          {product.category?.name ?? product.category ?? 'Uncategorized'}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(product)}>
          <Text style={{ fontSize: 18 }}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onDelete(product)}>
          <Text style={{ fontSize: 18 }}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  </MotiView>
));

export default function MyProductsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data, isLoading, refetch } = useSellerProducts(
    statusFilter ? { status: statusFilter } : undefined
  );
  const { mutateAsync: deleteProduct, isPending: deleting } = useDeleteProduct();

  const products = data?.products ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleEdit = useCallback((product: any) => {
    router.push(`/seller/add-product?id=${product._id ?? product.id}` as any);
  }, [router]);

  const handleDelete = useCallback((product: any) => {
    Alert.alert(
      'Delete Product',
      `Remove "${product.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProduct(product._id ?? product.id);
              Toast.show({ type: 'success', text1: 'Product removed' });
            } catch {
              Toast.show({ type: 'error', text1: 'Failed to delete product' });
            }
          },
        },
      ]
    );
  }, [deleteProduct]);

  const renderItem = useCallback(({ item }: { item: any }) => (
    <ProductRow
      product={item}
      onEdit={handleEdit}
      onDelete={handleDelete}
      colors={colors}
    />
  ), [handleEdit, handleDelete, colors]);

  const keyExtractor = useCallback((item: any) => item._id ?? item.id, []);

  const FILTERS = [
    { id: undefined, label: 'All' },
    { id: 'active',  label: '✓ Active' },
    { id: 'inactive', label: '✗ Inactive' },
  ];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          My Products ({products.length})
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/seller/add-product')}
        >
          <Text style={styles.addBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* Filter pills */}
      <View style={[styles.filtersRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.id ?? 'all'}
            style={[
              styles.filterPill,
              {
                backgroundColor: statusFilter === f.id ? colors.primaryMuted : colors.background,
                borderColor: statusFilter === f.id ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setStatusFilter(f.id)}
          >
            <Text style={[
              styles.filterPillText,
              { color: statusFilter === f.id ? colors.primary : colors.textMuted },
            ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={{ padding: Spacing.lg }}>
          {[1, 2, 3, 4].map((i) => <HorizontalProductSkeleton key={i} />)}
        </View>
      ) : products.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={{ fontSize: 64 }}>🏪</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No products yet</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Add your first product to start selling on WimaKit
          </Text>
          <Button
            title="Add First Product →"
            onPress={() => router.push('/seller/add-product')}
            style={{ marginTop: Spacing.lg }}
          />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          removeClippedSubviews
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, fontWeight: '300', marginTop: -2 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', flex: 1, textAlign: 'center' },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 26 },
  filtersRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  filterPill: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5 },
  filterPillText: { fontSize: FontSize.sm, fontWeight: '600' },
  productRow: { flexDirection: 'row', borderRadius: Radius.lg, marginBottom: Spacing.md, borderWidth: 1, overflow: 'hidden', alignItems: 'center' },
  productImg: { width: 88, height: 88 },
  productInfo: { flex: 1, padding: Spacing.md, gap: 4 },
  productName: { fontSize: FontSize.sm, fontWeight: '700', lineHeight: 18 },
  productPrice: { fontSize: FontSize.md, fontWeight: '900' },
  productMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  stockBadge: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  stockText: { fontSize: 10, fontWeight: '700' },
  soldText: { fontSize: 10 },
  catText: { fontSize: 10 },
  actions: { flexDirection: 'column', gap: Spacing.sm, padding: Spacing.md },
  actionBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '800' },
  emptySub: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
});
