import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, Dimensions, Modal, Alert, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import Svg, { Rect } from 'react-native-svg';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { useProfile, useFollowProfile, useUnfollowProfile } from '../../hooks/useApi';
import { useAuthStore } from '../../store';
import { Avatar, StarRating, Badge } from '../../components/ui/Atoms';
import { Button } from '../../components/ui/Button';
import { ProductCard } from '../../components/product/ProductCard';
import { ProfileSkeleton } from '../../components/ui/Skeleton';
import { generateProfileLink, formatPrice } from '../../constants/data';
import * as Clipboard from 'expo-clipboard';
import { Spacing, Radius, FontSize } from '../../constants/theme';

const { width } = Dimensions.get('window');

// Deterministic QR visual
function QRCode({ value, size = 200 }: { value: string; size?: number }) {
  const { colors } = useTheme();
  const cells = 21;
  const cs    = size / cells;
  const hash  = value.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
  const isOn  = (r: number, c: number) => {
    if ((r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7)) return true;
    return ((hash * (r + 3) * (c + 7)) % 5) < 2;
  };
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect width={size} height={size} fill={colors.surface} />
      {Array.from({ length: cells }, (_, r) =>
        Array.from({ length: cells }, (_, c) =>
          isOn(r, c) ? (
            <Rect key={`${r}-${c}`} x={c * cs} y={r * cs} width={cs} height={cs} fill={colors.primary} />
          ) : null
        )
      )}
    </Svg>
  );
}

export default function PublicProfileScreen() {
  const { slug }   = useLocalSearchParams<{ slug: string }>();
  const router     = useRouter();
  const { colors } = useTheme();
  const currentUser = useAuthStore((s) => s.user);
  const [showQR, setShowQR] = useState(false);

  const { data, isLoading, isError } = useProfile(slug ?? '');
  const profile  = data?.profile;
  const products = data?.products ?? [];
  const stats    = data?.stats ?? {};

  const followMutation   = useFollowProfile();
  const unfollowMutation = useUnfollowProfile();
  // Optimistic local override so the button flips instantly on tap rather
  // than waiting for the mutation + refetch round trip. Falls back to the
  // server's isFollowing once set, and resets whenever the profile changes.
  const [followOverride, setFollowOverride] = useState<boolean | null>(null);
  const isFollowing = followOverride ?? profile?.isFollowing ?? false;

  const profileLink = generateProfileLink(profile?.profileSlug ?? slug ?? '');
  const isSeller    = profile?.role === 'seller';
  const isOwn       = !!currentUser && !!profile && (currentUser.id === profile.id || currentUser.id === (profile as any)._id);

  const handleToggleFollow = useCallback(() => {
    if (!profile) return;
    const targetId = (profile as any)._id ?? profile.id;
    if (!currentUser) {
      Toast.show({ type: 'info', text1: 'Sign in to follow stores' });
      return;
    }
    if (isFollowing) {
      setFollowOverride(false);
      unfollowMutation.mutate(targetId, {
        onError: () => { setFollowOverride(true); Toast.show({ type: 'error', text1: 'Could not unfollow', text2: 'Please try again.' }); },
      });
    } else {
      setFollowOverride(true);
      followMutation.mutate(targetId, {
        onError: () => { setFollowOverride(false); Toast.show({ type: 'error', text1: 'Could not follow', text2: 'Please try again.' }); },
      });
    }
  }, [profile, currentUser, isFollowing, followMutation, unfollowMutation]);

  const handleShare = useCallback(async () => {
    if (!profile) return;
    try {
      await Share.share({
        message: isSeller
          ? `Shop at ${profile.storeName ?? profile.name} on WimaKit! 🛒\n${profileLink}`
          : `Connect with ${profile.name} on WimaKit 🛵\n${profileLink}`,
        url: profileLink,
      });
    } catch { /* user cancelled */ }
  }, [isSeller, profile, profileLink]);

  const handleCopyLink = useCallback(async () => {
    await Clipboard.setStringAsync(profileLink);
    Toast.show({ type: 'success', text1: '📋 Link copied!', text2: profileLink });
  }, [profileLink]);

  if (isLoading) {
    return (
      <SafeAreaView style={[st.root, { backgroundColor: colors.background }]} edges={['top']}>
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  if (isError || !profile) {
    return (
      <SafeAreaView style={[st.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }]} edges={['top']}>
        <Text style={{ fontSize: 48 }}>🔍</Text>
        <Text style={{ fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary, marginTop: Spacing.md }}>Profile not found</Text>
        <Text style={{ fontSize: FontSize.sm, color: colors.textMuted, marginTop: Spacing.xs, textAlign: 'center' }}>
          This store or user page doesn't exist, or may have been removed.
        </Text>
        <Button title="Go Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)} style={{ marginTop: Spacing.lg }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[st.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Back button */}
      <View style={[st.topBar, { backgroundColor: 'transparent' }]}>
        <TouchableOpacity style={[st.backBtn, { backgroundColor: 'rgba(0,0,0,0.35)' }]} onPress={() => router.back()}>
          <Text style={st.backText}>‹</Text>
        </TouchableOpacity>
        <View style={st.topBarRight}>
          <TouchableOpacity style={[st.backBtn, { backgroundColor: 'rgba(0,0,0,0.35)' }]} onPress={() => setShowQR(true)}>
            <Text style={{ fontSize: 18 }}>📱</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.backBtn, { backgroundColor: 'rgba(0,0,0,0.35)' }]} onPress={handleShare}>
            <Text style={{ fontSize: 18 }}>📤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Banner */}
        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 400 }}>
          <LinearGradient colors={[colors.primary, colors.primaryLight]} style={st.banner}>
            <View style={st.bannerContent}>
              <Avatar uri={profile.avatar} name={profile.name} size={80} verified={profile.isVerified} />
              <View style={st.nameSection}>
                <Text style={st.profileName}>{profile.name}</Text>
                {isSeller && profile.storeName ? (
                  <Text style={st.storeName}>{profile.storeName}</Text>
                ) : null}
                <View style={st.badgeRow}>
                  <Badge label={isSeller ? '🏪 Seller' : '🛒 Buyer'} variant={isSeller ? 'secondary' : 'primary'} />
                  {profile.isVerified ? <Badge label="✓ Verified" variant="success" /> : null}
                </View>
                {(profile.rating ?? 0) > 0 ? (
                  <StarRating rating={profile.rating ?? 0} size={14} showCount count={profile.totalReviews ?? 0} />
                ) : null}
              </View>
            </View>
            {profile.bio ? (
              <Text style={st.bio}>{profile.bio}</Text>
            ) : null}
            {profile.location ? (
              <Text style={st.location}>📍 {profile.location}</Text>
            ) : null}
          </LinearGradient>
        </MotiView>

        {/* Stats */}
        <View style={[st.statsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {isSeller ? (
            <>
              <StatItem label="Total Sales"   value={String(profile.totalSales ?? stats.orders ?? 0)} color={colors.secondary} colors={colors} />
              <StatItem label="Products"      value={String(products.length)}                          colors={colors} />
              <StatItem label="Followers"     value={String(profile.followersCount ?? 0)}              colors={colors} />
              <StatItem label="Rating"        value={(profile.rating ?? 0) > 0 ? (profile.rating ?? 0).toFixed(1) : '—'} color={colors.accent} colors={colors} />
            </>
          ) : (
            <>
              <StatItem label="Orders"  value={String(profile.totalOrders ?? 0)}   color={colors.secondary} colors={colors} />
              <StatItem label="Followers" value={String(profile.followersCount ?? 0)} colors={colors} />
              <StatItem label="Reviews" value={String(profile.totalReviews ?? 0)}  colors={colors} />
              <StatItem label="Member"  value={profile.joinedDate ? new Date(profile.joinedDate).getFullYear().toString() : '2024'} colors={colors} />
            </>
          )}
        </View>

        {/* Follow / Unfollow — the primary action on someone else's profile.
            Not shown on your own profile, since you can't follow yourself. */}
        {!isOwn && (
          <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
            <TouchableOpacity
              style={[
                st.followBtn,
                isFollowing
                  ? { backgroundColor: colors.surface, borderColor: colors.border }
                  : { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={handleToggleFollow}
              disabled={followMutation.isPending || unfollowMutation.isPending}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 16 }}>{isFollowing ? '✓' : '➕'}</Text>
              <Text style={[st.followBtnTxt, { color: isFollowing ? colors.textPrimary : '#FFFFFF' }]}>
                {isFollowing ? `Following ${isSeller ? 'this store' : ''}`.trim() : `Follow ${isSeller ? 'this store' : ''}`.trim()}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Share profile card */}
        <View style={[st.shareCard, { backgroundColor: colors.surface, borderColor: colors.primaryMuted }]}>
          <View style={st.shareCardTop}>
            <View style={{ flex: 1 }}>
              <Text style={[st.shareTitle, { color: colors.textPrimary }]}>
                {isOwn ? 'Your Public Profile' : 'Share This Profile'}
              </Text>
              <Text style={[st.shareSub, { color: colors.textMuted }]}>
                wimakit.sl/profile/{profile.profileSlug ?? slug}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowQR(true)} style={[st.qrMini, { borderColor: colors.border }]}>
              <QRCode value={profileLink} size={56} />
            </TouchableOpacity>
          </View>
          <View style={st.shareButtons}>
            <TouchableOpacity
              style={[st.shareBtn, { borderColor: colors.border }]}
              onPress={handleCopyLink}
            >
              <Text style={{ fontSize: 16 }}>📋</Text>
              <Text style={[st.shareBtnTxt, { color: colors.textPrimary }]}>Copy Link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.shareBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={handleShare}
            >
              <Text style={{ fontSize: 16 }}>📤</Text>
              <Text style={[st.shareBtnTxt, { color: '#FFFFFF' }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Own profile edit button */}
        {isOwn && (
          <View style={{ paddingHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
            <Button title="✏️ Edit Profile" onPress={() => router.push('/edit-profile' as any)} variant="outline" fullWidth />
          </View>
        )}

        {/* Seller products */}
        {isSeller && products.length > 0 && (
          <View style={st.section}>
            <View style={st.sectionHeader}>
              <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>
                🏪 {isOwn ? 'My Products' : `${profile.storeName ?? profile.name}'s Products`}
              </Text>
              <Text style={[st.productCount, { color: colors.textMuted }]}>
                {products.length} items
              </Text>
            </View>
            <FlatList
              data={products}
              numColumns={2}
              scrollEnabled={false}
              keyExtractor={(item: any) => item._id ?? item.id}
              renderItem={({ item, index }: { item: any; index: number }) => (
                <ProductCard product={item} index={index} />
              )}
              contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
              columnWrapperStyle={{ gap: Spacing.md }}
              initialNumToRender={6}
            />
          </View>
        )}

        {/* Empty seller state */}
        {isSeller && products.length === 0 && (
          <View style={st.emptyProducts}>
            <Text style={{ fontSize: 48 }}>🏪</Text>
            <Text style={[st.emptyText, { color: colors.textMuted }]}>
              {isOwn ? 'You have no products yet' : 'No products listed yet'}
            </Text>
            {isOwn && (
              <Button
                title="Add Your First Product"
                onPress={() => router.push('/seller/add-product')}
                style={{ marginTop: Spacing.md }}
              />
            )}
          </View>
        )}

        {/* Contact info */}
        {!isOwn && (
          <View style={[st.contactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[st.contactTitle, { color: colors.textPrimary }]}>Contact</Text>
            {profile.phone ? (
              <View style={st.contactRow}>
                <Text style={{ fontSize: 18 }}>📞</Text>
                <Text style={[st.contactValue, { color: colors.textPrimary }]}>{profile.phone}</Text>
              </View>
            ) : null}
            {profile.location ? (
              <View style={st.contactRow}>
                <Text style={{ fontSize: 18 }}>📍</Text>
                <Text style={[st.contactValue, { color: colors.textPrimary }]}>{profile.location}</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* QR Modal */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <TouchableOpacity
          style={[st.modalOverlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setShowQR(false)}
        >
          <MotiView
            from={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280 }}
            style={[st.qrModal, { backgroundColor: colors.surface }]}
          >
            <Text style={[st.qrModalTitle, { color: colors.textPrimary }]}>
              {isSeller ? profile.storeName ?? profile.name : profile.name}
            </Text>
            <Text style={[st.qrModalSub, { color: colors.textMuted }]}>
              Scan to visit on WimaKit
            </Text>
            <View style={[st.qrBox, { borderColor: colors.primaryMuted }]}>
              <QRCode value={profileLink} size={220} />
            </View>
            <Text style={[st.qrUrl, { color: colors.primary }]}>
              wimakit.sl/profile/{profile.profileSlug ?? slug}
            </Text>
            <View style={st.qrActions}>
              <Button title="Share"     onPress={handleShare}     variant="primary" style={{ flex: 1 }} />
              <Button title="Copy Link" onPress={handleCopyLink} variant="outline"  style={{ flex: 1 }} />
            </View>
          </MotiView>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function StatItem({ label, value, color, colors }: { label: string; value: string; color?: string; colors: any }) {
  return (
    <View style={[st.statItem, { borderRightColor: colors.border }]}>
      <Text style={[st.statValue, { color: color ?? colors.primary }]}>{value}</Text>
      <Text style={[st.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root:        { flex: 1 },
  topBar:      { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  topBarRight: { flexDirection: 'row', gap: Spacing.sm },
  backBtn:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  backText:    { color: '#FFFFFF', fontSize: 26, fontWeight: '300', marginTop: -2 },
  banner:      { paddingTop: 80, paddingBottom: Spacing.xxl, paddingHorizontal: Spacing.xl, borderBottomLeftRadius: Radius.xxl, borderBottomRightRadius: Radius.xxl },
  bannerContent: { flexDirection: 'row', gap: Spacing.lg, alignItems: 'flex-start', marginBottom: Spacing.md },
  nameSection: { flex: 1, gap: Spacing.xs },
  profileName: { color: '#FFFFFF', fontSize: FontSize.xl, fontWeight: '900' },
  storeName:   { color: 'rgba(255,255,255,0.88)', fontSize: FontSize.md, fontWeight: '600' },
  badgeRow:    { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  bio:         { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, lineHeight: 20 },
  location:    { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.sm, marginTop: 4 },
  statsCard:   { flexDirection: 'row', marginHorizontal: Spacing.lg, marginTop: -Spacing.lg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 5 },
  statItem:    { flex: 1, alignItems: 'center', borderRightWidth: 1 },
  statValue:   { fontSize: FontSize.xl, fontWeight: '900' },
  statLabel:   { fontSize: FontSize.xs, marginTop: 2 },
  shareCard:   { margin: Spacing.lg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5 },
  followBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  followBtnTxt: { fontSize: FontSize.md, fontWeight: '700' },
  shareCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  shareTitle:  { fontSize: FontSize.md, fontWeight: '800' },
  shareSub:    { fontSize: FontSize.sm, marginTop: 2 },
  qrMini:      { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden', padding: 2 },
  shareButtons: { flexDirection: 'row', gap: Spacing.md },
  shareBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  shareBtnTxt: { fontSize: FontSize.sm, fontWeight: '700' },
  section:     { marginTop: Spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  productCount: { fontSize: FontSize.sm },
  emptyProducts: { alignItems: 'center', padding: Spacing.xxl, gap: Spacing.md },
  emptyText:   { fontSize: FontSize.md, fontWeight: '600' },
  contactCard: { margin: Spacing.lg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, gap: Spacing.md },
  contactTitle: { fontSize: FontSize.md, fontWeight: '800' },
  contactRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  contactValue: { fontSize: FontSize.md, fontWeight: '500' },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  qrModal:     { borderRadius: Radius.xxl, padding: Spacing.xl, alignItems: 'center', width: '100%' },
  qrModalTitle: { fontSize: FontSize.xl, fontWeight: '900', textAlign: 'center' },
  qrModalSub:  { fontSize: FontSize.sm, marginTop: Spacing.xs, textAlign: 'center' },
  qrBox:       { borderRadius: Radius.lg, borderWidth: 2, padding: Spacing.md, marginVertical: Spacing.lg, overflow: 'hidden' },
  qrUrl:       { fontSize: FontSize.sm, fontWeight: '600' },
  qrActions:   { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg, width: '100%' },
});
