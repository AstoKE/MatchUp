import type { GeoPoint } from '@matchup/domain';

/**
 * Something drawn on the map. "pin" is a known point, "area" an approximate one (a hidden location's ~500 m cell or a
 * district centre: never drawn as if it were exact), "choice" the point being picked.
 */
export interface MapMarker {
  id: string;
  point: GeoPoint;
  kind: 'pin' | 'area' | 'choice';
  /** Accessible name; markers are buttons. */
  label: string;
}

export interface MapCanvasProps {
  styleUrl: string;
  center: GeoPoint;
  zoom: number;
  markers: readonly MapMarker[];
  onPressMarker?: (id: string) => void;
  /** A tap on the map itself, for the pin picker. */
  onPressMap?: (point: GeoPoint) => void;
  /** What the map shows, for screen readers; the same content is always reachable without the map. */
  accessibilityLabel: string;
  height: number;
}
