import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Share, Linking, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview'; // Keep this for COD bill
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import Toast from 'react-native-toast-message';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useCartStore, useAuthStore, useOrdersStore } from '../store';
import { formatPrice, BNPL_PLANS } from '../constants/data';
import { ordersApi } from '../utils/api';
import { useWallet, useApplyBnpl } from '../hooks/useApi';
import {
  PAYMENT_METHODS_META,
  initiatePayment,
  generateCODBill,
  // CODBill type is already imported from payments.ts, no change needed here
  PaymentMethod,
  BillData,
} from '../constants/payments';
import { Button } from '../components/ui/Button';
import { Spacing, Radius, FontSize } from '../constants/theme';

import MapView, { Marker, UrlTile } from 'react-native-maps'; // Use UrlTile for free OpenStreetMap
type Step = 'cart' | 'checkout' | 'paying' | 'bill';
// 'wallet' and 'bnpl' are settled server-side (instant debit / instalment
// plan) so they never go through initiatePayment()'s dial-code stub — only
// the 4 PAYMENT_METHODS_META entries do. Kept as a separate union rather
// than widening PaymentMethod, since wallet/bnpl have no USSD dial steps.
type ExtendedPaymentMethod = PaymentMethod | 'wallet' | 'bnpl';

export default function CartScreen() {
  const router  = useRouter();
  const { colors } = useTheme();
  const { items, updateQty, clearCart, getDiscountedSubtotal, getDeliveryFee, getPlatformFee, getGrandTotal, getTotalItems } = useCartStore();
  const { addOrder } = useOrdersStore();
  const user = useAuthStore((s) => s.user);

  // Group items by seller for a better breakdown of the shopping session
  const groupedItems = useMemo(() => {
    return items.reduce((acc, item) => {
      // Defensive check for Seller ID (handling both populated objects and raw IDs)
      const seller = item.product.seller;
      const sellerId = (typeof seller === 'string' ? seller : ((seller as any)?._id || seller?.id)) || 'unknown';
      if (!acc[sellerId]) acc[sellerId] = [];
      acc[sellerId].push(item);
      return acc;
    }, {} as Record<string, typeof items>);
  }, [items]);

  const [step,            setStep]            = useState<Step>('cart');
  const [address,         setAddress]         = useState('');
  const [phone,           setPhone]           = useState(user?.phone ?? '');
  const [coords,          setCoords]          = useState<{latitude: number; longitude: number} | null>(null);
  const [locating,        setLocating]        = useState(false);
  const [payMethod,       setPayMethod]       = useState<ExtendedPaymentMethod>('orange_money');
  const [bnplPlan,        setBnplPlan]        = useState<string>('2x');
  const [placing,         setPlacing]         = useState(false);
  const [payRef,          setPayRef]          = useState('');
  const [codBillHtml,     setCodBillHtml]     = useState('');
  const [billPlainText,   setBillPlainText]   = useState('');
  const [currentOrderId,  setCurrentOrderId]  = useState('');

  const { data: walletData } = useWallet();
  const applyBnplMut = useApplyBnpl();
  const walletBalance = walletData?.wallet?.available ?? walletData?.available ?? 0;

  // getGrandTotal() already equals subtotal + delivery + platformFee combined.
  // This used to be assigned to `subtotal`, then deliveryFee and platformFee
  // were computed and added AGAIN on top of that — silently overcharging the
  // buyer's displayed total by roughly the fee amount a second time on every
  // cart with more than a trivial subtotal. Pulling each piece from the store
  // directly (which is also what the backend's own fee % matches, per the
  // comment on getPlatformFee) keeps this screen's math consistent with a
  // single source of truth instead of re-deriving it here.
  const subtotal    = getDiscountedSubtotal();
  const deliveryFee = getDeliveryFee();
  const platformFee = getPlatformFee();
  const total       = getGrandTotal();

  const isDialCodeMethod = payMethod !== 'cod' && payMethod !== 'wallet' && payMethod !== 'bnpl';
  const selectedMeta = isDialCodeMethod ? PAYMENT_METHODS_META.find((m) => m.id === payMethod) : undefined;
  const bnplConfig = BNPL_PLANS.find(p => p.id === bnplPlan);
  const bnplInstalment = bnplConfig ? Math.ceil(total * (1 + bnplConfig.interestRate) / bnplConfig.instalments) : 0;

  const handleUseLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location access is required to use GPS.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const newCoords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      setCoords(newCoords);
      if (Platform.OS !== 'web') {
        const [rev] = await Location.reverseGeocodeAsync(newCoords);
        if (rev) setAddress(`${rev.name || ''} ${rev.street || ''}, ${rev.city || ''}`.trim());
      }
    } catch (e) {
      Alert.alert('Location Error', 'Unable to fetch GPS data.');
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (address.length > 5 && step === 'checkout' && Platform.OS !== 'web') {
      const t = setTimeout(async () => {
        try {
          const res = await Location.geocodeAsync(address);
          if (res && res.length > 0) {
            setCoords({ latitude: res[0].latitude, longitude: res[0].longitude });
          }
        } catch (e) {
          // geocoding failed, continue without coordinates
        }
      }, 1000); // Reduced delay for faster response
      return () => clearTimeout(t);
    }
  }, [address, step]);

  // ── Empty cart ──────────────────────────────────────────────────────────────
  if (items.length === 0 && step === 'cart') {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="My Cart" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)} colors={colors} showBack={false} />
        <View style={s.emptyState}> 
          <MaterialCommunityIcons name="cart-outline" size={72} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Your cart is empty</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>
            Browse local shops and add items to get started
          </Text>
          <Button
            title="Start Shopping"
            onPress={() => router.replace('/(tabs)' as any)}
            style={{ marginTop: Spacing.xl }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Place order ─────────────────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (!address.trim()) { Alert.alert('Address Required', 'Please enter your delivery address.'); return; }
    if (!phone.trim())   { Alert.alert('Phone Required',   'Please enter your phone number.');    return; }
    if (payMethod === 'wallet') {
      if (!user) { Alert.alert('Sign in required', 'Please sign in to pay with your WimaKit Wallet.'); return; }
      if (walletBalance < total) { Alert.alert('Insufficient Balance', `Your wallet has ${formatPrice(walletBalance)}. You need ${formatPrice(total)}.`); return; }
    }
    if (payMethod === 'bnpl') {
      if (!user) { Alert.alert('Sign in required', 'Please sign in to use Buy Now Pay Later.'); return; }
      if (!user.bnplEligible) { Alert.alert('Not Available', 'Buy Now Pay Later is not yet unlocked on your account.'); return; }
      const BNPL_MIN = 100_000; // mirrors backend bnpl.js PRODUCTS min
      if (total < BNPL_MIN) { Alert.alert('BNPL Minimum', `Minimum order for BNPL is ${formatPrice(BNPL_MIN)}.`); return; }
    }
    setPlacing(true);
    const orderId = `ord${Date.now()}`;
    try {
      // 1. Create order on backend
      const orderPayload = {
        customOrderId: orderId,
        items: items.map(item => ({
          product: (item.product as any)._id || item.product.id,
          name: item.product.name,
          image: (item.product.images ?? [])[0],
          price: item.product.price,
          quantity: item.quantity,
        })),
        deliveryAddress: address,
        buyerPhone: phone,
        deliveryCoordinates: {
          type: 'Point',
          coordinates: coords ? [coords.longitude, coords.latitude] : [-13.2345, 8.4845],
        },
        paymentMethod: payMethod,
        subtotal: subtotal, // Send subtotal, backend calculates final total
        deliveryFee: deliveryFee,
      };
      const { data: resp } = await ordersApi.create(orderPayload);

      // Real response shape: { success, order, orders, splitCount, ... } —
      // `orders` covers both the single- and multi-seller-split cases.
      const orders: any[] = Array.isArray(resp?.orders) ? resp.orders : [resp?.order ?? resp];
      const firstOrder = orders[0];

      // Add all to local store
      orders.forEach((o: any) => addOrder(o));

      // Set current ID for tracking/bill display
      // If split, we show the first one or just navigate to the orders list
      setCurrentOrderId(firstOrder.customOrderId || firstOrder._id);

      // BNPL needs a second call once the order(s) exist, to actually create
      // the instalment plan against the real server-computed total.
      if (payMethod === 'bnpl') {
        for (const ord of orders) {
          try {
            await applyBnplMut.mutateAsync({ orderId: ord._id, planType: bnplPlan });
          } catch (e: any) {
            // Order already exists at this point — surface the issue but don't
            // block the buyer from reaching their order/receipt.
            Toast.show({ type: 'error', text1: 'BNPL setup issue', text2: e?.response?.data?.message ?? 'Please set up your plan from the order page.' });
          }
        }
      }

      // 2. Initiate payment (dial-code methods only — wallet/bnpl are already
      // settled or scheduled server-side the moment the order was created)
      let paymentResult;
      if (isDialCodeMethod) {
        paymentResult = await initiatePayment({
          method: payMethod,
          amount: total,
          orderId: orders.length > 1 ? orderId : firstOrder.customOrderId,
          buyerPhone: phone, buyerName: user?.name ?? 'Guest',
          description: `WimaKit Order – ${getTotalItems()} item(s)`,
        });
      }

      setPayRef(paymentResult?.reference ?? '');

      const eta = new Date(Date.now() + 2.5 * 60 * 60 * 1000)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (payMethod === 'cod') {
        const sellerPhone = (items[0]?.product.seller as any)?.phone;
        const billData: any = {
          orderId, buyerName: user?.name ?? 'Guest', buyerPhone: phone,
          deliveryAddress: address,
          sellerName: items[0]?.product.seller.name ?? '',
          storeName:  items[0]?.product.seller.storeName ?? '',
          // Real seller phone when the product data has it; never show a
          // fake placeholder number on a bill the buyer may actually call.
          sellerPhone: sellerPhone || 'See order page for contact details',
          items: [...items], subtotal, deliveryFee, total,
          createdAt: new Date().toISOString(), estimatedTime: eta,
        };
        const bill = generateCODBill(billData);
        setCodBillHtml(bill.html);
        setBillPlainText(bill.plainText);
        clearCart(); setPlacing(false); setStep('bill');
      } else if (isDialCodeMethod) {
        clearCart(); setPlacing(false); setStep('paying');
      } else {
        // wallet / bnpl — nothing further to collect from the buyer; treat
        // like a completed order and drop them onto the order tracking page.
        clearCart(); setPlacing(false);
        Toast.show({ type: 'success', text1: payMethod === 'wallet' ? 'Paid from your wallet' : 'Order placed — BNPL plan active' });
        router.replace(`/order/${firstOrder.customOrderId || firstOrder._id}` as any);
      }
    } catch (err: any) {
      setPlacing(false);
      const msg = err?.response?.data?.message ?? 'Please try again.';
      Toast.show({ type: 'error', text1: 'Order failed', text2: msg });
    }
  };

  // ── COD Bill step ───────────────────────────────────────────────────────────
  if (step === 'bill') {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Your Delivery Bill" onBack={() => router.replace('/(tabs)' as any)} colors={colors} showBack={false} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <LinearGradient colors={[colors.primary, colors.primaryLight]} style={s.successBanner}>
            <MaterialCommunityIcons name="check-circle-outline" size={52} color="#fff" />
            <Text style={s.successTitle}>Order Confirmed!</Text>
            <Text style={s.successRef}>Bill Ref: WMK-{currentOrderId.slice(-8).toUpperCase()}</Text>
            <Text style={s.successSub}>Pay the exact amount to the rider on delivery.</Text>
          </LinearGradient>
          <View style={[s.webviewCard, { borderColor: colors.border }]}>
            {Platform.OS === 'web' ? (
              <View style={{ height: 400, padding: Spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
                  Receipt view is optimized for mobile devices.{'\n'}
                  Please use "Share Bill" to view the plain-text version.
                </Text>
              </View>
            ) : (
              <WebView
                source={{ html: codBillHtml }}
                style={{ height: 700 }}
                scrollEnabled={false}
                originWhitelist={['*']}
              />
            )}
          </View>
          <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
            <Button title="📤 Share Bill via WhatsApp/SMS"
              onPress={() => Share.share({ message: String(billPlainText), title: 'WimaKit Delivery Bill' })}
              variant="outline" fullWidth />
            <Button title="📋 Track My Order"
              onPress={() => router.replace(`/order/${currentOrderId}` as any)}
              variant="primary" fullWidth />
            <Button title="Continue Shopping"
              onPress={() => router.replace('/(tabs)' as any)}
              variant="ghost" fullWidth />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Mobile money paying step ────────────────────────────────────────────────
  if (step === 'paying') {
    // This screen only makes sense for the 4 dial-code methods (orange_money,
    // afrimoney, moneymi, ...) — wallet/bnpl skip straight to the order page
    // since they're already settled server-side. If reached without a valid
    // selectedMeta (shouldn't happen given the isDialCodeMethod guard on
    // setStep('paying')), fail safely back to cart rather than render broken UI.
    if (!selectedMeta) {
      setStep('cart');
      return null;
    }
    const dialCodes: Record<string, string> = {
      orange_money: '*144#', afrimoney: '*222#', moneymi: '*454#',
    };
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Complete Payment" onBack={() => router.replace('/(tabs)' as any)} colors={colors} showBack={false} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg }}>
          <LinearGradient colors={[selectedMeta.color, selectedMeta.color + 'BB']}
            style={s.gatewayBanner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <MaterialCommunityIcons name={selectedMeta.icon as any} size={48} color="#fff" />
            <Text style={s.gatewayTitle}>Order Placed!</Text>
            <Text style={s.gatewaySub}>Complete payment via {selectedMeta.label}</Text>
          </LinearGradient>
          <View style={[s.amountBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.amountLabel, { color: colors.textMuted }]}>Amount Due</Text>
            <Text style={[s.amountValue, { color: colors.primary }]}>{formatPrice(total)}</Text>
            <Text style={[s.amountRef, { color: colors.textMuted }]}>Ref: {payRef}</Text>
          </View>
          <View style={[s.howToCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.howToTitle, { color: colors.textPrimary }]}>
              {selectedMeta.icon} How to pay via {selectedMeta.label}
            </Text>
            {selectedMeta.steps.map((step, i) => (
              <View key={i} style={s.instrRow}>
                <View style={[s.instrNum, { backgroundColor: colors.primaryMuted }]}>
                  <Text style={[s.instrNumTxt, { color: colors.primary }]}>{i + 1}</Text>
                </View>
                <Text style={[s.instrText, { color: colors.textSecondary }]}>{step}</Text>
              </View>
            ))}
          </View>
          {!!selectedMeta.comingSoonMsg && (
            <View style={[s.infoNotice, { backgroundColor: colors.infoMuted }]}>
              <MaterialCommunityIcons name="information-outline" size={20} color={colors.info} />
              <View style={{ flex: 1 }}>
                <Text style={[s.infoTitle, { color: colors.info }]}>Direct integration coming soon</Text>
                <Text style={[s.infoText, { color: colors.textSecondary }]}>{selectedMeta.comingSoonMsg}</Text>
              </View>
            </View>
          )}
          <TouchableOpacity
            style={[s.dialBtn, { backgroundColor: selectedMeta.color }]}
            onPress={() => {
              const code = dialCodes[payMethod];
              if (code) Linking.openURL(`tel:${code}`).catch(() => Alert.alert('Dial manually', code));
            }}
          >
            <Text style={s.dialBtnText}>📞 Dial {dialCodes[payMethod]} Now</Text>
          </TouchableOpacity>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <Button title="✓ I've Completed Payment"
            onPress={() => {
              Toast.show({ type: 'success', text1: '✅ Payment noted!', text2: "We'll confirm when received." });
              router.replace(`/order/${currentOrderId}` as any);
            }}
            variant="primary" fullWidth size="lg" />
          <Button title="Continue Shopping"
            onPress={() => router.replace('/(tabs)' as any)}
            variant="ghost" fullWidth style={{ marginTop: Spacing.md }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Checkout step ───────────────────────────────────────────────────────────
  if (step === 'checkout') {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Checkout" onBack={() => setStep('cart')} colors={colors} showBack />
        <StepBar current={1} colors={colors} />
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={{ padding: Spacing.lg }}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>📍 Delivery Details</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[s.fieldLabel, { color: colors.textPrimary }]}>Delivery Address *</Text>
              <TouchableOpacity onPress={handleUseLocation} disabled={locating}>
                <Text style={{ color: colors.primary, fontSize: FontSize.xs, fontWeight: '700' }}>
                  {locating ? 'Locating...' : '📍 Use GPS'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border + '40', backgroundColor: colors.surface, minHeight: 64, textAlignVertical: 'top' }]}
              placeholder="E.g. 25 Wilberforce Street, Freetown"
              placeholderTextColor={colors.textMuted}
              value={address} onChangeText={setAddress} multiline
            />
            {Platform.OS !== 'web' && (
              <View style={[s.mapCard, { borderColor: colors.border, backgroundColor: colors.skeleton }]}>
                <MapView
                  style={StyleSheet.absoluteFillObject}
                  region={{
                    latitude: coords?.latitude ?? 8.4845, // Default to Freetown if not resolved
                    longitude: coords?.longitude ?? -13.2345,
                    latitudeDelta: coords ? 0.01 : 0.05,
                    longitudeDelta: coords ? 0.01 : 0.05,
                  }}
                  scrollEnabled={true} // Allow users to adjust the pin slightly if needed
                >
                  {/* Free OpenStreetMap tiles fallback */}
                  <UrlTile
                    urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maximumZ={19}
                    flipY={false}
                  />
                  {coords && <Marker coordinate={coords} pinColor={colors.primary} />}
                </MapView>
                {!coords && (
                  <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }]}>
                    <Text style={{ fontSize: FontSize.xs, color: colors.textMuted, backgroundColor: 'rgba(255,255,255,0.7)', padding: 4, borderRadius: 4 }}>
                      {address.length > 5 ? 'Resolving location...' : 'Type address to see map'}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {coords && Platform.OS === 'web' && (
              <View style={[s.mapCard, { borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised }]}>
                <Text style={{ color: colors.textMuted }}>📍 Location Selected on Map</Text>
                <Text style={{ fontSize: FontSize.xs, color: colors.primary }}>{coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}</Text>
              </View>
            )}
            <Text style={[s.fieldLabel, { color: colors.textPrimary }]}>Phone Number *</Text>
            <TextInput
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border + '40', backgroundColor: colors.surface }]}
              placeholder="+232 76 000000"
              placeholderTextColor={colors.textMuted}
              value={phone} onChangeText={setPhone} keyboardType="phone-pad"
            />
          </View>
          <View style={{ paddingHorizontal: Spacing.lg }}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary, marginTop: Spacing.lg }]}>💳 Payment Method</Text>
            {PAYMENT_METHODS_META.map((pm) => (
              <TouchableOpacity
                key={pm.id}
                style={[s.pmRow, { backgroundColor: colors.surface, borderColor: payMethod === pm.id ? pm.color : colors.border },
                  payMethod === pm.id && { backgroundColor: pm.bgColor }]}
                onPress={() => setPayMethod(pm.id)} activeOpacity={0.85}
              >
                <View style={[s.pmIconWrap, { backgroundColor: pm.color + '28' }]}>
                  <MaterialCommunityIcons name={pm.icon as any} size={26} color={pm.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.pmName, { color: payMethod === pm.id ? pm.color : colors.textPrimary }]}>{pm.label}</Text>
                  <Text style={[s.pmSub, { color: colors.textMuted }]}>{pm.shortDesc}</Text>
                  {pm.id === 'cod' ? (
                    <View style={[s.pmPill, { backgroundColor: colors.successLight }]}>
                      <Text style={[s.pmPillText, { color: colors.success }]}>✓ Bill generated on confirm</Text>
                    </View>
                  ) : (
                    <View style={[s.pmPill, { backgroundColor: colors.skeleton }]}>
                      <Text style={[s.pmPillText, { color: colors.textMuted }]}>Dial-in activation</Text>
                    </View>
                  )}
                </View>
                <View style={[s.radio, { borderColor: payMethod === pm.id ? pm.color : colors.border }]}>
                  {payMethod === pm.id && <View style={[s.radioDot, { backgroundColor: pm.color }]} />}
                </View>
              </TouchableOpacity>
            ))}

            {/* Wallet — settled instantly, server-side, no dial-in needed */}
            <TouchableOpacity
              style={[s.pmRow, { backgroundColor: colors.surface, borderColor: payMethod === 'wallet' ? '#8B5CF6' : colors.border },
                payMethod === 'wallet' && { backgroundColor: '#8B5CF615' }]}
              onPress={() => setPayMethod('wallet')} activeOpacity={0.85}
            >
              <View style={[s.pmIconWrap, { backgroundColor: '#8B5CF628' }]}>
                <MaterialCommunityIcons name="wallet-outline" size={26} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.pmName, { color: payMethod === 'wallet' ? '#8B5CF6' : colors.textPrimary }]}>WimaKit Wallet</Text>
                <Text style={[s.pmSub, { color: colors.textMuted }]}>Balance: {formatPrice(walletBalance)}</Text>
              </View>
              <View style={[s.radio, { borderColor: payMethod === 'wallet' ? '#8B5CF6' : colors.border }]}>
                {payMethod === 'wallet' && <View style={[s.radioDot, { backgroundColor: '#8B5CF6' }]} />}
              </View>
            </TouchableOpacity>

            {/* BNPL — admin-gated, shown disabled with an explanation if locked */}
            <TouchableOpacity
              style={[s.pmRow, {
                backgroundColor: colors.surface,
                borderColor: payMethod === 'bnpl' ? '#EC4899' : colors.border,
                opacity: user?.bnplEligible ? 1 : 0.5,
              }, payMethod === 'bnpl' && { backgroundColor: '#EC489915' }]}
              disabled={!user?.bnplEligible}
              onPress={() => setPayMethod('bnpl')} activeOpacity={0.85}
            >
              <View style={[s.pmIconWrap, { backgroundColor: '#EC489928' }]}>
                <MaterialCommunityIcons name={user?.bnplEligible ? 'calendar-month' : 'lock-outline'} size={26} color="#EC4899" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.pmName, { color: payMethod === 'bnpl' ? '#EC4899' : colors.textPrimary }]}>Buy Now Pay Later</Text>
                <Text style={[s.pmSub, { color: colors.textMuted }]}>
                  {user?.bnplEligible ? 'Split into 2x, 3x, 6x or 12x' : 'Not yet unlocked — keep shopping to qualify'}
                </Text>
              </View>
              <View style={[s.radio, { borderColor: payMethod === 'bnpl' ? '#EC4899' : colors.border }]}>
                {payMethod === 'bnpl' && <View style={[s.radioDot, { backgroundColor: '#EC4899' }]} />}
              </View>
            </TouchableOpacity>

            {payMethod === 'bnpl' && user?.bnplEligible && (
              <View style={[s.bnplPicker, { backgroundColor: '#EC489912', borderColor: '#EC4899' }]}>
                <Text style={[s.bnplPickerTitle, { color: '#EC4899' }]}>Select a plan</Text>
                <View style={s.bnplPickerRow}>
                  {BNPL_PLANS.map(plan => {
                    const instalment = Math.ceil(total * (1 + plan.interestRate) / plan.instalments);
                    const eligible = total <= plan.maxAmount;
                    return (
                      <TouchableOpacity key={plan.id}
                        style={[s.bnplPickerBtn, {
                          backgroundColor: bnplPlan === plan.id ? '#EC4899' : colors.surface,
                          borderColor: bnplPlan === plan.id ? '#EC4899' : colors.border,
                          opacity: eligible ? 1 : 0.4,
                        }]}
                        onPress={() => eligible && setBnplPlan(plan.id)} disabled={!eligible}>
                        <Text style={{ fontSize: FontSize.sm, fontWeight: '800', color: bnplPlan === plan.id ? '#fff' : colors.textPrimary }}>{plan.label}</Text>
                        <Text style={{ fontSize: FontSize.xs, color: bnplPlan === plan.id ? 'rgba(255,255,255,0.85)' : colors.textMuted }}>
                          {eligible ? `${formatPrice(instalment, true)}/mo` : 'Limit exceeded'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
          <View style={[s.summaryCard, { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1, margin: Spacing.lg }]}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Order Summary</Text>
            {Object.entries(groupedItems).map(([sellerId, shopItems]) => (
              <View key={`summary-group-${sellerId}`} style={{ marginBottom: Spacing.sm }}>
                <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: colors.primary, marginBottom: 4 }}>
                  {shopItems[0].product.seller.storeName || 'Local Shop'}
                </Text>
                {shopItems.map(({ product, quantity }) => (
                  <SR key={`summary-row-${(product as any)._id || product.id}`} label={`${product.name} ×${quantity}`} value={formatPrice(product.price * quantity)} colors={colors} />
                ))}
              </View>
            ))}
            <View style={[s.divider, { backgroundColor: colors.border, marginVertical: Spacing.sm }]} />
            <SR label="Subtotal"     value={formatPrice(subtotal)}    colors={colors} />
            <SR label="Platform Fee (6%)" value={formatPrice(platformFee)} colors={colors} />
            <SR label="Delivery Fee" value={formatPrice(deliveryFee)} colors={colors} />
            <View style={[s.divider, { backgroundColor: colors.border, marginVertical: Spacing.sm }]} />
            <SR label="Total" value={formatPrice(total)} colors={colors} bold />
          </View>
          <View style={{ padding: Spacing.lg, paddingBottom: 40 }}>
            <Button
              title={placing ? 'Placing Order...' : `Place Order · ${formatPrice(total)}`}
              onPress={handlePlaceOrder} loading={placing} fullWidth size="lg"
            />
            <Text style={[s.tosText, { color: colors.textMuted }]}>
              {payMethod === 'cod'
                ? '💵 A printable delivery bill will be generated after confirming.'
                : payMethod === 'wallet'
                ? '⚡ Your WimaKit Wallet will be charged instantly — no fees.'
                : payMethod === 'bnpl'
                ? `📅 Your ${bnplConfig?.label ?? ''} instalment plan starts right after confirming.`
                : `${selectedMeta?.icon ?? ''} Payment instructions for ${selectedMeta?.label ?? 'your selected method'} will appear after confirming.`}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Cart step ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <Header
        title={`Cart (${getTotalItems()})`}
        onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}
        colors={colors}
        right={
          <TouchableOpacity onPress={() =>
            Alert.alert('Clear Cart', 'Remove all items?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clearCart },
            ])
          }>
            <Text style={[s.clearTxt, { color: colors.error }]}>Clear</Text>
          </TouchableOpacity>
        }
      />
      <StepBar current={0} colors={colors} /> 
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ padding: Spacing.lg }}>
          {Object.entries(groupedItems).map(([sellerId, shopItems]) => (
            <View key={`cart-seller-group-${sellerId}`} style={{ marginBottom: Spacing.lg }}>
              <View style={s.storeHeader}>
                <MaterialCommunityIcons name="store-outline" size={18} color={colors.textPrimary} />
                <Text style={[s.storeHeaderText, { color: colors.textPrimary }]}>
                  {shopItems[0].product.seller.storeName || 'Local Shop'}
                </Text>
              </View>
              {shopItems.map(({ product, quantity }) => ( // Ensure ProductCard is also sleek
                <View key={`cart-row-${(product as any)._id || product.id}`} style={[s.cartRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Image source={{ uri: (product.images ?? [])[0] }} style={s.cartImg} contentFit="cover" />
                  <View style={s.cartInfo}>
                    <Text style={[s.cartName, { color: colors.textPrimary }]} numberOfLines={2}>{product.name}</Text>
                    <Text style={[s.cartPrice, { color: colors.primary }]}>{formatPrice(product.price)}</Text>
                  </View>
                  <View style={[s.qtyCol, { borderColor: colors.border }]}>
                    <TouchableOpacity 
                      style={[s.qtyBtn, { backgroundColor: colors.background }]} 
                      onPress={() => updateQty(product._id ?? product.id ?? "", quantity - 1)}
                    >
                      <MaterialCommunityIcons name={quantity === 1 ? 'trash-can-outline' : 'minus'} size={15} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[s.qtyNum, { color: colors.textPrimary }]}>{quantity}</Text>
                    <TouchableOpacity 
                      style={[s.qtyBtn, { backgroundColor: colors.background }]} 
                      onPress={() => {
                        if (quantity >= (product.stock ?? Infinity)) {
                          Toast.show({ type: 'info', text1: `Only ${product.stock} in stock` });
                          return;
                        }
                        updateQty(product._id ?? product.id ?? "", quantity + 1);
                      }}
                    >
                      <MaterialCommunityIcons name="plus" size={15} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
        <View style={[s.summaryCard, { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1, marginHorizontal: Spacing.lg }]}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Order Summary</Text>
          {Object.entries(groupedItems).map(([storeName, shopItems]) => (
            <View key={`summary-cart-store-${storeName}`} style={{ marginBottom: Spacing.sm }}>
              <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: colors.primary, marginBottom: 4 }}>{storeName}</Text>
              {shopItems.map(({ product, quantity }) => (
                <SR key={`summary-cart-item-${(product as any)._id || product.id}`} label={`${product.name} ×${quantity}`} value={formatPrice(product.price * quantity)} colors={colors} />
              ))}
            </View>
          ))}
          <SR key="subtotal-summary" label="Subtotal"            value={formatPrice(subtotal)}    colors={colors} />
          <SR key="delivery-fee-summary" label="Delivery Fee (Freetown)" value={formatPrice(deliveryFee)} colors={colors} />
          <View style={[s.divider, { backgroundColor: colors.border, marginVertical: Spacing.sm }]} />
          <SR key="total-summary" label="Total" value={formatPrice(total)} colors={colors} bold />
        </View>
        <View style={{ padding: Spacing.lg, paddingBottom: 40 }}>
          <Button title="Proceed to Checkout →" onPress={() => setStep('checkout')} fullWidth size="lg" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function Header({ title, onBack, right, colors, showBack = true }: { title: string; onBack: () => void; right?: React.ReactNode; colors: any; showBack?: boolean }) {
  return (
    <View style={[s.header, { borderBottomColor: colors.border + '20' }]}>
      <TouchableOpacity style={s.backBtn} onPress={onBack} disabled={!showBack}>
        <Text style={[s.backTxt, { color: colors.primary }]}>‹</Text>
      </TouchableOpacity>
      <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
      <View style={{ width: 56, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

function StepBar({ current, colors }: { current: number; colors: any }) {
  return (
    <View style={[s.stepBar, { borderBottomColor: colors.border + '20' }]}>
      {(['Cart', 'Checkout', 'Payment'] as const).map((label, i) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', flex: i < 2 ? 1 : 0 }}>
          <View style={[s.stepDot, { backgroundColor: i <= current ? colors.primary : colors.border + '40' }]}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{i + 1}</Text>
          </View>
          <Text style={[s.stepTxt, { color: i <= current ? colors.primary : colors.textMuted }]}>{label}</Text>
          {i < 2 && <View style={[s.stepLine, { backgroundColor: i < current ? colors.primary : colors.border }]} />}
        </View>
      ))}
    </View>
  );
}

function SR({ label, value, bold, colors }: { label: string; value: string; bold?: boolean; colors: any }) {
  return (
    <View style={s.srRow}>
      <Text style={[s.srLabel, { color: colors.textMuted }, bold && { color: colors.textPrimary, fontWeight: '800', fontSize: FontSize.md }]}>{label}</Text>
      <Text style={[s.srValue, { color: colors.textPrimary }, bold && { color: colors.primary, fontWeight: '900', fontSize: FontSize.lg }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backTxt: { fontSize: 36, fontWeight: '100', marginTop: -4 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700', flex: 1, textAlign: 'center' },
  clearTxt: { fontSize: FontSize.sm, fontWeight: '700' },
  stepBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.xl, borderBottomWidth: 0.3 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: FontSize.xs, marginLeft: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  stepLine: { flex: 1, height: 1, marginHorizontal: Spacing.md },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '800' },
  emptySub: { fontSize: FontSize.md, textAlign: 'center' },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.lg, letterSpacing: 0.5 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 6, marginTop: Spacing.md },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, fontSize: FontSize.md, marginBottom: Spacing.md, minHeight: 54 },
  mapCard: { height: 200, borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm, marginBottom: Spacing.md, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  map: { width: '100%', height: '100%' },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm, paddingLeft: 4 },
  storeHeaderText: { fontSize: FontSize.md, fontWeight: '800' },
  cartRow: { flexDirection: 'row', borderRadius: Radius.lg, marginBottom: Spacing.md, overflow: 'hidden', borderWidth: 0.5, borderColor: 'transparent', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
  cartImg: { width: 96, height: 96, borderRadius: Radius.lg },
  cartInfo: { flex: 1, padding: Spacing.md, gap: 4 },
  cartName: { fontSize: FontSize.sm, fontWeight: '700', lineHeight: 18 },
  cartStore: { fontSize: FontSize.xs },
  cartPrice: { fontSize: FontSize.md, fontWeight: '900' },
  qtyCol: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, gap: 6 },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  qtyNum: { fontSize: FontSize.md, fontWeight: '800', minWidth: 20, textAlign: 'center' },
  summaryCard: { borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, marginBottom: Spacing.md },
  srRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  srLabel: { fontSize: FontSize.sm },
  srValue: { fontSize: FontSize.sm, fontWeight: '700' },
  divider: { height: 1 },
  pmRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1.5 },
  pmIconWrap: { width: 46, height: 46, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  pmName: { fontSize: FontSize.md, fontWeight: '700' },
  pmSub: { fontSize: FontSize.xs, marginTop: 2 },
  pmPill: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  pmPillText: { fontSize: 10, fontWeight: '600' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.md },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  bnplPicker: { borderWidth: 1.5, borderRadius: Radius.xl, padding: Spacing.md, marginTop: 4, marginBottom: Spacing.sm, gap: 10 },
  bnplPickerTitle: { fontSize: FontSize.sm, fontWeight: '800' },
  bnplPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bnplPickerBtn: { width: '47%', borderWidth: 1.5, borderRadius: Radius.lg, padding: 10, alignItems: 'center', gap: 4 },
  tosText: { fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.md, lineHeight: 18 },
  successBanner: { padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
  successTitle: { fontSize: FontSize.xxl, fontWeight: '900', color: '#fff' },
  successRef: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace' },
  successSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20, marginTop: Spacing.sm },
  webviewCard: { marginHorizontal: Spacing.lg, borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, marginBottom: Spacing.lg },
  gatewayBanner: { borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  gatewayTitle: { fontSize: FontSize.xxl, fontWeight: '900', color: '#fff' },
  gatewaySub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  amountBox: { borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.lg, borderWidth: 1 },
  amountLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  amountValue: { fontSize: 42, fontWeight: '900', marginTop: 4 },
  amountRef: { fontSize: FontSize.xs, marginTop: 4 },
  howToCard: { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1 },
  howToTitle: { fontSize: FontSize.md, fontWeight: '800', marginBottom: Spacing.md },
  instrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.md },
  instrNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  instrNumTxt: { fontSize: 11, fontWeight: '800' },
  instrText: { fontSize: FontSize.sm, flex: 1, lineHeight: 20 },
  infoNotice: { flexDirection: 'row', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.lg, alignItems: 'flex-start' },
  infoTitle: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 2 },
  infoText: { fontSize: FontSize.xs, lineHeight: 18 },
  dialBtn: { borderRadius: Radius.lg, paddingVertical: Spacing.lg, alignItems: 'center', marginBottom: Spacing.md },
  dialBtnText: { fontSize: FontSize.lg, fontWeight: '800', color: '#fff' },
});
