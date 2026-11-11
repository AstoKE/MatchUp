import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

/** Phase 9 (ADR-0030): organizations, created on request and approved by an administrator. */
export const ORGANIZATION_NAME_MAX = 40;
export const ORGANIZATION_DESCRIPTION_MAX = 500;
export const ORGANIZATION_SPORTS_MAX = 5;

const organizationRow = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.nullable(z.string()),
  city_id: z.uuid(),
  sport_ids: z.array(z.uuid()),
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED']),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
  reject_reason: z.nullable(z.string()),
  created_at: z.string(),
  decided_at: z.nullable(z.string()),
  member_count: z.number(),
});

export interface Organization {
  id: string;
  name: string;
  description: string | null;
  cityId: string;
  sportIds: string[];
  status: 'PENDING' | 'ACTIVE' | 'REJECTED';
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  rejectReason: string | null;
  createdAt: string;
  memberCount: number;
}

export interface MyOrganizations {
  items: Organization[];
  /** How many a person may own, waiting requests included. */
  maxOwned: number;
}

export async function fetchMyOrganizations(): Promise<MyOrganizations> {
  const { data, error } = await supabase.rpc('list_my_organizations');
  if (error) throw mapRpcError(error);
  const page = z.object({ items: z.array(organizationRow), max_owned: z.number() }).parse(data);
  return {
    maxOwned: page.max_owned,
    items: page.items.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      cityId: o.city_id,
      sportIds: o.sport_ids,
      status: o.status,
      role: o.role,
      rejectReason: o.reject_reason,
      createdAt: o.created_at,
      memberCount: o.member_count,
    })),
  };
}

/** How many count toward the limit: owned ones that wait or are active. */
export const ownedCount = (items: readonly Organization[]) =>
  items.filter((o) => o.role === 'OWNER' && o.status !== 'REJECTED').length;

export async function requestOrganization(input: {
  name: string;
  description: string | null;
  cityId: string;
  sportIds: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('request_organization', {
    p_name: input.name,
    p_description: input.description ?? '',
    p_city_id: input.cityId,
    p_sport_ids: input.sportIds,
  });
  if (error) throw mapRpcError(error);
  return z.uuid().parse(data);
}

export async function cancelOrganizationRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_organization_request', { p_id: id });
  if (error) throw mapRpcError(error);
}
