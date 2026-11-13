// Cloudflare Pages: /client/<slug> opens the client dashboard (the page reads the name from the address).
// Real files like /client/shop.js are served as-is.
// Clients that live in Cloudflare D1 get the D1 backend (/api/v2) instead of Google Sheets.
export async function onRequest({ request, env, params }) {
  if (String(params.slug).includes(".")) return env.ASSETS.fetch(request);
  const url = new URL(request.url);
  url.pathname = "/client/";
  const res = await env.ASSETS.fetch(new Request(url, request));
  if (!env.DB) return res;
  let hit = null;
  try { hit = await env.DB.prepare("SELECT id FROM clients WHERE portal_key=? COLLATE NOCASE").bind(String(params.slug)).first(); } catch (e) { /* D1 tables not made yet */ }
  if (!hit) return res;
  const html = (await res.text()).replace("<head>", '<head><script>window.M4Y_API="/api/v2"</script>');
  const h = new Headers(res.headers); h.delete("Content-Length"); h.set("Cache-Control", "no-cache");
  return new Response(html, { status: res.status, headers: h });
}
