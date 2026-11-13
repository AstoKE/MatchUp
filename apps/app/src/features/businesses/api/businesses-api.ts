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
  // Optional: sent from migration 20261126100000 on (staff).
  membership: z.optional(z.enum(['ACTIVE', 'INVITED'])),
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
  /** The caller's own state: a member, or invited as staff. */
  membership: 'ACTIVE' | 'INVITED';
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
      membership: b.membership ?? 'ACTIVE',
    })),
  };
}

/** Owned ones that wait or are active count toward the limit. */
export const ownedCount = (items: readonly Business[]) =>
  items.filter((b) => b.role === 'OWNER' && b.status !== 'REJECTED' && b.membership === 'ACTIVE')
    .length;

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

// ---- the owner's edits (M3) -------------------------------------------------------------------------------------------
export interface OwnedVenue {
  id: string;
  name: string;
  addressText: string | null;
  verified: boolean;
  listed: boolean;
  sportIds: string[];
}
export interface StaffMember {
  userId: string;
  displayName: string | null;
  status: 'ACTIVE' | 'INVITED';
}
export interface OwnedBusiness {
  id: string;
  name: string;
  cityId: string;
  /** OWNER edits everything; STAFF edit the venues only. */
  role: 'OWNER' | 'STAFF';
  /** The owner only. */
  staff: StaffMember[] | null;
  contactPhone: string | null;
  contactEmail: string | null;
  venues: OwnedVenue[];
}

export async function fetchMyBusiness(id: string): Promise<OwnedBusiness> {
  const { data, error } = await supabase.rpc('get_my_business', { p_id: id });
  if (error) throw mapRpcError(error);
  const b = z
    .object({
      id: z.uuid(),
      name: z.string(),
      city_id: z.uuid(),
      role: z.optional(z.enum(['OWNER', 'STAFF'])),
      staff: z.optional(
        z.nullable(
          z.array(
            z.object({
              user_id: z.uuid(),
              display_name: z.nullable(z.string()),
              status: z.enum(['ACTIVE', 'INVITED']),
            }),
          ),
        ),
      ),
      contact_phone: z.nullable(z.string()),
      contact_email: z.nullable(z.string()),
      venues: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          address_text: z.nullable(z.string()),
          verified: z.boolean(),
          listed: z.boolean(),
          sport_ids: z.array(z.uuid()),
        }),
      ),
    })
    .parse(data);
  return {
    id: b.id,
    name: b.name,
    cityId: b.city_id,
    role: b.role ?? 'OWNER',
    staff: b.staff
      ? b.staff.map((m) => ({ userId: m.user_id, displayName: m.display_name, status: m.status }))
      : null,
    contactPhone: b.contact_phone,
    contactEmail: b.contact_email,
    venues: b.venues.map((v) => ({
      id: v.id,
      name: v.name,
      addressText: v.address_text,
      verified: v.verified,
      listed: v.listed,
      sportIds: v.sport_ids,
    })),
  };
}

export async function updateMyBusiness(input: {
  id: string;
  name: string;
  contactPhone: string | null;
  contactEmail: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('update_my_business', {
    p_id: input.id,
    p_name: input.name,
    p_contact_phone: input.contactPhone ?? '',
    p_contact_email: input.contactEmail ?? '',
  });
  if (error) throw mapRpcError(error);
}

export async function updateBusinessVenue(input: {
  businessId: string;
  venueId: string;
  name: string;
  addressText: string | null;
  sportIds: string[];
}): Promise<void> {
  const { error } = await supabase.rpc('update_business_venue', {
    p_business: input.businessId,
    p_venue: input.venueId,
    p_name: input.name,
    p_address: input.addressText ?? '',
    p_sport_ids: input.sportIds,
  });
  if (error) throw mapRpcError(error);
}

// ---- staff (M4) -------------------------------------------------------------------------------------------------------
export async function respondBusinessInvite(id: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_business_invite', {
    p_business: id,
    p_accept: accept,
  });
  if (error) throw mapRpcError(error);
}
export async function removeBusinessStaff(id: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_business_staff', { p_business: id, p_user: userId });
  if (error) throw mapRpcError(error);
}
export async function leaveBusiness(id: string): Promise<void> {
  const { error } = await supabase.rpc('leave_business', { p_business: id });
  if (error) throw mapRpcError(error);
}
