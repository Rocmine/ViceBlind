/* Vice Blind: one promise-style extension API for Chrome, Edge, Brave, Opera and Firefox. */
(function (root) {
  'use strict';
  const VB = (root.VB = root.VB || {});
  // Firefox exposes `browser` (promises). Chromium MV3 exposes `chrome` with promise support.
  VB.api = root.browser && root.browser.runtime ? root.browser : root.chrome;
})(globalThis);
