import React, { useState } from 'react';
import { APP_VERSION } from '../constants/data';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Switch, Alert, Linking, Modal, TextInput, ActivityIndicator} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store';
import { authApi } from '../utils/api';
import { FontSize, Spacing, Radius, Shadow } from '../constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, isDark, toggleTheme, setMode, mode } = useTheme();
  const { user, logout } = useAuthStore();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword]   = useState('');
  const [deleting, setDeleting]               = useState(false);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => { logout(); router.replace('/(auth)/welcome'); } },
    ]);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      Toast.show({ type: 'error', text1: 'Enter your password to confirm' });
      return;
    }
    setDeleting(true);
    try {
      await authApi.deleteAccount(deletePassword);
      setDeleteModalOpen(false);
      Toast.show({ type: 'success', text1: 'Account deleted' });
      logout();
      router.replace('/(auth)/welcome');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed', text2: err?.response?.data?.message ?? 'Could not delete account' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/profile' as any)}>
          <Text style={[styles.backText, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Appearance */}
        <SectionLabel label="Appearance" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingRow
            icon="🌙"
            label="Dark Mode"
            colors={colors}
            right={
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <SettingRow
            icon="theme-light-dark"
            label="Theme"
            value={mode === 'system' ? 'System default' : mode === 'dark' ? 'Dark' : 'Light'}
            colors={colors}
            onPress={() =>
              Alert.alert('Choose Theme', '', [
                { text: 'System Default', onPress: () => setMode('system') },
                { text: 'Light',          onPress: () => setMode('light') },
                { text: 'Dark',           onPress: () => setMode('dark') },
                { text: 'Cancel',         style: 'cancel' },
              ])
            }
          />
        </View>

        {/* Account */}
        <SectionLabel label="Account" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingRow icon="account-edit-outline" label="Edit Profile"        colors={colors} onPress={() => router.push('/edit-profile' as any)} />
          <SettingRow icon="lock-outline" label="Change Password"     colors={colors} onPress={() => router.push('/change-password' as any)} />
          <SettingRow icon="phone-outline" label="Phone Number"        value={user?.phone ?? 'Not set'} colors={colors} onPress={() => router.push('/edit-profile' as any)} />
          <SettingRow icon="email-outline" label="Email"               value={user?.email ?? ''} colors={colors} />
        </View>

        {/* Notifications */}
        <SectionLabel label="Notifications" colors={colors} /> 
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingRow icon="truck-fast-outline" label="Order Updates"  colors={colors} right={<Switch value trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />} />
          <SettingRow icon="tag-outline" label="Promotions"     colors={colors} right={<Switch value={false} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />} />
          <SettingRow icon="message-text-outline" label="Messages"       colors={colors} right={<Switch value trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />} />
        </View>

        {/* Privacy */}
        <SectionLabel label="Privacy & Security" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingRow icon="shield-lock-outline" label="Privacy Policy"    colors={colors} onPress={() => router.push('/legal/privacy' as any)} />
          <SettingRow icon="file-document-outline" label="Terms of Service"   colors={colors} onPress={() => router.push('/legal/terms' as any)} />
          <SettingRow icon="cookie-outline" label="Cookie Settings"    colors={colors} onPress={() => router.push('/legal/cookies' as any)} />
          <SettingRow icon="delete-outline" label="Delete Account"     colors={colors} danger onPress={() =>
            Alert.alert('Delete Account', 'This action is permanent and cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => setDeleteModalOpen(true) },
            ])
          } />
        </View>

        {/* About */}
        <SectionLabel label="About" colors={colors} /> 
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingRow icon="information-outline" label="App Version"   value={APP_VERSION} colors={colors} />
          <SettingRow icon="web" label="Website"       value="wimakit.sl" colors={colors} onPress={() => Linking.openURL('https://wimakit.sl')} />
          <SettingRow icon="phone-outline" label="Contact Us" value="+232 76 000 000" colors={colors} onPress={() => Linking.openURL('tel:+23276000000')} />
        </View>

        {/* Log Out */}
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.error }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Text style={[styles.logoutText, { color: colors.error }]}>Log Out</Text>
        </TouchableOpacity>

        <Text style={[styles.footer, { color: colors.textMuted }]}>
          WimaKit v{APP_VERSION} · di makit na you phone 🇸🇱
        </Text>
      </ScrollView>

      <Modal visible={deleteModalOpen} transparent animationType="fade" onRequestClose={() => setDeleteModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Confirm Password</Text>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              Enter your password to permanently delete your account. This cannot be undone.
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              value={deletePassword}
              onChangeText={setDeletePassword}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: Spacing.lg }}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.border + '30' }]}
                onPress={() => { setDeleteModalOpen(false); setDeletePassword(''); }}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.error }]}
                onPress={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionLabel({ label, colors }: { label: string; colors: any }) {
  return (
    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
  );
}

function SettingRow({
  icon, label, value, onPress, right, colors, danger = false,
}: {
  icon: string; label: string; value?: string; onPress?: () => void; // icon is now a string for MaterialCommunityIcons name
  right?: React.ReactNode; colors: any; danger?: boolean;
}) {
  const Container: any = onPress ? TouchableOpacity : View;
  return (
    <Container
      style={[styles.settingRow, { borderBottomColor: colors.border + '20' }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.settingLeft}>
        <MaterialCommunityIcons name={icon as any} size={22} color={danger ? colors.error : colors.textPrimary} style={styles.settingIcon} />
        <Text style={[styles.settingLabel, { color: danger ? colors.error : colors.textPrimary, fontWeight: danger ? '600' : '400' }]}>
          {label}
        </Text>
      </View>
      <View style={styles.settingRight}>
        {value ? <Text style={[styles.settingValue, { color: colors.textMuted }]}>{value}</Text> : null}
        {right ?? null}
        {onPress && !right ? <Text style={[styles.chevron, { color: colors.textMuted, opacity: 0.6 }]}>›</Text> : null}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 36, fontWeight: '100', marginTop: -4 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700' },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 1.2, marginHorizontal: Spacing.xl, marginTop: Spacing.xxl, marginBottom: Spacing.md },
  card: { marginHorizontal: Spacing.lg, borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 0.5, borderColor: 'transparent' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg, borderBottomWidth: 0.5 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  settingIcon: { fontSize: 22, width: 32 },
  settingLabel: { fontSize: FontSize.md, fontWeight: '400' },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  settingValue: { fontSize: FontSize.sm, fontWeight: '300' },
  chevron: { fontSize: 22, fontWeight: '300' },
  logoutBtn: { marginHorizontal: Spacing.xl, marginTop: Spacing.xxxl, borderRadius: Radius.full, borderWidth: 1, paddingVertical: Spacing.lg, alignItems: 'center' },
  logoutText: { fontSize: FontSize.md, fontWeight: '600' },
  footer: { textAlign: 'center', fontSize: FontSize.xs, marginTop: Spacing.xl, marginBottom: Spacing.xxxl },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  modalCard: { width: '100%', maxWidth: 380, borderRadius: Radius.xl, padding: Spacing.xl },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '800', marginBottom: 8 },
  modalBody: { fontSize: FontSize.sm, lineHeight: 20, marginBottom: Spacing.md },
  modalInput: { borderWidth: 1, borderRadius: Radius.lg, padding: 12, fontSize: 14 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
});
