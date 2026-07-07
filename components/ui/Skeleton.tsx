import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { MotiView } from 'moti';
import { useTheme } from '../../context/ThemeContext';
import { Radius, Spacing } from '../../constants/theme';

const { width } = Dimensions.get('window');
// Perfectly matches the grid: (TotalWidth - SideMargins - GapBetweenItems) / 2
const CARD_W = (width - (Spacing.lg * 2) - Spacing.md) / 2;

function Shimmer({
  w, h, radius = 8, style,
}: { w: number | string; h: number; radius?: number; style?: object }) {
  const { colors } = useTheme();
  return (
    <MotiView
      from={{ opacity: 0.35 }}
      animate={{ opacity: 0.85 }}
      transition={{ type: 'timing', duration: 900, loop: true, repeatReverse: true }}
      style={[
        { width: w as number, height: h, borderRadius: radius, backgroundColor: colors.skeleton },
        style,
      ]}
    />
  );
}

export function ProductCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.card, { width: CARD_W, backgroundColor: colors.surface }]}>
      <Shimmer w="100%" h={150} radius={0} />
      <View style={sk.cardBody}>
        <Shimmer w="45%" h={10} />
        <Shimmer w="88%" h={14} style={{ marginTop: 8 }} />
        <Shimmer w="65%" h={12} style={{ marginTop: 6 }} />
        <Shimmer w="42%" h={18} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={sk.grid}>
      {Array.from({ length: count }).map((_, i) => <ProductCardSkeleton key={i} />)}
    </View>
  );
}

export function HorizontalProductSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.hRow, { backgroundColor: colors.surface }]}>
      <Shimmer w={100} h={100} radius={12} />
      <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
        <Shimmer w="55%" h={10} />
        <Shimmer w="88%" h={14} />
        <Shimmer w="65%" h={12} />
        <Shimmer w="42%" h={18} />
      </View>
    </View>
  );
}

export function CategoryPillSkeleton() {
  return (
    <View style={sk.pillRow}>
      {[70, 90, 80, 100, 75, 85].map((w, i) => (
        <Shimmer key={i} w={w} h={36} radius={18} style={{ marginRight: 10 }} />
      ))}
    </View>
  );
}

export function ProductDetailSkeleton() {
  return (
    <View style={{ flex: 1 }}>
      <Shimmer w="100%" h={340} radius={0} />
      <View style={{ padding: 16, gap: 12 }}>
        <Shimmer w="40%" h={12} />
        <Shimmer w="88%" h={26} />
        <Shimmer w="95%" h={20} />
        <Shimmer w="35%" h={30} radius={8} />
        <Shimmer w="100%" h={80} radius={12} />
        <View style={{ height: 1, backgroundColor: '#eee' }} />
        <Shimmer w="100%" h={100} radius={6} />
      </View>
    </View>
  );
}

export function OrderCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.orderCard, { backgroundColor: colors.surface }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
        <Shimmer w="40%" h={14} />
        <Shimmer w={72} h={24} radius={12} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Shimmer w={72} h={72} radius={10} />
        <View style={{ flex: 1, gap: 8 }}>
          <Shimmer w="80%" h={13} />
          <Shimmer w="55%" h={11} />
          <Shimmer w="35%" h={17} />
        </View>
      </View>
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={{ flex: 1 }}>
      <Shimmer w="100%" h={220} radius={0} />
      <View style={{ padding: 16, marginTop: -40, flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
        <Shimmer w={80} h={80} radius={40} />
        <View style={{ flex: 1, gap: 8 }}>
          <Shimmer w="60%" h={18} />
          <Shimmer w="40%" h={12} />
        </View>
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        <Shimmer w="100%" h={80} radius={12} />
        <ProductGridSkeleton count={4} />
      </View>
    </View>
  );
}

export function HomeBannerSkeleton() {
  return (
    <Shimmer
      w={width - 32}
      h={200}
      radius={20}
      style={{ marginHorizontal: 16, marginBottom: 16 }}
    />
  );
}

export function DashboardStatsSkeleton() {
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <Shimmer w="60%" h={28} radius={8} />
          <Shimmer w="80%" h={12} radius={6} />
        </View>
      ))}
    </View>
  );
}

export function PostCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.postCard, { backgroundColor: colors.surface }]}>
      {/* Author header: avatar + name/timestamp */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Shimmer w={40} h={40} radius={20} />
        <View style={{ flex: 1, gap: 6 }}>
          <Shimmer w="40%" h={13} />
          <Shimmer w="25%" h={10} />
        </View>
      </View>
      {/* Post body text */}
      <View style={{ gap: 8, marginBottom: 12 }}>
        <Shimmer w="100%" h={14} />
        <Shimmer w="92%" h={14} />
        <Shimmer w="60%" h={14} />
      </View>
      {/* Optional media area */}
      <Shimmer w="100%" h={180} radius={12} style={{ marginBottom: 12 }} />
      {/* Reaction bar */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Shimmer w={50} h={20} radius={10} />
        <Shimmer w={50} h={20} radius={10} />
        <Shimmer w={50} h={20} radius={10} />
      </View>
    </View>
  );
}

export function PostFeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => <PostCardSkeleton key={i} />)}
    </View>
  );
}

export function DashboardSkeleton() {
  return (
    <View style={{ padding: 16, gap: 16 }}>
      <DashboardStatsSkeleton />
      {Array.from({ length: 4 }).map((_, i) => <HorizontalProductSkeleton key={i} />)}
    </View>
  );
}

const sk = StyleSheet.create({
  card: { borderRadius: Radius.lg, overflow: 'hidden', marginBottom: Spacing.md },
  cardBody: { padding: Spacing.md, gap: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, paddingHorizontal: Spacing.lg },
  hRow: { flexDirection: 'row', gap: 12, marginBottom: Spacing.md, borderRadius: Radius.lg, overflow: 'hidden', padding: Spacing.md },
  pillRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8 },
  orderCard: { padding: Spacing.lg, borderRadius: Radius.lg, marginBottom: Spacing.md },
  postCard: { padding: Spacing.lg, borderRadius: Radius.lg, marginBottom: Spacing.md },
});
