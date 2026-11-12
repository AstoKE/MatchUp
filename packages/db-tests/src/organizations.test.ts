import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, codeOf, eventInput, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { closeDb, db, deleteCreatedUsers, rest } from './helpers';

/**
 * Phase 9 / M1 (ADR-0030): the organization request through the real API. The review with the second factor, export and
 * purge are in pgTAP 35_organizations.
 */
let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await db().query(
    `delete from public.organizations where created_by in (select id from public.profiles where display_name like 'Kurucu%')`,
  );
  await deleteCreatedUsers();
  await closeDb();
});

const ask = (token: string, name: string) =>
  rpc(
    'request_organization',
    { p_name: name, p_description: '', p_city_id: c.city, p_sport_ids: [c.sport] },
    token,
  );

describe('organization requests', () => {
  it('waits for review, is listed for its owner, and counts toward the limit of two', async () => {
    const a = await onboardedUser(c, 'Kurucu A');
    const first = await ask(a.token, 'Birinci Kulüp');
    expect(first.status).toBe(200);
    expect((await ask(a.token, 'İkinci Kulüp')).status).toBe(200);
    const third = await ask(a.token, 'Üçüncü Kulüp');
    expect(third.status).toBe(400);
    expect(codeOf(third.body)).toBe('QUOTA_EXCEEDED');

    const mine = await rpc('list_my_organizations', {}, a.token);
    expect(mine.status).toBe(200);
    const body = mine.body as { items: { status: string; role: string }[]; max_owned: number };
    expect(body.max_owned).toBe(2);
    expect(body.items).toHaveLength(2);
    expect(body.items.every((o) => o.status === 'PENDING' && o.role === 'OWNER')).toBe(true);

    expect((await rpc('cancel_organization_request', { p_id: first.body }, a.token)).status).toBe(
      204,
    );
    expect((await ask(a.token, 'Üçüncü Kulüp')).status).toBe(200);
  });

  it('is not readable through the Data API, and refused to guests and to players in the console', async () => {
    const a = await onboardedUser(c, 'Kurucu B');
    for (const table of ['organizations', 'organization_members']) {
      expect((await rest(`/${table}?select=*`, { token: a.token })).status).toBeGreaterThanOrEqual(
        400,
      );
    }
    const guest = await rpc('request_organization', {
      p_name: 'Misafir',
      p_description: '',
      p_city_id: c.city,
      p_sport_ids: [c.sport],
    });
    expect([401, 403]).toContain(guest.status);
    const review = await rpc('admin_list_organization_requests', {}, a.token);
    expect(review.status).toBe(400);
    expect(codeOf(review.body)).toBe('NOT_ALLOWED');
  });

  it('membership through the API: invite, accept, the member list, leave (M2)', async () => {
    const owner = await onboardedUser(c, 'Kurucu C');
    const guest = await onboardedUser(c, 'Kurucu D');
    const made = await ask(owner.token, 'Üyelik Kulübü');
    await db().query(
      `update public.organizations set status = 'ACTIVE', decided_at = now() where id = $1`,
      [made.body],
    );
    const invited = await rpc(
      'invite_to_organization',
      { p_org: made.body, p_user: guest.user.id },
      owner.token,
    );
    expect(invited.body).toBe('INVITED');
    const before = await rpc('get_organization', { p_id: made.body }, guest.token);
    expect((before.body as { membership: string; members: unknown }).membership).toBe('INVITED');
    expect((before.body as { members: unknown }).members).toBeNull();
    expect(
      (
        await rpc(
          'respond_to_organization_invite',
          { p_org: made.body, p_accept: true },
          guest.token,
        )
      ).status,
    ).toBe(204);
    const after = await rpc('get_organization', { p_id: made.body }, guest.token);
    expect((after.body as { members: unknown[] }).members).toHaveLength(2);
    expect((await rpc('leave_organization', { p_org: made.body }, guest.token)).status).toBe(204);
    const owners = await rpc('leave_organization', { p_org: made.body }, owner.token);
    expect(codeOf(owners.body)).toBe('NOT_ALLOWED');
  });

  it('an event shown under the organization (M3)', async () => {
    const owner = await onboardedUser(c, 'Kurucu E');
    const made = await ask(owner.token, 'Etkinlik Kulübü');
    await db().query(
      `update public.organizations set status = 'ACTIVE', decided_at = now() where id = $1`,
      [made.body],
    );
    const event = await rpc(
      'create_event',
      { p_client_request_id: randomUUID(), p_input: eventInput(c), p_publish: true },
      owner.token,
    );
    expect(event.status).toBe(200);
    expect(
      (
        await rpc(
          'set_event_organization',
          { p_event_id: event.body, p_org: made.body },
          owner.token,
        )
      ).status,
    ).toBe(204);
    const shown = await rpc('get_event_organization', { p_event_id: event.body }, owner.token);
    expect((shown.body as { name: string }).name).toBe('Etkinlik Kulübü');
    const listed = await rpc('list_organization_events', { p_org: made.body }, owner.token);
    expect((listed.body as { id: string }[]).map((e) => e.id)).toEqual([event.body]);
    expect(
      (await rpc('set_event_organization', { p_event_id: event.body }, owner.token)).status,
    ).toBe(204);
  });
});
