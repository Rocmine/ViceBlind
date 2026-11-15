/* Vice Blind UI helpers: motion switch, big-title recipe, typewriter, ticker, toast, segmented control.
 * Load after shared/api.js and shared/settings.js, in <head>, so data-motion is set before first paint.
 */
(function (root) {
  'use strict';
  const VB = (root.VB = root.VB || {});
  const doc = document;
  const html = doc.documentElement;

  // Animation is ON by default and deliberately ignores the OS "show animations" setting.
  html.setAttribute('data-motion', 'full');

  const UI = {};

  UI.applyMotion = (on) => html.setAttribute('data-motion', on ? 'full' : 'reduced');
  UI.motionOn = () => html.getAttribute('data-motion') === 'full';

  // Read the saved switch and apply it. Resolves with the settings object.
  UI.init = async function init() {
    const s = await VB.settings.load();
    UI.applyMotion(s.motion !== 'off');
    return s;
  };

  UI.toggleMotion = async function toggleMotion() {
    const next = !UI.motionOn();
    UI.applyMotion(next);
    try { await VB.settings.save({ motion: next ? 'on' : 'off' }); } catch (_) { /* ignore */ }
    return next;
  };

  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // Build the big animated title. `lines` e.g. ['STAY', 'BLIND.'].
  // The visible letters are aria-hidden; an sr-only copy carries the real text.
  UI.title = function title(target, lines) {
    target.textContent = '';
    target.append(el('span', 'sr-only', lines.join(' ')));
    let i = 0;
    for (const line of lines) {
      const l = el('span', 'title-line');
      l.setAttribute('aria-hidden', 'true');
      for (const c of line) {
        const s = el('span', 'ch', c === ' ' ? ' ' : c);
        s.style.setProperty('--i', String(i++));
        l.append(s);
      }
      target.append(l);
    }
    const block = target.closest('.title-block');
    const letters = [...target.querySelectorAll('.ch')];
    // Release the line mask once the last letter has landed so lifted letters are not clipped.
    const done = UI.motionOn() ? 250 + letters.length * 38 + 950 : 0;
    setTimeout(() => block && block.classList.add('intro-done'), done);

    if (matchMedia('(pointer: fine)').matches) {
      let mx = -9999, my = -9999, raf = 0;
      const tick = () => {
        raf = 0;
        const base = target.getBoundingClientRect();
        for (const l of letters) {
          const cx = base.left + l.offsetLeft + l.offsetWidth / 2;
          const cy = base.top + l.offsetTop + l.offsetHeight / 2;
          const t = Math.max(0, 1 - Math.hypot(mx - cx, my - cy) / 150);
          l.style.setProperty('--near', (t * t * (3 - 2 * t)).toFixed(3));
        }
      };
      doc.addEventListener('pointermove', (e) => { if (!UI.motionOn()) return; mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(tick); });
      doc.addEventListener('pointerleave', () => { mx = my = -9999; if (!raf) raf = requestAnimationFrame(tick); });
    } else {
      // Touch: a tap sends one wave through the letters.
      target.addEventListener('click', () => {
        if (!UI.motionOn() || !target.animate) return;
        letters.forEach((l, k) => l.animate([{ translate: '0 0' }, { translate: '0 -0.12em', color: '#a9c1ff' }, { translate: '0 0' }], { duration: 520, delay: k * 26, easing: 'cubic-bezier(.22,1,.36,1)' }));
      });
    }
  };

  // Typewriter on a line, 34 ms per character. Keeps a blinking cursor at the end.
  UI.type = function type(target, text, cb) {
    target.textContent = '';
    const txt = doc.createTextNode('');
    const cur = el('span', 'cursor');
    cur.setAttribute('aria-hidden', 'true');
    target.append(txt, cur);
    if (!UI.motionOn()) { txt.nodeValue = text; if (cb) cb(); return; }
    let i = 0;
    const step = () => { txt.nodeValue = text.slice(0, ++i); if (i < text.length) setTimeout(step, 34); else if (cb) cb(); };
    setTimeout(step, 340);
  };

  // Seamless ticker: six identical copies, each ending with the separator.
  UI.ticker = function ticker(target, text) {
    target.textContent = '';
    const run = el('span', 'ticker-run');
    run.style.setProperty('--n', '6');
    for (let i = 0; i < 6; i++) {
      const s = el('span', 'ticker-items', text);
      if (i) s.setAttribute('aria-hidden', 'true');
      run.append(s);
    }
    target.append(run);
  };

  let toastTimer = 0;
  UI.toast = function toast(msg) {
    let t = doc.querySelector('.toast');
    if (!t) { t = el('div', 'toast'); t.setAttribute('role', 'status'); doc.body.append(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  };

  // Segmented control: <div class="seg" role="radiogroup"><button role="radio" data-value="x">.
  UI.seg = function seg(group, value, onChange) {
    const buttons = [...group.querySelectorAll('button')];
    const set = (v, fire) => {
      for (const b of buttons) {
        const on = b.dataset.value === v;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      }
      if (fire && onChange) onChange(v);
    };
    group.setAttribute('role', 'radiogroup');
    for (const b of buttons) {
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => set(b.dataset.value, true));
    }
    group.addEventListener('keydown', (e) => {
      const k = e.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return;
      e.preventDefault();
      const cur = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const next = buttons[(cur + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length];
      next.focus();
      set(next.dataset.value, true);
    });
    set(value, false);
    return { set: (v) => set(v, false) };
  };

  // Switch: <button class="switch" role="switch">.
  UI.switch = function sw(btn, value, onChange) {
    btn.setAttribute('role', 'switch');
    const set = (v) => btn.setAttribute('aria-checked', String(!!v));
    btn.addEventListener('click', () => { const v = btn.getAttribute('aria-checked') !== 'true'; set(v); if (onChange) onChange(v); });
    set(value);
    return { set };
  };

  UI.escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  VB.ui = UI;
})(globalThis);
