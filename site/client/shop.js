/* NOWORA shop — the store part of a client dashboard.
   Loaded on demand by /client/index.html (and the owner dashboard, for sales only).

   NoworaShop.mount({root, call, toast, owner, business, site, editable, html})
       Sales (from the "Orders" table in the client's database) + the product editor.
   Orders → Ship now: lists Shiprocket orders through the website's /api/store (52 Alive) and books courier,
       pickup and label. No key to paste. Read-only clients can look, not ship.
   NoworaShop.loadSales(call)          → Promise<{table, rows} | null>
   NoworaShop.summarise(orders, days)  → totals, daily series, top products, recent orders
   NoworaShop.detectColour(src)        → Promise<{name, hex, family, lab}>
   NoworaShop.readCatalogue(html)      → catalogue object or null

   Where products live: inside the client's own website, in
     <script type="application/json" id="nowora-products">{ categories: [...], products: [...] }</script>
   The site renders its shop from that block. Publishing goes through the same site_publish action as
   the website editor: new photos are committed to images/uploads/ and the page is updated, so the site
   redeploys on its own. No extra backend actions are needed. */
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inr = n => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
  const ago = t => { const s = (Date.now() - new Date(t).getTime()) / 1000; if (!(s >= -60)) return ""; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago"; if (s < 86400) return Math.floor(s / 3600) + " h ago"; const d = Math.floor(s / 86400); return d === 1 ? "yesterday" : d + " days ago"; };
  const BLOCK_RE = /<script[^>]*id=["']nowora-products["'][^>]*>([\s\S]*?)<\/script>/i;
  const MAX_NEW_PHOTOS = 30;   // site_publish takes up to 30 photos per publish

  /* ============================== colour detection ============================== */
  // Named colours shoppers recognise, each with the filter family the website groups it under.
  const PALETTE = [
    ["Black", "#1C1C1C", "Black"], ["Charcoal", "#46464A", "Grey"], ["Grey", "#8C8C8C", "Grey"], ["Grey Marl", "#A9A8A5", "Grey"], ["Light Grey", "#CACAC8", "Grey"],
    ["White", "#F5F5F3", "White"], ["Off White", "#ECE7DB", "White"], ["Cream", "#E8DCC0", "Beige"], ["Beige", "#D6C6A6", "Beige"], ["Stone Beige", "#CFC6B3", "Beige"],
    ["Oatmeal", "#C8BBA2", "Beige"], ["Sand", "#C8B288", "Beige"], ["Tan", "#B39A72", "Beige"], ["Khaki", "#9E9468", "Green"], ["Camel", "#B8875A", "Brown"],
    ["Taupe", "#7C6F62", "Brown"], ["Mocha", "#6B4F3F", "Brown"], ["Brown", "#5A3E2B", "Brown"], ["Chocolate", "#3E2A20", "Brown"], ["Rust", "#A4532E", "Orange"],
    ["Orange", "#E07B2A", "Orange"], ["Coral", "#E8735D", "Orange"], ["Mustard", "#C9A227", "Yellow"], ["Yellow", "#E8CF4A", "Yellow"], ["Red", "#B3261E", "Red"],
    ["Maroon", "#6B1F2A", "Red"], ["Wine", "#722F37", "Red"], ["Pink", "#E8A3B5", "Pink"], ["Blush Pink", "#D9AFA4", "Pink"], ["Dusty Pink", "#C49595", "Pink"],
    ["Hot Pink", "#D63A84", "Pink"], ["Lavender", "#C9BFD6", "Purple"], ["Lilac", "#B4A2CA", "Purple"], ["Purple", "#6A3F8C", "Purple"], ["Navy", "#262C40", "Blue"],
    ["Royal Blue", "#2F4FA8", "Blue"], ["Blue", "#3C6EB4", "Blue"], ["Denim Blue", "#4A6A8F", "Blue"], ["Sky Blue", "#8DB8DE", "Blue"], ["Blue Grey", "#A9B6C4", "Blue"],
    ["Teal", "#2B7A78", "Green"], ["Mint", "#A8D8C0", "Green"], ["Sage", "#9CAF88", "Green"], ["Olive", "#6B6B3A", "Green"], ["Green", "#3E7B3E", "Green"],
    ["Bottle Green", "#1F3B30", "Green"]
  ].map(([name, hex, family]) => ({ name, hex, family, lab: hexLab(hex) }));
  const FAMILIES = ["Black", "White", "Grey", "Beige", "Brown", "Red", "Pink", "Orange", "Yellow", "Green", "Blue", "Purple", "Multi", "Other"];

  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function rgbLab(r, g, b) {
    const R = lin(r), G = lin(g), B = lin(b);
    let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  function hexRgb(h) { h = String(h || "").replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hexLab(h) { const c = hexRgb(h); return rgbLab(c[0], c[1], c[2]); }
  const rgbHex = (r, g, b) => "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // for naming, lightness matters less than hue: studio light and shadows shift it a lot
  const dName = (a, b) => Math.hypot((a[0] - b[0]) * 0.55, a[1] - b[1], a[2] - b[2]);
  function nearest(lab) { let best = PALETTE[0], d = 1e9; PALETTE.forEach(p => { const x = dName(lab, p.lab); if (x < d) { d = x; best = p; } }); return best; }

  function loadImage(src) {
    return new Promise((res, rej) => { const im = new Image(); if (!/^data:|^blob:/.test(src)) im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => rej(new Error("Couldn't read that photo")); im.src = src; });
  }

  /**
   * Finds the garment's main colour. Product photos usually sit on a plain light background, so the
   * border is sampled first; if it is light and even, background pixels are dropped. The rest are
   * weighted toward the centre of the frame and grouped (k-means in Lab); the biggest group wins.
   */
  async function detectColour(src) {
    const im = typeof src === "string" ? await loadImage(src) : src;
    const N = 96, sc = Math.min(1, N / Math.max(im.naturalWidth || im.width, im.naturalHeight || im.height));
    const w = Math.max(8, Math.round((im.naturalWidth || im.width) * sc)), h = Math.max(8, Math.round((im.naturalHeight || im.height) * sc));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(im, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    const px = [], border = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (d[i + 3] < 128) continue;
      const lab = rgbLab(d[i], d[i + 1], d[i + 2]), dx = x / w - 0.5, dy = y / h - 0.5;
      const p = { lab, rgb: [d[i], d[i + 1], d[i + 2]], w: Math.exp(-(dx * dx + dy * dy) / (2 * 0.3 * 0.3)) };
      px.push(p);
      if (x < w * 0.05 || x > w * 0.95 || y < h * 0.05 || y > h * 0.95) border.push(lab);
    }
    if (!px.length) throw new Error("That photo is empty");
    const med = a => { const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)] || 0; };
    const bL = med(border.map(l => l[0])), bA = med(border.map(l => l[1])), bB = med(border.map(l => l[2]));
    const sdL = Math.sqrt(border.reduce((s, l) => s + (l[0] - bL) * (l[0] - bL), 0) / Math.max(1, border.length));
    const bg = [bL, bA, bB], plainBg = bL > 78 && Math.hypot(bA, bB) < 14 && sdL < 12;
    let use = px;
    if (plainBg) {
      const fg = px.filter(p => dE(p.lab, bg) > 11);
      const share = fg.reduce((s, p) => s + p.w, 0) / px.reduce((s, p) => s + p.w, 0);
      if (share < 0.06) { const n = nearest(bg); return { name: n.family === "White" ? n.name : "White", hex: rgbHex.apply(null, labRgbApprox(bg)), family: "White", lab: bg }; }
      use = fg;
    }
    // k-means with lightness-quantile starts (deterministic)
    const sorted = use.slice().sort((a, b) => a.lab[0] - b.lab[0]);
    const k = Math.min(4, sorted.length);
    let cent = Array.from({ length: k }, (_, i) => sorted[Math.floor((i + 0.5) / k * sorted.length)].lab.slice());
    let groups = [];
    for (let it = 0; it < 10; it++) {
      groups = cent.map(() => ({ w: 0, l: [0, 0, 0], c: [0, 0, 0] }));
      use.forEach(p => { let bi = 0, bd = 1e9; cent.forEach((c, j) => { const x = dName(p.lab, c); if (x < bd) { bd = x; bi = j; } }); const g = groups[bi]; p.g = bi;
        g.w += p.w; for (let z = 0; z < 3; z++) { g.l[z] += p.lab[z] * p.w; g.c[z] += p.rgb[z] * p.w; } });
      cent = groups.map((g, j) => g.w ? g.l.map(v => v / g.w) : cent[j]);
    }
    const ti = groups.map((g, j) => j).filter(j => groups[j].w > 0).sort((a, b) => groups[b].w - groups[a].w)[0];
    // Folds and shadows darken a garment; the colour people name is the lit fabric. So take the group's
    // 65th-percentile lightness, and its hue from the brighter half of its pixels.
    const mem = use.filter(p => p.g === ti).sort((a, b) => a.lab[0] - b.lab[0]);
    const lit = mem.slice(Math.floor(mem.length / 2));
    const wsum = lit.reduce((t, p) => t + p.w, 0) || 1;
    const L = mem[Math.floor(mem.length * 0.65)].lab[0];
    const A = lit.reduce((t, p) => t + p.lab[1] * p.w, 0) / wsum, B = lit.reduce((t, p) => t + p.lab[2] * p.w, 0) / wsum;
    const rgb = lit.reduce((t, p) => [t[0] + p.rgb[0] * p.w, t[1] + p.rgb[1] * p.w, t[2] + p.rgb[2] * p.w], [0, 0, 0]).map(v => v / wsum);
    const lab = [L, A, B];
    // cameras wash colour out; name it with the chroma boosted a little. Very dark and grey reads as black.
    const n = L < 21 && Math.hypot(A, B) < 5 ? PALETTE[0] : nearest([L, A * 1.5, B * 1.5]);
    return { name: n.name, hex: rgbHex(rgb[0], rgb[1], rgb[2]), family: n.family, lab: lab };
  }
  function labRgbApprox(lab) {   // only used for the white-on-white case
    const v = Math.max(0, Math.min(255, Math.round(lab[0] * 2.55))); return [v, v, v];
  }

  /* ============================== categories ============================== */
  // Order matters: "puffer jacket" is a puffer, "sweatshirt" is not a shirt.
  const CAT_RULES = [
    ["hoodies", "Hoodies", /\bhood(ie|y|ies|ed sweat)?s?\b|sweat ?shirt/, null],
    ["puffers", "Puffers", /puffer|quilt|padded|down jacket/, "jackets"],
    ["jackets", "Jackets", /jacket|windbreaker|wind ?cheater|bomber|blazer|coat|shacket|gilet|track ?top|parka/, null],
    ["knits", "Knits & sweats", /sweater|jumper|knit|cardigan|pull ?over|crew ?neck|quarter.?zip|half.?zip|\bvest\b/, null],
    ["tshirts", "T-shirts", /t-? ?shirt|\btees?\b|\bpolo\b|tank top|\btank\b/, null],
    ["shirts", "Shirts", /\bshirts?\b|overshirt/, null],
    ["bottoms", "Bottoms", /pant|trouser|jogger|jean|shorts?\b|cargo|chino|legging|skirt|bottoms?\b/, null],
    ["dresses", "Dresses", /dress|gown|kurta|saree|sari|lehenga|co-?ord/, null],
    ["footwear", "Footwear", /shoe|sneaker|boot|slide|sandal|slipper|loafer/, null],
    ["accessories", "Accessories", /\bcap\b|\bhat\b|beanie|\bbag\b|belt|sock|scarf|glove|wallet|muffler/, null]
  ];
  const slug = t => String(t || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const singular = w => w.replace(/(ies)$/, "y").replace(/(s)$/, "");
  /** Picks a category for a product name. Known kinds of clothing are checked most-specific first
   *  ("hooded puffer jacket" is a puffer); the site's own category is used when it has one. */
  function guessCategory(name, cats) {
    const n = " " + String(name || "").toLowerCase() + " ";
    if (!n.trim()) return null;
    const own = () => {
      for (const c of cats) {
        const words = String(c.name).toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2 && w !== "and");
        if (words.some(w => n.indexOf(w) >= 0 || n.indexOf(singular(w)) >= 0)) return { id: c.id, name: c.name, isNew: false };
      }
      return null;
    };
    for (const r of CAT_RULES) {
      if (!r[2].test(n)) continue;
      const have = cats.find(c => c.id === r[0] || String(c.name).toLowerCase() === r[1].toLowerCase()) || (r[3] && cats.find(c => c.id === r[3]));
      return have ? { id: have.id, name: have.name, isNew: false } : own() || { id: r[0], name: r[1], isNew: true };
    }
    return own();
  }
  const WEIGHT = { hoodies: 0.6, jackets: 0.6, puffers: 0.45, knits: 0.5, tshirts: 0.25, shirts: 0.3, bottoms: 0.5, dresses: 0.4, footwear: 0.9, accessories: 0.2 };

  /* ============================== catalogue in the page ============================== */
  function readCatalogue(html) {
    const m = BLOCK_RE.exec(String(html || "")); if (!m) return null;
    try { const d = JSON.parse(m[1]); d.categories = Array.isArray(d.categories) ? d.categories : []; d.products = Array.isArray(d.products) ? d.products : []; return d; }
    catch (e) { return null; }
  }
  function writeCatalogue(html, data) {
    const json = JSON.stringify(data, null, 1).replace(/<\//g, "<\\/");
    if (!BLOCK_RE.test(html)) throw new Error("Your website isn't set up for the product editor yet — ask NOWORA to switch it on.");
    return html.replace(BLOCK_RE, () => '<script type="application/json" id="nowora-products">\n' + json + "\n</script>");
  }

  /* ============================== stock ============================== */
  // Per colour: stock = { size: count }. No stock object = not tracked (always on the website).
  // On the website a size at 0 disappears, a colour with nothing left disappears, and so does a product.
  // Website orders take stock off when Shiprocket dispatches them (52 Alive: /api/courier-updates).
  const tracked = p => (p.colours || []).some(c => c.stock && typeof c.stock === "object");
  const stockOf = (p, c) => !c.stock ? null : (p.sizes || []).reduce((t, z) => t + Math.max(0, Number(c.stock[z]) || 0), 0);
  const productLeft = p => tracked(p) ? (p.colours || []).reduce((t, c) => t + (stockOf(p, c) || 0), 0) : null;

  /* ============================== sales (Orders table) ============================== */
  async function loadSales(call) {
    const first = await call("db_get", { tableId: "" });
    const t = (first.tables || []).find(x => /^(orders?|website orders|checkout)$/i.test(String(x.name).trim()));
    if (!t) return null;
    const j = t.id === first.tableId ? first : await call("db_get", { tableId: t.id });
    const table = (j.tables || []).find(x => x.id === t.id) || t;
    return { table: table, rows: j.rows || [] };
  }
  const STATUS = s => { s = String(s || "").toLowerCase(); if (/cancel|refund|return|reject|fail/.test(s)) return "cancelled"; if (/confirm|paid|pack|ship|deliver|complete|dispatch/.test(s)) return "confirmed"; return "waiting"; };
  function summarise(orders, days) {
    if (!orders) return null;
    const cols = orders.table.cols || [], col = re => cols.find(c => re.test(c.name));
    const cTotal = cols.find(c => c.type === "money" && /^total$/i.test(c.name)) || cols.find(c => c.type === "money" && /total|amount/i.test(c.name)) || col(/^total$/i);
    const cStatus = col(/^status$/i), cItems = col(/^items$/i), cName = col(/^(name|customer|full name)$/i), cId = col(/order (id|no)/i);
    const since = days ? Date.now() - days * 864e5 : 0;
    const rows = orders.rows.map(r => ({ ts: r._ts, t: new Date(r._ts).getTime(), total: Number(cTotal ? r[cTotal.id] : 0) || 0, status: cStatus ? String(r[cStatus.id] || "New") : "New",
      items: cItems ? String(r[cItems.id] || "") : "", name: cName ? String(r[cName.id] || "") : "", ref: cId ? String(r[cId.id] || "") : "" }))
      .filter(r => !isNaN(r.t)).sort((a, b) => a.t - b.t);
    const inRange = rows.filter(r => r.t >= since);
    const out = { confirmed: 0, waiting: 0, cancelled: 0, nConfirmed: 0, nWaiting: 0, nCancelled: 0, orders: 0, last: rows.length ? rows[rows.length - 1].ts : "" };
    inRange.forEach(r => { const k = STATUS(r.status); out[k] += r.total; out["n" + k[0].toUpperCase() + k.slice(1)]++; if (k !== "cancelled") out.orders++; });
    out.sales = out.confirmed + out.waiting;
    out.avg = out.orders ? out.sales / out.orders : 0;
    // daily (or monthly for "all time") confirmed + waiting
    const series = [];
    if (days) {
      for (let i = days - 1; i >= 0; i--) { const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - i); series.push({ label: d0.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), from: d0.getTime(), to: d0.getTime() + 864e5, c: 0, w: 0 }); }
    } else if (rows.length) {
      const d0 = new Date(rows[0].t); d0.setDate(1); d0.setHours(0, 0, 0, 0);
      for (const m = new Date(d0); m <= new Date(); m.setMonth(m.getMonth() + 1)) { const to = new Date(m); to.setMonth(to.getMonth() + 1); series.push({ label: m.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), from: m.getTime(), to: to.getTime(), c: 0, w: 0 }); }
    }
    inRange.forEach(r => { const k = STATUS(r.status); if (k === "cancelled") return; const b = series.find(s => r.t >= s.from && r.t < s.to); if (b) b[k === "confirmed" ? "c" : "w"] += r.total; });
    out.series = series;
    // best sellers from the Items text: "2 × Name · Colour · Size — ₹2,598"
    const top = {};
    inRange.filter(r => STATUS(r.status) !== "cancelled").forEach(r => r.items.split(/\n+/).forEach(line => {
      const m = /^\s*(\d+)\s*[×x]\s*(.+?)(?:\s+·\s+.*?)?(?:\s+—\s+₹([\d,]+))?\s*$/.exec(line); if (!m) return;
      const name = m[2].trim(), t = top[name] || (top[name] = { name: name, qty: 0, revenue: 0 });
      t.qty += +m[1]; t.revenue += m[3] ? +m[3].replace(/,/g, "") : 0;
    }));
    out.top = Object.values(top).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 5);
    out.recent = rows.slice(-6).reverse();
    out.count = rows.length;
    return out;
  }

  /* ============================== photos ============================== */
  function compress(file, max) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error("Choose a photo (JPG, PNG or WebP)"));
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { const s = Math.min(1, (max || 1400) / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.84)); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Couldn't read " + (file.name || "that photo"))); };
      im.src = url;
    });
  }

  /* ============================== UI ============================== */
  const IC = {
    truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>', dl: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>', check: '<path d="m5 12 5 5L20 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>', eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    off: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.1 6.1C3.6 7.8 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>', wand: '<path d="m15 4 5 5L9 20H4v-5z"/><path d="M13 6l5 5"/>', ext: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'
  };
  const ic = (n, s) => '<svg width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[n] + "</svg>";

  const CSS = `
.sh{display:grid;gap:16px}
.sh-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.sh-kpi .l{font-size:13px;color:var(--ink-2);font-weight:600}
.sh-kpi .v{font-family:var(--display);font-size:clamp(28px,3vw,40px);font-weight:700;letter-spacing:-.03em;line-height:1.05;margin-top:6px}
.sh-kpi .s{font-size:12.5px;color:var(--ink-3);margin-top:4px}
.sh-kpi.hero .v{color:var(--neon);text-shadow:0 0 30px rgba(var(--neon-rgb),.35)}
.sh-row{display:grid;grid-template-columns:1.5fr 1fr;gap:16px}
.sh h2{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;margin-bottom:14px}
.sh h2 .sp{flex:1}
.sh-bars{display:flex;align-items:flex-end;gap:3px;height:150px;padding-top:8px}
.sh-bars .b{flex:1;min-width:2px;display:flex;flex-direction:column-reverse;border-radius:4px 4px 0 0;overflow:hidden;background:rgba(255,255,255,.03);position:relative;height:100%}
.sh-bars .b i{display:block;width:100%}
.sh-bars .b i.c{background:var(--neon)} .sh-bars .b i.w{background:rgba(var(--neon-rgb),.35)}
.sh-bars .b:hover::after{content:attr(data-t);position:absolute;bottom:calc(100% - 22px);left:50%;transform:translateX(-50%);white-space:nowrap;background:#000;border:1px solid var(--line-2);border-radius:8px;padding:3px 8px;font-size:11.5px;z-index:2}
.sh-axis{display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink-3);margin-top:6px}
.sh-leg{display:flex;gap:14px;font-size:12px;color:var(--ink-2)} .sh-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.sh-list{display:grid;gap:2px}
.sh-li{display:grid;grid-template-columns:1fr auto;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px;align-items:center}
.sh-li:last-child{border-bottom:0}
.sh-li small{display:block;color:var(--ink-3);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46ch}
.sh-st{font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.06);color:var(--ink-2)}
.sh-st.confirmed{background:rgba(var(--neon-rgb),.14);color:var(--neon)} .sh-st.cancelled{background:rgba(255,92,122,.12);color:var(--rose)} .sh-st.waiting{background:rgba(255,181,71,.12);color:var(--amber)}
.sh-empty{padding:26px 10px;text-align:center;color:var(--ink-2);font-size:14.5px}
.sh-hint{font-size:12.5px;color:var(--ink-3);margin-top:10px}
.sh-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.sh-bar .sp{flex:1}
.sh-cats{display:flex;gap:8px;flex-wrap:wrap}
.sh-cats button{height:34px;padding:0 13px;border-radius:999px;border:1px solid var(--line-2);font-size:13px;font-weight:600;color:var(--ink-2);background:rgba(255,255,255,.03)}
.sh-cats button.on{background:var(--neon);border-color:var(--neon);color:#0A0F0D}
.sh-dirty{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--amber)}
.sh-dirty i{width:8px;height:8px;border-radius:50%;background:var(--amber);box-shadow:0 0 10px var(--amber)}
.sh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}
.sh-card{text-align:left;border-radius:16px;overflow:hidden;background:rgba(255,255,255,.03);border:1px solid var(--line);transition:border-color .25s,transform .35s var(--ease);display:flex;flex-direction:column}
.sh-card:hover{border-color:rgba(var(--neon-rgb),.5);transform:translateY(-2px)}
.sh-card .im{position:relative;aspect-ratio:4/5;background:#fff;overflow:hidden}
.sh-card .im img{width:100%;height:100%;object-fit:cover}
.sh-card .bd{padding:11px 12px 13px;display:grid;gap:3px}
.sh-card b{font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-card .meta{font-size:12.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-card .pr{font-weight:700;font-size:14.5px}
.sh-dots{display:flex;gap:5px;margin-top:4px}.sh-dots i{width:13px;height:13px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
.sh-tag{position:absolute;left:8px;top:8px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:4px 8px;border-radius:999px;background:rgba(10,15,13,.82);color:var(--ink)}
.sh-tag.new{background:var(--amber);color:#0A0F0D}
.sh-add{display:grid;place-items:center;gap:8px;min-height:260px;border:1.5px dashed var(--line-2);border-radius:16px;color:var(--ink-2);font-weight:700;font-size:14px;background:transparent}
.sh-add:hover{border-color:var(--neon);color:var(--neon)}
.sh-add svg{width:28px;height:28px}
/* product sheet */
.sh-modal{position:fixed;inset:0;z-index:200;background:rgba(3,6,5,.72);backdrop-filter:blur(8px);display:grid;place-items:center;padding:16px;opacity:0;transition:opacity .25s}
.sh-modal.on{opacity:1}
.sh-sheet{width:min(980px,100%);max-height:calc(100svh - 32px);overflow:auto;background:var(--panel,#0E1613);border:1px solid var(--line-2);border-radius:22px;box-shadow:0 40px 120px -20px #000;transform:translateY(14px);transition:transform .35s var(--ease)}
.sh-modal.on .sh-sheet{transform:none}
.sh-sh{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:16px 20px;background:var(--panel,#0E1613);border-bottom:1px solid var(--line)}
.sh-sh h3{font-family:var(--display);font-size:22px;letter-spacing:-.02em}
.sh-sh .sp{flex:1}
.sh-x{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--line-2)}
.sh-body{display:grid;grid-template-columns:1.1fr 1fr;gap:22px;padding:20px}
.sh-f{display:grid;gap:6px;margin-bottom:16px}
.sh-f>label,.sh-f>.lbl{font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2);display:flex;gap:8px;align-items:center}
.sh-f input[type=text],.sh-f input[type=number],.sh-f select,.sh-f textarea{height:46px;border-radius:12px;border:1px solid var(--line-2);background:rgba(255,255,255,.03);padding:0 13px;font-size:15px;color:var(--ink)}
.sh-f select option{background:#0E1613}
.sh-f textarea{height:auto;min-height:84px;padding:11px 13px;resize:vertical;line-height:1.45}
.sh-f input:focus,.sh-f select:focus,.sh-f textarea:focus{outline:none;border-color:var(--neon)}
.sh-auto{font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:none;color:var(--neon);background:rgba(var(--neon-rgb),.1);padding:2px 8px;border-radius:999px}
.sh-sizes{display:flex;flex-wrap:wrap;gap:7px}
.sh-sizes button{min-width:46px;height:38px;padding:0 10px;border-radius:10px;border:1px solid var(--line-2);font-weight:700;font-size:13.5px;color:var(--ink-2)}
.sh-sizes button.on{background:var(--neon);border-color:var(--neon);color:#0A0F0D}
.sh-sizes input{width:110px;height:38px;border-radius:10px;border:1px dashed var(--line-2);background:transparent;padding:0 10px;font-size:13.5px;color:var(--ink)}
.sh-presets{display:flex;gap:6px;flex-wrap:wrap;font-size:12px}
.sh-presets button{color:var(--ink-3);text-decoration:underline;text-underline-offset:3px}
.sh-drop{display:grid;place-items:center;gap:6px;text-align:center;padding:22px 14px;border:1.5px dashed var(--line-2);border-radius:16px;color:var(--ink-2);font-size:14px;cursor:pointer;transition:border-color .2s,background .2s}
.sh-f>label.sh-drop{display:grid;text-transform:none;letter-spacing:0;font-weight:500;font-size:14px;color:var(--ink-2)}
.sh-drop.over,.sh-drop:hover{border-color:var(--neon);background:rgba(var(--neon-rgb),.05)}
.sh-drop b{color:var(--ink);font-size:15px}
.sh-drop svg{width:26px;height:26px;color:var(--neon)}
.sh-colours{display:grid;gap:12px;margin-top:14px}
.sh-col{border:1px solid var(--line);border-radius:14px;padding:10px;background:rgba(255,255,255,.02)}
.sh-col-h{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.sh-col-h i{width:22px;height:22px;border-radius:50%;flex:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.sh-col-h input{flex:1;min-width:0;height:34px;border-radius:9px;border:1px solid var(--line-2);background:transparent;padding:0 9px;font-weight:700;color:var(--ink);font-size:14px}
.sh-col-h select{height:34px;border-radius:9px;border:1px solid var(--line-2);background:transparent;color:var(--ink-2);font-size:12.5px;padding:0 6px}
.sh-col-h select option{background:#0E1613}
.sh-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}
.sh-ph{position:relative;aspect-ratio:4/5;border-radius:10px;overflow:hidden;background:#fff;border:1px solid var(--line)}
.sh-ph img{width:100%;height:100%;object-fit:cover}
.sh-ph.main{outline:2px solid var(--neon);outline-offset:1px}
.sh-ph .acts{position:absolute;inset:auto 4px 4px 4px;display:flex;gap:4px;justify-content:flex-end}
.sh-ph .acts button,.sh-ph .acts select{height:26px;border-radius:7px;background:rgba(10,15,13,.85);color:#fff;font-size:11px;padding:0 6px;border:0}
.sh-ph .acts button{width:26px;padding:0;display:grid;place-items:center}
.sh-ph .acts select{max-width:100%;flex:1;min-width:0}
.sh-ph .acts svg{width:13px;height:13px}
.sh-ph .new{position:absolute;left:4px;top:4px;font-size:10px;font-weight:800;background:var(--amber);color:#0A0F0D;border-radius:6px;padding:2px 5px}
.sh-busy{font-size:13px;color:var(--ink-2);display:flex;align-items:center;gap:8px;margin-top:10px}
.sh-busy:empty{display:none}
.sh-spin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(var(--neon-rgb),.25);border-top-color:var(--neon);animation:shspin .8s linear infinite}
@keyframes shspin{to{transform:rotate(360deg)}}
.sh-toggle{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;cursor:pointer}
.sh-toggle input{width:18px;height:18px;accent-color:var(--neon)}
.sh-foot{position:sticky;bottom:0;display:flex;gap:10px;align-items:center;padding:14px 20px;background:var(--panel,#0E1613);border-top:1px solid var(--line)}
.sh-foot .sp{flex:1}
.sh-err{color:var(--rose);font-size:13.5px;font-weight:600}
.sh-stock{overflow-x:auto;border:1px solid var(--line);border-radius:12px}
.sh-stock table{border-collapse:collapse;width:100%;font-size:13px}
.sh-stock th,.sh-stock td{padding:6px;border-bottom:1px solid var(--line);text-align:center;white-space:nowrap}
.sh-stock tbody tr:last-child th,.sh-stock tbody tr:last-child td{border-bottom:0}
.sh-stock thead th{color:var(--ink-2);font-weight:700}
.sh-stock tbody th{text-align:left;font-weight:600;display:flex;align-items:center;gap:7px}
.sh-stock tbody th i{width:14px;height:14px;border-radius:50%;flex:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.sh-stock input{width:50px;height:34px;border-radius:8px;border:1px solid var(--line-2);background:rgba(255,255,255,.03);color:var(--ink);text-align:center;font-size:14px}
.sh-stock input:focus{outline:none;border-color:var(--neon)}
.sh-tag.out{background:var(--rose);color:#fff}
.sh-low{color:var(--amber);font-weight:700}
.sh-stocknote{font-size:13px;color:var(--ink-2);margin-left:6px}.sh-stocknote b{color:var(--rose)}
.btn.danger{background:rgba(255,92,122,.1);color:var(--rose);border:1px solid rgba(255,92,122,.35)}
/* orders → ship */
.sh-ol{display:grid}
.sh-o{display:grid;grid-template-columns:1fr auto;gap:6px 16px;padding:14px 0;border-bottom:1px solid var(--line);align-items:start}
.sh-ol .sh-o:last-child{border-bottom:0}
.sh-o-m{min-width:0;display:grid;gap:3px}
.sh-o-m b{font-size:15px}.sh-o-where{font-size:13px;color:var(--ink-2)}
.sh-o-it{font-size:13.5px;color:var(--ink)}
.sh-o-m small{font-size:12px;color:var(--ink-3)}
.sh-o-ship{font-size:12.5px;color:var(--neon);font-weight:600}
.sh-o-a{display:grid;justify-items:end;gap:6px}.sh-o-a b{font-size:16px}
.sh-o-b{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sh-o-b:empty{display:none}
.sh-o-sum{background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:16px}
.sh-keyf{display:flex;gap:8px;max-width:440px}
.sh-keyf input{flex:1;height:38px;border-radius:10px;border:1px solid var(--line-2);background:rgba(255,255,255,.03);color:var(--ink);padding:0 12px;font-size:14px}
.sh-keyf input:focus{outline:none;border-color:var(--neon)}
.sh-sheet-s{width:min(560px,100%)}
.sh-pad{padding:18px 20px}
.sh-foot{position:sticky;bottom:0;display:flex;gap:10px;align-items:center;padding:14px 20px;background:var(--panel,#0E1613);border-top:1px solid var(--line)}
.sh-cr{display:grid;gap:8px;margin-top:6px}
.sh-cr label{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--line-2);border-radius:12px;cursor:pointer}
.sh-cr label.on{border-color:var(--neon);background:rgba(var(--neon-rgb),.07)}
.sh-cr input{accent-color:var(--neon)}
.sh-cr span{display:grid;gap:2px}.sh-cr small{color:var(--ink-3);font-size:12.5px}
.sh-cr em{font-style:normal;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--neon)}
.sh-warn{color:var(--amber);font-size:13.5px;margin:10px 0}
.sh-done{display:grid;gap:12px}
.sh-done-h{display:flex;gap:12px;align-items:center;color:var(--neon)}.sh-done-h div{display:grid}.sh-done-h b{color:var(--ink);font-size:17px}.sh-done-h span{color:var(--ink-2);font-size:13.5px}
.sh-steps{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14px;color:var(--ink-2)}
.sh-acts{display:flex;gap:8px;flex-wrap:wrap}
.sh-note{margin:2px 0 6px;padding:10px 14px;border-radius:12px;background:rgba(255,181,71,.08);border:1px solid rgba(255,181,71,.25);color:var(--ink-2);font-size:13.5px}
.sh-how{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
.sh-how span{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--ink-2)}
.sh-how i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:12px;font-weight:800;background:rgba(var(--neon-rgb),.14);color:var(--neon)}
/* boot loader — shown until orders (and the courier list) have actually arrived, so nothing ever says "No orders yet" early */
.sh-boot{position:relative;overflow:hidden;display:grid;gap:18px;transition:opacity .32s var(--ease),transform .32s var(--ease),filter .32s var(--ease)}
.sh-boot.out{opacity:0;transform:translateY(-6px) scale(.985);filter:blur(4px)}
.sh-boot::before{content:"";position:absolute;inset:-40% -10% auto;height:220px;background:radial-gradient(closest-side,rgba(var(--neon-rgb),.12),transparent);animation:shglow 4s ease-in-out infinite alternate;pointer-events:none}
@keyframes shglow{from{transform:translateX(-25%)}to{transform:translateX(25%)}}
.sh-boot-h{position:relative;display:flex;align-items:center;gap:14px}
.sh-boot-h .sp{flex:1}
.sh-boot-t{display:grid;gap:3px;min-width:0}
.sh-boot-t b{font-size:16px;letter-spacing:-.01em}
.sh-boot-msg{font-size:13.5px;color:var(--ink-2);display:block;height:18px;overflow:hidden}
.sh-boot-msg span{display:block;animation:shmsg .45s var(--ease) both}
@keyframes shmsg{from{opacity:0;transform:translateY(10px);filter:blur(3px)}to{opacity:1;transform:none;filter:none}}
.sh-orb{position:relative;width:42px;height:42px;flex:none}
.sh-orb i{position:absolute;inset:0;border-radius:50%;border:2.5px solid transparent;border-top-color:var(--neon);animation:shspin 1.1s cubic-bezier(.5,.15,.5,.85) infinite}
.sh-orb i:nth-child(2){inset:6px;border-top-color:transparent;border-right-color:rgba(var(--neon-rgb),.7);animation-duration:1.6s;animation-direction:reverse}
.sh-orb i:nth-child(3){inset:13px;border:0;background:var(--neon);box-shadow:0 0 18px rgba(var(--neon-rgb),.8);animation:shpulse 1.1s ease-in-out infinite}
@keyframes shpulse{0%,100%{transform:scale(.55);opacity:.6}50%{transform:scale(1);opacity:1}}
.sh-live{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.sh-live i{width:7px;height:7px;border-radius:50%;background:var(--neon);animation:shpulse 1.1s ease-in-out infinite}
.sh-prog{position:relative;height:3px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden}
.sh-prog i{position:absolute;inset:0 auto 0 0;width:0;border-radius:3px;background:linear-gradient(90deg,rgba(var(--neon-rgb),.4),var(--neon));box-shadow:0 0 12px rgba(var(--neon-rgb),.6);transition:width .6s var(--ease)}
.sh-prog::after{content:"";position:absolute;inset:0;width:35%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);animation:shsweep 1.3s ease-in-out infinite}
@keyframes shsweep{from{transform:translateX(-100%)}to{transform:translateX(300%)}}
.sk{position:relative;overflow:hidden;background:rgba(255,255,255,.05);border-radius:8px}
.sk::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent);animation:shshimmer 1.5s ease-in-out infinite}
@keyframes shshimmer{to{transform:translateX(100%)}}
.sh-skk{display:grid;gap:10px;padding:18px}
.sh-skk .sk:nth-child(1){height:11px;width:45%}.sh-skk .sk:nth-child(2){height:30px;width:70%}.sh-skk .sk:nth-child(3){height:10px;width:55%}
.sh-skchart{display:flex;align-items:flex-end;gap:5px;height:110px;padding:0 2px}
.sh-skchart i{flex:1;height:var(--h);border-radius:5px 5px 0 0;background:linear-gradient(to top,rgba(var(--neon-rgb),.22),rgba(var(--neon-rgb),.04));transform-origin:bottom;animation:sheq 1.4s ease-in-out infinite;animation-delay:calc(var(--i) * -70ms)}
@keyframes sheq{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
.sh-skrows{display:grid;gap:12px;padding:6px 0}
.sh-skrow{display:grid;grid-template-columns:1fr 90px;gap:16px;align-items:center}
.sh-skrow div{display:grid;gap:7px}.sh-skrow .sk{height:11px}.sh-skrow div .sk:first-child{height:13px;width:40%}.sh-skrow div .sk:last-child{width:75%}.sh-skrow>.sk{height:22px}
/* reveal */
.sh-in>*,.sh-in .sh-kpis>*{animation:shrise .7s var(--ease) both}
.sh-in>.sh-kpis{animation:none}
.sh-in .sh-kpis>*:nth-child(2){animation-delay:.07s}.sh-in .sh-kpis>*:nth-child(3){animation-delay:.14s}.sh-in .sh-kpis>*:nth-child(4){animation-delay:.21s}
.sh-in .sh-row{animation-delay:.25s}.sh-in>.card:last-child{animation-delay:.32s}
.sh-in .sh-bars .b{animation:shbar .8s var(--ease) both;animation-delay:calc(.3s + var(--i,0) * 18ms)}
.sh-in .sh-o,.sh-in .sh-li{animation:shrise .55s var(--ease) both;animation-delay:calc(.15s + var(--i,0) * 50ms)}
@keyframes shrise{from{opacity:0;transform:translateY(16px);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}
@keyframes shbar{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}}
@media (prefers-reduced-motion:reduce){.sh-boot *,.sh-boot::before,.sh-in *,.sh-in>*{animation:none!important}}
@media (max-width:900px){.sh-kpis{grid-template-columns:1fr 1fr}.sh-row,.sh-body{grid-template-columns:1fr}}
`;

  function mount(o) {
    if (!document.getElementById("nw-shop-css")) { const st = document.createElement("style"); st.id = "nw-shop-css"; st.textContent = CSS; document.head.appendChild(st); }
    const root = o.root, call = o.call, toast = o.toast || (m => console.log(m));
    const S = { range: 30, orders: null, cat: "all", data: o.html ? readCatalogue(o.html) : null, dirty: 0, rev: "", base: siteBase(o.site) };
    root.innerHTML = '<div class="sh"><div id="shBoot"></div><div id="shShip"></div><div id="shSales"></div><div id="shProducts"></div></div>';
    S.booting = true;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
    function anim(el) { if (!el) return; el.classList.toggle("sh-in", !!S.anim); }
    function drawBoot() {
      const el = $("#shBoot"); if (!el) return;
      const bars = Array.from({ length: 28 }, (_, i) => '<i style="--i:' + i + ";--h:" + Math.round(35 + 55 * Math.abs(Math.sin(i * 0.55 + 0.6))) + '%"></i>').join("");
      el.innerHTML = '<div class="card sh-boot" role="status" aria-live="polite">' +
        '<div class="sh-boot-h"><span class="sh-orb"><i></i><i></i><i></i></span><div class="sh-boot-t"><b>Getting your orders ready</b><span class="sh-boot-msg" id="shBootMsg"><span>Connecting to your store…</span></span></div><span class="sp"></span><span class="sh-live"><i></i>Syncing</span></div>' +
        '<div class="sh-prog"><i id="shProg"></i></div>' +
        '<div class="sh-kpis">' + '<div class="card sh-skk"><span class="sk"></span><span class="sk"></span><span class="sk"></span></div>'.repeat(4) + "</div>" +
        '<div class="sh-skchart" aria-hidden="true">' + bars + "</div></div>";
      const msgs = ["Connecting to your store…", "Fetching your orders…", "Adding up your sales…", "Checking with the courier…", "Almost there…"];
      let k = 0;
      S.bootMsg = setInterval(() => { const m = $("#shBootMsg"); if (!m) return; k = Math.min(k + 1, msgs.length - 1); m.innerHTML = "<span>" + msgs[k] + "</span>"; if (k === msgs.length - 1) clearInterval(S.bootMsg); }, 1300);
      progress(12);
    }
    function progress(p) { const b = $("#shProg"); if (b) b.style.width = p + "%"; }
    function countUp(scope) {
      if (reduced()) return;
      scope.querySelectorAll("[data-n]").forEach(v => {
        const to = +v.dataset.n || 0, money = v.dataset.f === "inr", t0 = performance.now(), dur = 1100;
        if (!to) return;
        const step = t => { if (!v.isConnected) return; const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4), x = to * e;
          v.textContent = money ? inr(k < 1 ? Math.round(x) : to) : String(k < 1 ? Math.round(x) : to); if (k < 1) requestAnimationFrame(step); };
        v.textContent = money ? inr(0) : "0"; requestAnimationFrame(step);
      });
    }
    async function boot() {
      drawBoot();
      const t0 = Date.now();
      await refreshSales();
      progress(S.base ? 60 : 92);
      if (S.base) await Promise.race([loadShip(true), sleep(9000)]);
      progress(100);
      await sleep(Math.max(0, 650 - (Date.now() - t0)) + 260);
      clearInterval(S.bootMsg);
      const b = $("#shBoot .sh-boot"); if (b) b.classList.add("out");
      await sleep(reduced() ? 0 : 320);
      const el = $("#shBoot"); if (el) el.remove();
      S.booting = false; S.anim = !reduced();
      drawShip(); drawSales();
      countUp(root);
      S.anim = false;
      setTimeout(() => { root.querySelectorAll(".sh-in").forEach(x => x.classList.remove("sh-in")); }, 1800);
    }
    const $ = s => root.querySelector(s);

    /* ---------------- sales ---------------- */
    async function refreshSales() {
      try { S.orders = await loadSales(call); S.salesErr = ""; } catch (e) { S.orders = S.orders || null; if (!S.orders) { S.salesErr = e.message; if (!S.booting) drawSales(e.message); return; } }
      if (!S.booting) drawSales();
    }
    function drawSales(err) {
      const el = $("#shSales"); if (!el || S.booting) return;
      err = err || (!S.orders && S.salesErr);
      anim(el);
      if (err && !S.orders) { el.innerHTML = '<div class="card"><div class="sh-empty">Couldn\'t load your orders: ' + esc(err) + "</div></div>"; return; }
      if (!S.orders) {
        el.innerHTML = '<div class="card"><h2>' + ic("bag", 18) + 'Sales</h2><div class="sh-empty">No orders yet. When someone orders on your website, it shows up here.</div></div>';
        return;
      }
      const R = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "All time"]];
      const s = summarise(S.orders, S.range), max = Math.max(1, ...s.series.map(b => b.c + b.w));
      el.innerHTML =
        '<div class="sh-bar"><div class="sh-cats" id="shRange">' + R.map(r => '<button data-r="' + r[0] + '" class="' + (r[0] === S.range ? "on" : "") + '">' + r[1] + "</button>").join("") + '</div><span class="sp"></span><small style="color:var(--ink-3)">' + (s.last ? "Last order " + ago(s.last) : "") + "</small></div>" +
        '<div class="sh-kpis">' +
          '<div class="card sh-kpi hero"><div class="l">Sold</div><div class="v num" data-n="' + s.confirmed + '" data-f="inr">' + inr(s.confirmed) + '</div><div class="s">' + s.nConfirmed + " order" + (s.nConfirmed === 1 ? "" : "s") + " sent to customers</div></div>" +
          '<div class="card sh-kpi"><div class="l">New orders</div><div class="v num" data-n="' + s.waiting + '" data-f="inr">' + inr(s.waiting) + '</div><div class="s">' + s.nWaiting + " not sent yet</div></div>" +
          '<div class="card sh-kpi"><div class="l">Total orders</div><div class="v num" data-n="' + s.orders + '">' + s.orders + '</div><div class="s">' + (s.nCancelled ? s.nCancelled + " cancelled, not counted" : "none cancelled") + "</div></div>" +
          '<div class="card sh-kpi"><div class="l">Average order</div><div class="v num" data-n="' + s.avg + '" data-f="inr">' + inr(s.avg) + '</div><div class="s">per customer</div></div>' +
        "</div>" +
        '<div class="sh-row" style="margin-top:16px"><div class="card"><h2>Sales over time<span class="sp"></span><span class="sh-leg"><span><i style="background:var(--neon)"></i>Sold</span><span><i style="background:rgba(var(--neon-rgb),.35)"></i>Not sent yet</span></span></h2>' +
          (s.series.length ? '<div class="sh-bars">' + s.series.map((b, i) => '<div class="b" style="--i:' + i + '" data-t="' + esc(b.label + " · " + inr(b.c + b.w)) + '"><i class="c" style="height:' + (b.c / max * 100) + '%"></i><i class="w" style="height:' + (b.w / max * 100) + '%"></i></div>').join("") + "</div>" +
            '<div class="sh-axis"><span>' + esc(s.series[0].label) + "</span><span>" + esc(s.series[s.series.length - 1].label) + "</span></div>" : '<div class="sh-empty">No orders in this period.</div>') +
          '<p class="sh-hint">An order counts as <b>sold</b> once you send it. Cancelled orders aren\'t counted.</p></div>' +
          '<div class="card"><h2>Best sellers</h2>' + (s.top.length ? '<div class="sh-list">' + s.top.map(t => '<div class="sh-li"><span>' + esc(t.name) + "<small>" + t.qty + " sold</small></span><b class=\"num\">" + (t.revenue ? inr(t.revenue) : "") + "</b></div>").join("") + "</div>" : '<div class="sh-empty">Nothing sold in this period yet.</div>') + "</div></div>" +
        (S.ship.on ? "" : '<div class="card" style="margin-top:16px"><h2>Latest orders<span class="sp"></span><small style="color:var(--ink-3)">' + s.count + " in total</small></h2>" +
          (s.recent.length ? '<div class="sh-list">' + s.recent.map((r, i) => '<div class="sh-li" style="--i:' + i + '"><span>' + esc(r.name || "Customer") + " · " + inr(r.total) + "<small>" + esc(r.items.split("\n").join(" · ") || r.ref) + " · " + ago(r.ts) + '</small></span><span class="sh-st ' + STATUS(r.status) + '">' + esc(r.status) + "</span></div>").join("") + "</div>" : '<div class="sh-empty">No orders yet.</div>') + "</div>");
      announce();
      $("#shRange").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.range = +b.dataset.r; drawSales(); };
    }

    /* ---------------- orders → ship (Shiprocket, through the website's own /api/store) ----------------
       The website holds the Shiprocket login and lets this dashboard in (it's already behind the client's PIN).
       "Ship now" books the courier, schedules the pickup, makes the label and takes stock off. */
    const SHIP_TABS = [["new", "To send"], ["ready", "Waiting for courier"], ["transit", "On the way"], ["delivered", "Delivered"], ["cancelled", "Cancelled"]];
    const rupees = n => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
    const keyName = "nw_store_key:" + S.base;
    const getKey = () => { try { return localStorage.getItem(keyName) || S.keyMem || ""; } catch (e) { return S.keyMem || ""; } };
    const setKey = k => { S.keyMem = k; try { if (k) localStorage.setItem(keyName, k); else localStorage.removeItem(keyName); } catch (e) { /* private mode */ } };
    S.ship = { on: false, orders: null, tab: "new", err: "", busy: false };
    async function store(action, extra) {
      const r = await fetch(S.base + "api/store", { method: "POST", headers: { "Content-Type": "application/json", "x-store-key": getKey() }, body: JSON.stringify(Object.assign({ action: action }, extra || {})) });
      const d = await r.json().catch(() => null);
      if (!d) { const e = new Error("Shipping isn't set up on this website"); e.missing = true; throw e; }
      if (d.badKey) setKey("");
      if (!r.ok || d.ok === false) { const e = new Error(d.error || "Something went wrong"); e.badKey = !!d.badKey; throw e; }
      return d;
    }
    const srDate = t => { const m = /(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(String(t || "")); if (!m) { const d = new Date(t); return isNaN(d) ? null : d; }
      let h = +m[4] % 12; if (/pm/i.test(m[6] || "")) h += 12; const mo = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[2].toLowerCase()) / 3; return new Date(+m[3], mo, +m[1], h, +m[5]); };
    const when = t => { const d = srDate(t); return d ? ago(d) : esc(t); };
    const day = t => { const d = srDate(t); return d ? d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : String(t || ""); };
    // phone + database row for a website order (the website also saves each order to Database → Orders)
    function dbOrder(orderId) {
      if (!S.orders || !orderId) return null;
      const cols = S.orders.table.cols || [], cId = cols.find(c => /order (id|no)/i.test(c.name)), cPh = cols.find(c => c.type === "phone" || /phone|mobile|whatsapp/i.test(c.name));
      if (!cId) return null;
      const row = S.orders.rows.find(r => String(r[cId.id] || "").trim().toLowerCase() === orderId.toLowerCase());
      return row ? { row: row, phone: cPh ? String(row[cPh.id] || "").replace(/\D/g, "").slice(-10) : "" } : null;
    }
    const trackUrl = o => S.base + "track/?id=" + encodeURIComponent(o.orderId);
    function waLink(x, extra) {
      const d = dbOrder(x.orderId); if (!d || !/^[6-9]\d{9}$/.test(d.phone)) return "";
      const first = (x.name || "").split(" ")[0];
      const msg = "Hi " + (first || "there") + ", your " + (o.business ? o.business + " " : "") + "order " + (extra || "is on its way") + "! " + (x.courier ? "Courier: " + x.courier + (x.awb ? " (AWB " + x.awb + ")" : "") + ". " : "") + "Track it here: " + trackUrl(x);
      return "https://wa.me/91" + d.phone + "?text=" + encodeURIComponent(msg);
    }
    // keep Database → Orders in step with Shiprocket, so the sales numbers above follow the parcels
    const RANK = { new: 0, confirmed: 1, packed: 2, shipped: 3, delivered: 4 };
    async function syncDb(list) {
      if (o.readOnly || !S.orders || S.syncing) return;
      const cols = S.orders.table.cols || [], cSt = cols.find(c => /^status$/i.test(c.name)); if (!cSt) return;
      const opts = cSt.options || [], pick = v => !opts.length || opts.indexOf(v) >= 0 ? v : "";
      const jobs = [];
      list.forEach(x => {
        const want = x.stage === "delivered" ? "Delivered" : x.stage === "transit" || x.stage === "ready" ? "Shipped" : x.stage === "cancelled" ? "Cancelled" : "";
        const d = want && pick(want) && dbOrder(x.orderId); if (!d) return;
        const cur = String(d.row[cSt.id] || "New"), cr = RANK[cur.toLowerCase()];
        if (cur === want || /cancel|return|refund/i.test(cur)) return;
        if (want !== "Cancelled" && cr !== undefined && cr >= RANK[want.toLowerCase()]) return;
        if (want === "Cancelled" && /deliver/i.test(cur)) return;
        jobs.push({ row: d.row, v: want });
      });
      if (!jobs.length) return;
      S.syncing = true;
      try { for (const j of jobs.slice(0, 12)) { const row = Object.assign({}, j.row); row[cSt.id] = j.v; const r = await call("db_save_row", { tableId: S.orders.table.id, row: row }); if (r && r.row) Object.assign(j.row, r.row); } }
      catch (e) { /* next refresh tries again */ }
      finally { S.syncing = false; }
      drawSales();
    }
    async function loadShip(quiet) {
      if (!S.base) return;
      S.ship.on = true; S.ship.busy = !quiet; if (!quiet) drawShip();
      try { const d = await store("list"); S.ship.orders = d.orders; S.ship.err = ""; S.ship.at = Date.now(); syncDb(d.orders); }
      catch (e) { if (e.missing) S.ship.on = false; S.ship.err = e.message || "unavailable";
        clearTimeout(S.ship.retry); S.ship.retry = setTimeout(() => { if (root.isConnected) loadShip(true); }, 60000); }
      S.ship.busy = false; drawShip(); drawSales();
    }
    function drawShip() {
      const el = $("#shShip"); if (!el || S.booting) return;
      if (!S.ship.on) { el.innerHTML = ""; return; }
      anim(el);
      if (S.ship.err && !S.ship.orders) return drawShipOffline(el);
      const L = S.ship.orders || [], stageOf = x => x.stage === "returned" ? "cancelled" : x.stage;
      const n = k => L.filter(x => stageOf(x) === k).length;
      const list = L.filter(x => stageOf(x) === S.ship.tab);
      const row = x => {
        const items = x.items.map(i => i.qty + " × " + i.name).join(" · ");
        let act = "";
        if (x.stage === "new") act = o.readOnly ? "" : '<button class="btn sm" data-ship="' + x.id + '">' + ic("truck") + 'Send order</button><button class="btn ghost sm" data-cancel="' + x.id + '">Cancel</button>';
        else if (x.stage === "ready") act = '<button class="btn ghost sm" data-label="' + x.id + '">' + ic("dl") + "Label</button>" + (o.readOnly || x.pickup ? "" : '<button class="btn ghost sm" data-ship="' + x.id + '">Book pickup</button>') + (waLink(x) ? '<a class="btn ghost sm" target="_blank" rel="noopener" href="' + esc(waLink(x, "is packed and ready")) + '">' + ic("send") + "Tell customer</a>" : "");
        else act = '<a class="btn ghost sm" target="_blank" rel="noopener" href="' + esc(trackUrl(x)) + '">' + ic("ext") + "Track</a>" + (x.stage === "transit" && waLink(x) ? '<a class="btn ghost sm" target="_blank" rel="noopener" href="' + esc(waLink(x)) + '">' + ic("send") + "Tell customer</a>" : "");
        const ship = x.awb ? '<span class="sh-o-ship">' + esc(x.courier || "Courier") + " · AWB " + esc(x.awb) + (x.stage === "ready" && x.pickup ? " · pickup " + esc(day(x.pickup)) : "") + "</span>" : "";
        return '<div class="sh-o"><div class="sh-o-m"><b>' + esc(x.name || "Customer") + '</b><span class="sh-o-where">' + esc([x.city, x.pin].filter(Boolean).join(" ")) + "</span>" +
          '<div class="sh-o-it">' + esc(items) + "</div><small>#" + esc(x.orderId ? x.orderId.slice(0, 12) + "…" : x.id) + " · " + when(x.placed) + (x.stage !== "new" ? " · " + esc(x.label) : "") + "</small>" + ship + "</div>" +
          '<div class="sh-o-a"><b class="num">' + inr(x.total) + '</b><span class="sh-st ' + (x.payment === "COD" ? "waiting" : "confirmed") + '">' + (x.payment === "COD" ? "Cash on delivery" : "Paid") + '</span></div><div class="sh-o-b" data-for="' + x.id + '">' + act + "</div></div>";
      };
      el.innerHTML = '<div class="card"><h2>' + ic("truck", 18) + "Orders<small style=\"color:var(--ink-3);font-weight:600\">" + (n("new") ? n("new") + " waiting to be sent" : "all sent") + '</small><span class="sp"></span>' +
          '<small style="color:var(--ink-3)">' + (S.ship.busy ? '<span class="sh-live"><i></i>Syncing</span>' : S.ship.at ? "Updated " + ago(S.ship.at) : "") + '</small><button class="btn ghost sm" id="shShipR">Refresh</button></h2>' +
        '<div class="sh-bar"><div class="sh-cats" id="shShipT">' + SHIP_TABS.map(t => '<button data-t="' + t[0] + '" class="' + (t[0] === S.ship.tab ? "on" : "") + '">' + t[1] + " · " + n(t[0]) + "</button>").join("") + "</div></div>" +
        (S.ship.err ? '<p class="sh-note">Reconnecting to the courier service — these are your orders from a moment ago. It refreshes by itself.</p>' : "") + (!S.ship.orders ? '<div class="sh-skrows" role="status" aria-label="Loading your orders">' + '<div class="sh-skrow"><div><span class="sk"></span><span class="sk"></span></div><span class="sk"></span></div>'.repeat(3) + "</div>" :
          list.length ? '<div class="sh-ol">' + list.map((x, i) => row(x).replace('<div class="sh-o">', '<div class="sh-o" style="--i:' + i + '">')).join("") + "</div>" : '<div class="sh-empty">' + (S.ship.tab === "new" ? "All caught up. New orders from your website show up here." : "No orders here.") + "</div>") +
        (S.ship.tab === "new" && list.length && !o.readOnly ? '<div class="sh-how"><span><i>1</i>Tap <b>Send order</b></span><span><i>2</i>Print the label and stick it on the parcel</span><span><i>3</i>Give the parcel to the courier when they come</span></div>' : "") + "</div>";
      $("#shShipR").onclick = () => loadShip();
      $("#shShipT").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.ship.tab = b.dataset.t; drawShip(); };
      el.querySelectorAll("[data-ship]").forEach(b => b.onclick = () => shipSheet(L.find(x => String(x.id) === b.dataset.ship)));
      el.querySelectorAll("[data-cancel]").forEach(b => b.onclick = async () => {
        const x = L.find(y => String(y.id) === b.dataset.cancel); if (!x || !confirm("Cancel " + (x.name || "this") + "'s order (" + inr(x.total) + ")? This can't be undone.")) return;
        b.disabled = true; try { await store("cancel", { id: x.id }); toast("Order cancelled"); loadShip(true); } catch (e) { toast(e.message); b.disabled = false; } });
      el.querySelectorAll("[data-label]").forEach(b => b.onclick = async () => {
        b.disabled = true; b.lastChild.textContent = "Getting label…";
        try { const d = await store("label", { id: +b.dataset.label }); const box = b.parentNode;
          b.remove(); box.insertAdjacentHTML("afterbegin", (d.labelUrl ? '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(d.labelUrl) + '">' + ic("dl") + "Download label</a>" : "") + (d.invoiceUrl ? '<a class="btn ghost sm" target="_blank" rel="noopener" href="' + esc(d.invoiceUrl) + '">Invoice</a>' : "") + (!d.labelUrl ? '<span class="sh-hint" style="margin:0">' + esc(d.labelError || "Label not ready yet") + "</span>" : "")); }
        catch (e) { toast(e.message); b.disabled = false; b.lastChild.textContent = "Label"; } });
    }
    // Shiprocket can't be reached for a moment: still show the new orders from the website, and retry by itself
    function drawShipOffline(el) {
      const rows = [];
      if (S.orders) {
        const cols = S.orders.table.cols || [], c = re => cols.find(x => re.test(x.name));
        const cId = c(/order (id|no)/i), cName = c(/^(name|customer|full name)$/i), cItems = c(/^items$/i), cTot = cols.find(x => x.type === "money" && /total|amount/i.test(x.name)), cSt = c(/^status$/i), cCity = c(/^city$/i);
        S.orders.rows.filter(r => STATUS(cSt ? r[cSt.id] : "New") === "waiting").sort((a, b) => String(b._ts).localeCompare(String(a._ts))).forEach(r => rows.push({
          name: cName ? r[cName.id] : "", city: cCity ? r[cCity.id] : "", items: cItems ? String(r[cItems.id] || "").split("\n").join(" · ") : "", total: cTot ? r[cTot.id] : 0, ref: cId ? String(r[cId.id] || "") : "", ts: r._ts }));
      }
      el.innerHTML = '<div class="card"><h2>' + ic("truck", 18) + "Orders<small style=\"color:var(--ink-3);font-weight:600\">" + (rows.length ? rows.length + " waiting to be sent" : "") + '</small><span class="sp"></span><button class="btn ghost sm" id="shShipR">Try again</button></h2>' +
        '<p class="sh-note">Connecting to the courier service… Your orders are below. The <b>Send order</b> button comes back on its own in a few minutes — no need to do anything.</p>' +
        (rows.length ? '<div class="sh-ol">' + rows.map(x => '<div class="sh-o"><div class="sh-o-m"><b>' + esc(x.name || "Customer") + '</b><span class="sh-o-where">' + esc(x.city) + '</span><div class="sh-o-it">' + esc(x.items) + "</div><small>" + (x.ref ? "#" + esc(x.ref.slice(0, 12)) + "… · " : "") + ago(x.ts) + '</small></div><div class="sh-o-a"><b class="num">' + inr(x.total) + "</b></div></div>").join("") + "</div>" : '<div class="sh-empty">No new orders waiting.</div>') + "</div>";
      $("#shShipR").onclick = () => loadShip();
      if (S.ship.err) console.warn("[orders]", S.ship.err);
    }
    function shipSheet(x) {
      if (!x) return;
      const m = document.createElement("div"); m.className = "sh-modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
      document.body.appendChild(m); requestAnimationFrame(() => m.classList.add("on"));
      const close = () => { m.classList.remove("on"); setTimeout(() => m.remove(), 250); document.removeEventListener("keydown", onKey); };
      const onKey = e => { if (e.key === "Escape" && !st.busy) close(); }; document.addEventListener("keydown", onKey);
      const st = { couriers: null, err: "", pick: 0, busy: false, done: null, fail: "" };
      const head = '<div class="sh-sh"><h3>' + (x.awb ? "Book the courier pickup" : "Send this order") + '</h3><span class="sp"></span><button class="sh-x" data-x aria-label="Close">' + ic("x") + "</button></div>";
      const summary = '<div class="sh-o sh-o-sum"><div class="sh-o-m"><b>' + esc(x.name) + '</b><span class="sh-o-where">' + esc([x.city, x.state, x.pin].filter(Boolean).join(", ")) + '</span><div class="sh-o-it">' + esc(x.items.map(i => i.qty + " × " + i.name).join(" · ")) + '</div></div><div class="sh-o-a"><b class="num">' + inr(x.total) + '</b><span class="sh-st ' + (x.payment === "COD" ? "waiting" : "confirmed") + '">' + (x.payment === "COD" ? "Courier collects cash" : "Paid") + "</span></div></div>";
      function draw() {
        let body;
        if (st.done) {
          const d = st.done, wa = waLink(Object.assign({}, x, { courier: d.courier, awb: d.awb }), "is packed and on its way");
          body = '<div class="sh-done"><div class="sh-done-h">' + ic("check", 22) + "<div><b>Courier booked</b><span>" + esc(d.courier || "Courier") + " · AWB " + esc(d.awb) + "</span></div></div>" +
            (d.pickupError ? '<p class="sh-warn">' + esc(d.pickupError) + "</p>" : '<p class="sh-hint" style="margin:0">Pickup: <b>' + esc(d.pickup && d.pickup !== "already booked" ? day(d.pickup) : "booked") + "</b> — the courier comes to your pickup address.</p>") +
            '<ol class="sh-steps"><li>Download the label and print it.</li><li>Pack the order and stick the label on the parcel.</li><li>Hand it over when the pickup person comes. Tracking updates for the customer by itself.</li></ol>' +
            '<div class="sh-acts">' + (d.labelUrl ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(d.labelUrl) + '">' + ic("dl") + "Download label</a>" : '<span class="sh-warn">' + esc(d.labelError || "Label isn't ready yet — use Label on the order in a minute.") + "</span>") +
            (d.invoiceUrl ? '<a class="btn ghost" target="_blank" rel="noopener" href="' + esc(d.invoiceUrl) + '">Invoice</a>' : "") +
            (wa ? '<a class="btn ghost" target="_blank" rel="noopener" href="' + esc(wa) + '">' + ic("send") + "Send tracking on WhatsApp</a>" : "") + "</div>" +
            (d.stock ? '<p class="sh-hint">The website\'s stock for this order goes down in about a minute.</p>' : "") + "</div>";
        } else if (x.awb) {
          body = '<p class="sh-hint" style="margin:0">' + esc(x.courier || "The courier") + " is already assigned (AWB " + esc(x.awb) + "). This books the pickup and gets the label.</p>";
        } else {
          const cs = st.couriers;
          body = '<div class="sh-f"><span class="lbl">Choose a courier</span>' + (st.err ? '<p class="sh-warn">' + esc(st.err) + " You can still let Shiprocket pick one.</p>" : !cs ? '<div class="sh-busy"><span class="sh-spin"></span>Finding couriers for this PIN code…</div>' :
            '<div class="sh-cr">' + cs.map(c => '<label class="' + (st.pick === c.id ? "on" : "") + '"><input type="radio" name="cr" value="' + c.id + '"' + (st.pick === c.id ? " checked" : "") + '><span><b>' + esc(c.name) + "</b>" + (c.recommended ? '<em>Recommended</em>' : "") + "<small>" + (c.days ? c.days + " day" + (c.days == 1 ? "" : "s") : esc(c.etd)) + (c.rating ? " · rated " + c.rating.toFixed(1) : "") + '</small></span><b class="num">' + rupees(c.rate) + "</b></label>").join("") + "</div>") + "</div>";
        }
        m.innerHTML = '<div class="sh-sheet sh-sheet-s">' + head + '<div class="sh-pad">' + summary + body + (st.fail ? '<p class="sh-warn">' + esc(st.fail) + "</p>" : "") + "</div>" +
          (st.done ? '<div class="sh-foot"><span class="sp"></span><button class="btn" data-x>Done</button></div>' :
            '<div class="sh-foot"><button class="btn ghost" data-x>Not now</button><span class="sp"></span><button class="btn" id="shGo"' + (st.busy || (!x.awb && !st.couriers && !st.err) ? " disabled" : "") + ">" + (st.busy ? '<span class="sh-spin"></span>Booking…' : ic("truck") + (x.awb ? "Book pickup" : "Confirm & book courier" + (st.couriers && st.pick ? " · " + rupees((st.couriers.find(c => c.id === st.pick) || {}).rate) : ""))) + "</button></div>") + "</div>";
        m.querySelectorAll("[data-x]").forEach(b => b.onclick = () => { if (!st.busy) close(); });
        m.onclick = e => { if (e.target === m && !st.busy) close(); };
        m.querySelectorAll('input[name="cr"]').forEach(r => r.onchange = () => { st.pick = +r.value; draw(); });
        const go = m.querySelector("#shGo"); if (go) go.onclick = book;
      }
      async function book() {
        st.busy = true; st.fail = ""; draw();
        try {
          st.done = await store("ship", { id: x.id, courierId: x.awb ? undefined : st.pick || undefined });
          toast("Courier booked for " + (x.name || "the order"));
          loadShip(true);
        } catch (e) { st.fail = e.message; }
        st.busy = false; draw();
      }
      draw();
      if (!x.awb) store("rates", { id: x.id }).then(d => { st.couriers = d.couriers; const r = d.couriers.find(c => c.recommended) || d.couriers[0]; st.pick = r ? r.id : 0; draw(); }, e => { st.err = e.message; draw(); });
    }

    /* ---------------- products ---------------- */
    function siteBase(u) { u = String(u || ""); return u ? u.replace(/\/+$/, "") + "/" : ""; }
    const abs = src => /^(data:|blob:|https?:)/.test(src) ? src : S.base + String(src).replace(/^\.?\//, "");
    const cats = () => S.data.categories;
    function drawProducts() {
      const el = $("#shProducts"); if (!el) return;
      if (o.readOnly) { el.innerHTML = ""; return; }
      if (!S.data) {
        el.innerHTML = o.editable === false ? "" : '<div class="card"><h2>' + ic("bag", 18) + 'Your products</h2><div class="sh-empty">' + (o.html === undefined ? "Loading your products…" : "Your website isn't connected to the product editor yet. Message NOWORA and we'll switch it on.") + "</div></div>";
        return;
      }
      const P = S.data.products, used = cats().filter(c => P.some(p => p.category === c.id));
      const list = P.filter(p => S.cat === "all" || p.category === S.cat);
      const newPhotos = P.reduce((n, p) => n + p.colours.reduce((m, c) => m + c.photos.filter(x => /^data:/.test(x)).length, 0), 0);
      el.innerHTML = '<div class="card"><h2>' + ic("bag", 18) + "Your products<small style=\"color:var(--ink-3);font-weight:600\">" + P.length + " on your website</small><span class=\"sp\"></span>" +
          (S.dirty ? '<span class="sh-dirty"><i></i>' + S.dirty + " unpublished change" + (S.dirty === 1 ? "" : "s") + '</span><button class="btn ghost sm" id="shUndo">Discard</button><button class="btn sm" id="shPub">' + ic("send") + "Publish to website</button>" : (S.base ? '<a class="btn ghost sm" target="_blank" rel="noopener" href="' + esc(S.base) + '#shop">' + ic("ext") + "See shop</a>" : "")) + "</h2>" +
        '<div class="sh-bar"><div class="sh-cats" id="shCats"><button data-c="all" class="' + (S.cat === "all" ? "on" : "") + '">All · ' + P.length + "</button>" + used.map(c => '<button data-c="' + esc(c.id) + '" class="' + (S.cat === c.id ? "on" : "") + '">' + esc(c.name) + " · " + P.filter(p => p.category === c.id).length + "</button>").join("") + "</div></div>" +
        '<div class="sh-grid"><button class="sh-add" id="shAdd">' + ic("plus", 28) + "Add a product<small style=\"font-weight:500;color:var(--ink-3)\">Upload photos — colours are detected for you</small></button>" +
        list.map(p => { const c0 = p.colours[0] || { photos: [] }, img = c0.photos[0], catName = (cats().find(c => c.id === p.category) || {}).name || p.category;
          return '<button class="sh-card" data-id="' + esc(p.id) + '"><span class="im">' + (img ? '<img src="' + esc(abs(img)) + '" alt="" loading="lazy">' : "") +
            (p._new ? '<span class="sh-tag new">Not published</span>' : p._changed ? '<span class="sh-tag new">Edited</span>' : p.hidden ? '<span class="sh-tag">Hidden</span>' : productLeft(p) === 0 ? '<span class="sh-tag out">Sold out</span>' : "") + '</span><span class="bd"><b>' + esc(p.name) + '</b><span class="meta">' + esc(catName) + " · " + (tracked(p) ? '<span class="' + (productLeft(p) <= 3 ? "sh-low" : "") + '">' + productLeft(p) + " in stock</span>" : esc((p.sizes || []).join(" "))) + '</span><span class="pr">' + inr(p.price) +
            '</span><span class="sh-dots">' + p.colours.map(c => '<i title="' + esc(c.name + (stockOf(p, c) === 0 ? " — sold out" : stockOf(p, c) !== null ? " — " + stockOf(p, c) + " left" : "")) + '" style="background:' + esc(c.hex) + (stockOf(p, c) === 0 ? ";opacity:.25" : "") + '"></i>').join("") + "</span></span></button>"; }).join("") +
        "</div>" + (newPhotos ? '<p class="sh-hint">' + newPhotos + " new photo" + (newPhotos === 1 ? "" : "s") + " will upload when you publish (up to " + MAX_NEW_PHOTOS + " at a time).</p>" : '<p class="sh-hint">Changes stay here until you press Publish. Your website updates about a minute later.</p>') + "</div>";
      $("#shCats").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.cat = b.dataset.c; drawProducts(); };
      const out = [], low = [];
      P.forEach(p => (p.colours || []).forEach(c => { if (!c.stock) return; (p.sizes || []).forEach(z => { const n = Number(c.stock[z]) || 0; if (n <= 0) out.push(p.name + " " + c.name + " " + z); else if (n <= 2) low.push(p.name + " " + c.name + " " + z + " (" + n + ")"); }); }));
      if (out.length || low.length) $("#shCats").insertAdjacentHTML("afterend", '<span class="sh-stocknote" title="' + esc(out.concat(low).join("\n")) + '">' + (out.length ? '<b>' + out.length + " sold out</b>" : "") + (out.length && low.length ? " · " : "") + (low.length ? low.length + " running low" : "") + "</span>");
      $("#shAdd").onclick = () => editProduct(null);
      root.querySelectorAll(".sh-card").forEach(b => b.onclick = () => editProduct(S.data.products.find(p => p.id === b.dataset.id)));
      const pub = $("#shPub"); if (pub) pub.onclick = publish;
      const undo = $("#shUndo"); if (undo) undo.onclick = () => { if (!confirm("Discard your unpublished product changes?")) return; S.data = JSON.parse(JSON.stringify(S.saved)); S.dirty = 0; drawProducts(); };
    }
    function bump() { S.dirty++; drawProducts(); }
    // one plain summary for the top of the dashboard ("what needs you today")
    function announce() {
      const sm = summarise(S.orders, 30), L = S.ship.orders, low = [], out = [];
      if (S.data) S.data.products.forEach(p => (p.colours || []).forEach(c => { if (!c.stock) return; (p.sizes || []).forEach(z => { const k = Number(c.stock[z]) || 0; (k <= 0 ? out : k <= 2 ? low : []).push(p.name + " " + c.name + " " + z); }); }));
      dispatchEvent(new CustomEvent("nowora:shop", { detail: { toSend: L ? L.filter(x => x.stage === "new").length : sm ? sm.nWaiting : null,
        onTheWay: L ? L.filter(x => x.stage === "ready" || x.stage === "transit").length : null, sold: sm ? sm.confirmed : 0, waiting: sm ? sm.waiting : 0, orders: sm ? sm.orders : 0, low: low, out: out, canSend: !o.readOnly && !!L } }));
    }

    /* ---------------- add / edit sheet ---------------- */
    function editProduct(orig) {
      const isNew = !orig;
      const firstSizes = (S.data.products[0] && S.data.products[0].sizes) || ["S", "M", "L", "XL", "XXL"];
      const p = orig ? JSON.parse(JSON.stringify(orig)) : { id: "", name: "", category: "", price: "", sizes: firstSizes.slice(), desc: "", details: [], colours: [] };
      // photos are edited as a flat list, each tagged with its colour
      const st = { catTouched: !isNew, err: "", busy: "", track: isNew ? true : tracked(p) };
      const m = document.createElement("div"); m.className = "sh-modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
      document.body.appendChild(m); requestAnimationFrame(() => m.classList.add("on"));
      const close = () => { m.classList.remove("on"); setTimeout(() => m.remove(), 250); document.removeEventListener("keydown", onKey); };
      const onKey = e => { if (e.key === "Escape") close(); }; document.addEventListener("keydown", onKey);
      const PRESETS = [["Clothing", ["XS", "S", "M", "L", "XL", "XXL", "3XL"]], ["Waist", ["26", "28", "30", "32", "34", "36", "38", "40"]], ["Free size", ["Free size"]]];
      const allSizes = () => { const seen = []; PRESETS.forEach(x => x[1].forEach(s => { if (seen.indexOf(s) < 0) seen.push(s); })); p.sizes.forEach(s => { if (seen.indexOf(s) < 0) seen.push(s); }); return seen; };
      const guess = () => guessCategory(p.name, cats());

      function draw() {
        const g = guess();
        if (!st.catTouched && g) p.category = g.id;
        const catOpts = cats().slice(); if (p.category && !catOpts.some(c => c.id === p.category)) catOpts.push({ id: p.category, name: (g && g.id === p.category ? g.name : p.category) });
        m.innerHTML = '<div class="sh-sheet"><div class="sh-sh"><h3>' + (isNew ? "Add a product" : "Edit product") + '</h3><span class="sp"></span><button class="sh-x" data-x aria-label="Close">' + ic("x") + "</button></div>" +
          '<div class="sh-body"><div>' +
            '<div class="sh-f"><span class="lbl">Photos</span><label class="sh-drop" id="pDrop"><input type="file" accept="image/*" multiple hidden id="pFile">' + ic("img") + "<b>Upload photos</b><span>Drop them here or tap to choose. Each photo's colour is detected, and photos of the same colour are grouped.</span></label>" +
            '<div class="sh-busy" id="pBusy">' + (st.busy ? '<span class="sh-spin"></span>' + esc(st.busy) : "") + "</div></div>" +
            '<div class="sh-colours">' + p.colours.map((c, ci) => '<div class="sh-col" data-ci="' + ci + '"><div class="sh-col-h"><i style="background:' + esc(c.hex) + '"></i><input value="' + esc(c.name) + '" data-cname aria-label="Colour name"><select data-cfam aria-label="Colour group for filters">' + FAMILIES.map(f => '<option' + (f === c.family ? " selected" : "") + ">" + f + "</option>").join("") + "</select></div>" +
              '<div class="sh-photos">' + c.photos.map((src, pi) => '<div class="sh-ph' + (ci === 0 && pi === 0 ? " main" : "") + '"><img src="' + esc(abs(src)) + '" alt="">' + (/^data:/.test(src) ? '<span class="new">NEW</span>' : "") +
                '<span class="acts"><select data-move="' + ci + ":" + pi + '" title="Move to another colour"><option value="">Colour…</option>' + p.colours.map((x, xi) => xi === ci ? "" : '<option value="' + xi + '">' + esc(x.name) + "</option>").join("") + '<option value="new">New colour</option></select>' +
                '<button type="button" data-main="' + ci + ":" + pi + '" title="Make this the main photo">' + ic("star") + '</button><button type="button" data-rm="' + ci + ":" + pi + '" title="Remove photo">' + ic("trash") + "</button></span></div>").join("") + "</div></div>").join("") + "</div>" +
          "</div><div>" +
            '<div class="sh-f"><label for="pName">Name</label><input type="text" id="pName" maxlength="70" placeholder="e.g. Oversized black hoodie" value="' + esc(p.name) + '"></div>' +
            '<div class="sh-f"><label for="pCat">Category ' + (g && !st.catTouched ? '<span class="sh-auto">' + ic("wand", 12) + " Auto from the name</span>" : "") + '</label><select id="pCat"><option value="">Choose…</option>' + catOpts.map(c => '<option value="' + esc(c.id) + '"' + (c.id === p.category ? " selected" : "") + ">" + esc(c.name) + (cats().some(x => x.id === c.id) ? "" : " (new)") + "</option>").join("") + '<option value="__new">+ New category…</option></select></div>' +
            '<div class="sh-f"><label for="pPrice">Price (₹)</label><input type="number" id="pPrice" min="1" step="1" inputmode="numeric" placeholder="e.g. 1299" value="' + esc(p.price) + '"></div>' +
            '<div class="sh-f"><span class="lbl">Sizes</span><div class="sh-sizes" id="pSizes">' + allSizes().map(s => '<button type="button" class="' + (p.sizes.indexOf(s) >= 0 ? "on" : "") + '">' + esc(s) + "</button>").join("") + '<input id="pSizeAdd" placeholder="+ other size" maxlength="12"></div>' +
              '<div class="sh-presets">Quick pick: ' + PRESETS.map((x, i) => '<button type="button" data-preset="' + i + '">' + x[0] + "</button>").join(" · ") + ' · <button type="button" data-preset="none">None</button></div></div>' +
            '<div class="sh-f"><span class="lbl">Stock <label class="sh-toggle" style="margin-left:auto;text-transform:none;letter-spacing:0;font-size:13px"><input type="checkbox" id="pTrack"' + (st.track ? " checked" : "") + "> Track stock</label></span>" +
              (st.track ? (p.colours.length && p.sizes.length ? '<div class="sh-stock"><table><thead><tr><th></th>' + p.sizes.map(z => "<th>" + esc(z) + "</th>").join("") + "</tr></thead><tbody>" +
                p.colours.map((c, ci) => '<tr><th><i style="background:' + esc(c.hex) + '"></i>' + esc(c.name) + "</th>" + p.sizes.map(z => '<td><input type="number" min="0" max="9999" step="1" inputmode="numeric" data-st="' + ci + '" data-z="' + esc(z) + '" value="' + esc(c.stock && c.stock[z] !== undefined ? c.stock[z] : "") + '" placeholder="0" aria-label="' + esc(c.name + " " + z + " in stock") + '"></td>').join("") + "</tr>").join("") +
                '</tbody></table></div><p class="sh-hint" style="margin-top:6px">How many of each you have. A size at 0 disappears from your website; when a colour runs out it disappears too. Dispatched website orders are taken off automatically.</p>'
                : '<p class="sh-hint">Add photos and sizes first, then set how many of each you have.</p>')
              : '<p class="sh-hint" style="margin-top:0">Off: this product always shows as available. Switch on to set how many of each size and colour you have — sold-out sizes then disappear from your website by themselves.</p>') + "</div>" +
            '<div class="sh-f"><label for="pDesc">Short description <span style="text-transform:none;letter-spacing:0;color:var(--ink-3);font-weight:500">optional</span></label><textarea id="pDesc" maxlength="300" placeholder="One or two lines shoppers see on the product page">' + esc(p.desc) + "</textarea></div>" +
            '<div class="sh-f"><label for="pDet">Details <span style="text-transform:none;letter-spacing:0;color:var(--ink-3);font-weight:500">optional, one per line</span></label><textarea id="pDet" maxlength="600" placeholder="Fleece lined&#10;Two zip pockets">' + esc((p.details || []).join("\n")) + "</textarea></div>" +
            '<label class="sh-toggle"><input type="checkbox" id="pShow"' + (p.hidden ? "" : " checked") + "> Show on my website</label>" +
          "</div></div>" +
          '<div class="sh-foot">' + (!isNew ? '<button class="btn danger sm" id="pDel">' + ic("trash") + "Delete</button>" : "") + '<span class="sh-err" id="pErr">' + esc(st.err) + '</span><span class="sp"></span><button class="btn ghost sm" data-x>Cancel</button><button class="btn sm" id="pSave">' + (isNew ? "Add product" : "Save changes") + "</button></div></div>";
        wire();
      }
      const $m = s => m.querySelector(s);
      function readFields() {
        p.name = $m("#pName").value.replace(/\s+/g, " ").trim();
        p.price = $m("#pPrice").value;
        p.desc = $m("#pDesc").value.trim();
        p.details = $m("#pDet").value.split("\n").map(x => x.trim()).filter(Boolean).slice(0, 8);
        p.hidden = !$m("#pShow").checked;
        const tr = $m("#pTrack"); if (tr) st.track = tr.checked;
        m.querySelectorAll("[data-st]").forEach(inp => { const c = p.colours[+inp.dataset.st]; if (!c) return; c.stock = c.stock || {}; const v = inp.value.trim(); c.stock[inp.dataset.z] = v === "" ? 0 : Math.max(0, Math.min(9999, Math.round(Number(v) || 0))); });
        if (st.track) p.colours.forEach(c => { c.stock = c.stock || {}; p.sizes.forEach(z => { if (c.stock[z] === undefined) c.stock[z] = 0; }); Object.keys(c.stock).forEach(z => { if (p.sizes.indexOf(z) < 0) delete c.stock[z]; }); });
        else p.colours.forEach(c => { delete c.stock; });
        m.querySelectorAll("[data-cname]").forEach((inp, i) => { const v = inp.value.replace(/\s+/g, " ").trim(); if (v) p.colours[i].name = v.slice(0, 40); });
        m.querySelectorAll("[data-cfam]").forEach((sel, i) => { p.colours[i].family = sel.value; });
      }
      function wire() {
        m.querySelectorAll("[data-x]").forEach(b => b.onclick = close);
        m.onclick = e => { if (e.target === m) close(); };
        const name = $m("#pName");
        name.oninput = () => { p.name = name.value; if (st.catTouched) return; const g = guess(); const sel = $m("#pCat");
          if (g && g.id !== p.category) { readFields(); const pos = name.selectionStart; draw(); const n2 = $m("#pName"); n2.focus(); n2.setSelectionRange(pos, pos); }
          else if (!g && sel) sel.value = p.category || ""; };
        $m("#pCat").onchange = e => { readFields(); const v = e.target.value; st.catTouched = true;
          if (v === "__new") { const nm = (prompt("Name of the new category (for example: Co-ord sets)") || "").trim().slice(0, 30); if (!nm) { draw(); return; }
            const id = slug(nm) || "cat"; if (!cats().some(c => c.id === id)) S.data.categories.push({ id: id, name: nm, _new: true }); p.category = id; }
          else p.category = v;
          draw(); };
        $m("#pSizes").onclick = e => { const b = e.target.closest("button"); if (!b) return; readFields(); const s = b.textContent, i = p.sizes.indexOf(s); if (i >= 0) p.sizes.splice(i, 1); else p.sizes.push(s); draw(); };
        const trk = $m("#pTrack"); if (trk) trk.onchange = () => { readFields(); draw(); };
        $m("#pSizeAdd").onkeydown = e => { if (e.key !== "Enter") return; e.preventDefault(); const v = e.target.value.trim().slice(0, 12); if (v && p.sizes.indexOf(v) < 0) p.sizes.push(v); readFields(); draw(); const a = $m("#pSizeAdd"); a.focus(); };
        m.querySelectorAll("[data-preset]").forEach(b => b.onclick = () => { readFields(); p.sizes = b.dataset.preset === "none" ? [] : PRESETS[+b.dataset.preset][1].slice(); draw(); });
        const drop = $m("#pDrop"), file = $m("#pFile");
        file.onchange = () => addPhotos([...file.files]);
        drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); }; drop.ondragleave = () => drop.classList.remove("over");
        drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); addPhotos([...e.dataTransfer.files]); };
        m.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { readFields(); const [ci, pi] = b.dataset.rm.split(":").map(Number); p.colours[ci].photos.splice(pi, 1); if (!p.colours[ci].photos.length) p.colours.splice(ci, 1); draw(); });
        m.querySelectorAll("[data-main]").forEach(b => b.onclick = () => { readFields(); const [ci, pi] = b.dataset.main.split(":").map(Number); const c = p.colours.splice(ci, 1)[0]; const ph = c.photos.splice(pi, 1)[0]; c.photos.unshift(ph); p.colours.unshift(c); draw(); });
        m.querySelectorAll("[data-move]").forEach(s => s.onchange = () => { readFields(); const [ci, pi] = s.dataset.move.split(":").map(Number), to = s.value; if (!to) return;
          const ph = p.colours[ci].photos.splice(pi, 1)[0];
          if (to === "new") { const nm = (prompt("Name of the colour for this photo") || "").trim().slice(0, 40); if (!nm) { p.colours[ci].photos.splice(pi, 0, ph); draw(); return; }
            const pal = PALETTE.find(x => x.name.toLowerCase() === nm.toLowerCase()); p.colours.push({ name: nm, hex: pal ? pal.hex : p.colours[ci].hex, family: pal ? pal.family : p.colours[ci].family, photos: [ph] }); }
          else p.colours[+to].photos.push(ph);
          if (!p.colours[ci].photos.length) p.colours.splice(ci, 1);
          draw(); });
        const del = $m("#pDel"); if (del) del.onclick = () => { if (!confirm("Delete " + (orig.name || "this product") + " from your website? It disappears from your shop when you publish.")) return;
          S.data.products = S.data.products.filter(x => x.id !== orig.id); close(); bump(); toast("Deleted — publish to update your website"); };
        $m("#pSave").onclick = save;
      }
      async function addPhotos(files) {
        files = files.filter(f => /^image\//.test(f.type)); if (!files.length) { toast("Choose photos (JPG, PNG or WebP)"); return; }
        readFields();
        const pending = S.data.products.reduce((n, x) => x === orig ? n : n + x.colours.reduce((k, c) => k + c.photos.filter(s => /^data:/.test(s)).length, 0), 0) + p.colours.reduce((k, c) => k + c.photos.filter(s => /^data:/.test(s)).length, 0);
        if (pending + files.length > MAX_NEW_PHOTOS) { toast("Up to " + MAX_NEW_PHOTOS + " new photos per publish — publish these first, then add more"); files = files.slice(0, Math.max(0, MAX_NEW_PHOTOS - pending)); if (!files.length) return; }
        let i = 0;
        for (const f of files) {
          st.busy = "Reading photo " + (++i) + " of " + files.length + " and finding its colour…"; const b = $m("#pBusy"); if (b) b.innerHTML = '<span class="sh-spin"></span>' + esc(st.busy);
          try {
            const url = await compress(f, 1400), det = await detectColour(url);
            // same colour as one already on this product? (photos of one garment vary with light and angle)
            let best = -1, bd = 1e9; p.colours.forEach((c, ci) => { const x = dE(det.lab, c._lab || hexLab(c.hex)); if (x < bd) { bd = x; best = ci; } });
            if (best >= 0 && bd < 16) p.colours[best].photos.push(url);
            else { let nm = det.name, n = 2; while (p.colours.some(c => c.name.toLowerCase() === nm.toLowerCase())) nm = det.name + " " + n++;
              p.colours.push({ name: nm, hex: det.hex, family: det.family, photos: [url], _lab: det.lab }); }
          } catch (e) { toast(e.message); }
        }
        st.busy = ""; draw();
        if (!p.name.trim()) { const n = $m("#pName"); if (n) n.focus(); }
      }
      function save() {
        readFields();
        const err = msg => { st.err = msg; const e = $m("#pErr"); if (e) e.textContent = msg; };
        if (!p.colours.length || !p.colours.some(c => c.photos.length)) return err("Add at least one photo");
        if (!p.name) return err("Give the product a name");
        const price = Math.round(Number(String(p.price).replace(/[^\d.]/g, "")));
        if (!(price > 0) || price > 1000000) return err("Enter the price in rupees");
        if (!p.category) { const g = guess(); if (g) p.category = g.id; else return err("Choose a category"); }
        if (!p.sizes.length) p.sizes = ["Free size"];
        const names = p.colours.map(c => c.name.toLowerCase()); if (names.some((n, i) => names.indexOf(n) !== i)) return err("Two colours have the same name");
        if (st.track) { p.colours.forEach(c => { c.stock = c.stock || {}; p.sizes.forEach(z => { if (c.stock[z] === undefined) c.stock[z] = 0; }); });
          if (!p.hidden && productLeft(p) === 0 && !confirm("Every size is at 0, so " + (p.name || "this product") + " won't show on your website until you add stock. Save anyway?")) return; }
        p.price = price;
        if (!cats().some(c => c.id === p.category)) { const g = guess(); S.data.categories.push({ id: p.category, name: g && g.id === p.category ? g.name : p.category }); }
        p.colours.forEach(c => { delete c._lab; c.family = c.family || (nearest(hexLab(c.hex)).family); });
        if (!p.weight) p.weight = WEIGHT[p.category] || 0.5;
        if (isNew) { let id = slug(p.name) || "product", n = 2, base = id; while (S.data.products.some(x => x.id === id)) id = base + "-" + n++; p.id = id; p._new = true; S.data.products.push(p); }
        else { p._changed = !p._new; const i = S.data.products.findIndex(x => x.id === orig.id); S.data.products[i] = p; }
        close(); bump(); toast(isNew ? p.name + " added — publish to put it on your website" : "Saved — publish to update your website");
      }
      draw();
    }

    /* ---------------- publish ---------------- */
    async function publish() {
      const btn = $("#shPub"); if (btn) { btn.disabled = true; btn.lastChild.textContent = "Publishing…"; }
      try {
        const src = await call("site_source");
        const site = src.site;
        if (!readCatalogue(site.html)) throw new Error("Your website isn't set up for the product editor yet — ask NOWORA to switch it on.");
        const images = [], stamp = Date.now().toString(36);
        const data = { v: 1, note: S.data.note || "Managed from the NOWORA client dashboard (Shop → Products).", categories: [], products: [] };
        /* Stock can change on the live site while this page is open (dispatched orders take items off).
           Where the client didn't touch a colour's stock here, keep the live numbers; where they did, theirs win. */
        const live = readCatalogue(site.html) || { products: [] }, pick = (d, pid, cn) => { const pp = (d.products || []).find(x => x.id === pid); const cc = pp && (pp.colours || []).find(x => x.name === cn); return cc ? cc.stock : undefined; };
        const liveStock = (p, c) => { const was = pick(S.saved || {}, p.id, c.name), now = pick(live, p.id, c.name);
          return JSON.stringify(c.stock) === JSON.stringify(was) && now && typeof now === "object" ? Object.assign({}, now) : Object.assign({}, c.stock); };
        if (Array.isArray(live.dispatched)) data.dispatched = live.dispatched;
        const usedCats = new Set(S.data.products.map(p => p.category));
        data.categories = S.data.categories.filter(c => usedCats.has(c.id)).map(c => ({ id: c.id, name: c.name }));
        let k = 0;
        data.products = S.data.products.map(p => {
          const out = { id: p.id, name: p.name, category: p.category, price: p.price, sizes: p.sizes, weight: p.weight || WEIGHT[p.category] || 0.5 };
          if (p.hidden) out.hidden = true;
          if (p.desc) out.desc = p.desc;
          if (p.details && p.details.length) out.details = p.details;
          out.colours = p.colours.map(c => ({ name: c.name, hex: c.hex, family: c.family, ...(c.stock ? { stock: liveStock(p, c) } : {}), photos: c.photos.map(ph => {
            if (!/^data:/.test(ph)) return ph;
            const name = (slug(p.id).slice(0, 24) || "product") + "-" + stamp + "-" + (k++) + ".jpg";
            images.push({ name: name, data: ph });
            return "images/uploads/" + name;
          }) }));
          return out;
        });
        if (images.length > MAX_NEW_PHOTOS) throw new Error("Too many new photos at once — remove some and publish again");
        const html = writeCatalogue(site.html, data);
        const changed = S.data.products.filter(p => p._new || p._changed).map(p => p.name);
        const msg = (changed.length ? "Products updated: " + changed.slice(0, 4).join(", ") + (changed.length > 4 ? " and " + (changed.length - 4) + " more" : "") : "Products updated");
        await call("site_publish", { html: html, images: images, path: site.path, sha: site.sha, message: msg });
        S.data = JSON.parse(JSON.stringify(data)); S.data.note = data.note; S.saved = JSON.parse(JSON.stringify(data)); S.dirty = 0;
        drawProducts();
        toast("Published — your shop updates in about a minute");
      } catch (e) {
        toast(e.message);
        if (btn) { btn.disabled = false; btn.lastChild.textContent = "Publish to website"; }
      }
    }

    /* ---------------- start ---------------- */
    if (S.data) S.saved = JSON.parse(JSON.stringify(S.data));
    drawProducts(); boot();
    addEventListener("beforeunload", e => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });
    let lastRev = "";
    const timer = setInterval(async () => {
      if (document.hidden || !root.isConnected) { if (!root.isConnected) clearInterval(timer); return; }
      if (S.ship.on && Date.now() - (S.ship.at || 0) > 120000) loadShip(true);
      try { const r = await call("db_rev"); if (r.rev && r.rev !== lastRev) { const first = !lastRev; lastRev = r.rev; if (!first) refreshSales(); } } catch (e) { /* next round */ }
    }, 30000);
    return { setCatalogue(html) { S.data = readCatalogue(html); if (S.data) S.saved = JSON.parse(JSON.stringify(S.data)); drawProducts(); }, refreshSales: refreshSales };
  }

  window.NoworaShop = { mount: mount, loadSales: loadSales, summarise: summarise, detectColour: detectColour, readCatalogue: readCatalogue, writeCatalogue: writeCatalogue, guessCategory: guessCategory, nearestColour: lab => nearest(lab), hexLab: hexLab };
})();
