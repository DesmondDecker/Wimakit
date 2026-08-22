import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert , TouchableOpacity} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useReportIssue } from '../hooks/useApi';
import { Button } from '../components/ui/Button';
import { Spacing, Radius, FontSize } from '../constants/theme';
import Toast from 'react-native-toast-message';

export default function OrderReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { mutate: report, isPending } = useReportIssue();
  
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = () => {
    if (!subject || !message) {
      return Alert.alert('Missing Info', 'Please provide both a subject and details of the issue.');
    }

    report({ id: id!, subject, message }, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: 'Issue Reported', text2: 'The seller will review your request.' });
        router.back();
      },
      onError: () => {
        Toast.show({ type: 'error', text1: 'Submission failed', text2: 'Please try again later.' });
      }
    });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border + '20' }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ fontSize: 32, fontWeight: '100', color: colors.primary }}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Report an Issue</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Problem Subject</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border + '40' }]}
          placeholder="e.g., Damaged items, Missing items, Delivery delay"
          placeholderTextColor={colors.textMuted}
          value={subject}
          onChangeText={setSubject}
        />

        <Text style={[styles.label, { color: colors.textMuted }]}>Detailed Description</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border + '40' }]}
          placeholder="Describe what happened..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={6}
          value={message}
          onChangeText={setMessage}
        />

        <View style={[styles.notice, { backgroundColor: colors.surfaceRaised }]}>
          <MaterialCommunityIcons name="scale-balance" size={20} color={colors.textMuted} style={{ marginBottom: 8 }} />
          <Text style={[styles.noticeText, { color: colors.textMuted }]}>
            Note: The seller will be notified immediately. WimaKit support may intervene if the issue is not resolved within 24 hours.
          </Text>
        </View>

        <View style={styles.actionRow}>
          <Button 
            title="Submit Report" 
            onPress={handleSubmit} 
            loading={isPending}
            variant="danger"
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
  input: { height: 56, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, fontSize: FontSize.md },
  textArea: { height: 180, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.lg, fontSize: FontSize.md, textAlignVertical: 'top' },
  notice: { marginTop: Spacing.xxl, padding: Spacing.xl, borderRadius: Radius.xl, alignItems: 'center' },
  noticeText: { fontSize: FontSize.xs, lineHeight: 18, textAlign: 'center', opacity: 0.8 },
  actionRow: { marginTop: Spacing.xxxl },
});