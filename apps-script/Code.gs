/**
 * Studio OS — Google Sheets backend for your studio website.
 *
 * What it does
 *  - Stores every visit, tap and enquiry from the website in this Google Sheet
 *  - Alerts you on WhatsApp (via CallMeBot) and email the moment an enquiry arrives
 *  - Powers the owner dashboard (leads, prospects, clients, portfolio, automations)
 *  - Stores portfolio images and audit screenshots in a Google Drive folder
 *  - Receives results from the GitHub Actions + Playwright automations
 *  - Emails you a weekly review every Sunday evening
 *
 *  - Checks every client site every 5 minutes and alerts you the moment one goes down
 *
 * Setup (5 minutes) — full steps are in README.md
 *  1. Create a new Google Sheet (on your PERSONAL Google account).
 *  2. Extensions → Apps Script → paste this file → Save.
 *  3. Run `setup` once and approve permissions. Open View → Logs to copy your keys.
 *  4. Project Settings → Script properties: set NOTIFY_EMAIL, and optionally
 *     CALLMEBOT_PHONE + CALLMEBOT_APIKEY for WhatsApp alerts.
 *  5. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *     Paste the /exec URL into `endpoint` at the top of index.html.
 */

const SHEETS = {
  Events:     ['ts','vid','sid','type','label','ref','device','utm'],
  Leads:      ['id','ts','name','business','niche','package','phone','email','channel','message','status','notes','source','updated'],
  Prospects:  ['id','ts','name','business','niche','phone','website','maps','status','issue','lastContact','followUpDue','auditScore','auditIssues','screenshot','auditRequested','notes'],
  Clients:    ['id','business','name','phone','email','site','package','price','delivered','carePlan','careFee','renewal','status','uptime','responseMs','lastCheck','checklist','notes','portalKey','pin','trackId','advancePaid','balancePaid'],
  Portfolio:  ['id','ts','title','niche','type','url','image','description','visible','order','tag','embed','shot','theme'],
  Pitches:    ['id','ts','prospectId','channel','template','message'],
  Automation: ['ts','workflow','status','summary','details'],
  Requests:   ['id','ts','clientId','business','type','message','status','reply','updated'],
  ClientEvents: ['ts','cid','vid','sid','type','label','ref','device','path']
};
const EDITABLE = ['Leads','Prospects','Clients','Portfolio','Pitches','Requests'];
const EVENT_TYPES = ['pageview','section_view','cta_whatsapp','cta_email','package_click','lead_submit','work_click','faq_open'];
const EVENT_DAYS_IN_DASHBOARD = 60;
const TZ = 'Asia/Kolkata';

/* ============================== setup ============================== */

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = SHEETS[name];
    sh.getRange('A:Z').setNumberFormat('@');           // keep everything as text (no auto date conversion)
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('ADMIN_KEY')) p.setProperty('ADMIN_KEY', randomKey_(24));
  if (!p.getProperty('AUTOMATION_KEY')) p.setProperty('AUTOMATION_KEY', randomKey_(32));
  if (!p.getProperty('NOTIFY_EMAIL')) p.setProperty('NOTIFY_EMAIL', Session.getActiveUser().getEmail() || '');
  if (!p.getProperty('DRIVE_FOLDER_ID')) {
    const folder = DriveApp.createFolder('Studio OS uploads');
    p.setProperty('DRIVE_FOLDER_ID', folder.getId());
  }

  ScriptApp.getProjectTriggers()
    .filter(t => ['weeklyReport', 'quickCheck'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(19).inTimezone(TZ).create();
  ScriptApp.newTrigger('quickCheck').timeBased().everyMinutes(5).create();

  showKeys();
}

function showKeys() {
  const p = PropertiesService.getScriptProperties().getProperties();
  Logger.log('ADMIN_KEY (dashboard login):         ' + p.ADMIN_KEY);
  Logger.log('AUTOMATION_KEY (GitHub secret):      ' + p.AUTOMATION_KEY);
  Logger.log('NOTIFY_EMAIL:                        ' + (p.NOTIFY_EMAIL || '(not set)'));
  Logger.log('WhatsApp alerts (CallMeBot):         ' + (p.CALLMEBOT_PHONE && p.CALLMEBOT_APIKEY ? 'on' : 'off — set CALLMEBOT_PHONE and CALLMEBOT_APIKEY'));
}

/** Run this once after setting CallMeBot properties to confirm WhatsApp + email alerts work. */
function testAlerts() {
  notify_('Studio OS test', 'Test alert from your Studio OS backend. If you can read this, alerts work.');
}

/* ============================== web app ============================== */

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  try {
    if (action === 'portfolio') {
      const items = readAll_('Portfolio').filter(r => truthy_(r.visible) && (r.title || r.url));
      return json_({ ok: true, items: items });
    }
    return json_({ ok: true, service: 'studio-os', time: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Invalid JSON' }); }
  try {
    switch (body.action) {
      /* ---- public ---- */
      case 'track':              return json_(track_(body.event));
      case 'lead':               return json_(lead_(body.lead));
      case 'ctrack':             return json_(clientTrack_(body.event));
      /* ---- client portal (portal link + PIN) ---- */
      case 'portal':             return json_({ ok: true, data: portal_(portalClient_(body)) });
      case 'portal_request':     return json_(portalRequest_(portalClient_(body), body.request));
      /* ---- owner dashboard ---- */
      case 'dashboard':          requireAdmin_(body); return json_({ ok: true, data: dashboard_() });
      case 'upsert':             requireAdmin_(body); return json_({ ok: true, row: upsert_(body.sheet, body.row), queued: body.sheet === 'Portfolio' && body.row && body.row.shot === 'pending' ? dispatchShots_() : undefined });
      case 'inspect':            requireAdmin_(body); return json_({ ok: true, meta: inspect_(body.url) });
      case 'delete':             requireAdmin_(body); remove_(body.sheet, body.id); return json_({ ok: true });
      case 'upload':             requireAdmin_(body); return json_({ ok: true, url: saveImage_(body.data, body.name) });
      /* ---- GitHub automations ---- */
      case 'automation_targets': requireAutomation_(body); return json_({ ok: true, ...automationTargets_() });
      case 'automation_report':  requireAutomation_(body); return json_(automationReport_(body));
      case 'portfolio_targets':  requireAutomation_(body); return json_({ ok: true, items: portfolioTargets_() });
      default:                   return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/* ============================== public actions ============================== */

function track_(ev) {
  if (!ev || EVENT_TYPES.indexOf(ev.type) < 0) return { ok: false, error: 'Unknown event' };
  const row = {};
  SHEETS.Events.forEach(k => row[k] = clip_(ev[k], 120));
  row.ts = new Date().toISOString();                       // trust the server clock
  append_('Events', row);
  return { ok: true };
}

function lead_(l) {
  if (!l || !l.name || !l.business) return { ok: false, error: 'Name and business are required' };
  const row = {};
  SHEETS.Leads.forEach(k => row[k] = clip_(l[k], k === 'message' ? 1500 : 200));
  row.id = row.id || randomKey_(10);
  row.ts = new Date().toISOString();
  row.status = 'new';
  row.notes = '';
  append_('Leads', row);
  append_('Events', { ts: row.ts, vid: '', sid: '', type: 'lead_submit', label: row.package, ref: row.source, device: '', utm: '' });

  const reply = row.phone ? 'https://wa.me/' + digits_(row.phone) : (row.email || '');
  notify_(
    'New enquiry: ' + row.business,
    '🔔 New website enquiry\n\n' +
    row.name + ' — ' + row.business + ' (' + row.niche + ')\n' +
    'Package: ' + row.package + '\n' +
    'Prefers: ' + row.channel + '\n' +
    (row.message ? 'Message: ' + row.message + '\n' : '') +
    'Source: ' + (row.source || 'direct') + '\n\n' +
    'Reply: ' + reply
  );
  return { ok: true };
}

/* ============================== admin actions ============================== */

function dashboard_() {
  const cutoff = Date.now() - EVENT_DAYS_IN_DASHBOARD * 864e5;
  const data = {};
  Object.keys(SHEETS).forEach(name => {
    if (name === 'ClientEvents') return;                        // summarised per client in the portal instead
    let rows = readAll_(name);
    if (name === 'Events') rows = rows.filter(r => new Date(r.ts).getTime() > cutoff).slice(-25000);
    if (name === 'Automation') rows = rows.slice(-200);
    data[name] = rows;
  });
  return data;
}

function upsert_(sheet, row) {
  if (EDITABLE.indexOf(sheet) < 0) throw new Error('That sheet cannot be edited');
  if (!row || !row.id) throw new Error('Row needs an id');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (sheet === 'Clients') CacheService.getScriptCache().remove('track_ids');
    const sh = sheet_(sheet), headers = SHEETS[sheet];
    const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
    const i = ids.indexOf(String(row.id));
    if (i >= 0) {
      const current = rowToObj_(headers, sh.getRange(i + 2, 1, 1, headers.length).getValues()[0]);
      const merged = Object.assign(current, row);
      sh.getRange(i + 2, 1, 1, headers.length).setValues([headers.map(h => cell_(merged[h]))]);
      return merged;
    }
    append_(sheet, row);
    return row;
  } finally { lock.releaseLock(); }
}

function remove_(sheet, id) {
  if (EDITABLE.indexOf(sheet) < 0) throw new Error('That sheet cannot be edited');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet_(sheet);
    if (sh.getLastRow() < 2) return;
    const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    if (i >= 0) sh.deleteRow(i + 2);
  } finally { lock.releaseLock(); }
}

function saveImage_(dataUrl, name) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Expected an image');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], (name || 'upload') .replace(/[^\w.\- ]/g, '') || 'upload.jpg');
  const folder = DriveApp.getFolderById(prop_('DRIVE_FOLDER_ID'));
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600';
}

/* ============================== automation endpoints ============================== */

function automationTargets_() {
  const clients = readAll_('Clients')
    .filter(c => c.site && (c.status === 'live' || c.carePlan === 'yes') && c.status !== 'paused')
    .map(c => ({ id: c.id, business: c.business, site: c.site, uptime: c.uptime }));
  const prospects = readAll_('Prospects')
    .filter(p => p.website && truthy_(p.auditRequested))
    .map(p => ({ id: p.id, business: p.business, website: p.website }));
  return { clients: clients, prospects: prospects };
}

function automationReport_(body) {
  const now = new Date().toISOString();
  const wentDown = [], cameBack = [];

  (body.clients || []).forEach(r => {
    const before = readAll_('Clients').find(c => c.id === r.id);
    if (!before) return;
    if (r.uptime === 'down' && before.uptime !== 'down') wentDown.push(before.business + ' — ' + before.site + (r.error ? ' (' + r.error + ')' : ''));
    if (r.uptime === 'up' && before.uptime === 'down') cameBack.push(before.business);
    upsert_('Clients', { id: r.id, uptime: r.uptime, responseMs: r.responseMs, lastCheck: now });
  });

  (body.prospects || []).forEach(r => {
    const before = readAll_('Prospects').find(p => p.id === r.id);
    if (!before) return;
    const update = { id: r.id, auditScore: r.auditScore, auditIssues: (r.auditIssues || []).join('|'), auditRequested: 'false' };
    if (r.screenshot) update.screenshot = saveImage_(r.screenshot, before.business + ' mobile.jpg');
    if (before.status === 'new') update.status = 'audited';
    upsert_('Prospects', update);
  });

  (body.portfolio || []).forEach(r => {
    const before = readAll_('Portfolio').find(p => p.id === r.id);
    if (!before) return;
    const update = { id: r.id, shot: r.error ? 'failed' : 'done' };
    if (r.image) update.image = clip_(r.image, 400);
    if (!before.title && r.title) update.title = clip_(r.title, 80);
    if (!before.description && r.description) update.description = clip_(r.description, 220);
    upsert_('Portfolio', update);
  });

  append_('Automation', { ts: now, workflow: clip_(body.workflow, 40), status: clip_(body.status, 20), summary: clip_(body.summary, 300), details: clip_(body.details, 2000) });

  if (wentDown.length) notify_('Site down: ' + wentDown.length, '🚨 Care-plan site down\n\n' + wentDown.join('\n') + '\n\nChecked ' + Utilities.formatDate(new Date(), TZ, 'd MMM, h:mm a'));
  if (cameBack.length) notify_('Back up: ' + cameBack.join(', '), '✅ Back online: ' + cameBack.join(', '));
  return { ok: true };
}



/* ============================== client portal ============================== */

const CLIENT_EVENTS = ['pageview', 'cta_whatsapp', 'cta_call', 'cta_email', 'lead_submit'];
const PORTAL_DAYS = 30;

/** Finds the client for a portal link + PIN. Locks a link for 15 minutes after 6 wrong PINs. */
function portalClient_(body) {
  const key = String(body.portalKey || '').trim(), pin = String(body.pin || '').trim();
  if (!/^[\w-]{3,40}$/.test(key)) throw new Error('This portal link is not valid');
  const cache = CacheService.getScriptCache(), fk = 'pfail_' + key.toLowerCase(), dk = 'pday_' + key.toLowerCase();
  const fails = +(cache.get(fk) || 0), daily = +(cache.get(dk) || 0);
  if (daily >= 20) throw new Error('Too many wrong PINs today. Ask NOWORA for help on WhatsApp.');
  if (fails >= 6) throw new Error('Too many wrong PINs. Try again in 15 minutes.');
  const c = readAll_('Clients').find(x => x.portalKey && x.portalKey.toLowerCase() === key.toLowerCase());
  if (!c) throw new Error('This portal link is not valid any more — ask NOWORA for a new one');
  if (!c.pin || pin !== String(c.pin)) { cache.put(fk, String(fails + 1), 900); cache.put(dk, String(daily + 1), 21600); throw new Error('Wrong PIN'); }
  cache.remove(fk);
  return c;
}

function portal_(c) {
  const since = Date.now() - 2 * PORTAL_DAYS * 864e5, mid = Date.now() - PORTAL_DAYS * 864e5;
  const ev = c.trackId ? readAll_('ClientEvents').filter(e => e.cid === c.trackId && new Date(e.ts).getTime() > since) : [];
  const cur = ev.filter(e => new Date(e.ts).getTime() > mid), prev = ev.filter(e => new Date(e.ts).getTime() <= mid);
  const uniq = (list, t) => new Set(list.filter(e => !t || e.type === t).map(e => e.vid)).size;
  const n = (list, t) => list.filter(e => e.type === t).length;
  const days = [];
  for (let i = PORTAL_DAYS - 1; i >= 0; i--) {
    const d = Utilities.formatDate(new Date(Date.now() - i * 864e5), TZ, 'yyyy-MM-dd');
    const de = cur.filter(e => Utilities.formatDate(new Date(e.ts), TZ, 'yyyy-MM-dd') === d);
    days.push({ d: d, v: uniq(de, 'pageview'), t: de.filter(e => e.type !== 'pageview').length });
  }
  const tally = (list, f) => { const o = {}; list.forEach(e => { const k = f(e); if (k) o[k] = (o[k] || 0) + 1; }); return Object.keys(o).map(k => [k, o[k]]).sort((a, b) => b[1] - a[1]).slice(0, 6); };
  const pv = cur.filter(e => e.type === 'pageview');
  return {
    client: {
      business: c.business, name: c.name, site: c.site, status: c.status, package: c.package, price: c.price,
      delivered: c.delivered, carePlan: c.carePlan, careFee: c.careFee, renewal: c.renewal,
      uptime: c.uptime, responseMs: c.responseMs, lastCheck: c.lastCheck,
      advancePaid: c.advancePaid, balancePaid: c.balancePaid, tracking: !!c.trackId, checklist: c.checklist
    },
    stats: {
      days: days, hasData: ev.length > 0,
      totals: { visitors: uniq(pv), views: pv.length, whatsapp: n(cur, 'cta_whatsapp'), calls: n(cur, 'cta_call'), emails: n(cur, 'cta_email'), enquiries: n(cur, 'lead_submit') },
      previous: { visitors: uniq(prev, 'pageview'), taps: prev.filter(e => /^cta_/.test(e.type)).length, enquiries: n(prev, 'lead_submit') },
      sources: tally(pv, e => e.ref || 'direct'), devices: tally(pv, e => e.device || 'desktop'), pages: tally(pv, e => e.path || '/'),
      recent: cur.slice(-14).reverse().map(e => ({ ts: e.ts, type: e.type, label: e.label, ref: e.ref, device: e.device }))
    },
    requests: readAll_('Requests').filter(r => r.clientId === c.id).sort((a, b) => b.ts < a.ts ? -1 : 1).slice(0, 30)
      .map(r => ({ id: r.id, ts: r.ts, type: r.type, message: r.message, status: r.status, reply: r.reply, updated: r.updated }))
  };
}

function portalRequest_(c, r) {
  if (!r || !String(r.message || '').trim()) return { ok: false, error: 'Write what you would like changed' };
  const open = readAll_('Requests').filter(x => x.clientId === c.id && x.status !== 'done').length;
  if (open >= 15) return { ok: false, error: 'You have 15 open requests — we will work through those first' };
  const row = { id: randomKey_(12), ts: new Date().toISOString(), clientId: c.id, business: c.business, type: clip_(r.type || 'Change', 40), message: clip_(r.message, 2000), status: 'new', reply: '', updated: '' };
  append_('Requests', row);
  notify_('Request from ' + c.business, '📝 New request from ' + c.business + ' (' + row.type + ')\n\n' + row.message + '\n\nOpen your dashboard → Requests to reply.');
  return { ok: true, request: row };
}

/** Events from client websites (the t.js snippet). Only known tracking IDs are accepted. */
function clientTrack_(ev) {
  if (!ev || CLIENT_EVENTS.indexOf(ev.type) < 0) return { ok: false, error: 'Unknown event' };
  const cache = CacheService.getScriptCache();
  let ids = cache.get('track_ids');
  if (!ids) { ids = JSON.stringify(readAll_('Clients').map(c => c.trackId).filter(Boolean)); cache.put('track_ids', ids, 300); }
  if (JSON.parse(ids).indexOf(String(ev.cid)) < 0) return { ok: false, error: 'Unknown site' };
  const row = {};
  SHEETS.ClientEvents.forEach(k => row[k] = clip_(ev[k], k === 'path' ? 80 : 60));
  row.ts = new Date().toISOString();
  append_('ClientEvents', row);
  return { ok: true };
}

/* ============================== portfolio from a link ============================== */

// Niche guesses: [pattern, niche label, showcase filter]
const NICHES_ = [
  [/restaurant|dining|cuisine|biryani|bistro|dhaba|chef|cooking|dishes|tasting|thali|reserve a table/, 'Restaurant', 'Local business'],
  [/caf[eé]|coffee|espresso|tea house/, 'Café', 'Local business'],
  [/bak(e|ery|es|ing)|cakes?\b|patisserie|pastr|dessert|cookie|mithai|sweets/, 'Bakery & sweets', 'Local business'],
  [/salon|spa\b|beauty|skin ?care|makeup|nail|barber|hair/, 'Beauty & wellness', 'Local business'],
  [/gym|fitness|workout|strength|crossfit|personal train/, 'Gym & fitness', 'Local business'],
  [/yoga|pilates|meditation/, 'Yoga studio', 'Local business'],
  [/dental|dentist|clinic|hospital|doctor|physio|health ?care|ayurved/, 'Clinic', 'Local business'],
  [/hotel|resort|homestay|villa|stay|hostel/, 'Hotel & stays', 'Local business'],
  [/real estate|propert|apartment|realty|homes|bhk|estates?\b|viewing/, 'Real estate', 'Services'],
  [/wealth|financ|invest|mutual fund|insurance|tax|account(ant|ing)|\bca\b/, 'Finance', 'Services'],
  [/agency|marketing|seo|branding|design studio|advertis/, 'Agency', 'Services'],
  [/law|lawyer|legal|advocate/, 'Legal', 'Services'],
  [/tuition|coaching|course|academy|classes|school|learn|tutor/, 'Education', 'Services'],
  [/e-?book|book|webinar|masterclass|workshop|launch|pre-?order|limited offer|checkout/, 'Sales page', 'Sales funnels'],
  [/headphone|earbud|speaker|gadget|watch|phone|laptop|device|audio/, 'Product', 'Shops & brands'],
  [/saree|fashion|clothing|apparel|wear|boutique|jewel|kurta|lehenga|sneaker/, 'Fashion', 'Shops & brands'],
  [/shop|store|buy now|add to cart|collection|candles|handmade|skincare products/, 'Online shop', 'Shops & brands'],
  [/portfolio|photograph|resume|freelanc|designer|developer|creator/, 'Portfolio', 'Services'],
  [/wedding|event|decor|planner/, 'Events', 'Services']
];

/** Reads a public page and returns what the showcase needs: title, description, niche, filter tag, social image, colour and whether it can be embedded. */
function inspect_(rawUrl) {
  const url = normUrl_(rawUrl);
  if (!/^https?:\/\/[^\s/]+\.[^\s]+/i.test(url)) throw new Error('That does not look like a website link');
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true, followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'Accept-Language': 'en-IN,en;q=0.9' }
  });
  const code = res.getResponseCode();
  if (code >= 400) throw new Error('The site answered with error ' + code + ' — check the link is public');
  const meta = parseMeta_(res.getContentText().slice(0, 2000000), url, res.getAllHeaders());
  meta.status = code;
  return meta;
}

function parseMeta_(html, url, headers) {
  const h = {};
  Object.keys(headers || {}).forEach(k => h[k.toLowerCase()] = String(headers[k]));
  const dec = t => String(t || '').replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (m, x) => String.fromCharCode(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&middot;/g, '·').replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ').trim();
  const body = stripData_(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const m = {};
  (html.match(/<meta\b[^>]*>/gi) || []).forEach(tag => {
    const a = {}; let r; const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>"']+))/g;
    while ((r = re.exec(tag))) a[r[1].toLowerCase()] = r[3] !== undefined ? r[3] : r[4] !== undefined ? r[4] : r[5];
    const k = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (k && a.content !== undefined && m[k] === undefined) m[k] = dec(a.content);
  });
  const first = re => { const x = re.exec(body); return x ? dec(x[1]) : ''; };
  const docTitle = first(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1 = first(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  let para = '';
  const pre = /<p\b[^>]*>([\s\S]*?)<\/p>/gi; let pm;
  while ((pm = pre.exec(body))) { const t = dec(pm[1]); if (t.length >= 60) { para = t; break; } }

  const full = m['og:title'] || m['twitter:title'] || docTitle || h1;
  const parts = full.split(/\s+[|—–·]\s+|:\s+|\s+-\s+/).map(x => x.trim()).filter(Boolean);
  let title = m['og:site_name'] || m['application-name'] || (parts[0] && parts[0].length <= 48 ? parts[0] : '') || full || hostName_(url);
  title = title.slice(0, 80);
  const tagline = parts.length > 1 ? parts.slice(1).join(' · ') : '';

  let description = m['og:description'] || m['description'] || m['twitter:description'] || para || tagline || h1;
  if (description.length > 220) description = description.slice(0, 217).replace(/\s+\S*$/, '') + '…';

  // score every niche: words in the title, headline and description count three times
  const strong = [full, description, h1].join(' ').toLowerCase(), weak = [m['keywords'] || '', dec(body.replace(/^[\s\S]*?<body/i, '')).slice(0, 80000)].join(' ').toLowerCase();
  const count = (re, t) => (t.match(new RegExp(re.source, 'g')) || []).length;
  let niche = '', tag = 'Services', best = 0;
  NICHES_.forEach(n => { const sc = 3 * count(n[0], strong) + Math.min(count(n[0], weak), 6); if (sc > best) { best = sc; niche = n[1]; tag = n[2]; } });

  const xfo = (h['x-frame-options'] || '').toLowerCase();
  const fa = /frame-ancestors([^;]*)/i.exec(h['content-security-policy'] || '');
  const embed = !/deny|sameorigin/.test(xfo) && !(fa && !/\*/.test(fa[1]) && !/nowora/i.test(fa[1]));

  return {
    url: url, title: title, description: description, niche: niche, tag: tag, h1: h1.slice(0, 120),
    image: absUrl_(m['og:image'] || m['og:image:url'] || m['twitter:image'] || '', url),
    theme: /^#[0-9a-f]{3,8}$/i.test(m['theme-color'] || '') ? m['theme-color'] : '',
    embed: embed
  };
}

function portfolioTargets_() {
  return readAll_('Portfolio').filter(p => p.url && p.shot === 'pending').map(p => ({ id: p.id, url: normUrl_(p.url), title: p.title }));
}

/** Optional: starts the screenshot workflow right away. Needs Script properties GITHUB_TOKEN + GITHUB_REPO; otherwise the 10-minute schedule picks it up. */
function dispatchShots_() {
  const token = prop_('GITHUB_TOKEN'), repo = prop_('GITHUB_REPO');
  if (!token || !repo) return 'scheduled';
  try {
    const r = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/actions/workflows/portfolio.yml/dispatches', {
      method: 'post', muteHttpExceptions: true, contentType: 'application/json', payload: JSON.stringify({ ref: 'main' }),
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
    });
    return r.getResponseCode() < 300 ? 'now' : 'scheduled';
  } catch (e) { return 'scheduled'; }
}

/** Removes long inline data: URIs (embedded images) without a regex, so huge pages can't overflow the stack. */
function stripData_(html) {
  let out = '', i = 0;
  while (true) {
    const j = html.indexOf('data:', i);
    if (j < 0) { out += html.slice(i); break; }
    let k = j + 5;
    while (k < html.length) { const c = html.charCodeAt(k); if (c === 34 || c === 39 || c === 41 || c <= 32) break; k++; }
    out += html.slice(i, j) + (k - j > 200 ? '' : html.slice(j, k));
    i = k;
  }
  return out;
}
function normUrl_(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : 'https://' + u; }
function hostName_(u) { return (/^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(u) || [])[1] || u; }
function absUrl_(src, base) {
  src = String(src || '').trim(); if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  const o = /^(https?:)\/\/[^/]+/i.exec(base); if (!o) return src;
  if (src.indexOf('//') === 0) return o[1] + src;
  if (src.charAt(0) === '/') return o[0] + src;
  return base.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + src;
}

/* ============================== 5-minute uptime check ============================== */

/**
 * Runs every 5 minutes (trigger created by setup). Requests each live / care-plan client site,
 * retries once before calling it down, updates the Clients tab, and alerts only when a site
 * changes state (down, or back up). The GitHub Playwright check every 3 hours goes deeper
 * and confirms the page really renders in a browser.
 */
function quickCheck() {
  const targets = readAll_('Clients').filter(c => c.site && (c.status === 'live' || c.carePlan === 'yes') && c.status !== 'paused');
  if (!targets.length) return;
  const now = new Date().toISOString(), wentDown = [], cameBack = [];

  targets.forEach(c => {
    let r = ping_(c.site);
    if (!r.up) { Utilities.sleep(10000); r = ping_(c.site); }   // one retry so a blip doesn't page you
    const state = r.up ? 'up' : 'down';
    if (state === 'down' && c.uptime !== 'down') wentDown.push(c.business + ' — ' + c.site + ' (' + r.error + ')');
    if (state === 'up' && c.uptime === 'down') cameBack.push(c.business);
    upsert_('Clients', { id: c.id, uptime: state, responseMs: r.ms, lastCheck: now });
  });

  if (wentDown.length) {
    notify_('Site down: ' + wentDown.length, '🚨 Care-plan site down\n\n' + wentDown.join('\n') + '\n\nChecked ' + Utilities.formatDate(new Date(), TZ, 'd MMM, h:mm a'));
    append_('Automation', { ts: now, workflow: 'quick-check', status: 'failure', summary: wentDown.length + ' site(s) went down', details: '' });
  }
  if (cameBack.length) {
    notify_('Back up: ' + cameBack.join(', '), '✅ Back online: ' + cameBack.join(', '));
    append_('Automation', { ts: now, workflow: 'quick-check', status: 'success', summary: 'Back online: ' + cameBack.length + ' site(s)', details: '' });
  }
}

function ping_(url) {
  const u = /^https?:\/\//i.test(url) ? url : 'https://' + url;
  const t0 = Date.now();
  try {
    const res = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: true });
    const ms = Date.now() - t0, code = res.getResponseCode(), size = res.getContent().length;
    if (code >= 400) return { up: false, ms: ms, error: 'HTTP ' + code };
    if (size < 300) return { up: false, ms: ms, error: 'Page came back almost empty' };
    return { up: true, ms: ms, error: '' };
  } catch (e) {
    return { up: false, ms: '', error: String(e.message || e).split('\n')[0].slice(0, 120) };
  }
}

/* ============================== weekly review ============================== */

function weeklyReport() {
  const weekAgo = Date.now() - 7 * 864e5;
  const inWeek = r => new Date(r.ts).getTime() > weekAgo;
  const ev = readAll_('Events').filter(inWeek);
  const visitors = {}; ev.filter(e => e.type === 'pageview').forEach(e => visitors[e.vid] = 1);
  const taps = ev.filter(e => /cta_|package_click/.test(e.type)).length;
  const leads = readAll_('Leads').filter(inWeek);
  const pitches = readAll_('Pitches').filter(inWeek).length;
  const prospects = readAll_('Prospects');
  const clients = readAll_('Clients');
  const care = clients.filter(c => c.carePlan === 'yes' && c.status !== 'paused');
  const mrr = care.reduce((s, c) => s + (+c.careFee || 0), 0);
  const soon = Utilities.formatDate(new Date(Date.now() + 7 * 864e5), TZ, 'yyyy-MM-dd');
  const renewals = care.filter(c => c.renewal && c.renewal <= soon).map(c => c.business);

  const text =
    '📊 Weekly studio review\n\n' +
    'Visitors: ' + Object.keys(visitors).length + '\n' +
    'WhatsApp/email taps: ' + taps + '\n' +
    'Enquiries: ' + leads.length + '\n' +
    'Outreach messages sent: ' + pitches + '\n' +
    'Calls booked: ' + prospects.filter(p => p.status === 'call_booked').length + '\n' +
    'Proposals out: ' + prospects.filter(p => p.status === 'proposal').length + '\n' +
    'Care-plan income: ₹' + mrr.toLocaleString('en-IN') + '/month (' + care.length + ' sites)\n' +
    (renewals.length ? 'Renewals this week: ' + renewals.join(', ') + '\n' : '') +
    '\nMonthly review questions:\n' +
    '1. Which channel brought the best clients?\n' +
    '2. What took longer than it should have, and can it go into the starter kit?\n' +
    '3. Should prices go up?\n' +
    '4. What is one thing to stop doing next month?';
  notify_('Your weekly studio review', text);
  append_('Automation', { ts: new Date().toISOString(), workflow: 'weekly', status: 'success', summary: 'Weekly review sent · ' + leads.length + ' enquiries · ' + pitches + ' messages', details: '' });
}

/* ============================== helpers ============================== */

function notify_(subject, text) {
  const p = PropertiesService.getScriptProperties().getProperties();
  if (p.NOTIFY_EMAIL) {
    try { MailApp.sendEmail(p.NOTIFY_EMAIL, subject, text); } catch (e) { console.error('Email failed: ' + e); }
  }
  if (p.CALLMEBOT_PHONE && p.CALLMEBOT_APIKEY) {
    const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(p.CALLMEBOT_PHONE) +
      '&text=' + encodeURIComponent(text.slice(0, 1500)) + '&apikey=' + encodeURIComponent(p.CALLMEBOT_APIKEY);
    try { UrlFetchApp.fetch(url, { muteHttpExceptions: true }); } catch (e) { console.error('WhatsApp failed: ' + e); }
  }
}

function requireAdmin_(body) {
  if (!body.key || body.key !== prop_('ADMIN_KEY')) { Utilities.sleep(800); throw new Error('Wrong admin key'); }
}
function requireAutomation_(body) {
  if (!body.key || body.key !== prop_('AUTOMATION_KEY')) throw new Error('Wrong automation key');
}
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh && SHEETS[name]) {                                     // new tabs are created on first use
    sh = ss.insertSheet(name);
    sh.getRange('A:Z').setNumberFormat('@');
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  if (!sh) throw new Error('Missing sheet "' + name + '" — run setup() once');
  const want = SHEETS[name];                                   // add any new columns automatically
  if (want && sh.getLastColumn() < want.length) sh.getRange(1, 1, 1, want.length).setValues([want]).setFontWeight('bold');
  return sh;
}
function readAll_(name) {
  const sh = sheet_(name), headers = SHEETS[name];
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getDisplayValues().map(r => rowToObj_(headers, r));
}
function append_(name, obj) {
  sheet_(name).appendRow(SHEETS[name].map(h => cell_(obj[h])));
}
function rowToObj_(headers, row) { const o = {}; headers.forEach((h, i) => o[h] = row[i] === undefined ? '' : String(row[i])); return o; }
function cell_(v) {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? "'" + s : s;   // block formula injection
}
function clip_(v, n) { return v === undefined || v === null ? '' : String(v).slice(0, n); }
function truthy_(v) { return v === true || v === 'TRUE' || v === 'true' || v === '1' || v === 'yes'; }
function digits_(p) { let d = String(p || '').replace(/\D/g, ''); if (d.length === 10) d = '91' + d; return d; }
function randomKey_(n) { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += c.charAt(Math.floor(Math.random() * c.length)); return s; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
