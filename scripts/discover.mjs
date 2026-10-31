// Client-site discovery.
// Looks through your GitHub repos for a `nowora.json` file at the root. Every repo that has one
// is a client website: it's added to the NOWORA showcase and gets a client dashboard
// (link + PIN emailed to you) the first time it's seen. Nothing to add by hand.
//
// nowora.json (only "name" is needed; everything else is optional):
//   {
//     "name": "52 Alive",
//     "niche": "Streetwear brand",
//     "description": "One line for the showcase card.",
//     "tag": "Shops & brands",            // Local business | Shops & brands | Sales funnels | Services
//     "url": "https://52-alive.pages.dev", // left out → repo homepage, then <repo>.pages.dev / .vercel.app / GitHub Pages
//     "slug": "52-alive",                  // dashboard link name; left out → made from the name
//     "status": "live",                    // live | building
//     "showcase": true, "dashboard": true, // set false to skip either
//     "client": { "name": "Aman", "phone": "9368986368", "email": "", "package": "Business", "price": 29999 }
//   }
//
//   node scripts/discover.mjs             registers what it finds
//   node scripts/discover.mjs --dry-run   prints what it would register
import { api, ENDPOINT, KEY, DRY_RUN } from './lib.mjs';

const SELF = (process.env.GITHUB_REPOSITORY || 'Sarthak-B/Nowora').toLowerCase();
const OWNER = process.env.DISCOVER_OWNER || process.env.GITHUB_REPOSITORY_OWNER || 'Sarthak-B';
const PRIVATE_TOKEN = process.env.DISCOVER_TOKEN || '';          // optional: also scans private repos
const TOKEN = PRIVATE_TOKEN || process.env.GITHUB_TOKEN || '';

async function gh(path) {
  const res = await fetch('https://api.github.com' + path, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'nowora-discover', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path.split('?')[0]}`);
  return res.json();
}

async function listRepos() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const list = PRIVATE_TOKEN
      ? await gh(`/user/repos?affiliation=owner&per_page=100&page=${page}&sort=pushed`)
      : await gh(`/users/${OWNER}/repos?type=owner&per_page=100&page=${page}&sort=pushed`);
    if (!list || !list.length) break;
    out.push(...list);
    if (list.length < 100) break;
  }
  return out.filter(r => !r.fork && !r.archived && r.full_name.toLowerCase() !== SELF);
}

async function readConfig(repo) {
  const f = await gh(`/repos/${repo.full_name}/contents/nowora.json?ref=${encodeURIComponent(repo.default_branch)}`);
  if (!f || !f.content) return null;
  try { return JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')); }
  catch { throw new Error(`nowora.json in ${repo.name} is not valid JSON`); }
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 nowora-discover' } });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('html')) return null;
    return { url: res.url || url, html: (await res.text()).slice(0, 400000) };
  } catch { return null; }
}

async function resolveUrl(repo, cfg) {
  const n = repo.name.toLowerCase();
  const tries = [cfg.url, repo.homepage, `https://${n}.pages.dev`, `https://${n}.vercel.app`, `https://${repo.owner.login.toLowerCase()}.github.io/${repo.name}/`, `https://${n}.netlify.app`]
    .filter(Boolean).map(u => (/^https?:\/\//i.test(u) ? u : 'https://' + u));
  for (const u of [...new Set(tries)]) { const page = await fetchPage(u); if (page) return page; }
  return null;
}

const meta = (html, re) => { const m = re.exec(html); return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim() : ''; };

const repos = await listRepos();
const found = [], problems = [];
for (const repo of repos) {
  let cfg;
  try { cfg = await readConfig(repo); } catch (e) { problems.push(e.message); continue; }
  if (!cfg) continue;
  const page = await resolveUrl(repo, cfg);
  if (!page) { problems.push(`${repo.name}: no live website found yet (add "url" to nowora.json)`); continue; }
  const html = page.html;
  const title = meta(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i) || meta(html, /<title[^>]*>([^<]+)/i).split(/\s+[|—–·-]\s+/)[0];
  found.push({
    repo: repo.full_name,
    url: page.url,
    name: cfg.name || title || repo.name,
    niche: cfg.niche || '',
    description: cfg.description || meta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || meta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i) || repo.description || '',
    tag: cfg.tag || '',
    slug: cfg.slug || '',
    trackId: cfg.trackId || '',
    status: cfg.status || 'live',
    showcase: cfg.showcase !== false,
    dashboard: cfg.dashboard !== false,
    tracking: /nowora\.vercel\.app\/t\.js|\/t\.js["'][^>]*data-site/.test(html),
    client: cfg.client || {}
  });
}

console.log(`Scanned ${repos.length} repo(s); ${found.length} client site(s) with nowora.json.`);
problems.forEach(p => console.log('! ' + p));
if (DRY_RUN || !ENDPOINT || !KEY) {
  if (!DRY_RUN) console.log('Not configured (STUDIO_ENDPOINT / STUDIO_AUTOMATION_KEY missing) — nothing registered.');
  found.forEach(s => console.log(JSON.stringify({ ...s, client: s.client.name ? '(set)' : '' })));
  process.exit(0);
}

const created = [];
for (const site of found) {
  try {
    const r = await api({ action: 'register_site', site });
    if (r.portfolio === 'created' || r.client === 'created') created.push(site.name);
    console.log(`${site.repo.split('/')[1]}: showcase ${r.portfolio}, dashboard ${r.client}`);
  } catch (e) { problems.push(`${site.repo.split('/')[1]}: ${e.message}`); }
}
if (created.length || problems.length) {
  await api({ action: 'automation_report', workflow: 'discover', status: problems.length ? 'failure' : 'success',
    summary: created.length ? `New client site${created.length > 1 ? 's' : ''}: ${created.join(', ')}` : `${problems.length} discovery issue(s)`,
    details: problems.join(' | ').slice(0, 1800) });
}
