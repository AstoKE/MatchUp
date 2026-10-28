import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, eventInput, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { closeDb, deleteCreatedUsers } from './helpers';

/**
 * Phase 3 / M3. Guest-readable discovery over the real Data API (PostgREST, real JWTs): what an
 * unauthenticated visitor and a signed-in user get from `search_events`, and that bad input is a stable
 * domain error instead of a 500. Row-level rules are covered by pgTAP (08_search_events).
 */
interface Item {
  id: string;
  title: string;
  place_label: string | null;
  organizer_name: string | null;
  [key: string]: unknown;
}
interface Result {
  items: Item[];
  next_cursor: { starts_at: string; id: string } | null;
}

let c: Catalog;
let token: string;
const titles = { open: '', hidden: '', draft: '', invite: '' };
const ids: Record<keyof typeof titles, string> = { open: '', hidden: '', draft: '', invite: '' };

/** A window around the fixtures keeps leftovers from other runs out of the way. */
const win = (over: Record<string, unknown> = {}) => ({
  from: new Date(Date.now() + 1.5 * 86_400_000).toISOString(),
  to: new Date(Date.now() + 2.5 * 86_400_000).toISOString(),
  limit: 50,
  ...over,
});
const search = (filters: unknown, cursor?: unknown, jwt?: string) =>
  rpc('search_events', { p_filters: filters, p_cursor: cursor ?? null }, jwt);
const mine = (items: Item[]) => items.filter((i) => i.title.startsWith(`IT-${tag} `));

const tag = randomUUID().slice(0, 8);

beforeAll(async () => {
  c = await catalog();
  ({ token } = await onboardedUser(c, 'Entegrasyon Düzenleyen'));
  const create = async (
    key: keyof typeof titles,
    extra: Record<string, unknown>,
    publish: boolean,
  ) => {
    titles[key] = `IT-${tag} ${key}`;
    const made = await rpc(
      'create_event',
      {
        p_client_request_id: randomUUID(),
        p_input: eventInput(c, { title: titles[key], ...extra }),
        p_publish: publish,
      },
      token,
    );
    expect(made.status).toBe(200);
    ids[key] = made.body as string;
  };
  await create('open', {}, true);
  await create(
    'hidden',
    { location_visibility: 'APPROVED_ONLY', address_text: 'Gizli sokak 1' },
    true,
  );
  await create('draft', {}, false);
  await create('invite', { visibility: 'INVITE_ONLY' }, true);
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

describe('search_events over the Data API', () => {
  it('guests list the published public events, nothing else', async () => {
    const { status, body } = await search(win());
    expect(status).toBe(200);
    const found = mine((body as Result).items).map((i) => i.title);
    expect(found.sort()).toEqual([titles.hidden, titles.open].sort());
  });

  it('never leaks the hidden place, the address, the invite token or the organizer id', async () => {
    const { body } = await search(win());
    const items = mine((body as Result).items);
    const hidden = items.find((i) => i.title === titles.hidden)!;
    expect(hidden.place_label).toBeNull();
    expect(items.find((i) => i.title === titles.open)!.place_label).toBe('ODTÜ Halı Saha 2');
    const raw = JSON.stringify(items);
    expect(raw).not.toContain('Gizli sokak');
    expect(raw).not.toContain('invite_token');
    expect(raw).not.toContain('organizer_id');
    expect(items[0]!.organizer_name).toBe('Entegrasyon Düzenleyen');
  });

  it('signed-in users get the same public view', async () => {
    const { status, body } = await search(win(), undefined, token);
    expect(status).toBe(200);
    expect(
      mine((body as Result).items)
        .map((i) => i.title)
        .sort(),
    ).toEqual([titles.hidden, titles.open].sort());
  });

  it('applies filters on the server', async () => {
    const none = await search(
      win({ only_open: true, time_of_day: [], skill_level: 5, sport_ids: [randomUUID()] }),
    );
    expect(mine((none.body as Result).items)).toEqual([]);
    const byDistrict = await search(win({ district_ids: [c.district] }));
    expect(mine((byDistrict.body as Result).items)).toHaveLength(2);
  });

  it('pages with a cursor without repeating or skipping events', async () => {
    const first = (await search(win({ limit: 1 }))).body as Result;
    expect(first.items).toHaveLength(1);
    expect(first.next_cursor).not.toBeNull();
    const seen = new Set(first.items.map((i) => i.id));
    let cursor = first.next_cursor;
    let guard = 0;
    while (cursor && guard++ < 100) {
      const next = (await search(win({ limit: 1 }), cursor)).body as Result;
      for (const item of next.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = next.next_cursor;
    }
    expect(seen.has(ids.open)).toBe(true);
    expect(seen.has(ids.hidden)).toBe(true);
    expect(seen.has(ids.draft)).toBe(false);
    expect(seen.has(ids.invite)).toBe(false);
  });

  it('caps the page size at 50', async () => {
    const { status, body } = await search({ limit: 100000 });
    expect(status).toBe(200);
    expect((body as Result).items.length).toBeLessThanOrEqual(50);
  });

  it.each([
    ['a malformed id', { city_id: 'nope' }],
    ['a page size of zero', { limit: 0 }],
    ['an unknown part of the day', { time_of_day: ['NIGHT'] }],
    ['a level above 5', { skill_level: 6 }],
    ['too many sports', { sport_ids: Array.from({ length: 11 }, () => randomUUID()) }],
  ])('rejects %s with VALIDATION_FAILED', async (_name, filters) => {
    const { status, body } = await search(filters);
    expect(status).toBe(400);
    expect((body as { message: string }).message).toBe('VALIDATION_FAILED');
  });

  it('rejects a cursor that is not an object', async () => {
    const { status, body } = await search({}, 'abc');
    expect(status).toBe(400);
    expect((body as { message: string }).message).toBe('VALIDATION_FAILED');
  });
});
