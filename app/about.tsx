import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { Spacing, Radius, FontSize } from '../constants/theme';
import { APP_NAME, APP_VERSION, COMPANY_NAME, APP_TAGLINE } from '../constants/data';

const TEAM_FEATURES = [
  { icon: 'shopping-outline',      label: 'Multi-vendor marketplace',   desc: 'Shop from thousands of local sellers' },
  { icon: 'shield-check-outline',  label: 'Escrow protection',          desc: 'Your money held safely until delivery' },
  { icon: 'calendar-month',        label: 'Buy Now Pay Later',          desc: 'Split payments in 2x, 3x, 6x, 12x' },
  { icon: 'bank-outline',          label: 'Quick Loans',                desc: 'Micro to business loans in hours' },
  { icon: 'account-group-outline', label: 'WimaKit Community',          desc: 'Social feed for buyers and sellers' },
  { icon: 'moped-outline',         label: 'Fast Local Delivery',        desc: 'Tracked deliveries across Sierra Leone' },
  { icon: 'truck-fast-outline',    label: 'Free delivery',              desc: 'Free on orders over Le 500K' },
  { icon: 'wallet-outline',        label: 'Digital Wallet',             desc: 'Orange Money, AfriMoney, MoneyMi' },
];

const COMPANY_VALUES = [
  { icon: '🌍', title: 'Local First',    desc: 'Built in Sierra Leone, for Sierra Leoneans. We empower local entrepreneurs and communities.' },
  { icon: '🔒', title: 'Trust & Safety', desc: 'Escrow protection, KYC verification, and 24/7 dispute resolution keep every transaction safe.' },
  { icon: '💡', title: 'Innovation',     desc: 'BNPL, community commerce, and smart logistics — bringing world-class fintech to West Africa.' },
  { icon: '🤝', title: 'Community',      desc: 'More than a marketplace — a platform where people connect, share, and grow together.' },
];

const STATS = [
  { value: 'Growing', label: 'Products' },
  { value: 'Local',   label: 'Sellers' },
  { value: 'SL-Wide', label: 'Community' },
  { value: '16',      label: 'Districts' },
];

export default function AboutScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>About WimaKit</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Hero */}
        <LinearGradient colors={['#4F46E5', '#7C3AED']} style={s.hero}>
          <MotiView from={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 14 }} style={s.logoWrap}>
            <MaterialCommunityIcons name="shopping" size={52} color="#fff" />
          </MotiView>
          <Text style={s.heroTitle}>{APP_NAME}</Text>
          <Text style={s.heroTagline}>{APP_TAGLINE}</Text>
          <Text style={s.heroVersion}>Version {APP_VERSION}</Text>
        </LinearGradient>

        {/* Built by */}
        <View style={[s.builtByCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[s.builtByIcon, { backgroundColor: colors.primaryMuted }]}>
            <Text style={{ fontSize: 28 }}>🏢</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.builtByLabel, { color: colors.textMuted }]}>Built with ❤️ by</Text>
            <Text style={[s.builtByName, { color: colors.textPrimary }]}>{COMPANY_NAME}</Text>
            <Text style={[s.builtByTagline, { color: colors.textMuted }]}>
              Technology solutions for Sierra Leone and West Africa
            </Text>
          </View>
        </View>

        {/* Mission */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Our Mission</Text>
          <View style={[s.missionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.missionText, { color: colors.textSecondary }]}>
              WimaKit exists to democratize commerce in Sierra Leone. We believe every local entrepreneur
              deserves access to world-class tools — a marketplace, payment protection, flexible financing,
              and a community that supports their growth.
            </Text>
            <Text style={[s.missionText, { color: colors.textSecondary, marginTop: 12 }]}>
              From a farmer in Bo selling fresh produce to a tech seller in Freetown, WimaKit gives
              every Sierra Leonean the digital tools to trade, grow, and thrive.
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>WimaKit by the Numbers</Text>
          <View style={s.statsGrid}>
            {STATS.map((stat, i) => (
              <MotiView key={stat.label}
                from={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 80, type: 'spring' }}
                style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <LinearGradient colors={['#4F46E5', '#7C3AED']} style={s.statGradient}>
                  <Text style={s.statValue}>{stat.value}</Text>
                </LinearGradient>
                <Text style={[s.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
              </MotiView>
            ))}
          </View>
        </View>

        {/* Features */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Platform Features</Text>
          <View style={[s.featuresCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {TEAM_FEATURES.map((f, i) => (
              <View key={f.label} style={[s.featureRow, { borderBottomColor: colors.border, borderBottomWidth: i < TEAM_FEATURES.length - 1 ? 1 : 0 }]}>
                <View style={[s.featureIcon, { backgroundColor: colors.primaryMuted }]}>
                  <MaterialCommunityIcons name={f.icon as any} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.featureLabel, { color: colors.textPrimary }]}>{f.label}</Text>
                  <Text style={[s.featureDesc, { color: colors.textMuted }]}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Values */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Our Values</Text>
          <View style={s.valuesGrid}>
            {COMPANY_VALUES.map((v, i) => (
              <MotiView key={v.title}
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ delay: i * 80, type: 'timing', duration: 350 }}
                style={[s.valueCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={s.valueEmoji}>{v.icon}</Text>
                <Text style={[s.valueTitle, { color: colors.textPrimary }]}>{v.title}</Text>
                <Text style={[s.valueDesc, { color: colors.textMuted }]}>{v.desc}</Text>
              </MotiView>
            ))}
          </View>
        </View>

        {/* Contact / Links */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Get in Touch</Text>
          <View style={[s.linksCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {[
              { icon: 'email-outline',   label: 'support@wimakit.com',     action: () => Linking.openURL('mailto:support@wimakit.com'), color: '#4F46E5' },
              { icon: 'web',             label: 'www.wimakit.com',          action: () => Linking.openURL('https://wimakit.com'), color: '#10B981' },
              { icon: 'phone-outline',   label: '+232 76 000 000',           action: () => Linking.openURL('tel:+23276000000'), color: '#F59E0B' },
              { icon: 'instagram',       label: '@wimakit',                 action: () => Linking.openURL('https://instagram.com/wimakit'), color: '#EC4899' },
              { icon: 'facebook',        label: 'WimaKit Sierra Leone',     action: () => Linking.openURL('https://facebook.com/wimakit'), color: '#3B82F6' },
            ].map((link, i, arr) => (
              <TouchableOpacity key={link.label} style={[s.linkRow, { borderBottomColor: colors.border, borderBottomWidth: i < arr.length - 1 ? 1 : 0 }]} onPress={link.action}>
                <View style={[s.linkIcon, { backgroundColor: link.color + '20' }]}>
                  <MaterialCommunityIcons name={link.icon as any} size={18} color={link.color} />
                </View>
                <Text style={[s.linkLabel, { color: colors.textPrimary }]}>{link.label}</Text>
                <MaterialCommunityIcons name="open-in-new" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Legal */}
        <View style={s.section}>
          <View style={[s.legalCard, { backgroundColor: colors.surfaceAlt ?? colors.surface }]}>
            {[
              { label: 'Terms of Service', icon: 'file-document-outline' },
              { label: 'Privacy Policy',   icon: 'shield-lock-outline' },
              { label: 'Cookie Policy',    icon: 'cookie-outline' },
            ].map(l => (
              <TouchableOpacity key={l.label} style={[s.legalRow, { borderBottomColor: colors.border }]}>
                <MaterialCommunityIcons name={l.icon as any} size={16} color={colors.textMuted} />
                <Text style={[s.legalLabel, { color: colors.textMuted }]}>{l.label}</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={[s.footerText, { color: colors.textMuted }]}>
            © {new Date().getFullYear()} {COMPANY_NAME}
          </Text>
          <Text style={[s.footerSub, { color: colors.textMuted }]}>
            Made with ❤️ in Sierra Leone 🇸🇱
          </Text>
          <Text style={[s.footerVersion, { color: colors.textMuted }]}>
            {APP_NAME} v{APP_VERSION}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '800' },
  hero: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 10 },
  logoWrap: { width: 90, height: 90, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  heroTitle: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  heroTagline: { color: 'rgba(255,255,255,0.85)', fontSize: 15, textAlign: 'center' },
  heroVersion: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 },
  builtByCard: { flexDirection: 'row', alignItems: 'center', gap: 14, margin: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg },
  builtByIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  builtByLabel: { fontSize: 12, fontWeight: '600' },
  builtByName: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  builtByTagline: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', marginBottom: Spacing.md },
  missionCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg },
  missionText: { fontSize: 14, lineHeight: 22 },
  statsGrid: { flexDirection: 'row', gap: Spacing.sm },
  statCard: { flex: 1, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', alignItems: 'center' },
  statGradient: { width: '100%', alignItems: 'center', paddingVertical: 16 },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, fontWeight: '700', paddingVertical: 8 },
  featuresCard: { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: Spacing.md },
  featureIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureLabel: { fontSize: 14, fontWeight: '700' },
  featureDesc: { fontSize: 12, marginTop: 2 },
  valuesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  valueCard: { width: '48%', borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 6 },
  valueEmoji: { fontSize: 28 },
  valueTitle: { fontSize: 14, fontWeight: '800' },
  valueDesc: { fontSize: 12, lineHeight: 17 },
  linksCard: { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.md },
  linkIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  legalCard: { borderRadius: Radius.xl, overflow: 'hidden' },
  legalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.md, borderBottomWidth: 1 },
  legalLabel: { flex: 1, fontSize: 13 },
  footer: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 4 },
  footerText: { fontSize: 13, fontWeight: '700' },
  footerSub: { fontSize: 13 },
  footerVersion: { fontSize: 11 },
});
