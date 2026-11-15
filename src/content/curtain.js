/* Vice Blind: the full-page "Not yet." curtain.
 * A neon motel sign on a Vice City dusk. Lives in a closed shadow root so page CSS/JS cannot restyle or read it.
 * Also pauses every <video>/<audio> on the page while it is up.
 */
(function (root) {
  'use strict';
  const VB = (root.VB = root.VB || {});
  const api = VB.api;

  const TAG = 'vice-blind-curtain';
  const FONT_STYLE_ID = 'vice-blind-fonts';

  let host = null;
  let shadow = null;
  let prev = null;            // page state we changed, restored on hide()
  const mutedBefore = new WeakMap();
  let playGuard = null;

  const css = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    .root {
      position: fixed; inset: 0; z-index: 2147483647; overflow: auto; isolation: isolate;
      color: #ffe9d6; -webkit-font-smoothing: antialiased; color-scheme: dark;
      font: 400 16px/1.65 "Vice Blind Sans", Jost, "Century Gothic", "Segoe UI", system-ui, sans-serif;
      background:
        radial-gradient(ellipse 90% 40% at 50% 100%, rgba(255,62,150,.32), transparent 72%),
        linear-gradient(180deg, #12062a 0%, #1b0a33 48%, #3a1050 100%);
      container-type: inline-size;
    }
    .sun { position: absolute; z-index: 0; right: max(-9vmin, -80px); top: 50%; width: min(66vmin, 620px); height: min(66vmin, 620px); translate: 0 -54%; }
    .sun svg, .palms svg { display: block; width: 100%; height: 100%; }
    .sun .slit { transform-box: fill-box; transform-origin: center; animation: slit .9s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(.1s + var(--n) * 90ms); }
    .palms { position: absolute; z-index: 0; left: 0; right: 0; bottom: 0; height: min(max(100px, 24.2vw), 40vh); pointer-events: none; }
    .page { position: relative; z-index: 1; min-height: 100%; display: grid; grid-template-rows: auto 1fr; padding: clamp(14px, 3vw, 36px) clamp(20px, 5vw, 64px) clamp(90px, 24vh, 230px); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .brand { font-family: "Vice Blind Script", Yellowtail, "Brush Script MT", cursive; font-size: 1.8rem; line-height: 1; color: #ffe0ef; text-shadow: 0 0 .08em #ff3e96, 0 0 .35em rgba(255,62,150,.8); }
    .badge { display: inline-flex; align-items: center; gap: 8px; font-size: .88rem; font-weight: 500; color: rgba(255,233,214,.74); }
    .badge i { width: 8px; height: 8px; border-radius: 50%; background: #2de2d0; box-shadow: 0 0 10px #2de2d0; }
    main { display: flex; flex-direction: column; justify-content: center; max-width: 46rem; padding-block: clamp(12px, 3vh, 32px); }
    .sign { margin: 0; font-family: "Vice Blind Script", Yellowtail, "Brush Script MT", cursive; font-weight: 400; line-height: .95;
      font-size: clamp(4.8rem, min(24cqi, 40svh), 14rem); color: #ffe0ef; padding: 0 .1em .2em 0;
      text-shadow: 0 0 .03em #fff, 0 0 .1em #ff3e96, 0 0 .28em #ff3e96, 0 0 .6em rgba(255,62,150,.75), 0 0 1.1em rgba(255,62,150,.45);
      animation: neon-on 1.4s linear .5s both; }
    .lede { margin: clamp(10px, 2.4vh, 22px) 0 0; max-width: 34rem; font-size: 1.08rem; color: rgba(255,233,214,.92); text-wrap: pretty; }
    .found { margin: 8px 0 0; font-size: .94rem; color: rgba(255,233,214,.62); }
    .found b { color: #ff8fbf; font-weight: 600; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: clamp(16px, 3.4vh, 30px); }
    button { appearance: none; font: 600 .96rem/1 "Vice Blind Sans", Jost, "Segoe UI", system-ui, sans-serif; cursor: pointer; border-radius: 999px; min-height: 46px; padding: 0 22px;
      color: #1b0a33; background: #ff3e96; border: 1.5px solid #ff3e96; transition: box-shadow .25s cubic-bezier(.22,1,.36,1), background .25s cubic-bezier(.22,1,.36,1); }
    button:hover { box-shadow: 0 0 0 1px #ff8fbf, 0 0 22px rgba(255,62,150,.6); }
    button.ghost { background: rgba(27,10,51,.78); color: #2de2d0; border-color: #2de2d0; }
    button.ghost:hover { background: rgba(45,226,208,.12); box-shadow: 0 0 18px rgba(45,226,208,.4); }
    button:focus-visible { outline: 2px solid #2de2d0; outline-offset: 3px; }
    .meta { margin: 14px 0 0; font-size: .88rem; color: rgba(255,233,214,.6); }
    .still .sign, .still .slit { animation: none !important; }
    @keyframes slit { from { transform: scaleY(0); } to { transform: scaleY(1); } }
    @keyframes neon-on { 0%, 27% { opacity: .16; } 28%, 42% { opacity: 1; } 43%, 63% { opacity: .2; } 64%, 100% { opacity: 1; } }
    @media (max-width: 640px) { .sun { opacity: .5; right: -22vmin; } .lede { font-size: 1rem; } }
    @media (max-width: 420px) { button { flex: 1 1 100%; } }
    @media (max-height: 420px) { .lede, .found, .meta, .palms { display: none; } .page { padding-bottom: 20px; } }
    @media (forced-colors: active) { .root { background: Canvas; color: CanvasText; } .sign, .brand { text-shadow: none; color: CanvasText; } button { border-color: ButtonText; color: ButtonText; background: ButtonFace; } }
  `;

  function ensureFonts() {
    if (document.getElementById(FONT_STYLE_ID) || !api || !api.runtime) return;
    try {
      const style = document.createElement('style');
      style.id = FONT_STYLE_ID;
      const u = (f) => api.runtime.getURL('assets/fonts/' + f);
      style.textContent =
        `@font-face{font-family:"Vice Blind Script";src:url("${u('Yellowtail-latin.woff2')}") format("woff2");font-weight:400;font-display:swap}` +
        `@font-face{font-family:"Vice Blind Sans";src:url("${u('Jost-latin.woff2')}") format("woff2");font-weight:400 700;font-display:swap}`;
      (document.head || document.documentElement).appendChild(style);
    } catch (_) { /* fonts are a nicety; the fallback stack is fine */ }
  }

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const k of Object.keys(props)) {
      if (k === 'class') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else n.setAttribute(k, props[k]);
    }
    for (const k of kids) if (k) n.append(k);
    return n;
  }

  function pauseMedia(rootNode) {
    const media = rootNode.querySelectorAll ? rootNode.querySelectorAll('video, audio') : [];
    for (const m of media) {
      try {
        if (!mutedBefore.has(m)) mutedBefore.set(m, m.muted);
        m.muted = true;
        m.pause();
      } catch (_) { /* ignore */ }
    }
  }

  function restoreMedia() {
    for (const m of document.querySelectorAll('video, audio')) {
      if (mutedBefore.has(m)) { try { m.muted = mutedBefore.get(m); } catch (_) { /* ignore */ } mutedBefore.delete(m); }
    }
  }

  // Where the match was found, in words.
  const WHERE = { title: 'in the page title', og: 'in the page title', h1: 'in the main heading', url: 'in the address' };

  function show(opts) {
    if (host) return;
    ensureFonts();
    const docEl = document.documentElement;
    if (!docEl) return;

    host = document.createElement(TAG);
    for (const [k, v] of Object.entries({ position: 'fixed', inset: '0', 'z-index': '2147483647', display: 'block', margin: '0', padding: '0', border: '0', width: '100vw', height: '100vh', visibility: 'visible', opacity: '1', transform: 'none', 'pointer-events': 'auto' })) {
      host.style.setProperty(k, v, 'important');
    }
    shadow = host.attachShadow({ mode: 'closed' });
    shadow.append(el('style', { text: css }));

    const matched = opts.matched || {};
    const pcLine = opts.pcDate ? `PC date you set: ${opts.pcDate}` : 'PC date: not set. You can set one in settings.';

    const sun = el('div', { class: 'sun', 'aria-hidden': 'true' });
    const palms = el('div', { class: 'palms', 'aria-hidden': 'true' });
    if (VB.art) { VB.art.mount(sun, VB.art.sun('curtain')); VB.art.mount(palms, VB.art.palms()); }

    const btnBack = el('button', { type: 'button', text: 'Go back' });
    const btnShow = el('button', { type: 'button', class: 'ghost', text: 'Show this page' });
    const btnTrust = el('button', { type: 'button', class: 'ghost', text: 'Trust this site' });
    btnBack.addEventListener('click', () => opts.onBack && opts.onBack());
    btnShow.addEventListener('click', () => opts.onShow && opts.onShow());
    btnTrust.addEventListener('click', () => opts.onTrust && opts.onTrust());

    const rootEl = el('div', { class: 'root' + (opts.motion === 'off' ? ' still' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Vice Blind: spoiler hidden' },
      sun, palms,
      el('div', { class: 'page' },
        el('header', null, el('span', { class: 'brand', text: 'Vice Blind' }), el('span', { class: 'badge' }, el('i'), 'Shield on')),
        el('main', null,
          el('h2', { class: 'sign', text: 'Not yet.' }),
          el('p', { class: 'lede', text: 'This page is about GTA VI. You are waiting for PC, so it stays hidden.' }),
          el('p', { class: 'found' }, 'Found ', el('b', { text: matched.text || 'GTA VI' }), ' ' + (WHERE[matched.where] || 'on this page')),
          el('div', { class: 'actions' }, btnBack, btnShow, btnTrust),
          el('p', { class: 'meta', text: pcLine }))));
    shadow.append(rootEl);

    // Lock the page behind the curtain.
    prev = { overflow: docEl.style.overflow };
    docEl.style.setProperty('overflow', 'hidden', 'important');
    docEl.appendChild(host);
    try { if (document.body) document.body.inert = true; } catch (_) { /* ignore */ }

    // Pause now and keep pausing anything that starts later.
    pauseMedia(document);
    playGuard = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'VIDEO' || t.tagName === 'AUDIO')) {
        if (!mutedBefore.has(t)) mutedBefore.set(t, t.muted);
        t.muted = true;
        t.pause();
      }
    };
    document.addEventListener('play', playGuard, true);

    setTimeout(() => { try { btnBack.focus({ preventScroll: true }); } catch (_) { /* ignore */ } }, 60);
  }

  function hide() {
    if (!host) return;
    host.remove();
    host = shadow = null;
    if (prev) {
      if (prev.overflow) document.documentElement.style.overflow = prev.overflow;
      else document.documentElement.style.removeProperty('overflow');
      prev = null;
    }
    try { if (document.body) document.body.inert = false; } catch (_) { /* ignore */ }
    if (playGuard) { document.removeEventListener('play', playGuard, true); playGuard = null; }
    restoreMedia();
  }

  // Re-apply the page lock once <body> exists and pause media that appeared since show().
  function refresh() {
    if (!host) return;
    try { if (document.body) document.body.inert = true; } catch (_) { /* ignore */ }
    pauseMedia(document);
  }

  VB.curtain = { TAG, show, hide, refresh, isUp: () => !!host, pauseMedia };
})(globalThis);
