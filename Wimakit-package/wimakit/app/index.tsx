import { Redirect } from 'expo-router';
import { useAuthStore } from '../store';

/**
 * This is the root entry point of the app. It redirects the user to the
 * main tab navigator if they are logged in, or to the welcome screen if
 * they are not.
 *
 * `isLoading` starts `true` and only flips once `initializeAuth()` (kicked
 * off in the root layout) has finished reading AsyncStorage. Redirecting
 * off `isAuthenticated` before that resolves meant every cold start briefly
 * used the hardcoded default (`isAuthenticated: false`), so a logged-in
 * user got redirected to /(auth)/welcome before their real session was
 * restored a moment later — this is what showed up as "random Home
 * kickback" / sessions not surviving app restart. Returning `null` while
 * loading keeps the splash screen up (see app/_layout.tsx) instead of
 * rendering a route decision made on incomplete information.
 */
export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) return null;

  return <Redirect href={isAuthenticated ? '/(tabs)' : '/(auth)/welcome'} />;
}
