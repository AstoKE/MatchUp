import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, codeOf, onboardedUser, rpc, type Catalog } from './event-fixtures';
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
});
