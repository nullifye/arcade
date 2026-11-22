import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAMES, launchUrl } from '../js/games.js';

const root = new URL('..', import.meta.url);
// Where GitHub Pages serves the manifest; relative URLs in it resolve against this.
const LIVE = 'https://nullifye.github.io/arcade/manifest.webmanifest';
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
const at = (u) => new URL(u, LIVE).href;

/** Width and height of a PNG file, from its IHDR chunk. */
function pngSize(file) {
  const b = readFileSync(new URL(file, root));
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${file} is not a PNG`);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

test('the manifest makes an installable, full-screen app with a stable id', () => {
  for (const key of ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'icons']) assert.ok(manifest[key], key);
  assert.equal(manifest.display, 'fullscreen');
  assert.equal(at(manifest.id), 'https://nullifye.github.io/arcade/'); // never change: it is the installed app's identity
  assert.equal(at(manifest.start_url), 'https://nullifye.github.io/arcade/');
  assert.ok(at(manifest.start_url).startsWith(at(manifest.scope)), 'start_url inside scope');
});

test('live games on the same site open inside the app window (in scope)', () => {
  for (const g of GAMES.filter((x) => x.status === 'live' && new URL(x.url).origin === new URL(LIVE).origin)) {
    assert.ok(launchUrl(g).startsWith(at(manifest.scope)), g.id);
  }
});

test('the app icons exist at their declared sizes, with a 192, a 512 and a maskable one', () => {
  for (const icon of manifest.icons) assert.equal(pngSize(icon.src), icon.sizes, icon.src);
  const any = manifest.icons.filter((i) => (i.purpose ?? 'any').split(' ').includes('any')).map((i) => i.sizes);
  assert.ok(any.includes('192x192') && any.includes('512x512'));
  assert.ok(manifest.icons.some((i) => i.purpose?.includes('maskable')));
  assert.equal(pngSize('apple-touch-icon.png'), '180x180');
});

test('the hub page links the manifest and the iOS icon', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/);
  assert.match(html, /id="btn-install" hidden/);
});
