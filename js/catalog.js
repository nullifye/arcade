// What the game list shows for a search and a filter chip. Pure functions (tests/catalog.test.mjs).
//
// A filter is 'semua' (all), a category id (games.js CATEGORIES) or 'harian' (games with a
// Cabaran Harian: the 'Harian' label). A search matches every word typed, in any order, against a
// game's name, description, labels and category, ignoring case and accents ("congak" finds Congak
// Matematik; "lawan ai" finds the games against the AI).

export const DAILY_TAG = 'Harian';

/** Lower case, accents and punctuation removed, words single-spaced. */
export function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const categoryName = (categories, id) => categories.find((c) => c.id === id)?.name ?? '';

/** Whether `game` matches every word of `query` (an empty query matches everything). */
export function matches(game, query, categories = []) {
  const words = normalise(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = ` ${normalise([game.name, game.desc, ...(game.tags ?? []), categoryName(categories, game.category)].join(' '))}`;
  // Each word must start a word of the game's text ("kata" finds Teka Kata, not "berkata").
  return words.every((w) => hay.includes(` ${w}`));
}

/** Whether `game` is in filter `filter`. */
export function inFilter(game, filter) {
  if (!filter || filter === 'semua') return true;
  if (filter === 'harian') return (game.tags ?? []).includes(DAILY_TAG);
  return game.category === filter;
}

/**
 * The list to show: { sections: [{ id, title, games }], count }.
 * - 'semua' and no search: one section per category (playable games, in catalogue order), then
 *   Akan Datang for the rest;
 * - a filter or a search: one flat section of what matches, playable games first.
 */
export function listView(games, categories, { query = '', filter = 'semua' } = {}) {
  const hits = games.filter((g) => inFilter(g, filter) && matches(g, query, categories));
  const live = hits.filter((g) => g.status === 'live');
  const soon = hits.filter((g) => g.status !== 'live');
  let sections;
  if (filter === 'semua' && !normalise(query)) {
    sections = categories
      .map((c) => ({ id: c.id, title: c.name, games: live.filter((g) => g.category === c.id) }))
      .filter((s) => s.games.length);
    if (soon.length) sections.push({ id: 'soon', title: 'Akan Datang', games: soon });
  } else {
    sections = hits.length ? [{ id: 'results', title: null, games: [...live, ...soon] }] : [];
  }
  return { sections, count: hits.length };
}

/** The filter chips: Semua, each category with its playable games, then Cabaran Harian. */
export function chips(games, categories) {
  const live = games.filter((g) => g.status === 'live');
  return [
    { id: 'semua', name: 'Semua', count: live.length },
    ...categories.map((c) => ({ id: c.id, name: c.name, count: live.filter((g) => g.category === c.id).length })),
    { id: 'harian', name: 'Cabaran Harian', count: live.filter((g) => inFilter(g, 'harian')).length },
  ].filter((c) => c.id === 'semua' || c.count > 0);
}
