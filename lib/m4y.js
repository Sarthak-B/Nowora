/* make4yu backend on Cloudflare D1 — the same actions the dashboard and t.js already use with
 * Google Sheets (apps-script/Code.gs), answered from D1 instead. Shared by the Pages Function
 * (functions/api/v2.js) and the scheduled Worker (workers/cron). Binding: env.DB. */

export const CLIENT_EVENTS = ["pageview", "cta_whatsapp", "cta_call", "cta_email", "lead_submit"];
export const DB_TYPES = ["text", "longtext", "number", "money", "date", "phone", "email", "link", "choice", "yesno"];
export const DB_LIMIT = { tables: 20, columns: 30, rows: 5000, cell: 2000, perCall: 200 };
export const KINDS = ["store", "restaurant", "salon", "realestate", "services"];
const PORTAL_DAYS = 30;

export const now = () => new Date().toISOString();
export const clip = (v, n) => (v === undefined || v === null ? "" : String(v).slice(0, n));
export const digits = p => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 10) d = "91" + d; return d; };
export function randomKey(n) {
  const c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = new Uint8Array(n);
  crypto.getRandomValues(b); let s = ""; for (const x of b) s += c[x % c.length]; return s;
}
export class Bad extends Error { constructor(m, status) { super(m); this.status = status || 400; } }

/* ---------- small fixed-window limiter in D1 ---------- */
async function hit(env, k, max, secs) {
  const t = Math.floor(Date.now() / 1000), r = await env.DB.prepare("SELECT n, until FROM limits WHERE k=?").bind(k).first();
  if (r && r.until > t) { if (r.n >= max) return false; await env.DB.prepare("UPDATE limits SET n=n+1 WHERE k=?").bind(k).run(); return true; }
  await env.DB.prepare("INSERT INTO limits (k,n,until) VALUES (?,1,?) ON CONFLICT(k) DO UPDATE SET n=1, until=excluded.until").bind(k, t + secs).run();
  return true;
}
async function count(env, k) { const r = await env.DB.prepare("SELECT n, until FROM limits WHERE k=?").bind(k).first(); return r && r.until > Date.now() / 1000 ? r.n : 0; }

/* ---------- clients ---------- */
const CLIENT_COLS = { carePlan: "care_plan", careFee: "care_fee", responseMs: "response_ms", lastCheck: "last_check", advancePaid: "advance_paid",
  balancePaid: "balance_paid", editAccess: "edit_access", portalKey: "portal_key", trackId: "track_id", waAlerts: "wa_alerts" };
export function clientFromRow(r) {
  if (!r) return null;
  const c = {}; Object.keys(r).forEach(k => c[k] = r[k]);
  Object.keys(CLIENT_COLS).forEach(k => { c[k] = r[CLIENT_COLS[k]]; });
  return c;
}
export async function clientBy(env, col, v) {
  if (!["id", "portal_key", "track_id", "host"].includes(col)) throw new Error("bad column");
  return clientFromRow(await env.DB.prepare("SELECT * FROM clients WHERE " + col + "=? COLLATE NOCASE").bind(String(v || "")).first());
}

/** Portal link + PIN (6 wrong PINs locks a link for 15 minutes, 20 a day), or the owner's admin key. */
export async function portalClient(env, body) {
  const key = String(body.portalKey || "").trim(), pin = String(body.pin || "").trim();
  if (body.key && env.ADMIN_KEY && String(body.key) === env.ADMIN_KEY) {
    const own = body.clientId ? await clientBy(env, "id", body.clientId) : await clientBy(env, "portal_key", key);
    if (!own) throw new Bad("Client not found", 404);
    own._owner = true; return own;
  }
  if (!/^[\w-]{3,40}$/.test(key)) throw new Bad("This portal link is not valid");
  const fk = "pfail:" + key.toLowerCase(), dk = "pday:" + key.toLowerCase();
  if (await count(env, dk) >= 20) throw new Bad("Too many wrong PINs today. Ask make4yu for help on WhatsApp.", 429);
  const fails = await count(env, fk);
  if (fails >= 6) throw new Bad("Too many wrong PINs. Try again in 15 minutes.", 429);
  const c = await clientBy(env, "portal_key", key);
  if (!c) throw new Bad("This portal link is not valid any more — ask make4yu for a new one", 404);
  if (!c.pin || pin !== String(c.pin)) { await hit(env, fk, 99, 900); await hit(env, dk, 99, 21600); throw new Bad("Wrong PIN", 401); }
  if (fails) await env.DB.prepare("DELETE FROM limits WHERE k=?").bind(fk).run();
  return c;
}
function planOff(c) { if (c._owner) return false; const st = String(c.status || "").toLowerCase(); return st === "paused" || (st === "live" && String(c.carePlan || "").toLowerCase() !== "yes"); }
export function editReason(c) {
  if (c._owner) return ""; if (planOff(c)) return "no-plan";
  const a = String(c.editAccess || "auto").toLowerCase(); if (a === "off") return "off"; if (a === "on") return "";
  return c.carePlan === "yes" && c.status !== "paused" ? "" : "no-plan";
}
export function readOnly(c) { return !c._owner && (String(c.editAccess || "").toLowerCase() === "off" || planOff(c)); }
export function writable(c) {
  if (planOff(c)) throw new Bad("Your make4yu care plan isn't active, so changes are switched off. You can still see and download everything — message make4yu to switch it back on.", 403);
  if (readOnly(c)) throw new Bad("Your dashboard is view-only right now. You can see and download everything, but changes are switched off — message make4yu if you need something changed.", 403);
  return c;
}

/* ---------- live-update revision ---------- */
export async function bumpRev(env, c) { await env.DB.prepare("INSERT INTO revs (client_id, rev) VALUES (?, ?) ON CONFLICT(client_id) DO UPDATE SET rev=excluded.rev").bind(c.id, Date.now()).run(); }
async function getRev(env, c) { const r = await env.DB.prepare("SELECT rev FROM revs WHERE client_id=?").bind(c.id).first(); if (r) return String(r.rev); await bumpRev(env, c); return String(Date.now()); }

/* ---------- events ---------- */
export async function logEvent(env, c, e) {
  await env.DB.prepare("INSERT INTO events (client_id, ts, type, label, ref, device, path, vid, sid) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(c.id, e.ts ? Math.floor(new Date(e.ts).getTime() / 1000) : Math.floor(Date.now() / 1000), clip(e.type, 30), clip(e.label, 200), clip(e.ref, 60), clip(e.device, 10), clip(e.path, 80), clip(e.vid, 40), clip(e.sid, 40)).run();
}
function junk(e) { const p = String(e.path || ""), r = String(e.ref || ""); return e.bot === true || e.framed === true || p === "srcdoc" || /^\/__/.test(p) || /^(localhost|127\.|0\.0\.0\.0)/.test(r); }
export async function clientTrack(env, ev) {
  if (!ev || !CLIENT_EVENTS.includes(ev.type)) return { ok: false, error: "Unknown event" };
  if (junk(ev)) return { ok: true, skipped: true };
  const c = await clientBy(env, "track_id", ev.cid); if (!c) return { ok: false, error: "Unknown site" };
  if (!await hit(env, "trk:" + c.id + ":" + clip(ev.vid, 40), 120, 600)) return { ok: true, skipped: true };
  await logEvent(env, c, ev);
  return { ok: true };
}

function tz(ts) { return new Date(ts * 1000 + 5.5 * 36e5).toISOString().slice(0, 10); }   // India date
export async function portal(env, c, sinceSec) {
  const nowS = Math.floor(Date.now() / 1000), from = nowS - 2 * PORTAL_DAYS * 86400, mid = nowS - PORTAL_DAYS * 86400;
  // the dashboard's 30-second refresh only needs what's new: don't re-read 60 days of visits each time
  const poll = sinceSec > from;
  const ev = (await env.DB.prepare("SELECT ts,type,label,ref,device,path,vid FROM events WHERE client_id=? AND ts>? AND type IN ('pageview','cta_whatsapp','cta_call','cta_email','lead_submit') ORDER BY ts").bind(c.id, poll ? sinceSec : from).all()).results;
  const inWin = ev.filter(e => e.ts > from), cur = inWin.filter(e => e.ts > mid), prev = inWin.filter(e => e.ts <= mid);
  const uniq = (l, t) => new Set(l.filter(e => !t || e.type === t).map(e => e.vid)).size, n = (l, t) => l.filter(e => e.type === t).length;
  const days = [];
  for (let i = PORTAL_DAYS - 1; i >= 0; i--) { const d = tz(nowS - i * 86400), de = cur.filter(e => tz(e.ts) === d); days.push({ d, v: uniq(de, "pageview"), t: de.filter(e => e.type !== "pageview").length }); }
  const tally = (l, f) => { const o = {}; l.forEach(e => { const k = f(e); if (k) o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6); };
  const pv = cur.filter(e => e.type === "pageview");
  const compact = ev.filter(e => !sinceSec || e.ts > sinceSec).slice(-30000), dict = () => { const list = [], idx = {}; return { list, at: v => { v = v || ""; if (!(v in idx)) { idx[v] = list.length; list.push(v); } return idx[v]; } }; };
  const T = dict(), R = dict(), D = dict(), P = dict(), V = dict();
  const rows = compact.map(e => [e.ts, T.at(e.type), R.at(e.ref || "direct"), D.at(e.device || "desktop"), P.at(e.path || "/"), V.at(e.vid)]);
  const reqs = (await env.DB.prepare("SELECT * FROM requests WHERE client_id=? ORDER BY ts DESC LIMIT 30").bind(c.id).all()).results;
  return {
    client: { business: c.business, name: c.name, site: c.site, status: c.status, package: c.package, price: c.price, delivered: c.delivered,
      carePlan: c.carePlan, careFee: c.careFee, renewal: c.renewal, uptime: c.uptime, responseMs: c.responseMs, lastCheck: c.lastCheck,
      advancePaid: c.advancePaid, balancePaid: c.balancePaid, tracking: !!c.trackId, checklist: c.checklist, editable: !editReason(c), editReason: editReason(c),
      readOnly: readOnly(c), owner: !!c._owner, id: c._owner ? c.id : undefined, portalKey: c.portalKey, kind: KINDS.includes(c.kind) ? c.kind : "services", backend: "d1" },
    stats: poll ? undefined : { days, hasData: inWin.length > 0,
      totals: { visitors: uniq(pv), views: pv.length, whatsapp: n(cur, "cta_whatsapp"), calls: n(cur, "cta_call"), emails: n(cur, "cta_email"), enquiries: n(cur, "lead_submit") },
      previous: { visitors: uniq(prev, "pageview"), taps: prev.filter(e => /^cta_/.test(e.type)).length, enquiries: n(prev, "lead_submit") },
      sources: tally(pv, e => e.ref || "direct"), devices: tally(pv, e => e.device || "desktop"), pages: tally(pv, e => e.path || "/"),
      recent: cur.slice(-14).reverse().map(e => ({ ts: new Date(e.ts * 1000).toISOString(), type: e.type, label: e.label, ref: e.ref, device: e.device })) },
    requests: reqs.map(r => ({ id: r.id, ts: r.ts, type: r.type, message: r.message, status: r.status, reply: r.reply, updated: r.updated, attachment: r.attachment })),
    events: { types: T.list, refs: R.list, devices: D.list, paths: P.list, vids: V.list, rows },
    now: now()
  };
}

/* ---------- photos (request attachments and website images) ---------- */
export async function putAsset(env, c, path, dataUrl) {
  const m = /^data:(image\/(jpeg|png|webp|gif));base64,(.+)$/.exec(String(dataUrl || ""));
  if (!m) throw new Bad("One of the photos could not be uploaded");
  const bin = Uint8Array.from(atob(m[3]), ch => ch.charCodeAt(0));
  if (bin.length > 1900000) throw new Bad("One of the photos is too large (max about 1.9 MB) — try a smaller one");
  await env.DB.prepare("INSERT INTO assets (client_id, path, type, data) VALUES (?,?,?,?) ON CONFLICT(client_id, path) DO UPDATE SET type=excluded.type, data=excluded.data, ts=strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .bind(c.id, path, m[1], bin).run();
  return path;
}
export async function getAsset(env, clientId, path) {
  const r = await env.DB.prepare("SELECT type, data FROM assets WHERE client_id=? AND path=?").bind(clientId, path).first();
  return r ? { type: r.type, data: new Uint8Array(r.data) } : null;
}

export async function portalRequest(env, c, r, origin) {
  if (!r || !String(r.message || "").trim()) return { ok: false, error: "Write what you would like changed" };
  const open = await env.DB.prepare("SELECT COUNT(*) n FROM requests WHERE client_id=? AND status!='done'").bind(c.id).first();
  if (open.n >= 15) return { ok: false, error: "You have 15 open requests — we will work through those first" };
  const id = randomKey(12); let attachment = "";
  if (r.photo) { try { await putAsset(env, c, "requests/" + id + ".jpg", r.photo); attachment = origin + "/api/v2?a=" + encodeURIComponent(c.id) + "&p=" + encodeURIComponent("requests/" + id + ".jpg"); } catch (e) { r.message += "\n\n(A photo was attached but could not be saved: " + clip(e.message, 120) + ")"; } }
  const row = { id, ts: now(), clientId: c.id, business: c.business, type: clip(r.type || "Change", 40), message: clip(r.message, 2000), status: "new", reply: "", updated: "", attachment };
  await env.DB.prepare("INSERT INTO requests (id, client_id, ts, type, message, status, attachment) VALUES (?,?,?,?,?,?,?)").bind(id, c.id, row.ts, row.type, row.message, "new", attachment).run();
  await logEvent(env, c, { type: "request", label: row.type + ": " + row.message, ref: c._owner ? "make4yu" : "client dashboard" });
  await queueAlert(env, c, "owner", "Request from " + c.business, "📝 New request from " + c.business + " (" + row.type + ")\n\n" + row.message);
  return { ok: true, request: row };
}

/* ---------- client database ---------- */
async function tables(env, c) {
  return (await env.DB.prepare("SELECT t.id, t.name, t.cols, (SELECT COUNT(*) FROM db_rows r WHERE r.table_id=t.id) AS n FROM db_tables t WHERE t.client_id=? ORDER BY t.pos, t.created").bind(c.id).all()).results
    .map(t => ({ id: t.id, name: t.name, cols: JSON.parse(t.cols), count: t.n }));
}
async function findTable(env, c, id) { const t = (await tables(env, c)).find(x => x.id === String(id || "")); if (!t) throw new Bad("That table no longer exists — refresh the page", 404); return t; }
export function cellIn(col, v) {
  if (v === undefined || v === null || v === "") return "";
  if (col.type === "number" || col.type === "money") { const n = Number(String(v).replace(/[^\d.\-]/g, "")); return isNaN(n) ? "" : n; }
  if (col.type === "date") { const s = String(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; }
  if (col.type === "yesno") return v === true || /^(yes|true|1|on)$/i.test(String(v));
  if (col.type === "choice") { const o = col.options || []; v = String(v).slice(0, 60); return o.length && !o.includes(v) ? "" : v; }
  return String(v).slice(0, col.type === "longtext" ? DB_LIMIT.cell : 300);
}
function rowOut(t, r) { const d = JSON.parse(r.data), o = { _id: r.id, _ts: r.ts }; t.cols.forEach(col => o[col.id] = d[col.id] === undefined ? (col.type === "yesno" ? false : "") : d[col.id]); return o; }
async function rows(env, t) { return (await env.DB.prepare("SELECT id, ts, data FROM db_rows WHERE table_id=? ORDER BY ts").bind(t.id).all()).results.map(r => rowOut(t, r)); }
export function cleanCols(cols) {
  if (!Array.isArray(cols) || !cols.length) throw new Bad("Add at least one column");
  if (cols.length > DB_LIMIT.columns) throw new Bad("A table can have up to " + DB_LIMIT.columns + " columns");
  const seen = {};
  return cols.map(c => {
    const name = String(c.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!name) throw new Bad("Every column needs a name");
    if (/^(row id|added)$/i.test(name)) throw new Bad('"' + name + '" is used by the system — pick another column name');
    if (seen[name.toLowerCase()]) throw new Bad('Two columns are called "' + name + '"'); seen[name.toLowerCase()] = 1;
    const type = DB_TYPES.includes(c.type) ? c.type : "text", out = { id: /^[\w-]{4,20}$/.test(c.id || "") ? c.id : randomKey(8), name, type };
    if (type === "choice") out.options = (Array.isArray(c.options) ? c.options : String(c.options || "").split(",")).map(o => String(o).trim().slice(0, 60)).filter(Boolean).filter((o, i, a) => a.indexOf(o) === i).slice(0, 40);
    return out;
  });
}
function uniqueName(list, name, ownId) {
  let base = String(name || "").replace(/\s+/g, " ").trim().slice(0, 60); if (!base) throw new Bad("Give the table a name");
  let n = base, i = 2; while (list.some(t => t.name.toLowerCase() === n.toLowerCase() && t.id !== ownId)) n = base + " (" + i++ + ")"; return n;
}
export async function dbGet(env, c, tableId) {
  const ts = await tables(env, c), t = ts.find(x => x.id === tableId) || ts[0];
  return { ok: true, tables: ts, tableId: t ? t.id : "", rows: t ? await rows(env, t) : [] };
}
export async function dbSaveTable(env, c, table) {
  if (!table) throw new Bad("Nothing to save");
  const cols = cleanCols(table.cols), list = await tables(env, c);
  if (!table.id) {
    if (list.length >= DB_LIMIT.tables) throw new Bad("You can have up to " + DB_LIMIT.tables + " tables");
    const id = randomKey(10), name = uniqueName(list, table.name);
    await env.DB.prepare("INSERT INTO db_tables (id, client_id, name, cols, pos) VALUES (?,?,?,?,?)").bind(id, c.id, name, JSON.stringify(cols), list.length).run();
    await bumpRev(env, c); return { ok: true, table: { id, name, cols, count: 0 } };
  }
  const t = await findTable(env, c, table.id), name = uniqueName(list, table.name, t.id);
  // values follow their column id, so renamed, moved and re-typed columns keep their data
  const rs = await rows(env, t), stmts = [env.DB.prepare("UPDATE db_tables SET name=?, cols=? WHERE id=?").bind(name, JSON.stringify(cols), t.id)];
  rs.forEach(r => { const d = {}; cols.forEach(col => { const old = t.cols.find(o => o.id === col.id); if (old) d[col.id] = cellIn(col, r[col.id]); });
    stmts.push(env.DB.prepare("UPDATE db_rows SET data=? WHERE id=?").bind(JSON.stringify(d), r._id)); });
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  await bumpRev(env, c); return { ok: true, table: { id: t.id, name, cols, count: rs.length } };
}
export async function dbDeleteTable(env, c, tableId) {
  const t = await findTable(env, c, tableId);
  await env.DB.batch([env.DB.prepare("DELETE FROM db_rows WHERE table_id=?").bind(t.id), env.DB.prepare("DELETE FROM db_tables WHERE id=?").bind(t.id)]);
  await bumpRev(env, c); return { ok: true };
}
export async function dbSaveRow(env, c, tableId, row) {
  if (!row || typeof row !== "object") throw new Bad("Nothing to save");
  const t = await findTable(env, c, tableId);
  if (!t.cols.some(col => row[col.id] !== undefined && row[col.id] !== "" && row[col.id] !== false)) throw new Bad("Fill in at least one field");
  const d = {}; t.cols.forEach(col => d[col.id] = cellIn(col, row[col.id]));
  const have = row._id ? await env.DB.prepare("SELECT ts FROM db_rows WHERE id=? AND table_id=?").bind(String(row._id), t.id).first() : null;
  let id = row._id, ts;
  if (have) { ts = have.ts; await env.DB.prepare("UPDATE db_rows SET data=? WHERE id=?").bind(JSON.stringify(d), id).run(); }
  else {
    if (t.count >= DB_LIMIT.rows) throw new Bad("This table is full (" + DB_LIMIT.rows + " rows). Delete some rows or start a new table.");
    id = randomKey(10); ts = now();
    await env.DB.prepare("INSERT INTO db_rows (id, table_id, client_id, ts, data) VALUES (?,?,?,?,?)").bind(id, t.id, c.id, ts, JSON.stringify(d)).run();
  }
  await bumpRev(env, c); return { ok: true, row: Object.assign({ _id: id, _ts: ts }, d) };
}
export async function dbDeleteRows(env, c, tableId, ids) {
  ids = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean).slice(0, DB_LIMIT.perCall);
  if (!ids.length) return { ok: true, deleted: 0 };
  const t = await findTable(env, c, tableId);
  const r = await env.DB.prepare("DELETE FROM db_rows WHERE table_id=? AND id IN (" + ids.map(() => "?").join(",") + ")").bind(t.id, ...ids).run();
  const n = r.meta ? r.meta.changes : ids.length; if (n) await bumpRev(env, c); return { ok: true, deleted: n };
}
export async function dbRev(env, c) { return getRev(env, c); }

/* ---------- forms on the client's website → their database (t.js "cform") ---------- */
export function guessType(name, v) {
  const n = name.toLowerCase();
  if (/e-?mail/.test(n) || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) return "email";
  if (/phone|mobile|whatsapp|contact no|tel/.test(n)) return "phone";
  if (/address|note|message|comment|details|requirement|question/.test(n) || v.length > 80) return "longtext";
  if (/\b(date|dob|day)\b/.test(n) && /^\d{4}-\d{2}-\d{2}$/.test(v)) return "date";
  if (/price|amount|total|budget|fee|cost/.test(n) && /^[₹\d,.\s]+$/.test(v)) return "money";
  if (/\b(qty|quantity|people|guests|count|number of)\b/.test(n) && /^\d+$/.test(v)) return "number";
  if (/website|url|link/.test(n)) return "link";
  return "text";
}
export async function ensureTable(env, c, name, want) {
  const list = await tables(env, c); let t = list.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!t) {
    if (list.length >= DB_LIMIT.tables) throw new Bad("This site has too many tables");
    const cols = cleanCols(want.slice(0, DB_LIMIT.columns)), id = randomKey(10);
    await env.DB.prepare("INSERT INTO db_tables (id, client_id, name, cols, pos) VALUES (?,?,?,?,?)").bind(id, c.id, uniqueName(list, name), JSON.stringify(cols), list.length).run();
    return { id, name, cols, count: 0 };
  }
  const have = t.cols.map(x => x.name.toLowerCase()), add = want.filter(w => !have.includes(w.name.toLowerCase())).slice(0, Math.max(0, DB_LIMIT.columns - t.cols.length));
  if (add.length) { t.cols = cleanCols(t.cols.concat(add)); await env.DB.prepare("UPDATE db_tables SET cols=? WHERE id=?").bind(JSON.stringify(t.cols), t.id).run(); }
  return t;
}
export const KIND_STATUS = {
  order: ["New", "Confirmed", "Packed", "Shipped", "Delivered", "Cancelled"],
  booking: ["New", "Confirmed", "Arrived", "No-show", "Cancelled"],
  visit: ["New", "Called", "Visit booked", "Visited", "Closed", "Not interested"],
  lead: ["New", "Contacted", "Call booked", "Won", "Lost"]
};
export function formKind(table, items) {
  if (items || /order|checkout|cart|purchase/i.test(table)) return "order";
  if (/book|reserv|appoint|table|slot/i.test(table)) return "booking";
  if (/site visit|visit|property|flat|plot/i.test(table)) return "visit";
  return "lead";
}
export async function clientForm(env, b) {
  if (b.bot === true || b.framed === true) return { ok: true, skipped: true };
  const c = await clientBy(env, "track_id", b.cid); if (!c) return { ok: false, error: "Unknown site" };
  const vid = clip(b.vid, 40);
  if (!await hit(env, "cf:" + c.id, 60, 600) || (vid && !await hit(env, "cfv:" + c.id + ":" + vid, 8, 600))) return { ok: false, error: "Too many forms — try again in a few minutes" };
  const fields = [];
  Object.keys(b.fields || {}).slice(0, 40).forEach(k => {
    const name = String(k).replace(/\s+/g, " ").trim().slice(0, 60); let v = b.fields[k]; if (Array.isArray(v)) v = v.join(", ");
    v = String(v == null ? "" : v).trim().slice(0, 2000);
    if (!name || /^(row id|added)$/i.test(name) || /password|cvv|cvc|card ?number|otp/i.test(name) || fields.some(f => f.name.toLowerCase() === name.toLowerCase())) return;
    fields.push({ name, value: v });
  });
  const inItems = Array.isArray(b.items) ? b.items : [];
  if (inItems.length > 50 || inItems.some(i => !i || typeof i !== "object" || !Number.isInteger(Number(i.qty)) || +i.qty < 1 || +i.qty > 999 || !Number.isFinite(Number(i.price)) || +i.price < 0))
    return { ok: false, error: "Each item needs a quantity from 1 to 999 and a valid non-negative price." };
  const items = inItems.map(i => ({ name: clip(i.name, 80), variant: clip(i.variant, 80), size: clip(i.size, 30), colour: clip(i.colour || i.color, 40), qty: Math.round(+i.qty), price: +i.price })).filter(i => i.name);
  if (!fields.some(f => f.value) && !items.length) return { ok: false, error: "Empty form" };
  const table = String(b.table || "Website enquiries").replace(/\s+/g, " ").trim().slice(0, 60) || "Website enquiries", kind = formKind(table, items.length > 0);
  const want = fields.map(f => ({ name: f.name, type: guessType(f.name, f.value) }));
  if (items.length) { want.push({ name: "Items", type: "longtext" }, { name: "Item count", type: "number" }); if (!fields.some(f => /^total$/i.test(f.name))) want.push({ name: "Total", type: "money" }); }
  want.push({ name: "Status", type: "choice", options: KIND_STATUS[kind] });
  if (items.length) want.push({ name: "Stock", type: "text" });
  want.push({ name: "Came from", type: "text" });
  const seen = {}, t = await ensureTable(env, c, table, want.filter(w => { const k = w.name.toLowerCase(); if (seen[k]) return false; return (seen[k] = 1); }));
  if (t.count >= DB_LIMIT.rows) return { ok: false, error: "This table is full. Please contact the business directly." };
  const val = {}; fields.forEach(f => val[f.name.toLowerCase()] = f.value);
  let stock = "";
  if (items.length) {
    val["items"] = items.map(i => i.qty + " × " + i.name + [i.variant, i.colour, i.size].filter(Boolean).map(x => " · " + x).join("") + (i.price ? " — ₹" + (i.price * i.qty).toLocaleString("en-IN") : "")).join("\n");
    val["item count"] = String(items.reduce((s, i) => s + i.qty, 0)); if (val["total"] === undefined) val["total"] = String(items.reduce((s, i) => s + i.price * i.qty, 0));
    stock = await takeStock(env, c, items); val["stock"] = stock;
  }
  val["status"] = "New"; val["came from"] = [clip(b.ref || "direct", 30), clip(b.device, 10)].filter(Boolean).join(" · ");
  const d = {}; t.cols.forEach(col => d[col.id] = cellIn(col, val[col.name.toLowerCase()]));
  const id = randomKey(10);
  await env.DB.prepare("INSERT INTO db_rows (id, table_id, client_id, ts, data) VALUES (?,?,?,?,?)").bind(id, t.id, c.id, now(), JSON.stringify(d)).run();
  await bumpRev(env, c);
  await logEvent(env, c, { type: "lead_submit", label: table + (items.length ? " · " + items.length + " item(s)" : ""), ref: clip(b.ref || "direct", 30), device: clip(b.device, 10), path: clip(b.path, 80), vid });
  // WhatsApp/owner alert, sent by the scheduled Worker (or right away when the Pages Function can)
  const lines = fields.filter(f => f.value).slice(0, 8).map(f => f.name + ": " + f.value);
  if (items.length) lines.push("Items:\n" + val["items"], "Total: ₹" + Number(val["total"]).toLocaleString("en-IN"));
  const word = { order: "order", booking: "booking", visit: "site-visit request", lead: "enquiry" }[kind];
  await queueAlert(env, c, "client", "New " + word + " — " + c.business, "🔔 New " + word + " on your website (" + t.name + ")\n\n" + lines.join("\n"));
  return { ok: true, id, table: t.name, stock: stock || undefined };
}
/** Takes ordered items off a stock table (a table with a product name column and a number column about stock). */
async function takeStock(env, c, items) {
  const inv = (await tables(env, c)).map(t => {
    const name = t.cols.find(x => /^(item|product|name|item name|product name|title)$/i.test(x.name)) || t.cols.find(x => /item|product/i.test(x.name) && x.type === "text");
    const stock = t.cols.find(x => x.type === "number" && /stock|qty|quantity|available|in hand/i.test(x.name));
    return name && stock ? { t, name, stock, size: t.cols.find(x => /^size$/i.test(x.name)), colour: t.cols.find(x => /^(colour|color|variant|shade)$/i.test(x.name)) } : null;
  }).filter(Boolean)[0];
  if (!inv) return "";
  const rs = await rows(env, inv.t), norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), missing = [], low = [], upd = [];
  items.forEach(i => {
    let hit = rs.filter(r => norm(r[inv.name.id]) === norm(i.name));
    if (inv.size && i.size) { const s = hit.filter(r => norm(r[inv.size.id]) === norm(i.size)); hit = s.length ? s : hit.some(r => r[inv.size.id] !== "") ? [] : hit; }
    if (inv.colour && (i.colour || i.variant)) { const v = norm(i.colour || i.variant), s = hit.filter(r => norm(r[inv.colour.id]) === v); hit = s.length ? s : hit.some(r => r[inv.colour.id] !== "") ? [] : hit; }
    if (!hit.length) { missing.push(i.name + [i.colour, i.size].filter(Boolean).map(x => " " + x).join("")); return; }
    const r = hit[0]; r[inv.stock.id] = (Number(r[inv.stock.id]) || 0) - i.qty; if (r[inv.stock.id] <= 0) low.push(i.name + (i.size ? " " + i.size : "") + " is out");
    const d = {}; inv.t.cols.forEach(col => d[col.id] = r[col.id]); upd.push(env.DB.prepare("UPDATE db_rows SET data=? WHERE id=?").bind(JSON.stringify(d), r._id));
  });
  if (upd.length) await env.DB.batch(upd);
  return [missing.length ? "Not in stock list: " + missing.join(", ") : "Stock updated", low.join(", ")].filter(Boolean).join(" · ");
}

/* ---------- the website itself, kept in D1 (every publish is a version) ---------- */
export async function siteSource(env, c) {
  const v = await env.DB.prepare("SELECT id, html FROM site_versions WHERE client_id=? ORDER BY id DESC LIMIT 1").bind(c.id).first();
  if (!v) throw new Bad("This website isn't connected for editing yet — ask make4yu to connect it.", 404);
  return { repo: "", path: "index.html", sha: String(v.id), html: v.html, url: c.site, niche: c.kind, name: c.business };
}
export async function sitePublish(env, c, body) {
  const why = editReason(c);
  if (why === "no-plan") throw new Bad("Website editing comes with the make4yu care plan (₹1,999/month). Message make4yu to switch it on.", 403);
  if (why === "off") throw new Bad("Website editing is turned off for this website. Message make4yu if you need it.", 403);
  let html = String(body.html || "");
  if (html.length < 200 || !/<html|<body/i.test(html)) return { ok: false, error: "That doesn't look like a full web page — nothing was published" };
  if (html.length > 900000) return { ok: false, error: "The page is too large to publish. Remove some photos and try again." };
  const cur = await env.DB.prepare("SELECT id FROM site_versions WHERE client_id=? ORDER BY id DESC LIMIT 1").bind(c.id).first();
  if (cur && body.sha && String(cur.id) !== String(body.sha)) return { ok: false, error: "Your website was updated while you were editing. Reload the editor to get the newest version, then make your change again." };
  for (const img of (body.images || []).slice(0, 30)) {
    const name = String(img.name || "").replace(/[^\w.-]/g, "");
    if (!/^[\w-]+\.(jpg|jpeg|png|webp|gif)$/.test(name)) throw new Bad("One of the photos could not be uploaded");
    await putAsset(env, c, "images/uploads/" + name, img.data);
  }
  const who = c._owner ? "make4yu" : (c.name || c.business || "Client");
  const r = await env.DB.prepare("INSERT INTO site_versions (client_id, ts, message, who, html) VALUES (?,?,?,?,?)").bind(c.id, now(), clip(body.message || "Website edited by " + who, 120), who, html).run();
  const id = r.meta.last_row_id;
  await env.DB.prepare("DELETE FROM site_versions WHERE client_id=? AND id < (SELECT MIN(id) FROM (SELECT id FROM site_versions WHERE client_id=? ORDER BY id DESC LIMIT 40))").bind(c.id, c.id).run();
  await logEvent(env, c, { type: "publish", label: clip(body.message || "Website edited", 200), ref: who, path: "/" });
  await env.DB.prepare("INSERT INTO automation (ts, job, status, summary, details) VALUES (?,?,?,?,?)").bind(now(), "editor", "success", c.business + " published website changes", clip(body.message, 300)).run();
  if (!c._owner) await queueAlert(env, c, "owner", "Website published: " + c.business, "✏️ " + c.business + " published changes from their dashboard editor.\n\n" + (body.message || "") + "\n\nLive site: " + (c.site || ""));
  return { ok: true, sha: String(id) };
}
export async function siteVersions(env, c) {
  const list = (await env.DB.prepare("SELECT id, ts, message FROM site_versions WHERE client_id=? ORDER BY id DESC LIMIT 15").bind(c.id).all()).results;
  return list.map((x, i) => ({ sha: String(x.id), date: x.ts, message: x.message || "", current: i === 0 }));
}
export async function siteRestore(env, c, sha) {
  const old = await env.DB.prepare("SELECT html FROM site_versions WHERE client_id=? AND id=?").bind(c.id, +sha || 0).first();
  if (!old) return { ok: false, error: "That version couldn't be found" };
  const r = await env.DB.prepare("INSERT INTO site_versions (client_id, ts, message, who, html) VALUES (?,?,?,?,?)").bind(c.id, now(), "Restored an earlier version (" + sha + ")", c._owner ? "make4yu" : (c.name || c.business), old.html).run();
  await logEvent(env, c, { type: "restore", label: "Version " + sha, ref: c._owner ? "make4yu" : (c.name || c.business) });
  return { ok: true, sha: String(r.meta.last_row_id) };
}

/* ---------- alerts (sent by the scheduled Worker) ---------- */
export async function queueAlert(env, c, kind, title, body) {
  if (kind === "client" && (String(c.waAlerts || "on") === "off" || c.status === "paused")) return;
  await env.DB.prepare("INSERT INTO alerts (id, client_id, ts, kind, title, body, to_phone) VALUES (?,?,?,?,?,?,?)")
    .bind(randomKey(12), c.id, now(), kind, clip(title, 120), clip(body, 1500), kind === "client" ? digits(c.phone) : "").run();
}
