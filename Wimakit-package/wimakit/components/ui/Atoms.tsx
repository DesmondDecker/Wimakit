import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Radius, FontSize, Spacing } from '../../constants/theme';

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'muted';

interface BadgeProps {
  label:    string | number;
  variant?: BadgeVariant;
  size?:    'sm' | 'md';
  dot?:     boolean;
}

export function Badge({ label, variant = 'primary', size = 'md', dot = false }: BadgeProps) {
  const { colors } = useTheme();

  const bgMap: Record<BadgeVariant, string> = {
    primary:   colors.primary,
    secondary: colors.secondaryMuted,
    success:   colors.successLight,
    error:     colors.errorLight,
    warning:   colors.warningLight,
    muted:     colors.surface,
  };
  const textColorMap: Record<BadgeVariant, string> = {
    primary:   colors.textInverse,
    secondary: colors.textPrimary,
    success:   colors.success,
    error:     colors.error,
    warning:   colors.warning,
    muted:     colors.textMuted,
  };

  if (dot) {
    return (
      <View style={[styles.dot, { backgroundColor: textColorMap[variant] }]} />
    );
  }

  return (
    <View style={[
      styles.badge,
      { backgroundColor: bgMap[variant] },
      size === 'sm' ? styles.badgeSm : styles.badgeMd,
    ]}>
      <Text style={[
        styles.badgeText,
        { color: textColorMap[variant] },
        size === 'sm' ? styles.badgeTextSm : styles.badgeTextMd,
      ]}>
        {label}
      </Text>
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
interface AvatarProps {
  uri?:      string;
  name?:     string;
  size?:     number;
  verified?: boolean;
}

export function Avatar({ uri, name = '?', size = 40, verified = false }: AvatarProps) {
  const { colors } = useTheme();
  const initials = name
    .split(' ').slice(0, 2)
    .map((n) => n[0] ?? '').join('').toUpperCase();

  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <View style={[
          styles.avatarPlaceholder,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primaryLight ?? colors.primary },
        ]}>
          <Text style={[styles.avatarInitials, { fontSize: size * 0.36, color: '#FFFFFF' }]}>
            {initials}
          </Text>
        </View>
      )}
      {verified && (
        <View style={[
          styles.verifiedBadge,
          {
            width: size * 0.32, height: size * 0.32,
            borderRadius: size * 0.16,
            backgroundColor: colors.secondary,
            borderColor: colors.surface, // Changed emoji to MaterialCommunityIcons name
          },
        ]}>
          <MaterialCommunityIcons name="check" size={size * 0.18} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

// ─── StarRating ───────────────────────────────────────────────────────────────
interface StarRatingProps {
  rating:     number;
  maxStars?:  number;
  size?:      number;
  showCount?: boolean;
  count?:     number;
}

export function StarRating({
  rating, maxStars = 5, size = 14, showCount = false, count = 0,
}: StarRatingProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.starRow}>
      {Array.from({ length: maxStars }).map((_, i) => (
        <Text
          key={i}
          style={{ fontSize: size, color: i < Math.round(rating) ? colors.primary : colors.border }}
        >
          ★
        </Text>
      ))}
      {showCount && (
        <Text style={{ fontSize: size - 2, color: colors.textMuted, marginLeft: 2 }}>
          {rating.toFixed(1)} ({count})
        </Text>
      )}
    </View>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────
interface DividerProps {
  label?:         string;
  color?:         string;
  marginVertical?: number;
}

export function Divider({ label, color, marginVertical = Spacing.lg }: DividerProps) {
  const { colors } = useTheme();
  const lineColor = color ?? colors.border;

  if (!label) {
    return (
      <View style={[styles.divider, { backgroundColor: lineColor, marginVertical }]} />
    );
  }
  return (
    <View style={[styles.dividerRow, { marginVertical }]}>
      <View style={[styles.dividerLine, { backgroundColor: lineColor }]} />
      <Text style={[styles.dividerLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={[styles.dividerLine, { backgroundColor: lineColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  dot:               { width: 8, height: 8, borderRadius: 4 },
  badge:             { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 3 },
  badgeSm:           { paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  badgeMd:           { paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  badgeText:         { fontWeight: '700' },
  badgeTextSm:       { fontSize: FontSize.xs },
  badgeTextMd:       { fontSize: FontSize.sm },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials:    { fontWeight: '900' },
  verifiedBadge:     { position: 'absolute', bottom: -2, right: -2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0F1626' },
  starRow:           { flexDirection: 'row', alignItems: 'center' },
  divider:           { height: 1 },
  dividerRow:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dividerLine:       { flex: 1, height: 1 },
  dividerLabel:      { fontSize: FontSize.sm, fontWeight: '500', paddingHorizontal: Spacing.sm },
});
