/* Vice Blind: the full-page "NOT YET." curtain.
 * Lives in a closed shadow root so page CSS/JS cannot restyle or read it.
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
  let raf = 0;

  const css = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    .root {
      position: fixed; inset: 0; z-index: 2147483647; overflow: auto;
      color: #ececf2; background: radial-gradient(ellipse at 50% 30%, #0e0c1c 0%, #06060f 68%);
      font: 400 14px/1.7 "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      -webkit-font-smoothing: antialiased; color-scheme: dark;
      display: grid; grid-template-rows: auto 1fr auto; container-type: inline-size;
    }
    .grain { position: absolute; inset: 0; pointer-events: none; opacity: .028;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
    header, footer { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 14px clamp(20px, 3.5vw, 44px); border-bottom: 1px solid rgba(236,236,242,.09); }
    footer { border-bottom: 0; border-top: 1px solid rgba(236,236,242,.09); padding: 0; overflow: hidden; }
    .crumb, .badge { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: rgba(236,236,242,.66); }
    .badge { display: inline-flex; align-items: center; gap: 8px; }
    .badge i { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; animation: pulse 2.4s ease-in-out infinite; }
    main { position: relative; display: flex; flex-direction: column; justify-content: center;
      padding: clamp(20px, 5vh, 56px) clamp(20px, 3.5vw, 44px); max-width: 140rem; width: 100%; margin: 0 auto; }
    .role { margin: 0 0 clamp(10px, 2.4vh, 22px); font-size: 12px; letter-spacing: .06em; color: rgba(236,236,242,.66); }
    .role b { color: #3b6dff; font-weight: 700; }
    .cursor { display: inline-block; width: .6ch; margin-left: 2px; background: #3b6dff; animation: blink 1.1s steps(1) infinite; }
    .title-wrap { position: relative; padding-left: clamp(14px, 2.2vw, 28px); }
    .rail { position: absolute; left: 0; top: .1em; bottom: .1em; width: 2.5px; transform-origin: top; transform: scaleY(0);
      background: linear-gradient(180deg, #3b6dff, #8a4dff 55%, #ee1681); animation: rail .55s cubic-bezier(.22,1,.36,1) .22s forwards; }
    .title { position: relative; margin: 0; font-family: "Vice Blind Unbounded", Unbounded, "Arial Black", Impact, system-ui, sans-serif;
      font-weight: 900; text-transform: uppercase; letter-spacing: -.04em; line-height: .9; text-wrap: balance;
      font-size: clamp(2.6rem, min(17cqi, 30svh), 11rem); }
    .line { display: block; overflow: hidden; padding-bottom: .06em; }
    .done .line { overflow: visible; }
    .ch { display: inline-block; translate: 0 calc(var(--near, 0) * -0.09em);
      text-shadow: 0 0 calc(var(--near, 0) * .45em) rgba(59,109,255, calc(var(--near, 0) * .95));
      transition: translate .22s cubic-bezier(.22,1,.36,1), text-shadow .22s cubic-bezier(.22,1,.36,1);
      animation: rise .95s cubic-bezier(.22,1,.36,1) both, glint 9s linear infinite;
      animation-delay: calc(.25s + var(--i) * 38ms), calc(3.2s + var(--i) * 70ms); }
    .still .ch, .still .rail, .still .reveal, .still .badge i, .still .cursor, .still .ticker-run { animation: none !important; }
    .still .rail { transform: none; } .still .reveal { opacity: 1; }
    .reveal { opacity: 0; transform: translateY(10px); animation: up .5s cubic-bezier(.22,1,.36,1) forwards; }
    .lede { margin: clamp(14px, 3vh, 28px) 0 0; max-width: 60ch; font-size: 13px; line-height: 1.8; color: rgba(236,236,242,.76); text-wrap: pretty; animation-delay: .56s; }
    .found { margin: 12px 0 0; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: rgba(236,236,242,.52); animation-delay: .68s; }
    .found b { color: #ececf2; font-weight: 700; letter-spacing: .04em; text-transform: none; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: clamp(18px, 4vh, 34px); animation-delay: .78s; }
    button { font: 600 12px/1 "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; letter-spacing: .12em; text-transform: uppercase;
      color: #ececf2; background: transparent; border: 1px solid #3b6dff; padding: 0 20px; min-height: 44px; cursor: pointer;
      transition: background .2s cubic-bezier(.22,1,.36,1), color .2s cubic-bezier(.22,1,.36,1); }
    button:hover { background: #3b6dff; color: #fff; }
    button.ghost { border-color: rgba(236,236,242,.3); }
    button.ghost:hover { background: rgba(236,236,242,.12); }
    button:focus-visible { outline: 2px solid #3b6dff; outline-offset: 3px; }
    .meta { margin: 14px 0 0; font-size: 11px; letter-spacing: .08em; color: rgba(236,236,242,.52); animation-delay: .88s; }
    .ticker-run { display: inline-flex; padding: 12px 0; animation: ticker 40s linear infinite; font-size: 11px; letter-spacing: .18em; color: rgba(236,236,242,.52); }
    .ticker-items { white-space: nowrap; }
    @keyframes pulse { 50% { opacity: .35; } }
    @keyframes blink { 50% { opacity: 0; } }
    @keyframes rail { to { transform: scaleY(1); } }
    @keyframes up { to { opacity: 1; transform: none; } }
    @keyframes rise { from { transform: translateY(112%) skewY(7deg); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes glint { 0%, 11%, 100% { color: #ececf2; } 3% { color: #a9c1ff; } 6% { color: #c9a6ff; } 8.5% { color: #ff9ccf; } }
    @keyframes ticker { to { transform: translateX(calc(-100% / 6)); } }
    @media (max-height: 380px) { .lede, .found, .meta, footer { display: none; } .actions { margin-top: 12px; } }
    @media (max-width: 420px) { button { flex: 1 1 100%; } }
    @media (forced-colors: active) { button { border-color: ButtonText; } .root { background: Canvas; color: CanvasText; } }
  `;

  function ensureFonts() {
    if (document.getElementById(FONT_STYLE_ID) || !api || !api.runtime) return;
    try {
      const style = document.createElement('style');
      style.id = FONT_STYLE_ID;
      const u = (f) => api.runtime.getURL('assets/fonts/' + f);
      style.textContent =
        `@font-face{font-family:"Vice Blind Unbounded";src:url("${u('Unbounded-latin.woff2')}") format("woff2");font-weight:400 900;font-display:swap}` +
        `@font-face{font-family:"JetBrains Mono";src:url("${u('JetBrainsMono-latin.woff2')}") format("woff2");font-weight:400 700;font-display:swap}`;
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

  function letters(text, startIndex) {
    const frag = document.createDocumentFragment();
    let i = startIndex;
    for (const c of text) frag.append(el('span', { class: 'ch', style: `--i:${i++}`, text: c === ' ' ? ' ' : c, 'aria-hidden': 'true' }));
    return { frag, next: i };
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

    // Title: "NOT YET." split into letters (index continues across lines).
    const title = el('h2', { class: 'title', 'aria-label': 'Not yet.' });
    const a = letters('Not yet.', 0);
    title.append(el('span', { class: 'line', 'aria-hidden': 'true' }, a.frag));

    const pcLine = opts.pcDate ? `PC date you set: ${opts.pcDate}` : 'PC date: not set. You can set one in settings.';
    const matched = opts.matched || {};
    const found = el('p', { class: 'found reveal' }, 'Found ', el('b', { text: matched.text || 'GTA VI' }), ' ' + (WHERE[matched.where] || 'on this page'));

    const btnBack = el('button', { type: 'button', text: 'Go back' });
    const btnShow = el('button', { type: 'button', class: 'ghost', text: 'Show this page' });
    const btnTrust = el('button', { type: 'button', class: 'ghost', text: 'Trust this site' });
    btnBack.addEventListener('click', () => opts.onBack && opts.onBack());
    btnShow.addEventListener('click', () => opts.onShow && opts.onShow());
    btnTrust.addEventListener('click', () => opts.onTrust && opts.onTrust());

    const tickerText = 'NO SPOILERS · WAIT FOR PC · STAY BLIND · NO SPOILERS · WAIT FOR PC · STAY BLIND · ';
    const run = el('span', { class: 'ticker-run' });
    for (let i = 0; i < 6; i++) run.append(el('span', { class: 'ticker-items', text: tickerText, ...(i ? { 'aria-hidden': 'true' } : {}) }));

    const rootEl = el('div', { class: 'root' + (opts.motion === 'off' ? ' still' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Vice Blind: spoiler hidden' },
      el('div', { class: 'grain', 'aria-hidden': 'true' }),
      el('header', null, el('span', { class: 'crumb', text: '~/vice-blind/shield' }), el('span', { class: 'badge' }, el('i'), 'Shield on')),
      el('main', null,
        el('p', { class: 'role reveal' }, '~/ ', el('b', { text: 'gta vi' }), ' spoiler hidden', el('span', { class: 'cursor', 'aria-hidden': 'true', text: ' ' })),
        el('div', { class: 'title-wrap' }, el('span', { class: 'rail', 'aria-hidden': 'true' }), title),
        el('p', { class: 'lede reveal', text: 'This page is about GTA VI. You are waiting for PC, so it stays hidden.' }),
        found,
        el('div', { class: 'actions reveal' }, btnBack, btnShow, btnTrust),
        el('p', { class: 'meta reveal', text: pcLine })),
      el('footer', { 'aria-hidden': 'true' }, run));
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

    // Signature title motion: after the last letter lands, release the mask; letters react to the pointer.
    const letterEls = [...shadow.querySelectorAll('.ch')];
    setTimeout(() => rootEl.classList.add('done'), 250 + letterEls.length * 38 + 950);
    if (opts.motion !== 'off' && matchMedia('(pointer: fine)').matches) {
      let mx = -9999, my = -9999;
      const tick = () => {
        raf = 0;
        const base = title.getBoundingClientRect();
        for (const l of letterEls) {
          const cx = base.left + l.offsetLeft + l.offsetWidth / 2;
          const cy = base.top + l.offsetTop + l.offsetHeight / 2;
          const d = Math.hypot(mx - cx, my - cy);
          const t = Math.max(0, 1 - d / 150);
          l.style.setProperty('--near', (t * t * (3 - 2 * t)).toFixed(3));
        }
      };
      rootEl.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(tick); });
      rootEl.addEventListener('pointerleave', () => { mx = my = -9999; if (!raf) raf = requestAnimationFrame(tick); });
    }

    setTimeout(() => { try { btnBack.focus({ preventScroll: true }); } catch (_) { /* ignore */ } }, 60);
  }

  function hide() {
    if (!host) return;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
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
