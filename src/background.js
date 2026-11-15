/* Vice Blind: background script (service worker in Chromium, event page in Firefox). */
/* global importScripts */
if (typeof importScripts === 'function') importScripts('shared/api.js', 'shared/settings.js');

(function () {
  'use strict';
  const VB = globalThis.VB;
  const api = VB.api;
  const S = VB.settings;

  const BADGE_BG = '#3b6dff';
  const MENU_ADD = 'vb-add-word';
  const ALARM_RESUME = 'vb-resume';

  // tab -> frame -> hidden count. In memory only: the badge itself is kept by the browser.
  const counts = new Map();
  let pendingHits = 0;
  let hitTimer = 0;

  /* ---------- install / startup ---------- */

  api.runtime.onInstalled.addListener(async (details) => {
    // Fill in anything missing, never overwrite what the user already chose.
    const existing = await api.storage.sync.get(S.KEYS).catch(() => ({}));
    const merged = S.clean(existing);
    if (!merged.installedAt) merged.installedAt = Date.now();
    await api.storage.sync.set(merged).catch(() => {});
    const local = await S.loadStats();
    if (!local.since) await api.storage.local.set({ since: Date.now(), hits: local.hits }).catch(() => {});

    try {
      api.contextMenus.create({ id: MENU_ADD, title: 'Hide "%s" with Vice Blind', contexts: ['selection'] });
    } catch (_) { /* already exists */ }

    if (details.reason === 'install') api.tabs.create({ url: api.runtime.getURL('welcome/welcome.html') });
    await api.action.setBadgeBackgroundColor({ color: BADGE_BG }).catch(() => {});
    await syncActionIcon();
  });

  api.runtime.onStartup.addListener(() => {
    api.action.setBadgeBackgroundColor({ color: BADGE_BG }).catch(() => {});
    syncActionIcon();
  });

  /* ---------- toolbar icon follows the shield state ---------- */

  async function syncActionIcon() {
    const s = await S.load();
    const on = s.enabled && !S.isPaused(s);
    const name = on ? 'icon' : 'icon-off';
    const path = { 16: `assets/icons/${name}-16.png`, 32: `assets/icons/${name}-32.png`, 48: `assets/icons/${name}-48.png`, 128: `assets/icons/${name}-128.png` };
    api.action.setIcon({ path }).catch(() => {});
    api.action.setTitle({ title: on ? 'Vice Blind: shield on' : 'Vice Blind: paused' }).catch(() => {});
  }

  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && ('enabled' in changes || 'pausedUntil' in changes)) syncActionIcon();
  });

  /* ---------- counts and stats ---------- */

  function badge(tabId) {
    const frames = counts.get(tabId);
    let n = 0;
    if (frames) for (const v of frames.values()) n += v;
    const text = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
    api.action.setBadgeText({ tabId, text }).catch(() => {});
  }

  function flushHits() {
    hitTimer = 0;
    const n = pendingHits;
    pendingHits = 0;
    if (!n) return;
    api.storage.local.get('hits').then((r) => api.storage.local.set({ hits: (Number.isFinite(r.hits) ? r.hits : 0) + n })).catch(() => {});
  }

  api.runtime.onMessage.addListener((msg, sender) => {
    if (!msg) return false;
    const tabId = sender.tab && sender.tab.id;
    if (msg.type === 'vb-count' && tabId != null) {
      let frames = counts.get(tabId);
      if (!frames) counts.set(tabId, (frames = new Map()));
      if (msg.n > 0) frames.set(sender.frameId || 0, msg.n);
      else frames.delete(sender.frameId || 0);
      badge(tabId);
    } else if (msg.type === 'vb-hits' && Number.isFinite(msg.n) && msg.n > 0) {
      pendingHits += Math.min(msg.n, 500);
      if (!hitTimer) hitTimer = setTimeout(flushHits, 1500);
    }
    return false;
  });

  // A new page in the tab starts from zero.
  api.tabs.onRemoved.addListener((tabId) => counts.delete(tabId));
  api.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading') { counts.delete(tabId); api.action.setBadgeText({ tabId, text: '' }).catch(() => {}); }
  });

  /* ---------- pause expiry ---------- */

  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_RESUME) S.save({ pausedUntil: 0 }).catch(() => {});
  });

  /* ---------- context menu: add a selection to the custom words ---------- */

  api.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId !== MENU_ADD) return;
    const word = (info.selectionText || '').trim().slice(0, 60);
    if (word.length < 2) return;
    const s = await S.load();
    if (s.custom.some((w) => w.toLowerCase() === word.toLowerCase())) return;
    await S.save({ custom: [...s.custom, word] }).catch(() => {});
  });
})();
