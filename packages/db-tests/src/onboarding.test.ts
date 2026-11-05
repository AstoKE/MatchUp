import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeDb,
  createUser,
  db,
  deleteCreatedUsers,
  rest,
  signedInClient,
  type TestUser,
} from './helpers';

/**
 * Phase 2 over real HTTP (PostgREST + a real JWT): the catalog for guests, the onboarding gate for
 * accounts created through the raw Auth API (no app involved), consent evidence, and races.
 */
interface RpcError {
  code?: string;
  message?: string;
}

async function rpc(name: string, args: unknown, token?: string) {
  const response = await rest(`/rpc/${name}`, {
    method: 'POST',
    token,
    body: JSON.stringify(args),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
}

async function ids() {
  const sports = (await (await rest('/sports?select=id,slug')).json()) as {
    id: string;
    slug: string;
  }[];
  const positions = (await (await rest('/sport_positions?select=id,slug,sport_id')).json()) as {
    id: string;
    slug: string;
    sport_id: string;
  }[];
  const cities = (await (await rest('/cities?select=id,slug')).json()) as {
    id: string;
    slug: string;
  }[];
  const districts = (await (await rest('/districts?select=id,slug')).json()) as {
    id: string;
    slug: string;
  }[];
  const sport = (slug: string) => sports.find((s) => s.slug === slug)!.id;
  return {
    sport,
    position: (sportSlug: string, slug: string) =>
      positions.find((p) => p.sport_id === sport(sportSlug) && p.slug === slug)!.id,
    city: cities.find((c) => c.slug === 'ankara')!.id,
    district: districts.find((d) => d.slug === 'cankaya')!.id,
  };
}

function onboardingArgs(
  overrides: Record<string, unknown>,
  catalog: Awaited<ReturnType<typeof ids>>,
) {
  return {
    p_adult_confirmed: true,
    p_terms_version: 'draft-0.1',
    p_privacy_version: 'draft-0.1',
    p_marketing_consent: false,
    p_display_name: 'Test Kullanıcı',
    p_city_id: catalog.city,
    p_district_id: catalog.district,
    p_sports: [{ sport_id: catalog.sport('football'), level: 3, position_ids: [] }],
    ...overrides,
  };
}

describe('reference catalog over the Data API', () => {
  afterAll(closeDb);

  it('is readable by guests (ADR-0013) and bilingual', async () => {
    const response = await rest('/sports?select=slug,names&order=sort_order');
    expect(response.status).toBe(200);
    const rows = (await response.json()) as { slug: string; names: { tr: string; en: string } }[];
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ slug: 'football', names: { tr: 'Futbol', en: 'Football' } });
    // A table read stops at PostgREST's max_rows; the app reads the 973 districts through catalog_places.
    expect((await (await rest('/districts?select=id')).json()) as unknown[]).toHaveLength(100);
    const places = (await (
      await rest('/rpc/catalog_places', { method: 'POST', body: '{}' })
    ).json()) as { slug: string; districts: unknown[] }[];
    expect(places).toHaveLength(81);
    expect(places.reduce((sum, c) => sum + c.districts.length, 0)).toBe(973);
    expect(places.find((c) => c.slug === 'ankara')?.districts).toHaveLength(25);
  });

  it.each(['sports', 'sport_formats', 'sport_positions', 'cities', 'districts'])(
    'is not writable by guests: %s',
    async (table) => {
      const response = await rest(`/${table}`, {
        method: 'POST',
        body: JSON.stringify({ slug: 'evil' }),
      });
      expect([401, 403]).toContain(response.status);
    },
  );

  it.each([
    'complete_onboarding',
    'update_my_profile',
    'update_my_settings',
    'set_marketing_consent',
    'set_sport_profile',
    'remove_sport_profile',
    'replace_my_sport_profiles',
  ])('rpc/%s is not callable by guests', async (name) => {
    const { status } = await rpc(name, {});
    expect([401, 403, 404]).toContain(status);
  });

  it.each([
    'assert_onboarded_user',
    'profile_is_public',
    'clean_display_name',
    'assert_location',
    'upsert_sport_profile',
    'apply_sport_selection',
  ])('private helper %s is not routable', async (name) => {
    const { status } = await rpc(name, {});
    expect([401, 403, 404]).toContain(status);
  });
});

describe('onboarding gate (account created through the raw Auth API, no app involved)', () => {
  let user: TestUser;
  let token: string;
  let catalog: Awaited<ReturnType<typeof ids>>;

  beforeAll(async () => {
    catalog = await ids();
    user = await createUser();
    token = (await signedInClient(user)).accessToken;
  });
  afterAll(async () => {
    await deleteCreatedUsers();
    await closeDb();
  });

  it('starts not onboarded and cannot use gated RPCs', async () => {
    const account = await rpc('get_my_account', {}, token);
    expect(account.body).toMatchObject([{ adult_confirmed: false, onboarded: false }]);
    const attempt = await rpc(
      'update_my_profile',
      { p_display_name: 'Sneaky', p_bio: null, p_city_id: null, p_district_id: null },
      token,
    );
    expect(attempt.status).toBe(400);
    expect(attempt.body as RpcError).toMatchObject({
      code: 'P0001',
      message: 'ONBOARDING_REQUIRED',
    });
  });

  it('rejects under-18 / unconfirmed users and records nothing', async () => {
    const result = await rpc(
      'complete_onboarding',
      onboardingArgs({ p_adult_confirmed: false }, catalog),
      token,
    );
    expect(result.body as RpcError).toMatchObject({ message: 'ADULT_CONFIRMATION_REQUIRED' });
    const { rows } = await db().query(
      'select (select count(*) from public.user_consents where user_id = $1)::int as consents, (select adult_confirmed_at from public.profiles where id = $1) as adult',
      [user.id],
    );
    expect(rows[0]).toEqual({ consents: 0, adult: null });
  });

  it('rejects an outdated consent version', async () => {
    const result = await rpc(
      'complete_onboarding',
      onboardingArgs({ p_terms_version: 'old' }, catalog),
      token,
    );
    expect(result.body as RpcError).toMatchObject({ message: 'CONSENT_VERSION_MISMATCH' });
  });

  it("rejects another sport's position (composite foreign key + RPC check)", async () => {
    const result = await rpc(
      'complete_onboarding',
      onboardingArgs(
        {
          p_sports: [
            {
              sport_id: catalog.sport('football'),
              level: 3,
              position_ids: [catalog.position('basketball', 'center')],
            },
          ],
        },
        catalog,
      ),
      token,
    );
    expect(result.body as RpcError).toMatchObject({ message: 'VALIDATION_FAILED' });
  });

  it('survives ten simultaneous submissions: one account state, exactly two consent rows', async () => {
    const args = onboardingArgs(
      {
        p_marketing_consent: true,
        p_sports: [
          {
            sport_id: catalog.sport('football'),
            level: 3.5,
            position_ids: [catalog.position('football', 'goalkeeper')],
          },
        ],
      },
      catalog,
    );
    const results = await Promise.all(
      Array.from({ length: 10 }, () => rpc('complete_onboarding', args, token)),
    );
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(204));

    const { rows } = await db().query(
      `select
         (select count(*) from public.user_consents where user_id = $1 and kind = 'TERMS')::int as terms,
         (select count(*) from public.user_consents where user_id = $1 and kind = 'PRIVACY_NOTICE')::int as privacy,
         (select count(*) from public.user_consents where user_id = $1 and kind = 'MARKETING')::int as marketing,
         (select count(*) from public.user_sport_profiles where user_id = $1)::int as sports,
         (select count(*) from public.user_sport_positions where user_id = $1)::int as positions`,
      [user.id],
    );
    expect(rows[0]).toEqual({ terms: 1, privacy: 1, marketing: 1, sports: 1, positions: 1 });
    expect((await rpc('get_my_account', {}, token)).body).toMatchObject([
      { onboarded: true, adult_confirmed: true },
    ]);
  });

  it('keeps one consistent sport profile under simultaneous level changes', async () => {
    const levels = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 2];
    const results = await Promise.all(
      levels.map((level) =>
        rpc(
          'set_sport_profile',
          { p_sport_id: catalog.sport('tennis'), p_level: level, p_position_ids: [] },
          token,
        ),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(204));
    const { rows } = await db().query<{ n: number; level: number }>(
      'select count(*)::int as n, min(self_assessed_level)::float as level from public.user_sport_profiles where user_id = $1 and sport_id = $2',
      [user.id, catalog.sport('tennis')],
    );
    expect(rows[0]?.n).toBe(1);
    expect(levels).toContain(rows[0]?.level);
  });

  it('replaces sport profiles atomically, and parallel saves never mix two requests', async () => {
    const sets = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 2].map((level) => [
      { sport_id: catalog.sport('tennis'), level, position_ids: [] },
      { sport_id: catalog.sport('padel'), level, position_ids: [] },
    ]);
    const results = await Promise.all(
      sets.map((p_sports) => rpc('replace_my_sport_profiles', { p_sports }, token)),
    );
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(204));

    const { rows } = await db().query<{ slug: string; level: number }>(
      `select s.slug, u.self_assessed_level::float as level
         from public.user_sport_profiles u join public.sports s on s.id = u.sport_id
        where u.user_id = $1 order by s.slug`,
      [user.id],
    );
    // football (from onboarding) was removed; tennis and padel come from the SAME request.
    expect(rows.map((r) => r.slug)).toEqual(['padel', 'tennis']);
    expect(rows[0]?.level).toBe(rows[1]?.level);

    const bad = await rpc(
      'replace_my_sport_profiles',
      { p_sports: [{ sport_id: catalog.sport('tennis'), level: 99, position_ids: [] }] },
      token,
    );
    expect(bad.body as RpcError).toMatchObject({ message: 'VALIDATION_FAILED' });
    const after = await db().query(
      'select count(*)::int as n from public.user_sport_profiles where user_id = $1',
      [user.id],
    );
    expect((after.rows[0] as { n: number }).n).toBe(2);
  });

  it('maps validation failures to a stable code the app can localize', async () => {
    const result = await rpc(
      'update_my_profile',
      { p_display_name: 'x', p_bio: null, p_city_id: null, p_district_id: null },
      token,
    );
    expect(result.status).toBe(400);
    expect(result.body as RpcError).toMatchObject({ code: 'P0001', message: 'VALIDATION_FAILED' });
  });
});

describe('legal re-consent gate over the Data API', () => {
  // Bumping app_config would race the other files' onboarding tests, so the outdated state is made
  // per user instead: revoking this user's acceptance has the same effect on the gate.
  let user: TestUser;
  let token: string;

  beforeAll(async () => {
    const catalog = await ids();
    user = await createUser();
    token = (await signedInClient(user)).accessToken;
    const onboarded = await rpc('complete_onboarding', onboardingArgs({}, catalog), token);
    expect(onboarded.status).toBe(204);
  });
  afterAll(async () => {
    await deleteCreatedUsers();
    await closeDb();
  });

  const setMarketing = () => rpc('set_marketing_consent', { p_granted: false }, token);
  const accept = (terms = 'draft-0.1', privacy = 'draft-0.1', as = token) =>
    rpc('accept_current_legal_terms', { p_terms_version: terms, p_privacy_version: privacy }, as);

  it('reports consent as current right after onboarding', async () => {
    expect((await rpc('get_my_account', {}, token)).body).toMatchObject([
      { onboarded: true, legal_consent_current: true },
    ]);
    expect((await setMarketing()).status).toBe(204);
  });

  it('blocks writes with CONSENT_REQUIRED once the acceptance is no longer current', async () => {
    await db().query(
      `update public.user_consents set revoked_at = now() where user_id = $1 and kind = 'PRIVACY_NOTICE'`,
      [user.id],
    );
    expect((await rpc('get_my_account', {}, token)).body).toMatchObject([
      { onboarded: true, legal_consent_current: false },
    ]);
    const blocked = await setMarketing();
    expect(blocked.status).toBe(400);
    expect(blocked.body as RpcError).toMatchObject({ code: 'P0001', message: 'CONSENT_REQUIRED' });
  });

  it('refuses guests and versions the user was not shown', async () => {
    const guest = await rest('/rpc/accept_current_legal_terms', {
      method: 'POST',
      body: JSON.stringify({ p_terms_version: 'draft-0.1', p_privacy_version: 'draft-0.1' }),
    });
    expect([401, 403]).toContain(guest.status);
    expect((await accept('old', 'draft-0.1')).body as RpcError).toMatchObject({
      message: 'CONSENT_VERSION_MISMATCH',
    });
    expect((await setMarketing()).body as RpcError).toMatchObject({ message: 'CONSENT_REQUIRED' });
  });

  it('survives ten simultaneous acceptances: one active row per kind, writes open again', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => accept()));
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(204));
    const { rows } = await db().query(
      `select kind::text, count(*)::int as n, count(*) filter (where revoked_at is null)::int as active
         from public.user_consents
        where user_id = $1 and kind in ('TERMS', 'PRIVACY_NOTICE') and version = 'draft-0.1'
        group by kind order by kind`,
      [user.id],
    );
    expect(rows).toEqual([
      { kind: 'PRIVACY_NOTICE', n: 1, active: 1 },
      { kind: 'TERMS', n: 1, active: 1 },
    ]);
    expect((await rpc('get_my_account', {}, token)).body).toMatchObject([
      { legal_consent_current: true },
    ]);
    expect((await setMarketing()).status).toBe(204);
  });
});

describe('profile visibility over the Data API', () => {
  let owner: TestUser;
  let stranger: TestUser;
  let ownerToken: string;
  let strangerToken: string;

  beforeAll(async () => {
    const catalog = await ids();
    owner = await createUser();
    stranger = await createUser();
    ownerToken = (await signedInClient(owner)).accessToken;
    strangerToken = (await signedInClient(stranger)).accessToken;
    for (const [token, name] of [
      [ownerToken, 'Owner Person'],
      [strangerToken, 'Stranger Person'],
    ] as const) {
      const r = await rpc(
        'complete_onboarding',
        onboardingArgs({ p_display_name: name }, catalog),
        token,
      );
      expect(r.status).toBe(204);
    }
  });
  afterAll(async () => {
    await deleteCreatedUsers();
    await closeDb();
  });

  const visibleToStranger = async () =>
    (await (
      await rest(`/profiles?select=id,display_name&id=eq.${owner.id}`, { token: strangerToken })
    ).json()) as {
      display_name: string;
    }[];

  it('is private by default, public only when the owner chooses EVERYONE', async () => {
    expect(await visibleToStranger()).toEqual([]);
    const set = await rpc(
      'update_my_settings',
      {
        p_locale: 'tr',
        p_theme: 'system',
        p_profile_visibility: 'EVERYONE',
        p_show_reliability: true,
        p_show_badges: true,
      },
      ownerToken,
    );
    expect(set.status).toBe(204);
    expect(await visibleToStranger()).toEqual([{ id: owner.id, display_name: 'Owner Person' }]);
    await rpc(
      'update_my_settings',
      {
        p_locale: 'tr',
        p_theme: 'system',
        p_profile_visibility: 'EVENT_PEERS',
        p_show_reliability: true,
        p_show_badges: true,
      },
      ownerToken,
    );
    expect(await visibleToStranger()).toEqual([]);
  });

  it('never exposes moderation or onboarding columns to API users', async () => {
    const response = await rest(`/profiles?select=account_status&id=eq.${owner.id}`, {
      token: ownerToken,
    });
    expect([401, 403]).toContain(response.status);
    const star = await rest('/profiles?select=*', { token: ownerToken });
    expect([401, 403]).toContain(star.status);
  });
});
