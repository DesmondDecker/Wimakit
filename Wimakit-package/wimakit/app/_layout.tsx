import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';

import { AuthProvider, useAuthStore } from '@/store';
import { ThemeProvider } from '@/context/ThemeContext';
import { toastConfig } from '@/components/ui/ToastConfig';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { io } from 'socket.io-client';
import { useNotificationStore } from '@/store';
import { BASE_URL } from '@/utils/api';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function AppStack() {
  // This custom hook handles registering the device for push notifications.
  usePushNotifications();
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((s) => s.user);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [fontsLoaded, fontError] = useFonts({
    ...MaterialCommunityIcons.font,
  });

  useEffect(() => {
    // Initialize auth state when the component mounts
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    // Hide the splash screen only when both fonts AND auth state are loaded.
    if ((fontsLoaded || fontError) && !isAuthLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, isAuthLoading]);
  useEffect(() => {
    const userId = user?._id ?? user?.id;
    if (!userId) return;
    const socket = io(BASE_URL, { query: { userId }, transports: ['websocket'] });
    socket.on('notification:new', (notification: any) => {
      addNotification(notification);
      Toast.show({ type: 'info', text1: notification.title, text2: notification.message });
    });
    return () => { socket.disconnect(); };
  }, [user?._id]);
  
  // Prevent rendering until both assets and auth state are ready.
  if ((!fontsLoaded && !fontError) || isAuthLoading) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <AppStack />
          <Toast config={toastConfig} />
        </ThemeProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

// Shared QueryClient for the app — created once per process.
const queryClient = new QueryClient();