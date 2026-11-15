/* Vice Blind UI helpers: motion switch, neon title, illustrations, toast, segmented control, switch.
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

  // The big title is a neon sign: plain text, lit as a whole (the flicker-on is CSS).
  UI.title = function title(target, text) {
    target.textContent = Array.isArray(text) ? text.join(' ') : text;
  };

  // Illustrations (see shared/art.js). Static SVG strings, no user data.
  let artId = 0;
  UI.sun = (target) => { target.classList.add('sun'); VB.art.mount(target, VB.art.sun('p' + artId++)); };
  UI.palms = (target) => { target.classList.add('palms'); VB.art.mount(target, VB.art.palms()); };

  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

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
