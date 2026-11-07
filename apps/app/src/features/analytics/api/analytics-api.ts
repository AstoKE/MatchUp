import { supabase } from '@/lib/supabase/client';

/**
 * The usage events the server accepts (ADR-0025): names and coded properties only, never free text, coordinates or
 * other people. The server also checks every value and records nothing without the person's analytics consent.
 */
export type UsageEvent =
  | { name: 'discover_viewed'; props: { view: 'LIST' | 'MAP' } }
  | {
      name: 'filter_applied';
      props: { kind: 'SPORT' | 'DATE' | 'TIME' | 'SETTING' | 'DISTRICT' | 'OPEN' | 'CITY' };
    }
  | { name: 'event_detail_viewed'; props?: undefined }
  | { name: 'map_opened'; props: { where: 'DISCOVER' | 'PIN' | 'VENUE' } }
  | { name: 'near_me_used'; props: { result: 'OK' | 'DENIED' | 'UNAVAILABLE' } }
  | { name: 'venue_suggest_opened'; props?: undefined };

/** Fire and forget: analytics must never slow down or break what the person is doing. */
export function sendUsageEvent(event: UsageEvent): void {
  void Promise.resolve(
    supabase.rpc('track_event', { p_name: event.name, p_props: event.props ?? {} }),
  ).catch(() => undefined);
}
