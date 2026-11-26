import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise, matches, inFilter, listView, chips } from '../js/catalog.js';
import { GAMES, CATEGORIES } from '../js/games.js';

const names = (games) => games.map((g) => g.name);
const find = (id) => GAMES.find((g) => g.id === id);

test('normalise: lower case, no accents or punctuation', () => {
  assert.equal(normalise('  Letup-Letup!  '), 'letup letup');
  assert.equal(normalise('Café  Ais'), 'cafe ais');
  assert.equal(normalise(null), '');
});

test('search matches name, description, labels and category, by the start of words', () => {
  assert.ok(matches(find('congak'), 'congak', CATEGORIES));
  assert.ok(matches(find('congak'), 'MATEMATIK', CATEGORIES));
  assert.ok(matches(find('teka-kata'), 'kata', CATEGORIES)); // a word of the name
  assert.ok(matches(find('9balls'), 'lawan ai', CATEGORIES)); // a label
  assert.ok(matches(find('pemadam'), 'tradisional', CATEGORIES)); // the category
  assert.ok(matches(find('letup-letup'), 'burung', CATEGORIES)); // the description
  assert.ok(matches(find('letup-letup'), 'padan 3', CATEGORIES)); // a label of two words
  assert.ok(matches(find('2048'), 'teka teki', CATEGORIES)); // the category, hyphen or not
  assert.ok(matches(find('ular'), 'refleks ular', CATEGORIES)); // words in any order
  assert.ok(!matches(find('ular'), 'kata', CATEGORIES));
  assert.ok(!matches(find('congkak'), 'ngkak', CATEGORIES)); // not from the middle of a word
  assert.ok(matches(find('ular'), '', CATEGORIES));
});

test('filters: all, a category, or the games with a Cabaran Harian', () => {
  assert.ok(inFilter(find('ular'), 'semua'));
  assert.ok(inFilter(find('ular'), 'arked'));
  assert.ok(!inFilter(find('ular'), 'kata'));
  assert.deepEqual(names(GAMES.filter((g) => g.status === 'live' && inFilter(g, 'harian'))).sort(),
    ['Congak Matematik', 'Duga Kata', 'Kejar Lapan', 'Letup-Letup', 'Teka Kata']);
});

test('all games, no search: a section per category in order, then Akan Datang', () => {
  const { sections, count } = listView(GAMES, CATEGORIES);
  assert.deepEqual(sections.map((s) => s.title), ['Asah Minda', 'Arked', 'Kata', 'Tradisional', 'Teka-teki', 'Sukan', 'Akan Datang']);
  assert.equal(count, GAMES.length);
  // Every game exactly once; Akan Datang holds the ones not yet playable.
  assert.equal(sections.flatMap((s) => s.games).length, GAMES.length);
  assert.ok(sections.at(-1).games.every((g) => g.status === 'soon'));
  assert.ok(sections.slice(0, -1).every((s) => s.games.every((g) => g.status === 'live' && g.category === s.id)));
});

test('a filter or a search: one list, playable games first; nothing found is empty', () => {
  const puzzles = listView(GAMES, CATEGORIES, { filter: 'teka-teki' });
  assert.deepEqual(names(puzzles.sections[0].games), ['2048', 'Susun Blok', 'Letup-Letup', 'Susun Nombor']);
  const relaxed = listView(GAMES, CATEGORIES, { query: 'santai' });
  assert.deepEqual(names(relaxed.sections[0].games), ['2048', 'Susun Blok']);
  const kata = listView(GAMES, CATEGORIES, { filter: 'kata' });
  assert.equal(kata.sections.length, 1);
  assert.deepEqual(names(kata.sections[0].games), ['Teka Kata', 'Duga Kata', 'Silang Kata']);
  const ai = listView(GAMES, CATEGORIES, { query: 'lawan ai' });
  assert.deepEqual(names(ai.sections[0].games), ['Congkak', '9-Ball', 'Pemadam']);
  const both = listView(GAMES, CATEGORIES, { filter: 'tradisional', query: 'lawan' });
  assert.deepEqual(names(both.sections[0].games), ['Congkak', 'Pemadam']);
  assert.deepEqual(listView(GAMES, CATEGORIES, { query: 'zzz' }), { sections: [], count: 0 });
});

test('chips: Semua, the categories with playable games (and how many), then Cabaran Harian', () => {
  const list = chips(GAMES, CATEGORIES);
  assert.deepEqual(list.map((c) => c.id), ['semua', 'minda', 'arked', 'kata', 'tradisional', 'teka-teki', 'sukan', 'harian']);
  assert.equal(list[0].count, GAMES.filter((g) => g.status === 'live').length);
  assert.equal(list.find((c) => c.id === 'harian').count, 5);
  // A category with no playable game yet has no chip.
  assert.ok(!chips([{ ...find('silang-kata') }], CATEGORIES).some((c) => c.id === 'kata'));
});

test('every game has a known category', () => {
  for (const g of GAMES) assert.ok(CATEGORIES.some((c) => c.id === g.category), g.id);
});
