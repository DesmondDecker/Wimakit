import React from 'react';
import {
  TouchableOpacity, Text, StyleSheet, ActivityIndicator,
  ViewStyle, TextStyle, View,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Radius, FontSize, Spacing } from '../../constants/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title:         string;
  onPress:       () => void;
  variant?:      Variant;
  size?:         Size;
  loading?:      boolean;
  disabled?:     boolean;
  icon?:         React.ReactNode;
  iconPosition?: 'left' | 'right';
  style?:        ViewStyle;
  textStyle?:    TextStyle;
  fullWidth?:    boolean;
}

export function Button({
  title, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false,
  icon, iconPosition = 'left',
  style, textStyle, fullWidth = false,
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const bgMap: Record<Variant, string> = {
    primary:   colors.primary,
    secondary: colors.secondary,
    outline:   'transparent',
    ghost:     colors.surface,
    danger:    colors.error,
  };

  const textMap: Record<Variant, string> = {
    primary:   '#111111',
    secondary: colors.textInverse,
    outline:   colors.primary,
    ghost:     colors.textPrimary,
    danger:    colors.textInverse,
  };

  const borderMap: Record<Variant, string | undefined> = {
    primary:   undefined,
    secondary: undefined,
    outline:   colors.border,
    ghost:     colors.border,
    danger:    undefined,
  };

  const sizeStyle: Record<Size, ViewStyle> = {
    sm: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.xl },
    md: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.xxl },
    lg: { paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.lg, borderRadius: Radius.xxl },
  };

  const fontSizeMap: Record<Size, number> = {
    sm: FontSize.sm, md: FontSize.md, lg: FontSize.lg,
  };

  return (
    <TouchableOpacity
      style={[
        styles.base,
        sizeStyle[size],
        { backgroundColor: bgMap[variant] },
        borderMap[variant] ? { borderWidth: 1.5, borderColor: borderMap[variant] } : null,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        styles.shadow,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.88}
    >
      {loading ? (
        <ActivityIndicator
          color={textMap[variant]}
          size="small"
        />
      ) : (
        <>
          {icon && iconPosition === 'left'  && <View style={styles.icon}>{icon}</View>}
          <Text style={[styles.text, { color: textMap[variant], fontSize: fontSizeMap[size] }, textStyle]}>
            {title}
          </Text>
          {icon && iconPosition === 'right' && <View style={styles.icon}>{icon}</View>}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  fullWidth: { width: '100%' },
  disabled:  { opacity: 0.55 },
  text:      { fontWeight: '800', letterSpacing: 0.35 },
  icon:      { marginHorizontal: 6 },
  shadow:    { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 4 },
});
