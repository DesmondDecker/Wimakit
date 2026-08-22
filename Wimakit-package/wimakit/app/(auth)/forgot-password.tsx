import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../../components/ui/Button';
import { authApi } from '../../utils/api';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import Toast from 'react-native-toast-message';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) { Alert.alert('Email required'); return; }
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch {
      Toast.show({ type: 'error', text1: 'Error sending reset email' });
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={[st.root, { backgroundColor: colors.background }]} edges={['top','bottom']}>
      <LinearGradient colors={[colors.primary, colors.primaryLight]} style={st.header}>
        <TouchableOpacity style={st.back} onPress={() => router.back()}>
          <Text style={{ fontSize: 26, color: '#fff', fontWeight: '300' }}>‹</Text>
        </TouchableOpacity>
        <Text style={st.title}>Forgot Password</Text>
        <Text style={st.sub}>Enter your email to reset your password</Text>
      </LinearGradient>
      <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {sent ? (
          <View style={st.sentWrap}>
            <Text style={{ fontSize: 56, textAlign: 'center' }}>📧</Text>
            <Text style={[st.sentTitle, { color: colors.textPrimary }]}>Email Sent!</Text>
            <Text style={[st.sentSub, { color: colors.textMuted }]}>Check your inbox for a password reset link.</Text>
            <Button title="Back to Login" onPress={() => router.replace('/(auth)/login')} fullWidth style={{ marginTop: Spacing.xl }} />
          </View>
        ) : (
          <>
            <Text style={[st.label, { color: colors.textPrimary }]}>Email Address</Text>
            <TextInput
              style={[st.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="your@email.com" placeholderTextColor={colors.textMuted}
              value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
            />
            <Button title={loading ? 'Sending...' : 'Send Reset Link'} onPress={handleSubmit} loading={loading} fullWidth size="lg" style={{ marginTop: Spacing.md }} />
            <TouchableOpacity onPress={() => router.back()} style={{ marginTop: Spacing.lg, alignItems: 'center' }}>
              <Text style={[{ color: colors.primary, fontWeight: '700', fontSize: FontSize.sm }]}>← Back to Login</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { padding: Spacing.xl, paddingBottom: Spacing.xxxl, alignItems: 'center', gap: 6 },
  back: { position: 'absolute', top: Spacing.lg, left: Spacing.lg, width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: FontSize.xxl, fontWeight: '900' },
  sub: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm, textAlign: 'center' },
  card: { margin: Spacing.lg, marginTop: -Spacing.xxl, borderRadius: Radius.xxl, padding: Spacing.xl, borderWidth: 1 },
  label: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: FontSize.md },
  sentWrap: { alignItems: 'center', gap: Spacing.md },
  sentTitle: { fontSize: FontSize.xl, fontWeight: '800' },
  sentSub: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
});
