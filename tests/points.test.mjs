import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSummary, summarise, pointsConfigured } from '../js/points.js';
import { SUPABASE_URL } from '../js/config.js';

test('summarise totals the per-game rows (bigints arrive as strings or numbers)', () => {
  const { total, games } = summarise([
    { game: 'a', name: 'A', points: '100', seconds: 60, plays: 2 },
    { game: 'b', name: 'B', points: 300, seconds: '30', plays: '1' },
  ]);
  assert.deepEqual(total, { points: 400, seconds: 90, plays: 3 });
  assert.deepEqual(games.map((g) => g.game), ['b', 'a']);
  assert.deepEqual(summarise(null).total, { points: 0, seconds: 0, plays: 0 });
});

test('fetchSummary calls arked_player_summary with the player id', async () => {
  assert.ok(pointsConfigured());
  let seen;
  const fake = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => [{ game: 'teka-kata', name: 'Teka Kata UiTM', points: 820, seconds: 95, plays: 1 }] };
  };
  const r = await fetchSummary('11111111-1111-4111-8111-111111111111', fake);
  assert.equal(seen.url, `${SUPABASE_URL}/rest/v1/rpc/arked_player_summary`);
  assert.equal(seen.init.method, 'POST');
  assert.deepEqual(JSON.parse(seen.init.body), { p_player_id: '11111111-1111-4111-8111-111111111111' });
  assert.ok(seen.init.headers.apikey.startsWith('sb_publishable_'));
  assert.equal(seen.init.headers.Authorization, undefined);
  assert.equal(r.total.points, 820);
});

test('fetchSummary throws on a server error', async () => {
  await assert.rejects(fetchSummary('x', async () => ({ ok: false, status: 404, json: async () => ({}) })));
});
