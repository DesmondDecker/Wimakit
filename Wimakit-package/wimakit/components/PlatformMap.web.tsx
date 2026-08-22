import React from 'react';
import { View, Text } from 'react-native';

export type PlatformMapProps = {
  style?: any;
  children?: React.ReactNode;
};

export function PlatformMap({ style }: PlatformMapProps) {
  return (
    <View style={[{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }, style]}>
      <Text style={{ textAlign: 'center' }}>Map preview is not available on web.</Text>
    </View>
  );
}

export function PlatformMapMarker() {
  return null;
}

export function PlatformMapUrlTile() {
  return null;
}
