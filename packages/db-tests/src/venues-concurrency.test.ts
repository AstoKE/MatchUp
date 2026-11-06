import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fulfilled, rejected, runConcurrently } from './concurrency';
import { actAs, catalog, codeOf, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { closeDb, db, deleteCreatedUsers } from './helpers';

/**
 * Phase 4 / M4. The daily suggestion limit and the "same name nearby is the same venue" rule both read what other calls
 * just wrote: parallel connections must neither pass the limit nor store a copy.
 */
let c: Catalog;
let football: string;
const suggesters: string[] = [];
beforeAll(async () => {
  c = await catalog();
  const { rows } = await db().query<{ id: string }>(
    `select id from public.sports where slug = 'football'`,
  );
  football = rows[0]!.id;
});
afterAll(async () => {
  await db().query(`delete from public.venues where submitted_by = any($1)`, [suggesters]);
  await deleteCreatedUsers();
  await closeDb();
});

// A letters-only tag from the user id: six digits in a row would make a name look like a phone number, which
// suggest_venue refuses on purpose.
const tag = (id: string) => id.slice(0, 6).replace(/\d/g, (d) => 'ghijklmnop'[Number(d)]!);

const venue = (name: string, lat = 39.895) => ({
  kind: 'COMMERCIAL_FACILITY',
  name,
  city_id: c.city,
  district_id: c.district,
  point: { lat, lon: 32.7795 },
  sport_ids: [football],
});

describe('suggesting venues under concurrency', () => {
  it('six suggestions of one place at once store one, and all get its id', async () => {
    const me = await onboardedUser(c, 'Mekan Öneren');
    suggesters.push(me.user.id);
    const name = `Eşzamanlı Saha ${tag(me.user.id)}`;
    const results = await runConcurrently(6, async ({ client, barrier }) => {
      await actAs(client, me.user.id);
      await barrier();
      const { rows } = await client.query<{ id: string }>(`select public.suggest_venue($1) as id`, [
        venue(name),
      ]);
      return rows[0]!.id;
    });
    expect(rejected(results)).toEqual([]);
    expect(new Set(fulfilled(results)).size).toBe(1);
  });

  it('the daily limit holds when suggestions arrive at once', async () => {
    const me = await onboardedUser(c, 'Çok Öneren');
    suggesters.push(me.user.id);
    // Six different places, a few hundred metres apart; five fit in a day.
    const results = await runConcurrently(6, async ({ client, index, barrier }) => {
      await actAs(client, me.user.id);
      await barrier();
      await client.query(`select public.suggest_venue($1)`, [
        venue(`Saha ${index} ${tag(me.user.id)}`, 39.895 + index * 0.004),
      ]);
    });
    expect(fulfilled(results)).toHaveLength(5);
    for (const failure of rejected(results)) expect(codeOf(failure)).toBe('QUOTA_EXCEEDED');
    const listed = await rpc('search_venues', {
      p_filters: { city_id: c.city, q: tag(me.user.id) },
    });
    expect(listed.status).toBe(200);
    expect((listed.body as { items: unknown[] }).items).toHaveLength(5);
  });
});
