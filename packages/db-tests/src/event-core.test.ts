import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fulfilled, rejected, runConcurrently } from './concurrency';
import {
  closeDb,
  createUser,
  db,
  deleteCreatedUsers,
  rest,
  signedInClient,
  type TestUser,
} from './helpers';

/**
 * Phase 3 / M1. Visibility over real HTTP (PostgREST + real JWTs). Races go through the concurrency
 * harness instead: real parallel connections released by a barrier. Through PostgREST the requests
 * start ~15–20 ms apart, more than the few-millisecond race window, so an HTTP "parallel" test passes
 * even with the protecting lock removed (measured); the harness fails in that case.
 */
async function rpc(name: string, args: unknown, token?: string) {
  const response = await rest(`/rpc/${name}`, {
    method: 'POST',
    token,
    body: JSON.stringify(args),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
}

interface Catalog {
  sport: string;
  format: string;
  city: string;
  district: string;
}

async function catalog(): Promise<Catalog> {
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

function eventInput(c: Catalog, overrides: Record<string, unknown> = {}) {
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
async function onboardedUser(c: Catalog): Promise<{ user: TestUser; token: string }> {
  const user = await createUser();
  const token = (await signedInClient(user)).accessToken;
  const done = await rpc(
    'complete_onboarding',
    {
      p_adult_confirmed: true,
      p_terms_version: 'draft-0.1',
      p_privacy_version: 'draft-0.1',
      p_marketing_consent: false,
      p_display_name: 'Entegrasyon',
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
async function actAs(client: pg.PoolClient, userId: string) {
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal1' }),
  ]);
  await client.query('set local role authenticated');
}

function codeOf(error: unknown) {
  return (error as { message?: string }).message;
}

let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

describe('event visibility over the Data API', () => {
  let eventId: string;
  let draftId: string;
  let token: string;

  beforeAll(async () => {
    ({ token } = await onboardedUser(c));
    const published = await rpc(
      'create_event',
      {
        p_client_request_id: randomUUID(),
        p_input: eventInput(c, { address_text: 'Gizli sokak 1' }),
        p_publish: true,
      },
      token,
    );
    expect(published.status).toBe(200);
    eventId = published.body as string;
    draftId = (
      await rpc(
        'create_event',
        { p_client_request_id: randomUUID(), p_input: eventInput(c) },
        token,
      )
    ).body as string;
  });

  it('guests read the published public event but not the draft', async () => {
    const response = await rest(
      `/events?select=id,title,status,approved_count&id=in.(${eventId},${draftId})`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: eventId, title: 'Entegrasyon maçı', status: 'PUBLISHED', approved_count: 1 },
    ]);
  });

  it('guests cannot read private details; another signed-in user gets no rows', async () => {
    const guest = await rest(`/event_private_details?select=*&event_id=eq.${eventId}`);
    expect([401, 403]).toContain(guest.status);
    const other = await onboardedUser(c);
    const response = await rest(`/event_private_details?select=*&event_id=eq.${eventId}`, {
      token: other.token,
    });
    expect(await response.json()).toEqual([]);
  });

  it('the organizer reads the private address', async () => {
    const response = await rest(
      `/event_private_details?select=address_text&event_id=eq.${eventId}`,
      {
        token,
      },
    );
    expect(await response.json()).toEqual([{ address_text: 'Gizli sokak 1' }]);
  });

  it('clients cannot write events directly', async () => {
    const response = await rest(`/events?id=eq.${eventId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ title: 'Doğrudan' }),
    });
    expect([401, 403]).toContain(response.status);
  });

  it('a retried create over HTTP returns the same event', async () => {
    const requestId = randomUUID();
    const first = await rpc(
      'create_event',
      { p_client_request_id: requestId, p_input: eventInput(c) },
      token,
    );
    const again = await rpc(
      'create_event',
      { p_client_request_id: requestId, p_input: eventInput(c) },
      token,
    );
    expect(again.body).toBe(first.body);
  });
});

describe('event guarantees under truly simultaneous calls (concurrency harness)', () => {
  it('ten simultaneous creates with the same client_request_id make exactly one event', async () => {
    const { user } = await onboardedUser(c);
    const requestId = randomUUID();
    const input = JSON.stringify(eventInput(c));
    const results = await runConcurrently(10, async ({ client, barrier }) => {
      await actAs(client, user.id);
      await barrier();
      const { rows } = await client.query<{ id: string }>(
        'select public.create_event($1, $2::jsonb) as id',
        [requestId, input],
      );
      return rows[0]!.id;
    });
    expect(rejected(results)).toEqual([]);
    expect(new Set(fulfilled(results)).size).toBe(1);
    const { rows } = await db().query<{ n: number }>(
      'select count(*)::int as n from public.events where organizer_id = $1',
      [user.id],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('five publishes racing for the last upcoming-event slot: exactly one wins', async () => {
    const { user, token } = await onboardedUser(c);
    for (let i = 0; i < 4; i++) {
      const r = await rpc(
        'create_event',
        { p_client_request_id: randomUUID(), p_input: eventInput(c), p_publish: true },
        token,
      );
      expect(r.status).toBe(200);
    }
    const drafts: string[] = [];
    for (let i = 0; i < 5; i++) {
      drafts.push(
        (
          await rpc(
            'create_event',
            { p_client_request_id: randomUUID(), p_input: eventInput(c) },
            token,
          )
        ).body as string,
      );
    }
    const results = await runConcurrently(5, async ({ client, index, barrier }) => {
      await actAs(client, user.id);
      await barrier();
      await client.query('select public.publish_event($1)', [drafts[index]]);
      return index;
    });
    expect(fulfilled(results)).toHaveLength(1);
    expect(rejected(results).map(codeOf)).toEqual(Array(4).fill('QUOTA_EXCEEDED'));
    const { rows } = await db().query<{ n: number }>(
      `select count(*)::int as n from public.events where organizer_id = $1 and status = 'PUBLISHED'`,
      [user.id],
    );
    expect(rows[0]?.n).toBe(5);
  });

  it('fifteen simultaneous creates against the daily quota of ten: exactly ten succeed', async () => {
    const { user } = await onboardedUser(c);
    const input = JSON.stringify(eventInput(c));
    const results = await runConcurrently(15, async ({ client, barrier }) => {
      await actAs(client, user.id);
      await barrier();
      await client.query('select public.create_event(gen_random_uuid(), $1::jsonb)', [input]);
    });
    expect(fulfilled(results)).toHaveLength(10);
    expect(rejected(results).map(codeOf)).toEqual(Array(5).fill('QUOTA_EXCEEDED'));
    const { rows } = await db().query<{ n: number }>(
      'select count(*)::int as n from public.events where organizer_id = $1',
      [user.id],
    );
    expect(rows[0]?.n).toBe(10);
  });
});
