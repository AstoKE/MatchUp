// Turkish has a dotted and a dotless i: "IŞIK".toLowerCase() is "işik", not "ışık". Text a person reads must use
// toLocaleUpperCase/toLocaleLowerCase with the tr locale (CLAUDE.md; lib/i18n/format.ts). This fails on a bare
// toUpperCase()/toLowerCase() in app or domain code, except where the text is machine-only, listed with the reason.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url).pathname;
const ALLOWED = {
  'apps/app/src/lib/supabase/crypto-polyfill.ts': 'Web Crypto algorithm names (ASCII)',
  'packages/domain/src/auth.ts': 'email addresses are compared in ASCII lower case',
  'packages/domain/src/rating/constants.ts': 'config key names (ASCII identifiers)',
};

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) yield path;
  }
}

test('no case transform without a locale in code people read', () => {
  const found = [];
  for (const dir of ['apps/app/src', 'packages/domain/src']) {
    for (const path of files(join(root, dir))) {
      const rel = relative(root, path);
      if (ALLOWED[rel]) continue;
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/\.to(Upper|Lower)Case\(\)/.test(line)) found.push(`${rel}:${i + 1}`);
        });
    }
  }
  assert.deepEqual(found, [], 'use toLocaleUpperCase/toLocaleLowerCase with the tr locale');
});
