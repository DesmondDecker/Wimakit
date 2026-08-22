import { Redirect } from 'expo-router';

/**
 * Tab placeholder that redirects to the main Cart screen.
 * Using the <Redirect /> component is the official way to perform redirects
 * during render to avoid "navigate before mounting" errors.
 */
export default function CartTab() {
  return <Redirect href="/cart" />;
}