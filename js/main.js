// Arked Warga: the game list, the shared profile, the last game played and combined points.
import { GAMES, launchUrl } from './games.js';
import { fetchSummary, pointsConfigured } from './points.js';
import { PROFILE_KEY, gameKey, migrateLocal, readShared, syncShared, writeShared } from './shared-store.js';
import { dailyLine, formatPlayTime, formatPoints, timeAgo, todayKL } from './format.js';
import { USER_TYPES, CAMPUSES, NON_UITM_CAMPUS, userTypeLabel } from './profile-options.js';
import { enhanceSelect, refreshSelect, closeSelectSheet } from './select.js';
import {
  initAppsWarga,
  appsWargaAllowedUserTypes,
  appsWargaSessionError,
  closeMiniApp,
  inAppsWarga,
  notifyAppReady,
} from './appswarga.js';

const $ = (sel) => document.querySelector(sel);
const LIVE = GAMES.filter((g) => g.status === 'live');
const SHARED_KEYS = [PROFILE_KEY, ...LIVE.map((g) => gameKey(g.id))];

let appAllowedTypes = null; // user types the AppsWarga account may use (null = any)
let afterProfile = null;
let toastTimer = 0;
let pointsFor = null; // player id the points card shows

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

/** Opens a game once there's a profile (asking for one first). */
function play(game) {
  if (!loadProfile()) {
    afterProfile = () => play(game);
    return openProfile();
  }
  const key = gameKey(game.id);
  const sent = writeShared(key, { ...readShared(key), lastPlayedAt: Date.now() });
  const go = () => {
    location.href = launchUrl(game);
  };
  // In AppsWarga, let its storage take the write before the page goes (briefly; it's quick).
  if (inAppsWarga()) Promise.race([sent, new Promise((r) => setTimeout(r, 400))]).then(go);
  else go();
}

function renderGrid() {
  const today = todayKL();
  const grid = $('#game-grid');
  grid.replaceChildren();
  for (const g of GAMES) {
    const live = g.status === 'live';
    const li = h('li', `game-card${live ? '' : ' soon'}`);
    const icon = h('img', 'game-icon');
    icon.src = g.icon;
    icon.alt = '';
    icon.width = 56;
    icon.height = 56;
    const body = h('div', 'game-body');
    body.append(h('h3', null, g.name), h('p', 'game-desc', g.desc));
    const tags = h('div', 'game-tags');
    if (!live) tags.append(h('span', 'tag tag-soon', 'Akan Datang'));
    for (const t of g.tags) tags.append(h('span', 'tag', t));
    body.append(tags);
    li.append(icon, body);
    if (live) {
      const line = dailyLine(g, readShared(gameKey(g.id)), today);
      if (line) body.append(h('p', 'game-status', line));
      const btn = h('button', 'btn btn-primary game-play', 'Main');
      btn.type = 'button';
      btn.setAttribute('aria-label', `Main ${g.name}`);
      btn.addEventListener('click', () => play(g));
      li.append(btn);
    } else {
      li.setAttribute('aria-disabled', 'true');
    }
    grid.append(li);
  }
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
  const today = todayKL();
  $('#continue-icon').src = g.icon;
  $('#continue-name').textContent = g.name;
  $('#continue-meta').textContent = `Dimainkan ${timeAgo(rec.lastPlayedAt)}`;
  const daily = dailyLine(g, rec, today);
  $('#continue-daily').textContent = daily;
  $('#continue-daily').hidden = !daily;
  const playing = rec.daily?.date === today && rec.daily.status === 'playing';
  const btn = $('#continue-btn');
  btn.textContent = playing ? 'Sambung' : 'Main';
  btn.onclick = () => play(g);
}

// ---------- points ----------

async function loadPoints() {
  const card = $('#points');
  const p = loadProfile();
  if (!p || !pointsConfigured()) {
    card.hidden = true;
    pointsFor = null;
    return;
  }
  if (pointsFor !== p.playerId) card.hidden = true; // don't show another profile's numbers
  pointsFor = p.playerId;
  try {
    const { total, games } = await fetchSummary(p.playerId);
    if (pointsFor !== p.playerId) return; // the profile changed meanwhile
    $('#points-total').textContent = formatPoints(total.points);
    $('#points-plays').textContent = formatPoints(total.plays);
    $('#points-time').textContent = formatPlayTime(total.seconds);
    const list = $('#points-games');
    list.replaceChildren(
      ...games.map((g) => {
        const li = h('li');
        li.append(h('span', null, g.name), h('b', null, formatPoints(g.points)));
        return li;
      }),
    );
    list.hidden = games.length < 2; // one game: the total already says it
    card.hidden = false;
  } catch {
    card.hidden = true; // offline, or the table isn't set up: just leave it out
  }
}

// ---------- wiring ----------

function render() {
  renderProfileChip();
  renderContinue();
  renderGrid();
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

  $('#profile-chip').addEventListener('click', () => {
    afterProfile = null;
    openProfile();
  });
  $('#profile-form').addEventListener('submit', saveProfileFromForm);
  $('#pf-cancel').addEventListener('click', () => $('#dlg-profile').close('cancel'));
  $('#dlg-profile').addEventListener('close', () => {
    closeSelectSheet();
    if ($('#dlg-profile').returnValue !== 'saved') afterProfile = null;
  });

  $('#btn-help').addEventListener('click', () => $('#dlg-help').showModal());
  $('#help-close').addEventListener('click', () => $('#dlg-help').close());
  $('#btn-close-app').addEventListener('click', closeMiniApp);
  $('#btn-version').addEventListener('click', hardReload);

  // Back from a game: the page may come from the back/forward cache, so read everything again.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });

  render();
  syncShared(SHARED_KEYS, render);
  requestAnimationFrame(() => notifyAppReady());
}

init();
