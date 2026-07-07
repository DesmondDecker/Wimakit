import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuthStore } from '../../store';
import api, { profilesApi } from '../../utils/api';

// ─── Step config ──────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'brand',   label: 'Your Brand',   icon: 'storefront-outline',        desc: 'Set up your store identity' },
  { id: 'about',   label: 'About Store',  icon: 'information-outline',        desc: 'Tell buyers your story' },
  { id: 'payout',  label: 'Payout',       icon: 'bank-outline',               desc: 'How you get paid' },
  { id: 'preview', label: 'Preview',      icon: 'eye-outline',                desc: 'See your store' },
] as const;
type StepId = typeof STEPS[number]['id'];

// ─── SL districts ─────────────────────────────────────────────────────────────
const SL_DISTRICTS = [
  'Freetown','Bo','Kenema','Makeni','Koidu','Lunsar','Port Loko','Moyamba',
  'Bonthe','Pujehun','Kailahun','Kono','Bombali','Kambia','Falaba','Karene',
];

const STORE_CATEGORIES = [
  { slug:'fashion',     emoji:'👗', label:'Fashion & Clothing' },
  { slug:'electronics', emoji:'📱', label:'Electronics' },
  { slug:'food',        emoji:'🍎', label:'Food & Groceries' },
  { slug:'agric',       emoji:'🌱', label:'Agriculture' },
  { slug:'beauty',      emoji:'💄', label:'Beauty & Health' },
  { slug:'shoes',       emoji:'👟', label:'Shoes & Footwear' },
  { slug:'furniture',   emoji:'🛋️', label:'Furniture & Home' },
  { slug:'sports',      emoji:'⚽', label:'Sports & Fitness' },
  { slug:'phones',      emoji:'📲', label:'Phones & Accessories' },
  { slug:'computers',   emoji:'💻', label:'Computers & Tech' },
  { slug:'books',       emoji:'📚', label:'Books & Stationery' },
  { slug:'auto',        emoji:'🚗', label:'Auto Parts' },
];

const PAYOUT_METHODS = [
  { id:'orange_money',  icon:'💊',  label:'Orange Money',   color:'#FF6600', hint:'e.g. +232 76 123456' },
  { id:'afrimoney',     icon:'💜',  label:'Afrimoney',      color:'#6B21A8', hint:'e.g. +232 30 123456' },
  { id:'bank_transfer', icon:'🏦',  label:'Bank Transfer',  color:'#1D4ED8', hint:'Account number' },
  { id:'qmoney',        icon:'🟡',  label:'Q Money',        color:'#D97706', hint:'e.g. +232 88 123456' },
] as const;

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepBar({ current, colors }: { current: number; colors: any }) {
  return (
    <View style={sb.row}>
      {STEPS.map((s, i) => {
        const done    = i < current;
        const active  = i === current;
        return (
          <React.Fragment key={s.id}>
            <View style={sb.item}>
              <View style={[
                sb.circle,
                done   ? { backgroundColor: '#10B981', borderColor: '#10B981' } :
                active ? { backgroundColor: colors.primary, borderColor: colors.primary } :
                         { backgroundColor: 'transparent', borderColor: colors.border },
              ]}>
                {done
                  ? <MaterialCommunityIcons name="check" size={12} color="#fff" />
                  : <Text style={[sb.num, { color: active ? '#fff' : colors.textMuted }]}>{i+1}</Text>
                }
              </View>
              <Text style={[sb.label, { color: active ? colors.primary : colors.textMuted }]} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[sb.line, { backgroundColor: done ? '#10B981' : colors.border }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
const sb = StyleSheet.create({
  row:    { flexDirection:'row', alignItems:'flex-start', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: 0 },
  item:   { alignItems:'center', width: 64 },
  circle: { width:28, height:28, borderRadius:14, borderWidth:2, alignItems:'center', justifyContent:'center', marginBottom:4 },
  num:    { fontSize:11, fontWeight:'800' },
  label:  { fontSize:9, fontWeight:'700', textAlign:'center' },
  line:   { flex:1, height:2, marginTop:13, borderRadius:1 },
});

// ─── Preview card ─────────────────────────────────────────────────────────────
function StorePreviewCard({ logo, banner, storeName, storeDescription, location, categories, colors }: any) {
  return (
    <View style={[pv.card, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.md]}>
      {/* Banner */}
      <View style={pv.bannerWrap}>
        {banner
          ? <Image source={{ uri: banner }} style={pv.banner} contentFit="cover" />
          : <LinearGradient colors={['#4F46E5','#7C3AED']} style={pv.banner} />
        }
        <LinearGradient colors={['transparent','rgba(0,0,0,0.55)']} style={StyleSheet.absoluteFill} />
        {/* Logo */}
        <View style={[pv.logoWrap, { borderColor: colors.surface }]}>
          {logo
            ? <Image source={{ uri: logo }} style={pv.logo} contentFit="cover" />
            : <LinearGradient colors={['#4F46E5','#EC4899']} style={pv.logo}>
                <Text style={pv.logoInitial}>{(storeName || 'S')[0]?.toUpperCase()}</Text>
              </LinearGradient>
          }
        </View>
        <View style={pv.bannerTextRow}>
          <View style={[pv.liveDot, { backgroundColor:'#10B981' }]} />
          <Text style={pv.bannerSub}>WimaKit Seller</Text>
        </View>
      </View>

      {/* Info */}
      <View style={pv.info}>
        <Text style={[pv.name, { color: colors.textPrimary }]}>{storeName || 'Your Store Name'}</Text>
        {storeDescription ? (
          <Text style={[pv.desc, { color: colors.textMuted }]} numberOfLines={2}>{storeDescription}</Text>
        ) : null}
        <View style={pv.metaRow}>
          {location ? (
            <View style={pv.metaChip}>
              <MaterialCommunityIcons name="map-marker-outline" size={12} color="#4F46E5" />
              <Text style={pv.metaText}>{location}</Text>
            </View>
          ) : null}
          <View style={pv.metaChip}>
            <MaterialCommunityIcons name="star-outline" size={12} color="#F59E0B" />
            <Text style={pv.metaText}>New Seller</Text>
          </View>
        </View>
        {categories?.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            {categories.map((c: string) => {
              const cat = STORE_CATEGORIES.find(x => x.slug === c);
              return cat ? (
                <View key={c} style={pv.catChip}>
                  <Text style={{ fontSize:11 }}>{cat.emoji}</Text>
                  <Text style={pv.catLabel}>{cat.label}</Text>
                </View>
              ) : null;
            })}
          </ScrollView>
        )}
      </View>

      {/* Pending badge */}
      <View style={[pv.pendingBadge, { backgroundColor:'#F59E0B15', borderColor:'#F59E0B40' }]}>
        <MaterialCommunityIcons name="clock-outline" size={13} color="#F59E0B" />
        <Text style={pv.pendingText}>Pending admin approval · Usually 24–48 hrs</Text>
      </View>
    </View>
  );
}
const pv = StyleSheet.create({
  card:         { borderRadius: Radius.xl, borderWidth:1, overflow:'hidden', marginBottom: Spacing.lg },
  bannerWrap:   { height:140, position:'relative' },
  banner:       { ...StyleSheet.absoluteFillObject, borderRadius:0 },
  logoWrap:     { position:'absolute', bottom:-30, left: Spacing.lg, width:64, height:64, borderRadius:32, borderWidth:3, overflow:'hidden' },
  logo:         { width:'100%', height:'100%', alignItems:'center', justifyContent:'center' },
  logoInitial:  { color:'#fff', fontSize:24, fontWeight:'900' },
  bannerTextRow:{ position:'absolute', bottom:10, right: Spacing.md, flexDirection:'row', alignItems:'center', gap:5 },
  liveDot:      { width:7, height:7, borderRadius:4 },
  bannerSub:    { color:'rgba(255,255,255,0.9)', fontSize:11, fontWeight:'700' },
  info:         { paddingHorizontal: Spacing.lg, paddingTop:38, paddingBottom: Spacing.md },
  name:         { fontSize: FontSize.xl, fontWeight:'900', marginBottom:4 },
  desc:         { fontSize:13, lineHeight:18, marginBottom:8 },
  metaRow:      { flexDirection:'row', gap:8, flexWrap:'wrap' },
  metaChip:     { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:'#4F46E510', paddingHorizontal:8, paddingVertical:4, borderRadius: Radius.full },
  metaText:     { fontSize:11, fontWeight:'700', color:'#4F46E5' },
  catChip:      { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:'#7C3AED12', borderRadius: Radius.full, paddingHorizontal:8, paddingVertical:4, marginRight:6 },
  catLabel:     { fontSize:10, fontWeight:'700', color:'#7C3AED' },
  pendingBadge: { flexDirection:'row', alignItems:'center', gap:6, margin: Spacing.md, marginTop:0, padding: Spacing.sm, borderRadius: Radius.lg, borderWidth:1 },
  pendingText:  { fontSize:11, fontWeight:'600', color:'#F59E0B', flex:1 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function StoreSetupScreen() {
  const { colors } = useTheme();
  const router     = useRouter();
  const { user, updateUser } = useAuthStore();
  const scrollRef  = useRef<ScrollView>(null);

  const [stepIndex,  setStepIndex]  = useState(0);
  const [saving,     setSaving]     = useState(false);

  // Brand
  const [logo,       setLogo]       = useState(user?.avatar ?? '');
  const [banner,     setBanner]     = useState(user?.storeBanner ?? '');
  const [storeName,  setStoreName]  = useState(user?.storeName ?? '');

  // About
  const [storeDesc,  setStoreDesc]  = useState(user?.storeDescription ?? '');
  const [location,   setLocation]   = useState(user?.location ?? 'Freetown');
  const [categories, setCategories] = useState<string[]>([]);
  const [whatsapp,   setWhatsapp]   = useState('');
  const [showDistricts, setShowDistricts] = useState(false);

  // Payout
  const [payoutMethod, setPayoutMethod] = useState('orange_money');
  const [payoutNumber, setPayoutNumber] = useState('');
  const [accountName,  setAccountName]  = useState(user?.name ?? '');

  const pickImage = async (aspect: [number,number], setter: (uri: string) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed','Allow photo access to upload.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect, quality: 0.85,
    });
    if (!result.canceled) setter(result.assets[0].uri);
  };

  const toggleCat = (slug: string) => {
    setCategories(prev =>
      prev.includes(slug) ? prev.filter(c => c !== slug) : [...prev, slug].slice(0, 5)
    );
  };

  const validateStep = (): boolean => {
    if (stepIndex === 0) {
      if (!storeName.trim()) { Toast.show({ type:'error', text1:'Store name is required' }); return false; }
    }
    if (stepIndex === 2) {
      if (!payoutNumber.trim()) { Toast.show({ type:'error', text1:'Payout number is required' }); return false; }
      if (!accountName.trim())  { Toast.show({ type:'error', text1:'Account name is required' }); return false; }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep()) return;
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(p => p + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };
  const goBack = () => {
    if (stepIndex > 0) setStepIndex(p => p - 1);
    else router.back();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const updates: any = {
        storeName:        storeName.trim(),
        storeDescription: storeDesc.trim(),
        location,
        categories,
        payoutMethod,
        payoutNumber: payoutNumber.trim(),
        accountName:  accountName.trim(),
        submitForReview: true,
      };

      // Upload logo via /api/upload then save URL
      if (logo && logo !== user?.avatar) {
        try {
          const fd = new FormData();
          (fd as any).append('image', { uri: logo, name: 'logo.jpg', type: 'image/jpeg' });
          const uploadRes = await api.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          const avatarUrl: string = uploadRes.data?.url ?? logo;
          await profilesApi.updateAvatar(avatarUrl);
          updates.avatar = avatarUrl;
        } catch {}
      }

      // Upload banner via /api/upload then save the real hosted URL — this
      // used to build a FormData and never send it, saving the raw local
      // device file URI (file://... or a blob: URL) straight to the server
      // instead. That URI only resolves on the device that picked it, so
      // the banner would appear broken for every other viewer (buyers,
      // admin review, even the same seller after a reinstall).
      if (banner && banner !== user?.storeBanner) {
        try {
          const fd = new FormData();
          fd.append('image', { uri: banner, name: 'banner.jpg', type: 'image/jpeg' } as any);
          const uploadRes = await api.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          updates.storeBanner = uploadRes.data?.url ?? banner;
        } catch {
          // Upload failed — don't send a local-only URI the server can't use.
        }
      }

      if (whatsapp.trim()) updates.whatsapp = whatsapp.trim();

      // A failed save here used to be swallowed silently: the catch block
      // optimistically applied the update to local state anyway and the
      // code below always showed "submitted for review!" regardless of
      // whether the server actually accepted it. That masked real failures
      // completely — the application would never reach the admin queue but
      // the seller would have no way to know something went wrong.
      const { data } = await profilesApi.updateMe(updates);
      updateUser(data.user ?? { ...user, ...updates });

      Toast.show({ type:'success', text1:'🎉 Store submitted for review!', text2:'You\'ll be notified in 24–48 hrs.' });
      router.replace('/seller/seller-dashboard' as any);
    } catch (err: any) {
      Toast.show({ type:'error', text1:'Submission failed', text2: err?.response?.data?.message ?? err?.message ?? 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const current = STEPS[stepIndex];

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top','bottom']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={goBack} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex:1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Store Setup</Text>
          <Text style={[s.headerSub, { color: colors.textMuted }]}>{current.desc}</Text>
        </View>
        <View style={[s.stepBadge, { backgroundColor: colors.primaryMuted ?? colors.primary + '18' }]}>
          <Text style={[s.stepBadgeText, { color: colors.primary }]}>{stepIndex+1}/{STEPS.length}</Text>
        </View>
      </View>

      {/* Step bar */}
      <View style={[{ backgroundColor: colors.surface, borderBottomWidth:1, borderBottomColor: colors.border }]}>
        <StepBar current={stepIndex} colors={colors} />
      </View>

      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>

          {/* ── STEP 1: BRAND ────────────────────────────────────── */}
          {stepIndex === 0 && (
            <View style={{ gap: Spacing.lg }}>
              <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>🎨 Store Banner</Text>
                <Text style={[s.sectionHint, { color: colors.textMuted }]}>
                  This is the first thing buyers see — like your store's hero image. Best size: 1200×400px.
                </Text>
                <TouchableOpacity
                  style={[s.bannerPicker, { borderColor: banner ? 'transparent' : colors.border }]}
                  onPress={() => pickImage([3, 1], setBanner)}
                  activeOpacity={0.85}
                >
                  {banner
                    ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    : <LinearGradient colors={['#4F46E5','#7C3AED']} style={StyleSheet.absoluteFill} />
                  }
                  <View style={s.bannerOverlay}>
                    <View style={[s.cameraCircle, { backgroundColor:'rgba(0,0,0,0.55)' }]}>
                      <MaterialCommunityIcons name="camera-plus-outline" size={22} color="#fff" />
                    </View>
                    <Text style={s.bannerPickerLabel}>{banner ? 'Change Banner' : 'Upload Banner Photo'}</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>🏪 Store Logo</Text>
                <Text style={[s.sectionHint, { color: colors.textMuted }]}>
                  Your store icon. Shown in search results, product cards, and your profile. Square photo works best.
                </Text>
                <View style={{ alignItems:'center', paddingVertical: Spacing.md }}>
                  <TouchableOpacity
                    style={[s.logoPicker, { borderColor: colors.primary }]}
                    onPress={() => pickImage([1, 1], setLogo)}
                    activeOpacity={0.85}
                  >
                    {logo
                      ? <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      : <LinearGradient colors={['#4F46E5','#EC4899']} style={StyleSheet.absoluteFill}>
                          <Text style={s.logoInitial}>{(storeName || user?.name || 'S')[0]?.toUpperCase()}</Text>
                        </LinearGradient>
                    }
                    <View style={[s.logoEditBadge, { backgroundColor: colors.primary }]}>
                      <MaterialCommunityIcons name="camera" size={12} color="#fff" />
                    </View>
                  </TouchableOpacity>
                  <Text style={[{ color: colors.textMuted, fontSize:12, marginTop:8 }]}>Tap to upload</Text>
                </View>
              </View>

              <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>✏️ Store Name</Text>
                <TextInput
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={storeName}
                  onChangeText={setStoreName}
                  placeholder="e.g. Aminata's Fashion Hub"
                  placeholderTextColor={colors.textMuted}
                  maxLength={60}
                />
                <Text style={[s.charCount, { color: colors.textMuted }]}>{storeName.length}/60</Text>
              </View>
            </View>
          )}

          {/* ── STEP 2: ABOUT ────────────────────────────────────── */}
          {stepIndex === 1 && (
            <View style={{ gap: Spacing.lg }}>
              <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>📝 Store Description</Text>
                <Text style={[s.sectionHint, { color: colors.textMuted }]}>
                  Tell buyers what you sell, your values, and why they should shop with you.
                </Text>
                <TextInput
                  style={[s.textArea, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={storeDesc}
                  onChangeText={setStoreDesc}
                  placeholder="e.g. We sell the freshest handmade jewelry and African print fashion in Freetown. All items are locally sourced..."
                  placeholderTextColor={colors.textMuted}
                  multiline numberOfLines={5} maxLength={400}
                  textAlignVertical="top"
                />
                <Text style={[s.charCount, { color: colors.textMuted }]}>{storeDesc.length}/400</Text>
              </View>

              <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>📍 Store Location</Text>
                <TouchableOpacity
                  style={[s.pickerRow, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => setShowDistricts(v => !v)}
                >
                  <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.primary} />
                  <Text style={[s.pickerRowText, { color: colors.textPrimary }]}>{location}</Text>
                  <MaterialCommunityIcons name={showDistricts ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                </TouchableOpacity>
                {showDistricts && (
                  <View style={[s.districtGrid, { borderColor: colors.border }]}>
                    {SL_DISTRICTS.map(d => (
                      <TouchableOpacity
                        key={d}
                        style={[s.districtChip, {
                          backgroundColor: location === d ? colors.primary : colors.surfaceAlt ?? colors.background,
                          borderColor: location === d ? colors.primary : colors.border,
                        }]}
                        onPress={() => { setLocation(d); setShowDistricts(false); }}
                      >
                        <Text style={[s.districtText, { color: location === d ? '#fff' : colors.textSecondary }]}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>🏷️ Store Categories</Text>
                <Text style={[s.sectionHint, { color: colors.textMuted }]}>Pick up to 5 categories you sell in.</Text>
                <View style={s.catGrid}>
                  {STORE_CATEGORIES.map(cat => {
                    const active = categories.includes(cat.slug);
                    return (
                      <TouchableOpacity
                        key={cat.slug}
                        style={[s.catCard, {
                          backgroundColor: active ? colors.primary + '18' : colors.background,
                          borderColor:     active ? colors.primary : colors.border,
                          borderWidth:     active ? 2 : 1,
                        }]}
                        onPress={() => toggleCat(cat.slug)}
                      >
                        <Text style={{ fontSize:20 }}>{cat.emoji}</Text>
                        <Text style={[s.catCardLabel, { color: active ? colors.primary : colors.textSecondary }]} numberOfLines={2}>
                          {cat.label}
                        </Text>
                        {active && (
                          <View style={[s.catCheck, { backgroundColor: colors.primary }]}>
                            <MaterialCommunityIcons name="check" size={10} color="#fff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {categories.length > 0 && (
                  <Text style={[{ color: colors.primary, fontSize:12, fontWeight:'700', marginTop:8 }]}>
                    ✓ {categories.length} selected
                  </Text>
                )}
              </View>

              <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>📲 WhatsApp Number (optional)</Text>
                <Text style={[s.sectionHint, { color: colors.textMuted }]}>Buyers can contact you directly via WhatsApp.</Text>
                <TextInput
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={whatsapp}
                  onChangeText={setWhatsapp}
                  placeholder="+232 76 123456"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          )}

          {/* ── STEP 3: PAYOUT ───────────────────────────────────── */}
          {stepIndex === 2 && (
            <View style={{ gap: Spacing.lg }}>
              <View style={[s.infoBanner, { backgroundColor: colors.infoMuted ?? '#EFF6FF', borderColor: colors.info ?? '#3B82F6' }]}>
                <MaterialCommunityIcons name="information-outline" size={18} color={colors.info ?? '#3B82F6'} />
                <Text style={[s.infoBannerText, { color: colors.info ?? '#3B82F6' }]}>
                  Your earnings are held safely in your WimaKit wallet and paid out to the method below on request.
                </Text>
              </View>

              <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>💳 Payout Method</Text>
                <View style={{ gap: 10 }}>
                  {PAYOUT_METHODS.map(m => {
                    const active = payoutMethod === m.id;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[s.payoutMethodRow, {
                          borderColor:     active ? m.color : colors.border,
                          backgroundColor: active ? m.color + '10' : colors.background,
                        }]}
                        onPress={() => setPayoutMethod(m.id)}
                      >
                        <Text style={{ fontSize:22 }}>{m.icon}</Text>
                        <Text style={[s.payoutMethodLabel, { color: active ? m.color : colors.textPrimary }]}>{m.label}</Text>
                        <View style={[s.radioOuter, { borderColor: active ? m.color : colors.border }]}>
                          {active && <View style={[s.radioInner, { backgroundColor: m.color }]} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>📞 Payout Number / Account</Text>
                <Text style={[s.sectionHint, { color: colors.textMuted }]}>
                  {PAYOUT_METHODS.find(m => m.id === payoutMethod)?.hint ?? 'Enter your account number'}
                </Text>
                <TextInput
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={payoutNumber}
                  onChangeText={setPayoutNumber}
                  placeholder={PAYOUT_METHODS.find(m => m.id === payoutMethod)?.hint ?? ''}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>👤 Account Name</Text>
                <TextInput
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={accountName}
                  onChangeText={setAccountName}
                  placeholder="Full name on the account"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>
          )}

          {/* ── STEP 4: PREVIEW ──────────────────────────────────── */}
          {stepIndex === 3 && (
            <View style={{ gap: Spacing.lg }}>
              <View style={[s.previewHeader, { backgroundColor: colors.primaryMuted ?? '#EEF2FF', borderColor: colors.primary + '30' }]}>
                <MaterialCommunityIcons name="eye-outline" size={20} color={colors.primary} />
                <Text style={[s.previewHeaderText, { color: colors.primary }]}>
                  Here's how your store will look to buyers
                </Text>
              </View>

              <StorePreviewCard
                logo={logo} banner={banner}
                storeName={storeName} storeDescription={storeDesc}
                location={location} categories={categories}
                colors={colors}
              />

              {/* Summary */}
              <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>📋 Submission Summary</Text>
                {[
                  { label:'Store Name',   value: storeName || '—', icon:'storefront-outline' },
                  { label:'Location',     value: location,         icon:'map-marker-outline' },
                  { label:'Categories',   value: categories.length > 0 ? `${categories.length} selected` : 'None', icon:'tag-multiple-outline' },
                  { label:'Payout',       value: PAYOUT_METHODS.find(m=>m.id===payoutMethod)?.label ?? '—', icon:'bank-outline' },
                  { label:'Banner',       value: banner ? '✅ Uploaded' : '⚠️ Not set', icon:'image-outline' },
                  { label:'Logo',         value: logo   ? '✅ Uploaded' : '⚠️ Not set', icon:'account-circle-outline' },
                ].map(item => (
                  <View key={item.label} style={[s.summaryRow, { borderBottomColor: colors.border }]}>
                    <MaterialCommunityIcons name={item.icon as any} size={15} color={colors.textMuted} />
                    <Text style={[s.summaryLabel, { color: colors.textMuted }]}>{item.label}</Text>
                    <Text style={[s.summaryValue, { color: colors.textPrimary }]}>{item.value}</Text>
                  </View>
                ))}
              </View>

              <View style={[s.tosBox, { backgroundColor: colors.warningMuted ?? '#FFFBEB', borderColor:'#F59E0B40' }]}>
                <Text style={[s.tosText, { color: colors.textSecondary }]}>
                  By submitting, you agree to WimaKit's Seller Terms of Service. Your store will go live after admin review.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom CTA */}
      <View style={[s.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {stepIndex > 0 && (
          <TouchableOpacity style={[s.backCta, { borderColor: colors.border }]} onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={colors.textPrimary} />
            <Text style={[s.backCtaText, { color: colors.textPrimary }]}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.nextCta, { backgroundColor: stepIndex === 3 ? '#10B981' : colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={stepIndex === STEPS.length - 1 ? handleSubmit : goNext}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Text style={s.nextCtaText}>{stepIndex === STEPS.length - 1 ? 'Submit for Review' : 'Continue'}</Text>
                <MaterialCommunityIcons name={stepIndex === STEPS.length - 1 ? 'check-circle-outline' : 'arrow-right'} size={18} color="#fff" />
              </>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:       { flex:1 },
  header:     { flexDirection:'row', alignItems:'center', paddingHorizontal: Spacing.lg, paddingVertical:14, borderBottomWidth:1, gap:12 },
  backBtn:    { width:36, height:36, alignItems:'center', justifyContent:'center' },
  headerTitle:{ fontSize: FontSize.lg, fontWeight:'900' },
  headerSub:  { fontSize:12, fontWeight:'600', marginTop:1 },
  stepBadge:  { paddingHorizontal:10, paddingVertical:4, borderRadius: Radius.full },
  stepBadgeText: { fontSize:11, fontWeight:'800' },

  sectionCard:  { borderRadius: Radius.xl, borderWidth:1, padding: Spacing.lg, gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.md, fontWeight:'800', marginBottom:2 },
  sectionHint:  { fontSize:12, lineHeight:18 },

  bannerPicker: { height:130, borderRadius: Radius.xl, borderWidth:2, borderStyle:'dashed', overflow:'hidden', alignItems:'center', justifyContent:'center' },
  bannerOverlay:{ ...StyleSheet.absoluteFillObject, alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'rgba(0,0,0,0.28)' },
  bannerPickerLabel: { color:'#fff', fontSize:13, fontWeight:'700' },
  cameraCircle: { width:44, height:44, borderRadius:22, alignItems:'center', justifyContent:'center' },

  logoPicker:   { width:104, height:104, borderRadius:52, borderWidth:3, overflow:'hidden', alignItems:'center', justifyContent:'center' },
  logoInitial:  { color:'#fff', fontSize:36, fontWeight:'900' },
  logoEditBadge:{ position:'absolute', bottom:0, right:0, width:26, height:26, borderRadius:13, alignItems:'center', justifyContent:'center' },

  input:    { borderWidth:1, borderRadius: Radius.lg, paddingHorizontal:14, paddingVertical:12, fontSize:14, marginTop:4 },
  textArea: { borderWidth:1, borderRadius: Radius.lg, paddingHorizontal:14, paddingVertical:12, fontSize:14, marginTop:4, minHeight:110 },
  charCount:{ fontSize:11, textAlign:'right', marginTop:4 },

  pickerRow:     { flexDirection:'row', alignItems:'center', gap:10, borderWidth:1, borderRadius: Radius.lg, paddingHorizontal:14, paddingVertical:12 },
  pickerRowText: { flex:1, fontSize:14, fontWeight:'600' },

  districtGrid:  { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:12, paddingTop:12, borderTopWidth:1 },
  districtChip:  { paddingHorizontal:12, paddingVertical:7, borderRadius: Radius.full, borderWidth:1 },
  districtText:  { fontSize:12, fontWeight:'700' },

  catGrid:    { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:8 },
  catCard:    { width:'30%', flexGrow:1, borderRadius: Radius.lg, padding:10, alignItems:'center', gap:4, position:'relative', minHeight:72, justifyContent:'center' },
  catCardLabel: { fontSize:10, fontWeight:'700', textAlign:'center', lineHeight:14 },
  catCheck:   { position:'absolute', top:6, right:6, width:16, height:16, borderRadius:8, alignItems:'center', justifyContent:'center' },

  infoBanner:     { flexDirection:'row', alignItems:'flex-start', gap:10, borderWidth:1, borderRadius: Radius.lg, padding: Spacing.md },
  infoBannerText: { flex:1, fontSize:12, fontWeight:'600', lineHeight:18 },

  payoutMethodRow:  { flexDirection:'row', alignItems:'center', gap:12, borderWidth:2, borderRadius: Radius.lg, paddingHorizontal:14, paddingVertical:13 },
  payoutMethodLabel:{ flex:1, fontSize:14, fontWeight:'700' },
  radioOuter: { width:20, height:20, borderRadius:10, borderWidth:2, alignItems:'center', justifyContent:'center' },
  radioInner: { width:10, height:10, borderRadius:5 },

  previewHeader:     { flexDirection:'row', alignItems:'center', gap:10, borderWidth:1, borderRadius: Radius.lg, padding: Spacing.md },
  previewHeaderText: { fontSize:13, fontWeight:'700', flex:1 },

  summaryRow:   { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1 },
  summaryLabel: { flex:1, fontSize:13, fontWeight:'600' },
  summaryValue: { fontSize:13, fontWeight:'800' },

  tosBox:   { borderRadius: Radius.lg, borderWidth:1, padding: Spacing.md },
  tosText:  { fontSize:12, lineHeight:18 },

  bottomBar: { flexDirection:'row', gap: Spacing.sm, padding: Spacing.lg, paddingBottom: Spacing.xl, borderTopWidth:1 },
  backCta:   { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:16, paddingVertical:14, borderRadius: Radius.xl, borderWidth:1.5 },
  backCtaText: { fontSize:14, fontWeight:'700' },
  nextCta:   { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingVertical:15, borderRadius: Radius.xl },
  nextCtaText: { color:'#fff', fontSize:15, fontWeight:'900' },
});
