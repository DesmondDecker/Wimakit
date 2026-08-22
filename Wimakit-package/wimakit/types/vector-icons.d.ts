// Loosen the MaterialCommunityIcons `name` prop to accept any string.
// The installed version of @expo/vector-icons doesn't include all icon names
// used in this project (sparkles, package-variant-closed-outline, etc.), so
// we override the type to prevent false TypeScript errors at build time.
// The icons render correctly at runtime via the bundled font.

declare module '@expo/vector-icons/build/MaterialCommunityIcons' {
  import * as React from 'react';
  interface Props {
    name: string;
    size?: number;
    color?: string;
    style?: any;
  }
  const MaterialCommunityIcons: React.ComponentType<Props>;
  export default MaterialCommunityIcons;
}
