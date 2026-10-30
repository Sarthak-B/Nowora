// Uptime check for care-plan client sites.
// Opens each site in a real browser, measures load time, confirms the page actually rendered,
// and reports up/down to your Google Sheet. Apps Script sends the WhatsApp/email alert on change.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { getTargets, report, normalizeUrl } from './lib.mjs';

const TIMEOUT = 30000, SLOW_MS = 8000;

async function checkSite(browser, client) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  const url = normalizeUrl(client.site);
  const t0 = Date.now();
  try {
    const res = await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT });
    const ms = Date.now() - t0;
    const status = res ? res.status() : 0;
    const bodyText = (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).trim();
    const https = page.url().startsWith('https://');
    let error = '';
    if (status >= 400) error = `HTTP ${status}`;
    else if (bodyText.length < 40) error = 'Page rendered almost empty';
    else if (!https) error = 'Not served over HTTPS';
    fs.mkdirSync('reports/uptime', { recursive: true });
    await page.screenshot({ path: `reports/uptime/${client.id}.png` }).catch(() => {});
    return { id: client.id, business: client.business, uptime: error && error !== 'Not served over HTTPS' ? 'down' : 'up', responseMs: ms, status, error, slow: ms > SLOW_MS };
  } catch (e) {
    return { id: client.id, business: client.business, uptime: 'down', responseMs: '', status: 0, error: e.message.split('\n')[0].slice(0, 120) };
  } finally {
    await page.close();
  }
}

const { clients } = await getTargets();
if (!clients.length) {
  await report({ workflow: 'uptime', status: 'success', summary: 'No live sites to check yet', clients: [] });
  console.log('No sites to check.');
  process.exit(0);
}

const browser = await chromium.launch();
const results = [];
for (const c of clients) {
  // retry once before calling a site down, to avoid false alarms from a blip
  let r = await checkSite(browser, c);
  if (r.uptime === 'down') { await new Promise(s => setTimeout(s, 20000)); r = await checkSite(browser, c); }
  results.push(r);
  // Public repo: logs stay anonymous. Names and URLs only go to your private Google Sheet.
  console.log(`site ${results.length}: ${r.uptime}${r.responseMs ? ' · ' + r.responseMs + 'ms' : ''}`);
}
await browser.close();

const up = results.filter(r => r.uptime === 'up');
const avg = up.length ? Math.round(up.reduce((s, r) => s + r.responseMs, 0) / up.length) : 0;
const down = results.filter(r => r.uptime === 'down');
await report({
  workflow: 'uptime',
  status: down.length ? 'failure' : 'success',
  summary: down.length ? `${down.length} down: ${down.map(d => d.business).join(', ')}` : `${up.length} site${up.length === 1 ? '' : 's'} up · avg ${avg} ms`,
  details: results.filter(r => r.slow || r.error).map(r => `${r.business}: ${r.error || 'slow ' + r.responseMs + 'ms'}`).join('\n'),
  clients: results.map(({ id, uptime, responseMs, error }) => ({ id, uptime, responseMs, error }))
});
fs.writeFileSync('reports/uptime/results.json', JSON.stringify(results, null, 2));
