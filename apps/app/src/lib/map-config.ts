import { env } from './env';

/**
 * The tile provider's style (ADR-0024 §3), or null when none is configured: then no map is offered anywhere. In lib, not
 * in features/map, so a screen can ask whether there is a map without loading the map code into the first load.
 */
export const mapStyleUrl: string | null = env.EXPO_PUBLIC_MAP_STYLE_URL ?? null;
