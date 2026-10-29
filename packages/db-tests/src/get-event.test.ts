import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, eventInput, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { closeDb, db, deleteCreatedUsers } from './helpers';

/**
 * Phase 3 completion over the real Data API: what a guest, a stranger, a requester and the organizer get
 * from `get_event`, and that an invite-only event is reachable only with its token. Row-level detail is
 * covered by pgTAP (11_get_event).
 */
let c: Catalog;
let host: { token: string; user: { id: string } };
let player: { token: string; user: { id: string } };
let stranger: { token: string; user: { id: string } };
const ids = { open: '', invite: '' };
let inviteToken = '';

const get = (id: string, token?: string, invite?: string) =>
  rpc('get_event', { p_event_id: id, ...(invite ? { p_invite_token: invite } : {}) }, token);
type Page = Record<string, unknown> & { private: unknown; participants: unknown };

beforeAll(async () => {
  c = await catalog();
  host = await onboardedUser(c, 'Düzenleyen');
  player = await onboardedUser(c, 'Oyuncu');
  stranger = await onboardedUser(c, 'Yabancı');
  const make = async (extra: Record<string, unknown>) => {
    const made = await rpc(
      'create_event',
      {
        p_client_request_id: randomUUID(),
        p_input: eventInput(c, { address_text: 'Gizli sokak 9', ...extra }),
        p_publish: true,
      },
      host.token,
    );
    expect(made.status).toBe(200);
    return made.body as string;
  };
  ids.open = await make({ title: 'IT açık' });
  ids.invite = await make({ title: 'IT davetli', visibility: 'INVITE_ONLY' });
  const { rows } = await db().query<{ invite_token: string }>(
    'select invite_token from public.events where id = $1',
    [ids.invite],
  );
  inviteToken = rows[0]!.invite_token;
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

describe('get_event over the Data API', () => {
  it('serves a public event to a guest without private details, the roster or the organizer id', async () => {
    const { status, body } = await get(ids.open);
    expect(status).toBe(200);
    const page = body as Page;
    expect(page.title).toBe('IT açık');
    expect(page.private).toBeNull();
    expect(page.participants).toBeNull();
    expect(page.organizer_name).toBe('Düzenleyen');
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('Gizli sokak');
    expect(raw).not.toContain(host.user.id);
    expect(raw).not.toContain('invite_token":"');
  });

  it('does not exist without the token for an invite-only event, for guests and signed-in users alike', async () => {
    for (const token of [undefined, stranger.token]) {
      for (const invite of [undefined, 'wrong', '0'.repeat(64)]) {
        const { status, body } = await get(ids.invite, token, invite);
        expect(status).toBe(200);
        expect(body).toBeNull();
      }
    }
  });

  it('opens with the right token, and never echoes it', async () => {
    const { body } = await get(ids.invite, undefined, inviteToken);
    expect((body as Page).title).toBe('IT davetli');
    expect(JSON.stringify(body)).not.toContain(inviteToken);
  });

  it('gives the token back only to the organizer', async () => {
    expect(((await get(ids.invite, host.token)).body as Page).invite_token).toBe(inviteToken);
    expect(((await get(ids.open, host.token)).body as Page).invite_token).toBeNull();
    expect(
      ((await get(ids.invite, stranger.token, inviteToken)).body as Page).invite_token,
    ).toBeNull();
  });

  it('refuses a request on an invite-only event without the token and accepts it with the token', async () => {
    const without = await rpc('request_join', { p_event_id: ids.invite }, player.token);
    expect(without.status).toBe(400);
    expect((without.body as { message: string }).message).toBe('NOT_FOUND');
    const wrong = await rpc(
      'request_join',
      { p_event_id: ids.invite, p_invite_token: 'wrong' },
      player.token,
    );
    expect((wrong.body as { message: string }).message).toBe('NOT_FOUND');
    const ok = await rpc(
      'request_join',
      { p_event_id: ids.invite, p_invite_token: inviteToken },
      player.token,
    );
    expect(ok).toEqual({ status: 200, body: 'REQUESTED' });
    // The three-argument call installed apps make still works (and on a public event needs no token).
    const legacy = await rpc('request_join', { p_event_id: ids.open }, player.token);
    expect(legacy).toEqual({ status: 200, body: 'REQUESTED' });
  });

  it('shows a requester their status but not the place or the roster until approved', async () => {
    const page = (await get(ids.open, player.token)).body as Page;
    expect(page.my_status).toBe('REQUESTED');
    expect(page.private).toBeNull();
    expect(page.participants).toBeNull();
  });

  it('shows the place and the roster after approval, and the organizer the roster at once', async () => {
    const { rows } = await db().query<{ id: string }>(
      'select id from public.event_participations where event_id = $1 and user_id = $2',
      [ids.open, player.user.id],
    );
    const approved = await rpc(
      'approve_participation',
      { p_participation_id: rows[0]!.id },
      host.token,
    );
    expect(approved.status).toBe(204);
    const mine = (await get(ids.open, player.token)).body as Page;
    expect(mine.my_status).toBe('APPROVED');
    expect((mine.private as { address_text: string }).address_text).toBe('Gizli sokak 9');
    expect(mine.participants).toEqual([{ display_name: 'Oyuncu' }]);
    const organizers = (await get(ids.open, host.token)).body as Page;
    expect(organizers.participants).toEqual([{ display_name: 'Oyuncu' }]);
    // Still nothing for someone who is not part of it.
    expect(((await get(ids.open, stranger.token)).body as Page).private).toBeNull();
  });

  it('answers null (not an error) for an unknown event', async () => {
    expect(await get(randomUUID())).toEqual({ status: 200, body: null });
  });
});
