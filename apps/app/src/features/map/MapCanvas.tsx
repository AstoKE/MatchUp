import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { View } from 'react-native';
import { TOUCH_TARGET, useTheme } from '@/ui';
import type { MapCanvasProps, MapMarker } from './types';

/** The native map (MapLibre Native). Needs a development build: the module is native code. */
export default function MapCanvas({
  styleUrl,
  center,
  zoom,
  markers,
  onPressMarker,
  onPressMap,
  accessibilityLabel,
  height,
}: MapCanvasProps) {
  const { radius } = useTheme();
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{ height, borderRadius: radius.lg, overflow: 'hidden' }}
    >
      <Map
        style={{ flex: 1 }}
        mapStyle={styleUrl}
        attribution
        logo={false}
        touchRotate={false}
        touchPitch={false}
        onPress={(event) => {
          const [lon, lat] = event.nativeEvent.lngLat;
          onPressMap?.({ lat, lon });
        }}
      >
        <Camera center={[center.lon, center.lat]} zoom={zoom} />
        {markers.map((m) => (
          <Marker
            key={m.id}
            id={m.id}
            lngLat={[m.point.lon, m.point.lat]}
            onPress={() => onPressMarker?.(m.id)}
          >
            <Dot marker={m} />
          </Marker>
        ))}
      </Map>
    </View>
  );
}

function Dot({ marker }: { marker: MapMarker }) {
  const { colors } = useTheme();
  const area = marker.kind === 'area';
  const size = area ? 56 : 24;
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={marker.label}
      hitSlop={area ? 0 : (TOUCH_TARGET - size) / 2}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: area ? 2 : 3,
        borderColor: marker.kind === 'choice' ? colors.textPrimary : colors.actionPrimary,
        backgroundColor: area ? colors.selected : colors.actionPrimary,
        opacity: area ? 0.7 : 1,
      }}
    />
  );
}
