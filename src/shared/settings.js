/* Vice Blind: settings schema, validation, trust/pause logic and stats.
 * Settings live in storage.sync (follow the user); stats live in storage.local.
 */
(function (root) {
  'use strict';
  const VB = (root.VB = root.VB || {});
  const api = VB.api;

  const LEVELS = ['light', 'balanced', 'strict'];
  const STYLES = ['blur', 'cover', 'remove'];
  const REVEALS = ['two', 'one', 'locked'];

  const DEFAULTS = Object.freeze({
    enabled: true,
    level: 'balanced',
    style: 'blur',
    reveal: 'two',
    curtain: true,
    custom: [],
    muted: [],
    trusted: [],
    pausedUntil: 0,
    pcDate: '',
    motion: 'on',
    installedAt: 0,
  });
  const KEYS = Object.keys(DEFAULTS);

  const strList = (v, maxItems, maxLen) =>
    Array.isArray(v)
      ? v.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, maxLen)).filter(Boolean).slice(0, maxItems)
      : [];
  const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

  // Turn whatever storage returned into a complete, valid settings object.
  function clean(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: r.enabled !== false,
      level: pick(r.level, LEVELS, DEFAULTS.level),
      style: pick(r.style, STYLES, DEFAULTS.style),
      reveal: pick(r.reveal, REVEALS, DEFAULTS.reveal),
      curtain: r.curtain !== false,
      custom: strList(r.custom, 200, 60),
      muted: strList(r.muted, 100, 60),
      trusted: strList(r.trusted, 500, 253).map((h) => h.toLowerCase()),
      pausedUntil: Number.isFinite(r.pausedUntil) ? r.pausedUntil : 0,
      pcDate: /^\d{4}-\d{2}-\d{2}$/.test(r.pcDate || '') ? r.pcDate : '',
      motion: r.motion === 'off' ? 'off' : 'on',
      installedAt: Number.isFinite(r.installedAt) ? r.installedAt : 0,
    };
  }

  async function load() {
    try {
      return clean(await api.storage.sync.get(KEYS));
    } catch (_) {
      return clean({});
    }
  }

  async function save(patch) {
    await api.storage.sync.set(patch);
  }

  const isPaused = (s) => s.pausedUntil > Date.now();

  // A host is trusted if it equals a trusted entry or is a subdomain of one.
  function isTrusted(s, host) {
    if (!host) return false;
    const h = host.toLowerCase().replace(/^www\./, '');
    return s.trusted.some((t) => {
      const x = t.replace(/^www\./, '');
      return h === x || h.endsWith('.' + x);
    });
  }

  const isActive = (s, host) => s.enabled && !isPaused(s) && !isTrusted(s, host);

  // Lifetime counters.
  async function loadStats() {
    try {
      const r = await api.storage.local.get(['hits', 'since']);
      return { hits: Number.isFinite(r.hits) ? r.hits : 0, since: Number.isFinite(r.since) ? r.since : 0 };
    } catch (_) {
      return { hits: 0, since: 0 };
    }
  }

  function daysSince(ts) {
    if (!ts) return 0;
    return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
  }

  VB.settings = { DEFAULTS, KEYS, LEVELS, STYLES, REVEALS, clean, load, save, isPaused, isTrusted, isActive, loadStats, daysSince };
  if (typeof module !== 'undefined' && module.exports) module.exports = VB.settings;
})(globalThis);
