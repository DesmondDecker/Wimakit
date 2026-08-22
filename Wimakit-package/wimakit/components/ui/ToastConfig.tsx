import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LightColors as Colors, Radius, Spacing, FontSize, Shadow } from '../../constants/theme';

const ToastBase = ({
  text1,
  text2,
  bg,
  icon,
}: {
  text1?: string;
  text2?: string;
  bg: string;
  icon: string;
}) => (
  <View style={[styles.container, { backgroundColor: bg }, Shadow.lg]}>
    <MaterialCommunityIcons name={icon as any} size={20} color="#fff" style={styles.icon} />
    <View style={styles.texts}>
      {text1 ? <Text style={styles.title}>{text1}</Text> : null}
      {text2 ? <Text style={styles.sub}>{text2}</Text> : null}
    </View>
  </View>
);

export const toastConfig = {
  success: ({ text1, text2 }: any) => (
    <ToastBase text1={text1} text2={text2} bg={Colors.primary} icon="check-circle-outline" />
  ),
  error: ({ text1, text2 }: any) => (
    <ToastBase text1={text1} text2={text2} bg={Colors.error} icon="close-circle-outline" />
  ),
  info: ({ text1, text2 }: any) => (
    <ToastBase text1={text1} text2={text2} bg={Colors.info} icon="information-outline" />
  ),
  cart: ({ text1, text2 }: any) => (
    <ToastBase text1={text1} text2={text2} bg={Colors.secondary} icon="cart-outline" />
  ),
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    gap: Spacing.md,
  },
  icon: { fontSize: 20 },
  texts: { flex: 1 },
  title: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.md },
  sub: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, marginTop: 2 },
});
