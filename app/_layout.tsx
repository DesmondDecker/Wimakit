import { useCallback, useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import Toast from 'react-native-toast-message';
import { View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { toastConfig } from '../components/ui/ToastConfig';
import { useOfflineStore } from '../store';
import { usePushNotifications } from '../hooks/usePushNotifications';

SplashScreen.preventAutoHideAsync();

// QueryClient lives outside component so it is not recreated on re-render
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            1000 * 60 * 3,
      gcTime:               1000 * 60 * 10,
      retry:                2,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 1 },
  },
});

function AppStack() {
  const { colors, isDark } = useTheme();
  const setOnline = useOfflineStore((s) => s.setOnline);
  const replay    = useOfflineStore((s) => s.replay);
  const wasOffline = useRef(false);

  usePushNotifications();

  const onLayout = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected !== false;
      setOnline(online);
      if (online && wasOffline.current) {
        replay().catch(() => {});
      }
      wasOffline.current = !online;
    });
    return () => unsubscribe();
  }, [setOnline, replay]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={onLayout}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent />
      <Stack
        screenOptions={{
          headerShown:  false,
          contentStyle: { backgroundColor: colors.background },
          animation:    'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)"          options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)"          options={{ animation: 'fade' }} />
        <Stack.Screen name="product/[id]"    options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="profile/[slug]"  options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="cart"            options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="order/[id]"      options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="search"          options={{ animation: 'fade' }} />
        <Stack.Screen name="seller/add-product" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="seller/my-products" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="users"           options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="category/[slug]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="resolve"         options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="complaints"      options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings"        options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="wishlist"         options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications"    options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="edit-profile"     options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="about"            options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="delivery-pricing" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="report"           options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="admin/index"      options={{ animation: 'fade' }} />
        <Stack.Screen name="bnpl/index"       options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="loans/index"      options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="community/index"  options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="rider-dashboard" options={{ animation: 'fade' }} />
      </Stack>
      <Toast config={toastConfig} topOffset={56} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppStack />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}