/**
 * usePushNotifications
 *
 * Requests push notification permission on first mount and registers the
 * Expo push token with the backend via POST /api/auth/push-token.
 *
 * Setup required (one-time, do this before building the app):
 *   npx expo install expo-notifications
 *
 * Until that package is installed this hook is intentionally a no-op —
 * it catches the import error gracefully so the rest of the app keeps
 * working without native push support.
 *
 * Also configures the notification handler so foreground notifications
 * show a banner + sound (Expo's default is to suppress them in foreground).
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import api from '../utils/api';
import { useAuthStore } from '../store';

let Notifications: any = null;
try {
  // Dynamic require so the app doesn't crash if the package isn't installed yet.
  Notifications = require('expo-notifications');
} catch (_) {
  /* expo-notifications not installed — run: npx expo install expo-notifications */
}

export function usePushNotifications() {
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    if (!Notifications || !user?._id) return;

    // Show banners + play sound even while the app is in the foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    (async () => {
      // Android requires an explicit notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'WimaKit',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#0F6E56',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;
      if (!token) return;

      // Register the token with the backend — backend deduplicates via $addToSet
      await api.post('/auth/push-token', { token }).catch(() => {});
    })();
  }, [user?._id]);
}
