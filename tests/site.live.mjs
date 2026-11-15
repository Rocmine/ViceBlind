// Live check of the published site and release. Run: VB_CHANNEL=msedge node tests/site.live.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results');
await fs.mkdir(OUT, { recursive: true });
const URL_ = process.env.SITE_URL || 'https://rocmine.github.io/ViceBlind/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0; const bad = [];
const check = (n, c, d = '') => { c ? ok++ : bad.push(n + ' ' + d); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n} ${c ? '' : d}`); };

const browser = await chromium.launch({ channel: process.env.VB_CHANNEL || 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; const failed = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text() + ' ' + (m.location()?.url || '')); });
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const res = await page.goto(URL_, { waitUntil: 'networkidle' });
  await sleep(2500);
  console.log(`\nLive: ${URL_}`);
  check('HTTP 200 over HTTPS', res.status() === 200 && URL_.startsWith('https://'));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('no failed requests', failed.length === 0, failed.join(' | '));
  check('no CSP violations', (await page.evaluate(() => window.__csp)).length === 0, JSON.stringify(await page.evaluate(() => window.__csp)));
  check('every resource came from the site itself', await page.evaluate(() => performance.getEntriesByType('resource').every((r) => r.name.startsWith(location.origin))));
  check('fonts load', await page.evaluate(async () => { await Promise.all([document.fonts.load('1em Yellowtail'), document.fonts.load('600 1em Jost')]); return document.fonts.check('1em Yellowtail') && document.fonts.check('600 1em Jost'); }));
  check('Firefox "not verified" guidance is on the page', await page.evaluate(() => { const t = document.querySelector('#install').innerText; return /not verified/i.test(t) && /Do not drag the zip/i.test(t) && /about:debugging/.test(t); }));
  const cards = page.locator('#feed .demo-card');
  await cards.nth(0).click(); await cards.nth(0).click();
  check('live demo reveals on two clicks', (await cards.nth(0).getAttribute('data-vb')) === 'shown');
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href^="http"]')].map((a) => a.href));
  check('Twitch link points at rocmine', links.includes('https://www.twitch.tv/rocmine'));
  check('Download points at the latest release', links.includes('https://github.com/Rocmine/ViceBlind/releases/latest'));
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, 'site-live.png') });
  const og = await fetch(new URL('assets/og.png', URL_));
  check('social card is served', og.status === 200 && (og.headers.get('content-type') || '').includes('image/png'));
  const rel = await fetch('https://github.com/Rocmine/ViceBlind/releases/latest', { redirect: 'manual' });
  check('release page exists', [200, 302].includes(rel.status));
} catch (e) { bad.push('crashed ' + e.message); console.log(e); }
finally { await browser.close(); }
console.log(`\n${ok} ok, ${bad.length} failed`); if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
