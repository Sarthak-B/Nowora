// Cloudflare Pages: /client/<slug> opens the client dashboard (the page reads the name from the address).
// Real files like /client/shop.js are served as-is.
export async function onRequest({ request, env, params }) {
  if (String(params.slug).includes(".")) return env.ASSETS.fetch(request);
  const url = new URL(request.url);
  url.pathname = "/client/";
  return env.ASSETS.fetch(new Request(url, request));
}
