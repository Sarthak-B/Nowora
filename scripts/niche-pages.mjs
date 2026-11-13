// Builds the "website for <business type>" pages (site/<slug>.html) that help make4yu show up
// for searches like "website for my café" or "online store website". Edit PAGES below, then run:
//   node scripts/niche-pages.mjs
// It also rewrites site/sitemap.xml so Google finds every page.
import fs from "node:fs"; import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://make4yu.com";
const WA = "916397988191", EMAIL = "make4yu@gmail.com";

const PLANS = {
  starter: { name: "Starter", price: "₹4,999", note: "your first-ever website · ₹9,999 if your business is already running", items: ["1–3 pages", "Free make4yu web address, nothing to buy", "WhatsApp button and contact form", "Google Maps and basic SEO", "Live within a week"] },
  business: { name: "Business", price: "₹34,999", note: "one-time", items: ["Your own .com or .in domain, first year included", "5–8 pages", "WhatsApp orders or online booking", "Google Business Profile setup", "Analytics dashboard", "Live in 10–14 days"] },
  growth: { name: "Growth", price: "₹49,999+", note: "one-time", items: ["Online store with payments and checkout", "Your own .com or .in domain", "Landing pages for launches and offers", "Visitor and order tracking", "Help writing your copy"] },
};

const PAGES = [
  {
    slug: "website-for-restaurant-cafe", short: "Cafés & restaurants", noun: "café or restaurant",
    title: "Website for your café or restaurant",
    h1: "A website for your café or restaurant, live in a week.",
    lede: "Menu, photos, timings, location and table bookings or WhatsApp orders, on a website that looks as good as your food. See two free samples before you pay anything.",
    features: [["Your menu, always up to date", "Change prices and dishes yourself from your dashboard, no developer needed."], ["Orders and reservations on WhatsApp", "Customers tap once to order, book a table or ask a question."], ["Found on Google Maps", "Your address, map, timings and phone number where hungry people look."], ["Food photos that sell", "A layout built around your dishes, fast on every phone."], ["Offers and events", "Weekend specials, festive menus and live-music nights on one page."], ["Hosting and care", "We keep it online, secure and backed up, first month free."]],
    samples: [{ name: "Ambara — Indian restaurant", url: "/work/restaurant", img: "restaurant" }],
    plans: ["starter", "business"],
    faq: [["How much does a restaurant website cost?", "A one-page café or restaurant site with menu, photos, map and WhatsApp starts at ₹4,999 for your first-ever website (₹9,999 if you're already running). A full Business site with online bookings or orders and your own domain is ₹34,999."], ["Can customers order food or book a table?", "Yes. The simplest option sends the order or booking straight to your WhatsApp. On the Business plan we can add a proper booking form or order flow."], ["Can I update the menu myself?", "Yes. Your care plan includes your own dashboard and a visual editor, so you can change prices, dishes, photos and timings yourself."]],
  },
  {
    slug: "website-for-salon-spa", short: "Salons, spas & clinics", noun: "salon, spa or clinic",
    title: "Website for your salon, spa or clinic",
    h1: "A booking website for your salon, spa or clinic.",
    lede: "Show your services and prices, let clients book in a tap, and look like the premium brand you are. Two free homepage samples first, you pay only if you love one.",
    features: [["Online appointment booking", "Clients pick a service and time, or book straight on WhatsApp."], ["Services and price list", "Clear menus for hair, skin, nails, spa or treatments."], ["Before-and-after gallery", "Show your best work with photos that load fast on phones."], ["Google Maps and reviews", "Help nearby clients find you and trust you."], ["Offers and packages", "Bridal, festive and membership offers on their own section."], ["Hosting and care", "Updates, backups and security handled, first month free."]],
    samples: [{ name: "Beauty & skincare studio", url: "/work/beauty", img: "beauty" }],
    plans: ["starter", "business"],
    faq: [["Can clients book appointments online?", "Yes. Every plan can take bookings on WhatsApp. The Business plan adds an online booking form with your services and time slots."], ["How much does a salon website cost?", "Starter is ₹4,999 for your first-ever website (₹9,999 for an established salon). Business, with online booking, your own domain and Google Business Profile setup, is ₹34,999."], ["Will it work for a clinic or doctor too?", "Yes. The same setup works for clinics, physios, dentists and therapists: services, timings, location and appointment requests."]],
  },
  {
    slug: "online-store-website", short: "Online stores", noun: "online store",
    title: "Online store website for your brand",
    h1: "Your own online store, not just an Instagram page.",
    lede: "A fast store with your products, sizes, cart and checkout, with orders, stock and delivery tracking handled for you. Built for clothing brands, home sellers and D2C brands.",
    features: [["Products, sizes and stock", "Add products and update stock from your dashboard."], ["Cart, checkout and payments", "UPI and online payments, or cash on delivery."], ["Orders on WhatsApp", "Every new order is sent to your WhatsApp right away."], ["Shipping and tracking", "Courier booking and a tracking link for every customer."], ["Your brand, your domain", "No marketplace fees eating your margin."], ["Hosting and care", "We keep the store fast, secure and backed up."]],
    samples: [{ name: "52 Alive — live streetwear store", url: "https://52alive.make4yu.com", img: "", live: true }, { name: "Aavya — clothing brand sample", url: "/work/clothing", img: "clothing" }],
    plans: ["growth", "business"],
    faq: [["How much does an online store website cost?", "An online store with payments and checkout is on our Growth plan, from ₹49,999 one-time. If you only need a catalogue with WhatsApp ordering, the Business plan at ₹34,999 can be enough."], ["Can I sell with cash on delivery and UPI?", "Yes. We can set up UPI and online payments as well as cash on delivery, with every order saved to your dashboard."], ["Do you handle shipping?", "We can connect courier booking (for example Shiprocket) so orders get an AWB and your customers get a tracking link automatically."]],
  },
  {
    slug: "real-estate-website", short: "Real estate & interiors", noun: "real estate, construction or interiors business",
    title: "Website for real estate, construction and interiors",
    h1: "A website that sells your properties and projects.",
    lede: "Listings, project galleries and enquiry forms that bring serious buyers and clients straight to your WhatsApp. For agents, builders, architects and interior designers.",
    features: [["Property and project showcase", "Photos, details, floor plans and price ranges for each listing or project."], ["Enquiries straight to WhatsApp", "Every lead lands on your phone with the property they asked about."], ["Site-visit booking", "Let buyers pick a time to visit."], ["Project galleries", "Before-and-after and finished-project photos that build trust."], ["Found on Google", "Your office on Maps and pages for the areas you serve."], ["Hosting and care", "We keep it updated, secure and backed up."]],
    samples: [{ name: "Real estate sample", url: "/work/real-estate", img: "real-estate" }],
    plans: ["starter", "business"],
    faq: [["Can I add new properties myself?", "Yes. With the care plan you get a dashboard and editor to add listings, photos and prices whenever you like."], ["How much does a real estate website cost?", "Starter starts at ₹4,999 for your first-ever website (₹9,999 for an established business). Business, with more pages, your own domain and enquiry tracking, is ₹34,999."], ["Does this work for interior designers and builders?", "Yes. Project galleries, services and enquiry forms work the same way for interiors, construction and architecture firms."]],
  },
  {
    slug: "website-for-coaches-consultants", short: "Coaches & consultants", noun: "coaching or consulting business",
    title: "Website for coaches, consultants and professionals",
    h1: "A website that turns visitors into clients for your coaching or consulting.",
    lede: "Explain what you do, show results, and let people book a call in one tap. For coaches, tutors, consultants, CAs, advisors and agencies.",
    features: [["Clear services and packages", "What you offer, who it's for and what it costs."], ["Book a call", "Calls booked on WhatsApp or with a booking form."], ["Testimonials and results", "Show real outcomes from your clients."], ["Lead capture", "Enquiry forms that save every lead to your dashboard."], ["Courses and downloads", "Sell or give away an e-book, webinar or course."], ["Hosting and care", "Updates and backups handled, first month free."]],
    samples: [{ name: "Finance advisor sample", url: "/work/finance", img: "finance" }, { name: "Marketing agency sample", url: "/work/digital-marketing", img: "digital-marketing" }],
    plans: ["starter", "business"],
    faq: [["Can people book a call from my website?", "Yes. On every plan visitors can message you on WhatsApp in one tap; the Business plan adds a booking form."], ["How much does a coaching website cost?", "Starter starts at ₹4,999 for your first-ever website (₹9,999 if you're already established). Business, with more pages, booking and your own domain, is ₹34,999."], ["Can I sell a course or e-book?", "Yes. We can add a page to sell or give away digital products, and the Growth plan adds full checkout and payments."]],
  },
  {
    slug: "portfolio-website", short: "Creators & portfolios", noun: "portfolio",
    title: "Portfolio website for students, creators and freelancers",
    h1: "A portfolio website that gets you noticed.",
    lede: "Your work, your story and a way to reach you, on a link you'll be proud to share. For students, freelancers, designers, photographers and creators. Students get 20% off.",
    features: [["Your best work, front and centre", "Projects, photos, videos or case studies laid out beautifully."], ["About you and your résumé", "Who you are, skills and experience, with a downloadable CV."], ["One link for everything", "Perfect for your Instagram bio, LinkedIn and job applications."], ["Contact in one tap", "WhatsApp and email buttons so opportunities reach you."], ["Free web address", "yourname.make4yu.com, nothing to buy."], ["Edit it yourself", "Update projects anytime from your dashboard."]],
    samples: [{ name: "Creator e-book sample", url: "/work/ebook", img: "ebook" }],
    plans: ["starter"],
    faq: [["How much does a portfolio website cost?", "Starter is ₹4,999 for your first-ever website, and students get 20% off. It includes a free make4yu web address, so there's no domain to buy."], ["Can I use my own domain?", "Yes. The Business plan includes your own .com or .in domain, or we can connect one you already have."], ["How fast can it be ready?", "Your two free samples take 3–4 days, and once you pick one the site goes live within a week."]],
  },
];

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const wa = text => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
const COMMON_FAQ = ["Are the free samples really free?", "Yes. We design two homepage samples for your business. If you don't love either, you pay nothing and owe nothing — no advance, no card."];

function page(p) {
  const url = `${SITE}/${p.slug}`;
  const desc = `${p.lede.split(". ")[0]}. make4yu builds websites for ${p.short.toLowerCase()} across India. Two free samples before you pay, live in about a week.`;
  const faq = [...p.faq, COMMON_FAQ];
  const waText = `Hi make4yu! I'd like 2 free website samples for my ${p.noun}.`;
  const ld = [
    { "@context": "https://schema.org", "@type": "Service", name: p.title, serviceType: "Website design", url, description: desc, areaServed: "IN", provider: { "@type": "Organization", "@id": `${SITE}/#org`, name: "make4yu", url: `${SITE}/` },
      offers: p.plans.map(k => ({ "@type": "Offer", name: PLANS[k].name, price: PLANS[k].price.replace(/[^\d]/g, ""), priceCurrency: "INR" })) },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "make4yu", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: p.title, item: url }] },
  ];
  const others = PAGES.filter(o => o !== p).map(o => `<a href="/${o.slug}">${esc(o.short)}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)} | make4yu</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0C2218">
<meta property="og:type" content="website">
<meta property="og:site_name" content="make4yu">
<meta property="og:title" content="${esc(p.title)} | make4yu">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
:root{--forest:#0C2218;--forest-2:#11301F;--sand:#E6DAC1;--sand-2:#BFB49C;--violet:#8B5CF6;--line:rgba(230,218,193,.14);--card:rgba(255,255,255,.04)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:radial-gradient(1200px 600px at 80% -10%,rgba(139,92,246,.16),transparent 60%),var(--forest);color:var(--sand);font:400 17px/1.6 "Instrument Sans",system-ui,sans-serif}
a{color:inherit}img{max-width:100%;display:block}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
h1,h2,h3{font-family:"Bricolage Grotesque",system-ui,sans-serif;line-height:1.08;margin:0;letter-spacing:-.02em}
header{display:flex;justify-content:space-between;align-items:center;padding:22px 0}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:700 21px "Bricolage Grotesque",sans-serif}
.brand img{width:34px;height:34px}.brand b{color:var(--violet)}
.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 22px;border-radius:999px;font-weight:600;text-decoration:none;transition:transform .2s,background .2s}
.btn:hover{transform:translateY(-2px)}
.btn-v{background:var(--violet);color:#fff}.btn-v:hover{background:#7C3AED}
.btn-o{border:1px solid var(--line);color:var(--sand)}
.btn-sm{padding:10px 18px;font-size:15px}
.hero{padding:56px 0 64px}
.crumb{font-size:14px;color:var(--sand-2);margin-bottom:22px}.crumb a{text-decoration:none}.crumb a:hover{text-decoration:underline}
.hero h1{font-size:clamp(38px,6vw,68px);max-width:15ch}
.lede{font-size:clamp(17px,2vw,20px);color:var(--sand-2);max-width:620px;margin:24px 0 32px}
.ctas{display:flex;flex-wrap:wrap;gap:12px}
section{padding:56px 0;border-top:1px solid var(--line)}
section h2{font-size:clamp(28px,4vw,42px);margin-bottom:28px;max-width:20ch}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px}
.card h3{font-size:20px;margin-bottom:8px}.card p{margin:0;color:var(--sand-2);font-size:15.5px}
.samples{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.sample{display:block;text-decoration:none;border:1px solid var(--line);border-radius:20px;overflow:hidden;background:var(--card);transition:transform .25s,border-color .25s}
.sample:hover{transform:translateY(-4px);border-color:rgba(139,92,246,.6)}
.sample img{aspect-ratio:16/10;height:auto;object-fit:cover;object-position:top;width:100%}
.sample .live{aspect-ratio:16/10;display:grid;place-items:center;background:linear-gradient(135deg,#1b1b1b,#2a1f45);font:800 34px "Bricolage Grotesque",sans-serif;text-align:center;padding:20px}
.sample span{display:flex;justify-content:space-between;gap:10px;padding:16px 20px;font-weight:600}
.sample em{font-style:normal;color:var(--violet)}
.plans{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.plan .price{font:800 40px "Bricolage Grotesque",sans-serif;margin:6px 0 2px}.plan small{color:var(--sand-2)}
.plan ul{margin:18px 0 0;padding:0;list-style:none}.plan li{padding:7px 0 7px 26px;position:relative;color:var(--sand-2);font-size:15.5px}
.plan li::before{content:"";position:absolute;left:4px;top:15px;width:8px;height:8px;border-radius:2px;background:var(--violet);transform:rotate(45deg)}
.free{margin-top:18px;color:var(--sand-2)}.free b{color:var(--sand)}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;counter-reset:s}
.steps .card{counter-increment:s}.steps .card::before{content:counter(s);display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--violet);color:#fff;font-weight:700;margin-bottom:14px}
details{border-top:1px solid var(--line);padding:4px 0}details:last-of-type{border-bottom:1px solid var(--line)}
summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:16px;padding:18px 0;font-weight:600;font-size:18px}
summary::-webkit-details-marker{display:none}summary::after{content:"+";color:var(--violet);font-size:24px;line-height:1}
details[open] summary::after{content:"–"}details p{margin:0 0 18px;color:var(--sand-2);max-width:760px}
.others{display:flex;flex-wrap:wrap;gap:10px}.others a{border:1px solid var(--line);border-radius:999px;padding:9px 16px;text-decoration:none;font-size:15px}.others a:hover{border-color:var(--violet)}
.cta-band{text-align:center;padding:72px 0}.cta-band h2{margin:0 auto 14px}.cta-band p{color:var(--sand-2);margin:0 0 28px}
footer{border-top:1px solid var(--line);padding:28px 0 40px;color:var(--sand-2);font-size:14px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}
footer a{text-decoration:none}footer a:hover{text-decoration:underline}
@media (max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}.steps{grid-template-columns:repeat(2,1fr)}}
@media (max-width:620px){.grid,.samples,.plans,.steps{grid-template-columns:1fr}.hero{padding:32px 0 44px}section{padding:44px 0}header .btn-sm{padding:9px 14px}.ctas .btn{width:100%;justify-content:center}}
</style>
</head>
<body>
<div class="wrap">
<header>
  <a class="brand" href="/"><img src="/favicon.svg" alt="" width="34" height="34"><span>make<b>4</b>yu</span></a>
  <a class="btn btn-v btn-sm" href="${wa(waText)}" target="_blank" rel="noopener" data-t="cta_whatsapp:${p.slug}:top">WhatsApp us</a>
</header>
<main>
<div class="hero">
  <div class="crumb"><a href="/">make4yu</a> › ${esc(p.short)}</div>
  <h1>${esc(p.h1)}</h1>
  <p class="lede">${esc(p.lede)}</p>
  <div class="ctas">
    <a class="btn btn-v" href="${wa(waText)}" target="_blank" rel="noopener" data-t="cta_whatsapp:${p.slug}:hero">Get 2 free samples on WhatsApp</a>
    <a class="btn btn-o" href="#pricing">See pricing</a>
  </div>
</div>

<section>
  <h2>What your ${esc(p.noun)} website includes</h2>
  <div class="grid">${p.features.map(([t, d]) => `<div class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</div>
</section>

<section>
  <h2>See what we build</h2>
  <div class="samples">${p.samples.map(s => `<a class="sample" href="${s.url}" target="_blank" rel="noopener">${s.img ? `<img src="/work/thumbs/${s.img}.jpg" alt="${esc(s.name)} website" loading="lazy" width="1280" height="800">` : `<div class="live">${esc(s.name.split(" — ")[0])}</div>`}<span>${esc(s.name)}<em>${s.live ? "Visit live site" : "Open sample"} ↗</em></span></a>`).join("")}</div>
</section>

<section id="pricing">
  <h2>Simple, one-time pricing</h2>
  <div class="plans">${p.plans.map(k => { const pl = PLANS[k]; return `<div class="card plan"><h3>${pl.name}</h3><div class="price">${pl.price}</div><small>${esc(pl.note)}</small><ul>${pl.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`; }).join("")}</div>
  <p class="free"><b>Start with 2 free samples.</b> Pay 50% only when you pick one, and the rest only when you love the finished site. Care plan (hosting, updates, backups and your own editor) is free for the first month, then from ₹1,999/month.</p>
</section>

<section>
  <h2>From hello to live in about a week</h2>
  <div class="steps">
    <div class="card"><h3>Say hi on WhatsApp</h3><p>Tell us your business name and what you do.</p></div>
    <div class="card"><h3>Get two free samples</h3><p>Two homepage designs made for you in 3–4 days.</p></div>
    <div class="card"><h3>We build your favourite</h3><p>Pay 50% to start. Two rounds of changes included.</p></div>
    <div class="card"><h3>Love it? Pay the rest</h3><p>Your website goes live and we look after it.</p></div>
  </div>
</section>

<section>
  <h2>Questions people ask</h2>
  ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n  ")}
</section>

<section>
  <h2>We also build websites for</h2>
  <div class="others">${others}</div>
</section>

<div class="cta-band">
  <h2>Let's make your ${esc(p.noun)} website happen.</h2>
  <p>Two free samples. No advance, no card.</p>
  <a class="btn btn-v" href="${wa(waText)}" target="_blank" rel="noopener" data-t="cta_whatsapp:${p.slug}:bottom">Get 2 free samples on WhatsApp</a>
</div>
</main>
<footer>
  <span>© ${new Date().getFullYear()} make4yu. All rights reserved.</span>
  <span><a href="/">make4yu.com</a> · <a href="mailto:${EMAIL}" data-t="cta_email:${p.slug}">${EMAIL}</a></span>
</footer>
</div>
<script>
(function(){
  var EP="https://script.google.com/macros/s/AKfycbwOFH3fuNlDOsOV59HZ4bmSYCZcsHMcNMtwc_qPF8Dn_-cOUN_NJVPoCoXx7WqWwWB7/exec";
  var ua=navigator.userAgent||"", qs=new URLSearchParams(location.search);
  if(navigator.webdriver||/bot|crawl|spider|slurp|headless|lighthouse|preview|screenshot|playwright|puppeteer|facebookexternalhit|whatsapp\\/|curl|wget/i.test(ua)) return;
  try{ if(localStorage.getItem("nw_owner")==="1") return; }catch(e){}
  var uid=function(){return Math.random().toString(36).slice(2,10)+Date.now().toString(36)}, vid;
  try{vid=localStorage.getItem("studio_vid")||uid();localStorage.setItem("studio_vid",vid)}catch(e){vid=uid()}
  var sid=uid(), ref=(qs.get("utm_source")||qs.get("ref")||"").toLowerCase().slice(0,40);
  if(!ref&&document.referrer){try{var h=new URL(document.referrer).hostname.replace(/^www\\./,"");ref=h.indexOf("google")>-1?"google":h.indexOf(location.hostname)>-1?"":h}catch(e){}}
  var device=/Mobi|Android|iPhone|iPad/i.test(ua)||innerWidth<760?"mobile":"desktop";
  function track(type,label){try{var body=JSON.stringify({action:"track",event:{ts:new Date().toISOString(),vid:vid,sid:sid,type:type,label:label||"",ref:ref||"direct",device:device,utm:qs.get("utm_campaign")||""}});
    if(!(navigator.sendBeacon&&navigator.sendBeacon(EP,new Blob([body],{type:"text/plain;charset=UTF-8"})))) fetch(EP,{method:"POST",mode:"no-cors",body:body});}catch(e){}}
  track("pageview","${p.slug}");
  document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("[data-t]");if(a){var t=a.getAttribute("data-t").split(":");track(t[0],t.slice(1).join(":"))}});
})();
</script>
</body>
</html>
`;
}

for (const p of PAGES) fs.writeFileSync(path.join(ROOT, "site", p.slug + ".html"), page(p));

const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(ROOT, "site", "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
${PAGES.map(p => `  <url><loc>${SITE}/${p.slug}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`).join("\n")}
</urlset>
`);
export const NICHE = PAGES.map(p => ({ slug: p.slug, short: p.short }));
console.log(`Built ${PAGES.length} pages + sitemap.xml`);
