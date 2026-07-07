import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Linking, TouchableOpacity, TextInput, Alert, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { io } from 'socket.io-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Atoms';
import { ordersApi } from '../../utils/api';
import { useAuthStore } from '../../store';
import { formatPrice } from '../../constants/data';
import Toast from 'react-native-toast-message';

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [reporting, setReporting] = useState(false);
  const [issueSubject, setIssueSubject] = useState('');
  const [issueMessage, setIssueMessage] = useState('');

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.byId(id!),
    enabled: !!id,
  });

  // ── Real-time Socket Listener ──────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    // Replace with your backend URL
    const socket = io(process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000', {
      query: { userId: user?.id }
    });

    socket.emit('join-order', id);

    socket.on('order-status-updated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      Toast.show({
        type: 'info',
        text1: 'Order Update',
        text2: `Status changed to ${data.status?.replace('_', ' ')}`
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [id]);

  const reportMutation = useMutation({
    mutationFn: (data: { subject: string; message: string }) => 
      ordersApi.reportIssue(o._id, data.subject, data.message),
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Issue Reported', text2: 'Support will review this shortly.' });
      setReporting(false);
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to report', text2: 'Please try again.' })
  });

  if (isLoading || !order?.data) return null;

  const o = order.data;
  const longitude = o.deliveryCoordinates?.coordinates[0] || -13.2345;
  const latitude = o.deliveryCoordinates?.coordinates[1] || 8.4845;
  
  const shareOnWhatsApp = async () => {
    try {
      const whatsappUrl = o.whatsappUrl ||
        `https://wa.me/?text=${encodeURIComponent(o.whatsappShareText || `WimaKit Order #${o.customOrderId} — Total: Le ${(o.total || 0).toLocaleString()}\nTrack: https://wimakit.sl/order/${o.customOrderId}`)}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
        // Mark as shared on backend (fire-and-forget)
        ordersApi.shareWhatsApp(o._id).catch(() => {});
      } else {
        // Fallback to native share sheet
        await Share.share({ message: o.whatsappShareText || `WimaKit Order #${o.customOrderId}` });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Could not open WhatsApp' });
    }
  };

  const openMaps = () => {
    const label = encodeURI('Delivery Location');
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${latitude},${longitude}`,
      android: `geo:0,0?q=${latitude},${longitude}(${label})`,
      web: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    });
    if (url) Linking.openURL(url);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.header, { borderBottomColor: colors.border + '20', backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/orders' as any)} style={s.backBtn}>
          <Text style={[s.backTxt, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.textPrimary }]}>Order #{o.customOrderId}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[s.hero, { backgroundColor: colors.primary }]}>
          <Text style={s.heroStatus}>{(o.status ?? 'pending').toUpperCase().replace('_', ' ')}</Text>
          <Text style={s.heroSub}>Est. Delivery: {new Date(new Date(o.createdAt).getTime() + 60*60*1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>

        <View style={s.mapWrapper}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary, marginHorizontal: Spacing.lg, marginTop: Spacing.lg }]}>📍 Delivery Location</Text>
          <Text style={{ color: colors.textSecondary, marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}>{o.deliveryAddress}</Text>
          
          <View style={[s.mapContainer, { borderColor: colors.border, marginHorizontal: Spacing.lg }]}>
          <MapView
            style={StyleSheet.absoluteFillObject}
            initialRegion={{
              latitude,
              longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
          >
            <UrlTile
              urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maximumZ={19}
              flipY={false}
            />
            <Marker coordinate={{ latitude, longitude }} pinColor={colors.primary} title="Delivery Spot" />
          </MapView>
          </View>
          
          <Button 
            title="🗺️ Open in Google Maps" 
            variant="outline" 
            onPress={openMaps}
            style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.lg }}
          />
        </View>

        {/* ── Vertical Timeline ──────────────────────────────────────────────── */}
        <View style={{ padding: Spacing.lg }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>📋 Order History</Text>
          {o.trackingUpdates && Array.isArray(o.trackingUpdates) && o.trackingUpdates.map((update: any, i: number) => (
            <View key={i} style={s.timelineRow}>
              <View style={s.timelineTrack}>
                <View style={[s.timelineDot, { backgroundColor: i === 0 ? colors.primary : colors.border }]} />
                {i !== o.trackingUpdates.length - 1 && <View style={[s.timelineLine, { backgroundColor: colors.border }]} />}
              </View>
              <View style={s.timelineContent}>
                <Text style={[s.timelineStatus, { color: colors.textPrimary }]}>{(update?.status ?? 'UPDATE').toUpperCase().replace('_', ' ')}</Text>
                <Text style={[s.timelineTime, { color: colors.textMuted }]}>{new Date(update.timestamp).toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Order Details ─────────────────────────────────────────────────── */}
        <View style={[s.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>🛍️ Items Summary</Text>
          {o.items?.map((item: any, i: number) => (
            <View key={i} style={s.itemRow}>
              <Text style={[s.itemQty, { color: colors.textPrimary }]}>{item.quantity}x</Text>
              <Text style={[s.itemName, { color: colors.textSecondary }]}>{item.name}</Text>
              <Text style={[s.itemPrice, { color: colors.textPrimary }]}>{formatPrice(item.price * item.quantity)}</Text>
            </View>
          ))}
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <View style={s.totalRow}>
            <Text style={[s.totalLabel, { color: colors.textMuted }]}>Total Paid ({(o.paymentMethod ?? 'N/A').toUpperCase()})</Text>
            <Text style={[s.totalValue, { color: colors.primary }]}>{formatPrice(o.total)}</Text>
          </View>
        </View>

        {/* ── Contact & Support ─────────────────────────────────────────────── */}
        <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>📞 Contact Information</Text>
          <View style={{ flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' }}>
            <TouchableOpacity 
              style={[s.contactBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => Linking.openURL(`tel:${o.seller?.phone || o.sellerPhone || ''}`)}
            >
              <MaterialCommunityIcons name="store-outline" size={20} color={colors.textPrimary} />
              <Text style={[s.contactBtnTxt, { color: colors.textPrimary }]}>Call Store</Text>
            </TouchableOpacity>
            {o.rider && (
              <TouchableOpacity 
                style={[s.contactBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => Linking.openURL(`tel:${o.rider?.phone}`)}
              >
                <MaterialCommunityIcons name="moped" size={20} color={colors.textPrimary} />
                <Text style={[s.contactBtnTxt, { color: colors.textPrimary }]}>Call Rider</Text>
              </TouchableOpacity>
            )}
            {/* WhatsApp share button */}
            <TouchableOpacity
              style={[s.contactBtn, { backgroundColor: '#25D366' + '15', borderColor: '#25D366' }]}
              onPress={shareOnWhatsApp}
            >
              <MaterialCommunityIcons name="whatsapp" size={20} color="#25D366" />
              <Text style={[s.contactBtnTxt, { color: '#25D366' }]}>Share Order</Text>
            </TouchableOpacity>
          </View>

          {/* Platform payment / escrow info */}
          {o.platformPayment?.isPlatformEscrow && (
            <View style={[s.escrowBox, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '40' }]}>
              <MaterialCommunityIcons name="shield-check-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[s.escrowTitle, { color: colors.primary }]}>Platform Escrow</Text>
                <Text style={[s.escrowDesc, { color: colors.textMuted }]}>
                  {o.platformPayment.buyerPaidAt
                    ? `Payment confirmed. Seller is paid after delivery.`
                    : `Send Le ${(o.total || 0).toLocaleString()} to WimaKit via Orange Money/AfriMoney.\nWe'll pay the seller when your order is delivered.`
                  }
                </Text>
                {o.platformPayment.paymentRef && (
                  <Text style={[s.escrowRef, { color: colors.textSecondary }]}>
                    Ref: {o.platformPayment.paymentRef}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* ── Report Issue ──────────────────────────────────────────────────── */}
        <View style={{ padding: Spacing.lg }}>
          {!reporting ? (
            <TouchableOpacity onPress={() => setReporting(true)}>
              <Text style={{ color: colors.error, textAlign: 'center', fontWeight: '700' }}>⚠️ Report a Problem</Text>
            </TouchableOpacity>
          ) : (
            <View style={[s.reportBox, { backgroundColor: colors.surface, borderColor: colors.error + '40' }]}>
              <Text style={[s.reportTitle, { color: colors.textPrimary }]}>Report an Issue</Text>
              <TextInput 
                style={[s.reportInput, { color: colors.textPrimary, borderColor: colors.border }]} 
                placeholder="Subject (e.g. Missing Item)"
                value={issueSubject}
                onChangeText={setIssueSubject}
              />
              <TextInput 
                style={[s.reportInput, { color: colors.textPrimary, borderColor: colors.border, height: 80 }]} 
                placeholder="Details..."
                multiline
                value={issueMessage}
                onChangeText={setIssueMessage}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Cancel" variant="ghost" onPress={() => setReporting(false)} style={{ flex: 1 }} />
                <Button 
                  title="Submit" 
                  onPress={() => reportMutation.mutate({ subject: issueSubject, message: issueMessage })} 
                  loading={reportMutation.isPending}
                  style={{ flex: 1 }} 
                />
              </View>
            </View>
          )}
        </View>

        <View style={{ padding: Spacing.lg }}>
          <Button 
            title="Back to My Orders" 
            onPress={() => router.replace('/(tabs)/orders' as any)} 
            variant="ghost"
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backTxt: { fontSize: 36, fontWeight: '100', marginTop: -4 },
  title: { fontSize: FontSize.lg, fontWeight: '700' },
  hero: { padding: Spacing.xxl, alignItems: 'center', gap: 4 },
  heroStatus: { fontSize: FontSize.xxl, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  heroSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)' },
  mapWrapper: { marginTop: Spacing.md },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', marginBottom: Spacing.sm },
  mapContainer: { height: 220, borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, marginBottom: Spacing.md, backgroundColor: '#e0e0e0' },
  timelineRow: { flexDirection: 'row', gap: Spacing.md, minHeight: 60 },
  timelineTrack: { alignItems: 'center', width: 20 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, zIndex: 1 },
  timelineLine: { width: 2, flex: 1, marginTop: -2 },
  timelineContent: { flex: 1, paddingBottom: Spacing.lg },
  timelineStatus: { fontSize: FontSize.sm, fontWeight: '700' },
  timelineTime: { fontSize: FontSize.xs, marginTop: 2 },
  detailCard: { margin: Spacing.lg, padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1 },
  itemRow: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'center' },
  itemQty: { fontSize: FontSize.sm, fontWeight: '700', width: 30 },
  itemName: { fontSize: FontSize.sm, flex: 1 },
  itemPrice: { fontSize: FontSize.sm, fontWeight: '600' },
  divider: { height: 1, marginVertical: Spacing.md },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: FontSize.xs, fontWeight: '600' },
  totalValue: { fontSize: FontSize.xl, fontWeight: '900' },
  contactBtn: { flex: 1, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', gap: 6 },
  contactBtnTxt: { fontSize: FontSize.xs, fontWeight: '700' },
  reportBox: { padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, gap: 10 },
  reportTitle: { fontSize: FontSize.md, fontWeight: '700' },
  reportInput: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.sm },
  escrowBox: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, marginTop: Spacing.md, alignItems: 'flex-start' },
  escrowTitle: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 2 },
  escrowDesc: { fontSize: FontSize.xs, lineHeight: 16 },
  escrowRef: { fontSize: FontSize.xs, fontWeight: '600', marginTop: 4 },
});