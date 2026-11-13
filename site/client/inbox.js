/* make4yu client dashboard — the inbox for service businesses.
 * Bookings (cafés, restaurants), appointments (salons, clinics), site visits & enquiries (builders, real estate)
 * and leads (coaches, consultants) arrive from the website's forms into the client's database. This shows them
 * the way that business works: by day for bookings, by stage for enquiries, with one-tap status changes,
 * a ready WhatsApp reply, repeat-customer badges and what's busiest.
 * Mounted by client/index.html: Make4yuInbox.mount({ root, call, toast, kind, business, readOnly }). */
(function () {
  "use strict";
  const KIND = {
    restaurant: { title: "booking", titles: "bookings", find: /book|reserv|table/i, byDate: true },
    salon: { title: "appointment", titles: "appointments", find: /appoint|book|slot/i, byDate: true },
    realestate: { title: "enquiry", titles: "enquiries", find: /visit|enquir|lead|propert|contact/i, byDate: false },
    services: { title: "lead", titles: "leads", find: /enquir|lead|contact|call|message|consult/i, byDate: false }
  };
  const DONE = /^(arrived|delivered|won|lost|closed|not interested|cancelled|canceled|no-?show|visited|done)$/i;
  const BAD = /^(lost|not interested|cancelled|canceled|no-?show)$/i;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const today = () => { const d = new Date(Date.now() + 5.5 * 36e5); return d.toISOString().slice(0, 10); };
  const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const nice = iso => { const t = today(); if (iso === t) return "Today"; if (iso === addDays(t, 1)) return "Tomorrow"; if (iso === addDays(t, -1)) return "Yesterday";
    const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };
  const ago = ts => { const s = (Date.now() - Date.parse(ts)) / 1000; if (!(s >= 0)) return ""; if (s < 90) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; const d = Math.round(s / 86400); return d === 1 ? "yesterday" : d + " days ago"; };
  const mins = t => { const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(t || "")); if (!m) return 9999; let h = +m[1] % 12; if (/pm/i.test(m[3] || "")) h += 12; else if (!m[3] && +m[1] === 12) h = 12; return h * 60 + (+m[2] || 0); };

  const CSS = `
.ib{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
.ib-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-width:0}
.ib-seg{display:inline-flex;gap:4px;padding:4px;border-radius:999px;border:1px solid var(--line-2);background:rgba(255,255,255,.03);overflow-x:auto;max-width:100%;scrollbar-width:none}
.ib-seg::-webkit-scrollbar{display:none}
.ib-seg button{height:34px;padding:0 14px;border-radius:999px;font-weight:700;font-size:13px;color:var(--ink-2);white-space:nowrap;transition:background .3s var(--ease),color .3s}
.ib-seg button b{font-weight:800;margin-left:6px;opacity:.7}
.ib-seg button.on{background:var(--neon);color:#0A0F0D}
.ib-search{flex:1 1 200px;max-width:280px;height:42px;border-radius:999px;border:1px solid var(--line-2);background:rgba(255,255,255,.03);padding:0 16px;color:var(--ink);font-size:14px}
.ib-search:focus{outline:none;border-color:var(--neon)}
.ib-grp{display:flex;align-items:baseline;gap:10px;margin:10px 2px 2px;font-family:var(--display);font-size:17px;font-weight:700}
.ib-grp small{font-family:var(--body);font-size:13px;font-weight:600;color:var(--ink-3)}
.ib-list{display:grid;gap:8px}
.ib-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 16px;border-radius:16px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));transition:border-color .3s,transform .45s var(--ease),opacity .3s}
.ib-row:hover{border-color:var(--line-2);transform:translateY(-1px)}
.ib-row.new{border-color:rgba(var(--neon-rgb),.35);box-shadow:0 0 0 1px rgba(var(--neon-rgb),.08),0 18px 40px -28px rgba(var(--neon-rgb),.6)}
.ib-row.done{opacity:.62}
.ib-when{width:68px;text-align:center;display:grid;gap:1px;padding:8px 4px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--line)}
.ib-when b{font-family:var(--display);font-size:16px;line-height:1.1}
.ib-when small{font-size:11px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em}
.ib-av{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:16px;background:rgba(var(--neon-rgb),.12);color:var(--neon);border:1px solid rgba(var(--neon-rgb),.3)}
.ib-main{min-width:0;display:grid;gap:3px}
.ib-name{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-weight:700;font-size:15.5px}
.ib-tag{font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;background:rgba(var(--mint-rgb),.12);color:var(--mint);border:1px solid rgba(var(--mint-rgb),.3)}
.ib-tag.hot{background:rgba(var(--neon-rgb),.14);color:var(--neon);border-color:rgba(var(--neon-rgb),.35)}
.ib-meta{color:var(--ink-2);font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ib-note{color:var(--ink-3);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ib-act{display:flex;align-items:center;gap:6px}
.ib-st{height:36px;border-radius:999px;border:1px solid var(--line-2);background:rgba(255,255,255,.04);color:var(--ink);font-weight:700;font-size:13px;padding:0 30px 0 12px;appearance:none;-webkit-appearance:none;cursor:pointer;
  background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 15px) 16px,calc(100% - 10px) 16px;background-size:5px 5px;background-repeat:no-repeat;transition:border-color .25s,background-color .25s}
.ib-st:focus{outline:none;border-color:var(--neon)}
.ib-st.s-new{border-color:rgba(var(--neon-rgb),.5);color:var(--neon)}
.ib-st.s-good{border-color:rgba(var(--mint-rgb),.45);color:var(--mint)}
.ib-st.s-bad{color:var(--ink-3)}
.ib-ic{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--line-2);color:var(--ink-2);transition:color .25s,border-color .25s,background .25s}
.ib-ic:hover{color:#0A0F0D;background:var(--neon);border-color:var(--neon)}
.ib-ic.wa:hover{background:#25D366;border-color:#25D366;color:#fff}
.ib-ic svg{width:17px;height:17px}
.ib-empty{padding:34px 20px;text-align:center;border:1px dashed var(--line-2);border-radius:18px;color:var(--ink-2)}
.ib-empty b{display:block;font-family:var(--display);font-size:18px;color:var(--ink);margin-bottom:4px}
.ib-more{justify-self:center;height:38px;padding:0 18px;border-radius:999px;border:1px solid var(--line-2);font-weight:700;font-size:13px;color:var(--ink-2)}
.ib-more:hover{border-color:var(--neon);color:var(--neon)}
.ib-ins{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:6px}
.ib-card{padding:18px;border-radius:18px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012))}
.ib-card h4{font-family:var(--display);font-size:16px;margin:0 0 4px}
.ib-card p{color:var(--ink-3);font-size:12.5px;margin:0 0 12px}
.ib-bars{display:grid;gap:8px}
.ib-bar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;font-size:13px}
.ib-bar span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ib-bar b{font-variant-numeric:tabular-nums}
.ib-bar i{grid-column:1/-1;height:6px;border-radius:6px;background:rgba(255,255,255,.06);overflow:hidden}
.ib-bar i em{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--neon),var(--mint));transform-origin:left;animation:ibgrow 1s var(--ease) both}
.ib-week{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:end;height:110px}
.ib-week div{display:grid;gap:6px;justify-items:center;height:100%;align-content:end;font-size:11px;font-weight:700;color:var(--ink-3)}
.ib-week div i{width:100%;max-width:30px;border-radius:7px 7px 3px 3px;background:linear-gradient(180deg,var(--neon),rgba(var(--neon-rgb),.35));transform-origin:bottom;animation:ibup .9s var(--ease) both}
.ib-week div.top{color:var(--neon)}
.ib-in .ib-row{animation:ibrise .6s var(--ease) both}
@keyframes ibrise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes ibgrow{from{transform:scaleX(0)}}
@keyframes ibup{from{transform:scaleY(0)}}
@media (prefers-reduced-motion:reduce){.ib-in .ib-row,.ib-bar i em,.ib-week div i{animation:none}}
@media (max-width:640px){
  .ib-row{grid-template-columns:auto minmax(0,1fr);gap:10px 12px;padding:12px}
  .ib-act{grid-column:1/-1;justify-content:flex-end}
  .ib-act .ib-st{margin-right:auto}
  .ib-when{width:58px}
  .ib-search{max-width:none}
  .ib-seg button{padding:0 11px}
}`;
  const IC = {
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.7 15l-1.3 5 5.1-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.2z"/></svg>',
    call: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>'
  };

  function mount(o) {
    const K = KIND[o.kind] || KIND.services, root = o.root, call = o.call;
    if (!document.getElementById("ib-css")) { const st = document.createElement("style"); st.id = "ib-css"; st.textContent = CSS; document.head.appendChild(st); }
    const S = { t: null, rows: [], view: K.byDate ? "today" : "new", q: "", more: false, rev: "", first: true, busy: {} };
    root.innerHTML = '<div class="ib"><div class="ib-head" id="ibHead"></div><div class="ib-list" id="ibList"><div class="ib-empty"><b>Loading…</b></div></div><div class="ib-ins" id="ibIns"></div></div>';
    const $ = s => root.querySelector(s);

    async function load() {
      const first = await call("db_get", { tableId: "" });
      const tbls = first.tables || [];
      const t = tbls.filter(x => x.cols.some(c => /^status$/i.test(c.name))).find(x => K.find.test(x.name)) || tbls.find(x => K.find.test(x.name)) || tbls.filter(x => x.cols.some(c => /^status$/i.test(c.name)) && !/order|stock|product/i.test(x.name))[0];
      if (!t) { S.t = null; S.rows = []; return; }
      const j = t.id === first.tableId ? first : await call("db_get", { tableId: t.id });
      S.t = (j.tables || []).find(x => x.id === t.id) || t; S.rows = j.rows || [];
      const c = S.t.cols, f = re => c.find(x => re.test(x.name));
      S.c = {
        name: f(/^(name|full name|your name|customer|client)$/i) || f(/name/i),
        phone: c.find(x => x.type === "phone") || f(/phone|mobile|whatsapp/i),
        date: c.find(x => x.type === "date") || f(/date|day/i),
        time: f(/^(time|slot|time slot|preferred time)$/i) || f(/time|slot/i),
        status: f(/^status$/i), from: f(/^came from$/i),
        count: f(/guest|people|persons|pax|party/i),
        what: f(/service|project|property|treatment|occasion|package|programme|program|interest/i),
        money: f(/budget|revenue|price|amount/i),
        org: f(/^(business|company|brand|organisation|organization)$/i),
        note: c.find(x => x.type === "longtext" && !/^items$/i.test(x.name))
      };
      S.phones = {}; S.rows.forEach(r => { const p = S.c.phone ? String(r[S.c.phone.id] || "").replace(/\D/g, "").slice(-10) : ""; if (p.length === 10) S.phones[p] = (S.phones[p] || 0) + 1; });
    }

    const st = r => S.c.status ? String(r[S.c.status.id] || "") : "";
    const dt = r => S.c.date ? String(r[S.c.date.id] || "") : "";
    const isNew = r => /^new$/i.test(st(r)) || (!st(r) && S.c.status);

    function groups() {
      const q = S.q.toLowerCase(), t = today(), all = S.rows.filter(r => !q || Object.values(r).join(" ").toLowerCase().includes(q));
      if (K.byDate && S.c.date) {
        const sort = (a, b) => (dt(a) + String(mins(S.c.time && a[S.c.time.id])).padStart(4, "0")).localeCompare(dt(b) + String(mins(S.c.time && b[S.c.time.id])).padStart(4, "0"));
        const views = {
          today: [["Today", all.filter(r => dt(r) === t).sort(sort)]],
          upcoming: [["Tomorrow", all.filter(r => dt(r) === addDays(t, 1)).sort(sort)], ["Later", all.filter(r => dt(r) > addDays(t, 1)).sort(sort)]],
          new: [["Waiting for you to confirm", all.filter(isNew).sort(sort)]],
          past: [["Earlier", all.filter(r => dt(r) && dt(r) < t).sort(sort).reverse()]]
        };
        return views[S.view] || views.today;
      }
      const byTs = (a, b) => b._ts.localeCompare(a._ts);
      const views = {
        new: [["New — reply to these first", all.filter(isNew).sort(byTs)]],
        open: [["In progress", all.filter(r => !isNew(r) && !DONE.test(st(r))).sort(byTs)]],
        done: [["Finished", all.filter(r => DONE.test(st(r))).sort(byTs)]],
        all: [["Everything", all.slice().sort(byTs)]]
      };
      return views[S.view] || views.new;
    }
    function counts() {
      const t = today();
      if (K.byDate && S.c.date) return [["today", "Today", S.rows.filter(r => dt(r) === t).length], ["upcoming", "Upcoming", S.rows.filter(r => dt(r) > t).length],
        ["new", "To confirm", S.rows.filter(isNew).length], ["past", "Earlier", S.rows.filter(r => dt(r) && dt(r) < t).length]];
      return [["new", "New", S.rows.filter(isNew).length], ["open", "In progress", S.rows.filter(r => !isNew(r) && !DONE.test(st(r))).length],
        ["done", "Finished", S.rows.filter(r => DONE.test(st(r))).length], ["all", "All", S.rows.length]];
    }

    function message(r) {
      const first = S.c.name ? String(r[S.c.name.id] || "").split(" ")[0] : "", hi = "Hi " + (first || "there") + ", ";
      const dn = dt(r) ? nice(dt(r)) : "", rel = /^(Today|Tomorrow)$/.test(dn);
      const when = [dn ? (rel ? dn.toLowerCase() : "on " + dn) : "", S.c.time && r[S.c.time.id] ? "at " + r[S.c.time.id] : ""].filter(Boolean).join(" ");
      const what = S.c.what ? r[S.c.what.id] : "", n = S.c.count ? r[S.c.count.id] : "", s = st(r).toLowerCase(), b = o.business || "us";
      if (o.kind === "restaurant") return hi + "your table at " + b + (n ? " for " + n + (+n === 1 ? " guest" : " guests") : "") + (when ? " " + when : "") + " is confirmed. See you soon!";
      if (o.kind === "salon") return hi + "your " + (what ? what + " " : "") + "appointment at " + b + (when ? " " + when : "") + " is confirmed. Reply here if you need to change it.";
      if (o.kind === "realestate") return s === "visit booked" ? hi + "your site visit" + (what ? " at " + what : "") + (when ? " " + when : "") + " is confirmed. We'll share the pick-up details shortly."
        : hi + "thank you for your interest" + (what ? " in " + what : "") + ". When would suit you for a site visit? We offer free pick-up.";
      return hi + "thanks for reaching out to " + b + "! When's a good time for a quick call this week?";
    }

    function draw() {
      const head = $("#ibHead"), list = $("#ibList");
      if (!S.t) {
        head.innerHTML = "";
        list.innerHTML = '<div class="ib-empty"><b>No ' + K.titles + ' yet</b>When someone fills in the form on your website, their ' + K.title + ' appears here straight away — and you get it on WhatsApp too.</div>';
        $("#ibIns").innerHTML = ""; emit(); return;
      }
      head.innerHTML = '<div class="ib-seg" role="tablist">' + counts().map(c => '<button role="tab" data-v="' + c[0] + '" class="' + (S.view === c[0] ? "on" : "") + '">' + c[1] + "<b>" + c[2] + "</b></button>").join("") + "</div>" +
        '<input class="ib-search" type="search" placeholder="Search name, phone…" value="' + esc(S.q) + '" aria-label="Search">';
      const gs = groups(), total = gs.reduce((s, g) => s + g[1].length, 0), cap = S.more ? 400 : 40;
      let shown = 0;
      list.innerHTML = total ? gs.filter(g => g[1].length).map(g => {
        const rows = g[1].slice(0, Math.max(0, cap - shown)); shown += rows.length;
        const extra = S.c.count && K.byDate ? g[1].reduce((s, r) => s + (Number(r[S.c.count.id]) || 0), 0) : 0;
        return '<div class="ib-grp">' + esc(g[0]) + "<small>" + g[1].length + " " + (g[1].length === 1 ? K.title : K.titles) + (extra ? " · " + extra + (extra === 1 ? " guest" : " guests") : "") + "</small></div>" + rows.map(row).join("");
      }).join("") + (total > cap ? '<button class="ib-more" id="ibMore">Show all ' + total + "</button>" : "")
        : '<div class="ib-empty"><b>' + (S.q ? "Nothing matches “" + esc(S.q) + "”" : { today: "Nothing booked for today", upcoming: "Nothing coming up yet", new: "All caught up ✓", past: "Nothing earlier", open: "Nothing in progress", done: "Nothing finished yet", all: "Nothing here yet" }[S.view]) + "</b>" + (S.q ? "Try a different name or number." : "New " + K.titles + " from your website show up here by themselves.") + "</div>";
      list.classList.toggle("ib-in", S.first && !reduced()); S.first = false;
      list.querySelectorAll(".ib-row").forEach((el, i) => el.style.animationDelay = Math.min(i, 12) * 40 + "ms");
      insights(); emit();
    }
    function row(r) {
      const C = S.c, name = C.name ? String(r[C.name.id] || "") : "", ph = C.phone ? String(r[C.phone.id] || "").replace(/\D/g, "").slice(-10) : "";
      const rep = ph && S.phones[ph] > 1 ? S.phones[ph] : 0, s = st(r), d = dt(r);
      const meta = [C.org ? r[C.org.id] : "", C.time && K.byDate ? r[C.time.id] : "", C.count && r[C.count.id] ? r[C.count.id] + " " + (o.kind === "restaurant" ? (+r[C.count.id] === 1 ? "guest" : "guests") : (+r[C.count.id] === 1 ? "person" : "people")) : "", C.what ? r[C.what.id] : "",
        C.money ? r[C.money.id] && (C.money.type === "money" ? "₹" + Number(r[C.money.id]).toLocaleString("en-IN") : r[C.money.id]) : "", !K.byDate && d ? "visit " + nice(d) : ""].filter(Boolean).map(esc).join(" · ");
      const note = C.note && r[C.note.id] ? esc(r[C.note.id]) : "";
      const lead = K.byDate && d ? '<div class="ib-when"><small>' + esc(nice(d).split(",")[0].split(" ")[0]) + "</small><b>" + esc(C.time ? String(r[C.time.id] || "").replace(/\s*(am|pm)/i, "") || "—" : new Date(d + "T00:00:00").getDate()) + "</b><small>" + esc(C.time ? (/(am|pm)/i.exec(r[C.time.id] || "") || [""])[0] : "") + "</small></div>"
        : '<div class="ib-av" aria-hidden="true">' + esc((name || "?").trim().charAt(0).toUpperCase()) + "</div>";
      const opts = C.status && (C.status.options || []).length ? C.status.options : ["New"];
      const cls = /^new$/i.test(s) ? "s-new" : BAD.test(s) ? "s-bad" : DONE.test(s) || /confirm|booked|called|contacted/i.test(s) ? "s-good" : "";
      return '<div class="ib-row' + (isNew(r) ? " new" : "") + (DONE.test(s) ? " done" : "") + '" data-id="' + esc(r._id) + '">' + lead +
        '<div class="ib-main"><div class="ib-name">' + esc(name || "Someone") + (rep ? '<span class="ib-tag">Repeat ×' + rep + "</span>" : "") + (isNew(r) && Date.now() - Date.parse(r._ts) < 864e5 ? '<span class="ib-tag hot">New · ' + esc(ago(r._ts)) + "</span>" : "") + "</div>" +
        (meta ? '<div class="ib-meta">' + meta + "</div>" : "") + (note ? '<div class="ib-note">' + note + "</div>" : !isNew(r) ? '<div class="ib-note">Received ' + esc(ago(r._ts)) + "</div>" : "") + "</div>" +
        '<div class="ib-act">' + (C.status && !o.readOnly ? '<select class="ib-st ' + cls + '" aria-label="Status">' + opts.map(x => "<option" + (x === s ? " selected" : "") + ">" + esc(x) + "</option>").join("") + "</select>" : s ? '<span class="ib-tag">' + esc(s) + "</span>" : "") +
        (ph.length === 10 ? '<a class="ib-ic wa" href="https://wa.me/91' + ph + "?text=" + encodeURIComponent(message(r)) + '" target="_blank" rel="noopener" title="Reply on WhatsApp" aria-label="Reply on WhatsApp">' + IC.wa + '</a><a class="ib-ic" href="tel:+91' + ph + '" title="Call" aria-label="Call">' + IC.call + "</a>" : "") + "</div></div>";
    }

    function tally(col, rows) { const o = {}; rows.forEach(r => { const v = String(r[col.id] || "").trim(); if (v) o[v] = (o[v] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6); }
    function bars(list) { const max = Math.max(1, ...list.map(x => x[1])); return '<div class="ib-bars">' + list.map(x => '<div class="ib-bar"><span>' + esc(x[0]) + "</span><b>" + x[1] + '</b><i><em style="width:' + Math.round(x[1] / max * 100) + '%"></em></i></div>').join("") + "</div>"; }
    function insights() {
      const el = $("#ibIns"), C = S.c, since = new Date(Date.now() - 30 * 864e5).toISOString(), rows = S.rows.filter(r => r._ts >= since), cards = [];
      if (!rows.length) { el.innerHTML = ""; return; }
      if (C.date && K.byDate) {
        const wk = [0, 0, 0, 0, 0, 0, 0]; S.rows.forEach(r => { const d = new Date(dt(r) + "T00:00:00"); if (!isNaN(d)) wk[(d.getDay() + 6) % 7]++; });
        const max = Math.max(1, ...wk), top = wk.indexOf(max);
        cards.push('<div class="ib-card"><h4>Busiest days</h4><p>Which days people book — plan your staff around it.</p><div class="ib-week">' + ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => '<div class="' + (i === top ? "top" : "") + '"><i style="height:' + Math.max(6, Math.round(wk[i] / max * 86)) + 'px;animation-delay:' + i * 60 + 'ms"></i>' + d + "</div>").join("") + "</div></div>");
      }
      if (C.time) cards.push('<div class="ib-card"><h4>Most popular times</h4><p>Last 30 days.</p>' + bars(tally(C.time, rows)) + "</div>");
      if (C.what) cards.push('<div class="ib-card"><h4>Most asked for</h4><p>' + esc(C.what.name) + ", last 30 days.</p>" + bars(tally(C.what, rows)) + "</div>");
      if (C.money && C.money.type !== "money") cards.push('<div class="ib-card"><h4>' + esc(C.money.name) + "</h4><p>What people told you, last 30 days.</p>" + bars(tally(C.money, rows)) + "</div>");
      if (C.status && !K.byDate) {
        const won = S.rows.filter(r => /^(won|closed|visited)$/i.test(st(r))).length, lost = S.rows.filter(r => BAD.test(st(r))).length;
        cards.push('<div class="ib-card"><h4>How they turned out</h4><p>Every ' + K.title + " so far.</p>" + bars(tally(C.status, S.rows)) + (won + lost ? '<p style="margin:12px 0 0;color:var(--ink-2)">You closed <b style="color:var(--neon)">' + Math.round(won / (won + lost) * 100) + "%</b> of the ones that finished.</p>" : "") + "</div>");
      }
      if (C.status && K.byDate) {
        const fin = S.rows.filter(r => dt(r) && dt(r) < today()), ns = fin.filter(r => /no-?show/i.test(st(r))).length;
        if (fin.length) cards.push('<div class="ib-card"><h4>Who turned up</h4><p>Past ' + K.titles + ".</p>" + bars(tally(C.status, fin)) + (ns ? '<p style="margin:12px 0 0;color:var(--ink-2)">' + Math.round(ns / fin.length * 100) + "% didn't show — a WhatsApp reminder the day before helps.</p>" : "") + "</div>");
      }
      if (C.from) cards.push('<div class="ib-card"><h4>Where they found you</h4><p>Last 30 days.</p>' + bars(tally(C.from, rows).map(x => [x[0].split(" · ")[0].replace(/^\w/, m => m.toUpperCase()), x[1]])) + "</div>");
      el.innerHTML = cards.slice(0, 4).join("");
    }

    function emit() {
      const t = today(), C = S.c || {}, todays = S.rows.filter(r => dt(r) === t), wkAgo = new Date(Date.now() - 7 * 864e5).toISOString(), mo = new Date(Date.now() - 30 * 864e5).toISOString();
      const top = C.what ? tally(C.what, S.rows.filter(r => r._ts >= mo))[0] : null;
      dispatchEvent(new CustomEvent("make4yu:inbox", { detail: {
        ready: true, has: !!S.t, kind: o.kind, title: K.title, titles: K.titles,
        today: todays.filter(r => !BAD.test(st(r))).length, guests: C.count ? todays.filter(r => !BAD.test(st(r))).reduce((s, r) => s + (Number(r[C.count.id]) || 0), 0) : 0,
        toConfirm: S.rows.filter(isNew).length, upcoming: S.rows.filter(r => dt(r) > t && !BAD.test(st(r))).length,
        week: S.rows.filter(r => r._ts >= wkAgo).length, month: S.rows.filter(r => r._ts >= mo).length,
        repeat: Object.values(S.phones || {}).filter(n => n > 1).length,
        booked: S.rows.filter(r => /visit booked|call booked|confirmed/i.test(st(r)) && (!dt(r) || dt(r) >= t)).length,
        top: top ? top[0] : ""
      } }));
    }

    async function save(id, status, sel) {
      const r = S.rows.find(x => x._id === id); if (!r || !S.c.status || S.busy[id]) return;
      const was = r[S.c.status.id]; r[S.c.status.id] = status; S.busy[id] = 1; sel.disabled = true;
      try { const j = await call("db_save_row", { tableId: S.t.id, row: r }); if (j.row) Object.assign(r, j.row); o.toast && o.toast(status === "New" ? "Marked as new" : "Marked as " + status.toLowerCase()); }
      catch (e) { r[S.c.status.id] = was; o.toast && o.toast(e.message || "Couldn't save — try again"); }
      delete S.busy[id]; draw();
    }

    root.addEventListener("click", e => {
      const v = e.target.closest(".ib-seg button"); if (v) { S.view = v.dataset.v; S.more = false; S.first = true; draw(); return; }
      if (e.target.closest("#ibMore")) { S.more = true; draw(); }
    });
    root.addEventListener("change", e => { const s = e.target.closest(".ib-st"); if (s) save(s.closest(".ib-row").dataset.id, s.value, s); });
    let qt; root.addEventListener("input", e => { if (!e.target.classList.contains("ib-search")) return; clearTimeout(qt); qt = setTimeout(() => { S.q = e.target.value.trim(); draw(); const i = root.querySelector(".ib-search"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 160); });

    async function refresh() { try { await load(); } catch (e) { /* keep what's shown */ } if (!root.querySelector(".ib-search:focus")) draw(); }
    // start on the view that has something in it
    (async () => {
      try { await load(); } catch (e) { $("#ibList").innerHTML = '<div class="ib-empty"><b>Couldn\'t load your ' + K.titles + "</b>" + esc(e.message || "") + "</div>"; return; }
      if (K.byDate && S.c && S.c.date) { const c = counts(); if (!c[0][2]) S.view = c[2][2] ? "new" : c[1][2] ? "upcoming" : "past"; }
      else if (S.c) { const c = counts(); if (!c[0][2]) S.view = c[1][2] ? "open" : "all"; }
      draw();
      // live: a new booking appears without reloading
      setInterval(async () => { if (document.hidden || !root.isConnected) return; try { const r = await call("db_rev"); if (r.rev && r.rev !== S.rev) { const f = !S.rev; S.rev = r.rev; if (!f) refresh(); } } catch (e) { /* next round */ } }, 20000);
    })();
    return { refresh, view: v => { S.view = v; S.more = false; S.first = true; if (S.t) draw(); } };
  }
  window.Make4yuInbox = { mount };
})();
