// This is a mock file to prevent server-side rendering crashes for expo-font.

export function useFonts() {
  // Return a tuple that indicates fonts are "loaded" with no error.
  return [true, null];
}

export function resetServerContext() {
  // This function is called by Expo Router during SSR. We can safely make it a no-op.
}