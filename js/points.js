// Combined points from every game, from Supabase (supabase/arked.sql) over plain fetch.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const pointsConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

function headers() {
  const h = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  // Legacy anon keys are JWTs and also go in Authorization; new sb_publishable_ keys don't.
  if (SUPABASE_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_KEY}`;
  return h;
}

/** Sums the per-game rows of arked_player_summary. */
export function summarise(rows) {
  const games = (Array.isArray(rows) ? rows : []).map((r) => ({
    game: r.game,
    name: r.name,
    points: Number(r.points) || 0,
    seconds: Number(r.seconds) || 0,
    plays: Number(r.plays) || 0,
  }));
  games.sort((a, b) => b.points - a.points);
  const total = games.reduce(
    (t, g) => ({ points: t.points + g.points, seconds: t.seconds + g.seconds, plays: t.plays + g.plays }),
    { points: 0, seconds: 0, plays: 0 },
  );
  return { total, games };
}

/** The player's points, play time and games, in total and per game. Throws when it can't load. */
export async function fetchSummary(playerId, fetchImpl = globalThis.fetch) {
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/arked_player_summary`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_player_id: playerId }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return summarise(await res.json());
}
