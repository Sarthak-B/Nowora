/* make4yu visual website editor — opened from the client dashboard.
   Loads the client's real page (from their GitHub repo through the make4yu backend), lets them edit text,
   links, photos, animations, cards and sections, the theme colours and fonts, add ready-made sections for
   their niche, and publish. Publishing commits to the repo, which redeploys the site. */
(function () {
"use strict";
var H, E = {};
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
var NW = "data-nw";

/* ---------------- styles ---------------- */
var CSS = `
.nwe{position:fixed;inset:0;z-index:500;display:grid;grid-template-columns:280px minmax(0,1fr) 320px;grid-template-rows:60px minmax(0,1fr);background:#060908;color:#EAF2EE;font-family:"Instrument Sans",system-ui,sans-serif;animation:nweIn .45s cubic-bezier(.22,.8,.2,1)}
@keyframes nweIn{from{opacity:0;transform:scale(.985)}}
.nwe *{box-sizing:border-box}
.nwe button,.nwe input,.nwe textarea,.nwe select{font:inherit;color:inherit}
.nwe button{cursor:pointer;background:none;border:0}
.nwe-top{grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid rgba(234,242,238,.08);background:rgba(10,15,13,.92);min-width:0}
.nwe-back{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:10px;font-weight:600;font-size:14px;color:#A3B3AC}
.nwe-back:hover{color:#C6FF3D;background:rgba(255,255,255,.04)}
.nwe-title{min-width:0;display:flex;flex-direction:column;line-height:1.15;margin-right:auto}
.nwe-title b{font-family:"Bricolage Grotesque",sans-serif;font-size:15px}
.nwe-title span{font-size:12px;color:#6B7C75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.nwe-title span.has-page{display:block!important;max-width:none}
@media (max-width:600px){.nwe-title:has(.has-page) b{display:none}.nwe-page{margin-top:0;max-width:150px}.nwe-top:has(.has-page) #nweDev{display:none}}
.nwe-page{margin-top:3px;height:28px;max-width:220px;border-radius:8px;border:1px solid rgba(198,255,61,.45);background:#0E1613;color:#C6FF3D;font-weight:700;font-size:12.5px;padding:0 8px;cursor:pointer}
.nwe-seg{display:inline-flex;padding:3px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(234,242,238,.12)}
.nwe-seg button{height:30px;padding:0 12px;border-radius:999px;font-size:13px;font-weight:700;color:#A3B3AC;transition:all .25s}
.nwe-seg button.on{background:#C6FF3D;color:#0A0F0D;box-shadow:0 0 14px -3px rgba(198,255,61,.7)}
.nwe-ib{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:#A3B3AC;border:1px solid rgba(234,242,238,.1);transition:all .2s}
.nwe-ib:hover:not(:disabled){color:#C6FF3D;border-color:rgba(198,255,61,.5)}
.nwe-ib:disabled{opacity:.35;cursor:default}
.nwe-ib svg{width:17px;height:17px}
.nwe-status{font-size:12.5px;color:#6B7C75;white-space:nowrap}
.nwe-status.dirty{color:#FFB547}
.nwe-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 16px;border-radius:999px;font-weight:700;font-size:14px;background:rgba(255,255,255,.05);border:1px solid rgba(234,242,238,.14);transition:all .25s;white-space:nowrap}
.nwe-btn:hover{border-color:rgba(198,255,61,.5)}
.nwe-btn.primary{background:#C6FF3D;color:#0A0F0D;border-color:#C6FF3D;box-shadow:0 0 0 0 rgba(198,255,61,0)}
.nwe-btn.primary:hover{box-shadow:0 8px 30px -6px rgba(198,255,61,.6)}
.nwe-btn:disabled{opacity:.5;cursor:default}
.nwe-btn svg{width:16px;height:16px}
.nwe-left,.nwe-right{min-height:0;overflow:auto;background:#0A100E;scrollbar-width:thin}
.nwe-left{border-right:1px solid rgba(234,242,238,.08)}
.nwe-right{border-left:1px solid rgba(234,242,238,.08)}
.nwe-tabs{display:flex;gap:4px;padding:10px;position:sticky;top:0;background:#0A100E;z-index:2;border-bottom:1px solid rgba(234,242,238,.06)}
.nwe-tabs button{flex:1;height:34px;border-radius:10px;font-size:13px;font-weight:700;color:#6B7C75}
.nwe-tabs button.on{color:#C6FF3D;background:rgba(198,255,61,.08)}
.nwe-pane{padding:12px}
.nwe-h{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#6B7C75;margin:14px 2px 8px}
.nwe-h:first-child{margin-top:2px}
.nwe-sec{display:flex;align-items:center;gap:6px;padding:8px 8px 8px 10px;border-radius:12px;font-size:13.5px;cursor:pointer;border:1px solid transparent;transition:background .2s,border-color .2s}
.nwe-sec:hover{background:rgba(255,255,255,.04)}
.nwe-sec.on{border-color:rgba(198,255,61,.45);background:rgba(198,255,61,.06)}
.nwe-sec.off{opacity:.45}
.nwe-sec span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nwe-sec i{font-style:normal;font-size:11px;color:#6B7C75;margin-right:2px}
.nwe-mini{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;color:#6B7C75;flex:none}
.nwe-sec .nwe-mini:not([data-s=hide]){display:none}.nwe-sec:hover .nwe-mini,.nwe-sec.on .nwe-mini{display:grid}
.nwe-mini:hover{color:#C6FF3D;background:rgba(255,255,255,.06)}
.nwe-mini svg{width:14px;height:14px}
.nwe-block{display:grid;grid-template-columns:44px minmax(0,1fr);gap:10px;align-items:center;padding:10px;border-radius:14px;border:1px solid rgba(234,242,238,.08);margin-bottom:8px;cursor:pointer;text-align:left;width:100%;transition:all .25s}
.nwe-block:hover{border-color:rgba(198,255,61,.5);background:rgba(198,255,61,.04);transform:translateX(2px)}
.nwe-block .ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:rgba(198,255,61,.08);color:#C6FF3D;font-size:20px}
.nwe-block b{display:block;font-size:14px}.nwe-block small{display:block;font-size:12px;color:#6B7C75;line-height:1.35}
.nwe-canvas{position:relative;min-width:0;min-height:0;background:radial-gradient(circle at 50% 0%,rgba(198,255,61,.06),transparent 50%),#040706;overflow:hidden}
.nwe-wrap{position:absolute;top:0;bottom:0;left:50%;transform:translateX(-50%);overflow:hidden;background:#fff;transition:width .45s cubic-bezier(.22,.8,.2,1),border-radius .4s,top .4s,bottom .4s}
.nwe-wrap.phone{top:16px;bottom:16px;border-radius:30px;box-shadow:0 0 0 8px #141c19,0 30px 80px -20px rgba(0,0,0,.9)}
.nwe-wrap iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0;background:#fff}
.nwe-hover,.nwe-sel{position:absolute;pointer-events:none;border-radius:4px;z-index:3;transition:all .12s ease-out}
.nwe-hover{outline:1.5px dashed rgba(61,255,197,.9);outline-offset:-1px;opacity:0}
.nwe-sel{outline:2px solid #C6FF3D;outline-offset:-1px;box-shadow:0 0 0 4000px rgba(0,0,0,0),0 0 24px -4px rgba(198,255,61,.8);opacity:0}
.nwe-sel-bar{position:absolute;left:-2px;bottom:100%;margin-bottom:6px;display:flex;align-items:center;gap:2px;padding:3px 3px 3px 10px;border-radius:10px;background:#C6FF3D;color:#0A0F0D;font-size:12px;font-weight:800;white-space:nowrap;pointer-events:auto;box-shadow:0 8px 20px -8px rgba(0,0,0,.6)}
.nwe-sel.below .nwe-sel-bar{bottom:auto;top:100%;margin:6px 0 0}
.nwe-sel-bar button{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;color:#0A0F0D}
.nwe-sel-bar button:hover{background:rgba(0,0,0,.12)}
.nwe-sel-bar svg{width:14px;height:14px}
.nwe-sel-bar span{margin-right:6px}
.nwe-loading{position:absolute;inset:0;display:grid;place-items:center;z-index:4;background:#040706;color:#A3B3AC;font-size:14px;transition:opacity .4s}
.nwe-loading.gone{opacity:0;pointer-events:none}
.nwe-spin{width:30px;height:30px;border-radius:50%;border:3px solid rgba(255,255,255,.1);border-top-color:#C6FF3D;animation:nweSpin .8s linear infinite;margin:0 auto 12px}
@keyframes nweSpin{to{transform:rotate(360deg)}}
.nwe-empty{padding:30px 18px;text-align:center;color:#6B7C75;font-size:14px;line-height:1.5}
.nwe-empty b{display:block;color:#EAF2EE;font-family:"Bricolage Grotesque",sans-serif;font-size:18px;margin-bottom:6px}
.nwe-insp-h{display:flex;align-items:center;gap:8px;padding:14px 14px 4px}
.nwe-insp-h b{font-family:"Bricolage Grotesque",sans-serif;font-size:18px;flex:1;min-width:0}
.nwe-crumb{font-size:12px;color:#6B7C75;padding:0 14px 6px}
.nwe-crumb button{color:#3DFFC5;font-weight:700;font-size:12px;padding:0}
.nwe-group{padding:12px 14px;border-top:1px solid rgba(234,242,238,.06)}
.nwe-group>label,.nwe-lbl{display:block;font-size:12px;font-weight:700;color:#A3B3AC;margin-bottom:6px}
.nwe-auto{display:block;font-size:11px;font-weight:600;color:#7CB800;margin-top:2px}
.nwe-in,.nwe-ta,.nwe-select{width:100%;border-radius:10px;border:1px solid rgba(234,242,238,.14);background:rgba(0,0,0,.35);padding:9px 11px;font-size:14px;color:#EAF2EE;transition:border-color .2s,box-shadow .2s}
.nwe-ta{min-height:84px;resize:vertical;line-height:1.45}
.nwe-in:focus,.nwe-ta:focus,.nwe-select:focus{outline:none;border-color:#C6FF3D;box-shadow:0 0 0 3px rgba(198,255,61,.12)}
.nwe-hint{font-size:11.5px;color:#6B7C75;margin-top:6px;line-height:1.4}
.nwe-hint code{background:rgba(255,255,255,.07);padding:0 4px;border-radius:4px;color:#C6FF3D}
.nwe-chips{display:flex;flex-wrap:wrap;gap:6px}
.nwe-chips button{height:32px;padding:0 11px;border-radius:999px;border:1px solid rgba(234,242,238,.14);font-size:12.5px;font-weight:700;color:#A3B3AC;transition:all .2s}
.nwe-chips button.on{background:#C6FF3D;border-color:#C6FF3D;color:#0A0F0D}
.nwe-row{display:flex;gap:8px;align-items:center}
.nwe-row>*{flex:1}
.nwe-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.nwe-actions .nwe-btn{width:100%;font-size:13px;padding:0 10px}
.nwe-danger{color:#FF5C7A!important}
.nwe-img{display:block;width:100%;aspect-ratio:16/10;border-radius:12px;background:#111 center/cover;border:1px solid rgba(234,242,238,.1);margin-bottom:8px}
.nwe-file{display:none}
.nwe-swatch{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:12px;transition:background .2s}
.nwe-swatch:hover{background:rgba(255,255,255,.04)}
.nwe-swatch input[type=color]{width:34px;height:34px;border:0;border-radius:10px;padding:0;background:none;cursor:pointer;flex:none}
.nwe-swatch input[type=color]::-webkit-color-swatch-wrapper{padding:0}.nwe-swatch input[type=color]::-webkit-color-swatch{border:1px solid rgba(255,255,255,.2);border-radius:9px}
.nwe-swatch b{font-size:13px;flex:1;text-transform:capitalize}
.nwe-swatch code{font-size:11.5px;color:#6B7C75}
.nwe-modal{position:fixed;inset:0;z-index:520;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);animation:nweIn .3s}
.nwe-card{width:min(480px,100%);max-height:86vh;overflow:auto;background:#0E1613;border:1px solid rgba(198,255,61,.25);border-radius:22px;padding:24px;box-shadow:0 40px 100px -30px rgba(0,0,0,.9)}
.nwe-card h3{font-family:"Bricolage Grotesque",sans-serif;font-size:24px;letter-spacing:-.02em;margin:0 0 6px}
.nwe-card p{color:#A3B3AC;font-size:14px;margin:0 0 14px;line-height:1.5}
.nwe-card .nwe-row{margin-top:16px;justify-content:flex-end}
.nwe-card .nwe-row>*{flex:0 0 auto}
.nwe-ver{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid rgba(234,242,238,.07);font-size:13.5px}
.nwe-ver div{flex:1;min-width:0}.nwe-ver small{display:block;color:#6B7C75;font-size:12px}
.nwe-done{text-align:center}
.nwe-done .tick{width:64px;height:64px;border-radius:50%;margin:4px auto 14px;display:grid;place-items:center;background:#C6FF3D;color:#0A0F0D;box-shadow:0 0 40px rgba(198,255,61,.6);animation:nwePop .6s cubic-bezier(.34,1.56,.64,1)}
.nwe-done .tick svg{width:30px;height:30px}
@keyframes nwePop{from{transform:scale(.3);opacity:0}}
.nwe-mob{display:none}
.nwe-sheet-x{display:none}
@media (max-width:1100px){.nwe{grid-template-columns:240px minmax(0,1fr) 290px}.nwe-status{display:none}}
@media (max-width:900px){
  .nwe{grid-template-columns:minmax(0,1fr);grid-template-rows:56px minmax(0,1fr)}
  .nwe-top{gap:6px;padding:0 8px}.nwe-title span,.nwe-mode-seg,.nwe-hide-m{display:none}
  .nwe-left,.nwe-right{position:fixed;left:0;right:0;bottom:0;z-index:510;max-height:62vh;padding-bottom:76px;border:0;border-top:1px solid rgba(198,255,61,.3);border-radius:22px 22px 0 0;transform:translateY(105%);transition:transform .45s cubic-bezier(.22,.8,.2,1);box-shadow:0 -20px 60px -10px rgba(0,0,0,.8)}
  .nwe-left.open,.nwe-right.open{transform:none}
  .nwe-mob{display:flex;position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:515;gap:6px;padding:6px;border-radius:18px;background:rgba(14,22,19,.92);border:1px solid rgba(234,242,238,.14);box-shadow:0 20px 40px -10px rgba(0,0,0,.8)}
  .nwe-mob button{height:40px;padding:0 14px;border-radius:12px;font-size:13px;font-weight:700;color:#A3B3AC}
  .nwe-mob button.on{color:#0A0F0D;background:#C6FF3D}
  .nwe-sheet-x{display:grid;margin-left:auto}
  .nwe-btn{height:36px;padding:0 12px}
}
@media (prefers-reduced-motion:reduce){.nwe,.nwe *{animation:none!important;transition:none!important}}
`;

var ICO = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m18 15-6-6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg>',
  dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeoff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/></svg>',
  parent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>',
  hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 5 5 9-10"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg>'
};

/* ---------------- helpers ---------------- */
function toast(m) { H.toast(m); }
function uid() { return "n" + (E.next++).toString(36); }
// line breaks are never edited on their own, and sites' scripts often split text on a plain <br>
function tagAll(root) { (root.nodeType === 1 ? [root].concat($$("*", root)) : $$("*", root)).forEach(function (el) { if (/^(BR|WBR)$/.test(el.tagName)) { el.removeAttribute(NW); return; } if (!el.hasAttribute(NW) || root.nodeType === 1) el.setAttribute(NW, uid()); }); }
function model(id) { return id ? E.doc.querySelector("[" + NW + '="' + id + '"]') : null; }
function views(id) { var d = E.frame && E.frame.contentDocument; return d ? $$("[" + NW + '="' + id + '"]', d) : []; }
function view(id) { var v = views(id); for (var i = 0; i < v.length; i++) { var r = v[i].getBoundingClientRect(); if (r.width || r.height) return v[i]; } return v[0] || null; }
function serialize(doc) { return E.doctype + (doc || E.doc).documentElement.outerHTML; }
function parse(html) { return new DOMParser().parseFromString(html, "text/html"); }
var TEXT_TAGS = /^(H[1-6]|P|SPAN|A|BUTTON|LI|SMALL|B|STRONG|EM|I|LABEL|FIGCAPTION|BLOCKQUOTE|SUMMARY|DT|DD|TD|TH|CITE|Q|MARK|U|TIME)$/;
var INLINE_OK = /^(EM|I|STRONG|B|BR|SPAN|SMALL|U|MARK|SUP|SUB)$/;
var EMPH = /^(EM|I|STRONG|B|BR)$/;
function isTexty(el) {
  if (!el || !TEXT_TAGS.test(el.tagName)) return false;
  var ok = true;
  $$("*", el).forEach(function (c) { if (!EMPH.test(c.tagName) || c.children.length) ok = false; });
  return ok && el.textContent.trim().length > 0;
}
// buttons and labels with icons/arrows inside: edit only their own words, keep the icon
function labelNode(el) {
  if (!el || isTexty(el)) return null;
  var best = null;
  el.childNodes.forEach(function (n) { if (n.nodeType === 3 && n.textContent.trim() && (!best || n.textContent.trim().length > best.textContent.trim().length)) best = n; });
  return best;
}
// text <-> lightweight markup: *accent* for <em>/<i>, **bold** for <strong>/<b>, new line for <br>
function toMark(el) {
  var out = "";
  el.childNodes.forEach(function (n) {
    if (n.nodeType === 3) out += n.textContent.replace(/\s+/g, " ");
    else if (n.nodeType === 1) {
      if (n.tagName === "BR") out += "\n";
      else if (/^(EM|I)$/.test(n.tagName)) out += "*" + toMark(n) + "*";
      else if (/^(STRONG|B)$/.test(n.tagName)) out += "**" + toMark(n) + "**";
      else out += toMark(n);
    }
  });
  return out;
}
function fromMark(el, text) {
  var emTag = (el.querySelector("em") ? "em" : el.querySelector("i") ? "i" : "em"), bTag = el.querySelector("b") ? "b" : "strong";
  var emAttrs = attrsOf(el.querySelector(emTag)), bAttrs = attrsOf(el.querySelector(bTag));
  var h = esc(text.replace(/^\s+|\s+$/g, ""))
    .replace(/\*\*([^*]+)\*\*/g, "<" + bTag + bAttrs + ">$1</" + bTag + ">")
    .replace(/\*([^*]+)\*/g, "<" + emTag + emAttrs + ">$1</" + emTag + ">")
    .replace(/\n/g, "<br>");
  var keep = el.getAttribute(NW);
  el.innerHTML = h;
  tagAll(el); el.setAttribute(NW, keep);
}
function attrsOf(n) { if (!n) return ""; return Array.prototype.map.call(n.attributes, function (a) { return a.name === NW ? "" : " " + a.name + '="' + esc(a.value) + '"'; }).join(""); }
function friendly(el) {
  if (!el) return "";
  var t = el.tagName, cls = (el.getAttribute("class") || "").toLowerCase();
  if (isSection(el)) return "Section · " + secName(el);
  if (t === "H1") return "Main headline"; if (/^H[23]$/.test(t)) return "Heading"; if (/^H[4-6]$/.test(t)) return "Small heading";
  if (t === "P") return "Paragraph"; if (t === "IMG") return "Photo"; if (t === "LI") return "List item";
  if (t === "A" || t === "BUTTON") return /btn|button|cta/.test(cls) || t === "BUTTON" ? "Button" : "Link";
  if (t === "NAV") return "Menu"; if (t === "FORM") return "Form"; if (/^(INPUT|SELECT|TEXTAREA)$/.test(t)) return "Form field";
  if (t === "DETAILS") return "Question"; if (t === "FIGURE") return "Photo block";
  if (repeated(el)) return "Card";
  if (bgImage(el)) return "Photo";
  return "Block";
}
function repeated(el) { var p = el.parentElement; if (!p) return false; var key = el.tagName + "." + (el.getAttribute("class") || "").split(/\s+/)[0]; return Array.prototype.filter.call(p.children, function (c) { return c.tagName + "." + (c.getAttribute("class") || "").split(/\s+/)[0] === key; }).length > 1; }
function bgImage(el) { var m = /background(?:-image)?\s*:[^;]*url\((['"]?)([^'")]+)\1\)/i.exec(el.getAttribute("style") || ""); return m ? m[2] : ""; }
var SKIP_SEC = /(^|\s)(intro|grain|cursor|progress|fab|preloader|loader|curtain|toast|skip)(\s|$)/i;
function sectionParent() { var b = E.doc.body, kids = Array.prototype.filter.call(b.children, function (c) { return !/^(SCRIPT|STYLE|NOSCRIPT|LINK|TEMPLATE)$/.test(c.tagName); }); var main = kids.filter(function (c) { return c.tagName === "MAIN"; }); return main.length === 1 && main[0].children.length > 2 ? main[0] : b; }
function sections() {
  var p = sectionParent(), list = [];
  if (p !== E.doc.body) Array.prototype.forEach.call(E.doc.body.children, function (c) { if (c.tagName === "HEADER" || c.tagName === "NAV") list.push(c); });
  Array.prototype.forEach.call(p.children, function (c) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|LINK|TEMPLATE|DIALOG)$/.test(c.tagName)) return;
    if (SKIP_SEC.test(c.getAttribute("class") || "") || c.getAttribute("aria-hidden") === "true" && !c.textContent.trim()) return;
    list.push(c);
  });
  if (p !== E.doc.body) Array.prototype.forEach.call(E.doc.body.children, function (c) { if (c.tagName === "FOOTER") list.push(c); });
  return list;
}
function isSection(el) { return sections().indexOf(el) >= 0; }
function secName(el) {
  var id = el.id || "", h = el.querySelector("h1,h2,h3");
  var cls = el.getAttribute("class") || "";
  if (el.tagName === "HEADER") return "Top bar";
  if (/mobile|menu|drawer/i.test(cls + " " + (el.getAttribute("aria-label") || "")) && !h) return "Phone menu";
  if (el.tagName === "NAV") return "Menu";
  if (/ribbon|marquee|ticker|strip/i.test(cls)) return "Scrolling text strip";
  if (el.tagName === "FOOTER") return "Footer";
  if (h && h.textContent.trim()) return h.textContent.trim().replace(/\s+/g, " ").slice(0, 34);
  var al = el.getAttribute("aria-label"); if (al) return al.charAt(0).toUpperCase() + al.slice(1, 34);
  if (el.getAttribute("aria-hidden") === "true" && el.textContent.trim()) return "Transition: " + el.textContent.trim().replace(/\s+/g, " ").slice(0, 22);
  if (id) return id.replace(/[-_]/g, " ").replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  var c = (el.getAttribute("class") || "").split(/\s+/)[0]; return c ? c.replace(/[-_]/g, " ") : el.tagName.toLowerCase();
}

/* ---------------- open / load ---------------- */
function open(host) {
  H = host;
  if (!$("#nwe-css")) { var st = document.createElement("style"); st.id = "nwe-css"; st.textContent = CSS; document.head.appendChild(st); }
  E = { next: 1, mode: "edit", dev: innerWidth < 900 ? "phone" : "desk", sel: null, hist: [], hi: -1, dirty: false, leftTab: "sections" };
  var root = document.createElement("div"); root.className = "nwe"; root.id = "nwe";
  root.innerHTML =
    '<header class="nwe-top"><button class="nwe-back" id="nweBack">' + ICO.back + '<span class="nwe-hide-m">Dashboard</span></button>' +
    '<div class="nwe-title"><b>Website editor</b><span id="nweHost">Loading…</span></div>' +
    '<div class="nwe-seg nwe-mode-seg" id="nweMode"><button data-v="edit" class="on">Edit</button><button data-v="preview">Preview</button></div>' +
    '<div class="nwe-seg" id="nweDev"><button data-v="desk">Desktop</button><button data-v="phone">Phone</button></div>' +
    '<button class="nwe-ib" id="nweUndo" title="Undo (Ctrl+Z)" disabled>' + ICO.undo + '</button><button class="nwe-ib" id="nweRedo" title="Redo (Ctrl+Shift+Z)" disabled>' + ICO.redo + '</button>' +
    '<span class="nwe-status" id="nweStatus"></span>' +
    '<button class="nwe-ib" id="nweHist" title="Version history">' + ICO.hist + '</button>' +
    '<button class="nwe-btn primary" id="nwePub" disabled>' + ICO.rocket + 'Publish</button></header>' +
    '<aside class="nwe-left" id="nweLeft"><div class="nwe-tabs"><button data-t="sections" class="on">Sections</button><button data-t="add">Add</button><button data-t="theme">Theme</button><button class="nwe-mini nwe-sheet-x" data-x>' + ICO.x + '</button></div><div class="nwe-pane" id="nweLeftPane"></div></aside>' +
    '<main class="nwe-canvas" id="nweCanvas"><div class="nwe-wrap" id="nweWrap"><iframe id="nweFrame" title="Your website" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe><div class="nwe-hover" id="nweHover"></div><div class="nwe-sel" id="nweSel"><div class="nwe-sel-bar"><span id="nweSelName"></span><button data-a="parent" title="Select the block around it">' + ICO.parent + '</button><button data-a="up" title="Move up">' + ICO.up + '</button><button data-a="down" title="Move down">' + ICO.down + '</button><button data-a="dup" title="Duplicate">' + ICO.dup + '</button><button data-a="del" title="Delete">' + ICO.del + '</button></div></div></div>' +
    '<div class="nwe-loading" id="nweLoading"><div><div class="nwe-spin"></div>Opening your website…</div></div></main>' +
    '<aside class="nwe-right" id="nweRight"><div id="nweInsp"></div></aside>' +
    '<nav class="nwe-mob" id="nweMob"><button data-m="sections">Sections</button><button data-m="add">Add</button><button data-m="theme">Theme</button><button data-m="preview">Preview</button></nav>';
  document.body.appendChild(root);
  document.documentElement.style.overflow = "hidden";
  wireShell();
  load();
}

async function load(page) {
  try {
    var j = await H.call("site_source", page ? { path: page } : {});
    var s = j.site; E.site = s; E.sel = null; E.dirty = false; E.next = 1;
    pageMenu(s);
    E.doctype = (/^\s*<!doctype[^>]*>/i.exec(s.html) || ["<!doctype html>"])[0].trim() + "\n";
    E.sha = s.sha; E.path = s.path;
    var draft = readDraft();
    E.doc = parse(s.html); tagAll(E.doc.body); E.engine = /data-reveal/.test(s.html);
    E.baseHist = serialize();
    if (draft && draft.html && draft.html !== E.baseHist) {
      askDraft(draft, function (use) { if (use) { E.doc = parse(draft.html); syncNext(); } finishLoad(!!use); });
    } else finishLoad(false);
  } catch (x) {
    $("#nweLoading").innerHTML = '<div class="nwe-empty"><b>The editor couldn\'t open</b>' + esc(x.message) + '<br><br><button class="nwe-btn" id="nweClose2">Back to dashboard</button></div>';
    $("#nweClose2").onclick = close;
  }
}
/* every page of the website, not just the home page */
function pageMenu(s) {
  var host = (s.url || "").replace(/^https?:\/\//, "").replace(/\/$/, ""), el = $("#nweHost");
  var draw = function () {
    var ps = E.pages || [];
    if (ps.length < 2) { el.textContent = host + " · " + s.path; return; }
    el.classList.add("has-page");
    el.innerHTML = '<select class="nwe-page" id="nwePage" aria-label="Page to edit">' + ps.map(function (p) { return '<option value="' + esc(p.path) + '"' + (p.path === s.path ? " selected" : "") + '>' + esc(p.name) + " page</option>"; }).join("") + "</select>";
    $("#nwePage").onchange = function () { var to = this.value; saveDraft(); $("#nweLoading").classList.remove("gone"); load(to); };
  };
  if (E.pages) return draw();
  el.textContent = host + " · " + s.path;
  if (H.call) H.call("site_pages").then(function (j) { E.pages = j.pages || []; draw(); }).catch(function () { /* older backend: home page only */ });
}
function syncNext() { var max = 0; $$("[" + NW + "]", E.doc).forEach(function (el) { var n = parseInt(String(el.getAttribute(NW)).slice(1), 36); if (n > max) max = n; }); E.next = max + 1; }
function finishLoad(fromDraft) {
  E.hist = [E.baseHist]; E.hi = 0;
  if (fromDraft) { push(); E.dirty = true; }
  render(true);
  renderLeft(); inspector(); status();
}

/* ---------------- preview rendering ---------------- */
var EDIT_CSS = '<style id="nw-editor-only">.intro,.preloader,.loader,#preloader,.curtain,.grain,.cursor,.progress{display:none!important}' +
  '[data-reveal],[data-split] .w>span,[data-split] .w,[data-nw-anim]{opacity:1!important;transform:none!important;filter:none!important;clip-path:none!important;transition:none!important;animation:none!important}' +
  'html{scroll-behavior:auto!important}a,button,summary,label{cursor:default!important}[contenteditable=true]{outline:none;cursor:text!important;caret-color:#7CB800}</style>';
function previewHtml() {
  var html = serialize();
  var base = (E.site.pageUrl || E.site.url || location.origin + "/").replace(/[?#].*$/, ""); if (!/\/$/.test(base)) base += "/";
  var inject = '<base href="' + esc(base) + '">' + (E.mode === "edit" ? EDIT_CSS : "");
  return html.replace(/<head([^>]*)>/i, function (m) { return m + inject; });
}
function render(first) {
  var fr = $("#nweFrame"), keepY = 0;
  try { keepY = fr.contentWindow ? fr.contentWindow.scrollY : 0; } catch (e) {}
  E.frame = fr;
  $("#nweLoading").classList.toggle("gone", !first);
  fr.onload = function () {
    var d = fr.contentDocument, w = fr.contentWindow;
    if (!d) return;
    try { w.scrollTo(0, keepY); setTimeout(function () { w.scrollTo(0, keepY); }, 60); } catch (e) {}
    hookFrame(d, w);
    $("#nweLoading").classList.add("gone");
    if (!E.tokens) E.tokens = readTokens(d, w);
    layout(); drawBoxes();
    var q = E.after || []; E.after = []; setTimeout(function () { q.forEach(function (f) { f(); }); }, 120);
  };
  fr.srcdoc = previewHtml();
  layout();
}
function whenLoaded(fn) { (E.after = E.after || []).push(fn); }
function layout() {
  var c = $("#nweCanvas"), wrap = $("#nweWrap"), fr = $("#nweFrame"); if (!c) return;
  var cw = c.clientWidth, ch = c.clientHeight, phone = E.dev === "phone";
  wrap.classList.toggle("phone", phone);
  var vw = phone ? 390 : Math.max(cw, 1280), w = phone ? Math.min(390, cw - 24) : cw, s = w / vw;
  var h = phone ? ch - 32 : ch;
  wrap.style.width = w + "px";
  fr.style.width = vw + "px"; fr.style.height = Math.ceil(h / s) + "px"; fr.style.transform = "scale(" + s + ")";
  E.scale = s;
  $$("#nweDev button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === E.dev); });
}
function hookFrame(d, w) {
  d.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (E.mode === "preview") { if (a && !/^#/.test(a.getAttribute("href") || "")) { e.preventDefault(); window.open(a.href, "_blank", "noopener"); } return; }
    e.preventDefault(); e.stopPropagation();
    var el = e.target.closest && e.target.closest("[" + NW + "]");
    if (!el || el === d.body || el === d.documentElement) return;
    var id = el.getAttribute(NW);
    if (E.sel === id && isTexty(model(id)) && !el.closest("[data-split]")) return inlineEdit(el);
    select(id);
  }, true);
  d.addEventListener("submit", function (e) { e.preventDefault(); }, true);
  d.addEventListener("mouseover", function (e) { if (E.mode !== "edit") return; var el = e.target.closest && e.target.closest("[" + NW + "]"); E.hover = el && el !== d.body ? el : null; drawBoxes(); });
  d.addEventListener("mouseleave", function () { E.hover = null; drawBoxes(); });
  w.addEventListener("scroll", drawBoxes, { passive: true });
  w.addEventListener("resize", drawBoxes);
  d.addEventListener("keydown", keys);
}
function box(elv, node) {
  if (!elv || !node) { if (node) node.style.opacity = 0; return; }
  var r = elv.getBoundingClientRect(), s = E.scale || 1;
  if (!r.width && !r.height) { node.style.opacity = 0; return; }
  node.style.left = r.left * s + "px"; node.style.top = r.top * s + "px"; node.style.width = r.width * s + "px"; node.style.height = r.height * s + "px"; node.style.opacity = 1;
  return r;
}
function drawBoxes() {
  if (!$("#nweSel")) return;
  var editing = E.mode === "edit";
  box(editing && E.hover && E.hover.getAttribute(NW) !== E.sel ? E.hover : null, $("#nweHover"));
  var sv = editing && E.sel ? view(E.sel) : null, r = box(sv, $("#nweSel"));
  if (r) $("#nweSel").classList.toggle("below", r.top * (E.scale || 1) < 40);
}

/* ---------------- selection + inline editing ---------------- */
function select(id, scroll) {
  E.sel = id;
  var m = model(id);
  $("#nweSelName").textContent = friendly(m);
  if (scroll) { var v = view(id); if (v) v.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(drawBoxes, 450); }
  drawBoxes(); inspector(); renderLeft();
  if (innerWidth <= 900 && id) { $("#nweLeft").classList.remove("open"); $("#nweRight").classList.add("open"); }
}
function inlineEdit(v) {
  var id = v.getAttribute(NW), m = model(id);
  v.contentEditable = "true"; v.focus();
  var sel = v.ownerDocument.getSelection(); try { sel.selectAllChildren(v); sel.collapseToEnd(); } catch (e) {}
  var sync = function () { var c = v.cloneNode(true); c.removeAttribute("contenteditable"); m.innerHTML = c.innerHTML; tagAll(m); m.setAttribute(NW, id); var ta = $("#nweText"); if (ta && document.activeElement !== ta) ta.value = toMark(m); markDirty(); drawBoxes(); };
  v.oninput = sync;
  v.onpaste = function (e) { e.preventDefault(); var t = (e.clipboardData.getData("text/plain") || "").replace(/\s+/g, " "); v.ownerDocument.execCommand("insertText", false, t); };
  v.onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); v.blur(); } if (e.key === "Escape") v.blur(); };
  v.onblur = function () { v.contentEditable = "false"; v.oninput = v.onblur = v.onkeydown = null; push(); };
}

/* ---------------- history, drafts, status ---------------- */
var pushT;
function markDirty() { E.dirty = true; status(); clearTimeout(pushT); pushT = setTimeout(push, 700); }
function push() {
  clearTimeout(pushT);
  var s = serialize();
  if (E.hist[E.hi] === s) return status();
  E.hist = E.hist.slice(0, E.hi + 1); E.hist.push(s); if (E.hist.length > 60) E.hist.shift(); E.hi = E.hist.length - 1;
  E.dirty = s !== E.baseHist; saveDraft(); status();
}
function undo(dir) {
  var i = E.hi + dir; if (i < 0 || i >= E.hist.length) return;
  E.hi = i; E.doc = parse(E.hist[i]); syncNext(); E.dirty = E.hist[i] !== E.baseHist;
  if (E.sel && !model(E.sel)) E.sel = null;
  render(); renderLeft(); inspector(); saveDraft(); status();
}
function status() {
  var st = $("#nweStatus"); if (!st) return;
  st.textContent = E.dirty ? "Unpublished changes · draft saved on this device" : "Everything is published";
  st.classList.toggle("dirty", E.dirty);
  $("#nwePub").disabled = !E.dirty;
  $("#nweUndo").disabled = E.hi <= 0; $("#nweRedo").disabled = E.hi >= E.hist.length - 1;
}
function draftKey() { return "nw_draft_" + (H.key || "demo") + (E.path && E.pages && E.pages[0] && E.path !== E.pages[0].path ? ":" + E.path : ""); }
function saveDraft() { try { if (E.dirty) localStorage.setItem(draftKey(), JSON.stringify({ sha: E.sha, html: serialize(), ts: Date.now() })); else localStorage.removeItem(draftKey()); } catch (e) { /* storage full: drafts are a convenience only */ } }
function readDraft() { try { return JSON.parse(localStorage.getItem(draftKey()) || "null"); } catch (e) { return null; } }
function askDraft(d, cb) {
  var when = new Date(d.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  modal(d.sha !== E.sha && d.sha
    ? '<h3>Your website has been updated</h3><p>Your website changed after your unpublished edits from ' + when + ', so the editor now shows the newest version. Your old draft is based on the earlier version: keeping it would undo the newer changes when you publish.</p><div class="nwe-row"><button class="nwe-btn" data-r="1">Keep my old draft anyway</button><button class="nwe-btn primary" data-r="0">Use the newest version</button></div>'
    : '<h3>Continue where you left off?</h3><p>You have unpublished changes from ' + when + '.</p><div class="nwe-row"><button class="nwe-btn" data-r="0">Start fresh</button><button class="nwe-btn primary" data-r="1">Continue editing</button></div>',
    function (card, done) { $$("[data-r]", card).forEach(function (b) { b.onclick = function () { done(); if (b.dataset.r === "0") { try { localStorage.removeItem(draftKey()); } catch (e) {} } cb(b.dataset.r === "1"); }; }); });
}

/* ---------------- edits ---------------- */
function apply(fn, rerender) {
  fn();
  if (rerender) render();
  markDirty(); push(); renderLeft(); inspector();
}
function liveSync(id) { var m = model(id); views(id).forEach(function (v) { if (v.isContentEditable) return; v.innerHTML = m.innerHTML; }); drawBoxes(); }
function setAttr(id, name, val) { var m = model(id); if (val === null || val === undefined || val === "") m.removeAttribute(name); else m.setAttribute(name, val); views(id).forEach(function (v) { if (val === null || val === undefined || val === "") v.removeAttribute(name); else v.setAttribute(name, val); }); markDirty(); }
function action(a) {
  var m = model(E.sel); if (!m) return;
  if (a === "parent") { var p = m.parentElement && m.parentElement.closest("[" + NW + "]"); if (p && p !== E.doc.body) select(p.getAttribute(NW), true); return; }
  if (a === "up" || a === "down") {
    var sib = a === "up" ? m.previousElementSibling : m.nextElementSibling;
    while (sib && /^(SCRIPT|STYLE)$/.test(sib.tagName)) sib = a === "up" ? sib.previousElementSibling : sib.nextElementSibling;
    if (!sib) return toast(a === "up" ? "It's already first" : "It's already last");
    apply(function () { if (a === "up") sib.before(m); else sib.after(m); }, true);
    var keep = E.sel; whenLoaded(function () { select(keep, true); }); return;
  }
  if (a === "dup") {
    var c = m.cloneNode(true); tagAll(c); var nid = c.getAttribute(NW);
    apply(function () { m.after(c); }, true);
    whenLoaded(function () { select(nid, true); }); toast(friendly(c) === "Card" ? "Card added — edit its text and photo" : "Duplicated"); return;
  }
  if (a === "del") {
    if (!confirm("Delete this " + friendly(m).toLowerCase().split(" ·")[0] + "? You can undo it.")) return;
    apply(function () { m.remove(); E.sel = null; }, true); return;
  }
}

/* ---------------- inspector ---------------- */
function inspector() {
  var box = $("#nweInsp"); if (!box) return;
  var m = model(E.sel);
  if (!m) {
    box.innerHTML = '<div class="nwe-insp-h"><b>Edit anything</b><button class="nwe-mini nwe-sheet-x" data-x>' + ICO.x + '</button></div><div class="nwe-empty" style="text-align:left;padding:8px 14px 20px">Click any text, button, photo or card on your page to change it.<br><br>' +
      '• <b style="display:inline;font-size:14px;font-family:inherit">Click twice</b> on text to type right on the page.<br>• Use <b style="display:inline;font-size:14px;font-family:inherit">Sections</b> to reorder, hide or duplicate whole parts.<br>• Use <b style="display:inline;font-size:14px;font-family:inherit">Add</b> for new sections made for your business.<br>• <b style="display:inline;font-size:14px;font-family:inherit">Publish</b> when you\'re happy — your site updates in about a minute.</div>';
    wireX(box); return;
  }
  var id = E.sel, t = m.tagName, html = "";
  var parent = m.parentElement && m.parentElement.closest("[" + NW + "]");
  html += '<div class="nwe-insp-h"><b>' + esc(friendly(m)) + '</b><button class="nwe-mini nwe-sheet-x" data-x>' + ICO.x + '</button></div>';
  if (parent && parent !== E.doc.body && !isSection(m) && parent !== sectionParent()) html += '<div class="nwe-crumb">Inside: <button data-a="parent">' + esc(friendly(parent)) + '</button></div>';
  // text
  var lab = labelNode(m), labIdx = lab ? Array.prototype.indexOf.call(m.childNodes, lab) : -1;
  if (lab) html += '<div class="nwe-group"><label for="nweLabel">Text</label><input class="nwe-in" id="nweLabel" value="' + esc(lab.textContent.trim()) + '"></div>';
  if (isTexty(m)) html += '<div class="nwe-group"><label for="nweText">Text</label><textarea class="nwe-ta" id="nweText">' + esc(toMark(m)) + '</textarea><div class="nwe-hint">Wrap words in <code>*stars*</code> for the accent style, <code>**double**</code> for bold. Or click the text twice to type on the page.</div></div>';
  else if (/^(INPUT|TEXTAREA)$/.test(t)) html += '<div class="nwe-group"><label>Placeholder</label><input class="nwe-in" data-attr="placeholder" value="' + esc(m.getAttribute("placeholder") || "") + '"></div>';
  // link / whatsapp
  var a = t === "A" ? m : (m.closest && m.closest("a"));
  if (a && a.getAttribute("href") !== null) {
    var href = a.getAttribute("href") || "", aid = a.getAttribute(NW), wa = /wa\.me\/(\d+)\?text=([^&#]*)/.exec(href);
    html += '<div class="nwe-group"><label>Where it goes</label>' +
      (wa ? '<div class="nwe-row"><input class="nwe-in" id="nweWaNum" value="' + esc(wa[1]) + '" placeholder="91XXXXXXXXXX"></div><label class="nwe-lbl" style="margin-top:10px">WhatsApp message</label><textarea class="nwe-ta" id="nweWaMsg" style="min-height:64px">' + esc(decodeURIComponent(wa[2].replace(/\+/g, " "))) + '</textarea>'
          : '<input class="nwe-in" id="nweHref" data-for="' + aid + '" value="' + esc(href) + '" placeholder="https:// or #section">') +
      '<div class="nwe-hint">' + (wa ? "Visitors land in WhatsApp with this message ready to send." : "A web address, <code>tel:+91…</code>, <code>mailto:</code>, or <code>#section</code> to jump on the page.") + '</div></div>';
  }
  if (m.hasAttribute("data-wa")) html += '<div class="nwe-group"><label>WhatsApp message</label><textarea class="nwe-ta" data-attr="data-wa" style="min-height:64px">' + esc(m.getAttribute("data-wa")) + '</textarea></div>';
  // image
  var img = t === "IMG" ? m : null, bg = bgImage(m);
  if (!img && !bg && m.querySelectorAll("img").length === 1 && m.children.length <= 3) img = m.querySelector("img");
  if (img || bg) {
    var src = img ? (img.getAttribute("src") || "") : bg;
    html += '<div class="nwe-group"><label>Photo</label><span class="nwe-img" style="background-image:url(\'' + esc(absUrl(src)) + '\')"></span><div class="nwe-row"><button class="nwe-btn" id="nwePick">Replace photo</button></div><input type="file" accept="image/*" class="nwe-file" id="nweFile">' +
      (img ? '<label class="nwe-lbl" style="margin-top:12px">Describe the photo (for Google and screen readers)</label><input class="nwe-in" id="nweAlt" value="' + esc(img.getAttribute("alt") || "") + '">' : '') + '</div>';
    E.imgTarget = img ? img.getAttribute(NW) : id; E.imgIsBg = !img;
  }
  // animation
  html += '<div class="nwe-group"><label>Entrance animation</label><div class="nwe-chips" id="nweAnim">' + animOptions(m) + '</div>' +
    (/^H[1-3]$/.test(t) && E.engine ? '<label class="nwe-lbl" style="margin-top:12px">Headline effect</label><div class="nwe-chips" id="nweSplit"><button data-v="0" class="' + (m.hasAttribute("data-split") ? "" : "on") + '">Static</button><button data-v="1" class="' + (m.hasAttribute("data-split") ? "on" : "") + '">Words rise in</button></div>' : '') +
    '<label class="nwe-lbl" style="margin-top:12px">On hover</label><div class="nwe-chips" id="nweHov">' + hoverOptions(m) + '</div>' +
    '<div class="nwe-hint">Switch to Preview at the top to watch animations play.</div></div>';
  // actions
  html += '<div class="nwe-group"><label>Arrange</label><div class="nwe-actions"><button class="nwe-btn" data-a="up">' + ICO.up + 'Move up</button><button class="nwe-btn" data-a="down">' + ICO.down + 'Move down</button><button class="nwe-btn" data-a="dup">' + ICO.dup + (friendly(m) === "Card" ? "Add another" : "Duplicate") + '</button><button class="nwe-btn nwe-danger" data-a="del">' + ICO.del + 'Delete</button></div></div>';
  box.innerHTML = html;
  wireX(box);
  $$("[data-a]", box).forEach(function (b) { b.onclick = function () { action(b.dataset.a); }; });
  var li = $("#nweLabel");
  if (li) li.oninput = function () { var n = model(id).childNodes[labIdx]; if (!n) return; var pre = n.textContent.match(/^\s*/)[0], post = n.textContent.match(/\s*$/)[0]; n.textContent = pre + li.value + post; views(id).forEach(function (v) { var vn = v.childNodes[labIdx]; if (vn && vn.nodeType === 3) vn.textContent = n.textContent; }); markDirty(); drawBoxes(); };
  var ta = $("#nweText");
  if (ta) ta.oninput = function () { fromMark(m, ta.value); liveSync(id); markDirty(); };
  $$("[data-attr]", box).forEach(function (inp) { inp.oninput = function () { setAttr(id, inp.dataset.attr, inp.value); }; });
  var hr = $("#nweHref"); if (hr) hr.oninput = function () { setAttr(hr.dataset.for, "href", hr.value.trim()); };
  var wn = $("#nweWaNum"), wm = $("#nweWaMsg");
  if (wn) { var upd = function () { setAttr(a.getAttribute(NW), "href", "https://wa.me/" + wn.value.replace(/\D/g, "") + "?text=" + encodeURIComponent(wm.value)); }; wn.oninput = upd; wm.oninput = upd; }
  var pick = $("#nwePick"); if (pick) { pick.onclick = function () { $("#nweFile").click(); }; $("#nweFile").onchange = function (e) { replacePhoto(e.target.files[0]); }; }
  var alt = $("#nweAlt"); if (alt) alt.oninput = function () { setAttr(E.imgTarget, "alt", alt.value); };
  $("#nweAnim").onclick = function (e) { var b = e.target.closest("button"); if (b) setAnim(id, b.dataset.v); };
  $("#nweHov").onclick = function (e) { var b = e.target.closest("button"); if (b) setHover(id, b.dataset.v); };
  var sp = $("#nweSplit"); if (sp) sp.onclick = function (e) { var b = e.target.closest("button"); if (!b) return; apply(function () { if (b.dataset.v === "1") m.setAttribute("data-split", ""); else m.removeAttribute("data-split"); }, true); };
}
function wireX(box) { $$("[data-x]", box).forEach(function (b) { b.onclick = function () { $("#nweRight").classList.remove("open"); $("#nweLeft").classList.remove("open"); setMob(""); }; }); }
function absUrl(src) { try { return new URL(src, E.site.pageUrl || E.site.url || location.href).href; } catch (e) { return src; } }

/* animations: the site's own engine when it has one (data-reveal), otherwise make4yu's tiny runtime */
var ENGINE_ANIMS = [["none", "None"], ["", "Fade up"], ["fade", "Fade in"], ["scale", "Zoom in"], ["left", "From left"], ["right", "From right"], ["clip", "Wipe up"]];
var RUN_ANIMS = [["none", "None"], ["up", "Fade up"], ["fade", "Fade in"], ["zoom", "Zoom in"], ["left", "From left"], ["right", "From right"], ["blur", "Blur in"]];
function animOptions(m) {
  var useEngine = E.engine && !m.hasAttribute("data-nw-anim");
  var cur = useEngine ? (m.hasAttribute("data-reveal") ? m.getAttribute("data-reveal") : "none") : (m.getAttribute("data-nw-anim") || "none");
  return (useEngine ? ENGINE_ANIMS : RUN_ANIMS).map(function (o) { return '<button data-v="' + o[0] + '" class="' + (cur === o[0] ? "on" : "") + '">' + o[1] + '</button>'; }).join("");
}
function hoverOptions(m) {
  var cur = m.getAttribute("data-nw-hover") || (m.hasAttribute("data-tilt") ? "tilt" : "none");
  return [["none", "None"], ["lift", "Lift"], ["glow", "Glow"], ["zoom", "Photo zoom"], ["tilt", "3D tilt"]].map(function (o) { return '<button data-v="' + o[0] + '" class="' + (cur === o[0] ? "on" : "") + '">' + o[1] + '</button>'; }).join("");
}
function setAnim(id, v) {
  var m = model(id), useEngine = E.engine && !m.hasAttribute("data-nw-anim");
  apply(function () {
    if (useEngine) { if (v === "none") m.removeAttribute("data-reveal"); else m.setAttribute("data-reveal", v); }
    else { if (v === "none") m.removeAttribute("data-nw-anim"); else m.setAttribute("data-nw-anim", v); ensureRuntime(); }
  }, true);
  toast(v === "none" ? "Animation removed" : "Animation set — switch to Preview to watch it");
}
function setHover(id, v) {
  var m = model(id);
  apply(function () {
    m.removeAttribute("data-nw-hover");
    if (E.engine && v === "tilt") { m.setAttribute("data-tilt", ""); }
    else { m.removeAttribute("data-tilt"); if (v !== "none") m.setAttribute("data-nw-hover", v); }
    ensureRuntime();
  }, true);
}
var RUNTIME_CSS = '[data-nw-anim]{opacity:0;transition:opacity .9s cubic-bezier(.22,.8,.2,1),transform .9s cubic-bezier(.22,.8,.2,1),filter .9s;transition-delay:var(--nw-d,0ms)}' +
  '[data-nw-anim="up"]{transform:translateY(40px)}[data-nw-anim="left"]{transform:translateX(-56px)}[data-nw-anim="right"]{transform:translateX(56px)}[data-nw-anim="zoom"]{transform:scale(.9)}[data-nw-anim="blur"]{filter:blur(14px)}' +
  '[data-nw-anim].nw-in{opacity:1;transform:none;filter:none}' +
  '[data-nw-hover]{transition:transform .45s cubic-bezier(.22,.8,.2,1),box-shadow .45s}[data-nw-hover="lift"]:hover{transform:translateY(-8px);box-shadow:0 24px 48px -24px rgba(0,0,0,.45)}' +
  '[data-nw-hover="glow"]:hover{box-shadow:0 0 0 2px currentColor,0 0 36px -8px currentColor}[data-nw-hover="zoom"]{overflow:hidden}[data-nw-hover="zoom"] img{transition:transform .9s cubic-bezier(.22,.8,.2,1)}[data-nw-hover="zoom"]:hover img{transform:scale(1.07)}' +
  '@media (prefers-reduced-motion:reduce){[data-nw-anim]{opacity:1!important;transform:none!important;filter:none!important}[data-nw-hover]{transform:none!important}}';
var RUNTIME_JS = '(function(){var d=document;function go(){var els=d.querySelectorAll("[data-nw-anim]");if(!("IntersectionObserver" in window)){els.forEach(function(e){e.classList.add("nw-in")});}else{var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add("nw-in");io.unobserve(en.target)}})},{threshold:.12});els.forEach(function(e){io.observe(e)})}' +
  'if(matchMedia("(hover:hover)").matches)d.querySelectorAll("[data-nw-hover=tilt]").forEach(function(c){c.style.transition="transform .3s";c.addEventListener("pointermove",function(e){var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.transform="perspective(900px) rotateX("+(-y*7)+"deg) rotateY("+(x*9)+"deg)"});c.addEventListener("pointerleave",function(){c.style.transform=""})})}' +
  'if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",go);else go()})();';
function ensureRuntime() {
  var used = E.doc.querySelector("[data-nw-anim],[data-nw-hover]");
  var css = E.doc.getElementById("nw-runtime-css"), js = E.doc.getElementById("nw-runtime-js");
  if (used && !css) { css = E.doc.createElement("style"); css.id = "nw-runtime-css"; css.textContent = RUNTIME_CSS; E.doc.head.appendChild(css); }
  if (used && !js) { js = E.doc.createElement("script"); js.id = "nw-runtime-js"; js.textContent = RUNTIME_JS; E.doc.body.appendChild(js); }
  if (!used) { if (css) css.remove(); if (js) js.remove(); }
}

/* photos */
function compress(f, max) { return new Promise(function (res, rej) { var img = new Image(); img.onload = function () { var s = Math.min(1, (max || 1800) / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", .82)); URL.revokeObjectURL(img.src); }; img.onerror = rej; img.src = URL.createObjectURL(f); }); }
function replacePhoto(f) {
  if (!f || !/^image\//.test(f.type)) return toast("Choose a photo");
  compress(f).then(function (url) {
    var id = E.imgTarget, m = model(id);
    apply(function () {
      if (E.imgIsBg) { m.setAttribute("style", (m.getAttribute("style") || "").replace(/url\((['"]?)[^'")]+\1\)/i, "url('" + url + "')")); }
      else { m.setAttribute("src", url); m.removeAttribute("srcset"); m.removeAttribute("sizes"); var pic = m.closest("picture"); if (pic) $$("source", pic).forEach(function (s) { s.remove(); }); }
    }, true);
    toast("Photo replaced — it uploads when you publish");
  }).catch(function () { toast("Couldn't read that photo"); });
}

/* ---------------- left panel: sections / add / theme ---------------- */
function renderLeft() {
  var pane = $("#nweLeftPane"); if (!pane || !E.doc) return;
  $$("#nweLeft .nwe-tabs button[data-t]").forEach(function (b) { b.classList.toggle("on", b.dataset.t === E.leftTab); });
  if (E.leftTab === "sections") {
    var list = sections(), selM = model(E.sel), selSec = selM ? list.filter(function (s) { return s === selM || s.contains(selM); })[0] : null;
    pane.innerHTML = '<div class="nwe-h">Your page, top to bottom</div>' + list.map(function (s, i) {
      var hid = s.hasAttribute("data-nw-hidden");
      return '<div class="nwe-sec' + (s === selSec ? " on" : "") + (hid ? " off" : "") + '" data-id="' + s.getAttribute(NW) + '"><i>' + (i + 1) + '</i><span>' + esc(secName(s)) + (s.hasAttribute("hidden") && !hid ? '<small class="nwe-auto">Appears by itself when needed</small>' : '') + '</span>' +
        '<button class="nwe-mini" data-s="hide" title="' + (hid ? "Show" : "Hide") + '">' + (hid ? ICO.eyeoff : ICO.eye) + '</button><button class="nwe-mini" data-s="up" title="Move up">' + ICO.up + '</button><button class="nwe-mini" data-s="down" title="Move down">' + ICO.down + '</button><button class="nwe-mini" data-s="dup" title="Duplicate">' + ICO.dup + '</button><button class="nwe-mini" data-s="del" title="Delete">' + ICO.del + '</button></div>';
    }).join("") + '<div class="nwe-hint" style="margin:12px 4px">Hidden sections stay in your page but visitors don\'t see them.</div>';
    $$(".nwe-sec", pane).forEach(function (row) {
      row.onclick = function (e) {
        var b = e.target.closest("[data-s]"), id = row.dataset.id, m = model(id);
        if (!b) return select(id, true);
        e.stopPropagation();
        if (b.dataset.s === "hide") return apply(function () { toggleHide(m); }, true);
        E.sel = id; action(b.dataset.s);
      };
    });
  } else if (E.leftTab === "add") {
    var rec = recommended();
    pane.innerHTML = '<div class="nwe-h">Recommended' + (E.site && E.site.niche ? " for " + esc(E.site.niche) : "") + '</div>' + rec.map(blockBtn).join("") +
      '<div class="nwe-h">All sections</div>' + Object.keys(BLOCKS).filter(function (k) { return rec.indexOf(k) < 0; }).map(blockBtn).join("") +
      '<div class="nwe-hint" style="margin:6px 4px 14px">New sections go after the one you\'ve selected, and match your site\'s colours and fonts.</div>';
    $$(".nwe-block", pane).forEach(function (b) { b.onclick = function () { addBlock(b.dataset.k); }; });
  } else theme(pane);
}
function toggleHide(m) {
  if (m.hasAttribute("data-nw-hidden")) { var o = m.getAttribute("data-nw-style"); if (o) m.setAttribute("style", o); else m.removeAttribute("style"); m.removeAttribute("data-nw-style"); m.removeAttribute("data-nw-hidden"); }
  else { if (m.hasAttribute("style")) m.setAttribute("data-nw-style", m.getAttribute("style")); m.setAttribute("style", (m.getAttribute("style") ? m.getAttribute("style").replace(/;?\s*$/, ";") : "") + "display:none!important"); m.setAttribute("data-nw-hidden", ""); }
}
function blockBtn(k) { var b = BLOCKS[k]; return '<button class="nwe-block" data-k="' + k + '"><span class="ic">' + b.icon + '</span><span><b>' + b.name + '</b><small>' + b.desc + '</small></span></button>'; }

/* theme: colour and font custom properties in :root */
var FONTS = ["Bricolage Grotesque", "Instrument Serif", "Playfair Display", "Fraunces", "DM Serif Display", "Cormorant Garamond", "Gloock", "Syne", "Space Grotesk", "Archivo", "Manrope", "DM Sans", "Inter", "Plus Jakarta Sans", "Poppins", "Outfit", "Instrument Sans", "Sora", "Lora", "Libre Baskerville"];
function rootVars() {
  var out = [];
  $$("style", E.doc).forEach(function (st, si) {
    if (/^nw-/.test(st.id || "")) return;
    var re = /:root\s*\{([^}]*)\}/g, m;
    while ((m = re.exec(st.textContent))) {
      var dre = /(--[\w-]+)\s*:\s*([^;]+);?/g, d;
      while ((d = dre.exec(m[1]))) out.push({ name: d[1], value: d[2].trim(), style: si });
    }
  });
  var seen = {}; return out.filter(function (v) { if (seen[v.name]) return false; seen[v.name] = 1; return true; });
}
function isColor(v) { return /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(v); }
function toHex(v) {
  if (/^#[0-9a-f]{6}$/i.test(v)) return v; if (/^#[0-9a-f]{3}$/i.test(v)) return "#" + v.slice(1).split("").map(function (c) { return c + c; }).join("");
  if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7);
  var m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(v); if (m) return "#" + [m[1], m[2], m[3]].map(function (x) { return (+x).toString(16).padStart(2, "0"); }).join("");
  return "#888888";
}
function theme(pane) {
  var vars = rootVars(), colors = vars.filter(function (v) { return isColor(v.value); }), fonts = vars.filter(function (v) { return /font|display|body|serif|sans|heading|italic/i.test(v.name) && /["']?[A-Z][\w ]+["']?\s*,/.test(v.value); });
  if (!colors.length && !fonts.length) { pane.innerHTML = '<div class="nwe-empty"><b>No theme settings found</b>This site sets its colours on each element. Select something on the page to change it.</div>'; return; }
  pane.innerHTML = (colors.length ? '<div class="nwe-h">Colours</div>' + colors.map(function (v) {
    return '<label class="nwe-swatch"><input type="color" value="' + toHex(v.value) + '" data-var="' + v.name + '"><b>' + esc(v.name.replace(/^--/, "").replace(/-/g, " ")) + '</b><code>' + esc(v.value.length > 12 ? toHex(v.value) : v.value) + '</code></label>';
  }).join("") : "") +
    (fonts.length ? '<div class="nwe-h">Fonts</div>' + fonts.map(function (v) {
      var cur = (/["']?([A-Z][\w ]+?)["']?\s*,/.exec(v.value) || [])[1] || "";
      return '<div class="nwe-group" style="padding:6px 4px;border:0"><label>' + esc(v.name.replace(/^--/, "").replace(/-/g, " ")) + '</label><select class="nwe-select" data-font="' + v.name + '">' + (FONTS.indexOf(cur) < 0 ? '<option selected>' + esc(cur) + '</option>' : '') + FONTS.map(function (f) { return '<option' + (f === cur ? " selected" : "") + '>' + f + '</option>'; }).join("") + '</select></div>';
    }).join("") : "") + '<div class="nwe-hint" style="margin:10px 4px">Changes apply across your whole site.</div>';
  $$("input[data-var]", pane).forEach(function (inp) {
    inp.oninput = function () { setVar(inp.dataset.var, inp.value, false); inp.parentElement.querySelector("code").textContent = inp.value; };
    inp.onchange = function () { setVar(inp.dataset.var, inp.value, true); };
  });
  $$("select[data-font]", pane).forEach(function (sel) { sel.onchange = function () { setFont(sel.dataset.font, sel.value); }; });
}
function setVar(name, value, commit) {
  var d = E.frame && E.frame.contentDocument; if (d) d.documentElement.style.setProperty(name, value);
  $$("style", E.doc).forEach(function (st) {
    if (/^nw-/.test(st.id || "")) return;
    st.textContent = st.textContent.replace(/:root\s*\{[^}]*\}/g, function (blk) { return blk.replace(new RegExp("(" + name.replace(/[-]/g, "\\-") + "\\s*:\\s*)([^;}]+)"), "$1" + value); });
  });
  if (commit) { markDirty(); push(); }
}
function setFont(name, family) {
  var cur = rootVars().filter(function (v) { return v.name === name; })[0]; if (!cur) return;
  var fallback = /serif/i.test(cur.value) && !/sans-serif/i.test(cur.value) ? "Georgia, serif" : "system-ui, sans-serif";
  apply(function () {
    var linkId = "nw-font-" + family.toLowerCase().replace(/\s+/g, "-");
    if (!E.doc.getElementById(linkId)) { var l = E.doc.createElement("link"); l.id = linkId; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=" + family.replace(/\s+/g, "+") + ":ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"; E.doc.head.appendChild(l); }
    setVar(name, '"' + family + '", ' + fallback, false);
  }, true);
  toast("Font changed to " + family);
}

/* ---------------- ready-made sections ---------------- */
function readTokens(d, w) {
  var cs = function (el) { return el ? w.getComputedStyle(el) : null; };
  var solid = function (c) { return c && !/rgba?\(0, 0, 0, 0\)|transparent/.test(c); };
  var body = d.body, bodyCs = cs(body), bg = bodyCs.backgroundColor;
  if (!solid(bg)) bg = cs(d.documentElement).backgroundColor; if (!solid(bg)) bg = "#ffffff";
  var sat = function (c) { var m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c || ""); if (!m) return 0; var r = +m[1], g = +m[2], b = +m[3], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
  var btns = $$(".btn, a[class*=btn], button[class*=btn], .button, a[class*=cta], button", d).filter(function (b) { return solid(cs(b).backgroundColor); });
  btns.sort(function (a, b) { return sat(cs(b).backgroundColor) - sat(cs(a).backgroundColor); });
  var btn = btns[0];
  var rootCs = cs(d.documentElement), varAccent = "";
  ["--accent", "--primary", "--brand", "--color-accent", "--main"].some(function (n) { var v = rootCs.getPropertyValue(n).trim(); if (v && /^(#|rgb|hsl)/.test(v)) { varAccent = v; return true; } });
  var h = d.querySelector("h2") || d.querySelector("h1");
  return {
    bg: bg, ink: bodyCs.color, accent: varAccent || (btn ? cs(btn).backgroundColor : bodyCs.color), accentInk: btn && (!varAccent || sat(cs(btn).backgroundColor) > .25) ? cs(btn).color : "#ffffff",
    head: h ? cs(h).fontFamily : bodyCs.fontFamily, body: bodyCs.fontFamily, radius: btn ? cs(btn).borderRadius : "14px"
  };
}
function ensureBlockCss() {
  if (E.doc.getElementById("nw-blocks-css")) return;
  var t = E.tokens || { bg: "#fff", ink: "#111", accent: "#111", accentInk: "#fff", head: "Georgia,serif", body: "system-ui,sans-serif", radius: "14px" };
  var st = E.doc.createElement("style"); st.id = "nw-blocks-css";
  st.textContent = '.nwb{--nwb-bg:' + t.bg + ';--nwb-ink:' + t.ink + ';--nwb-accent:' + t.accent + ';--nwb-accent-ink:' + t.accentInk + ';--nwb-head:' + t.head.replace(/;/g, "") + ';--nwb-body:' + t.body.replace(/;/g, "") + ';--nwb-br:' + (t.radius && t.radius !== "0px" ? (parseFloat(t.radius) > 40 ? "999px" : t.radius) : "14px") + ';--nwb-r:' + (t.radius && t.radius !== "0px" ? Math.min(parseFloat(t.radius) || 14, 22) + "px" : "4px") + ';background:var(--nwb-bg);color:var(--nwb-ink);font-family:var(--nwb-body);padding:clamp(64px,9vw,120px) 0}' +
    '.nwb.alt{background:color-mix(in srgb,var(--nwb-ink) 4%,var(--nwb-bg))}.nwb.dark{background:var(--nwb-ink);color:var(--nwb-bg)}' +
    '.nwb-in{width:min(1200px,100% - 40px);margin:0 auto}.nwb-head{max-width:720px;margin-bottom:clamp(30px,4vw,52px)}.nwb-head.c{margin-left:auto;margin-right:auto;text-align:center}' +
    '.nwb-k{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;opacity:.65;margin-bottom:12px}' +
    '.nwb h2{font-family:var(--nwb-head);font-size:clamp(34px,4.6vw,60px);line-height:1.02;letter-spacing:-.03em;margin:0}.nwb h2 em{font-style:italic;color:var(--nwb-accent)}.nwb.dark h2 em{color:inherit;opacity:.75}' +
    '.nwb h3{font-family:var(--nwb-head);font-size:22px;letter-spacing:-.01em;margin:0 0 6px}.nwb p{margin:0;line-height:1.6;opacity:.8}' +
    '.nwb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:20px}' +
    '.nwb-card{background:color-mix(in srgb,var(--nwb-ink) 4%,var(--nwb-bg));border:1px solid color-mix(in srgb,var(--nwb-ink) 10%,transparent);border-radius:var(--nwb-r);padding:26px;transition:transform .45s,box-shadow .45s}' +
    '.nwb.dark .nwb-card{background:color-mix(in srgb,var(--nwb-bg) 8%,transparent);border-color:color-mix(in srgb,var(--nwb-bg) 16%,transparent)}' +
    '.nwb-card img{display:block;width:calc(100% + 52px);margin:-26px -26px 20px;aspect-ratio:4/3;object-fit:cover;border-radius:var(--nwb-r) var(--nwb-r) 0 0}' +
    '.nwb-price{font-family:var(--nwb-head);font-size:28px;font-weight:700;margin-top:14px}.nwb-price small{font-size:14px;opacity:.6;font-weight:400}' +
    '.nwb-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 24px;margin-top:20px;border-radius:var(--nwb-br);background:var(--nwb-accent);color:var(--nwb-accent-ink);font-weight:700;text-decoration:none;transition:transform .3s}.nwb-btn:hover{transform:translateY(-2px)}' +
    '.nwb-stars{color:var(--nwb-accent);letter-spacing:2px;margin-bottom:12px}.nwb-who{display:flex;align-items:center;gap:12px;margin-top:18px;font-weight:700}.nwb-who img{width:44px;height:44px;border-radius:50%;object-fit:cover;margin:0}' +
    '.nwb-stat b{display:block;font-family:var(--nwb-head);font-size:clamp(40px,5vw,64px);letter-spacing:-.03em;line-height:1}.nwb-stat span{opacity:.7}' +
    '.nwb-faq details{border-top:1px solid color-mix(in srgb,var(--nwb-ink) 14%,transparent);padding:20px 0}.nwb-faq summary{cursor:pointer;font-family:var(--nwb-head);font-size:20px;list-style:none;display:flex;justify-content:space-between;gap:16px}.nwb-faq summary::after{content:"+";font-size:26px;line-height:1;transition:transform .3s}.nwb-faq details[open] summary::after{transform:rotate(45deg)}.nwb-faq details p{margin-top:12px;max-width:680px}' +
    '.nwb-gal{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.nwb-gal img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--nwb-r);display:block}.nwb-gal img:first-child{grid-row:span 2;aspect-ratio:auto;height:100%}' +
    '.nwb-menu{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));gap:6px 48px}.nwb-mi{display:flex;align-items:baseline;gap:10px;padding:14px 0;border-bottom:1px dashed color-mix(in srgb,var(--nwb-ink) 20%,transparent)}.nwb-mi b{font-family:var(--nwb-head);font-size:19px}.nwb-mi i{flex:1;border-bottom:1px dotted transparent}.nwb-mi span{font-weight:700}.nwb-mi small{display:block;opacity:.65;font-size:14px}' +
    '.nwb-split{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,4vw,60px);align-items:center}.nwb-map{width:100%;aspect-ratio:4/3;border:0;border-radius:var(--nwb-r)}.nwb-hours div{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--nwb-ink) 10%,transparent)}' +
    '.nwb-band{text-align:center}.nwb-band p{max-width:560px;margin:16px auto 0}.nwb-step b{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--nwb-accent);color:var(--nwb-accent-ink);font-family:var(--nwb-head);margin-bottom:16px}' +
    '.nwb-video{position:relative;aspect-ratio:16/9;border-radius:var(--nwb-r);overflow:hidden}.nwb-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}' +
    '@media (max-width:760px){.nwb-split{grid-template-columns:1fr}.nwb-gal{grid-template-columns:1fr 1fr}.nwb-gal img:first-child{grid-row:auto;aspect-ratio:1}}';
  E.doc.head.appendChild(st);
}
var PH = function (label) { return "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#d9d6cf"/><g fill="none" stroke="#9a958c" stroke-width="10"><rect x="300" y="210" width="200" height="150" rx="16"/><circle cx="350" cy="260" r="18"/><path d="M300 340l70-60 50 40 40-30 40 30"/></g><text x="400" y="420" font-family="sans-serif" font-size="26" fill="#7d786f" text-anchor="middle">' + (label || "Click to add your photo") + '</text></svg>'); };
function A(attr) { return E.engine ? ' data-reveal' + (attr ? '="' + attr + '"' : '') : ' data-nw-anim="' + ({ "": "up", fade: "fade", scale: "zoom", left: "left", right: "right", clip: "up" }[attr || ""] || "up") + '"'; }
function wa() { var a = E.doc.querySelector('a[href*="wa.me/"]'); var m = a && /wa\.me\/(\d+)/.exec(a.getAttribute("href")); return "https://wa.me/" + (m ? m[1] : "91XXXXXXXXXX") + "?text=" + encodeURIComponent("Hi! I saw your website and I'd like to know more."); }
var BLOCKS = {
  cards: { name: "Product or service cards", desc: "Three cards with photo, price and a button", icon: "▦", html: function () { return '<section class="nwb"><div class="nwb-in"><div class="nwb-head"' + A() + '><span class="nwb-k">Our favourites</span><h2>Made to be <em>loved.</em></h2></div><div class="nwb-grid">' + [["Signature pick", "₹1,499"], ["Customer favourite", "₹999"], ["New arrival", "₹1,299"]].map(function (x, i) { return '<article class="nwb-card"' + A() + ' data-nw-hover="lift" style="--d:' + i + '"><img src="' + PH() + '" alt="' + x[0] + '"><h3>' + x[0] + '</h3><p>One line on what makes it special and who it\'s for.</p><div class="nwb-price">' + x[1] + '</div><a class="nwb-btn" href="' + wa() + '" target="_blank" rel="noopener">Order on WhatsApp</a></article>'; }).join("") + '</div></div></section>'; } },
  reviews: { name: "Customer reviews", desc: "Three short reviews with stars", icon: "★", html: function () { return '<section class="nwb alt"><div class="nwb-in"><div class="nwb-head c"' + A() + '><span class="nwb-k">Kind words</span><h2>What people <em>say.</em></h2></div><div class="nwb-grid">' + ["Riya S.", "Arjun M.", "Neha K."].map(function (n, i) { return '<figure class="nwb-card" style="margin:0;--d:' + i + '"' + A() + '><div class="nwb-stars">★★★★★</div><p>“Write a real review from a happy customer here — what they bought and how it felt.”</p><figcaption class="nwb-who">' + n + '</figcaption></figure>'; }).join("") + '</div></div></section>'; } },
  pricing: { name: "Pricing plans", desc: "Three plans side by side", icon: "₹", html: function () { return '<section class="nwb"><div class="nwb-in"><div class="nwb-head c"' + A() + '><span class="nwb-k">Pricing</span><h2>Simple, <em>honest</em> prices.</h2></div><div class="nwb-grid">' + [["Basic", "₹999"], ["Popular", "₹1,999"], ["Premium", "₹3,999"]].map(function (x, i) { return '<article class="nwb-card"' + A() + ' data-nw-hover="lift" style="--d:' + i + '"><h3>' + x[0] + '</h3><div class="nwb-price">' + x[1] + ' <small>/ month</small></div><p style="margin-top:12px">What\'s included in this plan, in one or two short lines.</p><a class="nwb-btn" href="' + wa() + '" target="_blank" rel="noopener">Choose ' + x[0] + '</a></article>'; }).join("") + '</div></div></section>'; } },
  faq: { name: "Questions & answers", desc: "An FAQ list that opens on tap", icon: "?", html: function () { return '<section class="nwb"><div class="nwb-in nwb-split" style="align-items:start"><div class="nwb-head"' + A() + '><span class="nwb-k">Questions</span><h2>Good to <em>know.</em></h2></div><div class="nwb-faq"' + A() + '>' + ["Do you deliver across India?", "How do I place an order?", "Can I return or exchange?", "Do you take custom orders?"].map(function (q) { return '<details><summary>' + q + '</summary><p>Write a short, friendly answer here.</p></details>'; }).join("") + '</div></div></section>'; } },
  gallery: { name: "Photo gallery", desc: "Five photos in a stylish grid", icon: "▣", html: function () { return '<section class="nwb alt"><div class="nwb-in"><div class="nwb-head"' + A() + '><span class="nwb-k">Gallery</span><h2>A closer <em>look.</em></h2></div><div class="nwb-gal"' + A("clip") + '>' + [1, 2, 3, 4, 5].map(function (i) { return '<img src="' + PH() + '" alt="Gallery photo ' + i + '">'; }).join("") + '</div></div></section>'; } },
  stats: { name: "Numbers that impress", desc: "Four big stats in a row", icon: "#", html: function () { return '<section class="nwb dark"><div class="nwb-in nwb-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">' + [["500+", "happy customers"], ["4.9★", "average rating"], ["48h", "delivery"], ["5 yrs", "in business"]].map(function (x, i) { return '<div class="nwb-stat"' + A() + ' style="--d:' + i + '"><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join("") + '</div></section>'; } },
  offer: { name: "Offer banner", desc: "A bold call-to-action with WhatsApp", icon: "✦", html: function () { return '<section class="nwb dark nwb-band"><div class="nwb-in"' + A("scale") + '><span class="nwb-k">Limited time</span><h2>Get <em>10% off</em> your first order.</h2><p>Mention this offer when you message us. Valid till the end of the month.</p><a class="nwb-btn" href="' + wa() + '" target="_blank" rel="noopener">Claim on WhatsApp</a></div></section>'; } },
  hours: { name: "Opening hours & map", desc: "Timings plus a Google map", icon: "⌖", html: function () { return '<section class="nwb"><div class="nwb-in nwb-split"><div' + A("left") + '><span class="nwb-k">Visit us</span><h2>Come say <em>hello.</em></h2><p style="margin:14px 0 18px">Shop 12, Your Street, Your City</p><div class="nwb-hours">' + [["Mon – Fri", "10 am – 8 pm"], ["Saturday", "10 am – 9 pm"], ["Sunday", "11 am – 6 pm"]].map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join("") + '</div><a class="nwb-btn" href="https://maps.google.com/?q=India" target="_blank" rel="noopener">Get directions</a></div><iframe class="nwb-map"' + A("right") + ' loading="lazy" title="Map" src="https://maps.google.com/maps?q=India&z=12&output=embed"></iframe></div></section>'; } },
  menu: { name: "Menu or price list", desc: "Items with descriptions and prices", icon: "≡", html: function () { return '<section class="nwb alt"><div class="nwb-in"><div class="nwb-head"' + A() + '><span class="nwb-k">The menu</span><h2>Something for <em>everyone.</em></h2></div><div class="nwb-menu"' + A() + '>' + [["House special", "₹349"], ["Chef\'s favourite", "₹429"], ["Seasonal pick", "₹299"], ["Classic", "₹249"], ["Sweet ending", "₹199"], ["Signature drink", "₹159"]].map(function (x) { return '<div class="nwb-mi"><div><b>' + x[0] + '</b><small>A short, tasty description.</small></div><i></i><span>' + x[1] + '</span></div>'; }).join("") + '</div></div></section>'; } },
  steps: { name: "How it works", desc: "Three or four simple steps", icon: "→", html: function () { return '<section class="nwb"><div class="nwb-in"><div class="nwb-head"' + A() + '><span class="nwb-k">How it works</span><h2>Easy from <em>start to finish.</em></h2></div><div class="nwb-grid">' + [["Message us", "Tell us what you need on WhatsApp."], ["We confirm", "You get a quote and a time that suits you."], ["Enjoy", "We deliver, you relax."]].map(function (x, i) { return '<div class="nwb-step"' + A() + ' style="--d:' + i + '"><b>' + (i + 1) + '</b><h3>' + x[0] + '</h3><p>' + x[1] + '</p></div>'; }).join("") + '</div></div></section>'; } },
  team: { name: "Meet the team", desc: "Three people with photos", icon: "☺", html: function () { return '<section class="nwb alt"><div class="nwb-in"><div class="nwb-head"' + A() + '><span class="nwb-k">The people</span><h2>Meet the <em>team.</em></h2></div><div class="nwb-grid">' + ["Founder", "Lead stylist", "Customer care"].map(function (r, i) { return '<article class="nwb-card"' + A() + ' data-nw-hover="lift" style="--d:' + i + '"><img src="' + PH("Add a photo") + '" alt="' + r + '"><h3>Name here</h3><p>' + r + '</p></article>'; }).join("") + '</div></div></section>'; } },
  video: { name: "Video", desc: "Embed a YouTube video", icon: "▶", html: function () { return '<section class="nwb"><div class="nwb-in"><div class="nwb-head"' + A() + '><span class="nwb-k">Watch</span><h2>See it <em>in action.</em></h2></div><div class="nwb-video"' + A("scale") + '><iframe loading="lazy" title="Video" src="https://www.youtube.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe></div><p class="nwb-hint" style="margin-top:12px;opacity:.6">Select the video and paste your own YouTube link.</p></div></section>'; } },
  contact: { name: "Contact band", desc: "Phone, WhatsApp and email in one place", icon: "✆", html: function () { return '<section class="nwb dark nwb-band"><div class="nwb-in"' + A() + '><span class="nwb-k">Talk to us</span><h2>We reply <em>fast.</em></h2><p>Message us on WhatsApp or call — we usually answer within the hour.</p><a class="nwb-btn" href="' + wa() + '" target="_blank" rel="noopener">WhatsApp us</a> <a class="nwb-btn" style="background:transparent;color:inherit;box-shadow:inset 0 0 0 1.5px currentColor" href="tel:+910000000000">Call now</a></div></section>'; } }
};
var NICHE_BLOCKS = [
  [/restaurant|caf|bak|food|sweet|kitchen|dining/i, ["menu", "gallery", "hours", "reviews", "offer"]],
  [/salon|beauty|spa|wellness|gym|fitness|yoga|clinic|dental/i, ["pricing", "steps", "reviews", "gallery", "hours"]],
  [/fashion|street|cloth|apparel|wear|saree|shop|product|brand|store|jewel/i, ["cards", "offer", "reviews", "gallery", "faq"]],
  [/real estate|propert|finance|agency|legal|education|coach|service|portfolio/i, ["steps", "stats", "reviews", "faq", "contact"]],
  [/sales|book|course|webinar|launch/i, ["pricing", "reviews", "faq", "video", "offer"]]
];
function recommended() { var n = (E.site && (E.site.niche + " " + E.site.name)) || ""; for (var i = 0; i < NICHE_BLOCKS.length; i++) if (NICHE_BLOCKS[i][0].test(n)) return NICHE_BLOCKS[i][1]; return ["cards", "reviews", "faq", "offer", "contact"]; }
function addBlock(k) {
  var b = BLOCKS[k]; if (!b) return;
  ensureBlockCss();
  var tmp = E.doc.createElement("div"); tmp.innerHTML = b.html(); var sec = tmp.firstElementChild; tagAll(sec);
  var list = sections(), selM = model(E.sel), after = selM ? list.filter(function (s) { return s === selM || s.contains(selM); })[0] : null;
  if (!after) { var foot = list.filter(function (s) { return s.tagName === "FOOTER"; })[0]; after = foot ? foot.previousElementSibling : list[list.length - 1]; }
  apply(function () { if (after) after.after(sec); else sectionParent().appendChild(sec); if (!E.engine) ensureRuntime(); }, true);
  var id = sec.getAttribute(NW);
  whenLoaded(function () { select(id, true); });
  toast(b.name + " added — click anything in it to make it yours");
}

/* ---------------- publish, versions ---------------- */
function finalHtml() {
  var doc = parse(serialize()), images = [], n = 0, stamp = Date.now().toString(36);
  var take = function (url) { var m = /^data:image\/(jpeg|png|webp|gif);base64,/.exec(url); if (!m) return null; var ext = m[1] === "jpeg" ? "jpg" : m[1]; var name = "nw-" + stamp + "-" + (++n) + "." + ext; images.push({ name: name, data: url }); return "images/uploads/" + name; };
  $$("img[src^='data:image/']", doc).forEach(function (img) { var src = img.getAttribute("src"); if (/^data:image\/svg/.test(src)) return; var p = take(src); if (p) img.setAttribute("src", p); });
  $$("[style*='data:image/']", doc).forEach(function (el) { el.setAttribute("style", el.getAttribute("style").replace(/url\((['"]?)(data:image\/(?:jpeg|png|webp|gif);base64,[^'")]+)\1\)/g, function (m, q, url) { return "url('" + take(url) + "')"; })); });
  $$("[" + NW + "]", doc).forEach(function (el) { el.removeAttribute(NW); });
  $$("[contenteditable]", doc).forEach(function (el) { el.removeAttribute("contenteditable"); });
  return { html: E.doctype + doc.documentElement.outerHTML, images: images };
}
function publishDialog() {
  modal('<h3>Publish your changes?</h3><p>Your live website updates in about a minute. You can always go back to an earlier version from History.</p><label class="nwe-lbl">What did you change? (optional)</label><input class="nwe-in" id="nweMsg" placeholder="e.g. New winter prices and a reviews section"><div class="nwe-row"><button class="nwe-btn" data-c>Not yet</button><button class="nwe-btn primary" id="nweGo">' + ICO.rocket + 'Publish now</button></div>',
    function (card, done) {
      $("[data-c]", card).onclick = done;
      $("#nweGo").onclick = async function () {
        var btn = this; btn.disabled = true; btn.lastChild.textContent = "Publishing…";
        try {
          var out = finalHtml();
          var r = await H.call("site_publish", { html: out.html, images: out.images, path: E.path, sha: E.sha, message: $("#nweMsg").value.trim() });
          E.sha = r.sha || E.sha;
          // published photos now live in the repo: point the model at their new paths
          if (out.images.length) { E.doc = parse(out.html); tagAll(E.doc.body); }
          E.baseHist = serialize(); E.hist = [E.baseHist]; E.hi = 0; E.dirty = false; saveDraft(); status();
          if (out.images.length) render();
          card.innerHTML = '<div class="nwe-done"><div class="tick">' + ICO.check + '</div><h3>Published!</h3><p>Your website is updating now — it\'s live in about a minute.</p><div class="nwe-row" style="justify-content:center">' + (E.site.url ? '<a class="nwe-btn" href="' + esc(E.site.url) + '" target="_blank" rel="noopener">View live site</a>' : '') + '<button class="nwe-btn primary" data-c>Keep editing</button></div></div>';
          $("[data-c]", card).onclick = done;
        } catch (x) { btn.disabled = false; btn.lastChild.textContent = "Publish now"; toast(x.message); }
      };
    });
}
async function history() {
  modal('<h3>Version history</h3><p>Every time the website was published. Restore any version — it becomes the live site.</p><div id="nweVers"><div class="nwe-spin"></div></div><div class="nwe-row"><button class="nwe-btn" data-c>Close</button></div>', async function (card, done) {
    $("[data-c]", card).onclick = done;
    try {
      var j = await H.call("site_versions", { path: E.path }), v = j.versions || [];
      $("#nweVers").innerHTML = v.length ? v.map(function (x, i) { return '<div class="nwe-ver"><div><b>' + esc(x.message) + '</b><small>' + new Date(x.date).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) + (i === 0 ? " · live now" : "") + '</small></div>' + (i ? '<button class="nwe-btn" data-sha="' + esc(x.sha) + '">Restore</button>' : '') + '</div>'; }).join("") : '<p>No versions yet.</p>';
      $$("[data-sha]", card).forEach(function (b) { b.onclick = async function () {
        if (!confirm("Restore this version? It replaces what's live now.")) return;
        b.disabled = true; b.textContent = "Restoring…";
        try { await H.call("site_restore", { sha: b.dataset.sha, path: E.path }); done(); toast("Restored — your site updates in about a minute"); try { localStorage.removeItem(draftKey()); } catch (e) {} E.tokens = null; load(); }
        catch (x) { toast(x.message); b.disabled = false; b.textContent = "Restore"; }
      }; });
    } catch (x) { $("#nweVers").innerHTML = '<p>' + esc(x.message) + '</p>'; }
  });
}
function modal(html, init) {
  var m = document.createElement("div"); m.className = "nwe-modal"; m.innerHTML = '<div class="nwe-card">' + html + '</div>';
  document.body.appendChild(m);
  var done = function () { m.remove(); };
  m.addEventListener("click", function (e) { if (e.target === m) done(); });
  init($(".nwe-card", m), done);
}

/* ---------------- shell wiring ---------------- */
function setMob(which) { $$("#nweMob button").forEach(function (b) { b.classList.toggle("on", b.dataset.m === which); }); }
function setMode(v) { E.mode = v; $$("#nweMode button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === v); }); E.hover = null; render(); drawBoxes(); setMob(v === "preview" ? "preview" : ""); if (v === "preview") toast("Preview: animations play and buttons work. Switch back to Edit to keep changing things."); }
function wireShell() {
  $("#nweBack").onclick = function () { if (E.dirty && !confirm("You have unpublished changes. They're saved as a draft on this device — leave the editor?")) return; close(); };
  $("#nweMode").onclick = function (e) { var b = e.target.closest("button"); if (b) setMode(b.dataset.v); };
  $("#nweDev").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; E.dev = b.dataset.v; layout(); setTimeout(drawBoxes, 480); };
  $("#nweUndo").onclick = function () { undo(-1); }; $("#nweRedo").onclick = function () { undo(1); };
  $("#nwePub").onclick = publishDialog; $("#nweHist").onclick = history;
  $("#nweLeft .nwe-tabs").onclick = function (e) { var b = e.target.closest("button[data-t]"); if (!b) return; E.leftTab = b.dataset.t; renderLeft(); };
  wireX($("#nweLeft"));
  $("#nweSel").onclick = function (e) { var b = e.target.closest("[data-a]"); if (b) action(b.dataset.a); };
  $("#nweMob").onclick = function (e) {
    var b = e.target.closest("button"); if (!b) return; var m = b.dataset.m;
    if (m === "preview") return setMode(E.mode === "preview" ? "edit" : "preview");
    if (E.mode === "preview") setMode("edit");
    var open = $("#nweLeft").classList.contains("open") && E.leftTab === m;
    $("#nweRight").classList.remove("open"); $("#nweLeft").classList.toggle("open", !open); E.leftTab = m; renderLeft(); setMob(open ? "" : m);
  };
  addEventListener("resize", onResize); document.addEventListener("keydown", keys);
}
function onResize() { if ($("#nwe")) { layout(); drawBoxes(); } }
function keys(e) {
  if (!$("#nwe")) return;
  var t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); undo(e.shiftKey ? 1 : -1); }
  else if ((e.key === "Delete" || e.key === "Backspace") && !typing && E.sel) { e.preventDefault(); action("del"); }
  else if (e.key === "Escape" && !typing && E.sel) { E.sel = null; drawBoxes(); inspector(); renderLeft(); }
}
function close() {
  var r = $("#nwe"); if (r) r.remove();
  document.documentElement.style.overflow = "";
  removeEventListener("resize", onResize); document.removeEventListener("keydown", keys);
  if (H.onClose) H.onClose();
}

window.Make4yuEditor = { open: open, _E: function () { return E; }, _final: function () { return finalHtml(); } };
})();
