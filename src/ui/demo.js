/* Vice Blind UI: the live demo card shown on the Settings and Welcome pages.
 * Uses the real content.css, so what you see here is exactly what pages get.
 * The card text is invented and contains no spoilers.
 */
(function (root) {
  'use strict';
  const VB = (root.VB = root.VB || {});

  function card(title, meta) {
    const c = document.createElement('article');
    c.className = 'demo-card';
    const thumb = document.createElement('div');
    thumb.className = 'demo-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    body.className = 'demo-body';
    const h = document.createElement('h3');
    h.textContent = title;
    const m = document.createElement('p');
    m.textContent = meta;
    body.append(h, m);
    c.append(thumb, body);
    return c;
  }

  // Wrap a demo card so that it behaves like a hidden card on a page, driven by the live settings.
  // `get()` returns { style, reveal }. Returns { render() } to call when settings change.
  function bind(host, get) {
    const el = host;
    let armedTimer = 0;
    const note = document.createElement('p');
    note.className = 'demo-removed';
    note.textContent = 'Removed. Nothing is left on the page.';
    note.hidden = true;
    el.after(note);

    function render() {
      const { style, reveal } = get();
      document.documentElement.setAttribute('data-vb-reveal', reveal);
      el.removeAttribute('data-vb-armed');
      el.setAttribute('data-vb', style);
      el.hidden = false;
      note.hidden = true;
      if (style === 'remove') { el.hidden = true; note.hidden = false; }
    }

    el.addEventListener('click', (e) => {
      const { reveal } = get();
      const state = el.getAttribute('data-vb');
      if (state === 'shown') { render(); return; }      // click a revealed card to hide it again
      e.preventDefault();
      if (reveal === 'locked') return;
      if (reveal === 'one' || el.hasAttribute('data-vb-armed')) {
        clearTimeout(armedTimer);
        el.removeAttribute('data-vb-armed');
        el.setAttribute('data-vb', 'shown');
        return;
      }
      el.setAttribute('data-vb-armed', '');
      clearTimeout(armedTimer);
      armedTimer = setTimeout(() => el.removeAttribute('data-vb-armed'), 4000);
    });

    render();
    return { render };
  }

  VB.demo = { card, bind };
})(globalThis);
