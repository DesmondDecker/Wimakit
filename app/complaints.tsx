import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../context/ThemeContext';
import { ordersApi } from '../utils/api';
import { Spacing, Radius, FontSize } from '../constants/theme';
import { formatPrice } from '../constants/data';
import { MotiView } from 'moti';
import { Skeleton } from 'moti/skeleton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBadge } from '../components/ui/StatusBadge';

export default function AdminComplaintsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-reported-orders'],
    queryFn: () => ordersApi.mine({ status: 'reported' }).then(r => r.data),
  });

  const renderComplaint = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity 
      style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.error, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }]}
      onPress={() => item?._id && router.push(`/order/${item._id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.orderId, { color: colors.textPrimary }]}>Order #{item?.customOrderId || '...'}</Text>
        <Text style={[styles.amount, { color: colors.error }]}>{formatPrice(item?.total || 0)}</Text>
      </View>
      
      <View style={[styles.issueBox, { backgroundColor: colors.error + '11' }]}>
        <Text style={[styles.issueLabel, { color: colors.error }]}>ISSUE: {item.complaint?.subject || 'Reported'}</Text>
        <Text style={[styles.issueText, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.complaint?.message || 'No details provided.'}
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <Text style={[styles.storeName, { color: colors.textMuted }]}>
          Seller: {item.seller?.storeName || item.seller?.name}
        </Text>
        <Text style={[styles.date, { color: colors.textMuted }]}>
          {new Date(item.complaint?.reportedAt).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity 
          style={[styles.resolveBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
          onPress={() => router.push({ pathname: '/resolve', params: { id: item._id } } as any)}>
          <Text style={[styles.resolveBtnText, { color: colors.textOnPrimary }]}>Resolve Issue</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  ), [colors, router]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/profile' as any)} style={styles.backBtn}>
          <Text style={{ fontSize: 32, fontWeight: '100', color: colors.primary }}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Disputes</Text>
      </View>

      {isLoading ? ( 
        <ComplaintListSkeleton colors={colors} />
      ) : isError ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 56 }}>⚠️</Text>
          <Text style={[styles.emptyText, { color: colors.error, marginTop: Spacing.md }]}>
            Error loading complaints: {error?.message || 'Unknown error'}
          </Text>
          <TouchableOpacity onPress={() => queryClient.invalidateQueries({ queryKey: ['admin-reported-orders'] })}>
            <Text style={[styles.retryText, { color: colors.primary }]}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      ) : data?.orders.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="check-circle-outline" size={40} color={colors.success} />
          <Text style={{ color: colors.textMuted, marginTop: 10, fontSize: FontSize.md }}>No active disputes!</Text>
        </View>
      ) : (
        <FlatList
          data={data?.orders}
          keyExtractor={(item) => item._id}
          renderItem={renderComplaint}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.lg, fontWeight: '700' },
  list: { padding: Spacing.xl, gap: Spacing.md },
  card: { padding: Spacing.xl, borderRadius: Radius.xl, borderWidth: 0.5, borderColor: 'transparent', gap: Spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: FontSize.md, fontWeight: '600' },
  amount: { fontSize: FontSize.md, fontWeight: '800' },
  issueBox: { padding: Spacing.md, borderRadius: Radius.lg },
  issueLabel: { fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase' },
  issueText: { fontSize: FontSize.sm, marginTop: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  storeName: { fontSize: FontSize.xs },
  date: { fontSize: FontSize.xs },
  cardActions: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
  resolveBtn: { paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1 },
  resolveBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: Spacing.xxl, opacity: 0.7 },
  emptyText: { fontSize: FontSize.md, fontWeight: '600' },
  retryText: { fontSize: FontSize.sm, fontWeight: '700', marginTop: Spacing.sm },
});

const ComplaintCardSkeleton = ({ colors }: { colors: any }) => (
  <MotiView
    transition={{ type: 'timing' }}
    animate={{ backgroundColor: colors.surface }}
    style={[styles.card, { borderColor: colors.border }]}
  >
    <View style={styles.cardHeader}>
      <Skeleton colorMode={colors.colorScheme} height={18} width="40%" />
      <Skeleton colorMode={colors.colorScheme} height={18} width="30%" />
    </View>
    <View style={[styles.issueBox, { backgroundColor: colors.skeleton }]}>
      <Skeleton colorMode={colors.colorScheme} height={14} width="60%" />
      <Skeleton colorMode={colors.colorScheme} height={12} width="90%" />
      <View style={{ height: 4 }} />
      <Skeleton colorMode={colors.colorScheme} height={12} width="80%" />
    </View>
    <View style={styles.cardFooter}>
      <Skeleton colorMode={colors.colorScheme} height={12} width="45%" />
      <Skeleton colorMode={colors.colorScheme} height={12} width="30%" />
    </View>
  </MotiView>
);

const ComplaintListSkeleton = ({ colors }: { colors: any }) => (
  <View style={styles.list}>
    {[...Array(3)].map((_, i) => <ComplaintCardSkeleton key={i} colors={colors} />)}
  </View>
);