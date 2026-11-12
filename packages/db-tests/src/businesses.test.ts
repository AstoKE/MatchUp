import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, codeOf, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { closeDb, db, deleteCreatedUsers, rest } from './helpers';

/**
 * Phase 10 / M1 (ADR-0031): the business request through the real API. The review with the second factor, export and
 * purge are in pgTAP 39_businesses.
 */
let c: Catalog;
let venue: string;
beforeAll(async () => {
  c = await catalog();
  const { rows } = await db().query<{ id: string }>(
    `insert into public.venues (kind, name, city_id, district_id, location, provenance)
     values ('COMMERCIAL_FACILITY', 'Entegrasyon Halı Saha ' || gen_random_uuid(), $1, $2,
             extensions.st_setsrid(extensions.st_makepoint(32.78, 39.90), 4326)::extensions.geography, 'ADMIN_CURATED')
     returning id`,
    [c.city, c.district],
  );
  venue = rows[0]!.id;
});
afterAll(async () => {
  await db().query(
    `delete from public.businesses where created_by in (select id from public.profiles where display_name like 'İşletmeci%')`,
  );
  await db().query(`delete from public.venues where id = $1`, [venue]);
  await deleteCreatedUsers();
  await closeDb();
});

const ask = (token: string, name: string, venues: string[]) =>
  rpc(
    'request_business',
    {
      p_name: name,
      p_city_id: c.city,
      p_contact_phone: '05321112233',
      p_contact_email: '',
      p_message: '',
      p_venue_ids: venues,
    },
    token,
  );

describe('business requests', () => {
  it('waits for review with its claimed venue; a second claim on the venue is refused', async () => {
    const a = await onboardedUser(c, 'İşletmeci A');
    const b = await onboardedUser(c, 'İşletmeci B');
    const first = await ask(a.token, 'Yıldız Spor', [venue]);
    expect(first.status).toBe(200);
    const mine = await rpc('list_my_businesses', {}, a.token);
    const items = (mine.body as { items: { status: string; venues: { id: string }[] }[] }).items;
    expect(items[0]?.status).toBe('PENDING');
    expect(items[0]?.venues.map((v) => v.id)).toEqual([venue]);
    const second = await ask(b.token, 'Başka Spor', [venue]);
    expect(codeOf(second.body)).toBe('VENUE_CLAIMED');
    expect((await rpc('cancel_business_request', { p_id: first.body }, a.token)).status).toBe(204);
    expect((await ask(b.token, 'Başka Spor', [venue])).status).toBe(200);
  });

  it('is not readable through the Data API, and refused to guests and to players in the console', async () => {
    const a = await onboardedUser(c, 'İşletmeci C');
    for (const table of ['businesses', 'business_members', 'business_venues']) {
      expect((await rest(`/${table}?select=*`, { token: a.token })).status).toBeGreaterThanOrEqual(
        400,
      );
    }
    const guest = await rpc('request_business', {
      p_name: 'Misafir',
      p_city_id: c.city,
      p_contact_phone: '05321112233',
      p_contact_email: '',
      p_message: '',
      p_venue_ids: [],
    });
    expect([401, 403]).toContain(guest.status);
    const review = await rpc('admin_list_business_requests', {}, a.token);
    expect(codeOf(review.body)).toBe('NOT_ALLOWED');
  });

  it('a venue shows the business that runs it, and nothing before approval (M2)', async () => {
    const a = await onboardedUser(c, 'İşletmeci D');
    const { rows } = await db().query<{ id: string }>(
      `insert into public.venues (kind, name, city_id, district_id, location, provenance)
       values ('COMMERCIAL_FACILITY', 'Gösterilen Saha ' || gen_random_uuid(), $1, $2,
               extensions.st_setsrid(extensions.st_makepoint(32.78, 39.90), 4326)::extensions.geography, 'ADMIN_CURATED')
       returning id`,
      [c.city, c.district],
    );
    const shown = rows[0]!.id;
    const made = await ask(a.token, 'Gösterilen Spor', [shown]);
    expect((await rpc('get_venue_business', { p_venue_id: shown }, a.token)).body).toBeNull();
    await db().query(
      `update public.businesses set status = 'ACTIVE', decided_at = now() where id = $1`,
      [made.body],
    );
    const after = await rpc('get_venue_business', { p_venue_id: shown }, a.token);
    expect((after.body as { name: string }).name).toBe('Gösterilen Spor');
    await db().query(`delete from public.businesses where id = $1`, [made.body]);
    await db().query(`delete from public.venues where id = $1`, [shown]);
  });
});
