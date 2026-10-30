// Shared helpers for the automation scripts.
// Talks to your Apps Script web app using the AUTOMATION_KEY (stored as a GitHub secret).

export const ENDPOINT = process.env.STUDIO_ENDPOINT;
export const KEY = process.env.STUDIO_AUTOMATION_KEY;
export const DRY_RUN = process.argv.includes('--dry-run');

export async function api(payload) {
  if (!ENDPOINT || !KEY) throw new Error('Set STUDIO_ENDPOINT and STUDIO_AUTOMATION_KEY (GitHub → Settings → Secrets → Actions).');
  const res = await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify({ ...payload, key: KEY }), redirect: 'follow' });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Apps Script returned non-JSON (HTTP ${res.status}). Check the web app is deployed with access "Anyone".`); }
  if (!json.ok) throw new Error(json.error || 'Apps Script request failed');
  return json;
}

export async function getTargets() {
  if (!DRY_RUN && (!ENDPOINT || !KEY)) {
    console.log('Not configured yet: add STUDIO_ENDPOINT and STUDIO_AUTOMATION_KEY under Settings → Secrets and variables → Actions. Skipping.');
    process.exit(0);
  }
  if (DRY_RUN) {
    const sites = (process.env.TEST_SITES || 'https://example.com').split(',');
    return { clients: sites.map((s, i) => ({ id: 'c' + i, business: s, site: s })), prospects: sites.map((s, i) => ({ id: 'p' + i, business: s, website: s })) };
  }
  return api({ action: 'automation_targets' });
}

export async function report(body) {
  if (DRY_RUN) { console.log('[dry-run] report', JSON.stringify(body, (k, v) => k === 'screenshot' && v ? `<${v.length} chars>` : v, 2)); return; }
  return api({ action: 'automation_report', ...body });
}

export const normalizeUrl = u => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
