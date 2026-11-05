// Builds supabase/seed/catalog/tr-provinces-districts.json: the 81 provinces of Turkey and their districts
// (ADR-0024, docs/PHASE4_PLAN.md M1). Run by hand when the administrative map changes, never in CI; the output is
// committed and reviewed, and a change to it needs a new migration (rows are deactivated, never deleted).
//
//   node scripts/catalog/build-tr-catalog.mjs [--revision <trwiki revid>]
//
// Sources:
//   - The list of districts: the table of the Turkish Wikipedia article "Türkiye'nin ilçeleri", which follows the
//     Ministry of the Interior's inventory (81 provinces, 973 districts). Only names are taken from it, which are facts;
//     the revision is pinned in the output.
//   - Identity and points: Wikidata (CC0). Every district is matched to its item through the article it links to; the
//     point is the item's P625. If an item has none, the coordinates printed in the list row are used and the row says so.
// The script stops when the totals differ from 81 / 973, when a slug repeats inside a province, or when one of Ankara's
// 25 existing slugs is missing.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { slugifyTr } from './slug.mjs';

const UA = 'MatchUpCatalogBuild/1.0 (catalog of Turkish provinces; run by hand)';
const ARTICLE = "Türkiye'nin ilçeleri";
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../supabase/seed/catalog/tr-provinces-districts.json',
);
const EXPECTED = { provinces: 81, districts: 973 };
const ANKARA_SLUGS = [
  'akyurt',
  'altindag',
  'ayas',
  'bala',
  'beypazari',
  'camlidere',
  'cankaya',
  'cubuk',
  'elmadag',
  'etimesgut',
  'evren',
  'golbasi',
  'gudul',
  'haymana',
  'kahramankazan',
  'kalecik',
  'kecioren',
  'kizilcahamam',
  'mamak',
  'nallihan',
  'polatli',
  'pursaklar',
  'sincan',
  'sereflikochisar',
  'yenimahalle',
];

async function getJson(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...init.headers },
    });
    if (res.ok) return res.json();
    if (attempt >= 6 || (res.status !== 429 && res.status < 500))
      throw new Error(`${res.status} ${url.slice(0, 120)}`);
    const wait = Number(res.headers.get('retry-after')) || 5 * attempt;
    await sleep(wait * 1000);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const wikiApi = (params) =>
  getJson(
    `https://tr.wikipedia.org/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`,
  );

const LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/;
function cellText(cell) {
  const m = LINK.exec(cell);
  if (m) return { text: (m[2] ?? m[1]).trim(), link: m[1].trim() };
  return {
    text: cell
      .replace(/'''/g, '')
      .replace(/style="[^"]*"\s*\|/, '')
      .trim(),
    link: null,
  };
}

function dmsToDecimal(geo) {
  // "37_32_54_N_35_23_35_E" or "37.5_N_35.3_E"
  const parts = geo.split('_');
  const read = (from) => {
    const hemi = parts.findIndex((p, i) => i >= from && /^[NSEW]$/.test(p));
    const nums = parts.slice(from, hemi).map(Number);
    const value = nums[0] + (nums[1] ?? 0) / 60 + (nums[2] ?? 0) / 3600;
    return { value: /[SW]/.test(parts[hemi]) ? -value : value, next: hemi + 1 };
  };
  const lat = read(0);
  const lon = read(lat.next);
  return { lat: round(lat.value), lon: round(lon.value) };
}
const round = (n) => Math.round(n * 1e5) / 1e5;

function parseTable(wikitext) {
  const start = wikitext.indexOf('{|');
  const end = wikitext.indexOf('\n|}', start);
  const rows = wikitext.slice(start, end).split('\n|-').slice(1);
  let provinceLink = new Map();
  const out = [];
  for (const row of rows) {
    const cells = row
      .trim()
      .split('\n|')
      .filter((c) => c.trim());
    cells[0] = cells[0].replace(/^\|/, '');
    const province = cellText(cells[0]);
    if (province.link) provinceLink.set(province.text, province.link);
    const district = cellText(cells[1]);
    const geo = /params=([0-9_.NSEW]+)/.exec(row)?.[1];
    out.push({
      province: province.text,
      name: district.text,
      link: district.link,
      geo: geo ? dmsToDecimal(geo) : null,
    });
  }
  return { rows: out, provinceLink };
}

async function qidsFor(titles) {
  const result = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    if (i > 0) await sleep(1500); // the API asks automated clients to go slowly
    const data = await wikiApi({
      action: 'query',
      prop: 'pageprops',
      ppprop: 'wikibase_item',
      redirects: '1',
      titles: batch.join('|'),
    });
    const alias = new Map();
    for (const n of data.query.normalized ?? []) alias.set(n.from, n.to);
    for (const r of data.query.redirects ?? []) alias.set(r.from, r.to);
    const byTitle = new Map(
      data.query.pages.map((p) => [p.title, p.pageprops?.wikibase_item ?? null]),
    );
    for (const t of batch) {
      let title = t;
      for (let hop = 0; hop < 3 && alias.has(title); hop++) title = alias.get(title);
      result.set(t, byTitle.get(title) ?? null);
    }
  }
  return result;
}

async function wikidataFacts(qids) {
  const facts = new Map();
  for (let i = 0; i < qids.length; i += 200) {
    const values = qids
      .slice(i, i + 200)
      .map((q) => `wd:${q}`)
      .join(' ');
    const query = `SELECT ?item ?coord ?parent ?cls WHERE { VALUES ?item { ${values} }
      OPTIONAL { ?item p:P625 ?cs . ?cs ps:P625 ?coord . ?cs wikibase:rank ?rank FILTER(?rank != wikibase:DeprecatedRank) }
      OPTIONAL { ?item wdt:P131 ?parent } OPTIONAL { ?item wdt:P31 ?cls } }`;
    const data = await getJson('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/sparql-results+json',
      },
      body: new URLSearchParams({ query }),
    });
    for (const b of data.results.bindings) {
      const q = b.item.value.split('/').pop();
      const f = facts.get(q) ?? { coord: null, parents: new Set(), classes: new Set() };
      if (b.coord && !f.coord) {
        const m = /Point\(([-0-9.]+) ([-0-9.]+)\)/.exec(b.coord.value);
        if (m) f.coord = { lat: round(Number(m[2])), lon: round(Number(m[1])) };
      }
      if (b.parent) f.parents.add(b.parent.value.split('/').pop());
      if (b.cls) f.classes.add(b.cls.value.split('/').pop());
      facts.set(q, f);
    }
  }
  return facts;
}

// Rows where the two sources disagree by more than 15 km were checked by hand on 2026-11-05. In most the list's
// coordinates were wrong (Adilcevaz, Selendi, Çamlıyayla, Çaldıran...) and Wikidata stays. In these two the Wikidata
// item's point is another settlement, so the list's point is used.
const LIST_POINT_OVERRIDES = new Set(['Sivas/Ulaş', 'Tekirdağ/Ergene']);

// The widest provinces (Konya, Sivas) are about 300 km across; their seat is not always central.
const MAX_KM_FROM_PROVINCE = 250;
function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function fail(message) {
  console.error(`build-tr-catalog: ${message}`);
  process.exit(1);
}

const revArg = process.argv.indexOf('--revision');
const parseParams = revArg > 0 ? { oldid: process.argv[revArg + 1] } : { page: ARTICLE };
const parsed = await wikiApi({ action: 'parse', prop: 'wikitext|revid', ...parseParams });
const revision = parsed.parse.revid;
const { rows, provinceLink } = parseTable(parsed.parse.wikitext);

const provinceNames = [...new Set(rows.map((r) => r.province))];
if (provinceNames.length !== EXPECTED.provinces)
  fail(`${provinceNames.length} provinces, expected ${EXPECTED.provinces}`);
if (rows.length !== EXPECTED.districts)
  fail(`${rows.length} districts, expected ${EXPECTED.districts}`);

const provinceQ = await qidsFor(provinceNames.map((p) => provinceLink.get(p) ?? `${p} (il)`));
const districtQ = await qidsFor([...new Set(rows.map((r) => r.link).filter(Boolean))]);
const allQ = [...provinceQ.values(), ...districtQ.values()].filter(Boolean);
const facts = await wikidataFacts([...new Set(allQ)]);

const notes = [];
const provinces = provinceNames
  .map((name) => {
    const qid = provinceQ.get(provinceLink.get(name) ?? `${name} (il)`);
    if (!qid) fail(`province ${name} has no Wikidata item`);
    const f = facts.get(qid);
    if (!f?.classes.has('Q48336')) notes.push(`province ${name} (${qid}) is not typed Q48336`);
    if (!f?.coord) fail(`province ${name} (${qid}) has no point`);
    const districts = rows
      .filter((r) => r.province === name)
      .map((r) => {
        const dq = r.link ? districtQ.get(r.link) : null;
        const df = dq ? facts.get(dq) : null;
        // The linked article is usually the town that is the district's seat, not the district item; its point is the
        // better map center anyway. A wrong match (a namesake elsewhere) shows up as a point far from the province.
        if (!dq) notes.push(`${name}/${r.name}: no Wikidata item`);
        const useList = LIST_POINT_OVERRIDES.has(`${name}/${r.name}`);
        const point = (useList ? r.geo : df?.coord) ?? r.geo;
        if (!point) fail(`${name}/${r.name} has no point`);
        const km = distanceKm(point, f.coord);
        if (km > MAX_KM_FROM_PROVINCE)
          fail(`${name}/${r.name} (${dq}) is ${Math.round(km)} km from its province`);
        if (!useList && r.geo && distanceKm(point, r.geo) > 15) {
          notes.push(
            `${name}/${r.name} (${dq}): Wikidata point is ${Math.round(distanceKm(point, r.geo))} km from the list's`,
          );
        }
        return {
          slug: slugifyTr(r.name),
          name: r.name,
          wikidata: dq,
          point,
          point_source: df?.coord && !useList ? 'wikidata' : 'list',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const slugs = new Set(districts.map((d) => d.slug));
    if (slugs.size !== districts.length) fail(`repeated district slug in ${name}`);
    return { slug: slugifyTr(name), name, wikidata: qid, point: f.coord, districts };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

if (new Set(provinces.map((p) => p.slug)).size !== provinces.length) fail('repeated province slug');
const ankara = provinces.find((p) => p.slug === 'ankara');
const missing = ANKARA_SLUGS.filter((s) => !ankara?.districts.some((d) => d.slug === s));
if (missing.length) fail(`Ankara slugs missing: ${missing.join(', ')}`);

const output = {
  source: {
    list: `https://tr.wikipedia.org/w/index.php?oldid=${revision}`,
    identity_and_points:
      'Wikidata (CC0), P625; point_source "list" marks a row whose item had no point',
    built_at: new Date().toISOString().slice(0, 10),
  },
  totals: { provinces: provinces.length, districts: rows.length },
  notes,
  provinces,
};
writeFileSync(OUT, `${JSON.stringify(output, null, 2)}\n`); // then `pnpm exec prettier --write` it
console.log(
  `${provinces.length} provinces, ${rows.length} districts, revision ${revision}, ` +
    `${rows.length - provinces.flatMap((p) => p.districts).filter((d) => d.point_source === 'wikidata').length} points from the list, ` +
    `${notes.length} notes -> ${OUT}`,
);
