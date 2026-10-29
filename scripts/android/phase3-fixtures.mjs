// Fixtures for the Phase 3 device checks: an organizer account and events, created through the real RPCs
// against the LOCAL stack (the same way apps/app/e2e/support/stack.ts does for the web E2E). The app under
// test only ever sees the public anon key; the service-role key stays in this script.
import { randomUUID } from 'node:crypto';

export function phase3Fixtures(stack) {
  const base = { apikey: stack.ANON_KEY, 'content-type': 'application/json' };
  const rest = (path) => `${stack.API_URL}/rest/v1/${path}`;

  async function createOrganizer(displayName) {
    const email = `native-host-${randomUUID().slice(0, 8)}@test.invalid`;
    const password = 'correct-horse-battery-staple';
    const created = await fetch(`${stack.API_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: stack.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!created.ok) throw new Error(`organizer create failed: ${created.status}`);
    const id = (await created.json()).id;
    const signedIn = await fetch(`${stack.API_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: base,
      body: JSON.stringify({ email, password }),
    });
    const token = (await signedIn.json()).access_token;
    const headers = { ...base, Authorization: `Bearer ${token}` };
    const first = async (path) => (await (await fetch(rest(path), { headers })).json())[0];
    const sport = await first('sports?select=id&slug=eq.football');
    const city = await first('cities?select=id&slug=eq.ankara');
    const district = await first(`districts?select=id&slug=eq.cankaya&city_id=eq.${city.id}`);
    const format = await first(`sport_formats?select=id&slug=eq.5v5&sport_id=eq.${sport.id}`);
    const rpc = async (name, body) => {
      const r = await fetch(rest(`rpc/${name}`), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`${name} failed: ${r.status} ${text}`);
      return text ? JSON.parse(text) : null;
    };
    await rpc('complete_onboarding', {
      p_adult_confirmed: true,
      p_terms_version: 'draft-0.1',
      p_privacy_version: 'draft-0.1',
      p_marketing_consent: false,
      p_display_name: displayName,
      p_city_id: null,
      p_district_id: null,
      p_sports: [{ sport_id: sport.id, level: 3, position_ids: [] }],
    });
    return {
      id,
      email,
      /** A football 5v5 in Ankara/Cankaya two days ahead, published. Returns the event id. */
      async publish(title, { autoApprove = false, inviteOnly = false } = {}) {
        return rpc('create_event', {
          p_client_request_id: randomUUID(),
          p_publish: true,
          p_input: {
            sport_id: sport.id,
            sport_format_id: format.id,
            title,
            starts_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
            duration_minutes: 90,
            city_id: city.id,
            district_id: district.id,
            location_label: 'Native Test Sahasi',
            capacity: 12,
            auto_approve: autoApprove,
            visibility: inviteOnly ? 'INVITE_ONLY' : 'PUBLIC',
          },
        });
      },
      approve: (participationId) =>
        rpc('approve_participation', { p_participation_id: participationId }),
    };
  }

  async function deleteUser(id) {
    await fetch(`${stack.API_URL}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: {
        apikey: stack.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`,
      },
    });
  }

  return { createOrganizer, deleteUser };
}
