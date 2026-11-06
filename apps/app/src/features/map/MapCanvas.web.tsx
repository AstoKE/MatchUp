import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/ui';
import type { MapCanvasProps } from './types';

// The worker is copied next to the app by scripts/copy-map-worker.mjs (Metro cannot bundle a module worker).
maplibregl.setWorkerUrl(
  new URL(`/vendor/maplibre-gl-worker-${maplibregl.getVersion()}.mjs`, globalThis.location.origin)
    .href,
);

/**
 * The web map (MapLibre GL JS), in its own lazy chunk. Markers are real <button>s with the event's name, so they are in
 * the tab order and read by screen readers; the provider's attribution stays visible (ADR-0011, ADR-0024).
 */
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
  const { colors, radius } = useTheme();
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  // The latest callbacks, read from listeners registered once.
  const handlers = useRef({ onPressMarker, onPressMap });
  useEffect(() => {
    handlers.current = { onPressMarker, onPressMap };
  });

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: styleUrl,
      center: [center.lon, center.lat],
      zoom,
      attributionControl: { compact: false },
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('click', (event) =>
      handlers.current.onPressMap?.({ lat: event.lngLat.lat, lon: event.lngLat.lng }),
    );
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // Created once per style; the camera and markers follow below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  useEffect(() => {
    map.current?.jumpTo({ center: [center.lon, center.lat], zoom });
  }, [center.lat, center.lon, zoom]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const placed = markers.map((marker) => {
      const area = marker.kind === 'area';
      const size = area ? 56 : 24;
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', marker.label);
      el.title = marker.label;
      Object.assign(el.style, {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        border: `${area ? 2 : 3}px solid ${marker.kind === 'choice' ? colors.textPrimary : colors.actionPrimary}`,
        background: area ? colors.selected : colors.actionPrimary,
        opacity: area ? '0.7' : '1',
        padding: '0',
        cursor: 'pointer',
      });
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        handlers.current.onPressMarker?.(marker.id);
      });
      return new maplibregl.Marker({ element: el })
        .setLngLat([marker.point.lon, marker.point.lat])
        .addTo(m);
    });
    return () => placed.forEach((p) => p.remove());
  }, [markers, colors]);

  return (
    <View
      role="region"
      aria-label={accessibilityLabel}
      style={{ height, borderRadius: radius.lg, overflow: 'hidden' }}
    >
      <div ref={container} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}
