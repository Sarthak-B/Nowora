/* WhatsApp order alerts for every make4yu client — run by .github/workflows/whatsapp.yml.
 * Sends each new website order to the client's WhatsApp (their number in Clients) FROM the make4yu number,
 * through WhatsApp Web driven by Playwright.
 *   node scripts/whatsapp.mjs check      → how many orders are waiting (no browser) → GITHUB_OUTPUT pending=N
 *   node scripts/whatsapp.mjs alerts     → sends them
 *   node scripts/whatsapp.mjs login      → prints an 8-character code to enter on the make4yu phone
 *   node scripts/whatsapp.mjs test       → sends a test message to WA_PHONE
 *   node scripts/whatsapp.mjs keepalive  → opens WhatsApp so the saved login stays fresh
 * The logged-in browser profile and the list of orders already sent live in ./wa-profile; the workflow encrypts
 * it before caching. Never prints customer details: the repo is public. */
import fs from "node:fs";
import { api } from "./lib.mjs";
import { pathToFileURL } from "node:url";

const MODE = process.argv[2] || "alerts";
const PROFILE = "wa-profile", STATE = PROFILE + "/nowora-alerts.json";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const log = m => console.log("[whatsapp] " + m);
const fail = m => { console.error("::error::" + m); process.exitCode = 1; };
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, k + "=" + v + "\n"); };
const tail = n => "…" + String(n).slice(-4);
const intl = n => { n = String(n || "").replace(/\D/g, ""); return n.length === 10 ? "91" + n : n; };

/* ---------- which orders still need a message ---------- */
function readState() { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return null; } }
function writeState(s) { fs.mkdirSync(PROFILE, { recursive: true }); s.sent = s.sent.slice(-3000); fs.writeFileSync(STATE, JSON.stringify(s)); }
async function pending() {
  const st = readState() || { v: 2, since: new Date(Date.now() - 30 * 60000).toISOString(), sent: [], tries: {} };   // first run: only the last 30 minutes
  if (st.v !== 2) { Object.keys(st.tries || {}).forEach(k => { if (!st.sent.includes(k)) st.sent.push(k); }); st.tries = {}; st.v = 2; }   // the old check retried messages that had gone out
  const from = new Date(new Date(st.since).getTime() - 6 * 3600e3).toISOString();                    // overlap, so a slow sheet never loses one
  const { orders } = await api({ action: "order_alerts", since: from });
  const todo = (orders || []).filter(o => !st.sent.includes(o.client + ":" + o.id) || (customerMessage(o) && !st.sent.includes("cust:" + o.client + ":" + o.id)));
  return { st, todo };
}
export function message(o) {
  const pick = re => o.fields.filter(([k]) => re.test(k));
  const lines = ["🛍️ *New order — " + o.business + "*", ""];
  const first = pick(/^(order (id|no\.?)|name|customer|full name|phone|mobile|whatsapp)$/i);
  const items = pick(/^items$/i), money = pick(/^(total|amount|payment)$/i);
  const addr = pick(/^(address|city|state|pin ?code|pincode|zip)$/i);
  const rest = o.fields.filter(x => ![...first, ...items, ...money, ...addr].includes(x));
  first.forEach(([k, v]) => lines.push("*" + k + ":* " + v));
  if (items.length) lines.push("", "*Items*", ...items[0][1].split(/\n+/).map(l => "• " + l));
  if (money.length) lines.push("", ...money.map(([k, v]) => "*" + k + ":* " + v));
  if (addr.length) lines.push("*Address:* " + addr.map(x => x[1]).join(", "));
  rest.forEach(([k, v]) => lines.push("*" + k + ":* " + v));
  if (o.dashboard) lines.push("", "Send it from your dashboard: " + o.dashboard);
  return lines.join("\n");
}

/* The customer's own copy: their order ID and tracking link, sent right after the shop's alert.
   Only for orders that carry both the customer's number and a tracking link (e.g. 52 Alive's "Tracking link"),
   so enquiry forms and other clients' forms never message their customers. */
export function customerMessage(o) {
  const f = re => (o.fields.find(([k]) => re.test(k)) || [])[1] || "";
  const phone = intl(f(/^(phone|mobile|whatsapp|phone number|mobile number|whatsapp number)$/i));
  const link = String(f(/track/i)).trim();
  if (!/^[6-9]\d{9}$/.test(phone.slice(-10)) || phone.length !== 12 || !/^https:\/\/\S+$/.test(link)) return null;
  if (o.ts && Date.now() - new Date(o.ts).getTime() > 24 * 3600e3) return null;          // only fresh orders: never a surprise days later
  const first = String(f(/^(name|customer|full name)$/i)).trim().split(/\s+/)[0] || "";
  const id = f(/^order (id|no\.?)$/i), shop = intl(o.to);
  const text = ["Hi" + (first ? " " + first : "") + "! 👋", "", "Thanks for your order from *" + o.business + "* — we've got it.", "",
    ...(id ? ["🧾 *Order ID:* " + id] : []), "🚚 *Track it any time:* " + link, "Your courier and tracking number (AWB) show up there as soon as it ships.",
    ...(shop.length >= 11 ? ["", "Questions? Message " + o.business + ": https://wa.me/" + shop] : []), "", "_Sent by make4yu for " + o.business + "_"].join("\n");
  return { to: phone, text };
}

/* ---------- WhatsApp Web ---------- */
async function browser() {
  const { chromium } = await import("playwright");
  fs.mkdirSync(PROFILE, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, userAgent: UA, viewport: { width: 1280, height: 900 }, locale: "en-US",
    args: ["--disable-blink-features=AutomationControlled"] });
  return { ctx, page: ctx.pages()[0] || await ctx.newPage() };
}
const CHATS = '#pane-side, [aria-label="Chat list"], [data-testid="chat-list"]';
async function useHere(page) { const b = page.getByRole("button", { name: /use here/i }); if (await b.isVisible().catch(() => false)) { log("another session was open — taking over"); await b.click(); } }
/* waitForLink: keep waiting while the login screen is up (the person is typing the code on their phone) */
async function loggedIn(page, ms, waitForLink = false) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await useHere(page);
    if (await page.locator(CHATS).first().isVisible().catch(() => false)) return true;
    if (!waitForLink && await page.getByText(/scan to log in|link with phone number|enter phone number/i).first().isVisible().catch(() => false)) return false;
    await page.waitForTimeout(1500);
  }
  return false;
}
async function openWhatsApp(page) {
  await page.goto("https://web.whatsapp.com/", { waitUntil: "domcontentloaded" });
  if (!(await loggedIn(page, 90000))) throw new Error("WhatsApp is logged out — run the workflow with mode = login");
}
/* Sends one message. Anything that goes wrong BEFORE the send button is pressed throws (safe to retry);
   once it's pressed the message counts as sent — never retried, so nobody gets duplicates. */
async function sendOne(page, to, text) {
  const pre = m => Object.assign(new Error(m), { beforeSend: true });
  await page.goto("https://web.whatsapp.com/send?phone=" + to + "&text=" + encodeURIComponent(text), { waitUntil: "domcontentloaded" });
  await useHere(page);
  const box = page.locator('footer div[contenteditable="true"]').last();
  const bad = page.getByText(/phone number shared via url is invalid/i);
  const out_ = page.getByText(/scan to log in|link with phone number|enter phone number/i).first();
  const which = await Promise.race([box.waitFor({ timeout: 90000 }).then(() => "ok"), bad.waitFor({ timeout: 90000 }).then(() => "bad"),
    out_.waitFor({ timeout: 90000 }).then(() => "out")]).catch(() => "timeout");
  if (which === "out") throw Object.assign(new Error("WhatsApp is logged out — run the workflow with mode = login"), { loggedOut: true });
  if (which === "bad") throw pre("not on WhatsApp: " + tail(to));
  if (which !== "ok") throw pre("chat didn't open");
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('footer div[contenteditable="true"]')].pop(); return b && b.innerText.trim().length > 0; }, null, { timeout: 20000 })
    .catch(() => { throw pre("message text didn't load into the chat"); });
  await page.waitForTimeout(1200);
  const btn = page.locator('button[aria-label="Send"], span[data-icon="send"], span[data-icon="wds-ic-send-filled"]').first();
  if (await btn.isVisible().catch(() => false)) await btn.click(); else await box.press("Enter");
  /* sent: the typing box empties. Then give WhatsApp a few seconds to deliver it before the browser closes. */
  const cleared = await page.waitForFunction(() => { const b = [...document.querySelectorAll('footer div[contenteditable="true"]')].pop(); return !b || b.innerText.trim() === ""; }, null, { timeout: 15000 }).then(() => true, () => false);
  if (!cleared) { await box.press("Enter").catch(() => {}); await page.waitForTimeout(3000); }
  for (let i = 0; i < 20 && await page.locator('span[data-icon="msg-time"]').count(); i++) await page.waitForTimeout(1000);
  await page.waitForTimeout(2500);
}

async function login() {
  const phone = String(process.env.WA_PHONE || "").replace(/\D/g, "");
  if (phone.length < 10) return fail("Give the number that should SEND the alerts, with country code (e.g. 916397988191)");
  const { ctx, page } = await browser();
  await page.goto("https://web.whatsapp.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  if (await loggedIn(page, 25000)) { log("Already logged in — nothing to do."); await page.waitForTimeout(15000); return ctx.close(); }
  const link = page.getByText(/(log ?in|link) with phone number/i).first();
  await link.waitFor({ timeout: 60000 });
  await link.evaluate(e => e.click());                       // it sits outside the headless viewport
  const input = page.locator('input[aria-label*="phone" i], input[type="text"]').first();
  await input.waitFor({ timeout: 30000 });
  await input.click(); await page.keyboard.press("Control+A"); await page.keyboard.press("Backspace");
  await input.pressSequentially("+" + phone, { delay: 60 });  // the field formats as you type; fill() doesn't stick
  await page.getByRole("button", { name: /^next$/i }).click();
  let code = "";
  for (let i = 0; i < 40 && !code; i++) {
    await page.waitForTimeout(1000);
    code = await page.evaluate(() => {
      const el = document.querySelector("[data-link-code]"); if (el) return el.getAttribute("data-link-code").replace(/,/g, "-");
      for (const box of document.querySelectorAll("div, span")) {
        const kids = [...box.children]; if (kids.length < 8 || kids.length > 9) continue;
        const t = kids.map(k => k.textContent.trim()); if (t.every(x => /^[A-Z0-9-]$/.test(x)) && t.filter(x => x !== "-").length === 8) return t.join("");
      }
      const m = document.body.innerText.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/); return m ? m[0] : "";
    });
  }
  if (!code) { log("page said: " + (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 400)); await ctx.close(); return fail("WhatsApp didn't show a link code — run the login again"); }
  const pretty = code.replace(/-/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");
  for (const l of ["", "========================================================", "  ON THE PHONE " + tail(phone) + ": WhatsApp → Settings → Linked devices", "  → Link a device → Link with phone number instead → enter:", "", "        " + pretty, "", "  You have about 3 minutes.", "========================================================"]) log(l);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### WhatsApp code: `" + pretty + "`\nOn the phone: Linked devices → Link a device → Link with phone number instead.\n");
  if (!(await loggedIn(page, 4 * 60000, true))) { await ctx.close(); return fail("Not linked in time — run the login again and enter the new code"); }
  log("Linked! Letting WhatsApp finish syncing…");
  await page.waitForTimeout(60000);
  if (!readState()) writeState({ since: new Date().toISOString(), sent: [], tries: {} });
  await ctx.close(); log("Saved. Order alerts will now be sent from this number.");
}

/* the customer's tracking link — its own sent-key, so a retry never re-sends the shop alert or vice versa */
async function toCustomer(page, st, o) {
  const c = customerMessage(o), key = "cust:" + o.client + ":" + o.id;
  if (!c || st.sent.includes(key) || !st.sent.includes(o.client + ":" + o.id)) return;
  try { await sendOne(page, c.to, c.text); st.sent.push(key); log("sent tracking link to the " + o.business + " customer " + tail(c.to)); }
  catch (e) {
    if (e.loggedOut) throw e;
    if (!e.beforeSend) st.sent.push(key);
    else { st.tries[key] = (st.tries[key] || 0) + 1; log("couldn't send the customer's tracking link (" + e.message + "), try " + st.tries[key]); if (st.tries[key] >= 3) { st.sent.push(key); delete st.tries[key]; } }
  }
  writeState(st);
}
async function alerts() {
  const started = Date.now();
  const [{ st, todo }, { ctx, page }] = await Promise.all([pending(), browser()]);   // in parallel: saves a few seconds
  if (!todo.length) { await ctx.close(); log("no new orders"); st.since = new Date().toISOString(); return writeState(st); }
  let sent = 0, skipped = 0;
  try {
    for (const o of todo) {
      const key = o.client + ":" + o.id, to = intl(o.to);
      if (st.sent.includes(key)) { await toCustomer(page, st, o); skipped++; continue; }
      if (to.length < 11) { log("skipped an order for " + o.business + ": no WhatsApp number in Clients"); st.sent.push(key); skipped++; await toCustomer(page, st, o); continue; }
      try { await sendOne(page, to, message(o)); st.sent.push(key); sent++; log("sent " + o.business + " order to " + tail(to)); }
      catch (e) {
        if (e.loggedOut) throw e;
        if (!e.beforeSend) { st.sent.push(key); sent++; log("sent " + o.business + " order to " + tail(to) + " (" + e.message + ")"); }
        else { st.tries[key] = (st.tries[key] || 0) + 1; log("couldn't send " + o.business + " order (" + e.message + "), try " + st.tries[key]);
          if (st.tries[key] >= 3) { st.sent.push(key); delete st.tries[key]; } }
      }
      writeState(st);
      await toCustomer(page, st, o);
    }
  } finally { await ctx.close(); }
  st.since = new Date().toISOString(); writeState(st);
  log(sent + " sent" + (skipped ? ", " + skipped + " skipped" : "") + " in " + Math.round((Date.now() - started) / 1000) + "s");
  if (sent + skipped < todo.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) try {
  if (MODE === "check") {
    let todo = [];
    try { ({ todo } = await pending()); }
    catch (e) {                      // not set up yet: stay quiet instead of failing every 15 minutes
      if (/Unknown action|Set STUDIO_ENDPOINT/.test(e.message)) { console.log("::notice::Order alerts aren't switched on yet — redeploy the Apps Script (it needs the order_alerts action)."); out("pending", 0); process.exit(0); }
      throw e;
    }
    log(todo.length + " order(s) waiting"); out("pending", todo.length);
  }
  else if (MODE === "alerts") await alerts();
  else if (MODE === "login") await login();
  else if (MODE === "test") { const to = intl(process.env.WA_PHONE); if (to.length < 11) throw new Error("Give the number to send the test to");
    const { ctx, page } = await browser(); try { await sendOne(page, to, "✅ make4yu order alerts are working — new website orders will arrive here."); log("test sent to " + tail(to)); } finally { await ctx.close(); } }
  else if (MODE === "keepalive") { const { ctx, page } = await browser(); try { await openWhatsApp(page); await page.waitForTimeout(30000); log("still logged in"); } finally { await ctx.close(); } }
  else throw new Error("Unknown mode " + MODE);
} catch (e) { fail(e.message); }
