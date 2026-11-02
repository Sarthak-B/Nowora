/* NOWORA visitor stats for client websites.
   Add before </body> on the client's site:
     <script src="https://nowora.vercel.app/t.js" data-site="TRACKING_ID" defer></script>
   Counts page views, WhatsApp / call / email taps and form submissions. No cookies, no personal data. */
(function () {
  var me = document.currentScript || document.querySelector('script[data-site][src*="t.js"]');
  var cid = me && me.getAttribute('data-site');
  var END = (me && me.getAttribute('data-endpoint')) || 'https://script.google.com/macros/s/AKfycbwOFH3fuNlDOsOV59HZ4bmSYCZcsHMcNMtwc_qPF8Dn_-cOUN_NJVPoCoXx7WqWwWB7/exec';
  if (!cid || window.__noworaT) return; window.__noworaT = 1;
  if (/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname) && !me.hasAttribute('data-test')) return;
  // Not a real visitor: automated browsers (uptime checks, preview captures), bots, the NOWORA editor's
  // preview (srcdoc) and copies of the site shown inside frames (showcase cards, dashboards, live viewer).
  var uaRaw = navigator.userAgent || '';
  if (navigator.webdriver || /bot|crawl|spider|headless|lighthouse|preview|screenshot|playwright|puppeteer|facebookexternalhit|whatsapp\//i.test(uaRaw)) return;
  try { if (window.top !== window.self) return; } catch (e) { return; }
  if (location.protocol === 'about:' || location.href === 'about:srcdoc' || /^\/__/.test(location.pathname)) return;

  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function store(k, s) { try { var v = s.getItem(k); if (!v) { v = rid(); s.setItem(k, v); } return v; } catch (e) { return rid(); } }
  var vid = store('nw_vid', window.localStorage), sid = store('nw_sid', window.sessionStorage);
  var ua = navigator.userAgent, device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';

  function source() {
    var q = new URLSearchParams(location.search), u = (q.get('utm_source') || q.get('src') || q.get('ref') || '').toLowerCase();
    if (u) return u.slice(0, 30);
    if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
    if (/Instagram/i.test(ua)) return 'instagram';
    if (/WhatsApp/i.test(ua)) return 'whatsapp';
    var r = document.referrer;
    if (!r) return 'direct';
    try { var h = new URL(r).hostname.replace(/^www\./, ''); if (h === location.hostname.replace(/^www\./, '')) return 'internal'; } catch (e) { return 'direct'; }
    var map = { google: 'google', bing: 'bing', instagram: 'instagram', facebook: 'facebook', 'fb.': 'facebook', 'wa.me': 'whatsapp', whatsapp: 'whatsapp', linkedin: 'linkedin', 'lnkd.in': 'linkedin', youtube: 'youtube', 't.co': 'twitter', 'x.com': 'twitter', justdial: 'justdial', maps: 'google maps' };
    for (var k in map) if (r.indexOf(k) > -1) return map[k];
    return h.slice(0, 30);
  }
  var ref = source();
  if (ref === 'internal') { try { ref = sessionStorage.getItem('nw_ref') || 'direct'; } catch (e) { ref = 'direct'; } }
  else { try { sessionStorage.setItem('nw_ref', ref); } catch (e) {} }

  function send(type, label) {
    var body = JSON.stringify({ action: 'ctrack', event: { cid: cid, vid: vid, sid: sid, type: type, label: (label || '').slice(0, 60), ref: ref, device: device, path: location.pathname.slice(0, 80) } });
    try { fetch(END, { method: 'POST', mode: 'no-cors', credentials: 'omit', keepalive: true, body: body }).catch(beacon); }
    catch (e) { beacon(); }
    function beacon() { try { navigator.sendBeacon && navigator.sendBeacon(END, body); } catch (e) {} }
  }

  function pageview() { send('pageview', document.title); }
  if (document.visibilityState === 'prerender' || document.prerendering) {
    document.addEventListener('prerenderingchange', pageview, { once: true });
  } else pageview();

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    var h = a.getAttribute('href') || '', t = (a.textContent || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
    if (/wa\.me|whatsapp\.com|^whatsapp:/i.test(h)) send('cta_whatsapp', t);
    else if (/^tel:/i.test(h)) send('cta_call', t);
    else if (/^mailto:/i.test(h)) send('cta_email', t);
  }, true);
  /* ---------- forms → the client's NOWORA database, in real time ----------
     Every form a visitor sends is saved as a row (one table per kind of form).
     <form data-nowora-table="Bookings">   choose the table
     <form data-nowora="off">              don't save this form
     <form data-nowora="manual">           the site calls nowora.record() itself (carts)
     <input data-nowora="off">             leave one field out
     nowora.record("Orders", {Name: "…", Phone: "…"}, [{name:"Hoodie", size:"M", colour:"Black", qty:1, price:1299}])  */
  var SKIP = /pass(word)?|card|cvv|cvc|otp|aadhaar|aadhar|pan ?(no|number)|account ?(no|number)|ifsc|upi ?pin/i;
  function post(body) {
    var b = JSON.stringify(body);
    try { fetch(END, { method: 'POST', mode: 'no-cors', credentials: 'omit', keepalive: true, body: b }).catch(function () { beacon(b); }); }
    catch (e) { beacon(b); }
  }
  function beacon(b) { try { navigator.sendBeacon && navigator.sendBeacon(END, b); } catch (e) {} }
  function record(table, fields, items) {
    var clean = {}, n = 0;
    for (var k in (fields || {})) {
      if (n >= 40) break;
      var v = fields[k]; if (v === undefined || v === null) continue;
      if (typeof v === 'boolean') v = v ? 'Yes' : 'No';
      clean[String(k).slice(0, 60)] = String(v).slice(0, 2000); n++;
    }
    var key = 'nw_f_' + JSON.stringify([table, clean, items || []]).length + '_' + JSON.stringify(clean).slice(0, 200);
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    post({ action: 'cform', cid: cid, vid: vid, ref: ref, device: device, path: location.pathname.slice(0, 80), table: String(table || 'Website enquiries').slice(0, 60), fields: clean, items: (items || []).slice(0, 50) });
  }
  function labelFor(el, form) {
    var t = '';
    if (el.id) { var l = form.querySelector('label[for="' + el.id.replace(/"/g, '') + '"]'); if (l) t = l.childNodes.length ? [].map.call(l.childNodes, function (x) { return x.nodeType === 3 ? x.textContent : (x.matches && x.matches('input,select,textarea,.err,.muted,small') ? '' : x.textContent); }).join('') : l.textContent; }
    if (!t && el.closest('label')) t = [].map.call(el.closest('label').childNodes, function (x) { return x.nodeType === 3 ? x.textContent : (x.matches && x.matches('input,select,textarea') ? '' : x.textContent); }).join('');
    t = (t || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '').replace(/\(optional\)|\*/gi, '').replace(/\s+/g, ' ').trim();
    if (/^[a-z_]+$/.test(t)) t = t.replace(/_/g, ' ').replace(/^\w/, function (m) { return m.toUpperCase(); });
    return t.slice(0, 60);
  }
  function tableFor(form) {
    var w = form.getAttribute('data-nowora-table'); if (w) return w;
    var k = ((form.getAttribute('name') || '') + ' ' + (form.id || '') + ' ' + (form.className || '') + ' ' + (form.getAttribute('action') || '')).toLowerCase();
    if (/order|checkout|cart|buy/.test(k)) return 'Orders';
    if (/book|appoint|reserv|slot/.test(k)) return 'Bookings';
    if (/subscri|newsletter/.test(k)) return 'Subscribers';
    return 'Website enquiries';
  }
  function capture(form) {
    var mode = (form.getAttribute('data-nowora') || '').toLowerCase();
    if (mode === 'off' || mode === 'manual') return mode === 'manual';
    if (form.checkValidity && !form.checkValidity()) return false;
    var out = {}, filled = 0;
    [].forEach.call(form.elements, function (el) {
      if (!el.name && !el.id) return;
      var type = (el.type || '').toLowerCase();
      if (/^(submit|button|reset|image|file|hidden|password)$/.test(type) || el.disabled || el.getAttribute('data-nowora') === 'off') return;
      var label = labelFor(el, form); if (!label || SKIP.test(label) || SKIP.test(el.name || '')) return;
      if (type === 'radio') { if (!el.checked) return; var g = el.closest('fieldset'); var gl = g && g.querySelector('legend'); label = (gl && gl.textContent.trim()) || (el.name.replace(/_/g, ' ').replace(/^\w/, function (m) { return m.toUpperCase(); })); }
      var v;
      if (type === 'checkbox') { v = el.checked ? 'Yes' : 'No'; }
      else if (el.tagName === 'SELECT' && el.multiple) v = [].filter.call(el.options, function (o) { return o.selected; }).map(function (o) { return o.text; }).join(', ');
      else if (el.tagName === 'SELECT') v = el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : '';
      else v = el.value;
      v = String(v || '').trim();
      if (out[label] && v) out[label] += ', ' + v; else if (!out[label]) out[label] = v;
      if (v && type !== 'checkbox') filled++;
    });
    if (filled < 1) return false;
    record(tableFor(form), out);
    return true;
  }
  document.addEventListener('submit', function (e) {
    var f = e.target;
    setTimeout(function () {                       // let the site's own checks run first
      var saved = false; try { saved = capture(f); } catch (x) {}
      if (!saved && (f.getAttribute('data-nowora') || '') !== 'manual') send('lead_submit', (f.getAttribute('name') || f.id || 'form').slice(0, 60));
    }, 0);
  }, true);

  window.nowora = { record: record };
  var q = window.noworaQ || []; window.noworaQ = { push: function (a) { try { record.apply(null, a); } catch (e) {} } };
  for (var i = 0; i < q.length; i++) window.noworaQ.push(q[i]);
})();
