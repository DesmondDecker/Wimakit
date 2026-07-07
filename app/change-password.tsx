import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { authApi } from '../utils/api';
import { Button } from '../components/ui/Button';
import { Spacing, Radius, FontSize } from '../constants/theme';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [errors, setErrors]     = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!current)              e.current = 'Enter your current password';
    if (!next)                 e.next    = 'Enter a new password';
    else if (next.length < 6)  e.next    = 'At least 6 characters';
    if (next !== confirm)      e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await authApi.changePassword(current, next);
      Toast.show({ type: 'success', text1: 'Password changed' });
      router.back();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not change password';
      Toast.show({ type: 'error', text1: 'Failed', text2: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Change Password</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">
          <Field label="Current Password" value={current} onChangeText={(v: string) => { setCurrent(v); if (errors.current) setErrors(p => ({ ...p, current: '' })); }} error={errors.current} colors={colors} />
          <Field label="New Password" value={next} onChangeText={(v: string) => { setNext(v); if (errors.next) setErrors(p => ({ ...p, next: '' })); }} error={errors.next} colors={colors} />
          <Field label="Confirm New Password" value={confirm} onChangeText={(v: string) => { setConfirm(v); if (errors.confirm) setErrors(p => ({ ...p, confirm: '' })); }} error={errors.confirm} colors={colors} />

          <Button title="Update Password" onPress={handleSubmit} loading={loading} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Top-level component (not defined inside the screen function) — the exact
// same reasoning as the register-screen fix: an inline component definition
// would get a new identity on every render and cause focus to jump on every
// keystroke.
function Field({ label, value, onChangeText, error, colors }: any) {
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
      <View style={[styles.inputWrap, { borderColor: error ? colors.error : colors.border + '30', backgroundColor: colors.surfaceRaised }]}>
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
        />
      </View>
      {error ? <Text style={{ fontSize: FontSize.xs, color: colors.error, marginTop: 4, marginLeft: 4 }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  scroll: { padding: Spacing.xl },
  fieldLabel: { fontSize: 10, fontWeight: '800', marginBottom: 8, marginLeft: 4, letterSpacing: 1 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, height: 56 },
  input: { flex: 1, fontSize: FontSize.md, height: 54 },
});
