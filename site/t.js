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
  document.addEventListener('submit', function (e) {
    var f = e.target; send('lead_submit', (f.getAttribute('name') || f.id || 'form').slice(0, 60));
  }, true);
})();
