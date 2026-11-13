// POST /api/v2 — the make4yu backend on Cloudflare D1 (test). Same request shape as the Apps Script endpoint.
// GET  /api/v2?a=<clientId>&p=<path> — a stored photo (change-request attachments).
import * as M from "../../lib/m4y.js";
import { seedTests } from "../../lib/seed.js";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, CORS) });

export async function onRequestOptions() { return new Response(null, { status: 204, headers: CORS }); }

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: "D1 isn't connected" });
  const u = new URL(request.url), a = u.searchParams.get("a"), p = u.searchParams.get("p");
  if (!a || !p || !/^requests\//.test(p)) return json({ ok: true, service: "make4yu-d1", time: M.now() });
  const f = await M.getAsset(env, a, p);
  return f ? new Response(f.data, { headers: { "Content-Type": f.type, "Cache-Control": "private, max-age=86400" } }) : new Response("Not found", { status: 404 });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: "D1 isn't connected to this project yet" });
  let b; try { b = JSON.parse(await request.text()); } catch (e) { return json({ ok: false, error: "Invalid JSON" }); }
  const origin = new URL(request.url).origin;
  try {
    const pc = () => M.portalClient(env, b), w = async () => M.writable(await pc());
    switch (b.action) {
      /* public: the t.js snippet on client sites */
      case "ctrack": return json(await M.clientTrack(env, b.event));
      case "cform": return json(await M.clientForm(env, b));
      /* client dashboard */
      case "portal": return json({ ok: true, data: await M.portal(env, await pc(), +b.since || 0) });
      case "portal_request": return json(await M.portalRequest(env, await w(), b.request, origin));
      case "site_source": return json({ ok: true, site: await M.siteSource(env, await pc()) });
      case "site_publish": return json(await M.sitePublish(env, await w(), b));
      case "site_versions": return json({ ok: true, versions: await M.siteVersions(env, await pc()) });
      case "site_restore": return json(await M.siteRestore(env, await w(), b.sha));
      case "db_get": return json(await M.dbGet(env, await pc(), b.tableId));
      case "db_rev": return json({ ok: true, rev: await M.dbRev(env, await pc()) });
      case "db_save_table": return json(await M.dbSaveTable(env, await w(), b.table));
      case "db_delete_table": return json(await M.dbDeleteTable(env, await w(), b.tableId));
      case "db_save_row": return json(await M.dbSaveRow(env, await w(), b.tableId, b.row));
      case "db_delete_rows": return json(await M.dbDeleteRows(env, await w(), b.tableId, b.ids));
      case "alerts": {                        // what was sent to the client's WhatsApp, for the dashboard
        const c = await pc();
        const r = (await env.DB.prepare("SELECT ts, title, sent, error, tries FROM alerts WHERE client_id=? AND kind='client' ORDER BY ts DESC LIMIT 20").bind(c.id).all()).results;
        return json({ ok: true, alerts: r });
      }
      /* owner: create or update a client on D1 (admin key) */
      case "d1_client": {
        if (!env.ADMIN_KEY || b.key !== env.ADMIN_KEY) return json({ ok: false, error: "Not allowed" }, 403);
        return json(await upsertClient(env, b.client || {}));
      }
      /* one-time: the four D1 test clients (refuses once they exist) */
      case "d1_seed_tests": return json(await seedTests(env, b.step));
      default: return json({ ok: false, error: "Unknown action" });
    }
  } catch (e) {
    if (!(e instanceof M.Bad)) console.error("[v2]", b.action, e && e.stack || e);
    return json({ ok: false, error: e instanceof M.Bad ? e.message : "Something went wrong — please try again" });
  }
}

const FIELDS = ["business", "name", "phone", "email", "site", "kind", "package", "price", "delivered", "care_plan", "care_fee", "renewal", "status", "checklist", "notes", "advance_paid", "balance_paid", "edit_access", "wa_alerts", "pin", "host", "track_id", "portal_key", "repo", "uptime", "response_ms"];
async function upsertClient(env, c) {
  if (c.kind && !M.KINDS.includes(c.kind)) throw new M.Bad("kind must be one of " + M.KINDS.join(", "));
  const have = c.id ? await env.DB.prepare("SELECT id FROM clients WHERE id=?").bind(c.id).first() : null;
  if (have) {
    const set = FIELDS.filter(k => c[k] !== undefined);
    if (set.length) await env.DB.prepare("UPDATE clients SET " + set.map(k => k + "=?").join(", ") + " WHERE id=?").bind(...set.map(k => c[k]), c.id).run();
  } else {
    if (!c.business) throw new M.Bad("business is required");
    c.id = c.id || M.randomKey(10); c.portal_key = c.portal_key || M.randomKey(12); c.pin = c.pin || String(100000 + Math.floor(Math.random() * 900000));
    c.track_id = c.track_id || "d1" + M.randomKey(8);
    const cols = ["id"].concat(FIELDS.filter(k => c[k] !== undefined));
    await env.DB.prepare("INSERT INTO clients (" + cols.join(",") + ") VALUES (" + cols.map(() => "?").join(",") + ")").bind(...cols.map(k => c[k])).run();
  }
  for (const img of (c.images || []).slice(0, 60)) await M.putAsset(env, { id: c.id }, "images/uploads/" + String(img.name).replace(/[^\w.-]/g, ""), img.data);
  if (c.html) await env.DB.prepare("INSERT INTO site_versions (client_id, ts, message, who, html) VALUES (?,?,?,?,?)").bind(c.id, M.now(), "Website added", "make4yu", String(c.html)).run();
  return { ok: true, client: M.clientFromRow(await env.DB.prepare("SELECT * FROM clients WHERE id=?").bind(c.id).first()) };
}
