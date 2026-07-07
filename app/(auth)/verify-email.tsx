import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Keyboard,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../../components/ui/Button';
import { authApi } from '../../utils/api';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../store';

/**
 * verify-email.tsx
 * ─────────────────
 * Two entry points:
 *   1. Deep link:  wimakit://verify-email?token=<rawToken>
 *      → auto-verifies on mount, shows success/error
 *   2. Manual:     Navigated to from post-register screen
 *      → 6-box OTP-style input for token
 *      → resend button
 */
export default function VerifyEmailScreen() {
  const router            = useRouter();
  const { token: deepToken } = useLocalSearchParams<{ token?: string }>();
  const { colors }        = useTheme();
  const { login }         = useAuthStore();

  const [status,   setStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message,  setMessage]  = useState('');
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auto-verify from deep link ──────────────────────────────────────────────
  useEffect(() => {
    if (deepToken) {
      void verify(deepToken as string);
    }
  }, [deepToken]);

  // ── Cooldown countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setInterval(() => setCooldown(c => c - 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [cooldown]);

  const verify = async (rawToken: string) => {
    Keyboard.dismiss();
    setStatus('loading');
    try {
      const res = await authApi.verifyEmail(rawToken.trim());
      if (res.data?.user) await login(res.data.user, { access: res.data.accessToken, refresh: res.data.refreshToken });
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.response?.data?.message || 'Verification failed. The link may have expired.');
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setResending(true);
    try {
      await authApi.resendVerification();
      Toast.show({ type: 'success', text1: '📬 Email sent!', text2: 'Check your inbox (and spam folder).' });
      setCooldown(60);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not resend', text2: 'Please try again shortly.' });
    } finally {
      setResending(false);
    }
  };

  const s = styles(colors);

  // ── Success state ───────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <LinearGradient colors={['#064E3B', '#022C22']} style={s.header}>
          <Text style={s.bigIcon}>✅</Text>
          <Text style={s.title}>Email Verified!</Text>
          <Text style={s.sub}>Your WimaKit account is now active.</Text>
        </LinearGradient>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.bodyText, { color: colors.textSecondary }]}>
            Welcome to Sierra Leone's #1 marketplace. You can now shop, sell, and track deliveries.
          </Text>
          <Button
            title="Continue to WimaKit →"
            onPress={() => router.replace('/(tabs)' as any)}
            style={{ marginTop: Spacing.xl }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <LinearGradient colors={[colors.error, '#7F1D1D']} style={s.header}>
          <Text style={s.bigIcon}>❌</Text>
          <Text style={s.title}>Verification Failed</Text>
          <Text style={s.sub}>{message}</Text>
        </LinearGradient>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Button
            title={resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Verification Email'}
            onPress={handleResend}
            disabled={resending || cooldown > 0}
          />
          <TouchableOpacity style={{ marginTop: Spacing.lg, alignItems: 'center' }} onPress={() => router.back()}>
            <Text style={{ color: colors.primary, fontSize: FontSize.sm, fontWeight: '600' }}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading state (deep link auto-verify) ────────────────────────────────────
  if (status === 'loading') {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={s.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[s.bodyText, { color: colors.textSecondary, marginTop: Spacing.md, textAlign: 'center' }]}>
            Verifying your email…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Idle state: show instructions + resend ───────────────────────────────────
  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.primary, colors.primaryDark ?? '#3730A3']} style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Text style={{ fontSize: 26, color: '#fff', fontWeight: '300' }}>‹</Text>
        </TouchableOpacity>
        <Text style={s.bigIcon}>📬</Text>
        <Text style={s.title}>Check Your Email</Text>
        <Text style={s.sub}>We sent a verification link to your email address.</Text>
      </LinearGradient>

      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[s.bodyText, { color: colors.textSecondary }]}>
          Click the link in the email to verify your account. It expires in{' '}
          <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>24 hours</Text>.
        </Text>

        <View style={[s.infoBox, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
          <Text style={[s.infoText, { color: colors.textSecondary }]}>
            💡 Don't see the email? Check your spam folder. Gmail users: check "Promotions".
          </Text>
        </View>

        <Button
          title={resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Verification Email'}
          onPress={handleResend}
          disabled={resending || cooldown > 0}
          style={{ marginTop: Spacing.lg }}
        />

        <TouchableOpacity
          style={{ marginTop: Spacing.md, alignItems: 'center' }}
          onPress={() => router.replace('/(auth)/login' as any)}
        >
          <Text style={{ color: colors.textMuted, fontSize: FontSize.sm }}>
            Already verified?{' '}
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
  sub:          { fontSize: 14, color: 'rgba(255,255,255,.75)', marginTop: 6, textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing.md },
  card:         { margin: Spacing.lg, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, flex: 1 },
  bodyText:     { fontSize: FontSize.sm, lineHeight: 22 },
  infoBox:      { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginTop: Spacing.md },
  infoText:     { fontSize: FontSize.xs, lineHeight: 18 },
  centerContent:{ flex: 1, justifyContent: 'center', alignItems: 'center' },
});
