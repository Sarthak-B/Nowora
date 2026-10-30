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
  Clients:    ['id','business','name','phone','email','site','package','price','delivered','carePlan','careFee','renewal','status','uptime','responseMs','lastCheck','checklist','notes'],
  Portfolio:  ['id','ts','title','niche','type','url','image','description','visible','order'],
  Pitches:    ['id','ts','prospectId','channel','template','message'],
  Automation: ['ts','workflow','status','summary','details']
};
const EDITABLE = ['Leads','Prospects','Clients','Portfolio','Pitches'];
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

  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'weeklyReport').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(19).inTimezone(TZ).create();

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
      const items = readAll_('Portfolio').filter(r => truthy_(r.visible));
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
      /* ---- owner dashboard ---- */
      case 'dashboard':          requireAdmin_(body); return json_({ ok: true, data: dashboard_() });
      case 'upsert':             requireAdmin_(body); return json_({ ok: true, row: upsert_(body.sheet, body.row) });
      case 'delete':             requireAdmin_(body); remove_(body.sheet, body.id); return json_({ ok: true });
      case 'upload':             requireAdmin_(body); return json_({ ok: true, url: saveImage_(body.data, body.name) });
      /* ---- GitHub automations ---- */
      case 'automation_targets': requireAutomation_(body); return json_({ ok: true, ...automationTargets_() });
      case 'automation_report':  requireAutomation_(body); return json_(automationReport_(body));
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

  append_('Automation', { ts: now, workflow: clip_(body.workflow, 40), status: clip_(body.status, 20), summary: clip_(body.summary, 300), details: clip_(body.details, 2000) });

  if (wentDown.length) notify_('Site down: ' + wentDown.length, '🚨 Care-plan site down\n\n' + wentDown.join('\n') + '\n\nChecked ' + Utilities.formatDate(new Date(), TZ, 'd MMM, h:mm a'));
  if (cameBack.length) notify_('Back up: ' + cameBack.join(', '), '✅ Back online: ' + cameBack.join(', '));
  return { ok: true };
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
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet "' + name + '" — run setup() once');
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
