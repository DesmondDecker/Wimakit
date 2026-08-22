import React, { useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { useTheme } from '../context/ThemeContext';
import { useWishlistStore, useCartStore } from '../store';
import { ProductCard } from '../components/product/ProductCard';
import { Button } from '../components/ui/Button';
import { Spacing, Radius, FontSize } from '../constants/theme';
import type { Product } from '../constants/data';

export default function WishlistScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { items, toggle: removeItem } = useWishlistStore();
  const addToCart = useCartStore((s) => s.addItem);

  const handleAddAll = useCallback(() => {
    Alert.alert('Add All to Cart', `Add all ${items.length} items to cart?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add All',
        onPress: () => items.forEach((p) => addToCart(p, 1)),
      },
    ]);
  }, [items, addToCart]);

  const renderItem = useCallback(({ item, index }: { item: Product; index: number }) => (
    <MotiView
      from={{ opacity: 0, translateX: -20 }}
      animate={{ opacity: 1, translateX: 0 }}
      transition={{ type: 'timing', duration: 300, delay: index * 60 }}
    >
      <ProductCard product={item} horizontal index={index} />
    </MotiView>
  ), []);

  const keyExtractor = useCallback((item: any) => item.id || item._id, []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Wishlist ({items.length})
        </Text>
        {items.length > 0 ? (
          <TouchableOpacity onPress={handleAddAll}>
            <Text style={[styles.addAllText, { color: colors.primary }]}>Add All</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="heart-outline" size={72} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No saved items</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Tap ❤️ on any product to save it here for later
          </Text>
          <Button
            title="Browse Products"
            onPress={() => router.replace('/(tabs)' as any)}
            style={{ marginTop: Spacing.xl }}
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 36, fontWeight: '100', marginTop: -4 }, // Consistent with other headers
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700' }, // Consistent with other headers
  addAllText: { fontSize: FontSize.sm, fontWeight: '700' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '800' },
  emptySub: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
});
