import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { useTheme } from '../../context/ThemeContext';
import { useCartStore, useWishlistStore } from '../../store';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import { formatPrice } from '../../constants/data';
import Toast from 'react-native-toast-message';

interface ProductCardProps {
  product: any;
  horizontal?: boolean;
  index?: number;
}

export const ProductCard = memo(({ product, horizontal = false, index = 0 }: ProductCardProps) => {
  const router = useRouter();
  const { colors } = useTheme();
  const addItem = useCartStore((s) => s.addItem);
  const { items, toggle } = useWishlistStore();

  const productId = product.id || (product as any)._id;
  const isSaved = items.some((item: any) => (item.id || item._id) === productId);

  const handlePress = () => {
    router.push(`/product/${product.id || (product as any)._id}` as any);
  };

  const onAddToCart = (e: any) => {
    e.stopPropagation();
    addItem(product, 1);
  };

  const onBuyNow = (e: any) => {
    e.stopPropagation();
    addItem(product, 1);
    router.push('/cart' as any);
  };

  const onToggleWishlist = (e: any) => {
    e.stopPropagation();
    toggle(product);
  };

  if (horizontal) {
    return (
      <TouchableOpacity 
        style={[styles.cardHoriz, { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 }]} 
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <Image source={{ uri: product.images?.[0] }} style={styles.imageHoriz} contentFit="cover" transition={200} />
        <View style={styles.contentHoriz}>
          <View style={styles.topRow}>
            <Text style={[styles.storeName, { color: colors.textMuted }]} numberOfLines={1}>
              {product.seller?.storeName || 'Local Shop'}
            </Text>
            <TouchableOpacity onPress={onToggleWishlist} hitSlop={12}>
              <Text style={{ fontSize: 20 }}>{isSaved ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>{product.name}</Text>
          <View style={styles.bottomRow}>
            <Text style={[styles.price, { color: colors.primary }]}>{formatPrice(product.price)}</Text>
            <TouchableOpacity 
              style={[styles.addBtnSmall, { backgroundColor: colors.primary + '15' }]} 
              onPress={onAddToCart}
            >
              <Text style={[styles.addBtnText, { color: colors.primary }]}>+ Add</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity 
            style={[styles.buyBtnSmall, { backgroundColor: colors.primary }]} 
            onPress={onBuyNow}
          >
            <Text style={styles.buyBtnTextSmall}>Buy Now</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <MotiView
      from={{ opacity: 0, translateY: 20 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 500, delay: index * 40 }}
      style={{ flex: 1 }}
    >
      <TouchableOpacity 
        style={[styles.card, { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, elevation: 3 }]} 
        onPress={handlePress}
        activeOpacity={0.9}
      >
        <View style={styles.imageContainer}>
          <Image 
            source={{ uri: product.images?.[0] }} 
            style={styles.image} 
            contentFit="cover" 
            transition={400} 
          />
          <TouchableOpacity 
            style={[styles.wishlistBtn, { backgroundColor: colors.surface + 'B3' }]} 
            onPress={onToggleWishlist}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 14 }}>{isSaved ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <Text style={[styles.storeName, { color: colors.textMuted }]} numberOfLines={1}>
            {product.seller?.storeName || 'Local Shop'}
          </Text>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>{product.name}</Text>
          <View style={styles.footer}>
            <Text style={[styles.price, { color: colors.textPrimary }]}>{formatPrice(product.price)}</Text>
            <View style={styles.ratingRow}>
              <Text style={{ fontSize: 10 }}>⭐</Text>
              <Text style={[styles.ratingText, { color: colors.textSecondary }]}>{product.rating || '4.8'}</Text>
            </View>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border + '30' }]} 
              onPress={onAddToCart}
            >
              <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: colors.primary }]} 
              onPress={onBuyNow}
            >
              <Text style={[styles.actionBtnText, { color: '#fff' }]}>Buy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </MotiView>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: Radius.xl, overflow: 'hidden', marginBottom: Spacing.lg, flex: 1 },
  imageContainer: { width: '100%', aspectRatio: 1, backgroundColor: '#f9f9f9' },
  image: { width: '100%', height: '100%' },
  wishlistBtn: { position: 'absolute', top: Spacing.sm, right: Spacing.sm, width: 34, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  content: { padding: Spacing.md, gap: 4 },
  storeName: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  name: { fontSize: FontSize.sm, fontWeight: '500', lineHeight: 20, height: 40 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.xs },
  price: { fontSize: FontSize.md, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 11, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 6, marginTop: Spacing.sm },
  actionBtn: { flex: 1, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  actionBtnText: { fontSize: 11, fontWeight: '700' },

  cardHoriz: { flexDirection: 'row', borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.md, gap: Spacing.lg, alignItems: 'center' },
  imageHoriz: { width: 96, height: 96, borderRadius: Radius.lg, backgroundColor: '#f9f9f9' },
  contentHoriz: { flex: 1, gap: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  addBtnSmall: { paddingHorizontal: Spacing.lg, paddingVertical: 8, borderRadius: Radius.full },
  addBtnText: { fontSize: 12, fontWeight: '800' },
  buyBtnSmall: { marginTop: 8, paddingVertical: 8, borderRadius: Radius.md, alignItems: 'center' },
  buyBtnTextSmall: { color: '#fff', fontSize: 12, fontWeight: '700' },
});