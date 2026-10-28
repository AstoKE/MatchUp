import type pg from 'pg';
import { expect } from 'vitest';
import { createUser, db, rest, signedInClient, type TestUser } from './helpers';

/** Shared by the Phase 3 integration tests: an RPC caller, catalog ids, a valid event and an onboarded user. */
export async function rpc(name: string, args: unknown, token?: string) {
  const response = await rest(`/rpc/${name}`, {
    method: 'POST',
    token,
    body: JSON.stringify(args),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
}

export interface Catalog {
  sport: string;
  format: string;
  city: string;
  district: string;
}

export async function catalog(): Promise<Catalog> {
  const { rows } = await db().query<Catalog>(
    `select s.id as sport, f.id as format, c.id as city, d.id as district
       from public.sports s
       join public.sport_formats f on f.sport_id = s.id and f.slug = '5v5'
       cross join public.cities c
       join public.districts d on d.city_id = c.id and d.slug = 'cankaya'
      where s.slug = 'football' and c.slug = 'ankara'`,
  );
  return rows[0]!;
}

export function eventInput(c: Catalog, overrides: Record<string, unknown> = {}) {
  return {
    sport_id: c.sport,
    sport_format_id: c.format,
    title: 'Entegrasyon maçı',
    starts_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    duration_minutes: 90,
    city_id: c.city,
    district_id: c.district,
    location_label: 'ODTÜ Halı Saha 2',
    capacity: 12,
    ...overrides,
  };
}

/** A confirmed user who has completed onboarding through the real RPC. */
export async function onboardedUser(
  c: Catalog,
  displayName = 'Entegrasyon',
): Promise<{ user: TestUser; token: string }> {
  const user = await createUser();
  const token = (await signedInClient(user)).accessToken;
  const done = await rpc(
    'complete_onboarding',
    {
      p_adult_confirmed: true,
      p_terms_version: 'draft-0.1',
      p_privacy_version: 'draft-0.1',
      p_marketing_consent: false,
      p_display_name: displayName,
      p_city_id: c.city,
      p_district_id: c.district,
      p_sports: [{ sport_id: c.sport, level: 3, position_ids: [] }],
    },
    token,
  );
  expect(done.status).toBe(204);
  return { user, token };
}

/** Inside a harness transaction: act as that user exactly like PostgREST does for a request. */
export async function actAs(client: pg.PoolClient, userId: string) {
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal1' }),
  ]);
  await client.query('set local role authenticated');
}

/** The stable domain code of a rejected harness task (the RPC raises it as the error message). */
export function codeOf(error: unknown) {
  return (error as { message?: string }).message;
}
