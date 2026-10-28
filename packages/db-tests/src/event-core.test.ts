import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fulfilled, rejected, runConcurrently } from './concurrency';
import { catalog, eventInput, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { closeDb, db, deleteCreatedUsers, rest } from './helpers';

/**
 * Phase 3 / M1. Visibility over real HTTP (PostgREST + real JWTs). Races go through the concurrency
 * harness instead: real parallel connections released by a barrier. Through PostgREST the requests
 * start ~15–20 ms apart, more than the few-millisecond race window, so an HTTP "parallel" test passes
 * even with the protecting lock removed (measured); the harness fails in that case.
 */

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
