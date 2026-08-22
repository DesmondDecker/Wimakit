/**
 * usePushNotifications
 *
 * Requests push notification permission on first mount and registers the
 * Expo push token with the backend via POST /api/auth/push-token.
 *
 * IMPORTANT — Expo Go (including Expo Go 54, the current one): since SDK 53,
 * Expo Go no longer supports *remote* push notifications at all — only a
 * development build (`npx expo run:android` / `eas build --profile
 * development`) can receive them. This used to call
 * getExpoPushTokenAsync() unconditionally with no guard for that and no
 * top-level try/catch, so in Expo Go it either threw an unhandled promise
 * rejection or silently failed depending on SDK patch version. This now
 * detects Expo Go explicitly and skips remote registration there with a
 * clear one-time dev log instead, while still setting up the Android
 * notification channel and requesting permission — both of which Expo Go
 * *does* still support, they're just not connected to anything remote.
 *
 * getExpoPushTokenAsync() also now requires an explicit `projectId`
 * (it stopped reliably inferring one several SDKs ago) — that comes from
 * app.json's `extra.eas.projectId`, set by `eas init`. Without EAS set up
 * for this project yet, registration is skipped with a log rather than
 * throwing, since that's a one-time infra step, not a code bug.
 *
 * expo-notifications is now installed (package.json) and configured via
 * the config plugin in app.json — previously this hook's dynamic require
 * always failed because expo-notifications was referenced in code but was
 * never actually added to package.json.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import api from '../utils/api';
import { useAuthStore } from '../store';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Notifications: any = null;
if (!isExpoGo) {
  try {
    // Dynamic require so the app doesn't crash if the package isn't installed yet
    // and avoids triggering Expo Go SDK 53 push notification warnings.
    Notifications = require('expo-notifications');
  } catch (_) {
    /* expo-notifications not installed */
  }
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
      try {
        // Android requires an explicit notification channel — this part
        // works fine in Expo Go, it's only the remote token below that
        // doesn't.
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

        if (isExpoGo) {
          if (__DEV__) console.log('[usePushNotifications] Running in Expo Go — remote push is not supported here since SDK 53. Use a development build to test push delivery.');
          return;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) {
          if (__DEV__) console.log('[usePushNotifications] No EAS projectId configured (app.json extra.eas.projectId) — skipping remote push registration. Run `eas init` to set one up.');
          return;
        }

        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        const token = tokenData.data;
        if (!token) return;

        // Register the token with the backend — backend deduplicates via $addToSet
        await api.post('/auth/push-token', { token }).catch(() => {});
      } catch (err) {
        // Never let push registration take down the rest of the app —
        // this used to have no top-level catch, so any failure here
        // (permission dialog dismissed, no network, Expo API hiccup)
        // became an unhandled promise rejection.
        if (__DEV__) console.log('[usePushNotifications] Registration failed (non-fatal):', err);
      }
    })();
  }, [user?._id]);
}
