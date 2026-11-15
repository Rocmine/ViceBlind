/* Vice Blind: the two hand-drawn illustrations, as static SVG strings.
 * One source for the popup, welcome page and the page curtain (content script).
 *   VB.art.sun(id)   a sunset disc cut by blind slats (slats are .slit, animated by the host page's CSS)
 *   VB.art.palms()   a flat palm-silhouette strip, cropped from the centre on narrow screens
 * Strings are constants with no user data; mount() parses them as SVG.
 */
(function (root) {
  'use strict';
  const VB = (root.VB = root.VB || {});

  // Slits get thicker toward the bottom, like a blind opening. [y, height]
  const SLITS = [[212, 6], [240, 9], [270, 13], [302, 18], [336, 24], [372, 20]];

  function sun(id) {
    const uid = String(id || 's');
    const slits = SLITS.map(([y, h], i) => `<rect class="slit" style="--n:${i}" x="0" y="${y}" width="400" height="${h}" fill="#000"/>`).join('');
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" aria-hidden="true" focusable="false">` +
      `<defs>` +
      `<linearGradient id="vb-sun-${uid}" x1="0" y1="10" x2="0" y2="390" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0" stop-color="#ffd166"/><stop offset=".48" stop-color="#ff8a5b"/><stop offset="1" stop-color="#ff3e96"/>` +
      `</linearGradient>` +
      `<mask id="vb-slats-${uid}"><rect width="400" height="400" fill="#fff"/>${slits}</mask>` +
      `</defs>` +
      `<circle cx="200" cy="200" r="190" fill="url(#vb-sun-${uid})" mask="url(#vb-slats-${uid})"/>` +
      `</svg>`
    );
  }

  // One palm: curved trunk plus drooping fronds, origin at the base of the trunk.
  const PALM =
    '<g>' +
    '<path d="M-5 0C-1-44-13-90 3-142L11-142C-3-90 9-44 6 0Z"/>' +
    '<g transform="translate(7 -142)">' +
    ['-8', '-34', '-62', '16'].map((a) => `<path transform="rotate(${a})" d="M0 0C26-30 72-26 104 12C70-8 32-8 0 0Z"/>`).join('') +
    ['-8', '-34', '-62', '16'].map((a) => `<path transform="scale(-1 1) rotate(${a})" d="M0 0C26-30 72-26 104 12C70-8 32-8 0 0Z"/>`).join('') +
    '</g></g>';

  function palms() {
    const at = (x, s, flip) => `<g transform="translate(${x} 214) scale(${flip ? -s : s} ${s})">${PALM}</g>`;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -70 1200 290" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" fill="#0d0420">` +
      at(110, 1.05, false) + at(330, 0.7, true) + at(610, 0.9, false) + at(860, 1.15, true) + at(1090, 0.75, false) +
      `<path d="M0 206C200 198 420 212 640 205C860 198 1040 210 1200 204V220H0Z"/>` +
      `</svg>`
    );
  }

  // Parse a static SVG string and put it into `target` (no innerHTML).
  function mount(target, svg) {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    target.replaceChildren(document.importNode(doc.documentElement, true));
  }

  VB.art = { sun, palms, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = VB.art;
})(globalThis);
