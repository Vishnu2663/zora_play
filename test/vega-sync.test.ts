import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain .mjs helper without type declarations
import { assetPathFromAppTsx, findVegaProject, makeStamp, readStamp, stampContent } from '../scripts/vega-lib.mjs';

test('finds the asset path the vegaWebview template loads', () => {
  const tpl = `source={{\n  // headers: {},\n  uri: "file:///pkg/assets/index.html",\n}}`;
  assert.equal(assetPathFromAppTsx(tpl), 'index.html');
  assert.equal(assetPathFromAppTsx(`uri: 'file:///pkg/assets/milo/index.html'`), 'milo/index.html');
});

test('refuses remote URLs and paths that escape assets/', () => {
  assert.equal(assetPathFromAppTsx(`uri: "https://example.com"`), null);
  assert.equal(assetPathFromAppTsx(`uri: "file:///pkg/assets/../manifest.toml"`), null);
  assert.equal(assetPathFromAppTsx(''), null);
});

test('build stamp round-trips through the HTML meta tag', () => {
  const s = makeStamp({ version: '0.1.0', js: 'a', css: 'b', builtAt: '2026-10-15T09:00:00.000Z' });
  assert.match(s.hash, /^[0-9a-f]{8}$/);
  const html = `<head><meta name="milo-build" content="${stampContent(s)}" /></head>`;
  assert.deepEqual(readStamp(html), s);
  assert.equal(readStamp('<html></html>'), null);
});

test('stamp hash depends on content, not on time', () => {
  const a = makeStamp({ version: '1', js: 'x', css: 'y', builtAt: 't1' });
  const b = makeStamp({ version: '1', js: 'x', css: 'y', builtAt: 't2' });
  const c = makeStamp({ version: '1', js: 'x2', css: 'y', builtAt: 't1' });
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
});

test('locates a sibling MiloVega project, or $VEGA_PROJECT', () => {
  const dir = mkdtempSync(join(tmpdir(), 'milo-'));
  const milo = join(dir, 'milo');
  const vega = join(dir, 'MiloVega');
  mkdirSync(milo);
  assert.equal(findVegaProject(milo, {}), null);
  mkdirSync(join(vega, 'src'), { recursive: true });
  writeFileSync(join(vega, 'package.json'), '{}');
  writeFileSync(join(vega, 'src', 'App.tsx'), '');
  assert.equal(findVegaProject(milo, {}), vega);
  assert.equal(findVegaProject(join(dir, 'elsewhere'), { VEGA_PROJECT: vega }), vega);
});
