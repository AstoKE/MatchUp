import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, eventInput, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { anonClient, closeDb, db, deleteCreatedUsers, rest, type TestUser } from './helpers';
import { getStack } from './stack';

/**
 * Phase 8 / M3 through the real Storage API and PostgREST: who can upload, read (sign) and delete a profile photo, and
 * that gender stays private. The app makes exactly these calls (features/profile/api/avatar-api.ts).
 */
let c: Catalog;
const admins: string[] = [];

beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  // Append-only (a trigger refuses): the rows stay, as in admin-api.test.
  await db()
    .query(`delete from public.moderation_actions where actor_id = any($1)`, [admins])
    .catch(() => undefined);
  await db().query(`delete from public.platform_admins where user_id = any($1)`, [admins]);
  await deleteCreatedUsers();
  await closeDb();
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(64).fill(0), 0xff, 0xd9]);

function storage(path: string, init: RequestInit & { token?: string } = {}) {
  const { apiUrl, anonKey } = getStack();
  const { token, headers, ...rest } = init;
  return fetch(`${apiUrl}/storage/v1${path}`, {
    ...rest,
    headers: {
      apikey: anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
}

const photoName = (userId: string) => `${userId}/${randomUUID()}.jpg`;

async function upload(
  token: string | undefined,
  name: string,
  body: BodyInit = JPEG,
  type = 'image/jpeg',
) {
  return (
    await storage(`/object/avatars/${name}`, {
      method: 'POST',
      token,
      headers: { 'content-type': type },
      body,
    })
  ).status;
}

async function sign(token: string | undefined, name: string) {
  const response = await storage(`/object/sign/avatars/${name}`, {
    method: 'POST',
    token,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  return response.status;
}

async function remove(token: string, names: string[]) {
  await storage('/object/avatars', {
    method: 'DELETE',
    token,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prefixes: names }),
  });
}

async function exists(name: string) {
  const { rows } = await db().query(
    `select 1 from storage.objects where bucket_id = 'avatars' and name = $1`,
    [name],
  );
  return rows.length === 1;
}

/** An onboarded person with a photo set on their profile. */
async function withPhoto(name = 'Fotoğraflı') {
  const owner = await onboardedUser(c, name);
  const path = photoName(owner.user.id);
  expect(await upload(owner.token, path)).toBe(200);
  const set = await rpc('set_my_avatar_photo', { p_path: path }, owner.token);
  expect(set.status).toBe(200);
  return { ...owner, path };
}

async function visibleToEveryone(userId: string) {
  await db().query(
    `update public.user_settings set profile_visibility = 'EVERYONE' where user_id = $1`,
    [userId],
  );
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret: string, at = Date.now()) {
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase())
    bits += BASE32.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

async function adminWithSecondFactor() {
  const person = await onboardedUser(c, 'Yönetici');
  await db().query(`insert into public.platform_admins (user_id) values ($1)`, [person.user.id]);
  admins.push(person.user.id);
  const client = anonClient();
  const user: TestUser = person.user;
  await client.auth.signInWithPassword({ email: user.email, password: user.password });
  const enrolled = await client.auth.mfa.enroll({ factorType: 'totp' });
  const factorId = enrolled.data!.id;
  const challenge = await client.auth.mfa.challenge({ factorId });
  const verified = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data!.id,
    code: totp(enrolled.data!.totp.secret),
  });
  expect(verified.error).toBeNull();
  return { ...person, aal1: person.token, aal2: verified.data!.access_token };
}

describe('uploading a photo', () => {
  it('goes only into one’s own folder, as a JPEG of at most 1 MB, three objects at a time', async () => {
    const me = await onboardedUser(c, 'Yükleyen');
    const other = await onboardedUser(c, 'Başkası');
    // The Storage API answers a refused row with 400 (its body says 403).
    expect(await upload(me.token, photoName(other.user.id))).not.toBe(200);
    expect(await upload(undefined, photoName(me.user.id))).not.toBe(200);
    expect(await upload(me.token, `${me.user.id}/avatar.png`)).not.toBe(200);
    expect(await upload(me.token, photoName(me.user.id), JPEG, 'image/png')).not.toBe(200);
    expect(await upload(me.token, photoName(me.user.id), new Uint8Array(1_100_000))).not.toBe(200);
    for (let i = 0; i < 3; i++) expect(await upload(me.token, photoName(me.user.id))).toBe(200);
    expect(await upload(me.token, photoName(me.user.id))).not.toBe(200);
  });

  it('cannot overwrite an existing object', async () => {
    const me = await onboardedUser(c, 'Üzerine');
    const name = photoName(me.user.id);
    expect(await upload(me.token, name)).toBe(200);
    const again = await storage(`/object/avatars/${name}`, {
      method: 'POST',
      token: me.token,
      headers: { 'content-type': 'image/jpeg', 'x-upsert': 'true' },
      body: JPEG,
    });
    expect(again.status).not.toBe(200);
  });
});

describe('pointing the profile at a photo', () => {
  it('accepts only an existing object in one’s own folder, and returns the one it replaces', async () => {
    const me = await onboardedUser(c, 'Gösteren');
    const other = await withPhoto('Diğer');
    expect((await rpc('set_my_avatar_photo', { p_path: other.path }, me.token)).body).toMatchObject(
      {
        message: 'VALIDATION_FAILED',
      },
    );
    expect(
      (await rpc('set_my_avatar_photo', { p_path: photoName(me.user.id) }, me.token)).body,
    ).toMatchObject({ message: 'VALIDATION_FAILED' });

    const first = photoName(me.user.id);
    const second = photoName(me.user.id);
    expect(await upload(me.token, first)).toBe(200);
    expect(await upload(me.token, second)).toBe(200);
    expect((await rpc('set_my_avatar_photo', { p_path: first }, me.token)).body).toBeNull();
    expect((await rpc('set_my_avatar_photo', { p_path: second }, me.token)).body).toBe(first);
  });

  it('allows a limited number of photo changes a day', async () => {
    const me = await onboardedUser(c, 'Sık değiştiren');
    await db().query(
      `insert into private.avatar_uploads (user_id) select $1 from generate_series(1, 10)`,
      [me.user.id],
    );
    const name = photoName(me.user.id);
    expect(await upload(me.token, name)).toBe(200);
    expect((await rpc('set_my_avatar_photo', { p_path: name }, me.token)).body).toMatchObject({
      message: 'QUOTA_EXCEEDED',
    });
  });
});

describe('seeing a photo', () => {
  it('follows the profile rule: everyone for a public profile, peers otherwise, never a blocked person', async () => {
    const owner = await withPhoto();
    const stranger = await onboardedUser(c, 'Yabancı');
    // The default visibility is event peers only.
    expect(await sign(owner.token, owner.path)).toBe(200);
    expect(await sign(stranger.token, owner.path)).not.toBe(200);
    expect(await sign(undefined, owner.path)).not.toBe(200);

    await visibleToEveryone(owner.user.id);
    expect(await sign(stranger.token, owner.path)).toBe(200);

    expect(
      (await rpc('block_user', { p_user_id: stranger.user.id }, owner.token)).status,
    ).toBeLessThan(300);
    expect(await sign(stranger.token, owner.path)).not.toBe(200);
  });

  it('lets an event peer see a private profile’s photo', async () => {
    const owner = await withPhoto('Düzenleyen');
    const made = await rpc(
      'create_event',
      { p_client_request_id: randomUUID(), p_input: eventInput(c), p_publish: true },
      owner.token,
    );
    const player = await onboardedUser(c, 'Oyuncu');
    expect(await sign(player.token, owner.path)).not.toBe(200);
    expect((await rpc('request_join', { p_event_id: made.body }, player.token)).body).toBe(
      'REQUESTED',
    );
    expect(await sign(player.token, owner.path)).toBe(200);
  });

  it('shows others only the current photo, never a replaced one', async () => {
    const owner = await withPhoto();
    await visibleToEveryone(owner.user.id);
    const viewer = await onboardedUser(c, 'İzleyen');
    const next = photoName(owner.user.id);
    expect(await upload(owner.token, next)).toBe(200);
    await rpc('set_my_avatar_photo', { p_path: next }, owner.token);
    expect(await sign(viewer.token, owner.path)).not.toBe(200);
    expect(await sign(viewer.token, next)).toBe(200);
    expect(await sign(owner.token, owner.path)).toBe(200);
  });

  it('puts the avatar in the player card and the event page, the photo path only for signed-in people', async () => {
    const owner = await withPhoto('Kartlı');
    await visibleToEveryone(owner.user.id);
    await rpc('set_my_avatar', { p_avatar_key: 'f-tennis' }, owner.token);
    const photo = photoName(owner.user.id);
    expect(await upload(owner.token, photo)).toBe(200);
    await rpc('set_my_avatar_photo', { p_path: photo }, owner.token);
    const viewer = await onboardedUser(c, 'Bakan');
    const card = await rpc('get_player_card', { p_user_id: owner.user.id }, viewer.token);
    expect(card.body).toMatchObject({ avatar_key: 'f-tennis', avatar_path: photo });

    const made = await rpc(
      'create_event',
      { p_client_request_id: randomUUID(), p_input: eventInput(c), p_publish: true },
      owner.token,
    );
    const signedIn = await rpc('get_event', { p_event_id: made.body }, viewer.token);
    expect(signedIn.body).toMatchObject({
      organizer_avatar_key: 'f-tennis',
      organizer_avatar_path: photo,
    });
    const guest = await rpc('get_event', { p_event_id: made.body });
    expect(guest.body).toMatchObject({
      organizer_avatar_key: 'f-tennis',
      organizer_avatar_path: null,
    });
  });
});

describe('deleting a photo', () => {
  it('is the owner’s or a second-factor administrator’s, never anybody else’s', async () => {
    const owner = await withPhoto();
    const stranger = await onboardedUser(c, 'Silmeye çalışan');
    await remove(stranger.token, [owner.path]);
    expect(await exists(owner.path)).toBe(true);

    const admin = await adminWithSecondFactor();
    await remove(admin.aal1, [owner.path]);
    expect(await exists(owner.path)).toBe(true);
    await remove(admin.aal2, [owner.path]);
    expect(await exists(owner.path)).toBe(false);

    const mine = await withPhoto('Kendi silen');
    await remove(mine.token, [mine.path]);
    expect(await exists(mine.path)).toBe(false);
    expect((await rpc('clear_my_avatar_photo', {}, mine.token)).status).toBe(204);
  });

  it('an administrator removes a photo from a profile with a note, recorded, only with a second factor', async () => {
    const owner = await withPhoto('Kaldırılan');
    const admin = await adminWithSecondFactor();
    expect(
      (
        await rpc(
          'admin_remove_avatar_photo',
          { p_user_id: owner.user.id, p_note: 'Uygunsuz' },
          admin.aal1,
        )
      ).body,
    ).toMatchObject({ message: 'MFA_REQUIRED' });
    const removed = await rpc(
      'admin_remove_avatar_photo',
      { p_user_id: owner.user.id, p_note: 'Uygunsuz fotoğraf' },
      admin.aal2,
    );
    expect(removed.body).toBe(owner.path);
    const { rows } = await db().query<{ avatar_path: string | null; actions: string }>(
      `select p.avatar_path,
              (select count(*)::text from public.moderation_actions m
                where m.target_id = p.id and m.action = 'AVATAR_REMOVED') as actions
         from public.profiles p where p.id = $1`,
      [owner.user.id],
    );
    expect(rows[0]).toEqual({ avatar_path: null, actions: '1' });
  });
});

describe('gender and the drawing', () => {
  it('gender is the person’s own: readable through get_my_avatar, never as a column', async () => {
    const me = await onboardedUser(c, 'Cinsiyetli');
    const other = await onboardedUser(c, 'Meraklı');
    await visibleToEveryone(me.user.id);
    expect((await rpc('set_my_gender', { p_gender: 'FEMALE' }, me.token)).status).toBe(204);
    expect((await rpc('get_my_avatar', {}, me.token)).body).toMatchObject({ gender: 'FEMALE' });

    const asColumn = await rest(`/profiles?select=gender&id=eq.${me.user.id}`, {
      token: other.token,
    });
    expect(asColumn.status).toBeGreaterThanOrEqual(400);
    const own = await rest(`/profiles?select=gender&id=eq.${me.user.id}`, { token: me.token });
    expect(own.status).toBeGreaterThanOrEqual(400);
    const key = await rest(`/profiles?select=avatar_key&id=eq.${me.user.id}`, {
      token: other.token,
    });
    expect(key.status).toBe(200);
    expect((await rpc('set_my_gender', { p_gender: null }, me.token)).body).toMatchObject({
      message: 'VALIDATION_FAILED',
    });
  });

  it('accepts only known drawings, and a drawing replaces the photo', async () => {
    const me = await withPhoto('Çizimli');
    expect(
      (await rpc('set_my_avatar', { p_avatar_key: 'x-unknown' }, me.token)).body,
    ).toMatchObject({
      message: 'VALIDATION_FAILED',
    });
    expect((await rpc('set_my_avatar', { p_avatar_key: 'm-table-tennis' }, me.token)).status).toBe(
      204,
    );
    expect((await rpc('get_my_avatar', {}, me.token)).body).toMatchObject({
      avatar_key: 'm-table-tennis',
      avatar_path: null,
    });
  });

  it('the purge forgets the gender, the drawing and the photo reference', async () => {
    const me = await withPhoto('Silinen');
    await rpc('set_my_gender', { p_gender: 'MALE' }, me.token);
    await db().query(
      `update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() - interval '31 days'
        where id = $1`,
      [me.user.id],
    );
    const { rows } = await db().query<{ purged: boolean }>(
      `select private.purge_account($1) as purged`,
      [me.user.id],
    );
    expect(rows[0]!.purged).toBe(true);
    const after = await db().query(
      `select gender, avatar_key, avatar_path from public.profiles where id = $1`,
      [me.user.id],
    );
    expect(after.rows[0]).toEqual({ gender: null, avatar_key: null, avatar_path: null });
  });
});
