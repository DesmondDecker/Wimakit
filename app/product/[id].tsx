import React, { useState, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Share, Alert, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { useProduct, useReviews } from '../../hooks/useApi';
import { useCartStore, useWishlistStore } from '../../store';
import { ProductCardSkeleton } from '../../components/ui/Skeleton';
import { formatPrice, formatDate, formatNumber } from '../../constants/data';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { BNPL_PLANS } from '../../constants/data';

const { width } = Dimensions.get('window');

const DetailRow = memo(({ label, value, colors }: { label: string; value: string; colors: any }) => (
  <View style={[s.detailRow, { borderBottomColor: colors.border }]}>
    <Text style={[s.detailLabel, { color: colors.textMuted }]}>{label}</Text>
    <Text style={[s.detailValue, { color: colors.textPrimary }]}>{value}</Text>
  </View>
));

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<'desc' | 'attributes' | 'reviews'>('desc');

  const addToCart = useCartStore((st) => st.addItem);
  const { toggle, isIn } = useWishlistStore();

  const { data: productData, isLoading } = useProduct(id ?? '');
  const { data: reviewsData } = useReviews(id ?? '');

  const product = productData?.product ?? productData?.data;
  const reviews = reviewsData?.reviews ?? [];
  const wishlisted = product ? isIn(product._id ?? product.id ?? '') : false;
  const discount = product?.originalPrice && product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) : null;
  const isFlash = !!(product?.flashSalePrice && product?.flashSaleEnd && new Date(product.flashSaleEnd) > new Date());
  const activePrice = isFlash ? product.flashSalePrice! : product?.price;

  const handleShare = useCallback(async () => {
    if (!product) return;
    await Share.share({ message: `${product.name} — ${formatPrice(product.price)}\nAvailable on WimaKit` });
  }, [product]);

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    addToCart(product as any, qty);
    Toast.show({ type: 'success', text1: '🛒 Added to cart!', text2: `${qty}× ${product.name}` });
  }, [addToCart, product, qty]);

  const handleBuyNow = useCallback(() => {
    if (!product) return;
    addToCart(product as any, qty);
    router.push('/cart' as any);
  }, [product, qty, addToCart, router]);

  if (isLoading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={s.loadingHeader}>
          <TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} /></TouchableOpacity>
        </View>
        <View style={{ padding: Spacing.lg }}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Product</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={s.notFoundWrap}>
          <MaterialCommunityIcons name="package-variant-closed" size={64} color={colors.textMuted} />
          <Text style={[s.notFoundText, { color: colors.textMuted }]}>Product not found</Text>
          <TouchableOpacity style={[s.goBackBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={s.goBackBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const attributes = product.attributes ? Object.entries(product.attributes) : [];

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{product.name}</Text>
        <View style={s.headerActions}>
          <TouchableOpacity onPress={() => toggle(product as any)} style={{ padding: 4 }}>
            <MaterialCommunityIcons name={wishlisted ? 'heart' : 'heart-outline'} size={22} color={wishlisted ? colors.error : colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="share-variant-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Image gallery */}
        <View style={{ backgroundColor: colors.surface }}>
          <ScrollView
            horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e => setImgIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
            style={{ width, height: 320 }}
          >
            {(product.images?.length ? product.images : ['https://placehold.co/600x400/1E1B4B/818CF8?text=WimaKit']).map((img: string, i: number) => (
              <Image key={i} source={{ uri: img }} style={{ width, height: 320 }} contentFit="contain" />
            ))}
          </ScrollView>
          {(product.images?.length ?? 0) > 1 && (
            <View style={s.dotsRow}>
              {product.images!.map((_: any, i: number) => (
                <View key={i} style={[s.dot, { backgroundColor: i === imgIdx ? colors.primary : colors.border, width: i === imgIdx ? 18 : 6 }]} />
              ))}
            </View>
          )}
          {/* Badges overlay */}
          <View style={s.imageBadges}>
            {isFlash && <View style={[s.badge, { backgroundColor: '#EF4444' }]}><Text style={s.badgeText}>⚡ FLASH SALE</Text></View>}
            {!isFlash && discount && discount > 0 && <View style={[s.badge, { backgroundColor: '#10B981' }]}><Text style={s.badgeText}>-{discount}% OFF</Text></View>}
            {product.isTrending && <View style={[s.badge, { backgroundColor: '#F59E0B' }]}><Text style={s.badgeText}>🔥 TRENDING</Text></View>}
            {product.bnplEligible && <View style={[s.badge, { backgroundColor: '#8B5CF6' }]}><Text style={s.badgeText}>📅 BNPL</Text></View>}
          </View>
        </View>

        <View style={{ padding: Spacing.lg }}>
          {/* Seller info */}
          {product.seller && (
            <TouchableOpacity style={s.sellerRow} onPress={() => router.push(`/profile/${product.seller?.profileSlug ?? product.seller?._id ?? product.seller?.id}` as any)}>
              <View style={[s.sellerAvatar, { backgroundColor: colors.primaryMuted }]}>
                {product.seller?.avatar
                  ? <Image source={{ uri: product.seller.avatar }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
                  : <Text style={[s.sellerAvatarLetter, { color: colors.primary }]}>{(product.seller?.storeName ?? product.seller?.name ?? 'S')[0].toUpperCase()}</Text>
                }
              </View>
              <Text style={[s.sellerName, { color: colors.primary }]} numberOfLines={1}>
                {product.seller?.storeName ?? product.seller?.name}
              </Text>
              {product.seller?.isVerified && <MaterialCommunityIcons name="check-decagram" size={14} color={colors.primary} />}
              <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          )}

          {/* Name & price */}
          <Text style={[s.name, { color: colors.textPrimary }]}>{product.name}</Text>

          <View style={s.priceRow}>
            <Text style={[s.price, { color: colors.primary }]}>{formatPrice(activePrice)}</Text>
            {product.originalPrice && product.originalPrice > (activePrice ?? 0) && (
              <Text style={[s.originalPrice, { color: colors.textMuted }]}>{formatPrice(product.originalPrice)}</Text>
            )}
          </View>

          {/* Rating + sold */}
          <View style={s.ratingRow}>
            <MaterialCommunityIcons name="star" size={16} color="#F59E0B" />
            <Text style={[s.ratingText, { color: colors.textPrimary }]}>{product.rating?.toFixed(1) ?? '0.0'}</Text>
            <Text style={[s.ratingCount, { color: colors.textMuted }]}>({product.totalReviews ?? 0} reviews)</Text>
            <Text style={[s.ratingCount, { color: colors.textMuted }]}>· {formatNumber(product.totalSold ?? 0)} sold</Text>
          </View>

          {/* Quick info chips */}
          <View style={s.chipsRow}>
            {product.condition && product.condition !== 'new' && (
              <View style={[s.chip, { backgroundColor: colors.warning + '20' }]}>
                <Text style={[s.chipText, { color: colors.warning }]}>{product.condition[0].toUpperCase() + product.condition.slice(1)}</Text>
              </View>
            )}
            <View style={[s.chip, { backgroundColor: colors.success + '15' }]}>
              <MaterialCommunityIcons name="truck-fast-outline" size={12} color={colors.success} />
              <Text style={[s.chipText, { color: colors.success }]}>{product.deliveryTime ?? '1-3 days'}</Text>
            </View>
            <View style={[s.chip, { backgroundColor: colors.info + '15' }]}>
              <MaterialCommunityIcons name="map-marker-outline" size={12} color={colors.info} />
              <Text style={[s.chipText, { color: colors.info }]}>{product.location ?? 'Freetown'}</Text>
            </View>
            {(product.stock ?? 0) < 10 && (product.stock ?? 0) > 0 && (
              <View style={[s.chip, { backgroundColor: colors.error + '15' }]}>
                <Text style={[s.chipText, { color: colors.error }]}>Only {product.stock} left!</Text>
              </View>
            )}
          </View>

          {/* Quantity selector */}
          <View style={[s.qtyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.qtyLabel, { color: colors.textMuted }]}>Quantity</Text>
            <View style={s.qtyControls}>
              <TouchableOpacity style={[s.qtyBtn, { backgroundColor: colors.surfaceAlt ?? colors.background }]} onPress={() => setQty(q => Math.max(product.minOrder ?? 1, q - 1))}>
                <MaterialCommunityIcons name="minus" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={[s.qtyValue, { color: colors.textPrimary }]}>{qty}</Text>
              <TouchableOpacity style={[s.qtyBtn, { backgroundColor: colors.surfaceAlt ?? colors.background }]} onPress={() => setQty(q => Math.min(product.stock ?? 99, q + 1))}>
                <MaterialCommunityIcons name="plus" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.stockText, { color: colors.textMuted }]}>{product.stock ?? 0} in stock</Text>
          </View>

          {/* BNPL banner */}
          {product.bnplEligible && (
            <TouchableOpacity style={[s.bnplBanner, { backgroundColor: '#8B5CF615', borderColor: '#8B5CF6' }]} onPress={() => router.push('/bnpl' as any)}>
              <MaterialCommunityIcons name="calendar-month" size={18} color="#8B5CF6" />
              <Text style={[s.bnplBannerText, { color: '#8B5CF6' }]}>
                Buy now from {formatPrice(Math.ceil((activePrice ?? 0) / 2), true)}/month — Pay in 2x interest-free
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color="#8B5CF6" />
            </TouchableOpacity>
          )}

          {/* Tabs */}
          <View style={s.tabsRow}>
            {(['desc', ...(attributes.length > 0 ? ['attributes'] : []), 'reviews'] as const).map(t => (
              <TouchableOpacity key={t} style={[s.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setTab(t as any)}>
                <Text style={[s.tabText, { color: tab === t ? colors.primary : colors.textMuted }]}>
                  {t === 'desc' ? 'Description' : t === 'attributes' ? 'Details' : `Reviews (${reviews.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab content */}
          {tab === 'desc' && (
            <View style={{ gap: 12 }}>
              <Text style={[s.description, { color: colors.textSecondary }]}>{product.description}</Text>
              {product.tags && product.tags.length > 0 && (
                <View style={s.tagsRow}>
                  {product.tags.map((t: string) => (
                    <View key={t} style={[s.tag, { backgroundColor: colors.primaryMuted }]}>
                      <Text style={[s.tagText, { color: colors.primary }]}>#{t}</Text>
                    </View>
                  ))}
                </View>
              )}
              {[
                ['Category', (product.category as any)?.name ?? product.subcategory ?? '—'],
                ['Condition', product.condition ? product.condition[0].toUpperCase() + product.condition.slice(1) : 'New'],
                ['Min. Order', `${product.minOrder ?? 1} unit(s)`],
                ['Listed', product.createdAt ? formatDate(product.createdAt) : '—'],
              ].map(([label, value]) => (
                <DetailRow key={label} label={label} value={value} colors={colors} />
              ))}
            </View>
          )}

          {tab === 'attributes' && attributes.length > 0 && (
            <View style={{ gap: 4 }}>
              {attributes.map(([key, value]) => {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const display = Array.isArray(value) ? value.join(', ') : String(value);
                return <DetailRow key={key} label={label} value={display} colors={colors} />;
              })}
            </View>
          )}

          {tab === 'reviews' && (
            <View>
              {reviews.length === 0 ? (
                <View style={s.noReviews}>
                  <MaterialCommunityIcons name="star-outline" size={40} color={colors.textMuted} />
                  <Text style={[{ color: colors.textMuted, fontSize: 14 }]}>No reviews yet. Be the first!</Text>
                </View>
              ) : (
                reviews.map((r: any) => (
                  <View key={r._id ?? r.id} style={[s.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={s.reviewHeader}>
                      <Text style={[s.reviewAuthor, { color: colors.textPrimary }]}>{r.user?.name ?? 'Anonymous'}</Text>
                      <View style={s.reviewStars}>
                        {[1,2,3,4,5].map(n => (
                          <MaterialCommunityIcons key={n} name="star" size={12} color={n <= r.rating ? '#F59E0B' : colors.border} />
                        ))}
                      </View>
                    </View>
                    <Text style={[s.reviewComment, { color: colors.textSecondary }]}>{r.comment}</Text>
                    <Text style={[s.reviewDate, { color: colors.textMuted }]}>{r.createdAt ? formatDate(r.createdAt) : ''}</Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom action bar */}
      {product.stock > 0 ? (
        <View style={[s.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Text style={[s.totalLabel, { color: colors.textMuted }]}>
            Total: <Text style={[s.totalPrice, { color: colors.primary }]}>{formatPrice((activePrice ?? 0) * qty)}</Text>
          </Text>
          <TouchableOpacity style={[s.cartBtn, { backgroundColor: colors.surfaceAlt ?? colors.background, borderColor: colors.border }]} onPress={handleAddToCart}>
            <MaterialCommunityIcons name="cart-plus" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.buyBtn]} onPress={handleBuyNow}>
            <LinearGradient colors={['#4F46E5', '#7C3AED']} style={s.buyBtnGradient} start={{ x:0, y:0 }} end={{ x:1, y:0 }}>
              <Text style={s.buyBtnText}>Buy Now</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[s.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={[s.outOfStockBar, { backgroundColor: colors.border }]}>
            <MaterialCommunityIcons name="package-variant-closed" size={18} color={colors.textMuted} />
            <Text style={[s.outOfStockText, { color: colors.textMuted }]}>Out of Stock</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  loadingHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  headerTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: 4 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingVertical: 10, alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },
  imageBadges: { position: 'absolute', top: 12, left: 12, flexDirection: 'column', gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.sm, borderRadius: Radius.lg, marginBottom: Spacing.sm },
  sellerAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sellerAvatarLetter: { fontSize: 14, fontWeight: '900' },
  sellerName: { fontSize: 13, fontWeight: '700' },
  name: { fontSize: FontSize.xl, fontWeight: '900', lineHeight: 28, marginBottom: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  price: { fontSize: 28, fontWeight: '900' },
  originalPrice: { fontSize: 16, textDecorationLine: 'line-through' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
  ratingText: { fontSize: 14, fontWeight: '700' },
  ratingCount: { fontSize: 12 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  chipText: { fontSize: 11, fontWeight: '700' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.md, gap: 10 },
  qtyLabel: { fontSize: 13, fontWeight: '600' },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 'auto' },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  qtyValue: { fontSize: 16, fontWeight: '800', minWidth: 24, textAlign: 'center' },
  stockText: { fontSize: 11 },
  bnplBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  bnplBannerText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  tabsRow: { flexDirection: 'row', marginBottom: Spacing.md },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '700' },
  description: { fontSize: 14, lineHeight: 22 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  tagText: { fontSize: 11, fontWeight: '600' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: '600' },
  noReviews: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  reviewCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, marginBottom: 10, gap: 6 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewStars: { flexDirection: 'row', gap: 2 },
  reviewAuthor: { fontSize: 13, fontWeight: '700' },
  reviewComment: { fontSize: 13, lineHeight: 19 },
  reviewDate: { fontSize: 11 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg, borderTopWidth: 1 },
  totalLabel: { flex: 1, fontSize: 12 },
  totalPrice: { fontSize: 15, fontWeight: '900' },
  cartBtn: { width: 46, height: 46, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  buyBtn: { flex: 2, borderRadius: Radius.xl, overflow: 'hidden' },
  buyBtnGradient: { paddingVertical: 13, alignItems: 'center' },
  buyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  outOfStockBar: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.xl },
  outOfStockText: { fontSize: 14, fontWeight: '700' },
  notFoundWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  notFoundText: { fontSize: 15 },
  goBackBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.lg },
  goBackBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
