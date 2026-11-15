/* Vice Blind popup. */
(async function () {
  'use strict';
  const VB = globalThis.VB;
  const api = VB.api;
  const S = VB.settings;
  const UI = VB.ui;
  const $ = (id) => document.getElementById(id);

  let s = await UI.init();
  let tab = null;
  let pageHost = '';
  let info = null;

  UI.sun($('sun'));
  UI.palms($('palms'));

  const HINTS = {
    light: 'GTA 6 and GTA VI in every spelling.',
    balanced: 'Adds the main characters and places.',
    strict: 'Adds Rockstar, Take-Two and GTA Online. Hides more.',
  };

  /* ---------- helpers ---------- */

  const set = (patch) => { Object.assign(s, patch); return S.save(patch).catch(() => UI.toast('Could not save')); };
  const midnight = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); };
  const mins = (ms) => Math.max(1, Math.ceil(ms / 60000));
  const daysTo = (iso) => Math.ceil((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86400000);
  const num = (n) => { const b = document.createElement('span'); b.className = 'num'; b.textContent = String(n); return b; };

  async function readTab() {
    try {
      tab = (await api.tabs.query({ active: true, currentWindow: true }))[0] || null;
      const u = tab && tab.url ? new URL(tab.url) : null;
      pageHost = u && /^https?:$/.test(u.protocol) ? u.hostname : '';
    } catch (_) { tab = null; pageHost = ''; }
    info = null;
    if (tab && pageHost) {
      try { info = await api.tabs.sendMessage(tab.id, { type: 'vb-status' }, { frameId: 0 }); } catch (_) { info = null; }
    }
  }

  /* ---------- render ---------- */

  function renderStatus() {
    const paused = S.isPaused(s);
    const on = s.enabled && !paused;
    $('statusText').textContent = !s.enabled ? 'Off' : paused ? 'Paused' : 'Shield on';
    $('status').classList.toggle('off', !on);
    document.body.classList.toggle('is-off', !s.enabled);
    $('shieldText').textContent = s.enabled ? 'GTA VI is hidden on every site.' : 'Off. Nothing is hidden.';
  }

  function renderPage() {
    const host = $('host');
    const stat = $('pageStat');
    const btn = $('trust');
    stat.textContent = '';
    if (!pageHost) {
      host.textContent = 'Not available on this page';
      host.classList.add('dim');
      btn.hidden = true;
      return;
    }
    host.classList.remove('dim');
    host.textContent = pageHost.replace(/^www\./, '');
    const trusted = S.isTrusted(s, pageHost);
    btn.hidden = false;
    btn.textContent = trusted ? 'Untrust' : 'Trust site';
    if (trusted) stat.textContent = 'Trusted. Nothing hidden here.';
    else if (!info) stat.textContent = 'Reload the page to start.';
    else if (info.curtain) stat.textContent = 'Whole page hidden.';
    else if (info.count > 0) { stat.append(num(info.count), ' hidden here'); }
    else stat.textContent = 'Nothing to hide here.';
  }

  function renderPause() {
    const box = $('pause');
    box.textContent = '';
    if (S.isPaused(s)) {
      const left = document.createElement('div');
      left.className = 'split';
      const p = document.createElement('p');
      p.className = 'muted';
      p.append('Paused, ', num(mins(s.pausedUntil - Date.now())), ' min left');
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = 'Resume';
      b.addEventListener('click', async () => { await set({ pausedUntil: 0 }); try { await api.alarms.clear('vb-resume'); } catch (_) { /* ignore */ } refresh(); });
      left.append(p, b);
      box.append(left);
      return;
    }
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const [label, ms] of [['15 min', 15 * 60000], ['1 hour', 60 * 60000], ['Today', 0]]) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', async () => {
        const until = ms ? Date.now() + ms : midnight();
        await set({ pausedUntil: until });
        try { await api.alarms.create('vb-resume', { when: until }); } catch (_) { /* ignore */ }
        refresh();
      });
      chips.append(b);
    }
    box.append(chips);
  }

  async function renderStats() {
    const st = await S.loadStats();
    $('sHits').textContent = st.hits > 9999 ? '9999+' : String(st.hits);
    $('sDays').textContent = String(S.daysSince(s.installedAt));
    if (s.pcDate) {
      const d = daysTo(s.pcDate);
      $('sPc').textContent = d > 0 ? String(d) : '0';
      $('sPcLabel').textContent = d === 1 ? 'Day to PC' : 'Days to PC';
    } else {
      $('sPc').textContent = 'TBA';
      $('sPcLabel').textContent = 'PC date';
    }
  }

  function noticeBox(text, buttons) {
    const n = $('notice');
    n.textContent = '';
    const p = document.createElement('p');
    p.textContent = text;
    const row = document.createElement('div');
    row.className = 'chips';
    for (const [label, fn, ghost] of buttons) {
      const b = document.createElement('button');
      b.className = 'btn small' + (ghost ? ' ghost' : '');
      b.textContent = label;
      b.addEventListener('click', fn);
      row.append(b);
    }
    n.append(p, row);
    n.hidden = false;
  }

  async function renderNotice() {
    $('notice').hidden = true;
    let hasAll = true;
    try { hasAll = await api.permissions.contains({ origins: ['<all_urls>'] }); } catch (_) { /* ignore */ }
    if (!hasAll) {
      noticeBox('Vice Blind needs access to all sites to hide GTA VI everywhere.', [[
        'Grant access', async () => { try { await api.permissions.request({ origins: ['<all_urls>'] }); } catch (_) { /* ignore */ } renderNotice(); },
      ]]);
      return;
    }
    if (s.enabled && s.pcDate && daysTo(s.pcDate) <= 0) {
      noticeBox('Your PC date has arrived. It is out for you. Turn Vice Blind off?', [
        ['Turn off', async () => { await set({ enabled: false }); refresh(); }],
        ['Clear date', async () => { await set({ pcDate: '' }); refresh(); }, true],
      ]);
    }
  }

  function renderControls() {
    $('levelHint').textContent = HINTS[s.level];
    levelSeg.set(s.level);
    styleSeg.set(s.style);
    shieldSw.set(s.enabled);
    $('motion').textContent = 'Motion: ' + (UI.motionOn() ? 'on' : 'off');
    $('motion').setAttribute('aria-pressed', String(UI.motionOn()));
  }

  /* ---------- controls ---------- */

  const shieldSw = UI.switch($('shield'), s.enabled, async (v) => { await set({ enabled: v }); refresh(); });
  const levelSeg = UI.seg($('level'), s.level, async (v) => { await set({ level: v }); $('levelHint').textContent = HINTS[v]; UI.toast('Level: ' + v); });
  const styleSeg = UI.seg($('style'), s.style, async (v) => { await set({ style: v }); UI.toast('Style: ' + v); });

  $('trust').addEventListener('click', async () => {
    const host = pageHost.replace(/^www\./, '');
    const trusted = S.isTrusted(s, pageHost);
    const list = trusted ? s.trusted.filter((t) => { const x = t.replace(/^www\./, ''); return !(host === x || host.endsWith('.' + x)); }) : [...s.trusted, host];
    await set({ trusted: list });
    UI.toast(trusted ? 'Untrusted ' + host : 'Trusted ' + host);
    setTimeout(refresh, 250);
  });

  $('openOptions').addEventListener('click', () => { api.runtime.openOptionsPage(); window.close(); });
  $('motion').addEventListener('click', async () => { await UI.toggleMotion(); renderControls(); });

  /* ---------- refresh ---------- */

  async function refresh() {
    s = await S.load();
    await readTab();
    renderStatus();
    renderPage();
    renderPause();
    renderControls();
    renderStats();
    renderNotice();
  }

  api.storage.onChanged.addListener((_c, area) => { if (area === 'sync') refresh(); });
  await refresh();
  // Keep the hidden-count live while the popup stays open.
  setInterval(async () => { await readTab(); renderPage(); if (S.isPaused(s)) renderPause(); }, 1500);
})();
