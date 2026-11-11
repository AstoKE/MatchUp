import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { closeDb, db, deleteCreatedUsers, rest } from './helpers';

/** ROADMAP P-22: feedback about the app through the real API. Rules and limits are in pgTAP 34_feedback. */
let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

describe('feedback', () => {
  it('is sent by a signed-in person and stored, but never read back through the Data API', async () => {
    const a = await onboardedUser(c, 'Yazar');
    const sent = await rpc(
      'submit_feedback',
      {
        p_kind: 'REQUEST',
        p_body: 'Etkinlikleri takvime eklemek istiyorum.',
        p_context: 'settings',
      },
      a.token,
    );
    expect(sent.status).toBe(200);
    const { rows } = await db().query<{ kind: string; status: string }>(
      `select kind, status from public.feedback where id = $1 and user_id = $2`,
      [sent.body, a.user.id],
    );
    expect(rows).toEqual([{ kind: 'REQUEST', status: 'NEW' }]);
    expect((await rest('/feedback?select=*', { token: a.token })).status).toBeGreaterThanOrEqual(
      400,
    );
    const guest = await rpc('submit_feedback', {
      p_kind: 'REQUEST',
      p_body: 'Misafir olarak yazıyorum.',
    });
    expect([401, 403]).toContain(guest.status);
  });

  it('is refused to a player in the console', async () => {
    const a = await onboardedUser(c, 'Meraklı');
    const answer = await rpc('admin_list_feedback', {}, a.token);
    expect(answer.status).toBe(400);
    expect(JSON.stringify(answer.body)).toContain('NOT_ALLOWED');
  });
});
