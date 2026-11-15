/* Vice Blind: content script. Finds GTA VI content and hides it.
 *
 * Flow: start protecting immediately with the bundled defaults (no flash of spoilers),
 * then reconcile with the user's settings as soon as storage answers.
 */
(function () {
  'use strict';
  const VB = globalThis.VB;
  if (!VB || !VB.api || !VB.keywords || !VB.settings || globalThis.__viceBlindLoaded) return;
  globalThis.__viceBlindLoaded = true;

  const api = VB.api;
  const K = VB.keywords;
  const S = VB.settings;
  const root = document.documentElement;
  const host = location.hostname;
  const isTop = window.top === window;
  const adapter = VB.sites ? VB.sites.forHost(host) : null;

  const CURTAIN_TAG = VB.curtain ? VB.curtain.TAG.toUpperCase() : 'VICE-BLIND-CURTAIN';
  // Never scan inside these (never touch what the user is typing, or non-visible markup).
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'HEAD', 'TITLE', 'META', 'LINK', 'TEMPLATE', 'svg', CURTAIN_TAG]);
  const EDITABLE = '[contenteditable]:not([contenteditable="false"]), textarea, input';
  const CARD = 'article, li, [role="article"], [role="listitem"], figure, tr, blockquote, details';
  const REPLACED = new Set(['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'EMBED', 'OBJECT']);
  const BIG_TAGS = new Set(['HTML', 'BODY', 'MAIN']);
  const OBSERVE = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['alt', 'title', 'aria-label', 'href'] };

  let settings = S.clean({});          // bundled defaults until storage answers
  let matcher = K.compile(settings);
  let active = true;
  let observing = false;
  let observed = new WeakSet();        // shadow roots we already watch
  const marked = new Set();            // every card carrying data-vb (hidden or shown)
  const infos = new WeakMap();         // card -> { term, sig, timer }
  let pending = new Set();
  let recheckSet = new Set();
  let titleDirty = false;
  let hitsSinceFlush = 0;
  let lastSent = -1;
  let pageAllowed = false;             // user chose "Show this page" for this URL
  let curtainReason = null;
  let pauseTimer = 0;
  let lastHref = location.href;

  /* ---------- small helpers ---------- */

  const safeDecode = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };

  function shadowOf(el) {
    try {
      return el.shadowRoot || el.openOrClosedShadowRoot || (api.dom && api.dom.openOrClosedShadowRoot ? api.dom.openOrClosedShadowRoot(el) : null) || null;
    } catch (_) { return null; }
  }

  // Parent that also steps out of shadow roots.
  function parentAcross(n) {
    if (!n) return null;
    const p = n.parentNode;
    if (!p) return null;
    if (p.nodeType === 11 && p.host) return p.host;
    return p.nodeType === 1 ? p : null;
  }

  function closestAcross(el, sel) {
    for (let n = el, i = 0; n && i < 60; i++) {
      if (n.nodeType === 1 && n.closest) {
        const c = n.closest(sel);
        if (c) return c;
        const r = n.getRootNode();
        n = r && r.host ? r.host : null;
      } else n = parentAcross(n);
    }
    return null;
  }

  const send = (msg) => { try { api.runtime.sendMessage(msg).catch(() => {}); } catch (_) { /* context gone */ } };

  /* ---------- finding hits ---------- */

  // Text split across inline tags ("<b>GTA</b> <i>6</i>") never matches per text node. For short elements
  // whose children are all leaf elements, test the joined text. Bounded so big containers are never joined.
  const INLINE = new Set(['A', 'B', 'I', 'U', 'S', 'EM', 'STRONG', 'SPAN', 'MARK', 'SMALL', 'SUB', 'SUP', 'ABBR', 'CITE', 'CODE', 'FONT', 'TIME', 'Q', 'BR', 'WBR', 'BDI', 'BDO']);
  function mixedText(el) {
    const n = el.childElementCount;
    if (!n || n > 6 || el.childNodes.length > 12 || SKIP.has(el.nodeName)) return null;
    // Only join across inline tags, never across block children (paragraphs, list items, table cells).
    for (const c of el.children) if (c.childElementCount || !INLINE.has(c.nodeName)) return null;
    const tc = el.textContent;
    return tc && tc.length < 400 ? tc : null;
  }

  // Walk a subtree and call onHit(node, hit) for every match. Skips subtrees that are already
  // marked unless opts.into. opts.limit stops early (used by re-checks).
  function walk(rootNode, onHit, opts) {
    const M = matcher;
    const into = !!(opts && opts.into);
    const limit = (opts && opts.limit) || 0;
    const queue = [];
    let count = 0;
    const doc = rootNode.ownerDocument || document;

    const check = (el) => {
      for (const a of ['alt', 'title', 'aria-label']) {
        const v = el.getAttribute(a);
        if (v && v.length > 3 && M.re.test(v)) { onHit(el, M.first(v)); count++; }
      }
      if (el.nodeName === 'A') {
        const h = el.getAttribute('href');
        if (h && h.length > 4 && h.length < 600 && M.coreRe.test(safeDecode(h))) { onHit(el, { text: 'GTA VI link', term: { label: 'link', pack: 'core' } }); count++; }
      } else if (el.nodeName === 'IMG') {
        const s = el.getAttribute('src');
        if (s && s.length > 4 && s.length < 600 && !s.startsWith('data:') && M.coreRe.test(safeDecode(s.split('?')[0].split('/').pop()))) { onHit(el, { text: 'GTA VI image', term: { label: 'image', pack: 'core' } }); count++; }
      }
      const mixed = mixedText(el);
      if (mixed && M.re.test(mixed)) { onHit(el, M.first(mixed)); count++; }
      const sr = shadowOf(el);
      if (sr && !observed.has(sr)) { watchRoot(sr); queue.push(sr); }
      else if (sr && into) queue.push(sr);
      if (adapter && el.matches && el.matches(adapter.union)) {
        const tc = el.textContent;
        if (tc && tc.length < 8000) { const h = M.first(tc); if (h) { onHit(el, h); count++; } }
      }
    };

    const tw = doc.createTreeWalker(rootNode, 1 | 4, {
      acceptNode(n) {
        if (n.nodeType === 1) {
          if (SKIP.has(n.nodeName)) return 2;
          if (!into && n.hasAttribute('data-vb')) return 2;
          if (n.hasAttribute('contenteditable') && n.getAttribute('contenteditable') !== 'false') return 2;
        }
        return 1;
      },
    });
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) {
        const v = n.nodeValue;
        if (v && v.length > 1 && M.re.test(v)) { onHit(n, M.first(v)); count++; }
      } else check(n);
      if (limit && count >= limit) return count;
    }
    for (const sr of queue) {
      if (limit && count >= limit) break;
      count += walk(sr, onHit, opts);
    }
    return count;
  }

  function collectHits(c, limit) {
    const out = [];
    const tc = c.textContent;
    if (tc && tc.length < 8000) { const h = matcher.first(tc); if (h) out.push(h); }
    walk(c, (_, h) => { if (h && out.length < limit) out.push(h); }, { into: true, limit });
    return out;
  }

  const signature = (hits) => hits.map((h) => (h.text || '').toLowerCase()).slice(0, 6).join('|');

  /* ---------- choosing what to hide ---------- */

  function isBlock(n) {
    try {
      const d = getComputedStyle(n).display;
      return d !== 'none' && d !== 'contents' && !d.startsWith('inline');
    } catch (_) { return false; }
  }

  function tooBig(n) {
    if (BIG_TAGS.has(n.nodeName) || n.getAttribute('role') === 'main') return true;
    const r = n.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    return r.height > innerHeight * 1.3 || r.width * r.height > innerWidth * innerHeight * 0.8;
  }

  function nearestCard(el) {
    for (let n = el, i = 0; n && i < 10; n = parentAcross(n), i++) if (n.matches && n.matches(CARD)) return n;
    return null;
  }

  function genericContainer(el) {
    const replaced = REPLACED.has(el.nodeName);
    const card = nearestCard(el);
    if (card && !tooBig(card)) return card;
    if (replaced) return el;
    for (let n = el, i = 0; n && i < 8; n = parentAcross(n), i++) {
      if (n === document.body || n === root) break;
      if (isBlock(n) && !tooBig(n)) return n;
    }
    return el === root || el === document.body || tooBig(el) ? null : el;
  }

  function containerFor(el) {
    if (adapter) {
      for (const sel of adapter.selectors) {
        const c = closestAcross(el, sel);
        if (c) return c;
      }
    }
    return genericContainer(el);
  }

  /* ---------- hiding and revealing ---------- */

  function pauseInside(c) {
    try {
      if (c.nodeName === 'VIDEO' || c.nodeName === 'AUDIO') c.pause();
      else if (c.querySelectorAll) for (const m of c.querySelectorAll('video, audio')) m.pause();
    } catch (_) { /* ignore */ }
  }

  // content.css does not reach inside shadow roots, so each root holding a hidden card gets its own copy.
  const styledRoots = new Set();
  function shadowCss() {
    return (VB.contentCss || '')
      .replace(/html\[data-vb-reveal="(\w+)"\] /g, ':host([data-vb-reveal="$1"]) ')
      .replace(/html \[data-vb\]\[data-vb-armed\]/g, '[data-vb][data-vb-armed]');
  }
  function styleShadow(c) {
    const r = c.getRootNode();
    if (!r || !r.host || r.nodeType !== 11) return;
    if (!styledRoots.has(r)) {
      styledRoots.add(r);
      const st = document.createElement('style');
      st.setAttribute('data-vb-style', '');
      st.textContent = shadowCss();
      r.prepend(st);
    }
    r.host.setAttribute('data-vb-reveal', settings.reveal);
  }
  function refreshShadows() {
    for (const r of [...styledRoots]) {
      if (!r.host.isConnected) { styledRoots.delete(r); continue; }
      r.host.setAttribute('data-vb-reveal', settings.reveal);
    }
  }
  function clearShadows() {
    for (const r of styledRoots) {
      const st = r.querySelector('style[data-vb-style]');
      if (st) st.remove();
      if (r.host) r.host.removeAttribute('data-vb-reveal');
    }
    styledRoots.clear();
  }

  function mark(c, hit, sig) {
    styleShadow(c);
    c.setAttribute('data-vb', settings.style);
    c.removeAttribute('data-vb-armed');
    const old = infos.get(c);
    if (old && old.timer) clearTimeout(old.timer);
    infos.set(c, { term: hit && hit.term ? hit.term.label : '', sig: sig || '', timer: 0 });
    marked.add(c);
    pauseInside(c);
  }

  function unmark(c) {
    const i = infos.get(c);
    if (i && i.timer) clearTimeout(i.timer);
    c.removeAttribute('data-vb');
    c.removeAttribute('data-vb-armed');
    marked.delete(c);
  }

  function hide(c, hit) {
    if (c.querySelectorAll) for (const d of c.querySelectorAll('[data-vb]')) unmark(d);
    mark(c, hit, hit && hit.text ? hit.text.toLowerCase() : '');
    hitsSinceFlush++;
  }

  function handleHit(node, hit) {
    // A curtain, or a page the user chose to show, means nothing on it is hidden individually.
    if (pageAllowed || (VB.curtain && VB.curtain.isUp())) return;
    const el = node.nodeType === 1 ? node : parentAcross(node);
    if (!el || el === root) return;
    if (closestAcross(el, '[data-vb]')) return;           // already decided
    if (el.closest && el.closest(EDITABLE)) return;        // never hide what the user is typing
    const c = containerFor(el);
    if (c) hide(c, hit);
  }

  // A card's content changed: drop it if it no longer matches, re-hide a revealed card whose match changed.
  function recheck(c) {
    const info = infos.get(c);
    if (!info) return;
    if (!c.isConnected) { marked.delete(c); return; }
    const hits = collectHits(c, 6);
    if (!hits.length) { unmark(c); return; }
    const sig = signature(hits);
    if (c.getAttribute('data-vb') === 'shown') {
      if (sig !== info.sig) { mark(c, hits[0], sig); hitsSinceFlush++; }
    } else info.sig = sig;
  }

  function onClick(e) {
    if (!e.isTrusted || !active) return;
    let c = null;
    for (const n of e.composedPath()) if (n.nodeType === 1 && n.hasAttribute('data-vb')) { c = n; break; }
    if (!c) return;
    const state = c.getAttribute('data-vb');
    if (state === 'shown' || state === 'remove') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'auxclick' || settings.reveal === 'locked') return;   // middle-click only blocks
    const info = infos.get(c) || {};
    const reveal = () => {
      if (info.timer) clearTimeout(info.timer);
      c.removeAttribute('data-vb-armed');
      c.setAttribute('data-vb', 'shown');
      info.sig = signature(collectHits(c, 6));
      infos.set(c, info);
      updateCount();
    };
    if (settings.reveal === 'one' || c.hasAttribute('data-vb-armed')) { reveal(); return; }
    c.setAttribute('data-vb-armed', '');
    if (info.timer) clearTimeout(info.timer);
    info.timer = setTimeout(() => c.removeAttribute('data-vb-armed'), 4000);
    infos.set(c, info);
  }

  /* ---------- scanning ---------- */

  // Something was added or changed next to existing inline siblings: re-test the joined text of the parent.
  function testParentMixed(n) {
    const p = n.parentNode;
    if (!p || p.nodeType !== 1 || p.hasAttribute('data-vb')) return;
    const mixed = mixedText(p);
    if (mixed && matcher.re.test(mixed)) handleHit(p, matcher.first(mixed));
  }

  function scanNode(n) {
    if (n.nodeType === 3) {
      const v = n.nodeValue;
      if (v && v.length > 1 && matcher.re.test(v)) handleHit(n, matcher.first(v));
      else testParentMixed(n);
      return;
    }
    if (n.nodeType !== 1 || SKIP.has(n.nodeName)) return;
    if (n.hasAttribute('data-vb')) { if (!marked.has(n)) { marked.add(n); infos.set(n, infos.get(n) || { term: '', sig: '', timer: 0 }); } recheckSet.add(n); return; }
    // The element itself, then everything under it.
    walk1(n);
    walk(n, handleHit);
    testParentMixed(n);
  }

  // Attributes of the root element of a scan (walk() only checks descendants).
  function walk1(el) {
    const M = matcher;
    for (const a of ['alt', 'title', 'aria-label']) {
      const v = el.getAttribute(a);
      if (v && v.length > 3 && M.re.test(v)) handleHit(el, M.first(v));
    }
    if (el.nodeName === 'A') {
      const h = el.getAttribute('href');
      if (h && h.length > 4 && h.length < 600 && M.coreRe.test(safeDecode(h))) handleHit(el, { text: 'GTA VI link', term: { label: 'link', pack: 'core' } });
    }
    const mixed = mixedText(el);
    if (mixed && M.re.test(mixed)) handleHit(el, M.first(mixed));
    if (adapter && el.matches && el.matches(adapter.union)) {
      const tc = el.textContent;
      if (tc && tc.length < 8000) { const h = M.first(tc); if (h) handleHit(el, h); }
    }
    const sr = shadowOf(el);
    if (sr && !observed.has(sr)) { watchRoot(sr); walk(sr, handleHit); }
  }

  function fullScan() {
    if (!active) return;
    scanNode(root);
    flush(true);
  }

  function queueNode(n) {
    const el = n.nodeType === 1 ? n : parentAcross(n);
    if (!el) return;
    if (marked.size) {
      const m = closestAcross(el, '[data-vb]');
      if (m) { if (infos.has(m)) recheckSet.add(m); else if (!marked.has(m)) { marked.add(m); infos.set(m, { term: '', sig: '', timer: 0 }); recheckSet.add(m); } return; }
    }
    pending.add(n);
  }

  function onMutations(records) {
    if (!active) return;
    for (const r of records) {
      const t = r.target;
      if (t.nodeName === 'TITLE' || (t.parentNode && t.parentNode.nodeName === 'TITLE')) titleDirty = true;
      if (r.type === 'childList') {
        for (const n of r.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) {
          if (n.nodeName === CURTAIN_TAG) continue;
          queueNode(n);
        }
        if (marked.size && r.removedNodes.length) queueNode(t);   // content swapped inside a card
      } else queueNode(t);
    }
    flush(false);
  }

  function flush(all) {
    const t0 = performance.now();
    const nodes = [...pending];
    pending = new Set();
    const done = new WeakSet();   // roots already scanned this round: skip anything inside them
    let i = 0;
    for (; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.isConnected) {
        let covered = false;
        for (let p = n.parentNode; p; p = p.parentNode) if (done.has(p)) { covered = true; break; }
        if (!covered) { scanNode(n); done.add(n); }
      }
      if (!all && performance.now() - t0 > 30) { i++; break; }   // yield; the rest runs next tick
    }
    for (let j = i; j < nodes.length; j++) pending.add(nodes[j]);
    if (pending.size) setTimeout(() => flush(false), 0);

    if (recheckSet.size) {
      const list = [...recheckSet];
      recheckSet = new Set();
      for (const c of list) recheck(c);
    }
    if (titleDirty) { titleDirty = false; evaluatePage(); }
    updateCount();
  }

  const mo = new MutationObserver(onMutations);

  function watchRoot(sr) {
    if (observed.has(sr)) return;
    observed.add(sr);
    if (observing) { try { mo.observe(sr, OBSERVE); } catch (_) { /* ignore */ } }
  }

  function startObserving() {
    if (observing) return;
    observing = true;
    mo.observe(document, OBSERVE);
  }

  function stopObserving() {
    observing = false;
    mo.disconnect();
    observed = new WeakSet();
    pending = new Set();
    recheckSet = new Set();
  }

  /* ---------- counts ---------- */

  function hiddenCount() {
    let n = 0;
    for (const c of marked) {
      if (!c.isConnected) { marked.delete(c); continue; }
      if (c.getAttribute('data-vb') !== 'shown') n++;
    }
    return n;
  }

  function updateCount() {
    const n = hiddenCount();
    if (n !== lastSent) { lastSent = n; send({ type: 'vb-count', n }); }
    if (hitsSinceFlush) { send({ type: 'vb-hits', n: hitsSinceFlush }); hitsSinceFlush = 0; }
  }

  /* ---------- the page curtain ---------- */

  const allowKey = () => 'vb-allow:' + location.origin + location.pathname + location.search;
  function readAllowed() { try { return sessionStorage.getItem(allowKey()) === '1'; } catch (_) { return false; } }
  function writeAllowed() { try { sessionStorage.setItem(allowKey(), '1'); } catch (_) { /* ignore */ } }

  function isSearchPage() {
    const p = location.pathname.toLowerCase();
    return /(^|\/)(search|results|find|suche|recherche|busca)(\/|$)/.test(p) || /[?&](q|query|search_query|s|k|text|wd)=/.test(location.search);
  }

  function pageMatch() {
    if (!settings.curtain || isSearchPage()) return null;
    const title = document.title;
    let h = matcher.first(title);
    if (h) return { text: h.text, where: 'title' };
    const og = document.querySelector('meta[property="og:title"]');
    if (og) { h = matcher.first(og.getAttribute('content') || ''); if (h) return { text: h.text, where: 'og' }; }
    const h1 = document.querySelector('h1');
    if (h1) { h = matcher.first((h1.textContent || '').slice(0, 300)); if (h) return { text: h.text, where: 'h1' }; }
    const path = safeDecode(location.pathname);
    if (matcher.testCore(path)) { h = matcher.first(path.replace(/[-_/]+/g, ' ')) || { text: 'GTA VI' }; return { text: h.text, where: 'url' }; }
    return null;
  }

  function clearMarks() { for (const c of [...marked]) unmark(c); updateCount(); }

  function evaluatePage() {
    if (!VB.curtain) return;
    if (!active) { VB.curtain.hide(); return; }
    const m = pageMatch();
    if (!m) {
      const was = !!curtainReason || pageAllowed;
      curtainReason = null;
      pageAllowed = false;
      VB.curtain.hide();
      if (was) fullScan();                                  // the page is no longer special: hide cards again
      return;
    }
    if (pageAllowed || readAllowed()) { pageAllowed = true; clearMarks(); return; }
    if (VB.curtain.isUp()) { VB.curtain.refresh(); return; }
    curtainReason = m;
    VB.curtain.show({
      matched: m,
      motion: settings.motion,
      pcDate: settings.pcDate,
      onBack() {
        if (history.length > 1) { history.back(); setTimeout(() => { if (VB.curtain.isUp()) location.replace('about:blank'); }, 600); }
        else location.replace('about:blank');
      },
      onShow() { pageAllowed = true; writeAllowed(); curtainReason = null; VB.curtain.hide(); },
      onTrust() {
        const t = new Set(settings.trusted);
        t.add(host.replace(/^www\./, ''));
        S.save({ trusted: [...t] }).catch(() => {});
      },
    });
    clearMarks();
  }

  /* ---------- settings ---------- */

  function teardown() {
    stopObserving();
    for (const c of [...marked]) unmark(c);
    marked.clear();
    root.removeAttribute('data-vb-reveal');
    clearShadows();
    if (VB.curtain) VB.curtain.hide();
    curtainReason = null;
    updateCount();
  }

  function apply(s) {
    settings = s;
    matcher = K.compile(s);
    active = S.isActive(s, host);
    clearTimeout(pauseTimer);
    if (S.isPaused(s)) pauseTimer = setTimeout(load, Math.min(s.pausedUntil - Date.now() + 150, 2147000000));
    if (!active) { teardown(); return; }
    root.setAttribute('data-vb-reveal', s.reveal);
    refreshShadows();
    startObserving();
    for (const c of [...marked]) {
      if (!c.isConnected) { marked.delete(c); continue; }
      if (c.getAttribute('data-vb') !== 'shown') c.setAttribute('data-vb', s.style);
      recheckSet.add(c);                                   // level or words may have changed
    }
    fullScan();
    evaluatePage();
  }

  async function load() { apply(await S.load()); }

  /* ---------- wiring ---------- */

  window.addEventListener('click', onClick, true);
  window.addEventListener('auxclick', onClick, true);

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (S.KEYS.some((k) => k in changes)) load();
  });

  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'vb-status') {
      sendResponse({
        host,
        active,
        count: hiddenCount(),
        curtain: VB.curtain ? VB.curtain.isUp() : false,
        reason: curtainReason,
        adapter: adapter ? adapter.name : null,
      });
    }
    return false;
  });

  document.addEventListener('DOMContentLoaded', () => { if (active) { fullScan(); evaluatePage(); } }, { once: true });
  window.addEventListener('load', () => { if (active) { fullScan(); evaluatePage(); } }, { once: true });
  for (const ev of ['yt-navigate-finish', 'popstate', 'hashchange']) window.addEventListener(ev, () => { if (active) { evaluatePage(); fullScan(); } });
  if (isTop) {
    setInterval(() => {
      if (location.href !== lastHref) { lastHref = location.href; if (active) { evaluatePage(); fullScan(); } }
    }, 700);
  }

  // Start protecting right away with the defaults, then reconcile with the user's settings.
  root.setAttribute('data-vb-reveal', settings.reveal);
  startObserving();
  fullScan();
  evaluatePage();
  load();
})();
