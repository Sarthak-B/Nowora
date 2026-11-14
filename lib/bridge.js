/* Clients whose data lives on D1 but whose account stays in Google Sheets (clients.bridge = 'apps-script').
 * D1 keeps their visits, orders, payments and records. Apps Script keeps what it already does well:
 * the account (plan, payments, PIN, owner login), change requests, website editing through GitHub
 * and the new-order email. */
import * as M from "./m4y.js";

export const APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbwOFH3fuNlDOsOV59HZ4bmSYCZcsHMcNMtwc_qPF8Dn_-cOUN_NJVPoCoXx7WqWwWB7/exec";
// handled entirely by Apps Script for bridged clients
export const FORWARD = ["portal_request", "site_source", "site_pages", "site_publish", "site_versions", "site_restore"];

export async function callScript(env, body, timeoutMs) {
  const r = await fetch(env.APPS_SCRIPT_URL || APPS_SCRIPT, { method: "POST", body: JSON.stringify(body), redirect: "follow", signal: AbortSignal.timeout(timeoutMs || 25000) });
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { const x = new Error("Apps Script didn't answer"); x.down = true; throw x; }
}

/** Who is asking: checked by Apps Script (PIN or owner key); the D1 copy of the PIN is the fallback if Apps Script is down. */
export async function bridgedClient(env, b) {
  const key = String(b.portalKey || "").trim();
  if (!/^[\w-]{3,40}$/.test(key) && !b.clientId) return null;
  const c = key ? await M.clientBy(env, "portal_key", key) : null;
  if (!c || c.bridge !== "apps-script") return null;
  let s;
  try { s = await callScript(env, { action: "portal_sync", portalKey: c.portalKey, pin: b.pin, key: b.key, clientId: b.clientId }); }
  catch (e) { if (!e.down) throw e; const own = await M.portalClient(env, b); own._stale = true; return own; }   // Apps Script down: D1's own PIN check
  if (!s.ok) throw new M.Bad(s.error || "Wrong PIN", 401);
  c._sync = s.data; c._owner = !!s.account.owner; c._ro = !!s.data.client.readOnly;
  c.status = s.data.client.status; c.carePlan = s.data.client.carePlan;
  // keep D1's copy of the account fresh (for the fallback and the scheduled jobs)
  const a = s.account, d = s.data.client;
  await env.DB.prepare("UPDATE clients SET business=?, name=?, phone=?, email=?, site=?, status=?, care_plan=?, uptime=?, response_ms=?, notes=? WHERE id=?")
    .bind(d.business || c.business, d.name || "", a.phone || "", a.email || "", d.site || "", d.status || "", d.carePlan || "", d.uptime || "", +d.responseMs || null, a.notes || "", c.id).run();
  return c;
}

/** One step of moving a client from Sheets to D1, run from their own dashboard after they log in. */
export async function importStep(env, b) {
  const s = await callScript(env, { action: "portal_sync", portalKey: b.portalKey, pin: b.pin, key: b.key, clientId: b.clientId });
  if (!s.ok) throw new M.Bad(s.error || "Wrong PIN", 401);
  const a = s.account, d = s.data.client, id = a.id;
  if (!a.trackId) throw new M.Bad("This client has no tracking ID");
  const done = await env.DB.prepare("SELECT id FROM clients WHERE id=?").bind(id).first();
  if (done && b.part !== "finish") throw new M.Bad("Already moved to Cloudflare");
  if (b.part === "start") {
    await env.DB.batch([env.DB.prepare("DELETE FROM events WHERE client_id=?").bind(id), env.DB.prepare("DELETE FROM db_rows WHERE client_id=?").bind(id), env.DB.prepare("DELETE FROM db_tables WHERE client_id=?").bind(id)]);
    return { ok: true };
  }
  if (b.part === "events") {
    const ev = (b.events || []).slice(0, 2200), st = [];
    for (let i = 0; i < ev.length; i += 11) { const part = ev.slice(i, i + 11);
      st.push(env.DB.prepare("INSERT INTO events (client_id, ts, type, label, ref, device, path, vid) VALUES " + part.map(() => "(?,?,?,?,?,?,?,?)").join(","))
        .bind(...part.flatMap(e => [id, +e[0], M.clip(e[1], 30), M.clip(e[2], 200), M.clip(e[3], 60), M.clip(e[4], 10), M.clip(e[5], 80), M.clip(e[6], 40)]))); }
    for (let i = 0; i < st.length; i += 100) await env.DB.batch(st.slice(i, i + 100));
    return { ok: true, events: ev.length };
  }
  if (b.part === "table") {
    const t = b.table || {}, cols = M.cleanCols(t.cols), tid = M.randomKey(10), rows = (t.rows || []).slice(0, M.DB_LIMIT.rows);
    const st = [env.DB.prepare("INSERT INTO db_tables (id, client_id, name, cols, pos) VALUES (?,?,?,?,?)").bind(tid, id, M.clip(t.name, 60), JSON.stringify(cols), +b.pos || 0)];
    // cleanCols may give a column a new id: carry each value across by the column's position
    const old = (t.cols || []).map(c => c.id);
    rows.forEach(r => { const dd = {}; cols.forEach((col, i) => dd[col.id] = M.cellIn(col, r[old[i]]));
      st.push(env.DB.prepare("INSERT INTO db_rows (id, table_id, client_id, ts, data) VALUES (?,?,?,?,?)").bind(String(r._id || M.randomKey(10)), tid, id, String(r._ts || M.now()), JSON.stringify(dd))); });
    for (let i = 0; i < st.length; i += 100) await env.DB.batch(st.slice(i, i + 100));
    return { ok: true, rows: rows.length };
  }
  if (b.part === "finish") {
    // the switch: once this row exists, the dashboard and the website's visits and orders use D1
    if (!b.pin && !a.owner) throw new M.Bad("Log in with your PIN to finish the move");
    if (!done) await env.DB.prepare("INSERT INTO clients (id, portal_key, pin, track_id, business, name, phone, email, site, kind, status, care_plan, notes, bridge) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, a.portalKey, String(b.pin || "owner-moved"), a.trackId, d.business, d.name || "", a.phone || "", a.email || "", d.site || "", "store", d.status || "live", d.carePlan || "", a.notes || "", "apps-script").run();
    await M.bumpRev(env, { id });
    return { ok: true, moved: true };
  }
  throw new M.Bad("Unknown step");
}

/** New orders for the WhatsApp alert job (same shape as Apps Script's order_alerts). */
export async function orderAlerts(env, since) {
  let from = Date.parse(since || ""); if (!(from > 0)) from = Date.now() - 36e5;
  from = Math.max(from, Date.now() - 2 * 864e5);
  const cs = (await env.DB.prepare("SELECT * FROM clients WHERE status!='paused'").all()).results.map(M.clientFromRow).filter(c => !/alerts? off/i.test(c.notes || ""));
  const out = [];
  for (const c of cs) {
    const ts = (await env.DB.prepare("SELECT id, name, cols FROM db_tables WHERE client_id=?").bind(c.id).all()).results.filter(t => /order|checkout|cart|purchase/i.test(t.name));
    for (const t of ts) {
      const cols = JSON.parse(t.cols), rows = (await env.DB.prepare("SELECT id, ts, data FROM db_rows WHERE table_id=? AND ts>? ORDER BY ts").bind(t.id, new Date(from).toISOString()).all()).results;
      rows.forEach(r => { const dd = JSON.parse(r.data), fields = [];
        cols.forEach(col => { const v = dd[col.id]; if (v === "" || v == null || v === false || /^(status|stock|came from|item count)$/i.test(col.name)) return;
          fields.push([col.name, col.type === "money" ? "₹" + Number(v).toLocaleString("en-IN") : String(v)]); });
        out.push({ client: c.id, business: c.business, to: String(c.phone || "").replace(/\D/g, ""), id: r.id, ts: r.ts, table: t.name, dashboard: "https://make4yu.com/client/" + c.portalKey, fields }); });
    }
  }
  return out.sort((x, y) => x.ts < y.ts ? -1 : 1).slice(-100);
}
