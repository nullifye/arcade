import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, fakeBridge, fakeWindow, freshStore } from './helpers.mjs';

const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  globalThis.localStorage = memoryStorage();
  globalThis.window = fakeWindow();
});

test('outside AppsWarga, values live in localStorage', async () => {
  const s = await freshStore();
  assert.equal(s.readShared(s.PROFILE_KEY), null);
  assert.deepEqual(s.readShared('x', { a: 1 }), { a: 1 });
  s.writeShared(s.PROFILE_KEY, { nickname: 'Siti' });
  assert.deepEqual(s.readShared(s.PROFILE_KEY), { nickname: 'Siti' });
  assert.equal(localStorage.getItem('arked.profile'), '{"nickname":"Siti"}');
});

test('storage that throws is ignored', async () => {
  const s = await freshStore();
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  s.writeShared('k', 1);
  assert.equal(s.readShared('k', 'fallback'), 'fallback');
});

test('updateShared merges into the stored object', async () => {
  const s = await freshStore();
  s.writeShared(s.gameKey('teka-kata'), { lastPlayedAt: 1, daily: null });
  s.updateShared(s.gameKey('teka-kata'), { daily: { date: '2026-11-17', status: 'playing' } });
  assert.deepEqual(s.readShared('arked.game.teka-kata'), {
    lastPlayedAt: 1,
    daily: { date: '2026-11-17', status: 'playing' },
  });
});

test('migrateLocal copies the old Teka Kata profile once, without replacing a newer one', async () => {
  const s = await freshStore();
  localStorage.setItem('tk.profile', JSON.stringify({ playerId: 'p1', nickname: 'Lama' }));
  s.migrateLocal('tk.profile', s.PROFILE_KEY);
  assert.equal(s.readShared(s.PROFILE_KEY).playerId, 'p1');
  localStorage.setItem('tk.profile', JSON.stringify({ playerId: 'p2' }));
  s.migrateLocal('tk.profile', s.PROFILE_KEY);
  assert.equal(s.readShared(s.PROFILE_KEY).playerId, 'p1');
});

test("in AppsWarga, the bridge's value wins and onChange runs", async () => {
  const s = await freshStore();
  localStorage.setItem('arked.profile', JSON.stringify({ nickname: 'Lokal' }));
  const b = fakeBridge(new Map([['arked.profile', JSON.stringify({ nickname: 'Jambatan' })]]));
  window.appswarga = b;
  const changed = [];
  await s.syncShared(['arked.profile'], (k, v) => changed.push([k, v.nickname]));
  assert.deepEqual(s.readShared('arked.profile'), { nickname: 'Jambatan' });
  assert.deepEqual(changed, [['arked.profile', 'Jambatan']]);
});

test('a key the bridge lacks is pushed up from the local copy', async () => {
  const s = await freshStore();
  localStorage.setItem('arked.profile', JSON.stringify({ nickname: 'Lokal' }));
  const b = fakeBridge();
  window.appswarga = b;
  const changed = [];
  await s.syncShared(['arked.profile', 'arked.game.teka-kata'], (k) => changed.push(k));
  assert.equal(b.store.get('arked.profile'), '{"nickname":"Lokal"}');
  assert.equal(b.store.has('arked.game.teka-kata'), false);
  assert.deepEqual(changed, []);
});

test('a bridge that arrives late still gets the write, and sync waits for it', async () => {
  const s = await freshStore();
  const sync = s.syncShared(['arked.profile']);
  s.writeShared('arked.profile', { nickname: 'Awal' });
  const b = fakeBridge(new Map([['arked.profile', JSON.stringify({ nickname: 'Lama' })]]));
  window.appswarga = b;
  window.fire('appswargaReady');
  await sync;
  await tick();
  // The page's newer write is kept, locally and in the bridge.
  assert.deepEqual(s.readShared('arked.profile'), { nickname: 'Awal' });
  assert.equal(b.store.get('arked.profile'), '{"nickname":"Awal"}');
});

test('a write made while a sync is reading is not overwritten', async () => {
  const s = await freshStore();
  const b = fakeBridge(new Map([['arked.profile', JSON.stringify({ nickname: 'Lama' })]]), { delayMs: 10 });
  window.appswarga = b;
  const sync = s.syncShared(['arked.profile']);
  s.writeShared('arked.profile', { nickname: 'Baru' });
  await sync;
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(s.readShared('arked.profile'), { nickname: 'Baru' });
  assert.equal(b.store.get('arked.profile'), '{"nickname":"Baru"}');
});

test('after its write is stored, a later sync picks up changes made by another page', async () => {
  const s = await freshStore();
  const b = fakeBridge();
  window.appswarga = b;
  await s.writeShared('arked.game.teka-kata', { lastPlayedAt: 1 });
  // A game on another host updates the same key through the shared bridge storage.
  b.store.set('arked.game.teka-kata', JSON.stringify({ lastPlayedAt: 2, daily: { status: 'done' } }));
  const changed = [];
  await s.syncShared(['arked.game.teka-kata'], (k) => changed.push(k));
  assert.equal(s.readShared('arked.game.teka-kata').lastPlayedAt, 2);
  assert.deepEqual(changed, ['arked.game.teka-kata']);
});

test('a failed push is retried by the next sync', async () => {
  const s = await freshStore();
  const b = fakeBridge();
  let fail = true;
  const real = b.callHandler.bind(b);
  b.callHandler = async (name, opts) => (name === 'storage.set' && fail ? { status: 'error', code: 'TOO_LARGE' } : real(name, opts));
  window.appswarga = b;
  await s.writeShared('arked.profile', { nickname: 'A' });
  assert.equal(b.store.has('arked.profile'), false);
  b.store.set('arked.profile', JSON.stringify({ nickname: 'Lama' }));
  fail = false;
  await s.syncShared(['arked.profile']);
  assert.equal(b.store.get('arked.profile'), '{"nickname":"A"}');
  assert.deepEqual(s.readShared('arked.profile'), { nickname: 'A' });
});
