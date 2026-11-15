// Website check: serves docs/ under /ViceBlind/ (the GitHub Pages project path) and verifies it in a real browser.
// Run: python tools/build_site.py && VB_CHANNEL=msedge node tests/site.e2e.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(ROOT, 'test-results');
await fs.mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures = [];
const check = (n, ok, d = '') => { if (ok) { passed++; console.log(`  ok   ${n}`); } else { failures.push(`${n} ${d}`); console.log(`  FAIL ${n} ${d}`); } };

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const hits = [];
const server = http.createServer(async (req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (!u.startsWith('/ViceBlind/')) { res.writeHead(404); res.end('outside project path'); return; }
  let rel = u.slice('/ViceBlind/'.length) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  try {
    const body = await fs.readFile(path.join(DOCS, rel));
    hits.push([rel, 200]);
    res.writeHead(200, { 'content-type': TYPES[path.extname(rel)] || 'application/octet-stream' });
    res.end(body);
  } catch { hits.push([rel, 404]); res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/ViceBlind/`;

const browser = await chromium.launch({ channel: process.env.VB_CHANNEL || 'chromium', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + (m.location()?.url || '')); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto(URL_);
  await sleep(2600);

  console.log('\nLoad and security');
  check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  check('no CSP violations', (await page.evaluate(() => window.__csp)).length === 0, JSON.stringify(await page.evaluate(() => window.__csp)));
  check('every asset request resolved (no 404)', hits.every(([, c]) => c === 200), JSON.stringify(hits.filter(([, c]) => c !== 200)));
  check('no inline scripts or style attributes', await page.evaluate(() => !document.querySelector('script:not([src])') && !document.querySelector('[style]')));
  check('external links use rel noopener noreferrer', await page.evaluate(() => [...document.querySelectorAll('a[href^="http"]')].every((a) => /noopener/.test(a.rel) && /noreferrer/.test(a.rel))));
  check('no request left the site origin', await page.evaluate(() => performance.getEntriesByType('resource').every((r) => r.name.startsWith(location.origin))));
  check('CSP meta present', await page.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')));

  console.log('\nContent');
  check('one h1 with the sign', (await page.locator('h1').count()) === 1 && (await page.locator('h1').textContent()).includes('Stay blind'));
  check('neon script and sans fonts load', await page.evaluate(async () => {
    await Promise.all([document.fonts.load('1em Yellowtail'), document.fonts.load('600 1em Jost')]);
    return document.fonts.check('1em Yellowtail') && document.fonts.check('600 1em Jost');
  }));
  check('sun and palms are drawn', (await page.locator('#sun svg').count()) === 1 && (await page.locator('#palms svg').count()) === 1);
  check('title, description, canonical and og:image set', await page.evaluate(() => !!document.title && !!document.querySelector('meta[name=description]') && !!document.querySelector('link[rel=canonical]') && !!document.querySelector('meta[property="og:image"]')));
  check('sponsor section links to GitHub Sponsors safely', await page.evaluate(() => { const a = document.querySelector('#support a[href="https://github.com/sponsors/Rocmine"]'); return !!a && /noopener/.test(a.rel) && /noreferrer/.test(a.rel); }));
  check('og image file exists in docs', (await fs.stat(path.join(DOCS, 'assets', 'og.png'))).size > 1000);

  console.log('\nLive demo');
  check('Firefox "not verified" guidance is on the page', await page.evaluate(() => { const t = document.querySelector('#install').innerText; return /not verified/i.test(t) && /Do not drag the zip/i.test(t) && /about:debugging/.test(t); }));
  const cards = page.locator('#feed .demo-card');
  check('three demo cards', (await cards.count()) === 3);
  check('GTA cards hidden, the other one is not', (await cards.nth(0).getAttribute('data-vb')) === 'blur' && (await cards.nth(1).getAttribute('data-vb')) === null && (await cards.nth(2).getAttribute('data-vb')) === 'blur');
  await cards.nth(0).scrollIntoViewIfNeeded();
  await cards.nth(0).click();
  check('first click arms', await cards.nth(0).evaluate((e) => e.hasAttribute('data-vb-armed')));
  await cards.nth(0).click();
  check('second click shows it', (await cards.nth(0).getAttribute('data-vb')) === 'shown');
  await page.click('#style button[data-value="cover"]');
  check('style switch to cover', (await cards.nth(2).getAttribute('data-vb')) === 'cover');
  await page.click('#style button[data-value="blur"]');
  await page.evaluate(() => scrollTo(0, 0));
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'site-desktop-top.png') });
  await page.screenshot({ path: path.join(OUT, 'site-desktop-full.png'), fullPage: true });

  console.log('\nResponsive');
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(600);
  check('phone: no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.evaluate(() => scrollTo(0, 0));
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'site-phone-top.png') });
  await page.screenshot({ path: path.join(OUT, 'site-phone-full.png'), fullPage: true });

  console.log('\nReduced motion');
  const rm = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await rm.goto(URL_);
  await sleep(500);
  check('reduced motion turns the flicker and slats off', (await rm.getAttribute('html', 'data-motion')) === 'reduced');
} catch (e) {
  failures.push('harness crashed: ' + (e.stack || e));
  console.log(e);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
