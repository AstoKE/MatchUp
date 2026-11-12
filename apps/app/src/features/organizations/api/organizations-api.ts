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
  // Optional: sent from migration 20261119100000 on (M2).
  membership: z.optional(z.nullable(z.enum(['ACTIVE', 'INVITED', 'REQUESTED']))),
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
  /** The caller's own state: a member, invited, or waiting on their request. */
  membership: Membership;
}

export type Membership = 'ACTIVE' | 'INVITED' | 'REQUESTED' | null;

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
      membership: o.membership ?? 'ACTIVE',
    })),
  };
}

/** How many count toward the limit: owned ones that wait or are active. */
export const ownedCount = (items: readonly Organization[]) =>
  items.filter((o) => o.role === 'OWNER' && o.status !== 'REJECTED' && o.membership === 'ACTIVE')
    .length;

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

// ---- the page and membership (M2) ----------------------------------------------------------------------------------
const personRow = z.object({
  user_id: z.uuid(),
  display_name: z.nullable(z.string()),
  avatar_key: z.nullable(z.string()),
  avatar_path: z.nullable(z.string()),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
  status: z.enum(['ACTIVE', 'INVITED', 'REQUESTED']),
  since: z.string(),
});
export interface OrganizationPerson {
  userId: string;
  displayName: string | null;
  avatarKey: string | null;
  avatarPath: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  status: 'ACTIVE' | 'INVITED' | 'REQUESTED';
}
const person = (p: z.infer<typeof personRow>): OrganizationPerson => ({
  userId: p.user_id,
  displayName: p.display_name,
  avatarKey: p.avatar_key,
  avatarPath: p.avatar_path,
  role: p.role,
  status: p.status,
});

export interface OrganizationPage {
  id: string;
  name: string;
  description: string | null;
  cityId: string;
  sportIds: string[];
  memberCount: number;
  /** The caller's active role, null when not a member. */
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | null;
  membership: Membership;
  leaders: OrganizationPerson[];
  /** Members only. */
  members: OrganizationPerson[] | null;
  /** Owner and administrators only: requests and invitations. */
  waiting: OrganizationPerson[] | null;
}

export async function fetchOrganization(id: string): Promise<OrganizationPage> {
  const { data, error } = await supabase.rpc('get_organization', { p_id: id });
  if (error) throw mapRpcError(error);
  const o = z
    .object({
      id: z.uuid(),
      name: z.string(),
      description: z.nullable(z.string()),
      city_id: z.uuid(),
      sport_ids: z.array(z.uuid()),
      member_count: z.number(),
      role: z.nullable(z.enum(['OWNER', 'ADMIN', 'MEMBER'])),
      membership: z.nullable(z.enum(['ACTIVE', 'INVITED', 'REQUESTED'])),
      leaders: z.array(personRow),
      members: z.nullable(z.array(personRow)),
      waiting: z.nullable(z.array(personRow)),
    })
    .parse(data);
  return {
    id: o.id,
    name: o.name,
    description: o.description,
    cityId: o.city_id,
    sportIds: o.sport_ids,
    memberCount: o.member_count,
    role: o.role,
    membership: o.membership,
    leaders: o.leaders.map(person),
    members: o.members ? o.members.map(person) : null,
    waiting: o.waiting ? o.waiting.map(person) : null,
  };
}

async function done(result: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await result;
  if (error) throw mapRpcError(error as Parameters<typeof mapRpcError>[0]);
}
const status = async (result: PromiseLike<{ data: unknown; error: unknown }>) => {
  const { data, error } = await result;
  if (error) throw mapRpcError(error as Parameters<typeof mapRpcError>[0]);
  return z.enum(['ACTIVE', 'INVITED', 'REQUESTED']).parse(data);
};

export const requestToJoin = (org: string) =>
  status(supabase.rpc('request_to_join_organization', { p_org: org }));
export const respondToInvite = (org: string, accept: boolean) =>
  done(supabase.rpc('respond_to_organization_invite', { p_org: org, p_accept: accept }));
export const decideJoinRequest = (org: string, user: string, accept: boolean) =>
  done(supabase.rpc('decide_organization_request', { p_org: org, p_user: user, p_accept: accept }));
export const leaveOrganization = (org: string) =>
  done(supabase.rpc('leave_organization', { p_org: org }));
export const removeMember = (org: string, user: string) =>
  done(supabase.rpc('remove_organization_member', { p_org: org, p_user: user }));
export const setMemberRole = (org: string, user: string, role: 'ADMIN' | 'MEMBER') =>
  done(supabase.rpc('set_organization_role', { p_org: org, p_user: user, p_role: role }));
export const transferOwnership = (org: string, user: string) =>
  done(supabase.rpc('transfer_organization_ownership', { p_org: org, p_user: user }));

// ---- events (M3) ------------------------------------------------------------------------------------------------------
export interface OrganizationEvent {
  id: string;
  title: string;
  startsAt: string;
  approvedCount: number;
  capacity: number;
}

/** Upcoming public events shown under the organization, soonest first. */
export async function fetchOrganizationEvents(org: string): Promise<OrganizationEvent[]> {
  const { data, error } = await supabase.rpc('list_organization_events', { p_org: org });
  if (error) throw mapRpcError(error);
  return z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        starts_at: z.string(),
        approved_count: z.number(),
        capacity: z.number(),
      }),
    )
    .parse(data)
    .map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      approvedCount: e.approved_count,
      capacity: e.capacity,
    }));
}
