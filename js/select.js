// Custom dropdown: replaces the native <select> picker (which looks different on Android, iOS
// and desktop) with one bottom-sheet list in the game's own style.
//
// The <select> stays in the page, hidden, as the source of truth: its value, options,
// optgroups, and disabled/hidden flags are read every time the sheet opens. After changing
// any of those from code, call refreshSelect() so the button shows the current value.

const instances = new WeakMap();
let openSheet = null;

const CHECK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

/** Turns `select` into a custom dropdown. Options with 12+ choices get a search box. */
export function enhanceSelect(select, { searchFrom = 12 } = {}) {
  if (instances.has(select)) return;
  const label = select.closest('label')?.querySelector('span')?.textContent?.trim() || '';
  const trigger = el('button', 'select-trigger');
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const describedBy = select.getAttribute('aria-describedby');
  if (describedBy) trigger.setAttribute('aria-describedby', describedBy);
  const text = el('span', 'select-value');
  trigger.append(text);

  // The trigger goes first, so the surrounding <label> activates it, not the hidden select.
  select.before(trigger);
  select.classList.add('select-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const inst = { select, trigger, text, label, searchFrom };
  instances.set(select, inst);
  trigger.addEventListener('click', () => open(inst));
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open(inst);
    }
  });
  refreshSelect(select);
}

/** Updates the button to the select's current value and enabled state. */
export function refreshSelect(select) {
  const inst = instances.get(select);
  if (!inst) return;
  const opt = select.selectedOptions[0];
  const placeholder = !select.value;
  inst.text.textContent = opt ? opt.textContent : '';
  inst.trigger.classList.toggle('placeholder', placeholder);
  inst.trigger.disabled = select.disabled;
  inst.trigger.setAttribute('aria-label', `${inst.label}: ${placeholder ? 'belum dipilih' : opt.textContent}`);
}

function choices(select) {
  // [{ group, options: [{ value, text, disabled }] }], skipping the placeholder and hidden options.
  const groups = [];
  const add = (group, option) => {
    if (!option.value || option.hidden) return;
    let g = groups.at(-1);
    if (!g || g.group !== group) groups.push((g = { group, options: [] }));
    g.options.push({ value: option.value, text: option.textContent, disabled: option.disabled });
  };
  for (const child of select.children) {
    if (child.tagName === 'OPTGROUP') for (const o of child.children) add(child.label, o);
    else add(null, child);
  }
  return groups;
}

function open(inst) {
  const { select, trigger } = inst;
  if (select.disabled) return;
  close();

  const backdrop = el('div', 'sheet-backdrop');
  const sheet = el('div', 'sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', inst.label);

  const head = el('div', 'sheet-head');
  const closeBtn = el('button', 'sheet-close', '×');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Tutup');
  head.append(el('span', 'sheet-title', inst.label), closeBtn);

  const list = el('div', 'sheet-list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', inst.label);

  const groups = choices(select);
  const count = groups.reduce((n, g) => n + g.options.length, 0);
  let search = null;
  if (count >= inst.searchFrom) {
    search = el('input', 'sheet-search');
    search.type = 'search';
    search.placeholder = `Cari ${inst.label.toLowerCase()}…`;
    search.setAttribute('aria-label', search.placeholder);
    search.autocomplete = 'off';
  }

  const items = [];
  for (const g of groups) {
    const section = el('div', 'sheet-group');
    section.setAttribute('role', 'group');
    if (g.group) {
      section.setAttribute('aria-label', g.group);
      section.append(el('div', 'sheet-group-label', g.group));
    }
    for (const o of g.options) {
      const b = el('button', 'sheet-option');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.dataset.value = o.value;
      const selected = o.value === select.value;
      b.setAttribute('aria-selected', String(selected));
      b.disabled = o.disabled;
      b.append(el('span', null, o.text));
      if (selected) b.insertAdjacentHTML('beforeend', CHECK);
      b.addEventListener('click', () => choose(inst, o.value));
      section.append(b);
      items.push({ button: b, section, text: `${o.text} ${g.group ?? ''}`.toLowerCase() });
    }
    list.append(section);
  }
  const empty = el('p', 'sheet-empty', 'Tiada padanan.');
  empty.hidden = true;
  list.append(empty);

  sheet.append(head);
  if (search) sheet.append(search);
  sheet.append(list);
  backdrop.append(sheet);

  // Inside a modal <dialog> the sheet must live in the dialog to sit above it (top layer).
  (trigger.closest('dialog') ?? document.body).append(backdrop);
  trigger.setAttribute('aria-expanded', 'true');

  const visible = () => items.filter((i) => !i.button.hidden && !i.button.disabled).map((i) => i.button);

  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const i of items) i.button.hidden = Boolean(q) && !i.text.includes(q);
      for (const section of list.querySelectorAll('.sheet-group')) {
        section.hidden = ![...section.querySelectorAll('.sheet-option')].some((b) => !b.hidden);
      }
      empty.hidden = visible().length > 0;
    });
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  closeBtn.addEventListener('click', () => close());
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close only the sheet, not the dialog underneath.
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      const opts = visible();
      if (!opts.length) return;
      e.preventDefault();
      const i = opts.indexOf(document.activeElement);
      const next =
        e.key === 'Home' ? 0
        : e.key === 'End' ? opts.length - 1
        : e.key === 'ArrowDown' ? Math.min(opts.length - 1, i + 1)
        : i <= 0 ? (search ? -1 : 0) : i - 1;
      (next < 0 ? search : opts[next]).focus();
    }
  });

  openSheet = { inst, backdrop };
  requestAnimationFrame(() => backdrop.classList.add('open'));

  // Focus the current choice (not the search box, which would pop up the phone keyboard).
  const current = items.find((i) => i.button.dataset.value === select.value)?.button ?? visible()[0];
  current?.focus({ preventScroll: true });
  current?.scrollIntoView({ block: 'center' });
}

function choose(inst, value) {
  const { select } = inst;
  if (select.value !== value) {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  refreshSelect(select);
  close();
}

function close() {
  if (!openSheet) return;
  const { inst, backdrop } = openSheet;
  openSheet = null;
  inst.trigger.setAttribute('aria-expanded', 'false');
  backdrop.classList.remove('open');
  backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
  setTimeout(() => backdrop.remove(), 300); // in case there's no transition (reduced motion)
  inst.trigger.focus({ preventScroll: true });
}

/** Closes any open sheet, e.g. when its dialog closes. */
export const closeSelectSheet = close;
