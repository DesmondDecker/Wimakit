import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import Toast from 'react-native-toast-message';
import { Share } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import { Button } from '../ui/Button';
import {
  ReceiptInput, generateReceiptHtml, generateReceiptPlainText,
  printReceipt, shareReceiptPdf,
} from '../../utils/receipt';

interface ReceiptViewProps {
  data: ReceiptInput;
  /** Compact hides the "why this matters" subtitle — used inside the post-checkout confirmation screen, which already has its own banner. */
  compact?: boolean;
}

export function ReceiptView({ data, compact = false }: ReceiptViewProps) {
  const { colors } = useTheme();
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const html = useMemo(() => generateReceiptHtml(data), [data]);
  const plainText = useMemo(() => generateReceiptPlainText(data), [data]);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printReceipt(html);
    } catch (e: any) {
      // A user cancelling the print sheet also lands here on some
      // platforms — don't show an error toast for that.
      if (!/cancel/i.test(String(e?.message))) {
        Toast.show({ type: 'error', text1: 'Could not open print dialog' });
      }
    } finally {
      setPrinting(false);
    }
  };

  const handleSharePdf = async () => {
    setSharing(true);
    try {
      await shareReceiptPdf(html, data.orderId);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Could not share PDF', text2: e?.message });
    } finally {
      setSharing(false);
    }
  };

  const handleShareText = () => {
    Share.share({ message: plainText, title: 'WimaKit Receipt' });
  };

  return (
    <View>
      {!compact && (
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {data.viewerRole === 'seller' ? '🧾 Order Invoice' : '🧾 Your Receipt'}
        </Text>
      )}
      <View style={[styles.webviewCard, { borderColor: colors.border }]}>
        {Platform.OS === 'web' ? (
          <View style={{ height: 300, padding: Spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
              Receipt preview is optimized for mobile devices.{'\n'}
              Use "Print / Save PDF" below to view or save it.
            </Text>
          </View>
        ) : (
          <WebView
            source={{ html }}
            style={{ height: 640 }}
            scrollEnabled={false}
            originWhitelist={['*']}
          />
        )}
      </View>
      <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
        <Button
          title={printing ? 'Opening print dialog...' : '🖨️ Print / Save PDF'}
          onPress={handlePrint}
          loading={printing}
          variant="primary"
          fullWidth
        />
        {Platform.OS !== 'web' && (
          <Button
            title={sharing ? 'Preparing PDF...' : '📤 Share Receipt (PDF)'}
            onPress={handleSharePdf}
            loading={sharing}
            variant="outline"
            fullWidth
          />
        )}
        <Button
          title="💬 Share via WhatsApp/SMS"
          onPress={handleShareText}
          variant="ghost"
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: FontSize.md, fontWeight: '800', marginBottom: Spacing.sm },
  webviewCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
