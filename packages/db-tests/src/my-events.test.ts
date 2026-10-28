import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, eventInput, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { closeDb, deleteCreatedUsers } from './helpers';

/**
 * Phase 3 / M3b. `list_my_events` over the real Data API: an organizer finds their draft and their
 * published event, nobody else does, guests cannot call it, bad input is a stable domain error.
 * Bucket rules for participants are covered by pgTAP (09_list_my_events).
 */
interface Item {
  id: string;
  title: string;
  status: string;
  my_status: string;
  pending_count: number | null;
}
interface Result {
  items: Item[];
  next_cursor: { starts_at: string; id: string } | null;
}

let c: Catalog;
let owner: string;
let other: string;
const ids = { draft: '', published: '' };
const list = (bucket: string, token?: string, cursor?: unknown, limit?: number) =>
  rpc(
    'list_my_events',
    { p_bucket: bucket, p_cursor: cursor ?? null, ...(limit ? { p_limit: limit } : {}) },
    token,
  );

beforeAll(async () => {
  c = await catalog();
  owner = (await onboardedUser(c, 'Düzenleyen')).token;
  other = (await onboardedUser(c, 'Başkası')).token;
  const make = async (title: string, publish: boolean) => {
    const made = await rpc(
      'create_event',
      {
        p_client_request_id: randomUUID(),
        p_input: eventInput(c, { title }),
        p_publish: publish,
      },
      owner,
    );
    expect(made.status).toBe(200);
    return made.body as string;
  };
  ids.draft = await make('IT taslak', false);
  ids.published = await make('IT yayında', true);
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

describe('list_my_events over the Data API', () => {
  it('lists my draft and my published event under ORGANIZING', async () => {
    const { status, body } = await list('ORGANIZING', owner);
    expect(status).toBe(200);
    const items = (body as Result).items;
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining([ids.draft, ids.published]));
    const draft = items.find((i) => i.id === ids.draft)!;
    expect(draft).toMatchObject({ status: 'DRAFT', my_status: 'ORGANIZER', pending_count: 0 });
    expect(items.find((i) => i.id === ids.published)).toMatchObject({ status: 'PUBLISHED' });
  });

  it("never shows another user's events or drafts", async () => {
    for (const bucket of ['ORGANIZING', 'PENDING', 'APPROVED', 'WAITLISTED', 'PAST']) {
      const { status, body } = await list(bucket, other);
      expect(status).toBe(200);
      expect((body as Result).items).toEqual([]);
    }
  });

  it('puts a canceled event under PAST, not ORGANIZING', async () => {
    const gone = await rpc(
      'create_event',
      {
        p_client_request_id: randomUUID(),
        p_input: eventInput(c, { title: 'IT iptal' }),
        p_publish: true,
      },
      owner,
    );
    const id = gone.body as string;
    const canceled = await rpc('cancel_event', { p_event_id: id, p_reason: 'WEATHER' }, owner);
    expect(canceled.status).toBe(204);
    const past = ((await list('PAST', owner)).body as Result).items.map((i) => i.id);
    const upcoming = ((await list('ORGANIZING', owner)).body as Result).items.map((i) => i.id);
    expect(past).toContain(id);
    expect(upcoming).not.toContain(id);
  });

  it('pages with a cursor', async () => {
    const first = (await list('ORGANIZING', owner, null, 1)).body as Result;
    expect(first.items).toHaveLength(1);
    expect(first.next_cursor).not.toBeNull();
    const second = (await list('ORGANIZING', owner, first.next_cursor, 1)).body as Result;
    expect(second.items).toHaveLength(1);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
  });

  it('is not callable without a session', async () => {
    const { status } = await list('ORGANIZING');
    expect([401, 403]).toContain(status);
  });

  it.each([
    ['an unknown bucket', { p_bucket: 'EVERYTHING' }],
    ['a page size of zero', { p_bucket: 'PAST', p_limit: 0 }],
    ['a malformed cursor', { p_bucket: 'PAST', p_cursor: { starts_at: 'x', id: 'y' } }],
  ])('rejects %s with VALIDATION_FAILED', async (_name, args) => {
    const { status, body } = await rpc('list_my_events', args, owner);
    expect(status).toBe(400);
    expect((body as { message: string }).message).toBe('VALIDATION_FAILED');
  });
});
