// Serves client sites from this project:
//  - <name>.make4yu.com whose website lives in Cloudflare D1 (clients.host) → the newest published version, straight from D1
//  - otherwise → site/_sites/<name>/ (copied in by scripts/sync-sites.mjs)
// make4yu.com and www.make4yu.com work as before.
const ROOT_HOSTS = new Set(["make4yu.com", "www.make4yu.com"]);
const API = "https://make4yu.com/api/v2";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const m = /^([a-z0-9-]+)\.make4yu\.com$/.exec(host);

  if (!m || ROOT_HOSTS.has(host)) {
    // the studio site itself; client copies are only reachable on their own address
    if (url.pathname.startsWith("/_sites/")) return new Response("Not found", { status: 404 });
    return next();
  }

  const d1 = await fromD1(env, m[1], url, request);
  if (d1) return d1;

  const prefix = "/_sites/" + m[1];
  url.pathname = prefix + url.pathname;
  const res = await env.ASSETS.fetch(new Request(url, request));

  // clean-URL redirects from the asset server point at the internal path; give the visitor the public one
  const loc = res.headers.get("Location");
  if (loc) {
    const to = new URL(loc, url);
    if (to.pathname.startsWith(prefix)) {
      const h = new Headers(res.headers);
      h.set("Location", to.pathname.slice(prefix.length) + to.search + to.hash || "/");
      return new Response(res.body, { status: res.status, headers: h });
    }
  }
  return res;
}

async function fromD1(env, name, url, request) {
  if (!env.DB || !/^(GET|HEAD)$/.test(request.method)) return null;
  let c;
  try { c = await env.DB.prepare("SELECT id, track_id FROM clients WHERE host=? COLLATE NOCASE").bind(name).first(); } catch (e) { return null; }   // tables not made yet
  if (!c) return null;
  const p = decodeURIComponent(url.pathname);
  if (p === "/" || p === "/index.html") {
    const v = await env.DB.prepare("SELECT html FROM site_versions WHERE client_id=? ORDER BY id DESC LIMIT 1").bind(c.id).first();
    if (!v) return new Response("This website is being set up.", { status: 503, headers: { "Content-Type": "text/plain" } });
    // its visit counter and forms report to D1
    const html = v.html.replace(/<script([^>]*\bsrc=["'][^"']*\/t\.js[^"']*["'][^>]*)>/i, (all, attrs) =>
      /data-endpoint=/.test(attrs) ? all : "<script" + attrs + ' data-endpoint="' + API + '">');
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
  }
  if (/^\/images\/uploads\/[\w.-]+$/.test(p)) {
    const f = await env.DB.prepare("SELECT type, data FROM assets WHERE client_id=? AND path=?").bind(c.id, p.slice(1)).first();
    if (f) return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.type, "Cache-Control": "public, max-age=31536000, immutable" } });
  }
  return new Response("Not found", { status: 404 });
}
