// The catalog migration was generated from the reviewed JSON; this keeps the two from drifting apart unnoticed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { slugifyTr } from './slug.mjs';

const root = new URL('../../', import.meta.url);
const catalog = JSON.parse(
  readFileSync(new URL('supabase/seed/catalog/tr-provinces-districts.json', root), 'utf8'),
);
const sql = readFileSync(
  new URL('supabase/migrations/20261106100000_turkey_catalog.sql', root),
  'utf8',
);

test('the JSON holds 81 provinces and 973 districts with points', () => {
  assert.equal(catalog.provinces.length, 81);
  const districts = catalog.provinces.flatMap((p) => p.districts);
  assert.equal(districts.length, 973);
  for (const d of districts) {
    assert.ok(
      d.point.lat > 35.7 && d.point.lat < 42.3 && d.point.lon > 25.5 && d.point.lon < 45,
      d.name,
    );
    assert.equal(d.slug, slugifyTr(d.name));
  }
});

test('every row of the JSON is in the migration, with the same point', () => {
  const rows = new Set(sql.split('\n').filter((line) => line.startsWith("    ('")));
  assert.equal(rows.size, 81 + 973);
  const q = (v) => (v === null ? 'null' : `'${v}'`);
  for (const p of catalog.provinces) {
    assert.ok(
      rows.has(
        `    ('${p.slug}', '${p.name}', ${q(p.wikidata)}, ${p.point.lat}, ${p.point.lon}),`,
      ) ||
        rows.has(
          `    ('${p.slug}', '${p.name}', ${q(p.wikidata)}, ${p.point.lat}, ${p.point.lon})`,
        ),
      p.name,
    );
    for (const d of p.districts) {
      const line = `    ('${p.slug}', '${d.slug}', '${d.name}', ${q(d.wikidata)}, ${d.point.lat}, ${d.point.lon})`;
      assert.ok(rows.has(line) || rows.has(`${line},`), `${p.name}/${d.name}`);
    }
  }
});
