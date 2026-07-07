import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { useAuthStore } from '../store';
import { deliveryPricingApi } from '../utils/api';
import { formatPrice } from '../constants/data';
import DeliveryCalculator from '../components/delivery/DeliveryCalculator';

const SL_DISTRICTS = [
  'Western Area Urban','Western Area Rural','Bo','Kenema','Kailahun',
  'Kono','Bombali','Tonkolili','Port Loko','Kambia','Pujehun',
  'Bonthe','Moyamba','Karene','Falaba',
];

export default function DeliveryPricingScreen() {
  const { colors } = useTheme();
  const router     = useRouter();
  const user       = useAuthStore(s => s.user);
  const isAdmin    = user?.role === 'admin';

  const [config, setConfig]   = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState<'calculator'|'rates'|'zones'|'analytics'>(isAdmin ? 'rates' : 'calculator');

  // Editable admin fields
  const [perKmRate,    setPerKmRate]    = useState('');
  const [baseFee,      setBaseFee]      = useState('');
  const [minFee,       setMinFee]       = useState('');
  const [maxFee,       setMaxFee]       = useState('');
  const [freeThreshold,setFreeThreshold]= useState('');
  const [riderPct,     setRiderPct]     = useState('');
  const [peakSurcharge,setPeakSurcharge]= useState('');
  const [nightSurcharge,setNightSurcharge]=useState('');

  // Zone editor
  const [editingZone, setEditingZone] = useState<any>(null);
  const [showZoneEditor, setShowZoneEditor] = useState(false);

  useEffect(() => { if (isAdmin) loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [cfgRes, analyticsRes] = await Promise.all([
        deliveryPricingApi.adminConfig(),
        deliveryPricingApi.analytics(),
      ]);
      const c = cfgRes.data.config;
      setConfig(c);
      setAnalytics(analyticsRes.data.analytics);
      // Populate fields
      setPerKmRate(String(c.defaultPerKmRate ?? 3000));
      setBaseFee(String(c.defaultBaseFee ?? 5000));
      setMinFee(String(c.defaultMinFee ?? 5000));
      setMaxFee(String(c.defaultMaxFee ?? 80000));
      setFreeThreshold(String(c.freeDeliveryThreshold ?? 500000));
      setRiderPct(String(c.riderEarningsPercent ?? 85));
      setPeakSurcharge(String(Math.round((c.peakHourSurcharge ?? 0.25) * 100)));
      setNightSurcharge(String(Math.round((c.nightSurcharge ?? 0.50) * 100)));
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Failed to load config' });
    } finally { setLoading(false); }
  };

  const saveRates = useCallback(async () => {
    setSaving(true);
    try {
      const updates = {
        defaultPerKmRate:      +perKmRate,
        defaultBaseFee:        +baseFee,
        defaultMinFee:         +minFee,
        defaultMaxFee:         +maxFee,
        freeDeliveryThreshold: +freeThreshold,
        riderEarningsPercent:  +riderPct,
        peakHourSurcharge:     +peakSurcharge / 100,
        nightSurcharge:        +nightSurcharge / 100,
      };
      await deliveryPricingApi.updateConfig(updates);
      Toast.show({ type: 'success', text1: '✅ Rates updated!', text2: 'All riders have been notified.' });
      loadConfig();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Save failed' });
    } finally { setSaving(false); }
  }, [perKmRate, baseFee, minFee, maxFee, freeThreshold, riderPct, peakSurcharge, nightSurcharge]);

  const saveZone = useCallback(async (zone: any) => {
    try {
      await deliveryPricingApi.updateZone(zone);
      Toast.show({ type: 'success', text1: `Zone "${zone.name}" saved` });
      setShowZoneEditor(false); setEditingZone(null);
      loadConfig();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Failed to save zone' });
    }
  }, []);

  const toggleSurge = useCallback(async (district: string, active: boolean, multiplier: number) => {
    try {
      await deliveryPricingApi.toggleSurge(district, active, multiplier);
      Toast.show({ type: active ? 'warning' : 'success', text1: active ? '⚡ Surge activated' : '✓ Surge disabled' });
      loadConfig();
    } catch {}
  }, []);

  const TABS = [
    { id:'calculator', label:'Calculator', icon:'calculator-variant-outline', show: true },
    { id:'rates',      label:'Rates',      icon:'cash-multiple',              show: isAdmin },
    { id:'zones',      label:'Zones',      icon:'map-outline',                show: isAdmin },
    { id:'analytics',  label:'Analytics',  icon:'chart-line',                 show: isAdmin },
  ].filter(t => t.show);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
            {isAdmin ? 'Delivery Pricing Engine' : 'Delivery Calculator'}
          </Text>
          <Text style={[s.headerSub, { color: colors.textMuted }]}>Sierra Leone · All districts</Text>
        </View>
        {isAdmin && (
          <View style={[s.adminBadge, { backgroundColor: colors.primary + '20' }]}>
            <MaterialCommunityIcons name="shield-crown-outline" size={13} color={colors.primary} />
            <Text style={[s.adminBadgeText, { color: colors.primary }]}>Admin</Text>
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={[s.tabsRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id}
            style={[s.tab, tab === t.id && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t.id as any)}>
            <MaterialCommunityIcons name={t.icon as any} size={15} color={tab === t.id ? colors.primary : colors.textMuted} />
            <Text style={[s.tabText, { color: tab === t.id ? colors.primary : colors.textMuted }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}

      {!loading && (
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {/* ─── Calculator tab ─────────────────────────────────────── */}
          {tab === 'calculator' && (
            <View style={{ gap: Spacing.md }}>
              <DeliveryCalculator
                onFeeCalculated={(_result) => {}}
                orderValue={0} weightKg={0.5} showBreakdown />
              <View style={[s.infoCard, { backgroundColor: colors.primaryMuted, borderColor: colors.primary + '30' }]}>
                <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
                <Text style={[s.infoText, { color: colors.primary }]}>
                  Rates include peak hour (+25%) and night (+50%) adjustments. Orders over Le 500K get free delivery.
                </Text>
              </View>
            </View>
          )}

          {/* ─── Rates tab (admin) ──────────────────────────────────── */}
          {tab === 'rates' && isAdmin && config && (
            <View style={{ gap: Spacing.md }}>
              {/* Current rates banner */}
              <LinearGradient colors={['#4F46E5','#7C3AED']} style={s.ratesBanner}>
                <View>
                  <Text style={s.ratesBannerLabel}>Current Rate</Text>
                  <Text style={s.ratesBannerValue}>{formatPrice(+perKmRate)}/km</Text>
                </View>
                <View>
                  <Text style={s.ratesBannerLabel}>Config v{config.version}</Text>
                  <Text style={s.ratesBannerSub}>Last updated {new Date(config.updatedAt).toLocaleDateString()}</Text>
                </View>
              </LinearGradient>

              {/* Editable fields */}
              <SectionCard title="Base Pricing" icon="cash-multiple" colors={colors}>
                {[
                  { label: 'Per-km Rate (Le)', desc: 'Cost per km of distance', value: perKmRate, set: setPerKmRate },
                  { label: 'Base Fee (Le)',     desc: 'Fixed pickup/handling fee', value: baseFee, set: setBaseFee },
                  { label: 'Minimum Fee (Le)', desc: 'Lowest possible charge',    value: minFee,  set: setMinFee  },
                  { label: 'Maximum Fee (Le)', desc: 'Fee cap regardless of distance', value: maxFee, set: setMaxFee },
                  { label: 'Free Delivery Above (Le)', desc: 'Order value that earns free delivery', value: freeThreshold, set: setFreeThreshold },
                ].map(f => (
                  <View key={f.label} style={[s.fieldRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.fieldLabel, { color: colors.textPrimary }]}>{f.label}</Text>
                      <Text style={[s.fieldDesc, { color: colors.textMuted }]}>{f.desc}</Text>
                    </View>
                    <View style={[s.fieldInput, { backgroundColor: colors.surfaceAlt ?? colors.background, borderColor: colors.border }]}>
                      <TextInput
                        style={[s.fieldInputText, { color: colors.textPrimary }]}
                        value={f.value} onChangeText={f.set}
                        keyboardType="numeric" selectTextOnFocus />
                    </View>
                  </View>
                ))}
              </SectionCard>

              <SectionCard title="Rider & Platform Split" icon="account-cash-outline" colors={colors}>
                <View style={[s.fieldRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.fieldLabel, { color: colors.textPrimary }]}>Rider Earnings %</Text>
                    <Text style={[s.fieldDesc, { color: colors.textMuted }]}>Percentage of delivery fee rider keeps</Text>
                  </View>
                  <View style={[s.fieldInput, { backgroundColor: colors.surfaceAlt ?? colors.background, borderColor: colors.border }]}>
                    <TextInput style={[s.fieldInputText, { color: colors.textPrimary }]} value={riderPct} onChangeText={setRiderPct} keyboardType="numeric" selectTextOnFocus />
                    <Text style={[s.fieldInputUnit, { color: colors.textMuted }]}>%</Text>
                  </View>
                </View>
                <View style={[s.splitPreview, { backgroundColor: colors.primaryMuted }]}>
                  <View style={[s.splitBar, { backgroundColor: colors.primary, flex: +riderPct / 100 }]} />
                  <View style={[s.splitBar, { backgroundColor: colors.accent, flex: 1 - (+riderPct / 100) }]} />
                </View>
                <View style={s.splitLabels}>
                  <Text style={[s.splitLabel, { color: colors.primary }]}>Rider: {riderPct}%</Text>
                  <Text style={[s.splitLabel, { color: colors.accent }]}>Platform: {100 - +riderPct}%</Text>
                </View>
              </SectionCard>

              <SectionCard title="Time-of-Day Surcharges" icon="clock-alert-outline" colors={colors}>
                {[
                  { label: 'Peak Hour Surcharge', desc: '7–9am and 5–8pm', value: peakSurcharge, set: setPeakSurcharge, color: colors.warning },
                  { label: 'Night Surcharge',     desc: '10pm–6am',        value: nightSurcharge, set: setNightSurcharge, color: colors.error },
                ].map(f => (
                  <View key={f.label} style={[s.fieldRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.fieldLabel, { color: colors.textPrimary }]}>{f.label}</Text>
                      <Text style={[s.fieldDesc, { color: colors.textMuted }]}>{f.desc}</Text>
                    </View>
                    <View style={[s.fieldInput, { backgroundColor: f.color + '15', borderColor: f.color }]}>
                      <TextInput style={[s.fieldInputText, { color: f.color, fontWeight: '800' }]} value={f.value} onChangeText={f.set} keyboardType="numeric" selectTextOnFocus />
                      <Text style={[s.fieldInputUnit, { color: f.color }]}>%</Text>
                    </View>
                  </View>
                ))}
                <View style={[s.surchargeExample, { backgroundColor: colors.surfaceAlt ?? colors.surface }]}>
                  <Text style={[s.surchargeExampleText, { color: colors.textMuted }]}>
                    Example: Le 20,000 base fee → Peak: Le {Math.round(20000 * (1 + +peakSurcharge/100)).toLocaleString()} · Night: Le {Math.round(20000 * (1 + +nightSurcharge/100)).toLocaleString()}
                  </Text>
                </View>
              </SectionCard>

              {/* Save button */}
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
                onPress={saveRates} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : (<><MaterialCommunityIcons name="content-save-check-outline" size={18} color="#fff" />
                     <Text style={s.saveBtnText}>Save All Rates</Text></>)
                }
              </TouchableOpacity>
            </View>
          )}

          {/* ─── Zones tab (admin) ──────────────────────────────────── */}
          {tab === 'zones' && isAdmin && (
            <View style={{ gap: Spacing.md }}>
              <View style={[s.zoneNote, { backgroundColor: colors.info + '15', borderColor: colors.info }]}>
                <MaterialCommunityIcons name="information-outline" size={15} color={colors.info} />
                <Text style={[s.zoneNoteText, { color: colors.info }]}>
                  Zone overrides replace the default rate for specific districts. Surge pricing temporarily multiplies the zone fee.
                </Text>
              </View>

              {/* Existing zones */}
              {(config?.zones ?? []).length > 0 ? (
                config.zones.map((zone: any) => (
                  <View key={zone.district} style={[s.zoneCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.zoneName, { color: colors.textPrimary }]}>{zone.name}</Text>
                      <Text style={[s.zoneDistrict, { color: colors.textMuted }]}>{zone.district}</Text>
                      <Text style={[s.zoneRate, { color: colors.primary }]}>
                        {formatPrice(zone.baseFee)} base + {formatPrice(zone.perKmRate)}/km
                      </Text>
                    </View>
                    <View style={{ gap: 8, alignItems: 'flex-end' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[{ fontSize: 11, color: zone.isSurgeActive ? colors.warning : colors.textMuted }]}>
                          {zone.isSurgeActive ? `⚡ ${Math.round((zone.surgeMultiplier - 1) * 100)}% surge` : 'No surge'}
                        </Text>
                        <Switch
                          value={zone.isSurgeActive ?? false}
                          onValueChange={(v) => toggleSurge(zone.district, v, zone.surgeMultiplier || 1.5)}
                          trackColor={{ false: colors.border, true: colors.warning + '60' }}
                          thumbColor={zone.isSurgeActive ? colors.warning : colors.textMuted}
                          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                        />
                      </View>
                      <TouchableOpacity style={[s.editZoneBtn, { backgroundColor: colors.primaryMuted }]}
                        onPress={() => { setEditingZone(zone); setShowZoneEditor(true); }}>
                        <Text style={[{ fontSize: 11, color: colors.primary, fontWeight: '700' }]}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <View style={[s.emptyZones, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="map-plus" size={36} color={colors.textMuted} />
                  <Text style={[s.emptyZonesText, { color: colors.textMuted }]}>No zone overrides yet. Default rates apply everywhere.</Text>
                </View>
              )}

              {/* Add zone button */}
              <TouchableOpacity style={[s.addZoneBtn, { borderColor: colors.primary }]}
                onPress={() => { setEditingZone({ district: '', name: '', baseFee: '5000', perKmRate: '3000', minFee: '5000', maxFee: '80000', surgeMultiplier: 1.5, isSurgeActive: false }); setShowZoneEditor(true); }}>
                <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
                <Text style={[{ color: colors.primary, fontWeight: '700', fontSize: 14 }]}>Add Zone Override</Text>
              </TouchableOpacity>

              {/* Zone editor modal */}
              {showZoneEditor && editingZone && (
                <ZoneEditor zone={editingZone} districts={SL_DISTRICTS} colors={colors}
                  onSave={saveZone} onClose={() => { setShowZoneEditor(false); setEditingZone(null); }} />
              )}
            </View>
          )}

          {/* ─── Analytics tab (admin) ──────────────────────────────── */}
          {tab === 'analytics' && isAdmin && analytics && (
            <View style={{ gap: Spacing.md }}>
              <LinearGradient colors={['#059669','#10B981']} style={s.analyticsBanner}>
                <Text style={s.analyticsBannerTitle}>7-Day Delivery Revenue</Text>
                <Text style={s.analyticsBannerValue}>{formatPrice(analytics.weeklyRevenue)}</Text>
                <Text style={s.analyticsBannerSub}>{analytics.weeklyDeliveries} deliveries · Avg {formatPrice(analytics.avgDeliveryFee)}/delivery</Text>
              </LinearGradient>

              <SectionCard title="Live Status" icon="broadcast" colors={colors}>
                <View style={s.liveRow}>
                  <View style={[s.liveDot, { backgroundColor: colors.success }]} />
                  <Text style={[s.liveText, { color: colors.textPrimary }]}>{analytics.availableRiders} riders available now</Text>
                </View>
                {[
                  { label: 'Current Rate',      value: formatPrice(analytics.currentConfig.perKmRate) + '/km' },
                  { label: 'Base Fee',           value: formatPrice(analytics.currentConfig.baseFee)       },
                  { label: 'Free Above',         value: formatPrice(analytics.currentConfig.freeThreshold) },
                  { label: 'Rider Share',        value: analytics.currentConfig.riderEarningsPercent + '%' },
                ].map(r => (
                  <View key={r.label} style={[s.analyticsRow, { borderBottomColor: colors.border }]}>
                    <Text style={[s.analyticsLabel, { color: colors.textMuted }]}>{r.label}</Text>
                    <Text style={[s.analyticsValue, { color: colors.textPrimary }]}>{r.value}</Text>
                  </View>
                ))}
              </SectionCard>

              {analytics.topRiders?.length > 0 && (
                <SectionCard title="🏆 Top Riders This Week" icon="medal-outline" colors={colors}>
                  {analytics.topRiders.map((r: any, i: number) => (
                    <View key={r._id} style={[s.riderRow, { borderBottomColor: colors.border }]}>
                      <Text style={[s.riderRank, { color: i === 0 ? '#F59E0B' : colors.textMuted }]}>#{i+1}</Text>
                      <Text style={[s.riderName, { color: colors.textPrimary }]}>{r.name}</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[s.riderDeliveries, { color: colors.primary }]}>{r.deliveries} deliveries</Text>
                        <Text style={[s.riderEarnings, { color: colors.success }]}>{formatPrice(r.earnings)} earned</Text>
                      </View>
                    </View>
                  ))}
                </SectionCard>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SectionCard({ title, icon, children, colors }: any) {
  return (
    <View style={[sc.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={sc.header}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.primary} />
        <Text style={[sc.title, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ZoneEditor({ zone, districts, colors, onSave, onClose }: any) {
  const [name, setName]           = useState(zone.name ?? '');
  const [district, setDistrict]   = useState(zone.district ?? '');
  const [baseFee, setBaseFee]     = useState(String(zone.baseFee ?? '5000'));
  const [perKmRate, setPerKmRate] = useState(String(zone.perKmRate ?? '3000'));
  const [minFee, setMinFee]       = useState(String(zone.minFee ?? '5000'));
  const [maxFee, setMaxFee]       = useState(String(zone.maxFee ?? '80000'));
  const [surgeMultiplier, setSurgeMultiplier] = useState(String(zone.surgeMultiplier ?? '1.5'));
  const [isSurgeActive, setIsSurgeActive]     = useState(zone.isSurgeActive ?? false);

  return (
    <MotiView from={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      style={[ze.card, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
      <Text style={[ze.title, { color: colors.textPrimary }]}>
        {name || 'New Zone Override'}
      </Text>

      {[
        { label: 'Zone Name',     value: name,      set: setName,      kb: 'default' },
        { label: 'Base Fee (Le)', value: baseFee,   set: setBaseFee,   kb: 'numeric' },
        { label: 'Rate/km (Le)',  value: perKmRate, set: setPerKmRate, kb: 'numeric' },
        { label: 'Min Fee (Le)',  value: minFee,    set: setMinFee,    kb: 'numeric' },
        { label: 'Max Fee (Le)',  value: maxFee,    set: setMaxFee,    kb: 'numeric' },
      ].map(f => (
        <View key={f.label} style={ze.row}>
          <Text style={[ze.label, { color: colors.textMuted }]}>{f.label}</Text>
          <TextInput
            style={[ze.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt ?? colors.background }]}
            value={f.value} onChangeText={f.set} keyboardType={f.kb as any} />
        </View>
      ))}

      {/* District picker */}
      <View style={ze.row}>
        <Text style={[ze.label, { color: colors.textMuted }]}>District</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
          {districts.map((d: string) => (
            <TouchableOpacity key={d} style={[ze.districtChip, { backgroundColor: district === d ? colors.primary : colors.surfaceAlt ?? colors.background, borderColor: colors.border }]} onPress={() => setDistrict(d)}>
              <Text style={{ color: district === d ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '700' }}>{d}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Surge */}
      <View style={[ze.row, { alignItems: 'center' }]}>
        <Text style={[ze.label, { color: colors.textMuted, flex: 1 }]}>Surge Active</Text>
        <Switch value={isSurgeActive} onValueChange={setIsSurgeActive}
          trackColor={{ false: colors.border, true: colors.warning + '60' }}
          thumbColor={isSurgeActive ? colors.warning : colors.textMuted} />
      </View>
      {isSurgeActive && (
        <View style={ze.row}>
          <Text style={[ze.label, { color: colors.textMuted }]}>Surge Multiplier</Text>
          <TextInput style={[ze.input, { color: colors.warning, borderColor: colors.warning, backgroundColor: colors.warning + '10', fontWeight: '800' }]}
            value={surgeMultiplier} onChangeText={setSurgeMultiplier} keyboardType="decimal-pad" />
        </View>
      )}

      <View style={ze.btnRow}>
        <TouchableOpacity style={[ze.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
          <Text style={[ze.cancelText, { color: colors.textMuted }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[ze.saveBtn, { backgroundColor: colors.primary }]}
          onPress={() => onSave({ name, district, baseFee: +baseFee, perKmRate: +perKmRate, minFee: +minFee, maxFee: +maxFee, surgeMultiplier: +surgeMultiplier, isSurgeActive })}>
          <Text style={ze.saveText}>Save Zone</Text>
        </TouchableOpacity>
      </View>
    </MotiView>
  );
}

const sc = StyleSheet.create({
  card: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '800' },
});

const ze = StyleSheet.create({
  card: { borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.sm },
  title: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  row: { gap: 6 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  input: { borderWidth: 1.5, borderRadius: Radius.lg, padding: 10, fontSize: 14 },
  districtChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, marginRight: 6 },
  btnRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.lg, alignItems: 'center', borderWidth: 1.5 },
  cancelText: { fontWeight: '700' },
  saveBtn: { flex: 2, paddingVertical: 12, borderRadius: Radius.lg, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  headerTitle: { fontSize: FontSize.md, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 1 },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  adminBadgeText: { fontSize: 11, fontWeight: '800' },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  tabText: { fontSize: 11, fontWeight: '700' },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
  ratesBanner: { borderRadius: Radius.xl, padding: Spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratesBannerLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  ratesBannerValue: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 2 },
  ratesBannerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  fieldDesc: { fontSize: 11, marginTop: 1 },
  fieldInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 8, minWidth: 100 },
  fieldInputText: { fontSize: 15, fontWeight: '800', textAlign: 'right', flex: 1 },
  fieldInputUnit: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  splitPreview: { height: 12, borderRadius: 6, flexDirection: 'row', overflow: 'hidden', marginVertical: 8 },
  splitBar: { height: '100%' },
  splitLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  splitLabel: { fontSize: 12, fontWeight: '700' },
  surchargeExample: { borderRadius: Radius.md, padding: 10, marginTop: 8 },
  surchargeExampleText: { fontSize: 11, lineHeight: 16 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: Radius.xl },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  zoneNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
  zoneNoteText: { flex: 1, fontSize: 12, lineHeight: 18 },
  zoneCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.xl, padding: Spacing.md, gap: 12 },
  zoneName: { fontSize: 14, fontWeight: '700' },
  zoneDistrict: { fontSize: 11, marginTop: 1 },
  zoneRate: { fontSize: 12, fontWeight: '700', marginTop: 3 },
  editZoneBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.md },
  emptyZones: { alignItems: 'center', padding: 32, borderRadius: Radius.xl, borderWidth: 1, gap: 8 },
  emptyZonesText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  addZoneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.xl, borderWidth: 1.5, borderStyle: 'dashed' },
  analyticsBanner: { borderRadius: Radius.xl, padding: Spacing.lg, gap: 4 },
  analyticsBannerTitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  analyticsBannerValue: { color: '#fff', fontSize: 28, fontWeight: '900' },
  analyticsBannerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 14, fontWeight: '600' },
  analyticsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  analyticsLabel: { fontSize: 13 },
  analyticsValue: { fontSize: 13, fontWeight: '700' },
  riderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  riderRank: { fontSize: 16, fontWeight: '900', minWidth: 28 },
  riderName: { flex: 1, fontSize: 14, fontWeight: '600' },
  riderDeliveries: { fontSize: 12, fontWeight: '700' },
  riderEarnings: { fontSize: 11 },
});
