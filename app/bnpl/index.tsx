import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useMyBnplPlans } from '../../hooks/useApi';
import { formatPrice, formatDate } from '../../constants/data';

export default function BnplListScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, isLoading } = useMyBnplPlans();
  const plans = data?.plans ?? [];

  const active = plans.filter((p: any) => p.status === 'active' || p.status === 'overdue');
  const completed = plans.filter((p: any) => p.status === 'paid');

  const totalOutstanding = active.reduce((sum: number, p: any) => {
    const remaining = p.instalmentSchedule?.filter((i: any) => i.status !== 'paid').reduce((s: number, i: any) => s + i.amount, 0) ?? 0;
    return sum + remaining;
  }, 0);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Buy Now Pay Later</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }}>
        {/* Summary card */}
        <LinearGradient colors={['#8B5CF6','#6D28D9']} style={s.summaryCard}>
          <MaterialCommunityIcons name="calendar-month" size={28} color="rgba(255,255,255,0.5)" style={{ position:'absolute', top: 16, right: 16 }} />
          <Text style={s.summaryLabel}>Total Outstanding</Text>
          <Text style={s.summaryValue}>{formatPrice(totalOutstanding)}</Text>
          <Text style={s.summarySub}>{active.length} active plan{active.length !== 1 ? 's' : ''}</Text>
        </LinearGradient>

        {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (
          <>
            {/* Active plans */}
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Active Plans</Text>
            {active.length === 0 ? (
              <View style={[s.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="check-circle-outline" size={32} color={colors.success} />
                <Text style={[s.emptyText, { color: colors.textMuted }]}>No active BNPL plans</Text>
              </View>
            ) : (
              active.map((plan: any) => {
                const nextInstalment = plan.instalmentSchedule?.find((i: any) => i.status !== 'paid');
                const progress = (plan.paidInstalments / plan.instalments) * 100;
                return (
                  <TouchableOpacity key={plan._id}
                    style={[s.planCard, { backgroundColor: colors.surface, borderColor: plan.status === 'overdue' ? colors.error : colors.border }, Shadow.sm]}
                    onPress={() => router.push(`/bnpl/${plan._id}` as any)}>
                    <View style={s.planHeader}>
                      <View style={[s.planBadge, { backgroundColor: colors.primaryMuted }]}>
                        <Text style={[s.planBadgeText, { color: colors.primary }]}>{plan.planType.toUpperCase()}</Text>
                      </View>
                      {plan.status === 'overdue' && (
                        <View style={[s.overdueBadge, { backgroundColor: colors.error + '20' }]}>
                          <MaterialCommunityIcons name="alert" size={12} color={colors.error} />
                          <Text style={[s.overdueText, { color: colors.error }]}>Overdue</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[s.planOrder, { color: colors.textPrimary }]}>Order #{plan.orderId?.customOrderId}</Text>
                    <Text style={[s.planAmount, { color: colors.textPrimary }]}>{formatPrice(plan.totalAmount)}</Text>
                    <View style={[s.progressBar, { backgroundColor: colors.border }]}>
                      <View style={[s.progressFill, { width: `${progress}%` as any, backgroundColor: colors.primary }]} />
                    </View>
                    <View style={s.planFooter}>
                      <Text style={[s.planProgress, { color: colors.textMuted }]}>
                        {plan.paidInstalments}/{plan.instalments} paid
                      </Text>
                      {nextInstalment && (
                        <Text style={[s.planNext, { color: colors.textMuted }]}>
                          Next: {formatPrice(nextInstalment.amount)} due {formatDate(nextInstalment.dueDate)}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {/* Completed plans */}
            {completed.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { color: colors.textPrimary, marginTop: Spacing.lg }]}>Completed</Text>
                {completed.map((plan: any) => (
                  <View key={plan._id} style={[s.planCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.7 }]}>
                    <View style={s.planHeader}>
                      <View style={[s.planBadge, { backgroundColor: colors.success + '20' }]}>
                        <Text style={[s.planBadgeText, { color: colors.success }]}>✓ {plan.planType.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={[s.planOrder, { color: colors.textPrimary }]}>Order #{plan.orderId?.customOrderId}</Text>
                    <Text style={[s.planAmount, { color: colors.textPrimary }]}>{formatPrice(plan.totalAmount)} — Fully Paid</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* Info card */}
        <View style={[s.infoCard, { backgroundColor: colors.info + '15', borderColor: colors.info }]}>
          <MaterialCommunityIcons name="information-outline" size={18} color={colors.info} />
          <Text style={[s.infoText, { color: colors.info }]}>
            BNPL plans: 2x and 3x are interest-free. 6x has a 5% fee, 12x has 12% fee. Late payments may incur fees and affect your credit score.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  headerTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '800' },
  summaryCard: { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg, position: 'relative', overflow: 'hidden' },
  summaryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  summaryValue: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 4 },
  summarySub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6 },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', marginBottom: Spacing.md },
  emptyBox: { alignItems: 'center', padding: 32, borderRadius: Radius.xl, borderWidth: 1, gap: 8 },
  emptyText: { fontSize: 14 },
  planCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm, gap: 8 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  planBadgeText: { fontSize: 11, fontWeight: '800' },
  overdueBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  overdueText: { fontSize: 10, fontWeight: '700' },
  planOrder: { fontSize: 13, fontWeight: '600' },
  planAmount: { fontSize: 20, fontWeight: '900' },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  planFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  planProgress: { fontSize: 12, fontWeight: '600' },
  planNext: { fontSize: 11 },
  infoCard: { flexDirection: 'row', gap: 10, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, marginTop: Spacing.lg },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
