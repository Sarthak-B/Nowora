// Serves client sites from this project: <name>.make4yu.com → site/_sites/<name>/
// (copied in by scripts/sync-sites.mjs). make4yu.com and www.make4yu.com work as before.
const ROOT_HOSTS = new Set(["make4yu.com", "www.make4yu.com"]);

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const m = /^([a-z0-9-]+)\.make4yu\.com$/.exec(host);

  if (!m || ROOT_HOSTS.has(host)) {
    // the studio site itself; client copies are only reachable on their own address
    if (url.pathname.startsWith("/_sites/")) return new Response("Not found", { status: 404 });
    return next();
  }

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
