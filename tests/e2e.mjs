// End-to-end: loads dist/chrome in an isolated Chromium and checks real behaviour.
// Run: npm run build && npm run e2e
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'dist', 'chrome');
const OUT = path.join(ROOT, 'test-results');
await fs.mkdir(OUT, { recursive: true });

/* ---------- tiny harness ---------- */
let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
};
const section = (t) => console.log(`\n${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- static server for fixtures ---------- */
const server = http.createServer(async (req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'fixture.html';
  try {
    const body = await fs.readFile(path.join(ROOT, 'tests', name));
    res.writeHead(200, { 'content-type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const HOST = '127.0.0.1';

/* ---------- launch ---------- */
const userDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vice-blind-e2e-'));
// VB_CHANNEL: 'chromium' (Playwright build, default) or 'msedge'/'chrome' for an installed browser.
const ctx = await chromium.launchPersistentContext(userDir, {
  channel: process.env.VB_CHANNEL || 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const EXT_ID = new URL(sw.url()).host;
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = (m.location() && m.location().url) || '';
    if (/favicon/.test(url)) return;
    errors.push(`console: ${m.text()} ${url}`);
  });
};
ctx.on('page', watch);
for (const p of ctx.pages()) watch(p);

const setSettings = (patch) => sw.evaluate((p) => chrome.storage.sync.set(p), patch);
const resetSettings = async () => { await sw.evaluate(() => chrome.storage.sync.clear()); await sleep(250); };
const getSettings = () => sw.evaluate(() => chrome.storage.sync.get(null));

const states = (page, ids) => page.evaluate((ids) => {
  const out = {};
  for (const id of ids) {
    let el = document.getElementById(id);
    if (!el) { const sr = document.getElementById('shadow-host')?.shadowRoot; el = sr && sr.getElementById(id); }
    out[id] = el ? el.getAttribute('data-vb') : 'MISSING';
  }
  return out;
}, ids);
const waitFor = (page, fn, arg, timeout = 5000) => page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);

try {
  /* ============ fixture feed ============ */
  section('Fixture: default settings (balanced, blur)');
  const page = await ctx.newPage();
  await page.goto(`${BASE}/fixture.html`);
  await waitFor(page, () => document.getElementById('dyn-hit')?.hasAttribute('data-vb') && document.getElementById('split')?.hasAttribute('data-vb'));
  await sleep(300);

  const HITS = ['a', 'c', 'img-card', 'href-card', 'title-card', 'sh-card', 'long-hit', 'dyn-hit', 'split', 'recycled'];
  const CLEAN = ['b', 'd', 'plain-card', 'sh-ok', 'long', 'feed', 'dyn-ok', 'ta', 'ce', 'page-h1'];
  let st = await states(page, [...HITS, ...CLEAN]);
  for (const id of HITS) check(`hides #${id}`, st[id] === 'blur', `(got ${st[id]})`);
  for (const id of CLEAN) check(`leaves #${id} alone`, st[id] === null, `(got ${st[id]})`);
  // The attribute alone proves nothing: the overlay must actually render, also inside shadow roots.
  const overlay = await page.evaluate(() => {
    const light = document.getElementById('a');
    const shadow = document.getElementById('shadow-host').shadowRoot.getElementById('sh-card');
    const o = (e) => getComputedStyle(e, '::after').content;
    return { light: o(light), shadow: o(shadow), child: getComputedStyle(shadow.firstElementChild).filter };
  });
  check('overlay renders on a normal card', /Spoiler hidden/.test(overlay.light), overlay.light);
  check('overlay renders inside a shadow root', /Spoiler hidden/.test(overlay.shadow), overlay.shadow);
  check('card children are blurred directly', /blur/.test(overlay.child), overlay.child);
  check('html/body are never hidden', await page.evaluate(() => !document.documentElement.hasAttribute('data-vb') && !document.body.hasAttribute('data-vb')));
  check('typed text is untouched', await page.evaluate(() => document.getElementById('ta').value === 'GTA 6 notes' && document.getElementById('ce').textContent === 'my draft about GTA 6'));
  check('no curtain on a normal page', await page.evaluate(() => !document.querySelector('vice-blind-curtain')));
  await page.screenshot({ path: path.join(OUT, 'fixture-blur.png') });

  section('Two-click reveal');
  await page.click('#a');
  check('first click arms', await page.evaluate(() => document.getElementById('a').hasAttribute('data-vb-armed')));
  check('first click does not navigate', await page.evaluate(() => location.hash === ''));
  await page.click('#a');
  check('second click reveals', (await states(page, ['a'])).a === 'shown');
  check('second click does not navigate', await page.evaluate(() => location.hash === ''));
  await page.reload();
  await waitFor(page, () => document.getElementById('a')?.getAttribute('data-vb') === 'blur');
  await page.click('#a');
  await sleep(4400);
  check('armed state times out', await page.evaluate(() => !document.getElementById('a').hasAttribute('data-vb-armed')));

  section('Settings: reveal, style');
  await setSettings({ reveal: 'one' });
  await sleep(500);
  await page.click('#c');
  check('reveal=one: single click reveals', (await states(page, ['c'])).c === 'shown');
  await setSettings({ reveal: 'locked' });
  await sleep(500);
  await page.click('#a');
  check('reveal=locked: click does nothing', (await states(page, ['a'])).a === 'blur');
  await setSettings({ reveal: 'two', style: 'cover' });
  await sleep(500);
  st = await states(page, ['a', 'dyn-hit']);
  check('style=cover applied live', st.a === 'cover' && st['dyn-hit'] === 'cover', JSON.stringify(st));
  await page.screenshot({ path: path.join(OUT, 'fixture-cover.png') });
  await setSettings({ style: 'remove' });
  await sleep(500);
  check('style=remove hides the card entirely', await page.evaluate(() => getComputedStyle(document.getElementById('a')).display === 'none'));
  await setSettings({ style: 'blur' });
  await sleep(400);

  section('Settings: levels and custom words');
  await setSettings({ level: 'light' });
  await sleep(500);
  st = await states(page, ['a', 'c', 'title-card', 'long-hit']);
  check('light keeps core hits', st.a === 'blur');
  check('light drops characters and places', st.c === null && st['title-card'] === null && st['long-hit'] === null, JSON.stringify(st));
  await setSettings({ level: 'balanced', custom: ['tomato soup'] });
  await sleep(500);
  st = await states(page, ['dyn-ok', 'c']);
  check('custom word hides its card', st['dyn-ok'] === 'blur', JSON.stringify(st));
  check('back to balanced restores characters', st.c === 'blur');
  await setSettings({ custom: [] });
  await sleep(400);
  check('removing the custom word un-hides', (await states(page, ['dyn-ok']))['dyn-ok'] === null);

  section('Dynamic content');
  await page.evaluate(() => window.recycleNow());
  await sleep(400);
  check('recycled card that no longer matches is un-hidden', (await states(page, ['recycled'])).recycled === null);
  await page.evaluate(() => window.recycleBack());
  await sleep(400);
  check('recycled card that matches again is re-hidden', (await states(page, ['recycled'])).recycled === 'blur');

  section('Trust and pause');
  await setSettings({ trusted: [HOST] });
  await sleep(500);
  check('trusted site: nothing hidden', await page.evaluate(() => document.querySelectorAll('[data-vb]').length === 0));
  await setSettings({ trusted: [] });
  await sleep(600);
  check('untrusted: hidden again', (await states(page, ['a'])).a === 'blur');
  await setSettings({ pausedUntil: Date.now() + 600000 });
  await sleep(500);
  check('paused: nothing hidden', await page.evaluate(() => document.querySelectorAll('[data-vb]').length === 0));
  await setSettings({ pausedUntil: 0 });
  await sleep(600);
  check('resumed: hidden again', (await states(page, ['a'])).a === 'blur');
  await setSettings({ enabled: false });
  await sleep(500);
  check('master switch off: nothing hidden', await page.evaluate(() => document.querySelectorAll('[data-vb]').length === 0));
  await setSettings({ enabled: true });
  await sleep(500);

  section('Badge');
  const badge = await sw.evaluate(async () => {
    const [t] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' }).catch(() => []);
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((x) => x.url && x.url.includes('fixture.html'));
    return tab ? chrome.action.getBadgeText({ tabId: tab.id }) : 'NO TAB';
  });
  check('toolbar badge shows a count', /^\d+\+?$/.test(badge) && badge !== '0', `(got "${badge}")`);

  /* ============ curtain ============ */
  section('Page curtain');
  const cp = await ctx.newPage();
  await cp.goto(`${BASE}/curtain.html`);
  const up = await waitFor(cp, () => !!document.querySelector('vice-blind-curtain'));
  check('curtain appears when the title matches', up);
  await sleep(1800);
  check('nothing is hidden individually while the curtain is up', await cp.evaluate(() => document.querySelectorAll('[data-vb]').length === 0));
  check('page video is paused behind the curtain', await cp.evaluate(() => document.getElementById('v').paused));
  check('page scroll is locked', await cp.evaluate(() => document.documentElement.style.overflow === 'hidden'));
  check('curtain fonts load from the extension', await cp.evaluate(async () => {
    await document.fonts.load('1em "Vice Blind Script"');
    return document.fonts.check('1em "Vice Blind Script"');
  }));
  await cp.screenshot({ path: path.join(OUT, 'curtain.png') });
  await cp.setViewportSize({ width: 390, height: 780 });
  await sleep(400);
  await cp.screenshot({ path: path.join(OUT, 'curtain-phone.png') });
  await cp.setViewportSize({ width: 1280, height: 800 });

  // Closed shadow root: drive it with the keyboard. Focus starts on "Go back".
  await cp.keyboard.press('Tab');
  await cp.keyboard.press('Enter');          // Show this page
  await sleep(400);
  check('"Show this page" lifts the curtain', await cp.evaluate(() => !document.querySelector('vice-blind-curtain')));
  check('"Show this page" shows everything (no blur boxes)', await cp.evaluate(() => document.querySelectorAll('[data-vb]').length === 0));
  check('page scroll is restored', await cp.evaluate(() => document.documentElement.style.overflow !== 'hidden'));
  await cp.reload();
  await sleep(1200);
  check('"Show this page" is remembered for the tab', await cp.evaluate(() => !document.querySelector('vice-blind-curtain')));

  const tp = await ctx.newPage();
  await tp.goto(`${BASE}/curtain.html?x=1`);
  await waitFor(tp, () => !!document.querySelector('vice-blind-curtain'));
  await sleep(1500);
  await tp.keyboard.press('Tab');
  await tp.keyboard.press('Tab');
  await tp.keyboard.press('Enter');          // Trust this site
  await sleep(700);
  check('"Trust this site" lifts the curtain', await tp.evaluate(() => !document.querySelector('vice-blind-curtain')));
  check('"Trust this site" saves the host', (await getSettings()).trusted?.includes(HOST));
  await resetSettings();

  const sp = await ctx.newPage();
  await sp.goto(`${BASE}/curtain.html?q=gta+6`);
  await sleep(1200);
  check('search-style pages get no curtain', await sp.evaluate(() => !document.querySelector('vice-blind-curtain')));
  await setSettings({ curtain: false });
  const np = await ctx.newPage();
  await np.goto(`${BASE}/curtain.html?y=2`);
  await sleep(1200);
  check('curtain can be switched off', await np.evaluate(() => !document.querySelector('vice-blind-curtain')));
  await resetSettings();

  /* ============ extension pages: screenshots and basic behaviour ============ */
  section('Extension pages');
  const fixtureTabId = await sw.evaluate(async () => (await chrome.tabs.query({})).find((t) => t.url?.includes('fixture.html'))?.id);
  const pop = await ctx.newPage();
  await pop.addInitScript(({ id, url }) => {
    // The popup normally reads the active tab. Opened as a tab it would read itself, so point it at the fixture.
    chrome.tabs.query = async () => [{ id, url }];
  }, { id: fixtureTabId, url: `${BASE}/fixture.html` });
  await pop.setViewportSize({ width: 380, height: 760 });
  await pop.goto(`chrome-extension://${EXT_ID}/popup/popup.html`);
  await sleep(2200);
  check('popup shows the page host', (await pop.textContent('#host')).includes(HOST));
  check('popup shows a hidden count', /\d+\s*hidden/.test(await pop.textContent('#pageStat')), await pop.textContent('#pageStat'));
  await pop.screenshot({ path: path.join(OUT, 'popup.png'), fullPage: true });
  await pop.click('#level button[data-value="strict"]');
  await sleep(500);
  check('popup level change saves', (await getSettings()).level === 'strict');
  await pop.click('#shield');
  await sleep(500);
  check('popup master switch saves', (await getSettings()).enabled === false);
  await pop.screenshot({ path: path.join(OUT, 'popup-off.png'), fullPage: true });
  await resetSettings();

  const opt = await ctx.newPage();
  await opt.setViewportSize({ width: 1280, height: 900 });
  await opt.goto(`chrome-extension://${EXT_ID}/options/options.html`);
  await sleep(2400);
  await opt.screenshot({ path: path.join(OUT, 'options.png'), fullPage: true });
  check('options: test box highlights matches', (await opt.locator('#testOut mark').count()) >= 4);
  await opt.fill('#customInput', 'tomato soup');
  await opt.press('#customInput', 'Enter');
  await sleep(300);
  check('options: custom word saves', (await getSettings()).custom?.includes('tomato soup'));
  await opt.fill('#siteInput', 'https://www.example.com/path');
  await opt.press('#siteInput', 'Enter');
  await sleep(300);
  check('options: trusted site saves clean host', (await getSettings()).trusted?.includes('example.com'));
  await opt.setViewportSize({ width: 390, height: 844 });
  await sleep(500);
  check('options phone: no horizontal overflow', await opt.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await opt.screenshot({ path: path.join(OUT, 'options-phone.png') });
  await opt.click('#burger');
  await sleep(500);
  check('options phone: menu opens', await opt.evaluate(() => document.getElementById('nav').classList.contains('open')));
  await opt.screenshot({ path: path.join(OUT, 'options-phone-menu.png') });
  await opt.keyboard.press('Escape');
  check('options phone: Esc closes menu', await opt.evaluate(() => !document.getElementById('nav').classList.contains('open')));
  await resetSettings();

  const wel = ctx.pages().find((p) => p.url().includes('welcome/welcome.html')) || (await ctx.newPage());
  if (!wel.url().includes('welcome')) await wel.goto(`chrome-extension://${EXT_ID}/welcome/welcome.html`);
  await wel.setViewportSize({ width: 1440, height: 900 });
  await wel.reload();
  await sleep(2600);
  await wel.screenshot({ path: path.join(OUT, 'welcome.png') });
  check('welcome: neon script and sans fonts actually load', await wel.evaluate(async () => {
    await Promise.all([document.fonts.load('1em Yellowtail'), document.fonts.load('600 1em Jost')]);
    return document.fonts.check('1em Yellowtail') && document.fonts.check('600 1em Jost');
  }));
  await wel.click('#feed .demo-card >> nth=0');
  await wel.click('#feed .demo-card >> nth=0');
  check('welcome: demo card reveals on two clicks', (await wel.getAttribute('#feed .demo-card >> nth=0', 'data-vb')) === 'shown');
  await wel.setViewportSize({ width: 390, height: 844 });
  await sleep(500);
  check('welcome phone: no horizontal overflow', await wel.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await wel.screenshot({ path: path.join(OUT, 'welcome-phone.png'), fullPage: true });

  /* ============ errors ============ */
  section('Console');
  const real = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/.test(e));
  check('no extension errors in any page', real.length === 0, real.slice(0, 5).join(' | '));
} catch (e) {
  failures.push(`harness crashed: ${e.stack || e}`);
  console.log(e);
} finally {
  await ctx.close();
  server.close();
  await fs.rm(userDir, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
