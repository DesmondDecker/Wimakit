import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useQuery } from '@tanstack/react-query';
import { bnplApi } from '../../utils/api';
import { usePayBnplInstalment } from '../../hooks/useApi';
import { formatPrice, formatDate } from '../../constants/data';

export default function BnplDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const payMut = usePayBnplInstalment();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bnpl', id],
    queryFn: () => bnplApi.get(id ?? '').then(r => r.data),
    enabled: !!id,
  });
  const plan = data?.plan;

  const handlePay = useCallback(() => {
    const next = plan?.instalmentSchedule?.find((i: any) => i.status !== 'paid');
    if (!next) return;
    Alert.alert('Pay Instalment', `Pay ${formatPrice(next.amount)} from your wallet?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Pay Now', onPress: () => {
        payMut.mutate(id, {
          onSuccess: () => { Toast.show({ type:'success', text1: 'Payment successful!' }); refetch(); },
          onError: (e: any) => Toast.show({ type:'error', text1: e?.response?.data?.message ?? 'Payment failed' }),
        });
      }},
    ]);
  }, [plan, id, payMut, refetch]);

  if (isLoading || !plan) {
    return (
      <SafeAreaView style={[{ flex:1, backgroundColor: colors.background }]} edges={['top']}>
        <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const nextInstalment = plan.instalmentSchedule?.find((i: any) => i.status !== 'paid');

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{plan.planType.toUpperCase()} Plan</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={[s.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}>
          <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Order #{plan.orderId?.customOrderId}</Text>
          <Text style={[s.summaryAmount, { color: colors.textPrimary }]}>{formatPrice(plan.totalAmount)}</Text>
          <View style={[s.statusBadge, { backgroundColor: plan.status === 'overdue' ? colors.error+'20' : colors.success+'20' }]}>
            <Text style={{ color: plan.status === 'overdue' ? colors.error : colors.success, fontSize: 12, fontWeight: '700' }}>
              {plan.status === 'overdue' ? '⚠ Overdue' : plan.status === 'paid' ? '✓ Fully Paid' : '✓ Active'}
            </Text>
          </View>
        </View>

        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Instalment Schedule</Text>
        {plan.instalmentSchedule?.map((inst: any, i: number) => (
          <View key={i} style={[s.instRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.instIcon, { backgroundColor: inst.status === 'paid' ? colors.success+'20' : inst.status === 'overdue' ? colors.error+'20' : colors.primaryMuted }]}>
              <MaterialCommunityIcons
                name={inst.status === 'paid' ? 'check' : inst.status === 'overdue' ? 'alert' : 'clock-outline'}
                size={16} color={inst.status === 'paid' ? colors.success : inst.status === 'overdue' ? colors.error : colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.instAmount, { color: colors.textPrimary }]}>{formatPrice(inst.amount)}</Text>
              <Text style={[s.instDate, { color: colors.textMuted }]}>
                {inst.status === 'paid' ? `Paid ${formatDate(inst.paidAt)}` : `Due ${formatDate(inst.dueDate)}`}
              </Text>
            </View>
            <Text style={[s.instNum, { color: colors.textMuted }]}>#{i+1}</Text>
          </View>
        ))}
      </ScrollView>

      {nextInstalment && plan.status !== 'paid' && (
        <View style={[s.payBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.payLabel, { color: colors.textMuted }]}>Next payment</Text>
            <Text style={[s.payAmount, { color: colors.textPrimary }]}>{formatPrice(nextInstalment.amount)}</Text>
          </View>
          <TouchableOpacity style={[s.payBtn, { backgroundColor: colors.primary, opacity: payMut.isPending ? 0.7 : 1 }]} onPress={handlePay} disabled={payMut.isPending}>
            {payMut.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.payBtnText}>Pay Now</Text>}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  headerTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '800' },
  summaryCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, alignItems: 'center', gap: 10, marginBottom: Spacing.lg },
  summaryLabel: { fontSize: 13 },
  summaryAmount: { fontSize: 32, fontWeight: '900' },
  statusBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', marginBottom: Spacing.md },
  instRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 8 },
  instIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  instAmount: { fontSize: 15, fontWeight: '800' },
  instDate: { fontSize: 12, marginTop: 1 },
  instNum: { fontSize: 12, fontWeight: '700' },
  payBar: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.lg, borderTopWidth: 1 },
  payLabel: { fontSize: 11 },
  payAmount: { fontSize: 18, fontWeight: '900' },
  payBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: Radius.xl },
  payBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
