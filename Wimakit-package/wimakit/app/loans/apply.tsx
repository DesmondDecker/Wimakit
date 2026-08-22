import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import { useApplyLoan } from '../../hooks/useApi';
import { formatPrice } from '../../constants/data';

// Must stay in sync with PRODUCTS in wimakit-backend/src/routes/loans.js
const PRODUCTS = [
  { id:'micro',    label:'Micro Loan',     min:50_000,    max:500_000,    rate:0.05, term:30,  color:'#10B981' },
  { id:'small',    label:'Small Business', min:500_000,   max:2_000_000,  rate:0.08, term:60,  color:'#3B82F6' },
  { id:'business', label:'Business Loan',  min:2_000_000, max:10_000_000, rate:0.12, term:180, color:'#8B5CF6' },
];

export default function ApplyLoanScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const applyMut = useApplyLoan();

  const [productType, setProductType] = useState('micro');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [employmentStatus, setEmployment] = useState('');
  const [monthlyIncome, setIncome] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');

  const product = PRODUCTS.find(p => p.id === productType)!;

  const handleSubmit = useCallback(() => {
    const amt = +amount;
    if (!amt || amt < product.min || amt > product.max) {
      Toast.show({ type:'error', text1: `Amount must be between ${formatPrice(product.min)} and ${formatPrice(product.max)}` });
      return;
    }
    if (!purpose.trim()) { Toast.show({ type:'error', text1: 'Please describe the loan purpose' }); return; }

    applyMut.mutate({
      productType, amount: amt, purpose: purpose.trim(),
      employmentStatus: employmentStatus.trim(), monthlyIncome: +monthlyIncome || undefined,
      guarantorName: guarantorName.trim(), guarantorPhone: guarantorPhone.trim(),
    }, {
      onSuccess: () => { Toast.show({ type:'success', text1: 'Application submitted!', text2: 'You will be notified once reviewed.' }); router.back(); },
      onError: (e: any) => Toast.show({ type:'error', text1: e?.response?.data?.message ?? 'Application failed' }),
    });
  }, [productType, amount, purpose, employmentStatus, monthlyIncome, guarantorName, guarantorPhone, product, applyMut, router]);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Apply for Loan</Text>
        <View style={{ width: 30 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[s.label, { color: colors.textMuted }]}>LOAN TYPE</Text>
          <View style={s.productsRow}>
            {PRODUCTS.map(p => (
              <TouchableOpacity key={p.id}
                style={[s.productCard, { backgroundColor: productType === p.id ? p.color + '20' : colors.surface, borderColor: productType === p.id ? p.color : colors.border, borderWidth: productType === p.id ? 2 : 1 }]}
                onPress={() => setProductType(p.id)}>
                <Text style={[s.productLabel, { color: productType === p.id ? p.color : colors.textPrimary }]}>{p.label}</Text>
                <Text style={[s.productRange, { color: colors.textMuted }]}>{formatPrice(p.min, true)} – {formatPrice(p.max, true)}</Text>
                <Text style={[s.productRate, { color: colors.textMuted }]}>{(p.rate*100).toFixed(0)}% · {p.term} days</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.label, { color: colors.textMuted, marginTop: Spacing.lg }]}>AMOUNT (LE) *</Text>
          <View style={[s.inputRow, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
            <Text style={[s.currency, { color: colors.textMuted }]}>Le</Text>
            <TextInput style={[s.inputField, { color: colors.textPrimary }]} value={amount} onChangeText={setAmount}
              placeholder={`${product.min.toLocaleString()} – ${product.max.toLocaleString()}`} placeholderTextColor={colors.textMuted} keyboardType="numeric" />
          </View>

          <Text style={[s.label, { color: colors.textMuted, marginTop: Spacing.md }]}>PURPOSE OF LOAN *</Text>
          <TextInput style={[s.textArea, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}
            value={purpose} onChangeText={setPurpose} placeholder="e.g. Restocking inventory for my shop, expanding farm operations…"
            placeholderTextColor={colors.textMuted} multiline />

          <Text style={[s.label, { color: colors.textMuted, marginTop: Spacing.md }]}>EMPLOYMENT STATUS</Text>
          <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}
            value={employmentStatus} onChangeText={setEmployment} placeholder="e.g. Self-employed, Business owner" placeholderTextColor={colors.textMuted} />

          <Text style={[s.label, { color: colors.textMuted, marginTop: Spacing.md }]}>MONTHLY INCOME (LE)</Text>
          <View style={[s.inputRow, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
            <Text style={[s.currency, { color: colors.textMuted }]}>Le</Text>
            <TextInput style={[s.inputField, { color: colors.textPrimary }]} value={monthlyIncome} onChangeText={setIncome}
              placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
          </View>

          <Text style={[s.label, { color: colors.textMuted, marginTop: Spacing.lg }]}>GUARANTOR (OPTIONAL)</Text>
          <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border, marginBottom: Spacing.sm }]}
            value={guarantorName} onChangeText={setGuarantorName} placeholder="Guarantor full name" placeholderTextColor={colors.textMuted} />
          <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}
            value={guarantorPhone} onChangeText={setGuarantorPhone} placeholder="Guarantor phone number" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />

          <View style={[s.noticeBox, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.warning} />
            <Text style={[s.noticeText, { color: colors.warning }]}>
              Loan applications are reviewed by our team within 24-48 hours. Approved funds are disbursed directly to your WimaKit wallet.
            </Text>
          </View>

          <TouchableOpacity style={[s.submitBtn, { backgroundColor: colors.primary, opacity: applyMut.isPending ? 0.7 : 1 }]} onPress={handleSubmit} disabled={applyMut.isPending}>
            {applyMut.isPending ? <ActivityIndicator color="#fff" /> : (
              <>
                <MaterialCommunityIcons name="send" size={18} color="#fff" />
                <Text style={s.submitBtnText}>Submit Application</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  headerTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '800' },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  productsRow: { gap: Spacing.sm },
  productCard: { borderRadius: Radius.xl, padding: Spacing.md, gap: 4 },
  productLabel: { fontSize: 14, fontWeight: '800' },
  productRange: { fontSize: 12 },
  productRate: { fontSize: 11 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, gap: 8 },
  currency: { fontSize: 14, fontWeight: '700' },
  inputField: { flex: 1, fontSize: 16, fontWeight: '800', paddingVertical: 13 },
  input: { borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.md, fontSize: 14 },
  textArea: { borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.md, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  noticeBox: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, marginTop: Spacing.lg },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: Radius.xl, marginTop: Spacing.lg },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
