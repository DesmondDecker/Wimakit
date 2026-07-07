import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store';
import { profilesApi } from '../utils/api';
import { Button } from '../components/ui/Button';
import { Spacing, Radius, FontSize } from '../constants/theme';

export default function EditProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, updateUser } = useAuthStore();

  const [name,             setName]             = useState(user?.name ?? '');
  const [bio,              setBio]              = useState(user?.bio ?? '');
  const [location,         setLocation]         = useState(user?.location ?? '');
  const [phone,            setPhone]            = useState(user?.phone ?? '');
  const [storeName,        setStoreName]        = useState(user?.storeName ?? '');
  const [storeDescription, setStoreDescription] = useState(user?.storeDescription ?? '');
  const [storeCategories,  setStoreCategories]  = useState((user as any)?.categories?.join(', ') ?? ''); // New state for categories
  const [avatar,           setAvatar]           = useState(user?.avatar ?? '');
  const [saving,           setSaving]           = useState(false);

  const isSeller = user?.role === 'seller';

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access.'); return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled) setAvatar(result.assets[0].uri);
  };

  const handleSave = async () => {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'Name is required' }); return; }
    setSaving(true);
    try {
      const updates: any = { name: name.trim(), bio, location, phone };
      if (isSeller) { 
        updates.storeName = storeName; 
        updates.storeDescription = storeDescription;
        (updates as any).categories = storeCategories.split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 10);
      }
      if (avatar && avatar !== user?.avatar) updates.avatar = avatar;

      // Try API first, fallback to local update
      try {
        const { data } = await profilesApi.updateMe(updates);
        updateUser(data.user);
      } catch {
        updateUser(updates);
      }

      Toast.show({ type: 'success', text1: '✅ Profile updated!' });
      router.back();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/profile' as any)}>
          <Text style={[styles.backText, { color: colors.primary }]}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.saveText, { color: saving ? colors.textMuted : colors.primary }]}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={pickAvatar} activeOpacity={0.85}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
              ) : ( // Changed emoji to MaterialCommunityIcons name
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryMuted }]}>
                  <MaterialCommunityIcons name="account-outline" size={40} color={colors.primary} />
                </View> 
              )} 
              <View style={[styles.cameraBtn, { backgroundColor: colors.primary }]}>
                <MaterialCommunityIcons name="camera-outline" size={18} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={[styles.avatarHint, { color: colors.textMuted }]}>Tap to change photo</Text>
          </View>

          {/* Personal info */}
          <Section title="Personal Info" colors={colors} style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 }}>
            <Field label="Full Name *" value={name} onChange={setName} placeholder="Your full name" colors={colors} />
            <Field label="Phone Number" value={phone} onChange={setPhone} placeholder="+232 76 000000" keyboardType="phone-pad" colors={colors} />
            <Field label="Location" value={location} onChange={setLocation} placeholder="e.g. Freetown, Sierra Leone" colors={colors} />
            <Field label="Bio" value={bio} onChange={setBio} placeholder="Tell people about yourself..." multiline colors={colors} />
          </Section>

          {/* Seller store info */}
          {isSeller && (
            <Section title="Store Info" colors={colors} style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 }}>
              <Field label="Store Name" value={storeName} onChange={setStoreName} placeholder="e.g. Aminata's Fresh Market" colors={colors} />
              <Field label="Store Description" value={storeDescription} onChange={setStoreDescription} placeholder="Tell buyers about your store..." multiline colors={colors} />
              <Field label="Store Categories (Max 10, comma separated)" value={storeCategories} onChange={setStoreCategories} placeholder="e.g. Skin Care, Electronics, Groceries" colors={colors} />
            </Section>
          )}

          {/* Profile link */}
          <View style={[styles.profileLinkBox, { backgroundColor: colors.surface, borderColor: colors.border, margin: Spacing.lg }]}>
            <Text style={[styles.profileLinkLabel, { color: colors.textMuted }]}>Your Profile Link</Text>
            <Text style={[styles.profileLink, { color: colors.primary }]}>
              wimakit.sl/profile/{user?.profileSlug ?? '...'}
            </Text>
            <Text style={[styles.profileLinkHint, { color: colors.textMuted }]}>
              This link is automatically generated from your name and cannot be changed.
            </Text>
          </View>

          <View style={{ padding: Spacing.lg, paddingBottom: 40 }}>
            <Button
              title={saving ? 'Saving...' : 'Save Changes'}
              onPress={handleSave}
              loading={saving}
              fullWidth
              size="lg"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, children, colors, style }: { title: string; children: React.ReactNode; colors: any; style?: any }) {
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border + '20' }, style]}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline, keyboardType, colors }: any) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { color: colors.textPrimary, borderColor: colors.border + '40', backgroundColor: colors.background },
          multiline && styles.inputMulti,
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={keyboardType === 'phone-pad' ? 'none' : 'sentences'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 36, fontWeight: '100', marginTop: -4 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700' },
  saveText: { fontSize: FontSize.md, fontWeight: '600' },

  avatarSection: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  cameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarHint: { fontSize: FontSize.sm },

  section: { margin: Spacing.lg, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 0.5, gap: Spacing.sm, marginBottom: 0 },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.md },
  field: { gap: 6 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, fontSize: FontSize.md, minHeight: 54 },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },

  profileLinkBox: { borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 0.5, borderColor: 'transparent', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1, gap: 4 },
  profileLinkLabel: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  profileLink: { fontSize: FontSize.md, fontWeight: '700' },
  profileLinkHint: { fontSize: FontSize.xs, lineHeight: 16 },
});
