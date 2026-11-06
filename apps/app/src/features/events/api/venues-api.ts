import { mapRpcError, VENUE_KINDS, type GeoPoint, type VenueBrief } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';
import { pointRow } from './events-api';

const venueRow = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(VENUE_KINDS),
  city_id: z.uuid(),
  district_id: z.uuid(),
  address_text: z.nullable(z.string()),
  point: pointRow,
  verified: z.boolean(),
  sport_ids: z.array(z.uuid()),
});

/** A listed venue (Phase 4). Who suggested it is never sent. */
export interface Venue extends VenueBrief {
  cityId: string;
  districtId: string;
  addressText: string | null;
  point: GeoPoint;
  sportIds: string[];
}

export interface VenueFilters {
  cityId: string;
  districtId?: string | null;
  sportId?: string | null;
  query?: string;
}

/** Listed venues of a province, verified first; guests may search too. */
export async function searchVenues(filters: VenueFilters): Promise<Venue[]> {
  const { data, error } = await supabase.rpc('search_venues', {
    p_filters: {
      city_id: filters.cityId,
      ...(filters.districtId ? { district_id: filters.districtId } : {}),
      ...(filters.sportId ? { sport_id: filters.sportId } : {}),
      ...(filters.query?.trim() ? { q: filters.query.trim() } : {}),
      limit: 50,
    },
  });
  if (error) throw mapRpcError(error);
  return z
    .object({ items: z.array(venueRow) })
    .parse(data)
    .items.map((v) => ({
      id: v.id,
      name: v.name,
      kind: v.kind,
      verified: v.verified,
      cityId: v.city_id,
      districtId: v.district_id,
      addressText: v.address_text,
      point: v.point,
      sportIds: v.sport_ids,
    }));
}
