// One-time setup for the D1 trial: four test clients (café, salon, builder, coach) with their websites,
// 60 days of visits and realistic form entries. Runs only while none of them exists, so it needs no key;
// the PINs are made here and returned once, to whoever runs it (you, right after deploying).
import { SITES, html } from "./test-sites.js";
import * as M from "./m4y.js";

// One client per call (step 0–3) so each request stays well inside the free plan's 50 queries.
export async function seedTests(env, step) {
  const all = Object.entries(SITES), at = Math.max(0, Math.min(all.length - 1, +step || 0));
  if (!at) { const have = await env.DB.prepare("SELECT COUNT(*) n FROM clients WHERE id IN ('t-cafe','t-salon','t-homes','t-coach')").first(); if (have.n) return { ok: false, error: "The test clients already exist" }; }
  let seed = 7 + at * 101;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
  const day = n => new Date(Date.now() + n * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10);
  const NAMES = ["Aarav Mehta", "Diya Kapoor", "Kabir Singh", "Ananya Rao", "Vihaan Joshi", "Ishaan Gupta", "Saanvi Iyer", "Rohan Verma", "Meher Bedi", "Arjun Nair", "Tara Bhatt", "Nikhil Rawat", "Zoya Khan", "Pranav Das", "Riya Malhotra", "Dev Chauhan"];
  const phone = () => "9" + String(Math.floor(rnd() * 1e9)).padStart(9, "0");
  const HOURS = { restaurant: [8, 9, 10, 11, 12, 13, 18, 19, 20, 21], salon: [9, 10, 11, 12, 14, 15, 18, 19, 20, 21], realestate: [10, 11, 12, 13, 17, 18, 19, 20, 21, 22], services: [7, 8, 9, 12, 13, 21, 22, 23] };
  const out = [];

  for (const [kind, s] of [all[at]]) {
    if (await env.DB.prepare("SELECT id FROM clients WHERE id=?").bind(s.id).first()) return { ok: false, error: s.business + " already exists" };
    const track = "d1" + s.id.replace(/\W/g, ""), pin = String(100000 + Math.floor(Math.random() * 900000));
    await env.DB.prepare("INSERT INTO clients (id, portal_key, pin, track_id, host, business, name, phone, site, kind, package, price, delivered, care_plan, care_fee, renewal, status, uptime, response_ms, advance_paid, balance_paid) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(s.id, s.portal, pin, track, s.host, s.business, s.name, s.phone, "https://" + s.host + ".make4yu.com", kind, kind === "services" ? "Starter" : "Business", kind === "realestate" ? 34999 : 24999, day(-75), "yes", 1999, day(17), "live", "up", 180 + Math.floor(rnd() * 200), "yes", "yes").run();
    await env.DB.prepare("INSERT INTO site_versions (client_id, ts, message, who, html) VALUES (?,?,?,?,?)").bind(s.id, M.now(), "Website added", "make4yu", html(s, track)).run();

    // visits: 60 days, busier at weekends, each kind at its own hours
    const nowS = Math.floor(Date.now() / 1000), ev = [];
    const ins = (ts, type, label, ref, dev, vid) => ev.push([s.id, ts, type, label, ref, dev, "/", vid]);
    for (let d = 59; d >= 0; d--) {
      const dt = new Date((nowS - d * 86400) * 1000), wk = [0, 6].includes(dt.getUTCDay()), n = Math.round((wk ? 34 : 20) * (0.7 + rnd() * 0.6) * (1 + (59 - d) / 120));
      for (let i = 0; i < n; i++) {
        const base = Math.floor((nowS - d * 86400) / 86400) * 86400 - 5.5 * 3600, ts = base + pick(HOURS[kind]) * 3600 + Math.floor(rnd() * 3600);
        if (ts > nowS) continue;
        const vid = "v" + Math.floor(rnd() * 1e8), ref = pick(["instagram", "instagram", "google", "google", "direct", "whatsapp", "facebook", "maps"]), dev = rnd() < 0.82 ? "mobile" : "desktop";
        ins(ts, "pageview", "", ref, dev, vid);
        if (rnd() < 0.09) ins(ts + 40, "cta_whatsapp", "WhatsApp", ref, dev, vid);
        if (rnd() < 0.04) ins(ts + 55, "cta_call", "Call us", ref, dev, vid);
      }
    }
    // form entries, saved the way a real website form saves them (same table, columns and statuses)
    const F = s.form.fields, n = { restaurant: 34, salon: 30, realestate: 22, services: 18 }[kind], forms = [];
    for (let i = 0; i < n; i++) {
      const ago = Math.floor(rnd() * 30), f = {};
      F.forEach(([label, type, opt]) => {
        if (/^name$/i.test(label)) f[label] = pick(NAMES); else if (type === "tel") f[label] = phone();
        else if (type === "email") f[label] = pick(NAMES).split(" ")[0].toLowerCase() + "@gmail.com";
        else if (type === "date") f[label] = day(ago <= 3 ? pick([0, 0, 0, 1, 1, 2, 3, 5, -1]) : -ago + Math.floor(rnd() * 3));
        else if (type === "select") f[label] = pick(opt); else if (type === "number") f[label] = String(1 + Math.floor(rnd() * 6));
        else if (label === "Business") f[label] = pick(["Kesar Kitchen", "Loom & Co", "Pahadi Pickles", "Fit with Riya", "Studio Nine"]);
        else if (type === "textarea") f[label] = pick(["Looking for something ready by next year.", "Can we talk this week?", "Please share the brochure on WhatsApp.", "Interested — call after 6 pm.", ""]);
        else f[label] = pick(NAMES);
      });
      const old = kind === "restaurant" || kind === "salon" ? (f.Date || "") < day(0) : ago > 3;
      const status = { restaurant: old ? pick(["Arrived", "Arrived", "Arrived", "No-show", "Cancelled"]) : pick(["New", "New", "Confirmed"]),
        salon: old ? pick(["Arrived", "Arrived", "Arrived", "No-show", "Cancelled"]) : pick(["New", "Confirmed", "Confirmed"]),
        realestate: old ? pick(["Called", "Visit booked", "Visited", "Closed", "Not interested"]) : pick(["New", "New", "Called"]),
        services: old ? pick(["Contacted", "Call booked", "Won", "Lost"]) : pick(["New", "New", "Contacted"]) }[kind];
      forms.push({ fields: f, status, ts: new Date(Date.now() - ago * 864e5 - rnd() * 864e5 * 0.5).toISOString(), ref: pick(["instagram", "google", "direct", "whatsapp"]) });
    }
    if (kind === "salon") for (let i = 0; i < 4; i++) { const f = Object.assign({}, forms[i].fields); f.Date = day(1 + i); forms.push({ fields: f, status: "New", ts: new Date(Date.now() - i * 36e5).toISOString(), ref: "whatsapp" }); }
    const want = F.map(([label, type]) => ({ name: label, type: type === "tel" ? "phone" : type === "email" ? "email" : type === "date" ? "date" : type === "number" ? "number" : type === "textarea" ? "longtext" : "text" }))
      .concat([{ name: "Status", type: "choice", options: M.KIND_STATUS[M.formKind(s.form.table, false)] }, { name: "Came from", type: "text" }]);
    const c = { id: s.id }, t = await M.ensureTable(env, c, s.form.table, want), rowSt = [];
    forms.forEach((f, i) => {
      const val = {}; Object.keys(f.fields).forEach(k => val[k.toLowerCase()] = f.fields[k]); val.status = f.status; val["came from"] = f.ref + " · mobile";
      const d = {}; t.cols.forEach(col => d[col.id] = M.cellIn(col, val[col.name.toLowerCase()]));
      rowSt.push(env.DB.prepare("INSERT INTO db_rows (id, table_id, client_id, ts, data) VALUES (?,?,?,?,?)").bind(M.randomKey(10), t.id, s.id, f.ts, JSON.stringify(d)));
      ins(Math.floor(Date.parse(f.ts) / 1000), "lead_submit", s.form.table, f.ref, "mobile", "f" + i);
    });
    // 11 events per statement (99 bound values, under D1's 100), statements sent in batches
    const evSt = [];
    for (let i = 0; i < ev.length; i += 11) { const part = ev.slice(i, i + 11);
      evSt.push(env.DB.prepare("INSERT INTO events (client_id, ts, type, label, ref, device, path, vid) VALUES " + part.map(() => "(?,?,?,?,?,?,?,?)").join(",")).bind(...part.flat())); }
    const stmts = rowSt.concat(evSt);
    for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
    await M.bumpRev(env, c);
    out.push({ kind, business: s.business, dashboard: "/client/" + s.portal, pin, site: "https://" + s.host + ".make4yu.com", visits: ev.length - forms.length, entries: forms.length });
  }
  return { ok: true, clients: out, next: at + 1 < all.length ? at + 1 : null };
}
