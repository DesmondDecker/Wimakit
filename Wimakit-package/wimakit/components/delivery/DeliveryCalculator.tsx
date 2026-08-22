import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, FlatList, Modal, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useTheme } from '../../context/ThemeContext';
import { deliveryPricingApi } from '../../utils/api';
import { formatPrice } from '../../constants/data';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';

interface Location { name: string; lat: number; lng: number; district: string; zone: string; }
interface PriceResult {
  fee: number; distanceKm: number; isFree: boolean; note: string;
  pickup: { name: string; district: string } | null;
  dropoff: { name: string; district: string } | null;
  estimatedTime: string; estimatedMinutes: number;
  breakdown: {
    isPeakHour: boolean; isNight: boolean; crossZone: boolean;
    riderEarning: number; platformEarning: number;
    pickupZone: string; dropZone: string; discountNote: string;
  };
}

interface Props {
  onFeeCalculated?: (result: PriceResult) => void;
  defaultPickup?: Location;
  orderValue?: number;
  weightKg?: number;
  showBreakdown?: boolean;
  compact?: boolean;
}

function LocationPicker({ label, value, onChange, colors }: any) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await deliveryPricingApi.locations(search || undefined);
        setLocations(res.data.locations ?? []);
      } catch {} finally { setLoading(false); }
    };
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search, open]);

  return (
    <>
      <TouchableOpacity
        style={[picker.btn, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: value ? colors.primary : colors.border }]}
        onPress={() => setOpen(true)}>
        <MaterialCommunityIcons name="map-marker-outline" size={18} color={value ? colors.primary : colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={[picker.btnLabel, { color: colors.textMuted }]}>{label}</Text>
          <Text style={[picker.btnValue, { color: value ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>
            {value?.name ?? 'Search location…'}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setOpen(false)} activeOpacity={1} />
          <View style={[picker.sheet, { backgroundColor: colors.surface }]}>
            <View style={[picker.handle, { backgroundColor: colors.border }]} />
            <Text style={[picker.sheetTitle, { color: colors.textPrimary }]}>{label}</Text>
            <View style={[picker.searchBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
              <TextInput
                style={[picker.searchInput, { color: colors.textPrimary }]}
                value={search} onChangeText={setSearch}
                placeholder="Search area, district or town…"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={locations} keyExtractor={(l) => l.name}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[picker.locRow, { borderBottomColor: colors.border, backgroundColor: value?.name === item.name ? colors.primaryMuted : 'transparent' }]}
                    onPress={() => { onChange(item); setOpen(false); setSearch(''); }}>
                    <View style={[picker.locIcon, { backgroundColor: colors.primaryMuted }]}>
                      <MaterialCommunityIcons name="map-marker" size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[picker.locName, { color: colors.textPrimary }]}>{item.name}</Text>
                      <Text style={[picker.locDistrict, { color: colors.textMuted }]}>{item.district}</Text>
                    </View>
                    {value?.name === item.name && <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', padding: 24 }}>
                    <MaterialCommunityIcons name="map-search-outline" size={36} color={colors.textMuted} />
                    <Text style={[{ color: colors.textMuted, marginTop: 8, fontSize: 13 }]}>No locations found</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function DeliveryCalculator({ onFeeCalculated, defaultPickup, orderValue = 0, weightKg = 0.5, showBreakdown = true, compact = false }: Props) {
  const { colors } = useTheme();
  const [pickup, setPickup]   = useState<Location | null>(defaultPickup ?? null);
  const [dropoff, setDropoff] = useState<Location | null>(null);
  const [result, setResult]   = useState<PriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const calculate = useCallback(async () => {
    if (!pickup || !dropoff) return;
    setLoading(true); setError(null);
    try {
      const res = await deliveryPricingApi.calculate({
        pickupLat: pickup.lat, pickupLng: pickup.lng,
        dropLat: dropoff.lat,  dropLng: dropoff.lng,
        orderValue, weightKg,
        isBulk: false, isRegularCustomer: false,
      });
      setResult(res.data);
      onFeeCalculated?.(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Calculation failed');
    } finally { setLoading(false); }
  }, [pickup, dropoff, orderValue, weightKg, onFeeCalculated]);

  useEffect(() => {
    if (pickup && dropoff) calculate();
  }, [pickup, dropoff]);

  return (
    <View style={[s.root, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {!compact && (
        <View style={s.header}>
          <MaterialCommunityIcons name="map-marker-distance" size={20} color={colors.primary} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Delivery Calculator</Text>
        </View>
      )}

      {/* Location pickers */}
      <View style={s.pickers}>
        <LocationPicker label="Pickup from" value={pickup} onChange={setPickup} colors={colors} />
        <View style={[s.routeLine, { borderColor: colors.border }]}>
          <MaterialCommunityIcons name="dots-vertical" size={18} color={colors.border} />
        </View>
        <LocationPicker label="Deliver to" value={dropoff} onChange={setDropoff} colors={colors} />
      </View>

      {/* Loading */}
      {loading && (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[s.loadingText, { color: colors.textMuted }]}>Calculating…</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={[s.errorBox, { backgroundColor: colors.error + '15', borderColor: colors.error }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.error} />
          <Text style={[s.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      {/* Result */}
      {result && !loading && (
        <MotiView from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300 }}>
          {/* Main fee card */}
          <View style={[s.feeCard, { backgroundColor: result.isFree ? colors.success + '15' : colors.primaryMuted, borderColor: result.isFree ? colors.success : colors.primary }]}>
            <View>
              <Text style={[s.feeLabel, { color: result.isFree ? colors.success : colors.primary }]}>
                {result.isFree ? '🎉 FREE DELIVERY' : 'Delivery Fee'}
              </Text>
              <Text style={[s.feeAmount, { color: result.isFree ? colors.success : colors.primary }]}>
                {result.isFree ? 'Free' : formatPrice(result.fee)}
              </Text>
              {result.note ? <Text style={[s.feeNote, { color: result.isFree ? colors.success : colors.textMuted }]}>{result.note}</Text> : null}
            </View>
            <View style={s.feeRight}>
              <MaterialCommunityIcons name="truck-fast-outline" size={28} color={result.isFree ? colors.success : colors.primary} />
              <Text style={[s.feeTime, { color: result.isFree ? colors.success : colors.textMuted }]}>~{result.estimatedTime}</Text>
            </View>
          </View>

          {/* Distance */}
          <View style={[s.distRow, { borderColor: colors.border }]}>
            <View style={s.distItem}>
              <MaterialCommunityIcons name="map-marker-distance" size={14} color={colors.textMuted} />
              <Text style={[s.distLabel, { color: colors.textMuted }]}>{result.distanceKm} km estimated</Text>
            </View>
            <View style={s.distItem}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={colors.textMuted} />
              <Text style={[s.distLabel, { color: colors.textMuted }]}>{result.estimatedTime} delivery</Text>
            </View>
          </View>

          {/* Route */}
          {result.pickup && result.dropoff && (
            <View style={s.routeWrap}>
              <View style={s.routeStop}>
                <View style={[s.routeDot, { backgroundColor: colors.success }]} />
                <Text style={[s.routeText, { color: colors.textPrimary }]}>{result.pickup.name}</Text>
                <Text style={[s.routeDistrict, { color: colors.textMuted }]}>{result.pickup.district}</Text>
              </View>
              <View style={[s.routeBar, { backgroundColor: colors.border }]} />
              <View style={s.routeStop}>
                <View style={[s.routeDot, { backgroundColor: colors.error }]} />
                <Text style={[s.routeText, { color: colors.textPrimary }]}>{result.dropoff.name}</Text>
                <Text style={[s.routeDistrict, { color: colors.textMuted }]}>{result.dropoff.district}</Text>
              </View>
            </View>
          )}

          {/* Surcharge warnings */}
          {(result.breakdown.isPeakHour || result.breakdown.isNight || result.breakdown.crossZone) && (
            <View style={[s.surchargeBox, { backgroundColor: colors.warning + '12', borderColor: colors.warning }]}>
              <MaterialCommunityIcons name="information-outline" size={14} color={colors.warning} />
              <Text style={[s.surchargeText, { color: colors.warning }]}>
                {[
                  result.breakdown.isPeakHour && 'Peak hour surcharge (+25%)',
                  result.breakdown.isNight    && 'Night surcharge (+50%)',
                  result.breakdown.crossZone  && 'Cross-zone delivery applies',
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
          )}

          {/* Breakdown (collapsible) */}
          {showBreakdown && !compact && (
            <View style={[s.breakdown, { borderColor: colors.border }]}>
              <Text style={[s.breakdownTitle, { color: colors.textMuted }]}>Fee Breakdown</Text>
              {[
                ['Distance', `${result.distanceKm} km`],
                ['Rider earns', formatPrice(result.breakdown.riderEarning)],
                ['Platform fee', formatPrice(result.breakdown.platformEarning)],
                ['Weight', `${(result.breakdown as any).weightKg ?? '-'} kg`],
                result.breakdown.discountNote ? ['Discount', result.breakdown.discountNote] : null,
              ].filter(Boolean).map(([k, v]: any) => (
                <View key={k} style={s.breakdownRow}>
                  <Text style={[s.breakdownKey, { color: colors.textMuted }]}>{k}</Text>
                  <Text style={[s.breakdownVal, { color: colors.textPrimary }]}>{v}</Text>
                </View>
              ))}
            </View>
          )}
        </MotiView>
      )}

      {/* Prompt */}
      {!result && !loading && !(pickup && dropoff) && (
        <View style={s.promptWrap}>
          <MaterialCommunityIcons name="map-marker-path" size={32} color={colors.textMuted} />
          <Text style={[s.promptText, { color: colors.textMuted }]}>
            Select pickup and delivery locations to see the fee
          </Text>
        </View>
      )}
    </View>
  );
}

const picker = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: Radius.xl, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  btnLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  btnValue: { fontSize: 14, fontWeight: '600', marginTop: 1 },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.lg, paddingBottom: 40, maxHeight: '80%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '800', marginBottom: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  locIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  locName: { fontSize: 14, fontWeight: '600' },
  locDistrict: { fontSize: 11, marginTop: 1 },
});

const s = StyleSheet.create({
  root: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  headerTitle: { fontSize: FontSize.md, fontWeight: '800' },
  pickers: { gap: 4 },
  routeLine: { alignItems: 'center', height: 16, borderLeftWidth: 2, marginLeft: 16 },
  loadingWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  loadingText: { fontSize: 13 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.sm },
  errorText: { flex: 1, fontSize: 12, fontWeight: '600' },
  feeCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.xl, padding: Spacing.md },
  feeLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  feeAmount: { fontSize: 26, fontWeight: '900', marginTop: 2 },
  feeNote: { fontSize: 11, marginTop: 2 },
  feeRight: { alignItems: 'center', gap: 4 },
  feeTime: { fontSize: 11, fontWeight: '600' },
  distRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1 },
  distItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  distLabel: { fontSize: 12 },
  routeWrap: { gap: 2 },
  routeStop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeText: { fontSize: 13, fontWeight: '600', flex: 1 },
  routeDistrict: { fontSize: 11 },
  routeBar: { width: 2, height: 12, marginLeft: 4 },
  surchargeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.sm },
  surchargeText: { flex: 1, fontSize: 11, fontWeight: '600', lineHeight: 16 },
  breakdown: { borderTopWidth: 1, paddingTop: 8, gap: 4 },
  breakdownTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  breakdownKey: { fontSize: 12 },
  breakdownVal: { fontSize: 12, fontWeight: '600' },
  promptWrap: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  promptText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
