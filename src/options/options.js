/* Vice Blind settings page. */
(async function () {
  'use strict';
  const VB = globalThis.VB;
  const api = VB.api;
  const S = VB.settings;
  const K = VB.keywords;
  const UI = VB.ui;
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  document.documentElement.classList.add('js');
  let s = await UI.init();

  UI.title($('title'), ['Settings']);
  UI.ticker($('ticker'), 'NO SPOILERS · WAIT FOR PC · STAY BLIND · ');

  const set = async (patch, quiet) => {
    Object.assign(s, patch);
    try { await S.save(patch); if (!quiet) UI.toast('Saved'); } catch (_) { UI.toast('Could not save'); }
  };

  const HINTS = {
    light: 'Core only: GTA 6 and GTA VI in every spelling.',
    balanced: 'Core, characters and places. The best default.',
    strict: 'Adds Rockstar, Take-Two and GTA Online. Catches more and hides some things that are not about GTA VI.',
  };

  /* ---------- 01 protection ---------- */

  const demo = VB.demo.bind(
    (() => { const c = VB.demo.card('Top 10 GTA 6 trailer details you missed', 'gamenews.example · 2h ago'); $('demo').append(c); return c; })(),
    () => ({ style: s.style, reveal: s.reveal }),
  );

  const levelSeg = UI.seg($('level'), s.level, (v) => { set({ level: v }); $('levelHint').textContent = HINTS[v]; renderPacks(); renderTest(); });
  const styleSeg = UI.seg($('style'), s.style, (v) => { set({ style: v }); demo.render(); });
  const revealSeg = UI.seg($('reveal'), s.reveal, (v) => { set({ reveal: v }); demo.render(); });
  const curtainSw = UI.switch($('curtain'), s.curtain, (v) => set({ curtain: v }));

  /* ---------- 02 words ---------- */

  function renderPacks() {
    const box = $('packs');
    box.textContent = '';
    const included = K.LEVELS[s.level];
    for (const pack of K.PACKS) {
      const on = included.includes(pack.id);
      const sec = make('div', 'pack' + (on ? '' : ' off'));
      const head = make('div', 'pack-head');
      head.append(make('h3', null, pack.name), make('p', null, pack.note));
      if (!on) head.append(make('span', 'tag', 'not in ' + s.level));
      const chips = make('div', 'chips');
      for (const term of pack.terms) {
        if (pack.id === 'core') {
          chips.append(make('span', 'chip locked', term.label));
          continue;
        }
        const b = make('button', 'chip', term.label);
        b.type = 'button';
        const muted = s.muted.includes(term.label);
        b.setAttribute('aria-pressed', String(!muted));
        b.addEventListener('click', () => {
          const next = s.muted.includes(term.label) ? s.muted.filter((x) => x !== term.label) : [...s.muted, term.label];
          set({ muted: next }, true);
          b.setAttribute('aria-pressed', String(!next.includes(term.label)));
          renderTest();
        });
        chips.append(b);
      }
      sec.append(head, chips);
      box.append(sec);
    }
  }

  function renderCustom() {
    const box = $('customChips');
    box.textContent = '';
    if (!s.custom.length) { box.append(make('span', 'dim', 'No custom words yet.')); return; }
    for (const w of s.custom) {
      const c = make('span', 'chip', w);
      const x = make('button', 'x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove ' + w);
      x.addEventListener('click', () => { set({ custom: s.custom.filter((y) => y !== w) }); renderCustom(); renderTest(); });
      c.append(x);
      box.append(c);
    }
  }

  $('customForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('customInput').value.trim().slice(0, 60);
    if (v.replace(/\*/g, '').length < 2) { UI.toast('Use at least 2 letters'); return; }
    if (s.custom.some((x) => x.toLowerCase() === v.toLowerCase())) { UI.toast('Already added'); return; }
    set({ custom: [...s.custom, v] });
    $('customInput').value = '';
    renderCustom();
    renderTest();
  });

  function renderTest() {
    const text = $('testInput').value;
    const out = $('testOut');
    out.textContent = '';
    const matches = K.compile(s).all(text);
    let at = 0;
    for (const m of matches) {
      if (m.index > at) out.append(text.slice(at, m.index));
      const mk = make('mark', null, text.slice(m.index, m.end));
      mk.title = m.term ? m.term.label : '';
      out.append(mk);
      at = m.end;
    }
    out.append(text.slice(at));
    $('testCount').textContent = matches.length
      ? matches.length + (matches.length === 1 ? ' match. This would be hidden.' : ' matches. These would be hidden.')
      : 'No matches. Nothing here would be hidden.';
  }
  $('testInput').addEventListener('input', renderTest);

  /* ---------- 03 sites ---------- */

  function cleanHost(v) {
    let h = String(v).trim().toLowerCase();
    try { if (/^[a-z]+:\/\//.test(h)) h = new URL(h).hostname; } catch (_) { /* keep as typed */ }
    return h.replace(/^www\./, '').replace(/\/.*$/, '').replace(/[^a-z0-9.\-]/g, '');
  }

  function renderSites() {
    const ul = $('siteList');
    ul.textContent = '';
    if (!s.trusted.length) { ul.append(make('li', 'empty', 'No trusted sites. Vice Blind runs everywhere.')); return; }
    for (const h of s.trusted) {
      const li = make('li');
      li.append(make('span', null, h));
      const b = make('button', 'btn small ghost', 'Remove');
      b.type = 'button';
      b.addEventListener('click', () => { set({ trusted: s.trusted.filter((x) => x !== h) }); renderSites(); });
      li.append(b);
      ul.append(li);
    }
  }

  $('siteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const h = cleanHost($('siteInput').value);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) { UI.toast('That is not a site address'); return; }
    if (!s.trusted.includes(h)) set({ trusted: [...s.trusted, h] });
    $('siteInput').value = '';
    renderSites();
  });

  /* ---------- 04 release day ---------- */

  function renderRelease() {
    const hint = $('pcHint');
    $('pcDate').value = s.pcDate;
    if (!s.pcDate) { hint.textContent = 'No date set.'; return; }
    const days = Math.ceil((new Date(s.pcDate + 'T00:00:00').getTime() - Date.now()) / 86400000);
    hint.textContent = days > 1 ? days + ' days to go.' : days === 1 ? '1 day to go.' : 'That day has arrived. Vice Blind will offer to switch off.';
  }
  $('pcDate').addEventListener('change', () => { set({ pcDate: /^\d{4}-\d{2}-\d{2}$/.test($('pcDate').value) ? $('pcDate').value : '' }); renderRelease(); });
  $('pcClear').addEventListener('click', () => { set({ pcDate: '' }); renderRelease(); });

  /* ---------- 05 data ---------- */

  $('export').addEventListener('click', () => {
    const data = {};
    for (const k of S.KEYS) if (k !== 'pausedUntil' && k !== 'installedAt') data[k] = s[k];
    const url = URL.createObjectURL(new Blob([JSON.stringify({ app: 'vice-blind', version: 1, settings: data }, null, 2)], { type: 'application/json' }));
    const a = make('a');
    a.href = url;
    a.download = 'vice-blind-settings.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async () => {
    const f = $('importFile').files[0];
    $('importFile').value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (!json || json.app !== 'vice-blind' || typeof json.settings !== 'object') throw new Error('not a Vice Blind file');
      const next = S.clean({ ...json.settings, pausedUntil: 0, installedAt: s.installedAt });
      await set(next, true);
      renderAll();
      UI.toast('Imported');
    } catch (_) { UI.toast('That file could not be imported'); }
  });

  let resetArmed = 0;
  $('reset').addEventListener('click', async () => {
    if (!resetArmed) {
      $('reset').textContent = 'Click again to reset';
      resetArmed = setTimeout(() => { resetArmed = 0; $('reset').textContent = 'Reset'; }, 3500);
      return;
    }
    clearTimeout(resetArmed);
    resetArmed = 0;
    $('reset').textContent = 'Reset';
    await set({ ...S.clean({}), installedAt: s.installedAt }, true);
    renderAll();
    UI.toast('Reset to defaults');
  });

  /* ---------- header, status, motion ---------- */

  function renderStatus() {
    const paused = S.isPaused(s);
    $('statusText').textContent = !s.enabled ? 'Off' : paused ? 'Paused' : 'Shield on';
    $('status').classList.toggle('off', !s.enabled || paused);
  }

  const burger = $('burger');
  const nav = $('nav');
  const closeMenu = (focusBtn) => {
    nav.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
    if (focusBtn) burger.focus();
  };
  burger.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
    if (open) nav.querySelector('a').focus();
  });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) closeMenu(true); });
  document.addEventListener('click', (e) => { if (nav.classList.contains('open') && !e.target.closest('#head')) closeMenu(false); });
  matchMedia('(min-width: 641px)').addEventListener('change', (e) => { if (e.matches) closeMenu(false); });

  // Mark the section in view in the nav.
  const links = [...nav.querySelectorAll('a')];
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) for (const a of links) a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + en.target.id));
  }, { rootMargin: '-35% 0px -60% 0px' });
  for (const sec of document.querySelectorAll('.sec')) io.observe(sec);

  const renderMotion = () => { $('motion').textContent = 'Motion: ' + (UI.motionOn() ? 'on' : 'off'); $('motion').setAttribute('aria-pressed', String(UI.motionOn())); };
  $('motion').addEventListener('click', async () => { await UI.toggleMotion(); renderMotion(); });

  try { $('version').textContent = 'Vice Blind ' + api.runtime.getManifest().version + ' · made by ROCMINE'; } catch (_) { /* ignore */ }

  function renderAll() {
    levelSeg.set(s.level);
    styleSeg.set(s.style);
    revealSeg.set(s.reveal);
    curtainSw.set(s.curtain);
    $('levelHint').textContent = HINTS[s.level];
    demo.render();
    renderPacks();
    renderCustom();
    renderSites();
    renderRelease();
    renderStatus();
    renderMotion();
    renderTest();
  }

  renderAll();

  // Keep in sync when changed elsewhere (popup, context menu).
  api.storage.onChanged.addListener(async (_c, area) => {
    if (area !== 'sync') return;
    const next = await S.load();
    if (JSON.stringify(next) !== JSON.stringify(s)) { s = next; renderAll(); }
  });
})();
