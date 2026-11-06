// Phase 7 / M3: the load scenarios of ARCHITECTURE §8, for k6 (run by scripts/load/run.mjs in the grafana/k6 container,
// against the LOCAL stack only). The runner writes out/inputs.json: base URL, public key, the seed's fixtures, and tokens
// for the players and organizers it uses.
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter } from 'k6/metrics';

const INPUT = JSON.parse(open('./out/inputs.json'));
const BASE = INPUT.base;
const ANON = INPUT.anon;
const FX = INPUT.fixtures;
const TOKENS = INPUT.tokens;
const ORG = INPUT.organizers;
const STORM_PLAYERS = Object.keys(TOKENS).filter(
  (id) => id >= '00000000-0000-4000-9000-000000004001',
);
const PLAYERS = Object.keys(TOKENS).filter((id) => id < '00000000-0000-4000-9000-000000004001');

const raceWins = new Counter('race_approvals_succeeded');
const raceFull = new Counter('race_refused_full');
const stormOk = new Counter('storm_requests_succeeded');
const unexpected = new Counter('unexpected_errors');

export const options = {
  scenarios: {
    // 1. Discovery: 100 people paging search_events with random filters, a third of them near a point with a radius,
    // each pausing 1–3 s between screens as a person does (~50 requests/s, about three times the pilot's evening peak).
    discovery: { executor: 'constant-vus', vus: 100, duration: '60s', exec: 'discovery' },
    // 1b. The same without pauses: what one laptop serves when every user hammers it (a stress number, no budget).
    stress: {
      executor: 'constant-vus',
      vus: 100,
      duration: '20s',
      startTime: '145s',
      exec: 'stress',
    },
    // 2. Join storm (ARCHITECTURE §8: 200 people within 60 s): 200 requests on one event in 20 s.
    storm: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 50,
      startTime: '65s',
      exec: 'storm',
    },
    // 2b. The same 200 people at the very same moment: the event row lock queues them (a stress number, no budget).
    burst: {
      executor: 'per-vu-iterations',
      vus: 200,
      iterations: 1,
      startTime: '90s',
      exec: 'burst',
      maxDuration: '30s',
    },
    // 3. Last-slot race: 50 approvals at once for one free place.
    race: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 1,
      startTime: '100s',
      exec: 'race',
      maxDuration: '30s',
    },
    // 4. Organizer dashboard: the request queue of 500 and My Events, read repeatedly.
    dashboard: {
      executor: 'constant-vus',
      vus: 20,
      duration: '30s',
      startTime: '105s',
      exec: 'dashboard',
    },
    // 5. Fan-out: cancelling an event with 99 approved players (one call; the runner counts the notifications).
    fanout: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      startTime: '140s',
      exec: 'fanout',
      maxDuration: '30s',
    },
  },
  thresholds: {
    'http_req_duration{scenario:discovery}': ['p(95)<800'],
    'http_req_duration{scenario:storm}': ['p(95)<500'],
    'http_req_duration{scenario:race}': ['p(95)<500'],
    'http_req_duration{scenario:dashboard}': ['p(95)<500'],
    // Recorded, not budgeted: these keep their numbers in the summary.
    'http_req_duration{scenario:burst}': ['max>=0'],
    'http_req_duration{scenario:fanout}': ['max>=0'],
    'http_req_duration{scenario:stress}': ['max>=0'],
    'http_req_failed{scenario:discovery}': ['rate<0.001'],
    'http_req_failed{scenario:dashboard}': ['rate<0.001'],
    race_approvals_succeeded: ['count==1'],
    unexpected_errors: ['count==0'],
  },
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)', 'max'],
};

function rpc(name, body, token) {
  return http.post(`${BASE}/rest/v1/rpc/${name}`, JSON.stringify(body), {
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token ?? ANON}`,
      'Content-Type': 'application/json',
    },
    tags: { rpc: name },
  });
}
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const ok = (res) => res.status >= 200 && res.status < 300; // a void function answers 204
const code = (res) => {
  try {
    return JSON.parse(res.body).message;
  } catch {
    return String(res.status);
  }
};

export function discovery() {
  search();
  sleep(1 + Math.random() * 2);
}

export function stress() {
  search();
}

function search() {
  const filters = { city_id: pick(FX.cities), limit: 20 };
  if (Math.random() < 0.5) filters.sport_ids = [pick(FX.sports)];
  if (Math.random() < 0.3) filters.only_open = true;
  if (Math.random() < 0.33) {
    // Around Ankara's centre, sorted by distance, with a radius.
    filters.near = {
      lat: 39.92 + (Math.random() - 0.5) * 0.2,
      lon: 32.85 + (Math.random() - 0.5) * 0.2,
    };
    filters.sort = 'NEAREST';
    filters.radius_km = pick([5, 10, 25]);
    delete filters.city_id;
  }
  const first = rpc('search_events', { p_filters: filters });
  if (!check(first, { 'search ok': ok })) unexpected.add(1);
  // Half of the people look at the second page.
  if (ok(first) && Math.random() < 0.5) {
    const next = JSON.parse(first.body).next_cursor;
    if (next) {
      const second = rpc('search_events', { p_filters: filters, p_cursor: next });
      if (!check(second, { 'page 2 ok': ok })) unexpected.add(1);
    }
  }
}

export function storm() {
  join(FX.storm.event_id);
}

export function burst() {
  join(FX.burst.event_id);
}

// One distinct player per iteration of the scenario (VU numbers are shared by all scenarios, iterations are not).
function join(eventId) {
  const player = STORM_PLAYERS[exec.scenario.iterationInTest % STORM_PLAYERS.length];
  const res = rpc('request_join', { p_event_id: eventId }, TOKENS[player]);
  if (ok(res)) stormOk.add(1);
  else unexpected.add(1, { code: code(res) });
}

export function race() {
  const participation =
    FX.race_participations[exec.scenario.iterationInTest % FX.race_participations.length];
  const res = rpc('approve_participation', { p_participation_id: participation }, ORG.race);
  if (ok(res)) raceWins.add(1);
  else if (code(res) === 'EVENT_FULL') raceFull.add(1);
  else unexpected.add(1, { code: code(res) });
}

export function dashboard() {
  const queue = rpc('list_event_requests', { p_event_id: FX.queue.event_id }, ORG.queue);
  if (!check(queue, { 'queue ok': ok })) unexpected.add(1);
  const mine = rpc(
    'list_my_events',
    { p_bucket: 'APPROVED', p_cursor: null, p_limit: 20 },
    TOKENS[pick(PLAYERS)],
  );
  if (!check(mine, { 'my events ok': ok })) unexpected.add(1);
  sleep(0.5);
}

export function fanout() {
  const res = rpc(
    'cancel_event',
    { p_event_id: FX.fanout.event_id, p_reason: 'WEATHER', p_message: null },
    ORG.fanout,
  );
  if (!check(res, { 'cancel ok': ok })) unexpected.add(1, { code: code(res) });
}
