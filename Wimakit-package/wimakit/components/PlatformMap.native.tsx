import React from 'react';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import type { ViewStyle } from 'react-native';

export type PlatformMapProps = React.ComponentProps<typeof MapView> & {
  style?: ViewStyle;
};

export function PlatformMap(props: PlatformMapProps) {
  return <MapView {...props}>{props.children}</MapView>;
}

export const PlatformMapMarker = Marker;
export const PlatformMapUrlTile = UrlTile;
