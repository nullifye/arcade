// Arked Warga: the game list (by category, with search and filter chips), the shared profile, the
// last game played and combined points.
import { GAMES, CATEGORIES, launchUrl } from './games.js';
import { listView, chips as filterChips } from './catalog.js';
import { fetchSummary, pointsConfigured } from './points.js';
import { PROFILE_KEY, gameKey, migrateLocal, readShared, syncShared, writeShared } from './shared-store.js';
import { formatPlayTime, formatPoints, timeAgo } from './format.js';
import { initInstall } from './install.js';
import { USER_TYPES, CAMPUSES, NON_UITM_CAMPUS, userTypeLabel } from './profile-options.js';
import { enhanceSelect, refreshSelect, closeSelectSheet } from './select.js';
import {
  initAppsWarga,
  appsWargaAllowedUserTypes,
  appsWargaSessionError,
  closeMiniApp,
  notifyAppReady,
} from './appswarga.js';

const $ = (sel) => document.querySelector(sel);
const LIVE = GAMES.filter((g) => g.status === 'live');
const SHARED_KEYS = [PROFILE_KEY, ...LIVE.map((g) => gameKey(g.id))];

let appAllowedTypes = null; // user types the AppsWarga account may use (null = any)
let afterProfile = null;
let toastTimer = 0;
let pointsFor = null; // player id the points card shows
/** The list's search and filter chip; the chip is kept for this visit (back from a game). */
const FILTER_KEY = 'arked.filter';
const view = { query: '', filter: 'semua' };
try { view.filter = sessionStorage.getItem(FILTER_KEY) || 'semua'; } catch { /* unavailable */ }

// ---------- helpers ----------

function h(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Reloads with fresh files: re-downloads every same-site file this page loaded, bypassing the
 * cache (GitHub Pages and AppsWarga's web view both cache them a while), then reloads.
 */
async function hardReload() {
  const btn = $('#btn-version');
  btn.disabled = true;
  toast('Memuat semula…');
  const urls = new Set([location.href.split('#')[0]]);
  for (const entry of performance.getEntriesByType('resource')) {
    try {
      const url = new URL(entry.name);
      if (url.origin === location.origin) urls.add(url.href.split('#')[0]);
    } catch {
      /* not a URL */
    }
  }
  try {
    if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {
    /* Cache Storage unavailable */
  }
  await Promise.allSettled([...urls].map((u) => fetch(u, { cache: 'reload' })));
  location.reload();
}

// ---------- profile ----------

const loadProfile = () => readShared(PROFILE_KEY);

function openProfile() {
  const p = loadProfile();
  $('#dlg-profile').returnValue = '';
  $('#pf-name').value = p?.nickname ?? '';
  $('#pf-type').value = p?.userType ?? '';
  $('#pf-campus').value = p?.campus ?? '';
  $('#pf-error').textContent = '';
  applyUserTypeRules();
  $('#dlg-profile').showModal();
  if (!appAllowedTypes) syncUserTypeFromApp(); // retry, e.g. the first try was offline
}

/** The type to use when a saved one isn't allowed: the only choice, or Orang Awam for public accounts. */
const fallbackType = (allowed) => (allowed.includes('awam') ? 'awam' : allowed[0]);

/**
 * Inside AppsWarga, the signed-in account limits the user type: staff and testers are locked
 * to Staf, students to Pelajar, public accounts choose Alumni or Orang Awam. A saved profile
 * outside those choices is corrected. Outside the app, the player picks any type.
 */
async function syncUserTypeFromApp() {
  const allowed = await appsWargaAllowedUserTypes();
  if (!allowed) return applyUserTypeRules(); // shows why, if AppsWarga refused
  appAllowedTypes = allowed;
  const p = loadProfile();
  if (p && !allowed.includes(p.userType)) {
    writeShared(PROFILE_KEY, { ...p, userType: fallbackType(allowed) });
    renderProfileChip();
  }
  applyUserTypeRules();
}

function applyUserTypeRules() {
  const select = $('#pf-type');
  const allowed = appAllowedTypes;
  for (const opt of select.options) {
    if (!opt.value) continue;
    opt.disabled = Boolean(allowed) && !allowed.includes(opt.value);
  }
  const locked = allowed?.length === 1;
  if (allowed && !allowed.includes(select.value)) select.value = fallbackType(allowed);
  if (select.value === 'awam' && !$('#pf-campus').value) $('#pf-campus').value = NON_UITM_CAMPUS;
  select.disabled = locked;
  select.parentElement.classList.toggle('locked', locked);
  const hint = $('#pf-type-hint');
  const error = allowed ? null : appsWargaSessionError();
  hint.hidden = !error;
  hint.classList.toggle('warn', Boolean(error));
  hint.textContent = error ? `Kategori tidak dapat disemak dengan AppsWarga (${error}).` : '';
  refreshSelect(select);
  refreshSelect($('#pf-campus'));
}

function fillProfileOptions() {
  const type = $('#pf-type');
  type.append(new Option('Pilih kategori…', '', true, false));
  type.options[0].disabled = true;
  for (const t of USER_TYPES) type.append(new Option(t.label, t.value));

  const campus = $('#pf-campus');
  campus.append(new Option('Pilih kampus…', '', true, false));
  campus.options[0].disabled = true;
  for (const group of CAMPUSES) {
    const og = document.createElement('optgroup');
    og.label = group.state;
    for (const c of group.items) og.append(new Option(c, c));
    campus.append(og);
  }
}

function saveProfileFromForm(e) {
  e.preventDefault();
  const nickname = $('#pf-name').value.trim().replace(/\s+/g, ' ');
  const userType = $('#pf-type').value;
  const campus = $('#pf-campus').value;
  if (!nickname) return void ($('#pf-error').textContent = 'Sila masukkan nama panggilan.');
  if (!userType || (appAllowedTypes && !appAllowedTypes.includes(userType))) {
    return void ($('#pf-error').textContent = 'Sila pilih kategori.');
  }
  if (!campus) return void ($('#pf-error').textContent = 'Sila pilih kampus.');
  const prev = loadProfile();
  writeShared(PROFILE_KEY, { playerId: prev?.playerId ?? uuid(), nickname: nickname.slice(0, 20), userType, campus });
  $('#dlg-profile').close('saved');
  render();
  const next = afterProfile;
  afterProfile = null;
  if (next) next();
}

function renderProfileChip() {
  const p = loadProfile();
  $('#chip-avatar').textContent = p ? p.nickname.charAt(0).toUpperCase() : '?';
  $('#chip-name').textContent = p ? p.nickname : 'Tetapkan profil';
  $('#chip-meta').textContent = !p
    ? 'Nama, kategori & kampus'
    : p.userType === 'awam'
      ? userTypeLabel(p.userType)
      : `${userTypeLabel(p.userType)} · ${p.campus}`;
}

// ---------- games ----------

let launching = false;

/**
 * Opens a game once there's a profile (asking for one first). The tapped button shows a spinner
 * straight away, as the hub stays on screen until the game's page draws.
 */
function play(game, button) {
  if (launching) return;
  if (!loadProfile()) {
    afterProfile = () => play(game, button);
    return openProfile();
  }
  launching = true;
  document.body.classList.add('launching');
  button?.classList.add('is-launching');
  button?.setAttribute('aria-busy', 'true');
  const key = gameKey(game.id);
  // Saved on this device at once (what the hub and games read); AppsWarga's copy follows.
  writeShared(key, { ...readShared(key), lastPlayedAt: Date.now() });
  // One frame, so the spinner shows, then go. If the page is still here much later (offline),
  // let the buttons work again.
  requestAnimationFrame(() => setTimeout(() => { location.href = launchUrl(game); }, 0));
  setTimeout(endLaunch, 10000);
}

function endLaunch() {
  launching = false;
  document.body.classList.remove('launching');
  for (const b of document.querySelectorAll('.is-launching')) {
    b.classList.remove('is-launching');
    b.removeAttribute('aria-busy');
  }
}

// ---------- prefetch ----------

/**
 * While the hub sits idle, fetches each live game's page and small files (warga-games
 * preload.json, written by its tools/preload.mjs) into the browser's cache, so a tapped game
 * opens almost at once. Plain low-priority fetches, a few at a time: unlike <link rel=prefetch>
 * they also work in Safari and iOS WebViews, and fill the normal cache the game page reads.
 * Skipped with data saver on or on a 2G connection; any failure just means no head start.
 */
async function prefetchGames() {
  const conn = navigator.connection;
  if (conn?.saveData || /2g/.test(conn?.effectiveType ?? '')) return;
  const urls = new Set();
  const lists = new Map(); // games base URL -> its preload.json games
  for (const g of LIVE) {
    try {
      const page = new URL(launchUrl(g));
      const base = new URL('../', page).href;
      if (!lists.has(base)) lists.set(base, fetch(`${base}preload.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
      const files = (await lists.get(base))?.games?.[page.pathname.split('/').filter(Boolean).at(-1)];
      if (!files) continue;
      urls.add(page.href); // the page exactly as Main opens it, so its cached copy is the one used
      for (const file of files.slice(1)) urls.add(new URL(file, base).href);
    } catch {
      /* not a warga-games game: nothing to prefetch */
    }
  }
  const queue = [...urls];
  const worker = async () => {
    while (queue.length && !launching) {
      // Read the body to the end so the response is stored in the cache.
      await fetch(queue.shift(), { priority: 'low' }).then((r) => r.arrayBuffer()).catch(() => {});
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

/** One game's row: icon, name, a line of description, labels, and Main (or Akan Datang). */
function gameRow(g) {
  const live = g.status === 'live';
  const li = h('li', `game-row${live ? '' : ' soon'}`);
  const icon = h('img', 'game-icon');
  icon.src = g.icon;
  icon.alt = '';
  icon.width = 48;
  icon.height = 48;
  icon.loading = 'lazy';
  const body = h('div', 'game-body');
  body.append(h('h3', null, g.name), h('p', 'game-desc', g.desc));
  const tags = h('div', 'game-tags');
  for (const t of g.tags) tags.append(h('span', `tag${t === 'Harian' ? ' tag-daily' : ''}`, t === 'Harian' ? 'Cabaran Harian' : t));
  if (tags.childElementCount) body.append(tags);
  li.append(icon, body);
  if (live) {
    const btn = h('button', 'btn btn-tonal game-play', 'Main');
    btn.type = 'button';
    btn.setAttribute('aria-label', `Main ${g.name}`);
    btn.addEventListener('click', (e) => { e.stopPropagation(); play(g, btn); });
    // As in an Android list, the whole row opens the game.
    li.addEventListener('click', () => play(g, btn));
    li.append(btn);
  } else {
    li.append(h('span', 'tag tag-soon', 'Akan Datang'));
    li.setAttribute('aria-disabled', 'true');
  }
  return li;
}

function renderChips() {
  const box = $('#chips');
  const list = filterChips(GAMES, CATEGORIES);
  if (!list.some((c) => c.id === view.filter)) view.filter = 'semua';
  box.replaceChildren(...list.map((c) => {
    const b = h('button', 'chip');
    b.type = 'button';
    b.dataset.filter = c.id;
    b.setAttribute('aria-pressed', String(c.id === view.filter));
    b.append(h('span', null, c.name));
    if (c.id !== 'semua') b.append(h('span', 'chip-count', String(c.count)));
    b.addEventListener('click', () => setFilter(c.id));
    return b;
  }));
}

function setFilter(id) {
  view.filter = id;
  try { sessionStorage.setItem(FILTER_KEY, id); } catch { /* unavailable */ }
  for (const b of document.querySelectorAll('#chips .chip')) b.setAttribute('aria-pressed', String(b.dataset.filter === id));
  // Bring the chosen chip into view (the row scrolls sideways on a phone).
  document.querySelector(`#chips .chip[data-filter="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  renderList();
  // Show the list from its top.
  const top = $('#game-list').getBoundingClientRect().top + window.scrollY - $('#hub-top').offsetHeight - 8;
  if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

/** The games: by category, or what the search and the filter chip find. */
function renderList() {
  const { sections, count } = listView(GAMES, CATEGORIES, view);
  const browsing = view.filter === 'semua' && !view.query.trim();
  $('#hub-home').hidden = !browsing; // points and Sambung bermain only on the full list
  $('.screen-hub').classList.toggle('filtering', !browsing);
  const list = $('#game-list');
  if (!count) {
    const empty = h('div', 'list-empty');
    empty.append(h('p', 'list-empty-title', view.query.trim() ? `Tiada permainan untuk “${view.query.trim()}”` : 'Tiada permainan di sini'));
    empty.append(h('p', null, 'Cuba perkataan lain, atau lihat semua permainan.'));
    const all = h('button', 'btn btn-tonal', 'Lihat semua');
    all.type = 'button';
    all.addEventListener('click', () => { clearSearch(); setFilter('semua'); });
    empty.append(all);
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...sections.map((sec) => {
    const box = h('section', `game-section${sec.id === 'soon' ? ' soon' : ''}`);
    if (sec.title) {
      const head = h('h2', 'section-title', sec.title);
      head.append(h('span', 'section-count', String(sec.games.length)));
      box.append(head);
    } else {
      box.append(h('p', 'results-count', `${count} permainan`));
    }
    const ul = h('ul', 'game-rows');
    ul.append(...sec.games.map(gameRow));
    box.append(ul);
    return box;
  }));
}

function clearSearch() {
  view.query = '';
  $('#search').value = '';
  $('#search-clear').hidden = true;
}

function initSearch() {
  const input = $('#search');
  input.addEventListener('input', () => {
    view.query = input.value;
    $('#search-clear').hidden = !input.value;
    renderList();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) { e.preventDefault(); clearSearch(); renderList(); }
    if (e.key === 'Enter') input.blur(); // closes the phone's keyboard; the results are already there
  });
  $('#search-clear').addEventListener('click', () => { clearSearch(); renderList(); input.focus(); });
  // "/" jumps to the search (on a keyboard).
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || document.activeElement === input || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    input.focus();
  });
  // A shadow under the pinned bar once the page scrolls under it.
  const top = $('#hub-top');
  const onScroll = () => top.classList.toggle('scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function renderContinue() {
  const card = $('#continue');
  let best = null;
  for (const g of LIVE) {
    const rec = readShared(gameKey(g.id));
    if (rec?.lastPlayedAt && (!best || rec.lastPlayedAt > best.rec.lastPlayedAt)) best = { g, rec };
  }
  card.hidden = !best;
  if (!best) return;
  const { g, rec } = best;
  $('#continue-icon').src = g.icon;
  $('#continue-name').textContent = g.name;
  $('#continue-meta').textContent = `Dimainkan ${timeAgo(rec.lastPlayedAt)}`;
  $('#continue-btn').onclick = () => play(g, $('#continue-btn'));
}

// ---------- points ----------

let pointsSummary = null; // the last summary loaded, for the Butiran dialog

/** A game's icon from the catalogue, or its initial on a tinted square if it isn't listed. */
function pointsIcon(row, size) {
  const g = GAMES.find((x) => x.id === row.game);
  if (g) {
    const img = h('img', 'pts-icon');
    img.src = g.icon;
    img.alt = '';
    img.width = size;
    img.height = size;
    return img;
  }
  return h('span', 'pts-icon pts-icon-blank', (row.name || '?').charAt(0).toUpperCase());
}

/** The last points loaded, kept on this phone per player, so the card opens with them at once. */
const POINTS_CACHE = 'arked.points';
function cachedPoints(playerId) {
  try {
    const c = JSON.parse(localStorage.getItem(POINTS_CACHE));
    return c?.playerId === playerId && c.summary?.total ? c.summary : null;
  } catch {
    return null;
  }
}
function cachePoints(playerId, summary) {
  try { localStorage.setItem(POINTS_CACHE, JSON.stringify({ playerId, summary })); } catch { /* unavailable */ }
}

/** Fills the card from a summary (and keeps it for Butiran). */
function renderPoints(summary) {
  const { total, games } = summary;
  pointsSummary = summary;
  $('#points-total').textContent = formatPoints(total.points);
  $('#points-plays').textContent = formatPoints(total.plays);
  $('#points-time').textContent = formatPlayTime(total.seconds);
  $('#points-count').textContent = formatPoints(games.length);
  // The top four games' icons overlapping (+N for the rest), and their names, highest first.
  const top = games.slice(0, 4);
  const stack = h('span', 'pts-stack');
  stack.append(...top.map((g) => pointsIcon(g, 28)));
  if (games.length > 4) stack.append(h('span', 'pts-icon pts-more', `+${games.length - 4}`));
  $('#points-games').replaceChildren(stack, h('span', 'pts-top', top.length ? top.map((g) => g.name).join(', ') : 'Main untuk kumpul markah'));
}

function setPointsLoading(loading) {
  const card = $('#points');
  card.classList.toggle('loading', loading);
  card.toggleAttribute('aria-busy', loading);
  card.disabled = loading;
}

/**
 * The points card keeps its place while the points load, so nothing below it moves: it opens
 * with the last points loaded on this phone, or as a placeholder of the same size the first
 * time, and is filled in when the reply comes. It hides only without a profile, or when the first
 * load fails with nothing to show.
 */
async function loadPoints() {
  const card = $('#points');
  const p = loadProfile();
  if (!p || !pointsConfigured()) {
    card.hidden = true;
    pointsFor = null;
    return;
  }
  if (pointsFor !== p.playerId) {
    // Another profile, or the first load: never show someone else's numbers.
    const cached = cachedPoints(p.playerId);
    if (cached) renderPoints(cached);
    setPointsLoading(!cached);
    card.hidden = false;
  }
  pointsFor = p.playerId;
  try {
    const summary = await fetchSummary(p.playerId);
    if (pointsFor !== p.playerId) return; // the profile changed meanwhile
    renderPoints(summary);
    cachePoints(p.playerId, summary);
    setPointsLoading(false);
  } catch {
    // Offline, or the table isn't set up: keep the last numbers if there are any.
    if (card.classList.contains('loading')) card.hidden = true;
  }
}

/** Butiran: every game played, highest first, with its rounds, play time and a bar against the top. */
function openPointsDetail() {
  const sum = pointsSummary;
  if (!sum) return;
  const { total, games } = sum;
  $('#pd-points').textContent = formatPoints(total.points);
  $('#pd-plays').textContent = formatPoints(total.plays);
  $('#pd-time').textContent = formatPlayTime(total.seconds);
  $('#pd-count').textContent = formatPoints(games.length);
  const max = Math.max(1, ...games.map((g) => g.points));
  $('#pd-list').replaceChildren(...games.map((g, i) => {
    const li = h('li', 'pd-row');
    li.append(h('span', 'pd-rank', String(i + 1)), pointsIcon(g, 40));
    const body = h('span', 'pd-body');
    body.append(h('strong', null, g.name), h('small', null, `${formatPoints(g.plays)} pusingan · ${formatPlayTime(g.seconds)}`));
    const bar = h('span', 'pd-bar');
    const fill = h('i');
    fill.style.width = `${Math.max(3, (g.points / max) * 100).toFixed(1)}%`;
    bar.append(fill);
    body.append(bar);
    li.append(body, h('b', 'pd-points', formatPoints(g.points)));
    return li;
  }));
  $('#dlg-points').showModal();
}

// ---------- wiring ----------

function render() {
  renderProfileChip();
  renderContinue();
  renderChips();
  renderList();
  loadPoints();
}

/** Re-reads everything, e.g. back from a game (which may have changed the shared values). */
function refresh() {
  render();
  syncShared(SHARED_KEYS, render);
}

function init() {
  // Teka Kata players already have a profile on this site; keep it (and their scores).
  migrateLocal('tk.profile', PROFILE_KEY);
  initAppsWarga();
  syncUserTypeFromApp();
  fillProfileOptions();
  enhanceSelect($('#pf-type'));
  enhanceSelect($('#pf-campus'));
  $('#pf-type').addEventListener('change', () => {
    if ($('#pf-type').value !== 'awam') return;
    $('#pf-campus').value = NON_UITM_CAMPUS;
    refreshSelect($('#pf-campus'));
  });

  for (const id of ['#profile-chip', '#btn-avatar']) {
    $(id).addEventListener('click', () => {
      afterProfile = null;
      openProfile();
    });
  }
  initSearch();
  $('#profile-form').addEventListener('submit', saveProfileFromForm);
  $('#pf-cancel').addEventListener('click', () => $('#dlg-profile').close('cancel'));
  $('#dlg-profile').addEventListener('close', () => {
    closeSelectSheet();
    if ($('#dlg-profile').returnValue !== 'saved') afterProfile = null;
  });

  $('#btn-help').addEventListener('click', () => $('#dlg-help').showModal());
  $('#points').addEventListener('click', openPointsDetail);
  $('#pd-close').addEventListener('click', () => $('#dlg-points').close());
  $('#help-close').addEventListener('click', () => $('#dlg-help').close());
  $('#btn-close-app').addEventListener('click', closeMiniApp);
  $('#btn-version').addEventListener('click', hardReload);
  initInstall($('#btn-install'), toast);

  // Back from a game: the page may come from the back/forward cache, so read everything again.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    endLaunch(); // a game was opened from here: its button shouldn't still be spinning
    refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });

  render();
  syncShared(SHARED_KEYS, render);
  requestAnimationFrame(() => notifyAppReady());
  // Prefetch the games once the hub has loaded and the phone has a quiet moment.
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
  const later = () => idle(() => prefetchGames(), { timeout: 4000 });
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
}

init();
