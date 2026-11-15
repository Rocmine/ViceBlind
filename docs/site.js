/* Vice Blind website: motion preference, the two illustrations, and the live demo. No network, no storage. */
(function () {
  'use strict';
  const VB = globalThis.VB;
  const UI = VB.ui;
  const $ = (id) => document.getElementById(id);

  // On the website, honour the visitor's reduced-motion setting.
  UI.applyMotion(!matchMedia('(prefers-reduced-motion: reduce)').matches);

  UI.sun($('sun'));
  UI.palms($('palms'));
  UI.palms($('palms2'));

  // Live demo: the real overlay styles from content.css, driven by the same logic as the extension's settings page.
  const state = { style: 'blur', reveal: 'two' };
  const get = () => state;
  const items = [
    ['Top 10 GTA 6 trailer details you missed', 'gamenews.example · 2h ago', true],
    ['Weekend thread: what are you playing?', 'forum.example · 41 replies', false],
    ['Lucia Caminos voice actor interview', 'gamestream.example · yesterday', true],
  ];
  const bound = [];
  for (const [title, meta, hide] of items) {
    const c = VB.demo.card(title, meta);
    $('feed').append(c);
    if (hide) bound.push(VB.demo.bind(c, get));
  }
  UI.seg($('style'), state.style, (v) => { state.style = v; for (const b of bound) b.render(); });
})();
