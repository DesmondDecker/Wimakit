import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { Spacing, Radius, FontSize, Shadow } from '../constants/theme';
import { useWallet, useWalletTransactions, useWithdraw } from '../hooks/useApi';
import { formatPrice, formatDate } from '../constants/data';

const TX_META: Record<string, { icon: string; color: string; label: string }> = {
  PAYOUT:      { icon: 'bank-transfer-out', color: '#EF4444', label: 'Withdrawal' },
  ORDER:       { icon: 'cart-outline',      color: '#10B981', label: 'Order sale' },
  REFUND:      { icon: 'cash-refund',       color: '#F59E0B', label: 'Refund' },
  BNPL:        { icon: 'credit-card-outline', color: '#EC4899', label: 'BNPL instalment' },
  LOAN:        { icon: 'bank-outline',      color: '#3B82F6', label: 'Loan' },
  TRANSFER:    { icon: 'swap-horizontal',   color: '#8B5CF6', label: 'Transfer' },
  DEPOSIT:     { icon: 'plus-circle-outline', color: '#10B981', label: 'Deposit' },
};

function txMeta(type: string) {
  return TX_META[type] ?? { icon: 'swap-vertical', color: '#6B7280', label: type ?? 'Transaction' };
}

export default function WalletScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data: walletData, isLoading: loadingWallet, refetch: refetchWallet } = useWallet();
  const { data: txData, isLoading: loadingTx, refetch: refetchTx } = useWalletTransactions({ limit: 30 });
  const withdrawMut = useWithdraw();

  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'orange_money' | 'afrimoney' | 'bank'>('orange_money');
  const [refreshing, setRefreshing] = useState(false);

  const wallet = walletData?.wallet ?? walletData ?? {};
  const transactions = txData?.transactions ?? [];

  const available = wallet?.available ?? 0;
  const pending = wallet?.pending ?? 0;

  const canSubmit = useMemo(() => {
    const amt = Number(amount);
    return amt > 0 && amt <= available;
  }, [amount, available]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchWallet(), refetchTx()]);
    setRefreshing(false);
  };

  const handleWithdraw = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      Toast.show({ type: 'error', text1: 'Enter a valid amount' });
      return;
    }
    if (amt > available) {
      Toast.show({ type: 'error', text1: 'Amount exceeds available balance' });
      return;
    }
    withdrawMut.mutate(
      { amount: amt, method, details: {} },
      {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: 'Withdrawal request submitted' });
          setWithdrawVisible(false);
          setAmount('');
        },
        onError: (e: any) => {
          Toast.show({ type: 'error', text1: e?.response?.data?.message ?? 'Withdrawal failed' });
        },
      }
    );
  };

  if (loadingWallet) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Wallet</Text>
          <View style={{ width: 30 }} />
        </View>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Wallet</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60, gap: Spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={undefined}
      >
        {/* Balance hero */}
        <LinearGradient colors={['#4F46E5', '#7C3AED']} style={s.heroCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={s.heroLabel}>Available balance</Text>
          <Text style={s.heroValue}>{formatPrice(available)}</Text>
          <View style={s.heroRow}>
            <View>
              <Text style={s.heroSubLabel}>Pending</Text>
              <Text style={s.heroSubValue}>{formatPrice(pending)}</Text>
            </View>
            {(wallet?.bnplOutstanding ?? 0) > 0 && (
              <View>
                <Text style={s.heroSubLabel}>BNPL owed</Text>
                <Text style={s.heroSubValue}>{formatPrice(wallet.bnplOutstanding)}</Text>
              </View>
            )}
            {(wallet?.loanOutstanding ?? 0) > 0 && (
              <View>
                <Text style={s.heroSubLabel}>Loan owed</Text>
                <Text style={s.heroSubValue}>{formatPrice(wallet.loanOutstanding)}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={s.withdrawBtn}
            onPress={() => setWithdrawVisible(true)}
            disabled={available <= 0}
          >
            <MaterialCommunityIcons name="bank-transfer-out" size={16} color="#4F46E5" />
            <Text style={s.withdrawBtnText}>Withdraw</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Quick links */}
        <View style={s.quickRow}>
          <TouchableOpacity style={[s.quickCard, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]} onPress={() => router.push('/loans' as any)}>
            <MaterialCommunityIcons name="bank-outline" size={20} color={colors.primary} />
            <Text style={[s.quickText, { color: colors.textPrimary }]}>Loans</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.quickCard, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]} onPress={() => router.push('/bnpl' as any)}>
            <MaterialCommunityIcons name="credit-card-outline" size={20} color={colors.primary} />
            <Text style={[s.quickText, { color: colors.textPrimary }]}>BNPL Plans</Text>
          </TouchableOpacity>
        </View>

        {/* Transaction history */}
        <View>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Transaction history</Text>

          {loadingTx ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.lg }} />
          ) : transactions.length === 0 ? (
            <View style={[s.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="wallet-outline" size={36} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textMuted }]}>No transactions yet</Text>
            </View>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {transactions.map((tx: any) => {
                const meta = txMeta(tx.type);
                const isNegative = tx.amount < 0;
                return (
                  <View
                    key={tx._id ?? tx.id}
                    style={[s.txCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <View style={[s.txIconWrap, { backgroundColor: meta.color + '18' }]}>
                      <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.txLabel, { color: colors.textPrimary }]}>
                        {tx.description || meta.label}
                      </Text>
                      <Text style={[s.txDate, { color: colors.textMuted }]}>
                        {tx.createdAt ? formatDate(tx.createdAt) : ''} · {tx.status ?? 'COMPLETED'}
                      </Text>
                    </View>
                    <Text style={[s.txAmount, { color: isNegative ? colors.error : '#10B981' }]}>
                      {isNegative ? '-' : '+'}{formatPrice(Math.abs(tx.amount))}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Withdraw modal */}
      <Modal visible={withdrawVisible} transparent animationType="slide" onRequestClose={() => setWithdrawVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
          <View style={[s.modalCard, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>Withdraw funds</Text>
              <TouchableOpacity onPress={() => setWithdrawVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[s.modalLabel, { color: colors.textMuted }]}>
              Available: {formatPrice(available)}
            </Text>

            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount (SLL)"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
            />

            <Text style={[s.modalLabel, { color: colors.textMuted, marginTop: Spacing.md }]}>Payout method</Text>
            <View style={s.methodRow}>
              {(['orange_money', 'afrimoney', 'bank'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    s.methodChip,
                    { borderColor: colors.border, backgroundColor: colors.background },
                    method === m && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setMethod(m)}
                >
                  <Text style={[s.methodChipText, { color: method === m ? '#fff' : colors.textPrimary }]}>
                    {m === 'orange_money' ? 'Orange Money' : m === 'afrimoney' ? 'AfriMoney' : 'Bank'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: colors.primary, opacity: canSubmit && !withdrawMut.isPending ? 1 : 0.5 }]}
              onPress={handleWithdraw}
              disabled={!canSubmit || withdrawMut.isPending}
            >
              {withdrawMut.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.submitBtnText}>Request withdrawal</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, borderBottomWidth: 0.5 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700' },

  heroCard: { borderRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.md },
  heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, fontWeight: '600' },
  heroValue: { color: '#fff', fontSize: 34, fontWeight: '800' },
  heroRow: { flexDirection: 'row', gap: Spacing.xl },
  heroSubLabel: { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.xs },
  heroSubValue: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', alignSelf: 'flex-start', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full, marginTop: Spacing.sm },
  withdrawBtnText: { color: '#4F46E5', fontWeight: '700', fontSize: FontSize.sm },

  quickRow: { flexDirection: 'row', gap: Spacing.md },
  quickCard: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1 },
  quickText: { fontSize: FontSize.sm, fontWeight: '600' },

  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.md },
  emptyState: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl, borderRadius: Radius.lg, borderWidth: 1 },
  emptyText: { fontSize: FontSize.sm },

  txCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  txIconWrap: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  txLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  txDate: { fontSize: FontSize.xs, marginTop: 2 },
  txAmount: { fontSize: FontSize.sm, fontWeight: '700' },

  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.sm },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  modalLabel: { fontSize: FontSize.xs, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: FontSize.md, marginTop: Spacing.xs },
  methodRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  methodChip: { flex: 1, borderWidth: 1, borderRadius: Radius.full, paddingVertical: Spacing.sm, alignItems: 'center' },
  methodChipText: { fontSize: FontSize.xs, fontWeight: '700' },
  submitBtn: { marginTop: Spacing.lg, borderRadius: Radius.full, paddingVertical: Spacing.md, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.md },
});
