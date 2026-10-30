// Prospect site audit.
// For every prospect you marked "Check site" in the dashboard, this opens their website on
// desktop and on a phone, scores it, lists the problems worth mentioning in your pitch,
// and uploads a mobile screenshot to Drive so the outreach message can link to it.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import { getTargets, report, normalizeUrl } from './lib.mjs';

async function audit(browser, p) {
  const issues = [];
  let score = 100;
  const hit = (pts, msg) => { score -= pts; issues.push(msg); };
  const url = normalizeUrl(p.website);
  const out = { id: p.id, business: p.business };

  // ---- desktop pass ----
  const desk = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    const t0 = Date.now();
    const res = await desk.goto(url, { waitUntil: 'load', timeout: 45000 });
    const loadMs = Date.now() - t0;
    if (!res || res.status() >= 400) hit(60, `Site returns error ${res ? res.status() : ''}`.trim());
    if (!desk.url().startsWith('https://')) hit(15, 'No HTTPS (shows "Not secure")');
    if (loadMs > 6000) hit(15, `Slow load (${(loadMs / 1000).toFixed(1)}s)`);
    else if (loadMs > 3500) hit(7, `Loads in ${(loadMs / 1000).toFixed(1)}s`);

    const info = await desk.evaluate(() => {
      const html = document.documentElement.innerHTML.toLowerCase();
      const imgs = [...document.images];
      return {
        title: document.title.trim(),
        metaDesc: !!document.querySelector('meta[name="description"]')?.content?.trim(),
        viewport: !!document.querySelector('meta[name="viewport"]'),
        whatsapp: /wa\.me|api\.whatsapp\.com|whatsapp:\/\//.test(html),
        phoneLink: !!document.querySelector('a[href^="tel:"]'),
        form: !!document.querySelector('form'),
        booking: /book|appointment|reserve|schedule/.test(document.body.innerText.toLowerCase()) && (!!document.querySelector('form') || /calendly|setmore|practo|booking/.test(html)),
        brokenImgs: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
        year: (document.body.innerText.match(/©\s*(\d{4})/) || [])[1]
      };
    });
    if (!info.title) hit(8, 'Missing page title');
    if (!info.metaDesc) hit(5, 'Missing meta description');
    if (!info.viewport) hit(20, 'No mobile viewport');
    if (!info.whatsapp) hit(8, 'No WhatsApp link');
    if (!info.phoneLink) hit(4, 'Phone number not tappable');
    if (!info.form && !info.whatsapp) hit(8, 'No way to enquire online');
    if (!info.booking) hit(4, 'No online booking');
    if (info.brokenImgs) hit(6, `${info.brokenImgs} broken image${info.brokenImgs > 1 ? 's' : ''}`);
    if (info.year && +info.year < new Date().getFullYear() - 2) hit(4, `Looks outdated (© ${info.year})`);
  } catch (e) {
    hit(70, 'Site does not load');
    out.error = e.message.split('\n')[0];
  } finally { await desk.close(); }

  // ---- mobile pass ----
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const mob = await ctx.newPage();
  try {
    await mob.goto(url, { waitUntil: 'load', timeout: 45000 });
    await mob.waitForTimeout(1200);
    const m = await mob.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 4,
      tinyText: [...document.querySelectorAll('p, li, a, span')].slice(0, 200).filter(el => el.innerText?.trim() && parseFloat(getComputedStyle(el).fontSize) < 12).length
    }));
    if (m.overflow) hit(12, 'Sideways scrolling on phones');
    if (m.tinyText > 15) hit(6, 'Text too small on phones');
    const buf = await mob.screenshot({ type: 'jpeg', quality: 70 });
    fs.mkdirSync('reports/audit', { recursive: true });
    fs.writeFileSync(`reports/audit/${p.id}-mobile.jpg`, buf);
    out.screenshot = 'data:image/jpeg;base64,' + buf.toString('base64');
  } catch { /* desktop pass already recorded the failure */ }
  finally { await ctx.close(); }

  out.auditScore = Math.max(0, Math.min(100, score));
  out.auditIssues = issues;
  return out;
}

const { prospects } = await getTargets();
if (!prospects.length) {
  console.log('No prospects queued for a site check.');
  process.exit(0);
}

const browser = await chromium.launch();
const results = [];
for (const p of prospects) {
  const r = await audit(browser, p);
  results.push(r);
  // Public repo: logs stay anonymous. Details only go to your private Google Sheet.
  console.log(`site ${results.length}: score ${r.auditScore}, ${r.auditIssues.length} issues`);
}
await browser.close();

await report({
  workflow: 'audit',
  status: 'success',
  summary: `Checked ${results.length} prospect site${results.length === 1 ? '' : 's'} · avg score ${Math.round(results.reduce((s, r) => s + r.auditScore, 0) / results.length)}`,
  details: results.map(r => `${r.business}: ${r.auditScore}`).join('\n'),
  prospects: results
});
fs.writeFileSync('reports/audit/results.json', JSON.stringify(results.map(({ screenshot, ...r }) => r), null, 2));
