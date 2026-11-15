/* Vice Blind welcome page. */
(async function () {
  'use strict';
  const VB = globalThis.VB;
  const api = VB.api;
  const S = VB.settings;
  const UI = VB.ui;
  const $ = (id) => document.getElementById(id);

  let s = await UI.init();

  UI.sun($('sun'));
  UI.palms($('palms'));

  const HINTS = {
    light: 'Core only: GTA 6 and GTA VI in every spelling.',
    balanced: 'Adds the main characters and places. The best default.',
    strict: 'Adds Rockstar, Take-Two and GTA Online. Hides more.',
  };

  UI.seg($('level'), s.level, async (v) => {
    s.level = v;
    $('levelHint').textContent = HINTS[v];
    try { await S.save({ level: v }); UI.toast('Level: ' + v); } catch (_) { UI.toast('Could not save'); }
  });
  $('levelHint').textContent = HINTS[s.level];

  // Demo feed: the first and last are about GTA VI (invented headlines), the middle one is not.
  const feed = $('feed');
  const items = [
    ['Top 10 GTA 6 trailer details you missed', 'gamenews.example · 2h ago', true],
    ['Weekend thread: what are you playing?', 'forum.example · 41 replies', false],
    ['Lucia Caminos voice actor interview', 'gamestream.example · yesterday', true],
  ];
  const get = () => ({ style: s.style, reveal: s.reveal });
  const bound = [];
  for (const [title, meta, hide] of items) {
    const c = VB.demo.card(title, meta);
    feed.append(c);
    if (hide) bound.push(VB.demo.bind(c, get));
  }

  api.storage.onChanged.addListener(async (_c, area) => {
    if (area !== 'sync') return;
    s = await S.load();
    $('levelHint').textContent = HINTS[s.level];
    for (const b of bound) b.render();
  });

  $('openSettings').addEventListener('click', () => api.runtime.openOptionsPage());

  const renderMotion = () => { $('motion').textContent = 'Motion: ' + (UI.motionOn() ? 'on' : 'off'); $('motion').setAttribute('aria-pressed', String(UI.motionOn())); };
  $('motion').addEventListener('click', async () => { await UI.toggleMotion(); renderMotion(); });
  renderMotion();
})();
