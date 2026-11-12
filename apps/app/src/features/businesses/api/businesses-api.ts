import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

/** Phase 10 (ADR-0031): businesses, approved by an administrator, operate their commercial venues. */
export const BUSINESS_NAME_MAX = 80;
export const BUSINESS_MESSAGE_MAX = 500;
export const BUSINESS_VENUES_MAX = 10;

const businessRow = z.object({
  id: z.uuid(),
  name: z.string(),
  city_id: z.uuid(),
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED']),
  role: z.enum(['OWNER', 'STAFF']),
  reject_reason: z.nullable(z.string()),
  created_at: z.string(),
  decided_at: z.nullable(z.string()),
  venues: z.array(z.object({ id: z.uuid(), name: z.string() })),
});

export interface Business {
  id: string;
  name: string;
  cityId: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED';
  role: 'OWNER' | 'STAFF';
  rejectReason: string | null;
  createdAt: string;
  venues: { id: string; name: string }[];
}

export interface MyBusinesses {
  items: Business[];
  /** How many a person may own, waiting requests included. */
  maxOwned: number;
}

export async function fetchMyBusinesses(): Promise<MyBusinesses> {
  const { data, error } = await supabase.rpc('list_my_businesses');
  if (error) throw mapRpcError(error);
  const page = z.object({ items: z.array(businessRow), max_owned: z.number() }).parse(data);
  return {
    maxOwned: page.max_owned,
    items: page.items.map((b) => ({
      id: b.id,
      name: b.name,
      cityId: b.city_id,
      status: b.status,
      role: b.role,
      rejectReason: b.reject_reason,
      createdAt: b.created_at,
      venues: b.venues,
    })),
  };
}

/** Owned ones that wait or are active count toward the limit. */
export const ownedCount = (items: readonly Business[]) =>
  items.filter((b) => b.role === 'OWNER' && b.status !== 'REJECTED').length;

export async function requestBusiness(input: {
  name: string;
  cityId: string;
  contactPhone: string | null;
  contactEmail: string | null;
  message: string | null;
  venueIds: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('request_business', {
    p_name: input.name,
    p_city_id: input.cityId,
    p_contact_phone: input.contactPhone ?? '',
    p_contact_email: input.contactEmail ?? '',
    p_message: input.message ?? '',
    p_venue_ids: input.venueIds,
  });
  if (error) throw mapRpcError(error);
  return z.uuid().parse(data);
}

export async function cancelBusinessRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_business_request', { p_id: id });
  if (error) throw mapRpcError(error);
}

export interface ClaimableVenue {
  id: string;
  name: string;
  kind: string;
}

/** Venues in a province whose name matches, for the claim list (commercial facilities only are claimable). */
export async function searchClaimableVenues(cityId: string, q: string): Promise<ClaimableVenue[]> {
  const { data, error } = await supabase.rpc('search_venues', {
    p_filters: { city_id: cityId, q, limit: 20 },
  });
  if (error) throw mapRpcError(error);
  return z
    .object({ items: z.array(z.object({ id: z.uuid(), name: z.string(), kind: z.string() })) })
    .parse(data)
    .items.filter((v) => v.kind === 'COMMERCIAL_FACILITY');
}
