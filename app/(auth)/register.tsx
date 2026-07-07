import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { MotiView } from 'moti';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store';
import { authApi } from '../../utils/api';
import { Button } from '../../components/ui/Button';
import { Spacing, Radius, FontSize } from '../../constants/theme';

type Role = 'buyer' | 'seller' | 'rider';

// IMPORTANT: this must stay a top-level component, not defined inside
// RegisterScreen. A component defined inside another component's function
// body gets a brand new identity on every render, so React unmounts and
// recreates every TextInput on every keystroke — which is what was causing
// focus to jump to a different field (or nowhere) as soon as you typed.
function Field({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, inputRef, onSubmitEditing, returnKeyType, right, error, autoCapitalize, textContentType, autoFocus, colors }: any) {
  return (
    <View style={{ marginBottom: Spacing.sm }}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
      <View style={[styles.inputWrap, { borderColor: error ? colors.error : colors.border + '30', backgroundColor: colors.surfaceRaised }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: colors.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType ?? 'default'}
          secureTextEntry={secureTextEntry ?? false}
          autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : 'words')}
          autoCorrect={false}
          textContentType={textContentType}
          autoFocus={autoFocus}
          blurOnSubmit={false}
          returnKeyType={returnKeyType ?? 'next'}
          onSubmitEditing={onSubmitEditing}
        />
        {right ?? null}
      </View>
      {error ? <Text style={[styles.errText, { color: colors.error }]}>{error}</Text> : null}
    </View>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const login = useAuthStore((s) => s.login);

  const [role,      setRole]      = useState<Role>('buyer');
  const [name,      setName]      = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [storeName, setStoreName] = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [errors,    setErrors]    = useState<Record<string, string>>({});

  const emailRef = useRef<TextInput>(null);
  const passRef  = useRef<TextInput>(null);
  const confRef  = useRef<TextInput>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim())                e.name     = 'Full name is required';
    if (!email.trim())               e.email    = 'Email is required';
    else if (!/\S+@\S+/.test(email)) e.email    = 'Enter a valid email';
    if (!phone.trim())               e.phone    = 'Phone number is required';
    if (role === 'seller' && !storeName.trim()) e.storeName = 'Store name is required';
    if (!password)                   e.password = 'Password is required';
    else if (password.length < 6)    e.password = 'At least 6 characters';
    if (password !== confirm)        e.confirm  = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload: any = { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password, role };
      if (role === 'seller') payload.storeName = storeName.trim();

      const { data } = await authApi.register(payload);
      await AsyncStorage.setItem('@wk_access', data.accessToken);
      if (data.refreshToken) {
        await AsyncStorage.setItem('@wk_refresh', data.refreshToken);
      }
      await login(data.user);
      Toast.show({ type: 'success', text1: `Welcome to WimaKit, ${data.user.name.split(' ')[0]}! 🎉` });
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Registration failed.';
      Toast.show({ type: 'error', text1: 'Sign up failed', text2: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always"
        >
          <View style={[styles.header, { paddingTop: insets.top + Spacing.xl, alignItems: 'center' }]}>
            <MotiView 
              from={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              style={[styles.logoCircle, { backgroundColor: colors.primary + '15' }]}
            >
              <Text style={[styles.logoText, { color: colors.primary }]}>W</Text>
            </MotiView>
            <Text style={[styles.logo, { color: colors.textPrimary, marginTop: Spacing.md }]}>
              Wima<Text style={{ color: colors.primary }}>Kit</Text>
            </Text>
            <Text style={[styles.logoSub, { color: colors.textMuted, textAlign: 'center' }]}>
              The finest local marketplace in your pocket
            </Text>
          </View>

          <MotiView
            from={{ opacity: 0, translateY: 20 }} 
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 700 }}
            style={[
              styles.form, 
              { 
                backgroundColor: colors.surface, 
                shadowColor: '#000', 
                shadowOpacity: 0.05, 
                shadowRadius: 30, 
                elevation: 5,
                marginTop: Spacing.lg 
              }
            ]}
          >
            <View style={[styles.roleRow, { backgroundColor: colors.surfaceRaised, padding: 6 }]}>
              {(['buyer', 'seller', 'rider'] as Role[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleBtn, role === r && { backgroundColor: colors.surface, shadowOpacity: 0.05, shadowRadius: 5 }]}
                  onPress={() => setRole(r)}
                >
                  <Text style={styles.roleIcon}>
                    {r === 'buyer' ? '🛒' : r === 'seller' ? '🏪' : '🏍️'}
                  </Text>
                  <Text style={[styles.roleLabel, { color: role === r ? colors.primary : colors.textMuted }]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Field colors={colors} label="Full Name" value={name} onChangeText={setName} placeholder="e.g. Aminata Koroma" error={errors.name} onSubmitEditing={() => emailRef.current?.focus()} autoFocus />
            <Field colors={colors} label="Email Address" value={email} onChangeText={setEmail} placeholder="your@email.com" keyboardType="email-address" error={errors.email} inputRef={emailRef} onSubmitEditing={() => passRef.current?.focus()} autoCapitalize="none" textContentType="username" />
            <Field colors={colors} label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+232 76 000000" keyboardType="phone-pad" error={errors.phone} autoCapitalize="none" textContentType="telephoneNumber" />

            {role === 'seller' && (
              <MotiView
                from={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ type: 'timing', duration: 300 }}
              >
                <Field colors={colors} label="Store Name" value={storeName} onChangeText={setStoreName} placeholder="e.g. Aminata's Fresh Market" error={errors.storeName} />
              </MotiView>
            )}

            <Field
              colors={colors}
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry={!showPass}
              error={errors.password}
              inputRef={passRef}
              onSubmitEditing={() => confRef.current?.focus()}
              autoCapitalize="none"
              textContentType="password"
              right={
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 18 }}>{showPass ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              }
            />
            <Field
              colors={colors}
              label="Confirm Password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repeat password"
              secureTextEntry={!showPass}
              error={errors.confirm}
              inputRef={confRef}
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              autoCapitalize="none"
              textContentType="password"
            />

            <Button title={loading ? 'Creating Account...' : 'Create Account'} onPress={handleRegister} loading={loading} fullWidth size="lg" style={{ marginTop: Spacing.md }} />

            <Text style={[styles.tos, { color: colors.textMuted }]}>
              By signing up you agree to WimaKit's Terms of Service and Privacy Policy.
            </Text>
          </MotiView>

          <View style={[styles.loginRow, { marginBottom: insets.bottom + Spacing.xl }]}>
            <Text style={[styles.loginText, { color: colors.textSecondary }]}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={[styles.loginLink, { color: colors.primary }]}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  header: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md, gap: 4 },
  logoCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 42, fontWeight: '900' },
  logo: { fontSize: 36, fontWeight: '800', letterSpacing: -1.5 },
  logoSub: { fontSize: FontSize.sm, fontWeight: '500', maxWidth: '80%' },
  form: { marginHorizontal: Spacing.lg, borderRadius: Radius.xxl, padding: Spacing.xl, gap: Spacing.md },
  roleRow: { flexDirection: 'row', borderRadius: Radius.xl, padding: 6, marginBottom: Spacing.md },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.lg },
  roleIcon: { fontSize: 20 },
  roleLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  fieldLabel: { fontSize: 10, fontWeight: '800', marginBottom: 8, marginLeft: 4, letterSpacing: 1 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, height: 56 },
  input: { flex: 1, fontSize: FontSize.md, height: 54, fontWeight: '400' },
  errText: { fontSize: FontSize.xs, marginTop: 4, marginLeft: 12 },
  tos: { fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.lg, lineHeight: 18, opacity: 0.6 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xxl },
  loginText: { fontSize: FontSize.md, fontWeight: '400' },
  loginLink: { fontSize: FontSize.md, fontWeight: '800' },
});
