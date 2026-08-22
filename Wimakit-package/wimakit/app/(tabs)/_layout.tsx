import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store';

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isSeller = user?.role === 'seller';
  const isRider = user?.role === 'rider';
  const isAdmin = user?.role === 'admin';

  // Base content height for the bar itself, independent of the device's
  // home-indicator / gesture-bar inset. Adding insets.bottom on top (rather
  // than relying on the fixed 8px paddingBottom) is what keeps icons and
  // labels from sitting cramped against the bottom edge on notched devices,
  // while still giving non-notched devices (insets.bottom === 0) a sensible
  // minimum of 8px breathing room.
  const BAR_CONTENT_HEIGHT = 52;
  const bottomPadding = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: BAR_CONTENT_HEIGHT + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 6,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          paddingVertical: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="home-variant-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="compass-outline" color={color} size={size} /> }} />

      {/* Conditionally rendering <Tabs.Screen> with && produces a stray
          `false` child whenever the condition is falsy, which is what threw
          "Layout children must be of type Screen, all other children are
          ignored" on every render. Expo Router's own recommended pattern is
          to always render every Tabs.Screen and toggle visibility with
          `href: null` instead — that's what all of the below now do. */}
      <Tabs.Screen name="seller-dashboard" options={{ href: isSeller ? undefined : null, title: 'Dashboard', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="rider-tab" options={{ href: isRider ? undefined : null, title: 'Dashboard', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="bike" color={color} size={size} /> }} />
      {/* The full admin command center lives outside this tab group at
          app/admin/index.tsx, so it can't be declared as a Tabs.Screen here
          (name="admin/index" never matched anything in this folder — it was
          a dead entry that silently did nothing). admin-portal.tsx is the
          "Executive Overview" dashboard within this group; it links into
          /admin's modules. */}
      <Tabs.Screen name="admin-portal" options={{ href: isAdmin ? undefined : null, title: 'Admin', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="shield-account" color={color} size={size} /> }} />

      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="receipt" color={color} size={size} /> }} />
      <Tabs.Screen name="profile-tab" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} /> }} />

      {/* These are redirects and should not be visible in the tab bar */}
      <Tabs.Screen name="cart-tab" options={{ href: null }} />
      <Tabs.Screen name="community-tab" options={{ href: null }} />
      {/* users.tsx (seller/rider approval queue) is admin-only and reached
          by push from the admin command center — not a bottom tab. Without
          this, Expo Router auto-includes any undeclared file in this folder
          as a raw, unstyled tab, which is why "users" was showing up in the
          tab bar with no icon/label for every role, including guests. */}
      <Tabs.Screen name="users" options={{ href: null }} />
      {/* Same auto-tab issue as users.tsx above: notifications.tsx is pushed
          to from the home bell icon and the profile menu, not a bottom tab,
          so it must be explicitly hidden here or Expo Router will render it
          as an unstyled extra tab. There used to be a second, stale copy of
          this screen at app/notifications.tsx (mismatched data shape, dead
          local-state-only mark-as-read) which collided with this file on
          the same /notifications path — it has been removed. */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}