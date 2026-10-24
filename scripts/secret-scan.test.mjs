import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findSecrets } from './lib/secret-scan.mjs';

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (payload) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.c2lnbmF0dXJlLXBsYWNlaG9sZGVy`;

test('flags a service_role JWT embedded in minified code', () => {
  const text = `var a="x",k="${jwt({ role: 'service_role', iss: 'supabase-demo' })}";f(k)`;
  const findings = findSecrets(text);
  assert.equal(findings.length, 1);
  assert.match(findings[0].kind, /service_role/);
  assert.ok(findings[0].sample.endsWith('…'), 'never prints the whole secret');
  assert.ok(findings[0].sample.length < 20);
});

test('allows the public anon key (it is meant to ship)', () => {
  assert.deepEqual(findSecrets(`k="${jwt({ role: 'anon', iss: 'supabase-demo' })}"`), []);
});

test('flags Supabase secret keys', () => {
  assert.equal(findSecrets('x="sb_secret_N7UND0UgjKTVKexample"').length, 1);
});

test('allows publishable keys', () => {
  assert.deepEqual(findSecrets('x="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"'), []);
});

test('flags private keys and AWS access key ids', () => {
  assert.equal(findSecrets('-----BEGIN PRIVATE KEY-----\nMIIE').length, 1);
  assert.equal(findSecrets('id=AKIAABCDEFGHIJKLMNOP').length, 1);
});

test('ignores ordinary code and non-JSON JWT-looking noise', () => {
  assert.deepEqual(findSecrets('function a(){return "eyJhbGciOi.eyJzdWIiOi.abcdefghij"}'), []);
  assert.deepEqual(findSecrets('const role = "service_role"; // a word, not a credential'), []);
});
