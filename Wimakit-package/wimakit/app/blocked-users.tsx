import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { authApi } from '../utils/api';
import { Spacing, Radius, FontSize } from '../constants/theme';

/**
 * Settings > Blocked Users. Previously this row in settings.tsx didn't
 * exist — there was no screen, no backend field (models/User.js.blockedUsers
 * is new), nothing. Blocking here also filters that user's posts out of
 * the community feed (see communityController.getFeed) — it does not yet
 * stop a blocked user from viewing this user's own public storefront, which
 * is a separate, larger content-visibility decision.
 */
export default function BlockedUsersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    authApi.getBlockedUsers()
      .then((r) => setUsers(r.data.blockedUsers ?? []))
      .catch(() => Toast.show({ type: 'error', text1: 'Could not load blocked users' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnblock = (u: any) => {
    Alert.alert('Unblock user', `Unblock ${u.name}? They'll be able to appear in your feed again.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock', onPress: () => {
          setUnblockingId(u._id);
          authApi.unblockUser(u._id)
            .then(() => { setUsers((prev) => prev.filter((x) => x._id !== u._id)); Toast.show({ type: 'success', text1: `${u.name} unblocked` }); })
            .catch(() => Toast.show({ type: 'error', text1: 'Could not unblock user' }))
            .finally(() => setUnblockingId(null));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Blocked Users</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : users.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="account-cancel-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>You haven't blocked anyone</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Blocked users' posts are hidden from your community feed.
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u._id}
          contentContainerStyle={{ padding: Spacing.lg }}
          renderItem={({ item: u }) => (
            <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.primaryMuted }]}>
                <Text style={{ color: colors.primary, fontWeight: '900' }}>{(u.name?.[0] ?? '?').toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.textPrimary }]}>{u.name}</Text>
                {u.storeName ? <Text style={[styles.sub, { color: colors.textMuted }]}>{u.storeName}</Text> : null}
              </View>
              <TouchableOpacity
                style={[styles.unblockBtn, { borderColor: colors.error }]}
                onPress={() => handleUnblock(u)}
                disabled={unblockingId === u._id}
              >
                {unblockingId === u._id
                  ? <ActivityIndicator size="small" color={colors.error} />
                  : <Text style={{ color: colors.error, fontWeight: '700', fontSize: FontSize.sm }}>Unblock</Text>}
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 36, fontWeight: '100', marginTop: -4 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xxl, gap: 8 },
  emptyText: { fontSize: FontSize.md, fontWeight: '700', marginTop: 8 },
  emptySub: { fontSize: FontSize.sm, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 0.5, marginBottom: Spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: FontSize.md, fontWeight: '700' },
  sub: { fontSize: FontSize.xs, marginTop: 2 },
  unblockBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
});
