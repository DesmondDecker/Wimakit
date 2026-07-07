import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store';
import { authApi } from '../../utils/api';
import { Button } from '../../components/ui/Button';
import { Spacing, Radius, FontSize } from '../../constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const login = useAuthStore((s) => s.login);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [errors,   setErrors]   = useState<Record<string, string>>({});
  const emailRef = useRef<TextInput>(null);
  const passRef  = useRef<TextInput>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!email.trim())               e.email    = 'Email is required';
    else if (!/\S+@\S+/.test(email)) e.email    = 'Enter a valid email';
    if (!password)                   e.password = 'Password is required';
    else if (password.length < 6)    e.password = 'Password must be 6+ characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const { data } = await authApi.login(email.trim().toLowerCase(), password);
      await AsyncStorage.setItem('@wk_access', data.accessToken);
      if (data.refreshToken) await AsyncStorage.setItem('@wk_refresh', data.refreshToken);
      await login(data.user);
      Toast.show({ type: 'success', text1: `Welcome back, ${data.user.name.split(' ')[0]}! 👋` });
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Login failed. Please try again.';
      Toast.show({ type: 'error', text1: 'Login failed', text2: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          <View style={[styles.header, { paddingTop: insets.top + Spacing.xl }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: colors.surfaceRaised }]}
              onPress={() => router.back()}
            >
              <Text style={[styles.backText, { color: colors.primary }]}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.logo, { color: colors.textPrimary }]}>
              Wima<Text style={{ color: colors.primary }}>Kit</Text>
            </Text>
            <Text style={[styles.logoSub, { color: colors.textMuted }]}>
              Welcome back! Please enter your details.
            </Text>
          </View>

          <MotiView
            from={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: 600 }}
            style={[
              styles.form,
              {
                backgroundColor: colors.surface,
                shadowColor: '#000',
                shadowOpacity: 0.04,
                shadowRadius: 20,
                elevation: 4,
              },
            ]}
          >
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>EMAIL ADDRESS</Text>
            <View style={[styles.inputWrap, { borderColor: errors.email ? colors.error : colors.border + '30', backgroundColor: colors.surfaceRaised }]}>
              <TextInput
                ref={emailRef}
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="Enter your email address"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={(v) => { setEmail(v); if (errors.email) setErrors((p) => ({ ...p, email: '' })); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                autoFocus
                blurOnSubmit={false}
                returnKeyType="next"
                onSubmitEditing={() => passRef.current?.focus()}
              />
            </View>
            {errors.email ? <ErrorText text={errors.email} colors={colors} /> : null}

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>PASSWORD</Text>
            <View style={[styles.inputWrap, { borderColor: errors.password ? colors.error : colors.border + '30', backgroundColor: colors.surfaceRaised }]}>
              <TextInput
                ref={passRef}
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="Your password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={(v) => { setPassword(v); if (errors.password) setErrors((p) => ({ ...p, password: '' })); }}
                secureTextEntry={!showPass}
                textContentType="password"
                autoCapitalize="none"
                autoCorrect={false}
                blurOnSubmit={false}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                <Text style={{ fontSize: 18 }}>{showPass ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
            {errors.password ? <ErrorText text={errors.password} colors={colors} /> : null}

            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => router.push('/(auth)/forgot-password' as any)}
            >
              <Text style={[styles.forgotText, { color: colors.primary }]}>Forgot password?</Text>
            </TouchableOpacity>

            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={loading}
              fullWidth
              size="lg"
              style={{ marginTop: Spacing.md }}
            />
          </MotiView>

          <View style={[styles.signupRow, { marginBottom: insets.bottom + Spacing.xl }]}>
            <Text style={[styles.signupText, { color: colors.textSecondary }]}>
              Don't have an account?{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={[styles.signupLink, { color: colors.primary }]}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const ErrorText = ({ text, colors }: { text: string; colors: any }) => (
  <Text style={{ fontSize: FontSize.xs, color: colors.error, marginTop: 4, marginLeft: 12 }}>{text}</Text>
);

const styles = StyleSheet.create({
  root:       { flex: 1 },
  scroll:     { flexGrow: 1 },
  header:     { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: 8 },
  backBtn:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  backText:   { fontSize: 32, fontWeight: '200', marginTop: -4 },
  logo:       { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  logoSub:    { fontSize: FontSize.md, fontWeight: '400' },
  form:       { marginHorizontal: Spacing.lg, borderRadius: Radius.xxl, padding: Spacing.xl, gap: Spacing.md },
  fieldLabel: { fontSize: 10, fontWeight: '800', marginBottom: 8, marginLeft: 4, letterSpacing: 1, marginTop: Spacing.md },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, height: 56 },
  input:      { flex: 1, fontSize: FontSize.md, height: 54, fontWeight: '400' },
  eyeBtn:     { padding: 4 },
  forgotBtn:  { alignSelf: 'flex-end', marginTop: Spacing.sm },
  forgotText: { fontSize: FontSize.sm, fontWeight: '600' },
  signupRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xxl },
  signupText: { fontSize: FontSize.md, fontWeight: '400' },
  signupLink: { fontSize: FontSize.md, fontWeight: '800' },
});
