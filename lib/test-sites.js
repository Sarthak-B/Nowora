// Four small test websites for the D1 trial — one per kind of business — each with a real form
// that t.js saves to the client's database. Used by lib/seed.js.
const esc = s => String(s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

export const SITES = {
  restaurant: {
    id: "t-cafe", host: "test-cafe", portal: "test-cafe", business: "Brew & Bloom Café", name: "Meera", phone: "9876500011",
    title: "Brew & Bloom — slow coffee, fresh bakes, Dehradun", font: ["Fraunces", "Inter"], bg: "#F6EFE6", ink: "#2B1D14", acc: "#C2562B", soft: "#EADCCB",
    kicker: "Rajpur Road · open 8 am – 11 pm", h1: "Slow coffee.<br><em>Warm bakes.</em>", lead: "Single-origin pour-overs, sourdough out of the oven every morning, and a garden table waiting for you.",
    cta: "Book a table", nav: ["Menu", "Our garden", "Book"],
    list: { title: "On the menu", items: [["Hazelnut cold brew", "₹220", "18-hour steep, roasted hazelnut, oat milk"], ["Sourdough avocado toast", "₹340", "Chilli crisp, feta, microgreens"], ["Masala chai tiramisu", "₹290", "Our bestseller since day one"], ["Wood-fired margherita", "₹420", "San Marzano, fior di latte, basil"], ["Kombucha flight", "₹260", "Three seasonal brews"], ["Brunch platter for two", "₹780", "Eggs your way, bakes, fruit, two coffees"]] },
    form: { table: "Table bookings", head: "Book a table", note: "We'll confirm on WhatsApp within 15 minutes.", fields: [["Name", "text", "Your name"], ["Phone", "tel", "WhatsApp number"], ["Date", "date"], ["Time", "select", ["8:30 am", "10:00 am", "12:30 pm", "2:00 pm", "7:00 pm", "8:30 pm", "9:30 pm"]], ["Guests", "number", "2"], ["Occasion", "select", ["Just because", "Birthday", "Date night", "Work meeting"]]] },
    quotes: [["The garden at sunset is everything. Best cold brew in town.", "Ritika S."], ["Booked for a birthday — they had a candle on the tiramisu without us asking.", "Aman K."]]
  },
  salon: {
    id: "t-salon", host: "test-salon", portal: "test-salon", business: "Glow Studio", name: "Simran", phone: "9876500022",
    title: "Glow Studio — hair, skin and nails in Chandigarh", font: ["Playfair Display", "Inter"], bg: "#FBF3F3", ink: "#2A1A22", acc: "#B04A6E", soft: "#F1DCE3",
    kicker: "Sector 17 · Tue – Sun, 10 am – 8 pm", h1: "Look like<br><em>you, rested.</em>", lead: "Precision cuts, skin rituals and nail art by a small team that never rushes you.",
    cta: "Book an appointment", nav: ["Services", "Our team", "Book"],
    list: { title: "Services & prices", items: [["Haircut & style", "₹900", "Wash, cut, blow-dry · 45 min"], ["Global colour", "₹3,500", "Ammonia-free · 2 hrs"], ["Hydra facial", "₹2,800", "Deep cleanse + glow · 60 min"], ["Gel manicure", "₹1,100", "Shape, cuticle care, gel · 45 min"], ["Keratin treatment", "₹5,500", "Smooth for 4 months · 3 hrs"], ["Bridal trial", "₹4,000", "Hair + makeup trial · 2 hrs"]] },
    form: { table: "Appointments", head: "Book an appointment", note: "Pick a time — we'll confirm on WhatsApp.", fields: [["Name", "text", "Your name"], ["Phone", "tel", "WhatsApp number"], ["Service", "select", ["Haircut & style", "Global colour", "Hydra facial", "Gel manicure", "Keratin treatment", "Bridal trial"]], ["Date", "date"], ["Time", "select", ["11:00 am", "12:30 pm", "2:00 pm", "3:30 pm", "5:00 pm", "6:30 pm"]], ["Stylist", "select", ["Any", "Simran", "Neha", "Arjun"]]] },
    quotes: [["Neha fixed a colour another salon ruined. I'm never going anywhere else.", "Kavya M."], ["Calm, clean and on time. The hydra facial is worth every rupee.", "Ishita R."]]
  },
  realestate: {
    id: "t-homes", host: "test-homes", portal: "test-homes", business: "Skyline Homes", name: "Rohit", phone: "9876500033",
    title: "Skyline Homes — 2 & 3 BHK homes on Sahastradhara Road", font: ["Manrope", "Manrope"], bg: "#F2F4F1", ink: "#13201B", acc: "#1F6B4F", soft: "#DCE6DF",
    kicker: "RERA UKREP0123 · possession Dec 2027", h1: "Homes with<br><em>a hill view.</em>", lead: "Three projects, 2 & 3 BHK, 12 minutes from Clock Tower. Visit the sample flat this weekend.",
    cta: "Book a site visit", nav: ["Projects", "Floor plans", "Visit"],
    list: { title: "Projects", items: [["Skyline Residency", "from ₹58 L", "2 BHK · 1,050 sq ft · ready in 2027"], ["Skyline Heights", "from ₹82 L", "3 BHK · 1,480 sq ft · 70% sold"], ["Skyline Villas", "from ₹1.6 Cr", "4 BHK villas · private garden"], ["Commercial shops", "from ₹45 L", "Ground floor · road facing"]] },
    form: { table: "Site visits", head: "Book a site visit", note: "Free pick-up from anywhere in Dehradun.", fields: [["Name", "text", "Your name"], ["Phone", "tel", "WhatsApp number"], ["Project", "select", ["Skyline Residency", "Skyline Heights", "Skyline Villas", "Commercial shops"]], ["Budget", "select", ["Under ₹60 L", "₹60 L – ₹1 Cr", "₹1 Cr – ₹2 Cr", "Above ₹2 Cr"]], ["Visit date", "date"], ["Message", "textarea", "Anything you'd like us to know"]] },
    quotes: [["They picked us up, showed three flats and never pushed. Booked our 3 BHK in a week.", "The Negi family"], ["Clear paperwork, RERA documents shared upfront.", "Vikram T."]]
  },
  services: {
    id: "t-coach", host: "test-coach", portal: "test-coach", business: "Grow with Tanya", name: "Tanya", phone: "9876500044",
    title: "Tanya Arora — business coach for small brands", font: ["DM Serif Display", "Inter"], bg: "#F4F1EA", ink: "#1C1B22", acc: "#4B4ACF", soft: "#E3E1F3",
    kicker: "1:1 coaching · online · 200+ founders coached", h1: "Grow your brand<br><em>without burning out.</em>", lead: "A 12-week programme for founders doing ₹2–20 L a month who want systems, not more hustle.",
    cta: "Book a free call", nav: ["Programme", "Results", "Book a call"],
    list: { title: "Ways to work together", items: [["Free clarity call", "Free", "30 minutes · find your next move"], ["12-week programme", "₹45,000", "Weekly calls, templates, WhatsApp support"], ["Strategy day", "₹18,000", "One full day, one finished plan"], ["Team workshop", "₹60,000", "Half-day, up to 15 people"]] },
    form: { table: "Enquiries", head: "Book a free call", note: "Tell me a little about your business.", fields: [["Name", "text", "Your name"], ["Phone", "tel", "WhatsApp number"], ["Email", "email", "you@brand.com"], ["Business", "text", "Your brand"], ["Monthly revenue", "select", ["Under ₹2 L", "₹2 – 5 L", "₹5 – 20 L", "Above ₹20 L"]], ["Message", "textarea", "What would you like help with?"]] },
    quotes: [["We went from chaos to a ₹9 L month with half the stress.", "Pooja, founder of Kesar Kitchen"], ["The weekly calls kept me honest. Worth it.", "Rahul, Studio Loom"]]
  }
};

function field([label, type, opt]) {
  const id = "f" + label.replace(/\W+/g, "").toLowerCase(), req = /^(name|phone)$/i.test(label) ? " required" : "";
  const input = type === "select" ? '<select id="' + id + '" name="' + esc(label) + '"' + req + ">" + opt.map(o => "<option>" + esc(o) + "</option>").join("") + "</select>"
    : type === "textarea" ? '<textarea id="' + id + '" name="' + esc(label) + '" rows="3" placeholder="' + esc(opt || "") + '"></textarea>'
    : '<input id="' + id + '" name="' + esc(label) + '" type="' + type + '"' + (opt ? ' placeholder="' + esc(opt) + '"' : "") + (type === "number" ? ' min="1" max="20"' : "") + req + ">";
  return '<label class="fld' + (type === "textarea" ? " wide" : "") + '" for="' + id + '"><span>' + esc(label) + "</span>" + input + "</label>";
}

export function html(s, trackId) {
  const [fh, fb] = s.font, wa = "https://wa.me/91" + s.phone + "?text=" + encodeURIComponent("Hi " + s.business + "!");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(s.title)}</title><meta name="description" content="${esc(s.lead)}"><meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=${fh.replace(/ /g, "+")}:ital,wght@0,500;0,700;1,500&family=${fb.replace(/ /g, "+")}:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{--bg:${s.bg};--ink:${s.ink};--acc:${s.acc};--soft:${s.soft};--h:'${fh}',serif;--b:'${fb}',system-ui,sans-serif}
*{box-sizing:border-box;margin:0}html{scroll-behavior:smooth}body{background:var(--bg);color:var(--ink);font:16px/1.6 var(--b)}
a{color:inherit}img{max-width:100%}.wrap{width:min(1120px,92vw);margin:auto}
header{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid color-mix(in srgb,var(--ink) 10%,transparent)}
header .wrap{display:flex;align-items:center;gap:24px;height:68px}.logo{font:700 21px var(--h);text-decoration:none}nav{margin-left:auto;display:flex;gap:22px;font-weight:500}nav a{text-decoration:none;opacity:.8}nav a:hover{opacity:1}
.btn{display:inline-flex;align-items:center;gap:8px;padding:13px 22px;border-radius:999px;background:var(--acc);color:#fff;font-weight:700;text-decoration:none;border:0;cursor:pointer;font-size:15px;transition:transform .3s,box-shadow .3s}.btn:hover{transform:translateY(-2px);box-shadow:0 14px 30px -12px var(--acc)}
.btn.line{background:transparent;color:var(--ink);border:1.5px solid currentColor}
.hero{padding:96px 0 80px;display:grid;grid-template-columns:1.2fr .8fr;gap:48px;align-items:center}
.k{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--acc)}h1{font:500 clamp(44px,7vw,84px)/1.02 var(--h);letter-spacing:-.02em;margin:18px 0}h1 em,h2 em{color:var(--acc)}
.lead{font-size:19px;max-width:520px;opacity:.85}.row{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.art{aspect-ratio:4/5;border-radius:28px;background:radial-gradient(circle at 30% 25%,color-mix(in srgb,var(--acc) 55%,#fff),transparent 55%),linear-gradient(160deg,var(--soft),color-mix(in srgb,var(--acc) 35%,var(--soft)));box-shadow:0 40px 80px -40px color-mix(in srgb,var(--ink) 50%,transparent)}
section{padding:80px 0}h2{font:500 clamp(32px,4.5vw,52px)/1.08 var(--h);margin-bottom:34px}
.list{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.item{display:grid;grid-template-columns:1fr auto;gap:4px 16px;padding:22px;border-radius:18px;background:#fff8;border:1px solid color-mix(in srgb,var(--ink) 8%,transparent)}.item b{font-size:18px}.item i{font-style:normal;font-weight:700;color:var(--acc)}.item small{grid-column:1/-1;opacity:.7}
.book{background:var(--ink);color:var(--bg);border-radius:32px;padding:56px}.book h2{color:var(--bg)}.book p{opacity:.75;margin:-20px 0 26px}
form{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.fld{display:grid;gap:6px;font-size:13px;font-weight:700;letter-spacing:.04em}.fld.wide{grid-column:1/-1}
.fld input,.fld select,.fld textarea{width:100%;padding:13px 14px;border-radius:12px;border:1px solid #fff3;background:#fff1;color:inherit;font:16px var(--b)}.fld option{color:#111}
form .btn{grid-column:1/-1;justify-self:start}.done{display:none;padding:18px;border-radius:14px;background:#fff1;font-weight:700}
.quotes{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}blockquote{padding:28px;border-radius:22px;background:var(--soft);font:500 20px/1.4 var(--h)}blockquote cite{display:block;margin-top:12px;font:700 13px var(--b);font-style:normal;opacity:.7}
footer{padding:40px 0 90px;font-size:14px;opacity:.75}.wa{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:#25D366;color:#fff;box-shadow:0 12px 30px -10px #0008;font-weight:800;text-decoration:none}
@media (max-width:800px){nav{display:none}header .btn{margin-left:auto;padding:10px 16px}.hero{grid-template-columns:1fr;padding:48px 0}.art{aspect-ratio:16/10}.list,.quotes,form{grid-template-columns:1fr}.book{padding:30px 22px;border-radius:24px}section{padding:56px 0}}
</style></head>
<body>
<header><div class="wrap"><a class="logo" href="#top">${esc(s.business)}</a><nav>${s.nav.map((n, i) => '<a href="#' + ["list", "quotes", "book"][i] + '">' + esc(n) + "</a>").join("")}</nav><a class="btn" href="#book">${esc(s.cta)}</a></div></header>
<main id="top">
<section class="hero wrap"><div><span class="k">${esc(s.kicker)}</span><h1>${s.h1}</h1><p class="lead">${esc(s.lead)}</p><div class="row"><a class="btn" href="#book">${esc(s.cta)}</a><a class="btn line" href="tel:+91${s.phone}">Call us</a></div></div><div class="art" role="img" aria-label="${esc(s.business)}"></div></section>
<section id="list" class="wrap"><h2>${esc(s.list.title)}</h2><div class="list">${s.list.items.map(i => '<div class="item"><b>' + esc(i[0]) + "</b><i>" + esc(i[1]) + "</i><small>" + esc(i[2]) + "</small></div>").join("")}</div></section>
<section id="book" class="wrap"><div class="book"><h2>${esc(s.form.head)}</h2><p>${esc(s.form.note)}</p>
<form data-make4yu-table="${esc(s.form.table)}" onsubmit="event.preventDefault();this.querySelector('.done').style.display='block';this.reset()">${s.form.fields.map(field).join("")}<button class="btn" type="submit">${esc(s.cta)}</button><div class="done">Thank you! We'll message you on WhatsApp shortly.</div></form></div></section>
<section id="quotes" class="wrap"><h2>Kind <em>words</em></h2><div class="quotes">${s.quotes.map(q => "<blockquote>“" + esc(q[0]) + "”<cite>— " + esc(q[1]) + "</cite></blockquote>").join("")}</div></section>
</main>
<footer class="wrap">© ${new Date().getFullYear()} ${esc(s.business)} · Test website for the make4yu D1 trial</footer>
<a class="wa" href="${wa}" aria-label="WhatsApp us">WA</a>
<script src="https://make4yu.com/t.js" data-site="${trackId}" defer></script>
</body></html>`;
}
