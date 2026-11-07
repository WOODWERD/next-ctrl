// B1: the repo is laid out the way the build plan expects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const need = ['site/tokens.css', 'site/fonts/Inter-Regular.woff2', 'skill', 'tools', 'CHANGELOG.md', 'LICENSE'];

test('B1 layout is in place', () => {
  for (const p of need) assert.ok(existsSync(new URL('../' + p, import.meta.url)), p + ' is missing');
});
