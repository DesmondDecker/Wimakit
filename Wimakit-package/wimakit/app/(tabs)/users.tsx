import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import { Avatar } from '../../components/ui/Atoms';
import { adminApi } from '../../utils/api';

export default function AdminUsersScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'pending_review' | 'rider_pending'>('pending_review');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'pending-approvals', filter],
    queryFn: () =>
      filter === 'pending_review'
        ? adminApi.users({ storeStatus: 'pending_review', limit: 50 }).then((r: any) => r.data?.users ?? r.data?.data ?? [])
        : adminApi.riders().then((r: any) => (r.data?.riders ?? r.data?.data ?? []).filter((u: any) => !u.isVerified)),
    staleTime: 30_000,
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => filter === 'pending_review'
      ? adminApi.approveSeller(id)
      : adminApi.approveRider(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'pending-approvals'] });
      Toast.show({ type: 'success', text1: 'Approved ✓' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Approval failed' }),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      filter === 'pending_review'
        ? adminApi.rejectSeller(id, reason)
        : adminApi.rejectRider(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'pending-approvals'] });
      Toast.show({ type: 'success', text1: 'Rejected' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Rejection failed' }),
  });

  const items: any[] = useMemo(() => data ?? [], [data]);

  const renderItem = useCallback(({ item }: { item: any }) => (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Avatar name={item.name} uri={item.avatar} size={50} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.name, { color: colors.textPrimary }]}>{item.name}</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          {(item.role ?? 'USER').toUpperCase()} • {item.phone ?? item.email}
        </Text>
        {item.storeName && (
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.secondary }}>
            {item.storeName}
          </Text>
        )}
      </View>
      <View style={{ gap: Spacing.xs }}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.success }]}
          onPress={() => approveMut.mutate(item._id ?? item.id)}
        >
          <Text style={styles.btnText}>Approve</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.error }]}
          onPress={() => rejectMut.mutate({ id: item._id ?? item.id, reason: 'Does not meet requirements' })}
        >
          <Text style={styles.btnText}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [colors, approveMut, rejectMut]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 32, color: colors.primary }}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Pending Approvals</Text>
      </View>

      {/* Filter tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(['pending_review', 'rider_pending'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, filter === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setFilter(tab)}
          >
            <Text style={[styles.tabText, { color: filter === tab ? colors.primary : colors.textMuted }]}>
              {tab === 'pending_review' ? 'Sellers' : 'Riders'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading && <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />}
      {isError && (
        <Text style={{ color: colors.error, textAlign: 'center', marginTop: 40 }}>
          Failed to load — check your connection
        </Text>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 60, fontSize: 15 }}>
          No pending approvals 🎉
        </Text>
      )}

      <FlatList
        data={items}
        keyExtractor={(item: any) => item._id ?? item.id}
        contentContainerStyle={{ padding: Spacing.lg }}
        renderItem={renderItem}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  title:    { fontSize: FontSize.xl, fontWeight: '900' },
  tabs:     { flexDirection: 'row', borderBottomWidth: 0.5 },
  tab:      { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabText:  { fontSize: FontSize.sm, fontWeight: '700' },
  card:     { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.md, marginBottom: Spacing.md },
  name:     { fontSize: FontSize.md, fontWeight: '800' },
  sub:      { fontSize: FontSize.xs },
  btn:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.md },
  btnText:  { color: '#fff', fontSize: 10, fontWeight: '900' },
});
