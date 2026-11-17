import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { GAMES, gameProblems, launchUrl } from '../js/games.js';

const root = new URL('..', import.meta.url);

test('every catalogue entry is valid', () => {
  for (const g of GAMES) assert.deepEqual(gameProblems(g), [], g.id);
});

test('ids are unique and icons exist', () => {
  assert.equal(new Set(GAMES.map((g) => g.id)).size, GAMES.length);
  for (const g of GAMES) assert.ok(existsSync(new URL(g.icon, root)), g.icon);
});

test('at least one game is live', () => {
  assert.ok(GAMES.some((g) => g.status === 'live'));
});

test('gameProblems catches bad entries', () => {
  const ok = { id: 'x', name: 'X', desc: 'd', icon: 'icons/x.svg', tags: [], status: 'live', url: 'https://a.vercel.app/' };
  assert.deepEqual(gameProblems(ok), []);
  assert.ok(gameProblems({ ...ok, id: 'Bad Id' }).length);
  assert.ok(gameProblems({ ...ok, url: 'http://a.vercel.app/' }).length);
  assert.ok(gameProblems({ ...ok, url: null }).length);
  assert.deepEqual(gameProblems({ ...ok, status: 'soon', url: null }), []);
  assert.ok(gameProblems({ ...ok, status: 'beta' }).length);
});

test('launchUrl adds ?dari=arked and keeps other hosts as they are', () => {
  const prod = { hostname: 'nullifye.github.io', origin: 'https://nullifye.github.io' };
  assert.equal(launchUrl({ url: 'https://nullifye.github.io/teka-kata/' }, prod), 'https://nullifye.github.io/teka-kata/?dari=arked');
  assert.equal(launchUrl({ url: 'https://game.vercel.app/play?x=1' }, prod), 'https://game.vercel.app/play?x=1&dari=arked');
});

test('on the dev server, games on nullifye.github.io open locally', () => {
  const dev = { hostname: 'localhost', origin: 'http://localhost:8080' };
  assert.equal(launchUrl({ url: 'https://nullifye.github.io/teka-kata/' }, dev), 'http://localhost:8080/teka-kata/?dari=arked');
  assert.equal(launchUrl({ url: 'https://game.vercel.app/' }, dev), 'https://game.vercel.app/?dari=arked');
});
