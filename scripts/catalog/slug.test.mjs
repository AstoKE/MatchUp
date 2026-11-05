import assert from 'node:assert/strict';
import { test } from 'node:test';

import { slugifyTr } from './slug.mjs';

test('Turkish letters fold the way the Ankara seed did', () => {
  assert.equal(slugifyTr('Şereflikoçhisar'), 'sereflikochisar');
  assert.equal(slugifyTr('Kızılcahamam'), 'kizilcahamam');
  assert.equal(slugifyTr('Keçiören'), 'kecioren');
  assert.equal(slugifyTr('Gölbaşı'), 'golbasi');
});

test('dotted and dotless capitals follow the tr locale', () => {
  assert.equal(slugifyTr('İstanbul'), 'istanbul');
  assert.equal(slugifyTr('Iğdır'), 'igdir');
  assert.equal(slugifyTr('Şırnak'), 'sirnak');
  assert.equal(slugifyTr('ŞIRNAK'), 'sirnak');
});

test('spaces, circumflexes and punctuation', () => {
  assert.equal(slugifyTr('Kâhta'), 'kahta');
  assert.equal(slugifyTr('19 Mayıs'), '19-mayis');
  assert.equal(slugifyTr('  Merkez  '), 'merkez');
});
