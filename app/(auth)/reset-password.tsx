import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../../components/ui/Button';
import { authApi } from '../../utils/api';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../store';

/**
 * reset-password.tsx
 * ───────────────────
 * Reached via deep link:  wimakit://reset-password?token=<rawToken>
 * Falls back gracefully if no token is provided (directs user to forgot-password).
 */
export default function ResetPasswordScreen() {
  const router                = useRouter();
  const { token }             = useLocalSearchParams<{ token?: string }>();
  const { colors }            = useTheme();
  const { login }             = useAuthStore();

  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [done,        setDone]        = useState(false);
  const [errors,      setErrors]      = useState<{ password?: string; confirm?: string }>({});

  // No token — user arrived here without a valid link
  const noToken = !token;

  const validate = () => {
    const e: typeof errors = {};
    if (password.length < 6)        e.password = 'Password must be at least 6 characters';
    if (password !== confirm)        e.confirm  = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleReset = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await authApi.resetPassword(token as string, password);
      // Backend logs user in immediately after reset
      if (res.data?.user) await login(res.data.user, { access: res.data.accessToken, refresh: res.data.refreshToken });
      setDone(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Reset failed. The link may have expired.';
      Toast.show({ type: 'error', text1: 'Reset failed', text2: msg });
    } finally {
      setLoading(false);
    }
  };

  const s = styles(colors);

  // ── Success state ───────────────────────────────────────────────────────────
  if (done) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <LinearGradient colors={['#064E3B', '#022C22']} style={s.header}>
          <Text style={s.bigIcon}>🔐</Text>
          <Text style={s.title}>Password Reset!</Text>
          <Text style={s.sub}>You're now logged in with your new password.</Text>
        </LinearGradient>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[s.successBox, { backgroundColor: '#022C22', borderColor: '#064E3B' }]}>
            <Text style={{ color: '#6EE7B7', fontSize: FontSize.sm, lineHeight: 20 }}>
              ✓ Your password has been updated. A confirmation email has been sent to your inbox.
            </Text>
          </View>
          <Button
            title="Continue to WimaKit →"
            onPress={() => router.replace('/(tabs)' as any)}
            style={{ marginTop: Spacing.xl }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── No token state ──────────────────────────────────────────────────────────
  if (noToken) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <LinearGradient colors={[colors.error, '#7F1D1D']} style={s.header}>
          <Text style={s.bigIcon}>⚠️</Text>
          <Text style={s.title}>Invalid Link</Text>
          <Text style={s.sub}>This reset link is missing a token or has already been used.</Text>
        </LinearGradient>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Button
            title="Request a new reset link"
            onPress={() => router.replace('/(auth)/forgot-password' as any)}
          />
          <TouchableOpacity style={s.backLink} onPress={() => router.replace('/(auth)/login' as any)}>
            <Text style={{ color: colors.textMuted, fontSize: FontSize.sm }}>← Back to login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.primary, colors.primaryDark ?? '#3730A3']} style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Text style={{ fontSize: 26, color: '#fff', fontWeight: '300' }}>‹</Text>
        </TouchableOpacity>
        <Text style={s.bigIcon}>🔑</Text>
        <Text style={s.title}>New Password</Text>
        <Text style={s.sub}>Choose a strong password for your WimaKit account.</Text>
      </LinearGradient>

      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>

        {/* Password */}
        <Text style={[s.label, { color: colors.textSecondary }]}>New Password</Text>
        <View style={[s.inputRow, { borderColor: errors.password ? colors.error : colors.border, backgroundColor: colors.background }]}>
          <TextInput
            style={[s.input, { color: colors.textPrimary }]}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showPass}
            value={password}
            onChangeText={v => { setPassword(v); setErrors(e => ({ ...e, password: undefined })); }}
            autoCapitalize="none"
            returnKeyType="next"
          />
          <TouchableOpacity onPress={() => setShowPass(p => !p)} style={s.eyeBtn}>
            <MaterialCommunityIcons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        {errors.password && <Text style={[s.errorText, { color: colors.error }]}>{errors.password}</Text>}

        {/* Confirm Password */}
        <Text style={[s.label, { color: colors.textSecondary, marginTop: Spacing.md }]}>Confirm Password</Text>
        <View style={[s.inputRow, { borderColor: errors.confirm ? colors.error : colors.border, backgroundColor: colors.background }]}>
          <TextInput
            style={[s.input, { color: colors.textPrimary }]}
            placeholder="Repeat your new password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showConfirm}
            value={confirm}
            onChangeText={v => { setConfirm(v); setErrors(e => ({ ...e, confirm: undefined })); }}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleReset}
          />
          <TouchableOpacity onPress={() => setShowConfirm(p => !p)} style={s.eyeBtn}>
            <MaterialCommunityIcons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        {errors.confirm && <Text style={[s.errorText, { color: colors.error }]}>{errors.confirm}</Text>}

        {/* Password strength hint */}
        {password.length > 0 && (
          <View style={s.strengthRow}>
            {['length', 'uppercase', 'number', 'symbol'].map((check, i) => {
              const passed =
                check === 'length'    ? password.length >= 8 :
                check === 'uppercase' ? /[A-Z]/.test(password) :
                check === 'number'    ? /[0-9]/.test(password) :
                /[^A-Za-z0-9]/.test(password);
              return (
                <View key={check} style={[s.strengthPip, { backgroundColor: passed ? '#6EE7B7' : colors.border }]} />
              );
            })}
            <Text style={[s.strengthLabel, { color: colors.textMuted }]}>
              {password.length < 6 ? 'Too short' : password.length < 8 ? 'Weak' : password.length >= 12 && /[A-Z]/.test(password) && /[0-9]/.test(password) ? 'Strong 💪' : 'Good'}
            </Text>
          </View>
        )}

        <Button
          title={loading ? 'Resetting…' : 'Reset Password'}
          onPress={handleReset}
          disabled={loading}
          style={{ marginTop: Spacing.xl }}
        />

        <TouchableOpacity style={s.backLink} onPress={() => router.replace('/(auth)/login' as any)}>
          <Text style={{ color: colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' }}>
            Remembered it?{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Log in →</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = (colors: any) => StyleSheet.create({
  root:         { flex: 1 },
  header:       { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing['2xl'], alignItems: 'center' },
  back:         { position: 'absolute', top: Spacing.md, left: Spacing.md, padding: 8 },
  bigIcon:      { fontSize: 48, marginBottom: Spacing.sm },
  title:        { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  sub:          { fontSize: 14, color: 'rgba(255,255,255,.75)', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  card:         { margin: Spacing.lg, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, flex: 1 },
  label:        { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 6 },
  inputRow:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md },
  input:        { flex: 1, paddingVertical: 14, fontSize: FontSize.sm },
  eyeBtn:       { padding: 8 },
  errorText:    { fontSize: FontSize.xs, marginTop: 4 },
  strengthRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  strengthPip:  { width: 28, height: 4, borderRadius: 2 },
  strengthLabel:{ fontSize: 11, fontWeight: '600' },
  successBox:   { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md },
  backLink:     { marginTop: Spacing.lg, alignItems: 'center' },
});
