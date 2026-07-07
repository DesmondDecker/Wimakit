import { Redirect } from 'expo-router';
import { useAuthStore } from '../store';

/**
 * This is the root entry point of the app. It immediately redirects the user
 * to the main tab navigator if they are logged in, or to the welcome screen
 * if they are not.
 */
export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return <Redirect href={isAuthenticated ? '/(tabs)' : '/(auth)/welcome'} />;
}
