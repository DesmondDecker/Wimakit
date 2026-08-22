import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui/Button';
import { Spacing, Radius, FontSize } from '../constants/theme';
import Toast from 'react-native-toast-message';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../utils/api';

export default function ResolveComplaintScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const queryClient = useQueryClient();

  const { data: orderData, isLoading: isOrderLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.byId(id!),
    enabled: !!id,
  });

  const order = orderData?.data;
  const initialResolution = order?.complaint?.resolution || '';
  const initialStatus = order?.complaint?.status || 'pending';

  const [resolution, setResolution] = useState(initialResolution);
  const [status, setStatus] = useState(initialStatus);
  const [isSaving, setIsSaving] = useState(false);

  const resolveMutation = useMutation({
    mutationFn: (payload: { id: string; status: string; resolution: string }) =>
      ordersApi.resolve(payload.id, payload.status, payload.resolution),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reported-orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      Toast.show({ type: 'success', text1: 'Complaint Resolved', text2: 'Order status updated.' });
      router.canGoBack() ? router.back() : router.replace('/complaints' as any);
    },
    onError: (err: any) => {
      Toast.show({ type: 'error', text1: 'Resolution failed', text2: err?.message || 'Please try again.' });
    },
    onSettled: () => setIsSaving(false),
  });

  const handleSubmit = () => {
    if (!resolution.trim()) {
      return Alert.alert('Missing Info', 'Please provide a resolution description.');
    }
    setIsSaving(true);
    resolveMutation.mutate({ id: id!, status, resolution });
  };

  if (isOrderLoading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/complaints' as any)} style={styles.backBtn}>
            <Text style={{ fontSize: 32, fontWeight: '100', color: colors.primary }}>✕</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Resolve Complaint</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/complaints' as any)} style={styles.backBtn}>
            <Text style={{ fontSize: 32, fontWeight: '100', color: colors.primary }}>✕</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Resolve Complaint</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.error }}>Order not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/complaints' as any)} style={styles.backBtn}>
          <Text style={{ fontSize: 32, fontWeight: '100', color: colors.primary }}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Resolve Complaint</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Order ID</Text>
        <Text style={[styles.valueText, { color: colors.textPrimary }]}>#{order.customOrderId}</Text>

        <Text style={[styles.label, { color: colors.textMuted }]}>Reported Issue</Text>
        <Text style={[styles.valueText, { color: colors.textPrimary }]}>{order.complaint?.subject}</Text>
        <Text style={[styles.valueText, { color: colors.textSecondary, fontSize: FontSize.sm }]}>{order.complaint?.message}</Text>

        <Text style={[styles.label, { color: colors.textMuted, marginTop: Spacing.lg }]}>Resolution Status</Text>
        <View style={styles.statusOptions}>
          {['pending', 'resolved', 'refunded'].map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.statusBtn, { backgroundColor: status === s ? colors.primary : colors.surface, borderColor: status === s ? colors.primary : colors.border }]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.statusBtnText, { color: status === s ? colors.textOnPrimary : colors.textPrimary }]}>{s.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.textMuted }]}>Resolution Details</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border + '40' }]}
          placeholder="Describe how this issue was resolved..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={6}
          value={resolution}
          onChangeText={setResolution}
        />

        <View style={styles.actionRow}>
          <Button 
            title="Submit Resolution" 
            onPress={handleSubmit} 
            loading={isSaving}
            fullWidth
            size="lg"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.lg, fontWeight: '700' },
  content: { padding: Spacing.xl },
  label: { fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', marginBottom: Spacing.sm, marginTop: Spacing.lg, letterSpacing: 1 },
  valueText: { fontSize: FontSize.md, marginBottom: Spacing.sm },
  textArea: { height: 180, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.lg, fontSize: FontSize.md, textAlignVertical: 'top', marginBottom: Spacing.lg },
  actionRow: { marginTop: Spacing.xxxl },
  statusOptions: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statusBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  statusBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
});