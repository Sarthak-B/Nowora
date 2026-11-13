/* make4yu scheduled jobs on Cloudflare (D1 trial) — replaces the GitHub Actions jobs for D1 clients.
 *
 *  every minute   send waiting alerts: new orders/bookings to the client's WhatsApp (WhatsApp Cloud API),
 *                 requests and problems to you (CallMeBot to your own WhatsApp)
 *  every 5 min    uptime check of every live D1 website; you're alerted when one goes down or comes back
 *  every hour     websites kept in a GitHub repo are pulled into D1 when the repo changes
 *  03:30 IST      backup: every client's data as one JSON file in R2 (if bound), plus tidy-up
 *
 * Bindings: DB (D1, required), BACKUPS (R2, optional).
 * Secrets (all optional — a job without its secret records why it was skipped):
 *   WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE, WA_LANG  WhatsApp Cloud API (Meta) for client alerts
 *   CALLMEBOT_PHONE, CALLMEBOT_APIKEY            your own WhatsApp, for owner alerts
 *   GITHUB_TOKEN                                 private repos / higher rate limit for the site pull
 */
import { now, clip, clientFromRow, logEvent } from "../../lib/m4y.js";

export default {
  async scheduled(ev, env, ctx) {
    const m = new Date(ev.scheduledTime), min = m.getUTCMinutes(), hr = m.getUTCHours();
    const jobs = [sendAlerts(env)];
    if (min % 5 === 0) jobs.push(uptime(env));
    if (min === 7) jobs.push(pullSites(env));
    if (hr === 22 && min === 0) jobs.push(backup(env), tidy(env));      // 22:00 UTC = 03:30 IST
    const res = await Promise.allSettled(jobs);
    res.filter(r => r.status === "rejected").forEach(r => console.error("[cron]", r.reason && r.reason.stack || r.reason));
  },
  // GET /run?job=alerts|uptime|sites|backup&key=ADMIN_KEY — run a job now (for testing)
  async fetch(req, env) {
    const u = new URL(req.url);
    if (!env.ADMIN_KEY || u.searchParams.get("key") !== env.ADMIN_KEY) return new Response("make4yu scheduled jobs", { status: 200 });
    const job = { alerts: sendAlerts, uptime, sites: pullSites, backup, tidy }[u.searchParams.get("job")];
    if (!job) return new Response("unknown job", { status: 400 });
    return Response.json(await job(env));
  }
};

async function log(env, job, status, summary, details) {
  await env.DB.prepare("INSERT INTO automation (ts, job, status, summary, details) VALUES (?,?,?,?,?)").bind(now(), job, status, clip(summary, 300), clip(details, 2000)).run();
}

/* ---------- alerts ---------- */
async function sendAlerts(env) {
  const list = (await env.DB.prepare("SELECT a.*, c.business FROM alerts a LEFT JOIN clients c ON c.id=a.client_id WHERE a.sent IS NULL AND a.tries < 5 ORDER BY a.ts LIMIT 25").all()).results;
  let sent = 0, failed = 0;
  for (const a of list) {
    let err = "";
    try { err = a.kind === "client" ? await waCloud(env, a) : await callMeBot(env, a.title + "\n\n" + a.body); }
    catch (e) { err = String(e.message || e); }
    if (!err) { sent++; await env.DB.prepare("UPDATE alerts SET sent=?, error=NULL, tries=tries+1 WHERE id=?").bind(now(), a.id).run(); }
    else {
      failed++;
      // nothing to retry when the service isn't set up — mark it so the dashboard can say why
      const final = /not set up|no phone/i.test(err);
      await env.DB.prepare("UPDATE alerts SET tries=" + (final ? 5 : "tries+1") + ", error=? WHERE id=?").bind(clip(err, 300), a.id).run();
    }
  }
  if (list.length) await log(env, "alerts", failed ? (sent ? "partial" : "failure") : "success", sent + " sent, " + failed + " not sent");
  return { checked: list.length, sent, failed };
}
async function waCloud(env, a) {
  if (!env.WA_TOKEN || !env.WA_PHONE_ID || !env.WA_TEMPLATE) return "WhatsApp API not set up (WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE)";
  if (!/^\d{11,13}$/.test(a.to_phone || "")) return "No phone number on the client";
  // template parameters can't contain new lines
  const flat = t => String(t || "").replace(/\s*\n+\s*/g, " · ").replace(/\s{4,}/g, "   ").slice(0, 900);
  const r = await fetch("https://graph.facebook.com/v21.0/" + env.WA_PHONE_ID + "/messages", {
    method: "POST", headers: { Authorization: "Bearer " + env.WA_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: a.to_phone, type: "template",
      template: { name: env.WA_TEMPLATE, language: { code: env.WA_LANG || "en" }, components: [{ type: "body", parameters: [{ type: "text", text: flat(a.title) }, { type: "text", text: flat(a.body) }] }] } })
  });
  if (r.ok) return "";
  const j = await r.json().catch(() => ({}));
  return "WhatsApp API " + r.status + ": " + clip(j.error && j.error.message || "", 200);
}
async function callMeBot(env, text) {
  if (!env.CALLMEBOT_PHONE || !env.CALLMEBOT_APIKEY) return "Owner WhatsApp not set up (CALLMEBOT_PHONE, CALLMEBOT_APIKEY)";
  const r = await fetch("https://api.callmebot.com/whatsapp.php?phone=" + encodeURIComponent(env.CALLMEBOT_PHONE) + "&apikey=" + encodeURIComponent(env.CALLMEBOT_APIKEY) + "&text=" + encodeURIComponent(clip(text, 1200)));
  return r.ok ? "" : "CallMeBot " + r.status;
}
async function ownerAlert(env, title, body) {
  await env.DB.prepare("INSERT INTO alerts (id, client_id, ts, kind, title, body, to_phone) VALUES (?,?,?,?,?,?,'')").bind(crypto.randomUUID(), "", now(), "owner", title, body).run();
}

/* ---------- uptime ---------- */
async function ping(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "make4yu-uptime/1.0 (bot)" }, signal: AbortSignal.timeout(15000) });
    const ms = Date.now() - t0, body = await r.text();
    if (r.status >= 400) return { up: false, ms, error: "HTTP " + r.status };
    if (body.length < 300) return { up: false, ms, error: "Page came back almost empty" };
    return { up: true, ms, error: "" };
  } catch (e) { return { up: false, ms: null, error: clip(String(e.message || e), 120) }; }
}
async function uptime(env) {
  const list = (await env.DB.prepare("SELECT * FROM clients WHERE site IS NOT NULL AND site!='' AND status!='paused' AND (status='live' OR care_plan='yes')").all()).results.map(clientFromRow);
  const down = [], back = [];
  await Promise.all(list.map(async c => {
    let r = await ping(c.site);
    if (!r.up) { await new Promise(s => setTimeout(s, 8000)); r = await ping(c.site); }   // one retry so a blip doesn't page you
    const state = r.up ? "up" : "down";
    if (state === "down" && c.uptime !== "down") { down.push(c.business + " — " + c.site + " (" + r.error + ")"); await logEvent(env, c, { type: "site_down", label: r.error, ref: "5-minute check" }); }
    if (state === "up" && c.uptime === "down") { back.push(c.business); await logEvent(env, c, { type: "site_up", label: r.ms + " ms", ref: "5-minute check" }); }
    await env.DB.prepare("UPDATE clients SET uptime=?, response_ms=?, last_check=? WHERE id=?").bind(state, r.ms, now(), c.id).run();
  }));
  if (down.length) { await ownerAlert(env, "Site down: " + down.length, "🚨 Care-plan site down\n\n" + down.join("\n")); await log(env, "uptime", "failure", down.length + " site(s) went down", down.join("\n")); }
  if (back.length) { await ownerAlert(env, "Back up: " + back.join(", "), "✅ Back online: " + back.join(", ")); await log(env, "uptime", "success", "Back online: " + back.join(", ")); }
  return { checked: list.length, down, back };
}

/* ---------- websites kept in GitHub → D1 ---------- */
async function pullSites(env) {
  const list = (await env.DB.prepare("SELECT id, business, repo, repo_sha FROM clients WHERE repo IS NOT NULL AND repo!=''").all()).results;
  const gh = p => fetch("https://api.github.com" + p, { headers: Object.assign({ "User-Agent": "make4yu-cron", Accept: "application/vnd.github+json" }, env.GITHUB_TOKEN ? { Authorization: "Bearer " + env.GITHUB_TOKEN } : {}) });
  const out = [];
  for (const c of list) {
    try {
      if (!/^[\w.-]+\/[\w.-]+$/.test(c.repo)) { out.push(c.business + ": bad repo name"); continue; }
      const r = await gh("/repos/" + c.repo + "/commits?per_page=1"); if (!r.ok) { out.push(c.business + ": GitHub " + r.status); continue; }
      const sha = (await r.json())[0].sha; if (sha === c.repo_sha) continue;
      let html = null;
      for (const p of ["index.html", "public/index.html", "site/index.html", "docs/index.html"]) {
        const f = await gh("/repos/" + c.repo + "/contents/" + p + "?ref=" + sha);
        if (f.ok) { const j = await f.json(); html = new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\s/g, "")), ch => ch.charCodeAt(0))); break; }
      }
      if (!html) { out.push(c.business + ": no index.html"); continue; }
      await env.DB.batch([
        env.DB.prepare("INSERT INTO site_versions (client_id, ts, message, who, html) VALUES (?,?,?,?,?)").bind(c.id, now(), "Updated from GitHub (" + sha.slice(0, 7) + ")", "GitHub", html),
        env.DB.prepare("UPDATE clients SET repo_sha=? WHERE id=?").bind(sha, c.id)
      ]);
      out.push(c.business + ": updated to " + sha.slice(0, 7));
    } catch (e) { out.push(c.business + ": " + clip(e.message, 120)); }
  }
  if (out.length) await log(env, "sites", out.some(x => !/updated/.test(x)) ? "partial" : "success", out.length + " website(s) checked", out.join("\n"));
  return { repos: list.length, out };
}

/* ---------- backups and tidy-up ---------- */
async function backup(env) {
  // D1 also keeps 30 days of point-in-time restore (Time Travel) on its own; this adds a portable copy.
  if (!env.BACKUPS) { await log(env, "backup", "success", "D1 Time Travel covers the last 30 days (no R2 bucket bound for file copies)"); return { r2: false }; }
  const day = now().slice(0, 10), clients = (await env.DB.prepare("SELECT * FROM clients").all()).results; let bytes = 0;
  for (const c of clients) {
    const data = {
      client: c,
      tables: (await env.DB.prepare("SELECT * FROM db_tables WHERE client_id=?").bind(c.id).all()).results,
      rows: (await env.DB.prepare("SELECT * FROM db_rows WHERE client_id=?").bind(c.id).all()).results,
      requests: (await env.DB.prepare("SELECT * FROM requests WHERE client_id=?").bind(c.id).all()).results,
      website: await env.DB.prepare("SELECT id, ts, html FROM site_versions WHERE client_id=? ORDER BY id DESC LIMIT 1").bind(c.id).first()
    };
    const body = JSON.stringify(data); bytes += body.length;
    await env.BACKUPS.put("daily/" + day + "/" + c.id + ".json", body, { httpMetadata: { contentType: "application/json" } });
  }
  await log(env, "backup", "success", clients.length + " client(s) backed up to R2 (" + Math.round(bytes / 1024) + " KB)");
  return { r2: true, clients: clients.length, bytes };
}
async function tidy(env) {
  const s = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM events WHERE ts < ?").bind(s - 400 * 86400),
    env.DB.prepare("DELETE FROM limits WHERE until < ?").bind(s),
    env.DB.prepare("DELETE FROM alerts WHERE ts < ?").bind(new Date(Date.now() - 90 * 864e5).toISOString()),
    env.DB.prepare("DELETE FROM automation WHERE ts < ?").bind(new Date(Date.now() - 180 * 864e5).toISOString())
  ]);
  return { ok: true };
}
