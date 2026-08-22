import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView, MotiText } from 'moti';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store';
import { Spacing, Radius, FontSize } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

const FEATURES = [
  { icon: '🛵', title: 'Fast Delivery',       desc: 'From Freetown markets to your door in hours' },
  { icon: '🏪', title: 'Local Sellers',        desc: '100+ verified vendors — shops, farms & kitchens' },
  { icon: '💵', title: 'Pay Your Way',         desc: 'Orange Money, Afrimoney, MoneyMi or cash' },
  { icon: '🤝', title: 'Support Local',        desc: 'Every order supports a local Sierra Leonean business' },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);

  // If already logged in, skip to tabs
  useEffect(() => {
    if (user) router.replace('/(tabs)');
  }, [user]);

  return (
    <View style={[styles.root, { backgroundColor: colors.primary }]}>
      {/* Animated background shapes */}
      <MotiView
        from={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1.4, opacity: 0.1 }}
        transition={{ type: 'timing', duration: 3000, loop: true, repeatReverse: true }}
        style={[styles.bgCircle1, { backgroundColor: colors.accent }]}
      />
      <MotiView
        from={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 0.8, opacity: 0.08 }}
        transition={{ type: 'timing', duration: 4000, loop: true, repeatReverse: true }}
        style={[styles.bgCircle2, { backgroundColor: colors.secondary }]}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Logo + tagline */}
        <MotiView
          from={{ opacity: 0, translateY: -30 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 700 }}
          style={styles.logoWrap}
        >
          <Text style={styles.logo}>
            <Text style={styles.logoWima}>wima</Text>
            <Text style={styles.logoKit}>kit</Text>
          </Text>
          <Text style={styles.tagline}>di makit na you phone 🇸🇱</Text>
          <Text style={styles.subTagline}>Freetown's Local Marketplace</Text>
        </MotiView>

        {/* Feature cards */}
        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <MotiView
              key={f.title}
              from={{ opacity: 0, translateX: i % 2 === 0 ? -40 : 40 }}
              animate={{ opacity: 1, translateX: 0 }}
              transition={{ type: 'timing', duration: 500, delay: 200 + i * 100 }}
              style={[styles.featureCard, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
            >
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </MotiView>
          ))}
        </View>

        {/* CTA buttons */}
        <MotiView
          from={{ opacity: 0, translateY: 40 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 600, delay: 700 }}
          style={styles.ctas}
        >
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/(auth)/register')}
            activeOpacity={0.88}
          >
            <Text style={styles.primaryBtnText}>Get Started — It's Free</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>I already have an account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.8}
          >
            <Text style={styles.ghostBtnText}>Browse without signing in →</Text>
          </TouchableOpacity>
        </MotiView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1 },
  safe:  { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.xl },

  bgCircle1: { position: 'absolute', width: 400, height: 400, borderRadius: 200, top: -100, right: -100 },
  bgCircle2: { position: 'absolute', width: 300, height: 300, borderRadius: 150, bottom: -50, left: -80 },

  logoWrap:   { alignItems: 'center', marginTop: Spacing.xl },
  logo:       { fontSize: 60, fontWeight: '900', letterSpacing: -2 },
  logoWima:   { color: '#FFFFFF' },
  logoKit:    { color: '#F5C842' },
  tagline:    { color: 'rgba(255,255,255,0.9)', fontSize: FontSize.lg, fontWeight: '700', marginTop: Spacing.sm },
  subTagline: { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.sm, marginTop: 4 },

  features: { width: '100%', paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  featureCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg },
  featureIcon: { fontSize: 28, width: 40, textAlign: 'center' },
  featureText: { flex: 1 },
  featureTitle: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: '800' },
  featureDesc:  { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm, marginTop: 2, lineHeight: 18 },

  ctas: { width: '100%', paddingHorizontal: Spacing.xl, gap: Spacing.md },
  primaryBtn: {
    backgroundColor: '#FFFFFF', borderRadius: Radius.xl,
    paddingVertical: Spacing.lg, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 20, elevation: 12,
  },
  primaryBtnText: { color: '#1A4D1A', fontSize: FontSize.lg, fontWeight: '900' },

  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.xl,
    paddingVertical: Spacing.md, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
  },
  secondaryBtnText: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: '700' },

  ghostBtn:     { alignItems: 'center', paddingVertical: Spacing.sm },
  ghostBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.sm, fontWeight: '600' },
});
