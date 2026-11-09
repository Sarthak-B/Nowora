/* make4yu client database — tables the client manages from their dashboard.
   Loaded on demand by /client/index.html:  NoworaDB.mount({root, call, toast, demo, owner, business})
   Storage: the client's own Google Sheet (one tab per table), through the Apps Script backend. */
(function () {
  "use strict";
  const TYPES = [
    ["text", "Short text"], ["longtext", "Long text"], ["number", "Number"], ["money", "Amount (₹)"], ["date", "Date"],
    ["phone", "Phone"], ["email", "Email"], ["link", "Web link"], ["choice", "Pick from a list"], ["yesno", "Yes / no"]
  ];
  const TEMPLATES = [
    { name: "Customers", icon: "users", blurb: "Names, numbers and notes on the people who buy from you.",
      cols: [["Name", "text"], ["Phone", "phone"], ["Email", "email"], ["City", "text"], ["Notes", "longtext"]] },
    { name: "Orders", icon: "bag", blurb: "Every order, what it was, how much and where it's up to.",
      cols: [["Order no.", "text"], ["Customer", "text"], ["Phone", "phone"], ["Items", "longtext"], ["Amount", "money"], ["Status", "choice", "New, Paid, Packed, Shipped, Delivered, Cancelled"], ["Order date", "date"]] },
    { name: "Stock", icon: "box", blurb: "What's on your shelves. Website orders take items off automatically.",
      cols: [["Product", "text"], ["Size", "text"], ["Colour", "text"], ["In stock", "number"], ["Reorder at", "number"], ["Price", "money"], ["Cost price", "money"], ["Category", "text"]] },
    { name: "Bookings", icon: "cal", blurb: "Appointments, tables or classes — who's coming and when.",
      cols: [["Name", "text"], ["Phone", "phone"], ["Date", "date"], ["Time", "text"], ["People", "number"], ["Status", "choice", "Booked, Came, No-show, Cancelled"], ["Notes", "longtext"]] },
    { name: "Payments", icon: "coin", blurb: "Money in and out, so month-end is easy.",
      cols: [["Date", "date"], ["From / to", "text"], ["Amount", "money"], ["Type", "choice", "Received, Paid out"], ["Method", "choice", "UPI, Cash, Card, Bank transfer"], ["Notes", "longtext"]] }
  ];
  const IC = {
    plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    cols: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>', dl: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>', db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/>',
    bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>', box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', coin: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9.5h4.5a2 2 0 0 1 0 4H9.5a2 2 0 0 0 0 4H15M12 7v2.5M12 17.5V20"/>',
    blank: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 9v6M9 12h6"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'
  };
  const svg = (n, s) => '<svg width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[n] + "</svg>";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inr = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const fmtDay = d => { const x = new Date(d + "T00:00:00"); return isNaN(x) ? esc(d) : x.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
  const PAGE = 50;

  const CSS = `
.db-shell{display:grid;gap:14px}
.db-tabs{display:flex;gap:8px;align-items:center;overflow-x:auto;padding:2px;scrollbar-width:none}.db-tabs::-webkit-scrollbar{display:none}
.db-tab{flex:none;display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:999px;border:1px solid var(--line-2);background:rgba(255,255,255,.03);color:var(--ink-2);font-weight:650;font-size:14px;cursor:pointer;transition:all .25s}
.db-tab small{font-size:11.5px;color:var(--ink-3);font-weight:700}
.db-tab:hover{color:var(--ink);border-color:rgba(var(--neon-rgb),.45)}
.db-tab.on{background:var(--neon);border-color:var(--neon);color:#0A0F0D}.db-tab.on small{color:rgba(10,15,13,.6)}
.db-tab.new{border-style:dashed}
.db-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.db-search{flex:1;min-width:180px;position:relative}.db-search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--ink-3)}
.db-search input{width:100%;height:42px;border-radius:999px;border:1px solid var(--line-2);background:rgba(0,0,0,.25);padding:0 16px 0 40px;color:var(--ink);font-size:14.5px}
.db-search input:focus,.db-field input:focus,.db-field textarea:focus,.db-field select:focus,.db-col input:focus,.db-col select:focus{outline:none;border-color:rgba(var(--neon-rgb),.6);box-shadow:0 0 0 3px rgba(var(--neon-rgb),.12)}
.db-ib{width:42px;height:42px;border-radius:50%;display:inline-grid;place-items:center;border:1px solid var(--line-2);background:rgba(255,255,255,.03);color:var(--ink-2);cursor:pointer;transition:all .2s}
.db-ib:hover{color:var(--ink);border-color:rgba(var(--neon-rgb),.5)}.db-ib.danger:hover{color:var(--rose);border-color:rgba(255,92,122,.5)}
.db-card{padding:0!important}
.db-scroll{overflow:auto;max-height:min(68vh,720px);border-radius:inherit}
.db-table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px}
.db-table th{position:sticky;top:0;z-index:2;background:#0F1915;text-align:left;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:700;padding:13px 14px;border-bottom:1px solid var(--line-2);white-space:nowrap;cursor:pointer;user-select:none}
.db-table th:hover{color:var(--ink)}.db-table th .ar{display:inline-block;margin-left:4px;color:var(--neon)}
.db-table td{padding:12px 14px;border-bottom:1px solid var(--line);max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink)}
.db-table tbody tr{cursor:pointer;transition:background .15s}.db-table tbody tr:hover{background:rgba(var(--neon-rgb),.045)}
.db-table tbody tr.sel{background:rgba(var(--neon-rgb),.08)}
.db-table .ck{width:44px;padding-left:16px;padding-right:0;cursor:default}
.db-table input[type=checkbox]{width:17px;height:17px;accent-color:var(--neon);cursor:pointer}
.db-table td.num{text-align:right;font-variant-numeric:tabular-nums}.db-table th.num{text-align:right}
.db-table td a{color:var(--sky);text-decoration:none}.db-table td a:hover{text-decoration:underline}
.db-table td.muted{color:var(--ink-3)}
.db-pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12.5px;font-weight:700;background:rgba(255,255,255,.07);color:var(--ink)}
.db-yes{color:var(--neon);font-weight:700}.db-no{color:var(--ink-3)}
.db-foot{display:flex;align-items:center;gap:10px;padding:12px 16px;color:var(--ink-3);font-size:13px;border-top:1px solid var(--line)}
.db-foot .sp{flex:1}
.db-sel{display:flex;align-items:center;gap:10px;padding:10px 12px 10px 18px;border-radius:999px;background:rgba(var(--neon-rgb),.08);border:1px solid rgba(var(--neon-rgb),.35);font-weight:650;font-size:14px}
.db-sel .sp{flex:1}
.db-none{padding:42px 18px;text-align:center;color:var(--ink-2)}
.db-none b{display:block;font-family:var(--display);font-size:22px;color:var(--ink);letter-spacing:-.02em;margin-bottom:6px}
.db-tpls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.db-tpl{text-align:left;cursor:pointer;display:grid;gap:8px;align-content:start;padding:20px!important;transition:border-color .3s,transform .3s}
.db-tpl:hover{border-color:rgba(var(--neon-rgb),.5);transform:translateY(-3px)}
.db-tpl .ico{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:rgba(var(--neon-rgb),.1);color:var(--neon)}
.db-tpl b{font-family:var(--display);font-size:19px;letter-spacing:-.02em}
.db-tpl p{color:var(--ink-2);font-size:13.5px}
.db-tpl small{color:var(--ink-3);font-size:12px}
.db-intro{display:flex;gap:14px;align-items:center;margin-bottom:6px;color:var(--ink-2);font-size:14.5px}
.db-modal-bg{position:fixed;inset:0;z-index:90;background:rgba(3,6,5,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px 16px;opacity:0;transition:opacity .25s;overflow-y:auto}
.db-modal-bg.on{opacity:1}
.db-modal{width:min(620px,100%);background:#0E1613;border:1px solid var(--line-2);border-radius:24px;padding:26px;box-shadow:0 40px 120px -30px rgba(0,0,0,.9);transform:translateY(14px) scale(.98);transition:transform .35s cubic-bezier(.22,.8,.2,1)}
.db-modal-bg.on .db-modal{transform:none}
.db-modal h2{font-family:var(--display);font-size:24px;letter-spacing:-.03em;display:flex;align-items:center;gap:10px;margin-bottom:4px}
.db-modal h2 .sp{flex:1}.db-modal .sub{color:var(--ink-3);font-size:13px;margin-bottom:18px}
.db-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.db-field{display:grid;gap:6px;min-width:0}.db-field.full{grid-column:1/-1}
.db-field label{font-size:12.5px;font-weight:700;color:var(--ink-2);letter-spacing:.02em}
.db-field input,.db-field select,.db-field textarea,.db-col input,.db-col select{width:100%;height:44px;border-radius:13px;border:1px solid var(--line-2);background:rgba(0,0,0,.3);padding:0 14px;color:var(--ink);font-size:15px;min-width:0}
.db-field textarea{height:auto;min-height:96px;padding:12px 14px;margin:0;resize:vertical}
.db-field select option,.db-col select option{background:#0E1613}
.db-toggle{display:flex;gap:8px}.db-toggle button{flex:1;height:44px;border-radius:13px;border:1px solid var(--line-2);background:rgba(0,0,0,.3);color:var(--ink-2);font-weight:700;cursor:pointer}
.db-toggle button.on{background:rgba(var(--neon-rgb),.12);border-color:rgba(var(--neon-rgb),.6);color:var(--neon)}
.db-acts{display:flex;gap:10px;align-items:center;margin-top:22px;flex-wrap:wrap}.db-acts .sp{flex:1}
.db-danger{color:var(--rose)!important;border-color:rgba(255,92,122,.35)!important}
.db-cols{display:grid;gap:10px;margin-top:6px}
.db-col{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto;gap:8px;align-items:start;padding:10px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid var(--line)}
.db-col .opt{grid-column:1/3}.db-col .mv{display:flex;gap:4px}.db-col .mv .db-ib{width:36px;height:36px}
.db-col.gone{display:none}
.db-note{font-size:12.5px;color:var(--ink-3);margin-top:8px}
.db-meta{font-size:12px;color:var(--ink-3);margin-top:14px}
.db-stock{display:inline-flex;align-items:center;gap:6px}.db-stock button{width:26px;height:26px;border-radius:8px;border:1px solid var(--line-2);background:rgba(255,255,255,.04);color:var(--ink-2);cursor:pointer;font-weight:800;line-height:1}
.db-stock button:hover{border-color:rgba(var(--neon-rgb),.6);color:var(--neon)}.db-stock b{min-width:30px;text-align:center;font-variant-numeric:tabular-nums}
.db-low b{color:var(--amber)}.db-out b{color:var(--rose)}
.db-st{appearance:none;-webkit-appearance:none;border:0;border-radius:999px;padding:4px 12px;font-size:12.5px;font-weight:800;cursor:pointer;background:rgba(255,255,255,.08);color:var(--ink)}
.db-st option{background:#0E1613;color:var(--ink)}
.db-st[data-v=new]{background:rgba(var(--neon-rgb),.16);color:var(--neon)}.db-st[data-v=confirmed],.db-st[data-v=contacted],.db-st[data-v=packed]{background:rgba(92,200,255,.14);color:var(--sky)}
.db-st[data-v=shipped]{background:rgba(255,181,71,.14);color:var(--amber)}.db-st[data-v=delivered],.db-st[data-v=done],.db-st[data-v=paid]{background:rgba(var(--mint-rgb),.14);color:var(--mint)}.db-st[data-v=cancelled]{background:rgba(255,92,122,.14);color:var(--rose)}
.db-sum{display:flex;gap:8px;flex-wrap:wrap}.db-sum button{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--line-2);background:rgba(255,255,255,.03);color:var(--ink-2);font-size:13px;font-weight:700;cursor:pointer}
.db-sum button b{color:var(--ink)}.db-sum button.on{border-color:rgba(var(--neon-rgb),.6);color:var(--neon)}.db-sum .warn b{color:var(--amber)}.db-sum .bad b{color:var(--rose)}
.db-live{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-3);font-weight:700}.db-live i{width:7px;height:7px;border-radius:50%;background:var(--neon);box-shadow:0 0 10px var(--neon);animation:dbpulse 2s infinite}
@keyframes dbpulse{50%{opacity:.35}}
.db-tab .dot{width:8px;height:8px;border-radius:50%;background:var(--neon);box-shadow:0 0 8px var(--neon)}
.db-table tbody tr.fresh{animation:dbfresh 3.2s ease-out}@keyframes dbfresh{0%,30%{background:rgba(var(--neon-rgb),.16)}100%{background:transparent}}
.db-skel{height:260px;border-radius:var(--r);background:linear-gradient(90deg,rgba(255,255,255,.03) 25%,rgba(255,255,255,.06) 50%,rgba(255,255,255,.03) 75%);background-size:200% 100%;animation:dbsh 1.2s linear infinite}
@keyframes dbsh{to{background-position:-200% 0}}
@media(max-width:860px){.db-tpls{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.db-tpls{grid-template-columns:minmax(0,1fr)}.db-form{grid-template-columns:minmax(0,1fr)}.db-modal{padding:20px;border-radius:20px}.db-col{grid-template-columns:minmax(0,1fr) auto}.db-col [data-n]{grid-column:1/-1}.db-col select{grid-column:1/2}.db-col .opt{grid-column:1/-1}.db-bar .db-search{flex-basis:100%}}
@media print{.db-bar,.db-tabs .new,.db-ck,.db-sel{display:none!important}.db-scroll{max-height:none;overflow:visible}}
`;

  /* ---------------- demo backend (the /client/demo page) ---------------- */
  function demoBackend() {
    const K = "nw_demo_db_v2", rid = () => Math.random().toString(36).slice(2, 12);
    const load = () => { try { const d = JSON.parse(localStorage.getItem(K) || "null"); if (d) return d; } catch (e) {} const d = seed(); save(d); return d; };
    const save = d => { try { localStorage.setItem(K, JSON.stringify(d)); } catch (e) {} };
    function seed() {
      const cols = [{ id: "c1", name: "Name", type: "text" }, { id: "c2", name: "Phone", type: "phone" }, { id: "c3", name: "Favourite", type: "choice", options: ["Cold coffee", "Cappuccino", "Sourdough", "Brunch plate"] }, { id: "c4", name: "Spent so far", type: "money" }, { id: "c5", name: "Regular", type: "yesno" }, { id: "c6", name: "Last visit", type: "date" }];
      const names = ["Aarav Mehta", "Isha Rawat", "Kabir Negi", "Meera Joshi", "Rohan Bisht", "Tanvi Sharma", "Dev Kapoor", "Ananya Rana"];
      const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
      const rows = names.map((n, i) => ({ _id: rid(), _ts: new Date(Date.now() - (30 - i) * 864e5).toISOString(), c1: n, c2: "+91 98" + (10000000 + i * 7311291 % 89999999), c3: cols[2].options[i % 4], c4: 450 + i * 615, c5: i % 3 !== 1, c6: day(i * 2 + 1) }));
      const sc = [{ id: "s1", name: "Product", type: "text" }, { id: "s2", name: "Size", type: "text" }, { id: "s3", name: "In stock", type: "number" }, { id: "s4", name: "Reorder at", type: "number" }, { id: "s5", name: "Price", type: "money" }];
      const prods = [["Cold brew bottle", "", 18, 6, 220], ["Sourdough loaf", "", 4, 5, 180], ["Coffee beans 250g", "", 0, 4, 650], ["Brunch voucher", "", 25, 5, 999], ["Mug", "Large", 9, 3, 450], ["Mug", "Small", 2, 3, 380]];
      const stock = prods.map((x, i) => ({ _id: "p" + i, _ts: new Date(Date.now() - 40 * 864e5).toISOString(), s1: x[0], s2: x[1], s3: x[2], s4: x[3], s5: x[4] }));
      const oc = [{ id: "o1", name: "Order ID", type: "text" }, { id: "o2", name: "Name", type: "text" }, { id: "o3", name: "Phone", type: "phone" }, { id: "o4", name: "Address", type: "longtext" }, { id: "o5", name: "Items", type: "longtext" }, { id: "o6", name: "Total", type: "money" },
        { id: "o7", name: "Status", type: "choice", options: ["New", "Confirmed", "Packed", "Shipped", "Delivered", "Cancelled"] }, { id: "o8", name: "Came from", type: "text" }];
      const orders = [["BB-7K2Q", "Isha Rawat", "2 × Cold brew bottle — ₹440", 440, "Delivered", "instagram · mobile"], ["BB-8P1D", "Kabir Negi", "1 × Coffee beans 250g — ₹650", 650, "Shipped", "google · mobile"], ["BB-9T4M", "Meera Joshi", "1 × Mug · Large — ₹450\n1 × Sourdough loaf — ₹180", 630, "New", "whatsapp · mobile"]]
        .map((x, i) => ({ _id: "o" + i, _ts: new Date(Date.now() - (3 - i) * 7 * 36e5).toISOString(), o1: x[0], o2: x[1], o3: "+91 98" + (21000000 + i * 4417), o4: "Rajpur Road, Dehradun 248001", o5: x[2], o6: x[3], o7: x[4], o8: x[5] }));
      return { rev: "1", tables: [{ id: "t2", name: "Orders", cols: oc, rows: orders }, { id: "t3", name: "Stock", cols: sc, rows: stock }, { id: "t1", name: "Customers", cols: cols, rows: rows }] };
    }
    let lastSim = Date.now();
    function simulateOrder(d) {                       // the demo shows a website order arriving now and then
      const o = d.tables.find(t => t.name === "Orders"), st = d.tables.find(t => t.name === "Stock");
      if (!o || !st || !st.rows.length) return false;
      const p = st.rows[Math.floor(Math.random() * st.rows.length)], q = 1 + (Math.random() < .3 ? 1 : 0);
      const who = ["Aditi Bhatt", "Nikhil Rawat", "Sara Khan", "Vivek Joshi", "Pooja Negi"][Math.floor(Math.random() * 5)];
      const r = { _id: rid(), _ts: new Date().toISOString() };
      o.cols.forEach(c => r[c.id] = "");
      const set = (n, v) => { const c = o.cols.find(c => c.name === n); if (c) r[c.id] = v; };
      set("Order ID", "BB-" + Math.random().toString(36).slice(2, 6).toUpperCase()); set("Name", who); set("Phone", "+91 97" + Math.floor(10000000 + Math.random() * 89999999));
      set("Address", "Sahastradhara Road, Dehradun 248013"); set("Items", q + " × " + p.s1 + (p.s2 ? " · " + p.s2 : "") + " — ₹" + (q * p.s5).toLocaleString("en-IN")); set("Total", q * p.s5); set("Status", "New"); set("Came from", "instagram · mobile");
      o.rows.push(r); p.s3 = (+p.s3 || 0) - q; d.rev = String(Date.now()); return true;
    }
    return async function (action, x) {
      await new Promise(r => setTimeout(r, 220));
      const d = load(), find = id => { const t = d.tables.find(t => t.id === id); if (!t) throw new Error("That table no longer exists"); return t; };
      const shape = t => ({ id: t.id, name: t.name, cols: t.cols, count: t.rows.length });
      if (action === "db_rev") { if (Date.now() - lastSim > 25000) { lastSim = Date.now(); if (simulateOrder(d)) save(d); } return { ok: true, rev: d.rev || "1" }; }
      if (action !== "db_get") d.rev = String(Date.now());
      if (action === "db_get") { const t = d.tables.find(t => t.id === x.tableId) || d.tables[0]; return { ok: true, tables: d.tables.map(shape), tableId: t ? t.id : "", rows: t ? t.rows : [] }; }
      if (action === "db_save_table") {
        const cols = x.table.cols.map(c => Object.assign({}, c, { id: c.id || rid(), options: c.type === "choice" ? String(Array.isArray(c.options) ? c.options.join(",") : c.options || "").split(",").map(s => s.trim()).filter(Boolean) : undefined }));
        if (!x.table.name.trim()) throw new Error("Give the table a name");
        if (x.table.id) { const t = find(x.table.id); t.name = x.table.name.trim(); t.cols = cols; t.rows.forEach(r => Object.keys(r).forEach(k => { if (k[0] !== "_" && !cols.some(c => c.id === k)) delete r[k]; })); save(d); return { ok: true, table: shape(t) }; }
        const t = { id: rid(), name: x.table.name.trim(), cols: cols, rows: [] }; d.tables.push(t); save(d); return { ok: true, table: shape(t) };
      }
      if (action === "db_delete_table") { d.tables = d.tables.filter(t => t.id !== x.tableId); save(d); return { ok: true }; }
      if (action === "db_save_row") {
        const t = find(x.tableId), r = Object.assign({}, x.row);
        if (r._id) { const i = t.rows.findIndex(o => o._id === r._id); if (i >= 0) { r._ts = t.rows[i]._ts; t.rows[i] = r; } }
        else { r._id = rid(); r._ts = new Date().toISOString(); t.rows.push(r); }
        t.cols.forEach(c => { if (c.type === "number" || c.type === "money") r[c.id] = r[c.id] === "" || r[c.id] == null ? "" : Number(r[c.id]); });
        save(d); return { ok: true, row: r };
      }
      if (action === "db_delete_rows") { const t = find(x.tableId); const n = t.rows.length; t.rows = t.rows.filter(r => x.ids.indexOf(r._id) < 0); save(d); return { ok: true, deleted: n - t.rows.length }; }
      throw new Error("Unknown action");
    };
  }

  /* ---------------- the component ---------------- */
  function mount(o) {
    const root = o.root, toast = o.toast || (m => alert(m));
    const call = o.demo ? (() => { const be = demoBackend(); return (a, x) => be(a, x || {}); })() : o.call;
    const RO = !!o.readOnly;                         // view-only: look, search, sort and download — no changes
    const S = { tables: [], tableId: "", rows: [], q: "", sort: null, sel: new Set(), shown: PAGE, sheetUrl: "", loading: true, rev: "", fresh: new Set(), unseen: {}, onlyLow: false };
    if (!document.getElementById("db-css")) { const st = document.createElement("style"); st.id = "db-css"; st.textContent = CSS; document.head.appendChild(st); }

    const table = () => S.tables.find(t => t.id === S.tableId);
    const cellText = (c, v) => {
      if (v === "" || v == null) return "";
      if (c.type === "money") return inr(v);
      if (c.type === "number") return Number(v).toLocaleString("en-IN");
      if (c.type === "date") return fmtDay(v);
      if (c.type === "yesno") return v ? "Yes" : "No";
      return String(v);
    };
    const stockCol = t => t && t.cols.find(c => c.type === "number" && /stock|qty|quantity|available|in hand/i.test(c.name));
    const reorderCol = t => t && t.cols.find(c => c.type === "number" && /reorder|low|minimum|min\b|alert/i.test(c.name));
    const statusCol = t => t && t.cols.find(c => c.type === "choice" && /^(status|stage|state|order status)$/i.test(c.name));
    function stockLevel(t, r) { const sc = stockCol(t); if (!sc) return ""; const v = r[sc.id]; if (v === "" || v == null) return ""; const rc = reorderCol(t), lim = rc && r[rc.id] !== "" ? +r[rc.id] : 3; return v <= 0 ? "out" : v <= lim ? "low" : "ok"; }
    function cellHtml(c, v, t, r) {
      if (RO && t && c === stockCol(t)) { const lv = stockLevel(t, r); return '<span class="db-stock db-' + lv + '"><b>' + (v === "" || v == null ? "—" : Number(v).toLocaleString("en-IN")) + "</b></span>"; }
      if (RO && t && c === statusCol(t)) return v ? '<span class="db-pill">' + esc(v) + "</span>" : '<span class="db-no">—</span>';
      if (t && c === stockCol(t)) { const lv = stockLevel(t, r); return '<span class="db-stock db-' + lv + '"><button type="button" data-stop data-adj="-1" aria-label="One less">−</button><b>' + (v === "" || v == null ? "—" : Number(v).toLocaleString("en-IN")) + '</b><button type="button" data-stop data-adj="1" aria-label="One more">+</button></span>'; }
      if (t && c === statusCol(t)) return '<select class="db-st" data-stop data-status data-v="' + esc(String(v || "").toLowerCase()) + '" aria-label="' + esc(c.name) + '"><option value="">—</option>' + (c.options || []).map(x => "<option" + (x === v ? " selected" : "") + ">" + esc(x) + "</option>").join("") + "</select>";
      if (c.type === "yesno") return v ? '<span class="db-yes">Yes</span>' : '<span class="db-no">No</span>';
      if (v === "" || v == null) return '<span class="db-no">—</span>';
      if (c.type === "choice") return '<span class="db-pill">' + esc(v) + "</span>";
      if (c.type === "phone") return '<a href="tel:' + esc(String(v).replace(/[^\d+]/g, "")) + '" data-stop>' + esc(v) + "</a>";
      if (c.type === "email") return '<a href="mailto:' + esc(v) + '" data-stop>' + esc(v) + "</a>";
      if (c.type === "link") { const u = /^https?:\/\//i.test(v) ? v : "https://" + v; return '<a href="' + esc(u) + '" target="_blank" rel="noopener" data-stop>' + esc(String(v).replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)) + "</a>"; }
      return esc(cellText(c, v));
    }

    async function load(tableId, quiet, live) {
      if (!quiet) { S.loading = true; draw(); }
      try {
        const before = new Set(S.rows.map(r => r._id)), counts = {}; S.tables.forEach(t => counts[t.id] = t.count);
        const j = await call("db_get", { tableId: tableId || S.tableId || undefined });
        S.tables = j.tables || []; S.tableId = j.tableId || ""; S.rows = j.rows || []; S.sheetUrl = j.sheetUrl || "";
        if (live) {                                  // what changed since the last look
          const added = S.rows.filter(r => !before.has(r._id));
          added.forEach(r => S.fresh.add(r._id));
          setTimeout(() => { added.forEach(r => S.fresh.delete(r._id)); }, 3500);
          S.tables.forEach(t => { if (t.id !== S.tableId && counts[t.id] !== undefined && t.count > counts[t.id]) S.unseen[t.id] = (S.unseen[t.id] || 0) + t.count - counts[t.id]; });
          const t = table(), other = S.tables.filter(x => S.unseen[x.id] && counts[x.id] !== undefined && x.count > counts[x.id]);
          if (added.length) toast(added.length === 1 ? "New " + singular(t.name).toLowerCase() + " just came in" : added.length + " new " + t.name.toLowerCase() + " just came in");
          else if (other.length) toast("New in " + other.map(x => x.name).join(", "));
          [...S.sel].forEach(id => { if (!S.rows.some(r => r._id === id)) S.sel.delete(id); });
        } else { S.sel.clear(); S.shown = PAGE; if (tableId !== undefined) { S.q = ""; S.sort = null; S.onlyLow = false; } }
        delete S.unseen[S.tableId];
      } catch (x) { if (!live) toast(x.message); }
      S.loading = false;
      if (live) { const q = root.querySelector("#dbq"), had = q && document.activeElement === q, pos = had ? q.selectionStart : 0, sc = root.querySelector(".db-scroll"), top = sc ? sc.scrollTop : 0;
        draw(); const sc2 = root.querySelector(".db-scroll"); if (sc2) sc2.scrollTop = top; if (had) { const n = root.querySelector("#dbq"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } }
      else draw();
    }
    /* live: a cheap revision check every few seconds; the table reloads only when something changed */
    let near = true, polling = false;
    if ("IntersectionObserver" in window) new IntersectionObserver(es => { near = es.some(e => e.isIntersecting); }, { rootMargin: "1200px 0px" }).observe(root);
    async function poll() {
      if (polling || document.hidden || !near || document.getElementById("dbModal") || !S.tables.length && S.loading) return;
      polling = true;
      try { const j = await call("db_rev", {}); if (S.rev && j.rev !== S.rev) await load(S.tableId, true, true); S.rev = j.rev; } catch (e) {}
      polling = false;
    }
    const timer = setInterval(poll, o.demo ? 6000 : 8000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

    function summary(t) {
      const sc = stockCol(t); if (!sc || !S.rows.length) return "";
      let low = 0, out = 0, units = 0; S.rows.forEach(r => { const lv = stockLevel(t, r); if (lv === "low") low++; if (lv === "out") out++; units += Math.max(0, +r[sc.id] || 0); });
      return '<div class="db-sum"><button type="button" class="' + (S.onlyLow ? "" : "on") + '" data-low="0"><b>' + S.rows.length + "</b> items · <b>" + units.toLocaleString("en-IN") + "</b> pieces</button>" +
        '<button type="button" class="warn' + (S.onlyLow ? " on" : "") + '" data-low="1"><b>' + low + "</b> running low · <b style=\"color:var(--rose)\">" + out + "</b> out of stock</button></div>";
    }
    function moneyTotal(t, rows) {
      const m = t.cols.find(c => c.type === "money" && /total|amount/i.test(c.name)) || (t.cols.filter(c => c.type === "money").length === 1 ? t.cols.find(c => c.type === "money") : null);
      if (!m || stockCol(t)) return "";
      const st = statusCol(t), sum = rows.reduce((s, r) => s + (st && /cancel/i.test(r[st.id] || "") ? 0 : (+r[m.id] || 0)), 0);
      return sum ? '<span style="margin-left:14px">' + esc(m.name) + ': <b style="color:var(--ink)">' + inr(sum) + "</b></span>" : "";
    }
    function visibleRows() {
      const t = table(); if (!t) return [];
      let rows = S.rows;
      if (S.onlyLow && stockCol(t)) rows = rows.filter(r => { const lv = stockLevel(t, r); return lv === "low" || lv === "out"; });
      const q = S.q.trim().toLowerCase();
      if (q) rows = rows.filter(r => t.cols.some(c => String(cellText(c, r[c.id])).toLowerCase().includes(q)));
      if (S.sort) {
        const c = t.cols.find(c => c.id === S.sort.id), dir = S.sort.dir;
        if (c) rows = rows.slice().sort((a, b) => {
          let x = a[c.id], y = b[c.id];
          if (x === "" || x == null) return 1; if (y === "" || y == null) return -1;
          if (c.type === "number" || c.type === "money") return (x - y) * dir;
          if (c.type === "yesno") return ((x ? 1 : 0) - (y ? 1 : 0)) * dir;
          return String(x).localeCompare(String(y), "en", { numeric: true }) * dir;
        });
      } else rows = rows.slice().reverse();                      // newest first
      return rows;
    }

    function draw() {
      if (S.loading && !S.tables.length) { root.innerHTML = '<div class="db-skel"></div>'; return; }
      if (!S.tables.length) return drawStart();
      const t = table(), rows = visibleRows(), page = rows.slice(0, S.shown);
      const num = c => c.type === "number" || c.type === "money";
      root.innerHTML = '<div class="db-shell">' +
        '<div class="db-tabs" role="tablist">' + S.tables.map(x => '<button class="db-tab' + (x.id === S.tableId ? " on" : "") + '" data-t="' + esc(x.id) + '" role="tab">' + esc(x.name) + " <small>" + (x.id === S.tableId ? S.rows.length : x.count) + "</small>" + (S.unseen[x.id] ? '<span class="dot" title="New rows"></span>' : "") + "</button>").join("") +
          (RO ? "" : '<button class="db-tab new" data-newtable>' + svg("plus", 15) + "New table</button>") + "</div>" +
        (RO ? '<div class="db-intro">' + svg("db", 18) + "<span><b>View-only.</b> You can search, sort and download everything here. Changes are switched off — message make4yu if something needs updating.</span></div>" : "") + summary(t) +
        (S.sel.size ? '<div class="db-sel">' + S.sel.size + " selected<span class=\"sp\"></span><button class=\"btn ghost sm db-danger\" data-delsel>" + svg("trash", 15) + "Delete</button><button class=\"btn ghost sm\" data-clearsel>Cancel</button></div>" :
        '<div class="db-bar"><label class="db-search">' + svg("search") + '<input type="search" id="dbq" placeholder="Search ' + esc(t.name.toLowerCase()) + '…" value="' + esc(S.q) + '" aria-label="Search"></label>' +
          (RO ? "" : '<button class="btn sm" data-addrow>' + svg("plus", 15) + "Add " + esc(singular(t.name)) + "</button>" +
          '<button class="db-ib" data-editcols title="Edit columns" aria-label="Edit columns">' + svg("cols") + "</button>") +
          '<button class="db-ib" data-csv title="Download as CSV (opens in Excel)" aria-label="Download CSV">' + svg("dl") + "</button>" +
          (S.sheetUrl ? '<a class="db-ib" href="' + esc(S.sheetUrl) + '" target="_blank" rel="noopener" title="Open in Google Sheets (only you see this)" aria-label="Open in Google Sheets">' + svg("sheet") + "</a>" : "") +
          (RO ? "" : '<button class="db-ib danger" data-deltable title="Delete this table" aria-label="Delete table">' + svg("trash") + "</button>") + "</div>") +
        '<div class="card db-card">' + (S.rows.length ?
          '<div class="db-scroll"><table class="db-table"><thead><tr>' + (RO ? "" : '<th class="ck db-ck"><input type="checkbox" data-all aria-label="Select all"' + (page.length && page.every(r => S.sel.has(r._id)) ? " checked" : "") + "></th>") +
            t.cols.map(c => '<th data-sort="' + esc(c.id) + '" class="' + (num(c) ? "num" : "") + '">' + esc(c.name) + (S.sort && S.sort.id === c.id ? '<span class="ar">' + (S.sort.dir > 0 ? "↑" : "↓") + "</span>" : "") + "</th>").join("") + "</tr></thead><tbody>" +
            (page.length ? page.map(r => '<tr data-r="' + esc(r._id) + '" class="' + (S.sel.has(r._id) ? "sel" : "") + (S.fresh.has(r._id) ? " fresh" : "") + '">' + (RO ? "" : '<td class="ck db-ck"><input type="checkbox" data-pick' + (S.sel.has(r._id) ? " checked" : "") + ' aria-label="Select row"></td>') +
              t.cols.map(c => '<td class="' + (num(c) ? "num" : "") + '" title="' + esc(cellText(c, r[c.id])) + '">' + cellHtml(c, r[c.id], t, r) + "</td>").join("") + "</tr>").join("")
              : '<tr><td colspan="' + (t.cols.length + (RO ? 0 : 1)) + '" class="muted" style="text-align:center;padding:36px">Nothing matches “' + esc(S.q) + "”.</td></tr>") +
          "</tbody></table></div>" +
          '<div class="db-foot"><span>' + (S.q || S.onlyLow ? rows.length + " of " + S.rows.length : S.rows.length) + " " + (S.rows.length === 1 ? "row" : "rows") + "</span>" + moneyTotal(t, rows) + '<span class="sp"></span><span class="db-live" title="New rows from your website appear here by themselves"><i></i>Live</span>' +
            (rows.length > S.shown ? '<button class="btn ghost sm" data-more>Show ' + Math.min(PAGE, rows.length - S.shown) + " more</button>" : "") + "</div>"
          : '<div class="db-none"><b>No ' + esc(t.name.toLowerCase()) + " yet.</b>" + (RO ? "New rows from your website still appear here." : "Add your first one — it's saved straight away.<div style=\"margin-top:16px\"><button class=\"btn\" data-addrow>" + svg("plus", 15) + "Add " + esc(singular(t.name)) + "</button></div>") + "</div>") +
        "</div></div>";
      wire();
    }

    function drawStart() {
      if (RO) { root.innerHTML = '<div class="card"><div class="empty" style="margin:0">Nothing saved yet. Orders and forms from your website appear here by themselves.</div></div>'; return; }
      root.innerHTML = '<div class="db-intro">' + svg("db", 20) + "<span>Pick a starting point — you can rename, add or remove columns any time.</span></div>" +
        '<div class="db-tpls">' + TEMPLATES.map((t, i) => '<button class="card db-tpl" data-tpl="' + i + '"><span class="ico">' + svg(t.icon, 20) + "</span><b>" + esc(t.name) + "</b><p>" + esc(t.blurb) + "</p><small>" + t.cols.map(c => esc(c[0])).join(" · ") + "</small></button>").join("") +
        '<button class="card db-tpl" data-tpl="blank"><span class="ico">' + svg("blank", 20) + "</span><b>Start blank</b><p>Name your own table and choose its columns.</p><small>Anything you need to keep track of</small></button></div>";
      root.querySelectorAll("[data-tpl]").forEach(b => b.onclick = () => {
        const k = b.dataset.tpl;
        if (k === "blank") return editTable(null);
        const t = TEMPLATES[+k];
        editTable({ name: t.name, cols: t.cols.map(c => ({ name: c[0], type: c[1], options: c[2] || "" })) }, true);
      });
    }

    function singular(n) { if (stockCol(table()) && /^(stock|inventory|products?)$/i.test(String(n || "").trim())) return "item"; return singular0(n); }
    function singular0(n) { n = String(n || "row").trim(); const l = n.toLowerCase(); return l.endsWith("ies") ? n.slice(0, -3) + "y" : /(ss|us)$/.test(l) ? n : l.endsWith("s") ? n.slice(0, -1) : n; }

    function wire() {
      const $ = s => root.querySelector(s), $$ = s => root.querySelectorAll(s);
      $$("[data-t]").forEach(b => b.onclick = () => { if (b.dataset.t !== S.tableId) load(b.dataset.t); });
      const nt = $("[data-newtable]"); if (nt) nt.onclick = () => chooseNew();
      $$("[data-addrow]").forEach(b => b.onclick = () => editRow(null));
      const ec = $("[data-editcols]"); if (ec) ec.onclick = () => editTable(table());
      const cs = $("[data-csv]"); if (cs) cs.onclick = csv;
      const dt = $("[data-deltable]"); if (dt) dt.onclick = delTable;
      const mo = $("[data-more]"); if (mo) mo.onclick = () => { S.shown += PAGE; draw(); };
      const q = $("#dbq"); if (q) q.oninput = () => { S.q = q.value; S.shown = PAGE; const pos = q.selectionStart; draw(); const n = root.querySelector("#dbq"); n.focus(); n.setSelectionRange(pos, pos); };
      $$("[data-sort]").forEach(th => th.onclick = () => { const id = th.dataset.sort; S.sort = !S.sort || S.sort.id !== id ? { id: id, dir: 1 } : S.sort.dir > 0 ? { id: id, dir: -1 } : null; draw(); });
      const all = $("[data-all]"); if (all) all.onclick = e => { e.stopPropagation(); const page = visibleRows().slice(0, S.shown); if (all.checked) page.forEach(r => S.sel.add(r._id)); else page.forEach(r => S.sel.delete(r._id)); draw(); };
      $$("tbody tr[data-r]").forEach(tr => tr.onclick = e => {
        if (e.target.closest("[data-stop]")) return;
        const id = tr.dataset.r;
        if (e.target.closest(".ck")) { if (e.target.matches("input")) { if (e.target.checked) S.sel.add(id); else S.sel.delete(id); } else { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); } return draw(); }
        if (RO) return viewRow(S.rows.find(r => r._id === id));
        if (S.sel.size) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); return draw(); }
        editRow(S.rows.find(r => r._id === id));
      });
      $$("[data-low]").forEach(b => b.onclick = () => { S.onlyLow = b.dataset.low === "1"; S.shown = PAGE; draw(); });
      $$("[data-adj]").forEach(b => b.onclick = e => { e.stopPropagation(); const tr = b.closest("tr"); quickSave(tr.dataset.r, row => { const sc = stockCol(table()); row[sc.id] = Math.max(-999, (+row[sc.id] || 0) + (+b.dataset.adj)); }); });
      $$("[data-status]").forEach(sel => { sel.onclick = e => e.stopPropagation(); sel.onchange = () => { const tr = sel.closest("tr"); sel.dataset.v = sel.value.toLowerCase(); quickSave(tr.dataset.r, row => { row[statusCol(table()).id] = sel.value; }, "Marked " + (sel.value || "blank")); }; });
      const ds = $("[data-delsel]"); if (ds) ds.onclick = delSelected;
      const cl = $("[data-clearsel]"); if (cl) cl.onclick = () => { S.sel.clear(); draw(); };
    }

    /* ---------- modal ---------- */
    let lastFocus = null;
    function modal(html, onReady) {
      close();
      lastFocus = document.activeElement;
      const bg = document.createElement("div"); bg.className = "db-modal-bg"; bg.id = "dbModal";
      bg.innerHTML = '<div class="db-modal" role="dialog" aria-modal="true">' + html + "</div>";
      document.body.appendChild(bg); document.documentElement.style.overflow = "hidden";
      requestAnimationFrame(() => bg.classList.add("on"));
      bg.addEventListener("mousedown", e => { if (e.target === bg) close(); });
      bg.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
      bg.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
      onReady && onReady(bg);
      const f = bg.querySelector("input:not([type=hidden]),select,textarea"); if (f) setTimeout(() => f.focus(), 60);
    }
    function close() { const bg = document.getElementById("dbModal"); if (!bg) return; bg.remove(); document.documentElement.style.overflow = ""; if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    function busy(btn, on, label) { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.l = btn.innerHTML; btn.textContent = label || "Saving…"; } else if (btn.dataset.l) btn.innerHTML = btn.dataset.l; }

    function fieldHtml(c, v) {
      const id = "dbf-" + c.id, lab = '<label for="' + id + '">' + esc(c.name) + "</label>";
      if (c.type === "longtext") return '<div class="db-field full">' + lab + '<textarea id="' + id + '" name="' + c.id + '" maxlength="2000">' + esc(v) + "</textarea></div>";
      if (c.type === "yesno") return '<div class="db-field"><label>' + esc(c.name) + '</label><div class="db-toggle" data-yn="' + c.id + '"><button type="button" data-v="1" class="' + (v ? "on" : "") + '">Yes</button><button type="button" data-v="0" class="' + (v ? "" : "on") + '">No</button></div></div>';
      if (c.type === "choice") return '<div class="db-field">' + lab + '<select id="' + id + '" name="' + c.id + '"><option value="">—</option>' + (c.options || []).map(x => '<option' + (x === v ? " selected" : "") + ">" + esc(x) + "</option>").join("") + "</select></div>";
      const t = { number: "number", money: "number", date: "date", phone: "tel", email: "email", link: "url" }[c.type] || "text";
      const extra = c.type === "money" ? ' step="0.01" min="0" inputmode="decimal" placeholder="₹"' : c.type === "number" ? ' step="any" inputmode="decimal"' : c.type === "phone" ? ' inputmode="tel" placeholder="+91"' : c.type === "link" ? ' placeholder="https://"' : "";
      return '<div class="db-field">' + lab + '<input id="' + id + '" name="' + c.id + '" type="' + t + '"' + extra + ' value="' + esc(v) + '" maxlength="300"></div>';
    }

    /* view-only: the whole row, nothing editable */
    function viewRow(row) {
      const t = table(); if (!t || !row) return;
      modal("<h2>" + esc(singular(t.name)) + '<span class="sp"></span><button class="db-ib" data-close aria-label="Close">' + svg("x") + "</button></h2>" +
        '<p class="sub">Added ' + (row._ts ? new Date(row._ts).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "") + " · view-only</p>" +
        '<div class="db-form">' + t.cols.map(c => '<div class="db-field' + (c.type === "longtext" ? " full" : "") + '"><label>' + esc(c.name) + '</label><div style="white-space:pre-wrap;padding:10px 0;font-size:15px">' + (cellText(c, row[c.id]) ? esc(cellText(c, row[c.id])) : '<span class="db-no">—</span>') + "</div></div>").join("") + "</div>" +
        '<div class="db-acts"><span class="sp"></span><button class="btn sm" data-close>Close</button></div>', bg => setTimeout(() => { const b = bg.querySelector(".db-acts [data-close]"); if (b) b.focus(); }, 60));
    }

    function editRow(row) {
      if (RO) return;
      const t = table(); if (!t) return;
      const isNew = !row; row = row || {};
      modal("<h2>" + (isNew ? "Add " + esc(singular(t.name)) : "Edit " + esc(singular(t.name))) + '<span class="sp"></span><button class="db-ib" data-close aria-label="Close">' + svg("x") + "</button></h2>" +
        '<p class="sub">' + (isNew ? "Saved to your " + esc(t.name) + " table." : "Added " + (row._ts ? new Date(row._ts).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "")) + "</p>" +
        '<form id="dbRowForm" class="db-form" novalidate>' + t.cols.map(c => fieldHtml(c, row[c.id] === undefined ? (c.type === "yesno" ? false : "") : row[c.id])).join("") + "</form>" +
        '<div class="db-acts">' + (isNew ? "" : '<button class="btn ghost sm db-danger" data-del>' + svg("trash", 15) + "Delete</button>") + '<span class="sp"></span><button class="btn ghost sm" data-close>Cancel</button><button class="btn sm" data-save>' + (isNew ? "Add" : "Save changes") + "</button></div>",
        bg => {
          const form = bg.querySelector("#dbRowForm");
          bg.querySelectorAll("[data-yn] button").forEach(b => b.onclick = () => { b.parentNode.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); });
          const save = async () => {
            const out = isNew ? {} : { _id: row._id };
            for (const c of t.cols) {
              if (c.type === "yesno") { out[c.id] = !!bg.querySelector('[data-yn="' + c.id + '"] [data-v="1"].on'); continue; }
              const el = form.elements[c.id]; let v = el ? el.value.trim() : "";
              if (v && c.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { el.focus(); return toast("Check the email in “" + c.name + "”"); }
              if (v && (c.type === "number" || c.type === "money") && isNaN(Number(v))) { el.focus(); return toast("“" + c.name + "” needs a number"); }
              out[c.id] = v;
            }
            if (!t.cols.some(c => out[c.id] !== "" && out[c.id] !== false)) return toast("Fill in at least one field");
            const btn = bg.querySelector("[data-save]"); busy(btn, true);
            try {
              const j = await call("db_save_row", { tableId: t.id, row: out });
              const i = S.rows.findIndex(r => r._id === j.row._id);
              if (i >= 0) S.rows[i] = j.row; else S.rows.push(j.row);
              close(); draw(); toast(isNew ? singular(t.name) + " added" : "Changes saved");
            } catch (x) { busy(btn, false); toast(x.message); }
          };
          bg.querySelector("[data-save]").onclick = save;
          form.onsubmit = e => { e.preventDefault(); save(); };
          form.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } });
          const del = bg.querySelector("[data-del]");
          if (del) del.onclick = async () => {
            if (!confirm("Delete this " + singular(t.name).toLowerCase() + "? This can't be undone.")) return;
            busy(del, true, "Deleting…");
            try { await call("db_delete_rows", { tableId: t.id, ids: [row._id] }); S.rows = S.rows.filter(r => r._id !== row._id); close(); draw(); toast("Deleted"); }
            catch (x) { busy(del, false); toast(x.message); }
          };
        });
    }

    /* one-tap changes (stock −/+, order status): update on screen at once, save in the background */
    const pending = {};
    function quickSave(id, change, msg) {
      if (RO) return;
      const t = table(), row = S.rows.find(r => r._id === id); if (!row) return;
      change(row); draw();
      clearTimeout(pending[id]);
      pending[id] = setTimeout(async () => {
        const out = { _id: id }; t.cols.forEach(c => out[c.id] = row[c.id]);
        try { const j = await call("db_save_row", { tableId: t.id, row: out }); Object.assign(row, j.row); S.rev = ""; if (msg) toast(msg); }
        catch (x) { toast(x.message); load(t.id, true); }
      }, 450);                                         // several taps in a row become one save
    }
    async function delSelected() { if (RO) return;
      const t = table(), ids = [...S.sel];
      if (!confirm("Delete " + ids.length + " " + (ids.length === 1 ? "row" : "rows") + " from " + t.name + "? This can't be undone.")) return;
      try {
        for (let i = 0; i < ids.length; i += 200) await call("db_delete_rows", { tableId: t.id, ids: ids.slice(i, i + 200) });
        S.rows = S.rows.filter(r => !S.sel.has(r._id)); S.sel.clear(); draw(); toast(ids.length + " deleted");
      } catch (x) { toast(x.message); load(t.id, true); }
    }

    function chooseNew() { if (RO) return;
      modal('<h2>New table<span class="sp"></span><button class="db-ib" data-close aria-label="Close">' + svg("x") + '</button></h2><p class="sub">Start from a ready-made table or a blank one.</p>' +
        '<div class="db-tpls" style="grid-template-columns:repeat(2,minmax(0,1fr))">' + TEMPLATES.map((t, i) => '<button class="card db-tpl" data-tpl="' + i + '"><span class="ico">' + svg(t.icon, 18) + "</span><b>" + esc(t.name) + "</b><small>" + t.cols.map(c => esc(c[0])).join(" · ") + "</small></button>").join("") +
        '<button class="card db-tpl" data-tpl="blank"><span class="ico">' + svg("blank", 18) + "</span><b>Start blank</b><small>Choose your own columns</small></button></div>",
        bg => bg.querySelectorAll("[data-tpl]").forEach(b => b.onclick = () => {
          const k = b.dataset.tpl; if (k === "blank") return editTable(null);
          const t = TEMPLATES[+k], have = S.tables.map(x => x.name.toLowerCase());
          let name = t.name, n = 2; while (have.indexOf(name.toLowerCase()) >= 0) name = t.name + " " + n++;
          editTable({ name: name, cols: t.cols.map(c => ({ name: c[0], type: c[1], options: c[2] || "" })) }, true);
        }));
    }

    function editTable(t, fromTemplate) { if (RO) return;
      const isNew = !t || !t.id;
      t = t || { name: "", cols: [{ name: "Name", type: "text" }, { name: "Phone", type: "phone" }, { name: "Notes", type: "longtext" }] };
      const colRow = (c, i) => '<div class="db-col" data-i="' + i + '" data-id="' + esc(c.id || "") + '">' +
        '<input aria-label="Column name" placeholder="Column name" maxlength="60" value="' + esc(c.name) + '" data-n>' +
        '<select aria-label="Type" data-ty>' + TYPES.map(x => '<option value="' + x[0] + '"' + (x[0] === c.type ? " selected" : "") + ">" + x[1] + "</option>").join("") + "</select>" +
        '<span class="mv"><button type="button" class="db-ib" data-mv="-1" aria-label="Move up">' + svg("up", 15) + '</button><button type="button" class="db-ib" data-mv="1" aria-label="Move down">' + svg("down", 15) + '</button><button type="button" class="db-ib danger" data-rm aria-label="Remove column">' + svg("x", 15) + "</button></span>" +
        '<input class="opt" placeholder="Choices, separated by commas — e.g. New, Paid, Delivered" maxlength="1200" data-op value="' + esc(Array.isArray(c.options) ? c.options.join(", ") : c.options || "") + '"' + (c.type === "choice" ? "" : " hidden") + "></div>";
      modal("<h2>" + (isNew ? "Set up your table" : "Edit table") + '<span class="sp"></span><button class="db-ib" data-close aria-label="Close">' + svg("x") + "</button></h2>" +
        '<p class="sub">' + (fromTemplate ? "Change anything you like before you start." : isNew ? "Name it and choose the columns." : "Rename, add, remove or reorder columns.") + "</p>" +
        '<div class="db-field full"><label for="dbtn">Table name</label><input id="dbtn" maxlength="60" placeholder="e.g. Customers" value="' + esc(t.name) + '"></div>' +
        '<div class="db-field full" style="margin-top:16px"><label>Columns</label><div class="db-cols" id="dbcols">' + t.cols.map(colRow).join("") + "</div>" +
        '<button type="button" class="btn ghost sm" id="dbaddcol" style="margin-top:10px;justify-self:start">' + svg("plus", 15) + "Add column</button>" +
        (isNew ? "" : '<p class="db-note">Removing a column also removes what was saved in it.</p>') + "</div>" +
        '<div class="db-acts"><span class="sp"></span><button class="btn ghost sm" data-close>Cancel</button><button class="btn sm" data-save>' + (isNew ? "Create table" : "Save") + "</button></div>",
        bg => {
          const box = bg.querySelector("#dbcols");
          const wireCols = () => box.querySelectorAll(".db-col").forEach(el => {
            el.querySelector("[data-ty]").onchange = e => { el.querySelector("[data-op]").hidden = e.target.value !== "choice"; if (e.target.value === "choice") el.querySelector("[data-op]").focus(); };
            el.querySelector("[data-rm]").onclick = () => { if (box.querySelectorAll(".db-col:not(.gone)").length < 2) return toast("A table needs at least one column"); el.classList.add("gone"); };
            el.querySelectorAll("[data-mv]").forEach(b => b.onclick = () => { const d = +b.dataset.mv, sib = d < 0 ? el.previousElementSibling : el.nextElementSibling; if (sib) d < 0 ? box.insertBefore(el, sib) : box.insertBefore(sib, el); });
          });
          wireCols();
          bg.querySelector("#dbaddcol").onclick = () => {
            if (box.querySelectorAll(".db-col:not(.gone)").length >= 30) return toast("Up to 30 columns");
            box.insertAdjacentHTML("beforeend", colRow({ name: "", type: "text" }, box.children.length)); wireCols(); box.lastElementChild.querySelector("[data-n]").focus();
          };
          bg.querySelector("[data-save]").onclick = async () => {
            const name = bg.querySelector("#dbtn").value.trim(); if (!name) { bg.querySelector("#dbtn").focus(); return toast("Give the table a name"); }
            const cols = [...box.querySelectorAll(".db-col:not(.gone)")].map(el => ({ id: el.dataset.id || undefined, name: el.querySelector("[data-n]").value.trim(), type: el.querySelector("[data-ty]").value, options: el.querySelector("[data-op]").value }))
              .filter(c => c.name || c.id);
            if (!cols.length) return toast("Add at least one column");
            if (cols.some(c => !c.name)) return toast("Every column needs a name");
            const low = cols.map(c => c.name.toLowerCase()); if (low.some((n, i) => low.indexOf(n) !== i)) return toast("Two columns have the same name");
            if (cols.some(c => c.type === "choice" && !String(c.options).trim())) return toast("Add the choices for each “Pick from a list” column");
            const dropped = isNew ? [] : t.cols.filter(o => !cols.some(c => c.id === o.id));
            if (dropped.length && S.rows.length && !confirm("Remove " + dropped.map(c => "“" + c.name + "”").join(", ") + " and what's saved in " + (dropped.length > 1 ? "them" : "it") + "?")) return;
            const btn = bg.querySelector("[data-save]"); busy(btn, true);
            try { const j = await call("db_save_table", { table: { id: isNew ? undefined : t.id, name: name, cols: cols } }); close(); toast(isNew ? "“" + j.table.name + "” is ready" : "Table updated"); await load(j.table.id, true); }
            catch (x) { busy(btn, false); toast(x.message); }
          };
        });
    }

    async function delTable() { if (RO) return;
      const t = table();
      const n = S.rows.length;
      if (!confirm("Delete the whole “" + t.name + "” table" + (n ? " and its " + n + " " + (n === 1 ? "row" : "rows") : "") + "? This can't be undone." + (n ? "\n\nTip: download it as CSV first." : ""))) return;
      try { await call("db_delete_table", { tableId: t.id }); toast("Table deleted"); await load("", true); }
      catch (x) { toast(x.message); }
    }

    function csv() {
      const t = table(), rows = visibleRows();
      const q = v => { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const lines = [["Added"].concat(t.cols.map(c => c.name)).map(q).join(",")].concat(rows.map(r => [r._ts ? new Date(r._ts).toLocaleString("en-IN") : ""].concat(t.cols.map(c => c.type === "yesno" ? (r[c.id] ? "Yes" : "No") : r[c.id])).map(q).join(",")));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      a.download = (o.business ? o.business + " - " : "") + t.name + ".csv"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    load("").then(() => call("db_rev", {}).then(j => { S.rev = j.rev; }).catch(() => {}));
    return { reload: () => load(S.tableId, true), stop: () => clearInterval(timer) };
  }

  window.NoworaDB = { mount: mount };
})();
