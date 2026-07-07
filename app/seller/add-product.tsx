import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, FlatList,
  Modal, Switch,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useCategories, useCreateProduct } from '../../hooks/useApi';
import { CATEGORY_CONFIGS, getCategoryConfig, type ProductAttribute } from '../../constants/categories';
import { formatPrice } from '../../constants/data';

// ─── Multi-select Modal ───────────────────────────────────────────────────────
function MultiSelectModal({ visible, title, options, selected, onDone, onClose, colors }: any) {
  const [search, setSearch] = useState('');
  const [local, setLocal]   = useState<string[]>(selected ?? []);

  const filtered = options?.filter((o: any) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const toggle = (val: string) =>
    setLocal(p => p.includes(val) ? p.filter(v => v !== val) : [...p, val]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={onClose} activeOpacity={1} />
        <View style={[ms.sheet, { backgroundColor: colors.surface }]}>
          <View style={ms.handle} />
          <Text style={[ms.title, { color: colors.textPrimary }]}>{title}</Text>
          <View style={[ms.searchRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
            <TextInput
              style={[ms.searchInput, { color: colors.textPrimary }]}
              value={search} onChangeText={setSearch}
              placeholder="Search…" placeholderTextColor={colors.textMuted}
            />
          </View>
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {filtered.map((opt: any) => {
              const checked = local.includes(opt.value);
              return (
                <TouchableOpacity key={opt.value}
                  style={[ms.optRow, { borderBottomColor: colors.border }]}
                  onPress={() => toggle(opt.value)}>
                  <Text style={[ms.optLabel, { color: colors.textPrimary }]}>{opt.label}</Text>
                  <View style={[ms.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' }]}>
                    {checked && <MaterialCommunityIcons name="check" size={12} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={[ms.doneBtn, { backgroundColor: colors.primary }]}
            onPress={() => { onDone(local); onClose(); }}>
            <Text style={ms.doneBtnText}>Done ({local.length} selected)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ms.clearBtn} onPress={() => { setLocal([]); }}>
            <Text style={[ms.clearBtnText, { color: colors.textMuted }]}>Clear all</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const ms = StyleSheet.create({
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.lg, paddingBottom: 40 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: FontSize.lg, fontWeight: '800', marginBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  optRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, gap: 12 },
  optLabel: { flex: 1, fontSize: 14 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  doneBtn: { paddingVertical: 14, borderRadius: Radius.lg, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  clearBtn: { alignItems: 'center', paddingVertical: 10 },
  clearBtnText: { fontSize: 13, fontWeight: '600' },
});

// ─── Select Modal ─────────────────────────────────────────────────────────────
function SelectModal({ visible, title, options, selected, onSelect, onClose, colors }: any) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={onClose} activeOpacity={1} />
        <View style={[ms.sheet, { backgroundColor: colors.surface }]}>
          <View style={ms.handle} />
          <Text style={[ms.title, { color: colors.textPrimary }]}>{title}</Text>
          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {options?.map((opt: any) => (
              <TouchableOpacity key={opt.value}
                style={[ms.optRow, { borderBottomColor: colors.border, backgroundColor: selected === opt.value ? colors.primaryMuted : 'transparent' }]}
                onPress={() => { onSelect(opt.value); onClose(); }}>
                <Text style={[ms.optLabel, { color: selected === opt.value ? colors.primary : colors.textPrimary, fontWeight: selected === opt.value ? '700' : '400' }]}>
                  {opt.label}
                </Text>
                {selected === opt.value && <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Category Picker ──────────────────────────────────────────────────────────
function CategoryPicker({ selected, onSelect, colors }: any) {
  const [show, setShow] = useState(false);
  const selectedCat = CATEGORY_CONFIGS.find(c => c.slug === selected);
  return (
    <>
      <TouchableOpacity
        style={[s.pickerBtn, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: selected ? colors.primary : colors.border, borderWidth: selected ? 2 : 1 }]}
        onPress={() => setShow(true)}>
        {selectedCat ? (
          <View style={s.pickerSelected}>
            <View style={[s.pickerEmoji, { backgroundColor: selectedCat.color + '20' }]}>
              <Text style={{ fontSize: 18 }}>{selectedCat.emoji}</Text>
            </View>
            <View>
              <Text style={[s.pickerSelectedLabel, { color: colors.textPrimary }]}>{selectedCat.name}</Text>
              <Text style={[s.pickerSelectedSub, { color: colors.textMuted }]}>Tap to change</Text>
            </View>
          </View>
        ) : (
          <View style={s.pickerPlaceholder}>
            <MaterialCommunityIcons name="tag-plus-outline" size={20} color={colors.textMuted} />
            <Text style={[s.pickerPlaceholderText, { color: colors.textMuted }]}>Select category *</Text>
          </View>
        )}
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' }}
            onPress={() => setShow(false)} activeOpacity={1} />
          <View style={[s.categorySheet, { backgroundColor: colors.surface }]}>
            <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>Select Category</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.categoryGrid}>
                {CATEGORY_CONFIGS.map(cat => (
                  <TouchableOpacity key={cat.slug}
                    style={[s.categoryCard, { backgroundColor: selected === cat.slug ? cat.color + '20' : colors.surfaceAlt ?? colors.surface, borderColor: selected === cat.slug ? cat.color : colors.border, borderWidth: selected === cat.slug ? 2 : 1 }]}
                    onPress={() => { onSelect(cat.slug); setShow(false); }}>
                    <Text style={{ fontSize: 24, marginBottom: 4 }}>{cat.emoji}</Text>
                    <Text style={[s.categoryCardName, { color: selected === cat.slug ? cat.color : colors.textPrimary }]} numberOfLines={2}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Attribute Renderer ───────────────────────────────────────────────────────
function AttributeField({ attr, value, onChange, colors }: { attr: ProductAttribute; value: any; onChange: (v: any) => void; colors: any }) {
  const [showModal, setShowModal] = useState(false);

  if (attr.type === 'multiselect') {
    const selected: string[] = Array.isArray(value) ? value : [];
    const labels = selected.map(v => attr.options?.find(o => o.value === v)?.label ?? v);
    return (
      <>
        <TouchableOpacity
          style={[s.attrBtn, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: selected.length ? colors.primary : colors.border, borderWidth: selected.length ? 2 : 1 }]}
          onPress={() => setShowModal(true)}>
          <View style={{ flex: 1 }}>
            {selected.length > 0 ? (
              <View style={s.selectedTagsRow}>
                {selected.slice(0, 4).map(v => {
                  const opt = attr.options?.find(o => o.value === v);
                  return (
                    <View key={v} style={[s.selectedTag, { backgroundColor: colors.primaryMuted }]}>
                      <Text style={[s.selectedTagText, { color: colors.primary }]}>{opt?.label ?? v}</Text>
                    </View>
                  );
                })}
                {selected.length > 4 && (
                  <View style={[s.selectedTag, { backgroundColor: colors.border }]}>
                    <Text style={[s.selectedTagText, { color: colors.textMuted }]}>+{selected.length - 4} more</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={[s.attrPlaceholder, { color: colors.textMuted }]}>
                Tap to select {attr.label.toLowerCase()}…
              </Text>
            )}
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <MultiSelectModal
          visible={showModal}
          title={attr.label}
          options={attr.options}
          selected={selected}
          onDone={onChange}
          onClose={() => setShowModal(false)}
          colors={colors}
        />
      </>
    );
  }

  if (attr.type === 'select') {
    const selectedOpt = attr.options?.find(o => o.value === value);
    return (
      <>
        <TouchableOpacity
          style={[s.attrBtn, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: value ? colors.primary : colors.border, borderWidth: value ? 2 : 1 }]}
          onPress={() => setShowModal(true)}>
          <Text style={[s.attrBtnText, { color: value ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
            {selectedOpt?.label ?? `Select ${attr.label.toLowerCase()}…`}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <SelectModal
          visible={showModal}
          title={attr.label}
          options={attr.options}
          selected={value}
          onSelect={onChange}
          onClose={() => setShowModal(false)}
          colors={colors}
        />
      </>
    );
  }

  if (attr.type === 'number') {
    return (
      <View style={[s.textInputRow, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
        <TextInput
          style={[s.textInputField, { color: colors.textPrimary, flex: 1 }]}
          value={value ? String(value) : ''}
          onChangeText={v => onChange(v)}
          placeholder={attr.placeholder ?? `Enter ${attr.label.toLowerCase()}`}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
        />
        {attr.unit && <Text style={[s.unitLabel, { color: colors.textMuted }]}>{attr.unit}</Text>}
      </View>
    );
  }

  if (attr.type === 'dimensions') {
    const dims = value ?? { length: '', width: '', height: '' };
    return (
      <View style={s.dimensionsRow}>
        {(['length','width','height'] as const).map((d, i) => (
          <View key={d} style={{ flex: 1 }}>
            <TextInput
              style={[s.dimInput, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}
              value={dims[d] ? String(dims[d]) : ''}
              onChangeText={v => onChange({ ...dims, [d]: v })}
              placeholder={d[0].toUpperCase()}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />
            <Text style={[s.dimLabel, { color: colors.textMuted }]}>{d[0].toUpperCase() + d.slice(1)} (cm)</Text>
          </View>
        ))}
      </View>
    );
  }

  // text default
  return (
    <TextInput
      style={[s.textInput, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}
      value={value ?? ''}
      onChangeText={onChange}
      placeholder={attr.placeholder ?? `Enter ${attr.label.toLowerCase()}`}
      placeholderTextColor={colors.textMuted}
      multiline={attr.type === 'text' && (attr.placeholder?.length ?? 0) > 40}
    />
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AddProductScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const createProduct = useCreateProduct();
  const { data: catData } = useCategories();
  const apiCategories = catData?.categories ?? [];

  // Basic fields
  const [name, setName]             = useState('');
  const [description, setDesc]      = useState('');
  const [price, setPrice]           = useState('');
  const [originalPrice, setOrigPrice]= useState('');
  const [stock, setStock]           = useState('');
  const [selectedCatSlug, setSelectedCatSlug] = useState('');
  const [selectedSubcat, setSelectedSubcat]   = useState('');
  const [tags, setTags]             = useState('');
  const [deliveryTime, setDelivery] = useState('1-3 days');
  const [location, setLocation]     = useState('Freetown');
  const [minOrder, setMinOrder]     = useState('1');
  const [bnplEligible, setBnplEligible] = useState(false);
  const [condition, setCondition]   = useState('new');
  const [images, setImages]         = useState<string[]>([]);
  const [attrValues, setAttrValues] = useState<Record<string, any>>({});
  const [step, setStep]             = useState<'basic' | 'details' | 'attributes' | 'preview'>('basic');
  const [subcatModalVisible, setSubcatModalVisible] = useState(false);

  const catConfig = getCategoryConfig(selectedCatSlug);

  const pickImages = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to upload product images.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true, quality: 0.85,
      selectionLimit: 8 - images.length,
    });
    if (!result.canceled) {
      setImages(p => [...p, ...result.assets.map(a => a.uri)].slice(0, 8));
    }
  }, [images]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim())        { Alert.alert('Required', 'Product name is required.'); return; }
    if (!description.trim()) { Alert.alert('Required', 'Description is required.'); return; }
    if (!price || isNaN(+price) || +price <= 0) { Alert.alert('Required', 'Enter a valid price.'); return; }
    if (!stock || isNaN(+stock) || +stock < 0)  { Alert.alert('Required', 'Enter valid stock quantity.'); return; }
    if (!selectedCatSlug) { Alert.alert('Required', 'Please select a category.'); return; }
    if (images.length === 0) { Alert.alert('Required', 'Add at least one product image.'); return; }

    // Get category ID from API categories
    const apiCat = apiCategories.find((c: any) => c.slug === selectedCatSlug);
    if (!apiCat) { Alert.alert('Error', 'Category not synced with server yet. Please try again.'); return; }

    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('description', description.trim());
    fd.append('price', price);
    fd.append('stock', stock);
    fd.append('category', apiCat._id ?? apiCat.id);
    fd.append('deliveryTime', deliveryTime);
    fd.append('location', location);
    fd.append('minOrder', minOrder || '1');
    fd.append('condition', condition);
    fd.append('bnplEligible', String(bnplEligible));
    if (originalPrice && !isNaN(+originalPrice)) fd.append('originalPrice', originalPrice);
    if (tags.trim()) tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => fd.append('tags[]', t));
    if (selectedSubcat) fd.append('subcategory', selectedSubcat);
    fd.append('attributes', JSON.stringify(attrValues));

    images.forEach((uri, i) => {
      fd.append('images', { uri, name: `image_${i}.jpg`, type: 'image/jpeg' } as any);
    });

    createProduct.mutate(fd, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: '🎉 Product submitted!', text2: 'Admin will review it shortly.' });
        router.back();
      },
      onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Failed to submit' }),
    });
  }, [name, description, price, originalPrice, stock, selectedCatSlug, tags, deliveryTime, location, minOrder, condition, bnplEligible, images, attrValues, selectedSubcat, apiCategories, createProduct, router]);

  const renderStep = () => {
    switch (step) {
      case 'basic': return (
        <View style={s.stepContent}>
          <StepHeader title="Basic Info" sub="Tell buyers about your product" icon="tag-plus-outline" colors={colors} />

          {/* Image picker */}
          <SectionLabel label="PRODUCT IMAGES *" colors={colors} />
          <View style={s.imagesGrid}>
            {images.map((uri, i) => (
              <View key={i} style={s.imageThumb}>
                <Image source={{ uri }} style={s.imageThumbImg} contentFit="cover" />
                <TouchableOpacity style={s.removeImage} onPress={() => setImages(p => p.filter((_, idx) => idx !== i))}>
                  <MaterialCommunityIcons name="close" size={14} color="#fff" />
                </TouchableOpacity>
                {i === 0 && <View style={s.mainImageBadge}><Text style={s.mainImageBadgeText}>Main</Text></View>}
              </View>
            ))}
            {images.length < 8 && (
              <TouchableOpacity style={[s.addImageBtn, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]} onPress={pickImages}>
                <MaterialCommunityIcons name="camera-plus-outline" size={28} color={colors.primary} />
                <Text style={[s.addImageText, { color: colors.primary }]}>{images.length === 0 ? 'Add Photos' : 'Add More'}</Text>
                <Text style={[s.addImageSub, { color: colors.textMuted }]}>{images.length}/8</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[s.hint, { color: colors.textMuted }]}>First image is the main product image. Add up to 8 photos.</Text>

          <SectionLabel label="CATEGORY *" colors={colors} />
          <CategoryPicker selected={selectedCatSlug} onSelect={(slug: string) => { setSelectedCatSlug(slug); setAttrValues({}); setSelectedSubcat(''); }} colors={colors} />

          {/* Subcategory */}
          {catConfig && catConfig.subcategories.length > 0 && (
            <>
              <SectionLabel label="SUBCATEGORY" colors={colors} />
              <TouchableOpacity
                style={[s.attrBtn, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: selectedSubcat ? colors.primary : colors.border }]}
                onPress={() => setSubcatModalVisible(true)}>
                <Text style={[s.attrBtnText, { color: selectedSubcat ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                  {selectedSubcat || 'Select subcategory (optional)'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              <SelectModal
                visible={subcatModalVisible}
                title="Select Subcategory"
                options={catConfig.subcategories.map(s => ({ value: s, label: s }))}
                selected={selectedSubcat}
                onSelect={setSelectedSubcat}
                onClose={() => setSubcatModalVisible(false)}
                colors={colors}
              />
            </>
          )}

          <SectionLabel label="PRODUCT NAME *" colors={colors} />
          <Field value={name} onChange={setName} colors={colors} placeholder={catConfig ? `e.g. ${catConfig.name} product name` : 'Enter product name'} />

          <SectionLabel label="DESCRIPTION *" colors={colors} />
          <Field value={description} onChange={setDesc} colors={colors} placeholder="Describe your product in detail — quality, features, origin, etc." multiline />

          <TouchableOpacity style={[s.nextBtn, { backgroundColor: colors.primary }]} onPress={() => {
            if (!name.trim() || !selectedCatSlug || !description.trim()) { Alert.alert('Required', 'Fill in category, name and description to continue.'); return; }
            setStep('details');
          }}>
            <Text style={s.nextBtnText}>Continue to Pricing</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      );

      case 'details': return (
        <View style={s.stepContent}>
          <StepHeader title="Pricing & Stock" sub="Set your price and inventory" icon="cash-multiple" colors={colors} />

          <SectionLabel label="PRICING *" colors={colors} />
          <View style={s.priceRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.subLabel, { color: colors.textMuted }]}>Selling Price (Le) *</Text>
              <View style={[s.priceInput, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
                <Text style={[s.priceCurrency, { color: colors.textMuted }]}>Le</Text>
                <TextInput style={[s.priceInputField, { color: colors.textPrimary }]} value={price} onChangeText={setPrice} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.subLabel, { color: colors.textMuted }]}>Original Price (Le)</Text>
              <View style={[s.priceInput, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
                <Text style={[s.priceCurrency, { color: colors.textMuted }]}>Le</Text>
                <TextInput style={[s.priceInputField, { color: colors.textPrimary }]} value={originalPrice} onChangeText={setOrigPrice} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
              </View>
            </View>
          </View>
          {price && originalPrice && +originalPrice > +price && (
            <View style={[s.discountBanner, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
              <MaterialCommunityIcons name="tag-outline" size={14} color={colors.success} />
              <Text style={[s.discountText, { color: colors.success }]}>
                {Math.round((1 - +price / +originalPrice) * 100)}% discount — customers love deals!
              </Text>
            </View>
          )}

          <View style={s.priceRow}>
            <View style={{ flex: 1 }}>
              <SectionLabel label="STOCK QUANTITY *" colors={colors} />
              <View style={[s.priceInput, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
                <TextInput style={[s.priceInputField, { color: colors.textPrimary }]} value={stock} onChangeText={setStock} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                <Text style={[s.unitLabel, { color: colors.textMuted }]}>pcs</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <SectionLabel label="MIN. ORDER" colors={colors} />
              <View style={[s.priceInput, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
                <TextInput style={[s.priceInputField, { color: colors.textPrimary }]} value={minOrder} onChangeText={setMinOrder} placeholder="1" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                <Text style={[s.unitLabel, { color: colors.textMuted }]}>pcs</Text>
              </View>
            </View>
          </View>

          {catConfig?.requiresCondition && (
            <>
              <SectionLabel label="CONDITION *" colors={colors} />
              <View style={s.conditionRow}>
                {[{value:'new',label:'New',icon:'package-variant-closed'},{value:'used',label:'Used',icon:'recycle'},{value:'refurbished',label:'Refurbished',icon:'restore'}].map(c => (
                  <TouchableOpacity key={c.value}
                    style={[s.conditionBtn, { backgroundColor: condition === c.value ? colors.primary : colors.surfaceAlt ?? colors.surface, borderColor: condition === c.value ? colors.primary : colors.border }]}
                    onPress={() => setCondition(c.value)}>
                    <MaterialCommunityIcons name={c.icon as any} size={18} color={condition === c.value ? '#fff' : colors.textMuted} />
                    <Text style={[s.conditionBtnText, { color: condition === c.value ? '#fff' : colors.textPrimary }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <View style={s.priceRow}>
            <View style={{ flex: 1 }}>
              <SectionLabel label="DELIVERY TIME" colors={colors} />
              <Field value={deliveryTime} onChange={setDelivery} colors={colors} placeholder="e.g. 1-3 days, Same day" />
            </View>
            <View style={{ flex: 1 }}>
              <SectionLabel label="LOCATION / CITY" colors={colors} />
              <Field value={location} onChange={setLocation} colors={colors} placeholder="e.g. Freetown" />
            </View>
          </View>

          <SectionLabel label="TAGS (for search)" colors={colors} />
          <Field value={tags} onChange={setTags} colors={colors} placeholder="organic, fresh, imported (comma separated)" />
          <Text style={[s.hint, { color: colors.textMuted }]}>Good tags help buyers find your product faster.</Text>

          {/* BNPL toggle */}
          <View style={[s.bnplRow, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
            <View style={[s.bnplIcon, { backgroundColor: '#8B5CF620' }]}>
              <MaterialCommunityIcons name="calendar-month" size={20} color="#8B5CF6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.bnplLabel, { color: colors.textPrimary }]}>Enable Buy Now Pay Later</Text>
              <Text style={[s.bnplSub, { color: colors.textMuted }]}>Buyers can pay in instalments (min. Le 100K)</Text>
            </View>
            <Switch value={bnplEligible} onValueChange={setBnplEligible}
              trackColor={{ false: colors.border, true: '#8B5CF688' }}
              thumbColor={bnplEligible ? '#8B5CF6' : colors.textMuted} />
          </View>

          <View style={s.btnRow}>
            <TouchableOpacity style={[s.backStepBtn, { borderColor: colors.border }]} onPress={() => setStep('basic')}>
              <MaterialCommunityIcons name="arrow-left" size={18} color={colors.textPrimary} />
              <Text style={[s.backStepText, { color: colors.textPrimary }]}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.nextBtn, { backgroundColor: colors.primary, flex: 2 }]} onPress={() => setStep('attributes')}>
              <Text style={s.nextBtnText}>{catConfig?.attributes?.length ? 'Product Details' : 'Review & Submit'}</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      );

      case 'attributes': return (
        <View style={s.stepContent}>
          <StepHeader title="Product Details" sub={`Specific details for ${catConfig?.name ?? 'this category'}`} icon="format-list-checks" colors={colors} />

          {catConfig?.attributes?.length ? (
            catConfig.attributes.map(attr => (
              <View key={attr.key} style={{ marginBottom: Spacing.md }}>
                <Text style={[s.attrLabel, { color: colors.textPrimary }]}>
                  {attr.label}{attr.required ? ' *' : ''}
                </Text>
                <AttributeField
                  attr={attr}
                  value={attrValues[attr.key]}
                  onChange={v => setAttrValues(p => ({ ...p, [attr.key]: v }))}
                  colors={colors}
                />
              </View>
            ))
          ) : (
            <View style={[s.noAttrsBox, { backgroundColor: colors.surfaceAlt ?? colors.surface }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={40} color={colors.success} />
              <Text style={[s.noAttrsText, { color: colors.textMuted }]}>No additional details required for this category.</Text>
            </View>
          )}

          <View style={s.btnRow}>
            <TouchableOpacity style={[s.backStepBtn, { borderColor: colors.border }]} onPress={() => setStep('details')}>
              <MaterialCommunityIcons name="arrow-left" size={18} color={colors.textPrimary} />
              <Text style={[s.backStepText, { color: colors.textPrimary }]}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.nextBtn, { backgroundColor: colors.primary, flex: 2 }]} onPress={() => setStep('preview')}>
              <Text style={s.nextBtnText}>Review & Submit</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      );

      case 'preview': return (
        <View style={s.stepContent}>
          <StepHeader title="Review & Submit" sub="Check everything before submitting" icon="eye-check-outline" colors={colors} />

          {/* Preview card */}
          <View style={[s.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {images.length > 0 && (
              <Image source={{ uri: images[0] }} style={s.previewImage} contentFit="cover" />
            )}
            <View style={s.previewInfo}>
              <View style={[s.previewCatBadge, { backgroundColor: (catConfig?.color ?? colors.primary) + '20' }]}>
                <Text style={{ fontSize: 12 }}>{catConfig?.emoji}</Text>
                <Text style={[s.previewCatText, { color: catConfig?.color ?? colors.primary }]}>{catConfig?.name}</Text>
              </View>
              <Text style={[s.previewName, { color: colors.textPrimary }]}>{name}</Text>
              <View style={s.previewPriceRow}>
                <Text style={[s.previewPrice, { color: colors.primary }]}>{formatPrice(+price)}</Text>
                {originalPrice && +originalPrice > +price && (
                  <Text style={[s.previewOriginalPrice, { color: colors.textMuted }]}>{formatPrice(+originalPrice)}</Text>
                )}
              </View>
              <Text style={[s.previewStock, { color: colors.textMuted }]}>Stock: {stock} pcs · {deliveryTime}</Text>
            </View>
          </View>

          {/* Summary */}
          <View style={[s.summaryBox, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
            {[
              { label: 'Images', value: `${images.length} image${images.length !== 1 ? 's' : ''}` },
              { label: 'Category', value: catConfig?.name ?? selectedCatSlug },
              { label: 'Price', value: formatPrice(+price) },
              { label: 'Stock', value: `${stock} units` },
              { label: 'BNPL', value: bnplEligible ? 'Enabled' : 'Disabled' },
              { label: 'Condition', value: condition[0].toUpperCase() + condition.slice(1) },
            ].map(r => (
              <View key={r.label} style={[s.summaryRow, { borderBottomColor: colors.border }]}>
                <Text style={[s.summaryLabel, { color: colors.textMuted }]}>{r.label}</Text>
                <Text style={[s.summaryValue, { color: colors.textPrimary }]}>{r.value}</Text>
              </View>
            ))}
          </View>

          <View style={[s.reviewNote, { backgroundColor: colors.info + '15', borderColor: colors.info }]}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.info} />
            <Text style={[s.reviewNoteText, { color: colors.info }]}>
              Your product will be reviewed by WimaKit admin before going live. This usually takes 2-4 hours.
            </Text>
          </View>

          <View style={s.btnRow}>
            <TouchableOpacity style={[s.backStepBtn, { borderColor: colors.border }]} onPress={() => setStep('attributes')}>
              <MaterialCommunityIcons name="arrow-left" size={18} color={colors.textPrimary} />
              <Text style={[s.backStepText, { color: colors.textPrimary }]}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: colors.success, flex: 2, opacity: createProduct.isPending ? 0.7 : 1 }]}
              onPress={handleSubmit} disabled={createProduct.isPending}>
              {createProduct.isPending ? <ActivityIndicator color="#fff" /> : (
                <>
                  <MaterialCommunityIcons name="check-circle" size={18} color="#fff" />
                  <Text style={s.submitBtnText}>Submit for Review</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      );
    }
  };

  const STEPS = ['basic', 'details', 'attributes', 'preview'];
  const stepIdx = STEPS.indexOf(step);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => {
          if (step === 'basic') router.back();
          else setStep(STEPS[stepIdx - 1] as any);
        }} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Add New Product</Text>
          <Text style={[s.headerSub, { color: colors.textMuted }]}>Step {stepIdx + 1} of {STEPS.length}</Text>
        </View>
        {/* Progress */}
        <View style={s.progressDots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[s.progressDot, {
              backgroundColor: i <= stepIdx ? colors.primary : colors.border,
              width: i === stepIdx ? 20 : 6,
            }]} />
          ))}
        </View>
      </View>

      {/* Progress bar */}
      <View style={[s.progressBar, { backgroundColor: colors.border }]}>
        <View style={[s.progressFill, { backgroundColor: colors.primary, width: `${((stepIdx + 1) / STEPS.length) * 100}%` as any }]} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {renderStep()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepHeader({ title, sub, icon, colors }: any) {
  return (
    <View style={s.stepHeader}>
      <View style={[s.stepHeaderIcon, { backgroundColor: colors.primaryMuted }]}>
        <MaterialCommunityIcons name={icon} size={24} color={colors.primary} />
      </View>
      <View>
        <Text style={[s.stepHeaderTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[s.stepHeaderSub, { color: colors.textMuted }]}>{sub}</Text>
      </View>
    </View>
  );
}

function SectionLabel({ label, colors }: any) {
  return <Text style={[s.sectionLabel, { color: colors.textMuted }]}>{label}</Text>;
}

function Field({ value, onChange, colors, placeholder, multiline, keyboardType }: any) {
  return (
    <TextInput
      style={[s.textInput, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border, minHeight: multiline ? 90 : undefined, textAlignVertical: multiline ? 'top' : 'center' }]}
      value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor={colors.textMuted} multiline={multiline}
      keyboardType={keyboardType ?? 'default'}
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  headerTitle: { fontSize: FontSize.md, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 1 },
  progressDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  progressDot: { height: 6, borderRadius: 3 },
  progressBar: { height: 3 },
  progressFill: { height: 3 },
  stepContent: { padding: Spacing.lg },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.lg },
  stepHeaderIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepHeaderTitle: { fontSize: FontSize.lg, fontWeight: '900' },
  stepHeaderSub: { fontSize: 13, marginTop: 2 },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8, marginTop: Spacing.sm },
  subLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  imagesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  imageThumb: { width: 90, height: 90, borderRadius: Radius.md, overflow: 'hidden', position: 'relative' },
  imageThumbImg: { width: '100%', height: '100%' },
  removeImage: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  mainImageBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(79,70,229,0.85)', paddingVertical: 3, alignItems: 'center' },
  mainImageBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  addImageBtn: { width: 90, height: 90, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  addImageText: { fontSize: 11, fontWeight: '700' },
  addImageSub: { fontSize: 9 },
  hint: { fontSize: 11, marginBottom: Spacing.md, marginTop: -2 },
  textInput: { borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.md, fontSize: 14, marginBottom: 0 },
  textInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  textInputField: { fontSize: 14 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5 },
  pickerSelected: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickerEmoji: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pickerSelectedLabel: { fontSize: 15, fontWeight: '700' },
  pickerSelectedSub: { fontSize: 11, marginTop: 2 },
  pickerPlaceholder: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickerPlaceholderText: { fontSize: 15 },
  categorySheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.lg, paddingBottom: 40, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '800', marginBottom: 16 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 20 },
  categoryCard: { width: '22%', borderRadius: Radius.lg, padding: 10, alignItems: 'center', borderWidth: 1.5, minHeight: 80, justifyContent: 'center' },
  categoryCardName: { fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 14 },
  attrBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.md, minHeight: 50 },
  attrBtnText: { fontSize: 14 },
  attrPlaceholder: { fontSize: 14 },
  attrLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  selectedTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectedTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  selectedTagText: { fontSize: 12, fontWeight: '600' },
  priceRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  priceInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 13, gap: 8 },
  priceCurrency: { fontSize: 14, fontWeight: '700' },
  priceInputField: { flex: 1, fontSize: 16, fontWeight: '800' },
  unitLabel: { fontSize: 12, fontWeight: '600' },
  discountBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.md },
  discountText: { fontSize: 13, fontWeight: '600', flex: 1 },
  conditionRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  conditionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1.5 },
  conditionBtnText: { fontSize: 13, fontWeight: '700' },
  bnplRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: Radius.xl, padding: Spacing.md, marginTop: Spacing.sm },
  bnplIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bnplLabel: { fontSize: 14, fontWeight: '700' },
  bnplSub: { fontSize: 12, marginTop: 2 },
  dimensionsRow: { flexDirection: 'row', gap: Spacing.sm },
  dimInput: { borderWidth: 1.5, borderRadius: Radius.lg, padding: 12, fontSize: 14, textAlign: 'center' },
  dimLabel: { fontSize: 10, textAlign: 'center', marginTop: 3 },
  noAttrsBox: { alignItems: 'center', padding: 32, borderRadius: Radius.xl, gap: 10 },
  noAttrsText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  previewCard: { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.md },
  previewImage: { width: '100%', height: 220 },
  previewInfo: { padding: Spacing.md, gap: 6 },
  previewCatBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  previewCatText: { fontSize: 11, fontWeight: '700' },
  previewName: { fontSize: 18, fontWeight: '900' },
  previewPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewPrice: { fontSize: 22, fontWeight: '900' },
  previewOriginalPrice: { fontSize: 14, textDecorationLine: 'line-through' },
  previewStock: { fontSize: 12 },
  summaryBox: { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: Spacing.md, borderBottomWidth: 1 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13, fontWeight: '700' },
  reviewNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.lg },
  reviewNoteText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: Radius.xl, marginTop: Spacing.md },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  backStepBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16, paddingHorizontal: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1.5 },
  backStepText: { fontSize: 14, fontWeight: '700' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: Radius.xl },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
