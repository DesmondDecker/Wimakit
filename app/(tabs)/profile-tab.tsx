import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, Alert, Modal, Dimensions, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import Svg, { Rect } from 'react-native-svg';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore, useCartStore, useWishlistStore } from '../../store';
import { Avatar, StarRating, Badge } from '../../components/ui/Atoms';
import { Button } from '../../components/ui/Button';
import { generateProfileLink, formatPrice , SUPPORT_PHONE} from '../../constants/data';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';

const { width } = Dimensions.get('window');

// ─── Deterministic QR visual ──────────────────────────────────────────────────
function QRCode({ value, size = 160 }: { value: string; size?: number }) {
  const { colors } = useTheme();
  const cells  = 21;
  const cs     = size / cells;
  const hash   = value.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
  const isOn   = (r: number, c: number) => {
    // Finder patterns
    if ((r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7)) return true;
    return ((hash * (r + 3) * (c + 7)) % 5) < 2;
  };
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect width={size} height={size} fill={colors.surface} />
      {Array.from({ length: cells }, (_, r) =>
        Array.from({ length: cells }, (_, c) =>
          isOn(r, c) ? (
            <Rect key={`${r}${c}`} x={c * cs} y={r * cs} width={cs} height={cs} fill={colors.primary} />
          ) : null
        )
      )}
    </Svg>
  );
}

function StatBox({ label, value, color, colors }: { label: string; value: string | number; color?: string; colors: any }) {
  return (
    <View style={[styles.statBox, { borderRightColor: colors.border }]}>
      <Text style={[styles.statValue, { color: color ?? colors.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function MenuItem({ icon, label, onPress, danger, accent, right, colors }: any) {
  const Container: any = onPress ? TouchableOpacity : View;
  return (
    <Container
      style={[styles.menuItem, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.menuLeft}>
        <MaterialCommunityIcons name={icon as any} size={20} color={danger ? colors.error : accent ? colors.secondary : colors.textPrimary} style={styles.menuIcon} />
        <Text style={[styles.menuLabel, { color: danger ? colors.error : accent ? colors.secondary : colors.textPrimary }]}>
          {label}
        </Text>
      </View>
      {right ?? <Text style={[styles.menuChevron, { color: colors.textMuted }]}>›</Text>}
    </Container>
  );
}

export default function ProfileTab() {
  const router  = useRouter();
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuthStore();
  const cartCount     = useCartStore((s) => s.getTotalItems());
  const wishlistCount = useWishlistStore((s) => s.items.length);
  const [showQR, setShowQR] = useState(false);

  const profileLink = user ? generateProfileLink(user.profileSlug) : '';
  const isSeller    = user?.role === 'seller';

  const handleShare = useCallback(async () => {
    if (!user || !profileLink) return;
    try {
      await Share.share({
        message: isSeller
          ? `Shop at ${user.storeName} on WimaKit! 🛒\n${profileLink}`
          : `Connect with me on WimaKit 🛵\n${profileLink}`,
        url: profileLink,
      });
    } catch { Toast.show({ type: 'error', text1: 'Could not share' }); }
  }, [isSeller, user, profileLink]);

  const handleCopyLink = useCallback(() => {
    if (!profileLink) return;
    Toast.show({ type: 'success', text1: '📋 Link copied!', text2: profileLink });
  }, [profileLink]);

  const handleLogout = useCallback(() => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => { logout(); router.replace('/(auth)/welcome'); } },
    ]);
  }, [logout, router]);

  const handleSupportCall = () => Linking.openURL(`tel:+${SUPPORT_PHONE}`);
  const handleSupportWhatsApp = () => {
    const phone = SUPPORT_PHONE;
    const message = `Hello WimaKit Support, I am ${user?.name} and I need help with my account.`;
    Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
  };

  if (!user) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[styles.noAuthWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="account-off-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.noAuthTitle, { color: colors.textPrimary }]}>Not signed in</Text>
          <Text style={[styles.noAuthSub, { color: colors.textMuted }]}>Sign in to access your profile</Text>
          <Button title="Sign In" onPress={() => router.push('/(auth)/login')} style={{ marginTop: Spacing.lg }} />
          <Button title="Create Account" onPress={() => router.push('/(auth)/register')} variant="outline" style={{ marginTop: Spacing.md }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Banner */}
        <LinearGradient colors={[colors.primary, colors.primaryLight]} style={styles.banner}>
          <View style={styles.bannerTop}>
            <Text style={styles.bannerTitle}>My Profile</Text>
            <View style={styles.bannerActions}>
              <TouchableOpacity style={[styles.bannerBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]} onPress={toggleTheme}>
                <MaterialCommunityIcons name={(isDark ? 'white-balance-sunny' : 'moon-waning-crescent') as any} size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bannerBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]} onPress={() => router.push('/settings')}>
                <MaterialCommunityIcons name="cog-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.avatarRow}>
            <Avatar uri={user.avatar} name={user.name} size={80} verified={user.isVerified} />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.name}</Text>
              {isSeller && <Text style={styles.storeName}>{user.storeName}</Text>}
              <View style={styles.badgeRow}>
                <Badge label={isSeller ? '🏪 Seller' : '🛒 Buyer'} variant={isSeller ? 'secondary' : 'primary'} />
                {user.isVerified && <Badge label="✓ Verified" variant="success" />}
              </View>
              {user.rating ? <StarRating rating={user.rating} size={13} showCount count={user.totalReviews} /> : null}
            </View>
          </View>

          {user.bio     && <Text style={styles.bio}>{user.bio}</Text>}
          {user.location && <Text style={styles.location}>📍 {user.location}</Text>}
        </LinearGradient>

        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {isSeller ? (
            <>
              <StatBox label="Sales"    value={user.totalSales ?? 0}    color={colors.secondary} colors={colors} />
              <StatBox label="Products" value={user.totalProducts ?? 0}                           colors={colors} />
              <StatBox label="Rating"   value={user.rating?.toFixed(1) ?? '—'} color={colors.accent} colors={colors} />
            </>
          ) : (
            <>
              <StatBox label="Orders"   value={(user as any).totalOrders ?? 0}   color={colors.secondary} colors={colors} />
              <StatBox label="Wishlist" value={wishlistCount}            color={colors.error}     colors={colors} />
              <StatBox label="Points"   value={`${(user as any).loyaltyPoints ?? 0}p`} color={colors.accent} colors={colors} />
            </>
          )}
        </View>

        {/* Share profile card */}
        <View style={[styles.shareCard, { backgroundColor: colors.surface, borderColor: colors.primaryMuted }]}>
          <View style={styles.shareCardTop}>
            <View style={styles.shareCardLeft}>
              <Text style={[styles.shareTitle, { color: colors.textPrimary }]}>Share Your Profile</Text>
              <Text style={[styles.shareSubtitle, { color: colors.textMuted }]}>
                Let others find you on WimaKit
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowQR(true)} style={styles.qrPreview}>
              <QRCode value={profileLink} size={56} />
              <Text style={[styles.qrTap, { color: colors.textMuted }]}>tap to expand</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.linkBox, { backgroundColor: colors.background }]}>
            <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>
              wimakit.sl/profile/{user.profileSlug}
            </Text>
          </View>
          <View style={styles.shareButtons}>
            <TouchableOpacity
              style={[styles.shareBtn, { borderColor: colors.border }]}
              onPress={handleCopyLink}
            >
              <MaterialCommunityIcons name="content-copy" size={16} color={colors.textPrimary} />
              <Text style={[styles.shareBtnText, { color: colors.textPrimary }]}>Copy Link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shareBtn, styles.shareBtnPrimary, { backgroundColor: colors.primary }]}
              onPress={handleShare}
            >
              <MaterialCommunityIcons name="share-variant-outline" size={16} color="#fff" />
              <Text style={[styles.shareBtnText, { color: '#fff' }]}>Share Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Support Section */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Support & Help</Text>
        <View style={[styles.shareCard, { backgroundColor: colors.surface, borderColor: colors.primaryMuted, marginTop: 0 }]}>
          <Text style={[styles.shareTitle, { color: colors.textPrimary, marginBottom: Spacing.sm }]}>Need Assistance?</Text>
          <Text style={[styles.shareSubtitle, { color: colors.textMuted, marginBottom: Spacing.md }]}>
            Contact the WimaKit team directly for help with your orders or account.
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <TouchableOpacity style={[styles.shareBtn, { borderColor: colors.primary }]} onPress={handleSupportCall}>
              <MaterialCommunityIcons name="phone-outline" size={16} color={colors.primary} />
              <Text style={[styles.shareBtnText, { color: colors.primary }]}>Call Support</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.shareBtn, { backgroundColor: '#25D366', borderColor: '#25D366' }]} onPress={handleSupportWhatsApp}>
              <MaterialCommunityIcons name="whatsapp" size={16} color="#fff" />
              <Text style={[styles.shareBtnText, { color: '#fff' }]}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {(isSeller ? [
            { icon: 'plus-box-outline', label: 'Add Product', onPress: () => router.push('/seller/add-product') },
            { icon: 'package-variant-closed', label: 'Products',    onPress: () => router.push('/seller/my-products' as any) },
            { icon: 'view-dashboard-outline', label: 'Dashboard',   onPress: () => router.replace('/(tabs)/seller-dashboard' as any) },
            { icon: 'star-outline', label: 'Reviews',      onPress: () => {} },
          ] : [
            { icon: 'truck-fast-outline', label: 'My Orders',  onPress: () => router.replace('/(tabs)/orders' as any) },
            { icon: 'heart-outline', label: `Wishlist (${wishlistCount})`, onPress: () => router.push('/wishlist' as any) },
            { icon: 'cart-outline', label: `Cart (${cartCount})`, onPress: () => router.push('/cart' as any) },
            { icon: 'credit-card-outline', label: 'Payments',   onPress: () => {} },
          ]).map((a) => (
            <TouchableOpacity
              key={a.label}
              style={[styles.actionTile, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={a.onPress}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name={a.icon as any} size={24} color={colors.textPrimary} />
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]} numberOfLines={2}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Account menu */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Account</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MenuItem icon="account-edit-outline" label="Edit Profile"     onPress={() => router.push('/edit-profile' as any)} colors={colors} /> 
          <MenuItem icon="bell-outline" label="Notifications"    onPress={() => router.push('/notifications' as any)} colors={colors} /> 
          <MenuItem icon={isDark ? 'white-balance-sunny' : 'moon-waning-crescent'} label={isDark ? 'Light Mode' : 'Dark Mode'} onPress={toggleTheme} colors={colors} 
            right={<MaterialCommunityIcons name={(isDark ? 'white-balance-sunny' : 'moon-waning-crescent') as any} size={22} color={colors.textMuted} />} 
          />
          <MenuItem icon="shield-lock-outline" label="Privacy & Security" onPress={() => {}} colors={colors} />
          <MenuItem icon="help-circle-outline" label="Help & Support"    onPress={() => router.push('/legal/help' as any)} colors={colors} />
          {!isSeller && ( // Only show if not already a seller
            <MenuItem icon="store-plus-outline" label="Become a Seller" onPress={() => router.push('/(auth)/register')} colors={colors} accent />
          )}
          <MenuItem icon="logout" label="Log Out" onPress={handleLogout} colors={colors} danger />
        </View>

        <Text style={[styles.footer, { color: colors.textMuted }]}>
          WimaKit v1.0.0 · di makit na you phone 🇸🇱
        </Text>
      </ScrollView>

      {/* QR Modal */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowQR(false)}>
          <MotiView
            from={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300 }}
            style={[styles.qrModal, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.qrModalTitle, { color: colors.textPrimary }]}>
              {isSeller ? user.storeName : user.name}
            </Text>
            <Text style={[styles.qrModalSub, { color: colors.textMuted }]}>
              Scan to visit profile on WimaKit
            </Text>
            <View style={[styles.qrBox, { borderColor: colors.primaryMuted }]}>
              <QRCode value={profileLink} size={220} />
            </View>
            <Text style={[styles.qrUrl, { color: colors.primary }]}>
              wimakit.sl/profile/{user.profileSlug}
            </Text>
            <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg }}>
              <Button title="Share" onPress={handleShare} variant="primary" style={{ flex: 1 }} />
              <Button title="Copy Link" onPress={handleCopyLink} variant="outline" style={{ flex: 1 }} />
            </View>
          </MotiView>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  noAuthWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.md },
  noAuthTitle: { fontSize: FontSize.xl, fontWeight: '800' },
  noAuthSub: { fontSize: FontSize.md, textAlign: 'center' },

  banner: { padding: Spacing.xl, paddingBottom: Spacing.xxl, borderBottomLeftRadius: Radius.xxl, borderBottomRightRadius: Radius.xxl },
  bannerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  bannerTitle: { color: '#fff', fontSize: FontSize.xl, fontWeight: '900' },
  bannerActions: { flexDirection: 'row', gap: Spacing.sm },
  bannerBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.lg, marginBottom: Spacing.md },
  userInfo: { flex: 1, gap: Spacing.xs },
  userName: { color: '#fff', fontSize: FontSize.xl, fontWeight: '900' },
  storeName: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.md, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  bio: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, lineHeight: 20, marginTop: Spacing.sm },
  location: { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.sm, marginTop: Spacing.xs },

  statsRow: { flexDirection: 'row', marginHorizontal: Spacing.lg, marginTop: -Spacing.lg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, ...Shadow.md } as any,
  statBox: { flex: 1, alignItems: 'center', borderRightWidth: 1 },
  statValue: { fontSize: FontSize.xl, fontWeight: '900' },
  statLabel: { fontSize: FontSize.xs, marginTop: 2 },

  shareCard: { margin: Spacing.lg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5 },
  shareCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  shareCardLeft: { flex: 1 },
  shareTitle: { fontSize: FontSize.md, fontWeight: '800' },
  shareSubtitle: { fontSize: FontSize.sm, marginTop: 2 },
  qrPreview: { alignItems: 'center', gap: 3 },
  qrTap: { fontSize: 9 },
  linkBox: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.md },
  linkText: { fontSize: FontSize.sm, fontWeight: '600' },
  shareButtons: { flexDirection: 'row', gap: Spacing.md },
  shareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  shareBtnPrimary: { borderWidth: 0 },
  shareBtnText: { fontSize: FontSize.sm, fontWeight: '700' },

  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', marginHorizontal: Spacing.lg, marginBottom: Spacing.md, marginTop: Spacing.lg },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: Spacing.lg, gap: Spacing.md },
  actionTile: { width: (width - Spacing.lg * 2 - Spacing.md * 3) / 4, aspectRatio: 1, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1 },
  actionIcon: { fontSize: 24 },
  actionLabel: { fontSize: 9, fontWeight: '600', textAlign: 'center' },

  menuCard: { marginHorizontal: Spacing.lg, borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md + 2, borderBottomWidth: 1 },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  menuIcon: { fontSize: 20, width: 28 },
  menuLabel: { fontSize: FontSize.md, fontWeight: '500' },
  menuChevron: { fontSize: 22, fontWeight: '300' },

  footer: { textAlign: 'center', fontSize: FontSize.xs, marginTop: Spacing.xxl, marginBottom: Spacing.md },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  qrModal: { borderRadius: Radius.xxl, padding: Spacing.xl, alignItems: 'center', width: '100%' },
  qrModalTitle: { fontSize: FontSize.xl, fontWeight: '900', textAlign: 'center' },
  qrModalSub: { fontSize: FontSize.sm, marginTop: Spacing.xs, textAlign: 'center' },
  qrBox: { borderRadius: Radius.lg, borderWidth: 2, padding: Spacing.md, marginVertical: Spacing.lg, overflow: 'hidden' },
  qrUrl: { fontSize: FontSize.sm, fontWeight: '600' },
});
