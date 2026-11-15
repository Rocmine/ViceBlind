// Real-site smoke test (needs internet, logged out). Run: VB_CHANNEL=msedge node tests/e2e-sites.mjs
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'dist', 'chrome');
const OUT = path.join(ROOT, 'test-results');
await fs.mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const userDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vice-blind-sites-'));
const ctx = await chromium.launchPersistentContext(userDir, {
  channel: process.env.VB_CHANNEL || 'chromium', headless: true, viewport: { width: 1366, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const errors = [];
let ok = 0, bad = 0;
const check = (n, c, d = '') => { c ? ok++ : bad++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n} ${c ? '' : d}`); };

async function probe(name, url, { settle = 5000, shot } = {}) {
  console.log(`\n${name}`);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) { console.log('  (navigation problem: ' + e.message.split('\n')[0] + ')'); }
  await sleep(settle);
  await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
  await sleep(1500);
  const info = await page.evaluate(() => {
    const marked = [...document.querySelectorAll('[data-vb]')];
    const deep = (root, out = []) => { for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) { out.push(...el.shadowRoot.querySelectorAll('[data-vb]')); deep(el.shadowRoot, out); } } return out; };
    const all = [...marked, ...deep(document)];
    return {
      title: document.title,
      curtain: !!document.querySelector('vice-blind-curtain'),
      hidden: all.length,
      tags: [...new Set(all.map((e) => e.tagName.toLowerCase()))].slice(0, 6),
      sample: all.slice(0, 3).map((e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70)),
    };
  });
  console.log('  ', JSON.stringify(info));
  if (shot) await page.screenshot({ path: path.join(OUT, shot) });
  return { page, info };
}

try {
  const yt = await probe('YouTube search: "gta 6 trailer"', 'https://www.youtube.com/results?search_query=gta+6+trailer', { shot: 'site-youtube-search.png' });
  check('YouTube search: GTA cards are hidden', yt.info.hidden >= 3, JSON.stringify(yt.info));
  check('YouTube search: no whole-page curtain', !yt.info.curtain);
  check('YouTube search: uses video tile selectors', yt.info.tags.some((t) => /^(ytd|yt-|ytm)/.test(t)), yt.info.tags.join(','));

  const ytHome = await probe('YouTube search for something unrelated', 'https://www.youtube.com/results?search_query=cooking+pasta', { shot: 'site-youtube-clean.png' });
  check('YouTube unrelated search: nothing hidden', ytHome.info.hidden === 0, JSON.stringify(ytHome.info));

  const rd = await probe('Reddit search: "gta 6"', 'https://www.reddit.com/search/?q=gta%206', { shot: 'site-reddit.png' });
  check('Reddit search: page loaded', /reddit/i.test(rd.info.title) || rd.info.hidden > 0, rd.info.title);
  console.log(`  (hidden on Reddit: ${rd.info.hidden})`);

  const news = await probe('News article about GTA 6', 'https://en.wikipedia.org/wiki/Grand_Theft_Auto_VI', { shot: 'site-wikipedia.png' });
  check('Wikipedia GTA VI article: curtain appears (title match)', news.info.curtain, JSON.stringify(news.info));
} catch (e) { console.log('crashed:', e); bad++; }
finally { await ctx.close(); await fs.rm(userDir, { recursive: true, force: true }).catch(() => {}); }

console.log(`\n${ok} ok, ${bad} failed; page errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(' -', e));
process.exit(bad ? 1 : 0);
