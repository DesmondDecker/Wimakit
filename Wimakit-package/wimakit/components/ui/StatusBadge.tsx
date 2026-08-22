import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Radius, Spacing, FontSize } from '../../constants/theme';

interface StatusBadgeProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
  colors: any; // Theme colors
}

export const StatusBadge = ({ label, variant = 'secondary', colors }: StatusBadgeProps) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':   return { backgroundColor: colors.primaryMuted, color: colors.primary };
      case 'secondary': return { backgroundColor: colors.secondaryMuted, color: colors.secondary };
      case 'success':   return { backgroundColor: colors.successMuted, color: colors.success };
      case 'error':     return { backgroundColor: colors.errorMuted, color: colors.error };
      case 'warning':   return { backgroundColor: colors.warningMuted, color: colors.warning };
      case 'info':      return { backgroundColor: colors.infoMuted, color: colors.info };
      default:          return { backgroundColor: colors.surface, color: colors.textMuted };
    }
  };

  const variantStyles = getVariantStyles();

  return (
    <View style={[styles.badge, { backgroundColor: variantStyles.backgroundColor }]}>
      <Text style={[styles.text, { color: variantStyles.color }]}>{label.toUpperCase()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 9, // Smaller font size for status chips
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});