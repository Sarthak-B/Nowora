// Portfolio previews.
// When you add a website link in the dashboard's Portfolio tab, this opens the site in a real
// browser, scrolls through it so every animation and lazy image loads, and captures a tall
// screenshot. The image is committed to site/work/shots/ and served through jsDelivr, so the
// showcase card can scroll through the whole page on hover. Title and description are filled
// in from the live page if the dashboard couldn't read them.
//
//   node scripts/portfolio.mjs --check     only reports how many links are waiting (fast, no browser)
//   node scripts/portfolio.mjs             captures, commits, pushes and reports back
//   node scripts/portfolio.mjs --dry-run   captures TEST_SITES locally without touching git or the sheet
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { api, ENDPOINT, KEY, DRY_RUN, normalizeUrl } from './lib.mjs';

const CHECK = process.argv.includes('--check');
const OUT_DIR = 'site/work/shots';
const WIDTH = 1440, MAX_HEIGHT = 7200, SCALE = 0.625;     // 1440 css px → 900 px wide image

function setOutput(k, v) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); }

async function targets() {
  if (DRY_RUN) return (process.env.TEST_SITES || 'https://example.com').split(',').map((u, i) => ({ id: 'test' + i, url: u }));
  if (!ENDPOINT || !KEY) { console.log('Not configured yet (STUDIO_ENDPOINT / STUDIO_AUTOMATION_KEY secrets missing). Skipping.'); return []; }
  return (await api({ action: 'portfolio_targets' })).items || [];
}

async function capture(browser, item) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: SCALE, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  try {
    const res = await page.goto(normalizeUrl(item.url), { waitUntil: 'load', timeout: 45000 });
    if (!res || res.status() >= 400) throw new Error(`The site answered with error ${res ? res.status() : 'none'}`);
    await page.waitForTimeout(2200);                                  // intro curtains, fonts
    // scroll the whole page so scroll-triggered reveals and lazy images run
    await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const H = () => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      for (let y = 0; y < Math.min(H(), 16000); y += 450) { window.scrollTo(0, y); await sleep(140); }
      window.scrollTo(0, H()); await sleep(600); window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1400);
    await page.evaluate(() => Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 4000); }))));
    const info = await page.evaluate(() => ({
      height: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
      title: (document.querySelector('meta[property="og:site_name"]')?.content || document.title || '').split(/\s+[|—–·]\s+|:\s+|\s+-\s+/)[0].trim(),
      description: (document.querySelector('meta[property="og:description"]')?.content || document.querySelector('meta[name="description"]')?.content || [...document.querySelectorAll('p')].map(p => p.innerText.trim()).find(t => t.length > 60) || '').trim()
    }));
    const height = Math.max(900, Math.min(info.height, MAX_HEIGHT));
    const safeId = String(item.id).replace(/[^\w-]/g, '').slice(0, 40) || 'site';
    const file = `${OUT_DIR}/${safeId}.jpg`;
    await page.screenshot({ path: file, type: 'jpeg', quality: 72, fullPage: true, clip: { x: 0, y: 0, width: WIDTH, height } });
    return { id: item.id, file, title: info.title.slice(0, 80), description: info.description.slice(0, 220) };
  } catch (e) {
    return { id: item.id, error: String(e.message || e).split('\n')[0].slice(0, 160) };
  } finally { await ctx.close(); }
}

const items = await targets();
if (CHECK) { console.log(`${items.length} portfolio link(s) waiting for a preview.`); setOutput('pending', items.length); process.exit(0); }
if (!items.length) { console.log('Nothing to capture.'); process.exit(0); }

const { chromium } = await import('playwright');
fs.mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const item of items.slice(0, 8)) {
  const r = await capture(browser, item);
  console.log(r.error ? `✗ item ${results.length + 1}: ${r.error}` : `✓ item ${results.length + 1}: ${r.file}`);   // no URLs in public logs
  results.push(r);
}
await browser.close();

const done = results.filter(r => r.file);
if (DRY_RUN) { console.log(JSON.stringify(results, null, 2)); process.exit(0); }

let sha = '';
if (done.length) {
  const git = c => execSync(c, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
  git('git config user.name "nowora-bot"');
  git('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
  git(`git add ${done.map(r => r.file).join(' ')}`);
  git(`git commit -m "Portfolio: capture ${done.length} website preview${done.length > 1 ? 's' : ''}"`);
  for (let i = 0; i < 3; i++) { try { git('git pull --rebase -q origin main'); git('git push -q origin HEAD:main'); break; } catch (e) { if (i === 2) throw e; } }
  sha = git('git rev-parse HEAD');
}
const repo = process.env.GITHUB_REPOSITORY || 'Sarthak-B/make4yu';
const portfolio = results.map(r => r.file
  ? { id: r.id, image: `https://cdn.jsdelivr.net/gh/${repo}@${sha}/${r.file}`, title: r.title, description: r.description }
  : { id: r.id, error: r.error });
await api({
  action: 'automation_report', workflow: 'portfolio', status: done.length === results.length ? 'success' : 'failure',
  summary: `Captured ${done.length} of ${results.length} website preview${results.length > 1 ? 's' : ''}`,
  details: results.filter(r => r.error).map(r => r.error).join(' | '), portfolio
});
console.log('Reported to the sheet.');
