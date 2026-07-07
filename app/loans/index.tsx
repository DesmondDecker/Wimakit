import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useMyLoans, useRepayLoan } from '../../hooks/useApi';
import { useAuthStore } from '../../store';
import { formatPrice, formatDate } from '../../constants/data';

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  applied:        { label: 'Submitted',    color: '#3B82F6', icon: 'send' },
  under_review:   { label: 'Under Review', color: '#F59E0B', icon: 'clock-outline' },
  approved:       { label: 'Approved',     color: '#10B981', icon: 'check-circle' },
  rejected:       { label: 'Rejected',     color: '#EF4444', icon: 'close-circle' },
  disbursed:      { label: 'Active',       color: '#4F46E5', icon: 'cash' },
  repaid:         { label: 'Repaid',       color: '#10B981', icon: 'check-decagram' },
  defaulted:      { label: 'Defaulted',    color: '#EF4444', icon: 'alert' },
};

export default function LoansScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const { data, isLoading } = useMyLoans();
  const repayMut = useRepayLoan();
  const loans = data?.loans ?? [];

  const activeLoan = loans.find((l: any) => ['applied','under_review','approved','disbursed'].includes(l.status));

  const handleRepay = useCallback((loan: any) => {
    Alert.alert('Repay Loan', `Repay ${formatPrice(loan.monthlyRepayment ?? loan.remainingAmount)} from your wallet?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Repay', onPress: () => {
        repayMut.mutate({ id: loan._id, amount: loan.monthlyRepayment ?? loan.remainingAmount }, {
          onSuccess: () => Toast.show({ type:'success', text1: 'Repayment successful!' }),
          onError: (e: any) => Toast.show({ type:'error', text1: e?.response?.data?.message ?? 'Repayment failed' }),
        });
      }},
    ]);
  }, [repayMut]);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>WimaKit Loans</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#F97316','#EA580C']} style={s.heroCard}>
          <MaterialCommunityIcons name="bank-outline" size={32} color="rgba(255,255,255,0.5)" style={{ position:'absolute', top:16, right:16 }} />
          <Text style={s.heroTitle}>Quick Loans</Text>
          <Text style={s.heroSub}>Le 50,000 – Le 10,000,000{`\n`}Approved in hours</Text>
          {!user?.loanEligible && !user?.isKycVerified && (
            <View style={s.kycBadge}>
              <MaterialCommunityIcons name="lock-outline" size={12} color="#fff" />
              <Text style={s.kycBadgeText}>Complete KYC to apply</Text>
            </View>
          )}
        </LinearGradient>

        {/* Loan products */}
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Loan Products</Text>
        <View style={s.productsGrid}>
          {[
            { type:'micro', label:'Micro Loan', range:'Le 50K – 500K', rate:'5%', term:'30 days', color:'#10B981', icon:'cash-fast' },
            { type:'small', label:'Small Business', range:'Le 500K – 2M', rate:'8%', term:'60 days', color:'#3B82F6', icon:'briefcase-outline' },
            { type:'business', label:'Business Loan', range:'Le 2M – 10M', rate:'12%', term:'180 days', color:'#8B5CF6', icon:'office-building-outline' },
          ].map(p => (
            <View key={p.type} style={[s.productCard, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}>
              <View style={[s.productIcon, { backgroundColor: p.color + '20' }]}>
                <MaterialCommunityIcons name={p.icon as any} size={20} color={p.color} />
              </View>
              <Text style={[s.productLabel, { color: colors.textPrimary }]}>{p.label}</Text>
              <Text style={[s.productRange, { color: colors.textMuted }]}>{p.range}</Text>
              <Text style={[s.productTerms, { color: colors.textMuted }]}>{p.rate} interest · {p.term}</Text>
            </View>
          ))}
        </View>

        {!activeLoan && (
          <TouchableOpacity
            style={[s.applyBtn, { backgroundColor: (user?.loanEligible || user?.isKycVerified) ? colors.primary : colors.border }]}
            onPress={() => {
              if (!user?.loanEligible && !user?.isKycVerified) {
                Alert.alert('KYC Required', 'Complete KYC verification in your profile to apply for loans.');
                return;
              }
              router.push('/loans/apply' as any);
            }}>
            <MaterialCommunityIcons name="plus-circle-outline" size={18} color={(user?.loanEligible || user?.isKycVerified) ? '#fff' : colors.textMuted} />
            <Text style={[s.applyBtnText, { color: (user?.loanEligible || user?.isKycVerified) ? '#fff' : colors.textMuted }]}>Apply for a Loan</Text>
          </TouchableOpacity>
        )}

        {/* My loans */}
        <Text style={[s.sectionTitle, { color: colors.textPrimary, marginTop: Spacing.lg }]}>My Loan History</Text>
        {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : loans.length === 0 ? (
          <View style={[s.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="bank-outline" size={32} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textMuted }]}>No loan applications yet</Text>
          </View>
        ) : (
          loans.map((loan: any) => {
            const meta = STATUS_META[loan.status] ?? STATUS_META.applied;
            return (
              <View key={loan._id} style={[s.loanCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={s.loanHeader}>
                  <View style={[s.loanBadge, { backgroundColor: meta.color + '20' }]}>
                    <MaterialCommunityIcons name={meta.icon as any} size={12} color={meta.color} />
                    <Text style={[s.loanBadgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={[s.loanType, { color: colors.textMuted }]}>{loan.productType}</Text>
                </View>
                <Text style={[s.loanAmount, { color: colors.textPrimary }]}>{formatPrice(loan.approvedAmount ?? loan.amount)}</Text>
                {loan.purpose && <Text style={[s.loanPurpose, { color: colors.textMuted }]} numberOfLines={1}>{loan.purpose}</Text>}
                {loan.adminNote && (
                  <View style={[s.noteBox, { backgroundColor: colors.surfaceAlt ?? colors.background }]}>
                    <Text style={[s.noteText, { color: colors.textMuted }]}>Admin: {loan.adminNote}</Text>
                  </View>
                )}
                {loan.status === 'disbursed' && (
                  <View style={s.loanFooter}>
                    <Text style={[s.loanRemaining, { color: colors.textMuted }]}>
                      Remaining: {formatPrice(loan.remainingAmount ?? loan.amount)}
                    </Text>
                    <TouchableOpacity style={[s.repayBtn, { backgroundColor: colors.primary, opacity: repayMut.isPending ? 0.7 : 1 }]} onPress={() => handleRepay(loan)} disabled={repayMut.isPending}>
                      <Text style={s.repayBtnText}>Repay {formatPrice(loan.monthlyRepayment ?? loan.remainingAmount, true)}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  headerTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '800' },
  heroCard: { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg, position: 'relative', overflow: 'hidden', gap: 6 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  kycBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, marginTop: 6 },
  kycBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', marginBottom: Spacing.md },
  productsGrid: { gap: Spacing.sm, marginBottom: Spacing.lg },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  productIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  productLabel: { fontSize: 14, fontWeight: '700', flex: 1 },
  productRange: { fontSize: 12, position: 'absolute', right: Spacing.md, top: Spacing.md },
  productTerms: { fontSize: 11, position: 'absolute', right: Spacing.md, bottom: Spacing.md },
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: Radius.xl },
  applyBtnText: { fontSize: 15, fontWeight: '800' },
  emptyBox: { alignItems: 'center', padding: 32, borderRadius: Radius.xl, borderWidth: 1, gap: 8 },
  emptyText: { fontSize: 14 },
  loanCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm, gap: 6 },
  loanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loanBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
  loanBadgeText: { fontSize: 10, fontWeight: '800' },
  loanType: { fontSize: 11, textTransform: 'capitalize' },
  loanAmount: { fontSize: 20, fontWeight: '900' },
  loanPurpose: { fontSize: 12 },
  noteBox: { borderRadius: Radius.md, padding: 8 },
  noteText: { fontSize: 12 },
  loanFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  loanRemaining: { fontSize: 12, fontWeight: '600' },
  repayBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.lg },
  repayBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
