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
  Clients:    ['id','business','name','phone','email','site','package','price','delivered','carePlan','careFee','renewal','status','uptime','responseMs','lastCheck','checklist','notes','portalKey','pin','trackId','advancePaid','balancePaid','repo','editAccess','dataSheet'],
  Portfolio:  ['id','ts','title','niche','type','url','image','description','visible','order','tag','embed','shot','theme','repo'],
  Pitches:    ['id','ts','prospectId','channel','template','message'],
  Automation: ['ts','workflow','status','summary','details'],
  Requests:   ['id','ts','clientId','business','type','message','status','reply','updated','attachment']
};
// Each client's log lives in its own tab of a separate spreadsheet ("NOWORA — Client sites").
const CLIENT_LOG = ['ts','type','label','ref','device','path','vid','sid'];
const LEGACY_CLIENT_EVENTS = ['ts','cid','vid','sid','type','label','ref','device','path'];   // old single tab, moved by tidyUp()

/* ---------- how the spreadsheet looks: tab names, column headings, widths ---------- */
const TAB_TITLE = { Leads: 'Enquiries', Clients: 'Clients', Requests: 'Change requests', Prospects: 'Outreach', Pitches: 'Outreach messages',
  Portfolio: 'Showcase', Events: 'Website visits', Automation: 'Automation log' };
const TAB_ORDER = ['Leads', 'Clients', 'Requests', 'Prospects', 'Pitches', 'Portfolio', 'Events', 'Automation'];
const TAB_COLOR = { Leads: '#F2A33A', Clients: '#1D4A3D', Requests: '#5E8C7C', Prospects: '#C9D7CF', Pitches: '#C9D7CF', Portfolio: '#9DB8AC', Events: '#E1EEF5', Automation: '#D9D9D9' };
const TAB_ABOUT = {
  Leads: 'Every enquiry sent from the form on your website. Change Status as you follow up.',
  Clients: 'Your clients: their website, plan, payments, care plan, dashboard link and PIN, and whether they can edit their site.',
  Requests: 'Changes your clients asked for from their dashboard, with your reply (they see it).',
  Prospects: 'Businesses you are reaching out to, with follow-up dates and website check results.',
  Pitches: 'Each outreach message you sent from the dashboard.',
  Portfolio: 'The websites shown in the showcase on your website.',
  Events: 'Visits and taps on your own website (nowora.vercel.app), newest at the bottom.',
  Automation: 'Every automatic job: uptime checks, website checks, preview captures, weekly review, client edits.'
};
// [heading, width in pixels] in the same order as SHEETS[name]
const HEAD = {
  Events: [['Time',150],['Visitor ID',110],['Visit ID',110],['What happened',170],['Detail',220],['Came from',120],['Device',90],['Campaign',110]],
  Leads: [['ID',100],['Received',150],['Name',150],['Business',180],['Type of business',160],['Plan wanted',120],['Phone',130],['Email',200],['Reply by',100],['Message',320],['Status',120],['My notes',240],['Came from',110],['Last updated',150]],
  Prospects: [['ID',100],['Added',150],['Contact',150],['Business',180],['Type of business',150],['Phone',130],['Their website',200],['Google Maps link',160],['Status',120],['Problem spotted',220],['Last contacted',120],['Follow up on',120],['Site score',90],['Site issues found',260],['Phone screenshot',160],['Website check queued',150],['My notes',240]],
  Clients: [['ID',100],['Business',170],['Contact',150],['WhatsApp',130],['Email',190],['Website',210],['Plan',100],['Project price (₹)',130],['Delivered on',120],['Care plan',90],['Care fee / month (₹)',150],['Next renewal',120],['Status',100],['Site is',80],['Load time (ms)',110],['Last checked',150],['Onboarding steps done',160],['Notes',240],['Dashboard link name',160],['Dashboard PIN',110],['Visitor tracking ID',140],['First 50% paid',120],['Second 50% paid',130],['GitHub repo',170],['Website editing',130],['Their database (sheet ID)',200]],
  Portfolio: [['ID',100],['Added',150],['Title',170],['Niche',150],['Kind',90],['Website',220],['Preview image',200],['Description',320],['Show on site',100],['Order',70],['Showcase filter',140],['Can show live',110],['Preview capture',120],['Theme',90],['GitHub repo',170]],
  Pitches: [['ID',100],['Sent',150],['Prospect ID',110],['Sent via',100],['Template',140],['Message',420]],
  Automation: [['Time',150],['Job',120],['Result',90],['Summary',360],['Details',420]],
  Requests: [['ID',100],['Received',150],['Client ID',110],['Client',170],['Kind of change',170],['Message',360],['Status',110],['My reply',300],['Last updated',150],['Photo',200]],
  _client: [['Time',150],['What happened',200],['Detail',260],['Came from',130],['Device',90],['Page',140],['Visitor ID',110],['Visit ID',110]]
};
const TECH_COLS = ['id','vid','sid','clientId','prospectId','trackId','checklist','portalKey','dataSheet'];   // shown in grey
const TIME_COLS = { Events: ['ts'], Leads: ['ts','updated'], Prospects: ['ts'], Clients: ['lastCheck'], Portfolio: ['ts'], Pitches: ['ts'], Automation: ['ts'], Requests: ['ts','updated'], _client: ['ts'] };
const TIME_FORMAT = 'd mmm yyyy, h:mm am/pm';
// Plain-English words for event codes in the sheet; the code still reads both.
const EVENT_WORDS = { pageview: 'Visited the site', section_view: 'Scrolled to', cta_whatsapp: 'Tapped WhatsApp', cta_email: 'Tapped email', cta_call: 'Tapped call',
  package_click: 'Tapped a plan', lead_submit: 'Sent an enquiry', work_click: 'Opened a showcase site', faq_open: 'Read a question',
  request: 'Sent a change request', publish: 'Published website changes', restore: 'Restored an older version', site_down: 'Website went down', site_up: 'Website back online' };
const EVENT_CODE = Object.keys(EVENT_WORDS).reduce((o, k) => (o[EVENT_WORDS[k]] = k, o), {});
const CHOICES = {
  Leads: { status: ['new','contacted','call_booked','proposal','won','lost'], channel: ['whatsapp','email'] },
  Prospects: { status: ['new','audited','messaged','followed_up','replied','call_booked','proposal','won','lost'] },
  Clients: { status: ['onboarding','building','live','paused'], carePlan: ['yes','no'], editAccess: ['auto','on','off'], advancePaid: ['yes',''], balancePaid: ['yes',''], package: ['Starter','Business','Growth','Custom'] },
  Requests: { status: ['new','progress','done'] },
  Portfolio: { visible: ['TRUE','FALSE'], type: ['concept','client'] }
};
const EDITABLE = ['Leads','Prospects','Clients','Portfolio','Pitches','Requests'];
const EVENT_TYPES = ['pageview','section_view','cta_whatsapp','cta_email','package_click','lead_submit','work_click','faq_open'];
const EVENT_DAYS_IN_DASHBOARD = 60;
const TZ = 'Asia/Kolkata';

/* ============================== setup ============================== */

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(name => sheet_(name));

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

  tidyUp();
  showKeys();
}

function showKeys() {
  const p = PropertiesService.getScriptProperties().getProperties();
  Logger.log('ADMIN_KEY (dashboard login):         ' + p.ADMIN_KEY);
  Logger.log('AUTOMATION_KEY (GitHub secret):      ' + p.AUTOMATION_KEY);
  Logger.log('NOTIFY_EMAIL:                        ' + (p.NOTIFY_EMAIL || '(not set)'));
  Logger.log('Client sites spreadsheet:            ' + (p.CLIENT_DB_ID ? 'https://docs.google.com/spreadsheets/d/' + p.CLIENT_DB_ID : '(made when you run tidyUp)'));
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
      case 'cform':              return json_(clientForm_(body));
      /* ---- client portal (portal link + PIN) ---- */
      case 'portal':             return json_({ ok: true, data: portal_(portalClient_(body), +body.since || 0) });
      case 'portal_request':     return json_(portalRequest_(writable_(portalClient_(body)), body.request));
      /* ---- website editor (client portal) ---- */
      case 'site_source':        return json_({ ok: true, site: siteSource_(portalClient_(body)) });
      case 'site_publish':       return json_(sitePublish_(writable_(portalClient_(body)), body));
      case 'site_versions':      return json_({ ok: true, versions: siteVersions_(portalClient_(body)) });
      case 'site_restore':       return json_(siteRestore_(writable_(portalClient_(body)), body.sha));
      /* ---- client database (portal link + PIN) ---- */
      case 'db_get':             return json_(dbGet_(portalClient_(body), body.tableId));
      case 'db_rev':             return json_({ ok: true, rev: dbRev_(portalClient_(body)) });
      case 'db_save_table':      return json_(dbSaveTable_(writable_(portalClient_(body)), body.table));
      case 'db_delete_table':    return json_(dbDeleteTable_(writable_(portalClient_(body)), body.tableId));
      case 'db_save_row':        return json_(dbSaveRow_(writable_(portalClient_(body)), body.tableId, body.row));
      case 'db_delete_rows':     return json_(dbDeleteRows_(writable_(portalClient_(body)), body.tableId, body.ids));
      /* ---- owner dashboard ---- */
      case 'dashboard':          requireAdmin_(body); return json_({ ok: true, data: dashboard_() });
      case 'upsert':             requireAdmin_(body); return json_({ ok: true, row: upsert_(body.sheet, body.row), queued: body.sheet === 'Portfolio' && body.row && body.row.shot === 'pending' ? dispatchShots_() : undefined });
      case 'inspect':            requireAdmin_(body); return json_({ ok: true, meta: inspect_(body.url) });
      case 'delete':             requireAdmin_(body); remove_(body.sheet, body.id); return json_({ ok: true });
      case 'upload':             requireAdmin_(body); return json_({ ok: true, url: saveImage_(body.data, body.name) });
      /* ---- GitHub automations ---- */
      case 'automation_targets': requireAutomation_(body); return json_({ ok: true, ...automationTargets_() });
      case 'automation_report':  requireAutomation_(body); return json_(automationReport_(body));
      case 'register_site':      requireAutomation_(body); return json_(registerSite_(body.site || {}));
      case 'portfolio_targets':  requireAutomation_(body); return json_({ ok: true, items: portfolioTargets_() });
      case 'order_alerts':       requireAutomation_(body); return json_({ ok: true, orders: orderAlerts_(body.since) });
      default:                   return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/* ============================== public actions ============================== */

function track_(ev) {
  if (!ev || EVENT_TYPES.indexOf(ev.type) < 0) return { ok: false, error: 'Unknown event' };
  if (String(ev.ref || '') === 'setup-test') return { ok: true, skipped: true };
  if (ev.bot === true || ev.framed === true) return { ok: true, skipped: true };
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
    if (sheet === 'Clients') CacheService.getScriptCache().remove('track_map');
    const sh = sheet_(sheet), headers = SHEETS[sheet];
    const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
    const i = ids.indexOf(String(row.id));
    if (i >= 0) {
      const current = rowToObj_(headers, sh.getRange(i + 2, 1, 1, headers.length).getValues()[0], sheet);
      const merged = Object.assign(current, row);
      sh.getRange(i + 2, 1, 1, headers.length).setValues([rowCells_(sheet, merged)]);
      if (sheet === 'Clients' && row.business !== undefined) afterClientChange_(merged);
      return merged;
    }
    append_(sheet, row);
    if (sheet === 'Clients') afterClientChange_(row);
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
    if (i >= 0) {
      if (sheet === 'Clients') { const gone = rowToObj_(SHEETS.Clients, sh.getRange(i + 2, 1, 1, SHEETS.Clients.length).getValues()[0], 'Clients'); try { retireClientTab_(gone); } catch (e) { console.error(e); } CacheService.getScriptCache().remove('track_map'); }
      sh.deleteRow(i + 2);
    }
  } finally { lock.releaseLock(); }
}

/** The Drive folder for uploads. If it was deleted or belongs to another account, a new one is made. */
function uploadsFolder_() {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('DRIVE_FOLDER_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* missing or no access: make a new one */ }
  }
  const folder = DriveApp.createFolder('NOWORA uploads');
  p.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function saveImage_(dataUrl, name) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Expected an image');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], (name || 'upload') .replace(/[^\w.\- ]/g, '') || 'upload.jpg');
  const file = uploadsFolder_().createFile(blob);
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
    if (r.uptime === 'down' && before.uptime !== 'down') { wentDown.push(before.business + ' — ' + before.site + (r.error ? ' (' + r.error + ')' : '')); clientLog_(before, { ts: now, type: 'site_down', label: r.error || '', ref: 'browser check' }); }
    if (r.uptime === 'up' && before.uptime === 'down') { cameBack.push(before.business); clientLog_(before, { ts: now, type: 'site_up', label: (r.responseMs || '') + ' ms', ref: 'browser check' }); }
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
  if (body.key && prop_('ADMIN_KEY') && String(body.key) === prop_('ADMIN_KEY')) {   // owner view: no PIN needed
    const own = readAll_('Clients').find(x => (body.clientId && x.id === body.clientId) || (key && x.portalKey && x.portalKey.toLowerCase() === key.toLowerCase()));
    if (!own) throw new Error('Client not found');
    own._owner = true;
    return own;
  }
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

function portal_(c, sinceSec) {
  const since = Date.now() - 2 * PORTAL_DAYS * 864e5, mid = Date.now() - PORTAL_DAYS * 864e5;
  const ev = c.trackId ? clientEvents_(c).filter(e => e.cid === c.trackId && new Date(e.ts).getTime() > since) : [];
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
      advancePaid: c.advancePaid, balancePaid: c.balancePaid, tracking: !!c.trackId, checklist: c.checklist, editable: canEdit_(c), editReason: editReason_(c), readOnly: readOnly_(c), owner: !!c._owner, id: c._owner ? c.id : undefined, portalKey: c.portalKey
    },
    stats: {
      days: days, hasData: ev.length > 0,
      totals: { visitors: uniq(pv), views: pv.length, whatsapp: n(cur, 'cta_whatsapp'), calls: n(cur, 'cta_call'), emails: n(cur, 'cta_email'), enquiries: n(cur, 'lead_submit') },
      previous: { visitors: uniq(prev, 'pageview'), taps: prev.filter(e => /^cta_/.test(e.type)).length, enquiries: n(prev, 'lead_submit') },
      sources: tally(pv, e => e.ref || 'direct'), devices: tally(pv, e => e.device || 'desktop'), pages: tally(pv, e => e.path || '/'),
      recent: cur.slice(-14).reverse().map(e => ({ ts: e.ts, type: e.type, label: e.label, ref: e.ref, device: e.device }))
    },
    requests: readAll_('Requests').filter(r => r.clientId === c.id).sort((a, b) => b.ts < a.ts ? -1 : 1).slice(0, 30)
      .map(r => ({ id: r.id, ts: r.ts, type: r.type, message: r.message, status: r.status, reply: r.reply, updated: r.updated, attachment: r.attachment })),
    events: compactEvents_(c, sinceSec),
    now: new Date().toISOString()
  };
}

/** All of a client's events from the last 180 days (read once per request). */
function clientEvents_(c) {
  if (c._ev) return c._ev;
  const since = Date.now() - 180 * 864e5;
  const own = readClientLog_(c).map(e => Object.assign(e, { cid: c.trackId }));
  const legacy = c.trackId ? readLegacyClientEvents_().filter(e => e.cid === c.trackId) : [];      // until tidyUp() moves them
  c._ev = c.trackId ? legacy.concat(own).filter(e => CLIENT_EVENTS.indexOf(e.type) >= 0 && new Date(e.ts).getTime() > since && !junkClientEvent_(e)) : [];
  return c._ev;
}

/** Compact event list so the dashboard can slice any range, metric or source without another request. */
function compactEvents_(c, since) {
  const ev = clientEvents_(c).filter(e => !since || new Date(e.ts).getTime() / 1000 > since).slice(-30000);
  const dict = () => { const list = [], idx = {}; return { list: list, at: v => { v = v || ''; if (!(v in idx)) { idx[v] = list.length; list.push(v); } return idx[v]; } }; };
  const T = dict(), R = dict(), D = dict(), P = dict(), V = dict();
  const rows = ev.map(e => [Math.round(new Date(e.ts).getTime() / 1000), T.at(e.type), R.at(e.ref || 'direct'), D.at(e.device || 'desktop'), P.at(e.path || '/'), V.at(e.vid)]);
  return { types: T.list, refs: R.list, devices: D.list, paths: P.list, vids: V.list, rows: rows };
}

function portalRequest_(c, r) {
  if (!r || !String(r.message || '').trim()) return { ok: false, error: 'Write what you would like changed' };
  const open = readAll_('Requests').filter(x => x.clientId === c.id && x.status !== 'done').length;
  if (open >= 15) return { ok: false, error: 'You have 15 open requests — we will work through those first' };
  let attachment = '';
  if (r.photo) {
    if (String(r.photo).length > 4500000) return { ok: false, error: 'That photo is too large — try a smaller one' };
    try { attachment = saveImage_(r.photo, c.business + ' request.jpg'); }
    catch (e) { attachment = ''; r.message = r.message + '\n\n(A photo was attached but could not be saved: ' + String(e.message || e).slice(0, 120) + ')'; }
  }
  const row = { id: randomKey_(12), ts: new Date().toISOString(), clientId: c.id, business: c.business, type: clip_(r.type || 'Change', 40), message: clip_(r.message, 2000), status: 'new', reply: '', updated: '', attachment: attachment };
  append_('Requests', row);
  clientLog_(c, { ts: row.ts, type: 'request', label: clip_(row.type + ': ' + row.message, 200), ref: c._owner ? 'NOWORA' : 'client dashboard' });
  notify_('Request from ' + c.business, '📝 New request from ' + c.business + ' (' + row.type + ')\n\n' + row.message + (attachment ? '\n\nPhoto: ' + attachment : '') + '\n\nOpen your dashboard → Requests to reply.');
  return { ok: true, request: row };
}

/** Events from client websites (the t.js snippet). Only known tracking IDs are accepted. */
/** Hits that are not real visitors: the website editor's preview, local tests, bots, and the site shown inside a frame. */
function junkClientEvent_(e) {
  const path = String(e.path || ''), ref = String(e.ref || '');
  return e.bot === true || e.framed === true || path === 'srcdoc' || /^\/__/.test(path) || /^(localhost|127\.|0\.0\.0\.0)/.test(ref);
}
function clientTrack_(ev) {
  if (!ev || CLIENT_EVENTS.indexOf(ev.type) < 0) return { ok: false, error: 'Unknown event' };
  if (junkClientEvent_(ev)) return { ok: true, skipped: true };
  const cache = CacheService.getScriptCache();
  let map = cache.get('track_map');
  if (!map) { const m = {}; readAll_('Clients').forEach(c => { if (c.trackId) m[c.trackId] = { id: c.id, business: c.business }; }); map = JSON.stringify(m); cache.put('track_map', map, 300); }
  const c = JSON.parse(map)[String(ev.cid)];
  if (!c) return { ok: false, error: 'Unknown site' };
  const row = {};
  CLIENT_LOG.forEach(k => row[k] = clip_(ev[k], k === 'path' ? 80 : 60));
  row.ts = new Date().toISOString();
  clientLog_(c, row);
  return { ok: true };
}



/* ============================== website editor (GitHub) ============================== */
// Needs Script property GITHUB_TOKEN: a fine-grained token with Contents read & write on your client repos.
// A client can only ever read or change the repo linked to their own row in the Clients tab.

function gh_(method, path, payload) {
  const token = prop_('GITHUB_TOKEN');
  if (!token) throw new Error("Website editing isn't switched on yet — ask NOWORA to connect it.");
  const res = UrlFetchApp.fetch('https://api.github.com' + path, {
    method: method, muteHttpExceptions: true, contentType: 'application/json',
    payload: payload ? JSON.stringify(payload) : undefined,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  const code = res.getResponseCode();
  if (code === 404) return null;
  let body = {}; try { body = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
  if (code === 409 || (code === 422 && /sha/i.test(body.message || ''))) throw new Error('Your website changed since you opened the editor. Reload the editor to get the latest version.');
  if (code >= 300) throw new Error('GitHub said: ' + (body.message || ('error ' + code)));
  return body;
}
const b64ToText_ = b64 => Utilities.newBlob(Utilities.base64Decode(String(b64).replace(/\s/g, ''))).getDataAsString('UTF-8');
const textToB64_ = t => Utilities.base64Encode(t, Utilities.Charset.UTF_8);

/**
 * Who can use the website editor. Per client, the Clients tab "editAccess" column decides:
 *   on   → always allowed        off → never allowed
 *   (empty / auto) → allowed while the care plan is active
 * A repo must be linked either way. You (the owner) can always edit.
 */
function editReason_(c) {
  if (!c.repo) return 'not-connected';
  if (c._owner) return '';
  const a = String(c.editAccess || 'auto').toLowerCase();
  if (a === 'off') return 'off';
  if (a === 'on') return '';
  return c.carePlan === 'yes' && c.status !== 'paused' ? '' : 'no-plan';
}
function canEdit_(c) { return !editReason_(c); }

/**
 * View-only clients: when the Clients tab "editAccess" is "off", the client can still open their
 * dashboard, see everything and download their data, but every change is refused here — website
 * edits, product edits, database rows and tables, and change requests. You (the owner) are never blocked.
 */
function readOnly_(c) { return !c._owner && String(c.editAccess || '').trim().toLowerCase() === 'off'; }
function writable_(c) {
  if (readOnly_(c)) throw new Error('Your dashboard is view-only right now. You can see and download everything, but changes are switched off — message NOWORA if you need something changed.');
  return c;
}

function siteRepo_(c) {
  const why = editReason_(c);
  if (why === 'no-plan') throw new Error('Website editing comes with the NOWORA care plan (₹1,999/month). Message NOWORA to switch it on.');
  if (why === 'off') throw new Error('Website editing is turned off for this website. Message NOWORA if you need it.');
  if (!c.repo) throw new Error("This website isn't connected for editing yet — ask NOWORA to connect it.");
  if (!/^[\w.-]+\/[\w.-]+$/.test(c.repo)) throw new Error('The linked repository name looks wrong');
  return c.repo;
}

function readFile_(repo, path, ref) {
  const f = gh_('get', '/repos/' + repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/') + (ref ? '?ref=' + encodeURIComponent(ref) : ''));
  if (!f || f.type !== 'file') return null;
  let text = f.content ? b64ToText_(f.content) : '';
  if (!f.content || f.encoding === 'none') { const blob = gh_('get', '/repos/' + repo + '/git/blobs/' + f.sha); text = blob ? b64ToText_(blob.content) : ''; }
  return { path: f.path, sha: f.sha, text: text };
}

function siteFile_(c) {
  const repo = siteRepo_(c);
  let cfg = {};
  try { const nj = readFile_(repo, 'nowora.json'); if (nj) cfg = JSON.parse(nj.text); } catch (e) {}
  const tries = [cfg.entry, 'index.html', 'public/index.html', 'site/index.html', 'docs/index.html', 'src/index.html'].filter(Boolean);
  for (let i = 0; i < tries.length; i++) { const f = readFile_(repo, tries[i]); if (f) return { repo: repo, cfg: cfg, file: f }; }
  throw new Error("Couldn't find the website's index.html in its repository");
}

function siteSource_(c) {
  const s = siteFile_(c);
  let niche = s.cfg.niche || '';
  if (!niche) { try { niche = parseMeta_(s.file.text, c.site || 'https://example.com', {}).niche; } catch (e) {} }
  return { repo: s.repo, path: s.file.path, sha: s.file.sha, html: s.file.text, url: c.site, niche: niche, name: s.cfg.name || c.business };
}

function sitePublish_(c, body) {
  const html = String(body.html || '');
  if (html.length < 200 || !/<html|<body/i.test(html)) return { ok: false, error: "That doesn't look like a full web page — nothing was published" };
  if (html.length > 4500000) return { ok: false, error: 'The page is too large to publish. Remove some photos and try again.' };
  const repo = siteRepo_(c);
  const path = String(body.path || '');
  if (!/^[\w./-]+\.html$/.test(path) || path.indexOf('..') >= 0) return { ok: false, error: 'Unexpected file path' };
  const dir = path.indexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const who = c._owner ? 'NOWORA' : (c.name || c.business || 'Client');
  (body.images || []).slice(0, 30).forEach(img => {
    const m = /^data:image\/(jpeg|png|webp|gif);base64,(.+)$/.exec(img.data || '');
    const name = String(img.name || '').replace(/[^\w.-]/g, '');
    if (!m || !/^[\w-]+\.(jpg|jpeg|png|webp|gif)$/.test(name)) throw new Error('One of the photos could not be uploaded');
    gh_('put', '/repos/' + repo + '/contents/' + dir + 'images/uploads/' + name, { message: 'Photo added by ' + who + ' (NOWORA editor)', content: m[2] });
  });
  const res = gh_('put', '/repos/' + repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/'),
    { message: clip_(body.message || ('Website edited by ' + who), 120) + ' (NOWORA editor)', content: textToB64_(html), sha: body.sha });
  append_('Automation', { ts: new Date().toISOString(), workflow: 'editor', status: 'success', summary: c.business + ' published website changes', details: clip_(body.message, 300) });
  clientLog_(c, { ts: new Date().toISOString(), type: 'publish', label: clip_(body.message || 'Website edited', 200), ref: who, path: path });
  if (!c._owner) notify_('Website published: ' + c.business, '✏️ ' + c.business + ' published changes from their dashboard editor.\n\n' + (body.message || '') + '\n\nCommit: ' + res.commit.html_url + '\nLive site: ' + (c.site || ''));
  return { ok: true, sha: res.content.sha, commit: res.commit.sha, url: res.commit.html_url };
}

function siteVersions_(c) {
  const s = siteFile_(c);
  const list = gh_('get', '/repos/' + s.repo + '/commits?per_page=15&path=' + encodeURIComponent(s.file.path)) || [];
  return list.map(x => ({ sha: x.sha, date: x.commit.author.date, message: String(x.commit.message || '').split('\n')[0].slice(0, 120), current: false }));
}

function siteRestore_(c, sha) {
  if (!/^[0-9a-f]{7,40}$/i.test(String(sha || ''))) return { ok: false, error: 'Pick a version to restore' };
  const s = siteFile_(c);
  const old = readFile_(s.repo, s.file.path, sha);
  if (!old) return { ok: false, error: "That version couldn't be found" };
  const res = gh_('put', '/repos/' + s.repo + '/contents/' + s.file.path.split('/').map(encodeURIComponent).join('/'),
    { message: 'Restored an earlier version (' + String(sha).slice(0, 7) + ') by ' + (c.name || c.business) + ' (NOWORA editor)', content: textToB64_(old.text), sha: s.file.sha });
  clientLog_(c, { ts: new Date().toISOString(), type: 'restore', label: 'Version ' + String(sha).slice(0, 7), ref: c._owner ? 'NOWORA' : (c.name || c.business) });
  notify_('Website restored: ' + c.business, '↩️ ' + c.business + ' restored an earlier version of their website.\nCommit: ' + res.commit.html_url);
  return { ok: true, sha: res.content.sha };
}

/* ============================== auto-registered client sites ============================== */

/**
 * Called by the GitHub "discover" workflow for every repo that has a nowora.json file.
 * Adds (or updates) the showcase card and the client dashboard, and emails you the new
 * dashboard link + PIN the first time a site appears. Never overwrites what you edited.
 */
function registerSite_(site) {
  const url = normUrl_(site.url || '');
  if (!site.repo || !site.url) return { ok: false, error: 'repo and url are required' };
  const key = u => String(u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  const name = clip_(site.name || site.repo.split('/').pop(), 80);
  const out = { ok: true, repo: site.repo, portfolio: 'unchanged', client: 'unchanged' };

  // ---- showcase card ----
  if (site.showcase !== false) {
    const items = readAll_('Portfolio');
    const p = items.find(x => x.repo === site.repo) || items.find(x => x.url && key(x.url) === key(url));
    if (!p) {
      upsert_('Portfolio', { id: randomKey_(12), ts: new Date().toISOString(), title: name, niche: clip_(site.niche, 40), type: 'client', url: url, image: '',
        description: clip_(site.description, 220), visible: 'TRUE', order: String(items.length + 1), tag: clip_(site.tag || 'Shops & brands', 30),
        embed: 'true', shot: 'pending', theme: '', repo: site.repo });
      out.portfolio = 'created';
    } else {
      const u = { id: p.id, repo: site.repo };
      if (key(p.url) !== key(url)) { u.url = url; u.shot = 'pending'; }
      if (!p.title) u.title = name;
      if (!p.niche && site.niche) u.niche = clip_(site.niche, 40);
      if (!p.description && site.description) u.description = clip_(site.description, 220);
      if (!p.image && p.shot !== 'pending' && p.shot !== 'failed') u.shot = 'pending';
      if (Object.keys(u).length > 2 || p.repo !== site.repo) { upsert_('Portfolio', u); out.portfolio = 'updated'; }
    }
  }

  // ---- client dashboard ----
  if (site.dashboard !== false) {
    const clients = readAll_('Clients');
    const c = clients.find(x => x.repo === site.repo) || clients.find(x => x.site && key(x.site) === key(url));
    const cl = site.client || {};
    if (!c) {
      const taken = clients.map(x => String(x.portalKey || '').toLowerCase());
      const base = slug_(site.slug || name);
      let slug = base, n = 2; while (taken.indexOf(slug) >= 0 || slug === 'demo') slug = base + '-' + n++;
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const live = (site.status || 'live') === 'live';
      upsert_('Clients', { id: randomKey_(12), business: name, name: clip_(cl.name, 60), phone: digits_(cl.phone), email: clip_(cl.email, 80), site: url,
        package: clip_(cl.package, 20), price: clip_(cl.price, 12), delivered: live ? Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') : '',
        carePlan: cl.carePlan ? 'yes' : '', careFee: cl.carePlan ? String(cl.careFee || 1999) : '', renewal: '', status: live ? 'live' : 'building',
        uptime: '', responseMs: '', lastCheck: '', checklist: live ? '[0,1,2,3,4,5,6]' : '[]', notes: 'Added automatically from GitHub: ' + site.repo,
        portalKey: slug, pin: pin, trackId: site.trackId || slug, advancePaid: '', balancePaid: '', repo: site.repo });
      const link = (prop_('SITE_URL') || 'https://nowora.vercel.app') + '/client/' + slug;
      notify_('New client site: ' + name, '🚀 ' + name + ' is now in NOWORA\n\nLive site: ' + url + '\nClient dashboard: ' + link + '\nPIN: ' + pin +
        '\n\nIt is on your website showcase, and a scrolling preview is being captured.' + (site.tracking ? '' : '\nTip: add the visitor-stats snippet so their dashboard shows visits (Clients → chart icon).'));
      out.client = 'created'; out.slug = slug;
    } else {
      const u = { id: c.id, repo: site.repo };
      if (!c.site || (c.repo === site.repo && key(c.site) !== key(url))) u.site = url;
      if (!c.phone && cl.phone) u.phone = digits_(cl.phone);
      if (!c.name && cl.name) u.name = clip_(cl.name, 60);
      if (Object.keys(u).length > 2 || c.repo !== site.repo) { upsert_('Clients', u); out.client = 'updated'; }
      out.slug = c.portalKey;
    }
  }
  return out;
}

function slug_(t) {
  const s = String(t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['\u2019]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return s.length >= 3 ? s : (s || 'client') + '-site';
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
    if (state === 'down' && c.uptime !== 'down') { wentDown.push(c.business + ' — ' + c.site + ' (' + r.error + ')'); clientLog_(c, { ts: now, type: 'site_down', label: r.error, ref: '5-minute check' }); }
    if (state === 'up' && c.uptime === 'down') { cameBack.push(c.business); clientLog_(c, { ts: now, type: 'site_up', label: r.ms + ' ms', ref: '5-minute check' }); }
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

/* ============================== client database ============================== */
// Free for now: each client's database is their own Google Sheet ("<Business> — Database"),
// one tab per table. Clients add, edit and delete rows from their dashboard.
// Column names and types live on each tab (developer metadata), so the tab stays readable.

const DB_TYPES = ['text', 'longtext', 'number', 'money', 'date', 'phone', 'email', 'link', 'choice', 'yesno'];
const DB_LIMIT = { tables: 20, columns: 30, rows: 5000, cell: 2000, perCall: 200 };

function clientData_(c, create) {
  if (c._data) return c._data;
  if (c.dataSheet) {
    try { return (c._data = SpreadsheetApp.openById(c.dataSheet)); }
    catch (e) { throw new Error('Your existing database is unavailable. Contact NOWORA to restore access; no replacement database has been created.'); }
  }
  if (!create) return null;
  const ss = SpreadsheetApp.create(String(c.business || 'Client').slice(0, 80) + ' — Database');
  ss.setSpreadsheetTimeZone(TZ);
  const me = ss.getSheets()[0]; me.setName('Read me');
  me.getRange(1, 1, 3, 1).setValues([[(c.business || 'Client') + ' — database'], ['Managed from the client dashboard: ' + (prop_('SITE_URL') || 'https://nowora.vercel.app') + '/client/' + (c.portalKey || '')],
    ['Each tab is one table. You can read or copy it here, but add, edit and delete rows from the dashboard so column settings stay in step.']]);
  me.getRange(1, 1).setFontSize(16).setFontWeight('bold'); me.setColumnWidth(1, 720);
  try { const db = clientDb_(false), from = db ? db.getId() : SpreadsheetApp.getActive().getId(), par = DriveApp.getFileById(from).getParents(); if (par.hasNext()) DriveApp.getFileById(ss.getId()).moveTo(par.next()); } catch (e) { /* stays in My Drive */ }
  upsert_('Clients', { id: c.id, dataSheet: ss.getId() });
  c.dataSheet = ss.getId();
  try { refreshClientIndex_(); } catch (e) { console.error(e); }
  return (c._data = ss);
}
function dbTables_(ss) {
  const out = [];
  ss.getSheets().forEach(sh => {
    const m = sh.getDeveloperMetadata().find(x => x.getKey() === 'nowora_table');
    if (!m) return;
    let meta; try { meta = JSON.parse(m.getValue()); } catch (e) { return; }
    out.push({ sh: sh, md: m, id: meta.id, cols: meta.cols || [] });
  });
  return out;
}
function dbFind_(ss, id) {
  const t = dbTables_(ss).find(x => x.id === String(id || ''));
  if (!t) throw new Error('That table no longer exists — refresh the page');
  return t;
}
function dbCell_(col, v) {                 // what goes into the sheet
  if (v === undefined || v === null || v === '') return '';
  if (col.type === 'number' || col.type === 'money') { const n = Number(String(v).replace(/[^\d.\-]/g, '')); return isNaN(n) ? '' : n; }
  if (col.type === 'date') { const d = new Date(String(v).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? '' : d; }
  if (col.type === 'yesno') return v === true || /^(yes|true|1|on)$/i.test(String(v)) ? 'Yes' : 'No';
  if (col.type === 'choice') { const o = col.options || []; v = String(v).slice(0, 60); return o.length && o.indexOf(v) < 0 ? '' : v; }
  return cell_(String(v).slice(0, col.type === 'longtext' ? DB_LIMIT.cell : 300));
}
function dbValue_(col, v) {                // what goes to the dashboard
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  if (col.type === 'number' || col.type === 'money') { const n = Number(v); return isNaN(n) ? '' : n; }
  if (col.type === 'yesno') return v === true || /^(yes|true)$/i.test(String(v));
  return String(v);
}
function dbRead_(t) {
  const sh = t.sh, n = 2 + t.cols.length, last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, n).getValues(), fix = [];
  const rows = vals.map((r, i) => {
    if (!r.some(v => v !== '' && v !== null)) return null;
    let id = String(r[0] || '');
    if (!id) { id = randomKey_(10); fix.push([i + 2, id]); }           // rows typed straight into the sheet get an ID
    const o = { _id: id, _ts: r[1] instanceof Date ? r[1].toISOString() : String(r[1] || '') };
    t.cols.forEach((c, j) => o[c.id] = dbValue_(c, r[j + 2]));
    return o;
  }).filter(Boolean);
  fix.forEach(f => sh.getRange(f[0], 1).setValue(f[1]));
  return rows;
}
function dbShape_(t, rows) { return { id: t.id, name: t.sh.getName(), cols: t.cols, count: rows ? rows.length : Math.max(0, t.sh.getLastRow() - 1) }; }
function dbStyle_(sh, cols) {
  const n = 2 + cols.length, rows = Math.max(sh.getMaxRows() - 1, 1);
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);
  sh.getRange(1, 1, 1, n).setValues([['Row ID', 'Added'].concat(cols.map(c => c.name))])
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1D4A3D').setVerticalAlignment('middle');
  sh.setFrozenRows(1); sh.setRowHeight(1, 32);
  sh.setColumnWidth(1, 100); sh.setColumnWidth(2, 140);
  sh.getRange(2, 1, rows, 1).setNumberFormat('@').setFontColor('#8A9691');
  sh.getRange(2, 2, rows, 1).setNumberFormat(TIME_FORMAT).setFontColor('#8A9691');
  cols.forEach((c, j) => {
    const col = sh.getRange(2, j + 3, rows, 1);
    col.setNumberFormat(c.type === 'number' ? '#,##0.##' : c.type === 'money' ? '"₹"#,##0.##' : c.type === 'date' ? 'd mmm yyyy' : '@').setFontColor('#14211D');
    col.setDataValidation(c.type === 'choice' && (c.options || []).length ? SpreadsheetApp.newDataValidation().requireValueInList(c.options, true).setAllowInvalid(true).build()
      : c.type === 'yesno' ? SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).setAllowInvalid(true).build() : null);
    sh.setColumnWidth(j + 3, c.type === 'longtext' ? 300 : c.type === 'yesno' ? 80 : 150);
  });
  sh.getRange(2, 1, rows, n).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setFontSize(10).setVerticalAlignment('top');
  sh.getBandings().forEach(b => b.remove());
  sh.getRange(1, 1, sh.getMaxRows(), n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor('#1D4A3D').setFirstRowColor('#FFFFFF').setSecondRowColor('#F4F6F2');
}
function dbCleanCols_(cols) {
  if (!Array.isArray(cols) || !cols.length) throw new Error('Add at least one column');
  if (cols.length > DB_LIMIT.columns) throw new Error('A table can have up to ' + DB_LIMIT.columns + ' columns');
  const seen = {};
  return cols.map(c => {
    const name = String(c.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name) throw new Error('Every column needs a name');
    if (/^(row id|added)$/i.test(name)) throw new Error('"' + name + '" is used by the system — pick another column name');
    if (seen[name.toLowerCase()]) throw new Error('Two columns are called "' + name + '"');
    seen[name.toLowerCase()] = 1;
    const type = DB_TYPES.indexOf(c.type) >= 0 ? c.type : 'text';
    const id = /^[\w-]{4,20}$/.test(c.id || '') ? c.id : randomKey_(8);
    const out = { id: id, name: name, type: type };
    if (type === 'choice') out.options = (Array.isArray(c.options) ? c.options : String(c.options || '').split(','))
      .map(o => String(o).trim().slice(0, 60)).filter(Boolean).filter((o, i, a) => a.indexOf(o) === i).slice(0, 40);
    return out;
  });
}
function dbTabName_(ss, name, own) {
  let base = String(name || '').replace(/[\[\]\*\?\/\\:']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!base) throw new Error('Give the table a name');
  if (/^read me$/i.test(base)) base = base + ' table';
  let n = base, i = 2;
  while (true) { const sh = ss.getSheetByName(n); if (!sh || (own && sh.getSheetId() === own.getSheetId())) return n; n = base + ' (' + i++ + ')'; }
}

function dbGet_(c, tableId) {
  const ss = clientData_(c, false);
  if (!ss) return { ok: true, tables: [], rows: [], tableId: '' };
  const ts = dbTables_(ss), t = ts.find(x => x.id === tableId) || ts[0];
  const rows = t ? dbRead_(t) : [];
  return { ok: true, tables: ts.map(x => dbShape_(x, x === t ? rows : null)), tableId: t ? t.id : '', rows: rows, sheetUrl: c._owner && c.dataSheet ? 'https://docs.google.com/spreadsheets/d/' + c.dataSheet : undefined };
}
function dbSaveTable_(c, table) {
  if (!table) throw new Error('Nothing to save');
  const cols = dbCleanCols_(table.cols);
  const ss = clientData_(c, true);                                   // made (and saved on the client row) before taking the lock
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    if (!table.id) {
      if (dbTables_(ss).length >= DB_LIMIT.tables) throw new Error('You can have up to ' + DB_LIMIT.tables + ' tables');
      const sh = ss.insertSheet(dbTabName_(ss, table.name));
      const id = randomKey_(10);
      sh.addDeveloperMetadata('nowora_table', JSON.stringify({ id: id, cols: cols }));
      dbStyle_(sh, cols);
      bumpRev_(c);
      return { ok: true, table: { id: id, name: sh.getName(), cols: cols, count: 0 } };
    }
    const t = dbFind_(ss, table.id), rows = dbRead_(t), sh = t.sh;
    const want = dbTabName_(ss, table.name, sh);
    if (sh.getName() !== want) sh.setName(want);
    // rewrite the tab in the new column order (handles added, removed, renamed and moved columns)
    const data = rows.map(r => [r._id, r._ts ? new Date(r._ts) : ''].concat(cols.map(col => {
      const old = t.cols.find(o => o.id === col.id);
      return old ? dbCell_(col, old.type === 'yesno' ? (r[col.id] ? 'Yes' : 'No') : r[col.id]) : '';
    })));
    const last = Math.max(sh.getLastRow(), 1);
    if (last > 1) sh.getRange(2, 1, last - 1, Math.max(sh.getMaxColumns(), 1)).clearContent();
    t.md.setValue(JSON.stringify({ id: t.id, cols: cols }));
    dbStyle_(sh, cols);
    if (data.length) sh.getRange(2, 1, data.length, 2 + cols.length).setValues(data);
    bumpRev_(c);
    return { ok: true, table: { id: t.id, name: sh.getName(), cols: cols, count: data.length } };
  } finally { lock.releaseLock(); }
}
function dbDeleteTable_(c, tableId) {
  const ss = clientData_(c, false); if (!ss) return { ok: true };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { const t = dbFind_(ss, tableId); ss.deleteSheet(t.sh); bumpRev_(c); return { ok: true }; }
  finally { lock.releaseLock(); }
}
function dbSaveRow_(c, tableId, row) {
  if (!row || typeof row !== 'object') throw new Error('Nothing to save');
  const ss = clientData_(c, false); if (!ss) throw new Error('Create a table first');
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const t = dbFind_(ss, tableId), sh = t.sh;
    if (!t.cols.some(col => row[col.id] !== undefined && row[col.id] !== '' && row[col.id] !== false)) throw new Error('Fill in at least one field');
    const last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])) : [];
    let i = row._id ? ids.indexOf(String(row._id)) : -1, id = row._id, ts;
    if (i < 0) {
      if (ids.filter(Boolean).length >= DB_LIMIT.rows) throw new Error('This table is full (' + DB_LIMIT.rows + ' rows). Delete some rows or start a new table.');
      id = randomKey_(10); ts = new Date(); i = ids.length;
    } else ts = sh.getRange(i + 2, 2).getValue();
    const cells = [id, ts].concat(t.cols.map(col => dbCell_(col, row[col.id])));
    sh.getRange(i + 2, 1, 1, cells.length).setValues([cells]);
    const out = { _id: id, _ts: ts instanceof Date ? ts.toISOString() : String(ts || '') };
    t.cols.forEach((col, j) => out[col.id] = dbValue_(col, cells[j + 2]));
    bumpRev_(c);
    return { ok: true, row: out };
  } finally { lock.releaseLock(); }
}
function dbDeleteRows_(c, tableId, ids) {
  ids = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean).slice(0, DB_LIMIT.perCall);
  if (!ids.length) return { ok: true, deleted: 0 };
  const ss = clientData_(c, false); if (!ss) return { ok: true, deleted: 0 };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const t = dbFind_(ss, tableId), sh = t.sh, last = sh.getLastRow();
    if (last < 2) return { ok: true, deleted: 0 };
    const col = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const at = [];
    col.forEach((v, i) => { if (ids.indexOf(v) >= 0) at.push(i + 2); });
    at.reverse().forEach(r => sh.deleteRow(r));
    if (at.length) bumpRev_(c);
    return { ok: true, deleted: at.length };
  } finally { lock.releaseLock(); }
}

/* ---------- live updates: a tiny revision number the dashboard polls ---------- */
function bumpRev_(c) { try { CacheService.getScriptCache().put('dbrev_' + c.id, String(Date.now()), 21600); } catch (e) { /* only slows the live refresh */ } }
function dbRev_(c) {
  const cache = CacheService.getScriptCache(), k = 'dbrev_' + c.id;
  let v = cache.get(k); if (!v) { v = String(Date.now()); cache.put(k, v, 21600); }
  return v;
}

/* ---------- forms on client websites → the client's database, in real time ---------- */
// t.js sends every form a visitor submits (and sites can call nowora.record() for carts).
// The row lands in a table named after the form ("Orders", "Bookings", "Website enquiries"…);
// the table and any new columns are created automatically. Order items reduce stock.
function clientForm_(b) {
  const cid = String(b.cid || ''), vid = String(b.vid || '').slice(0, 40);
  if (b.bot === true || b.framed === true) return { ok: true, skipped: true };
  const cache = CacheService.getScriptCache();
  let map = cache.get('track_map');
  if (!map) { const m = {}; readAll_('Clients').forEach(x => { if (x.trackId) m[x.trackId] = { id: x.id, business: x.business }; }); map = JSON.stringify(m); cache.put('track_map', map, 300); }
  const ref = JSON.parse(map)[cid];
  if (!ref) return { ok: false, error: 'Unknown site' };
  // flood guard: 60 forms per site and 8 per visitor every 10 minutes
  const ks = 'cf_' + cid, kv = 'cfv_' + cid + '_' + vid, ns = +(cache.get(ks) || 0), nv = +(cache.get(kv) || 0);
  if (ns >= 60 || (vid && nv >= 8)) return { ok: false, error: 'Too many forms — try again in a few minutes' };
  cache.put(ks, String(ns + 1), 600); if (vid) cache.put(kv, String(nv + 1), 600);

  const fields = [];
  Object.keys(b.fields || {}).slice(0, 40).forEach(k => {
    const name = String(k).replace(/\s+/g, ' ').trim().slice(0, 60);
    let v = b.fields[k]; if (Array.isArray(v)) v = v.join(', ');
    v = String(v == null ? '' : v).trim().slice(0, 2000);
    if (!name || /^(row id|added)$/i.test(name) || /password|cvv|cvc|card ?number|otp/i.test(name)) return;
    if (fields.some(f => f.name.toLowerCase() === name.toLowerCase())) return;
    fields.push({ name: name, value: v });
  });
  const inputItems = Array.isArray(b.items) ? b.items : [];
  if (inputItems.length > 50 || inputItems.some(i => !i || typeof i !== 'object' ||
      !Number.isInteger(Number(i.qty)) || Number(i.qty) < 1 || Number(i.qty) > 999 ||
      !Number.isFinite(Number(i.price)) || Number(i.price) < 0)) {
    return { ok: false, error: 'Each item needs a quantity from 1 to 999 and a valid non-negative price.' };
  }
  const items = inputItems.map(i => ({
    name: String(i.name || '').slice(0, 80), variant: String(i.variant || '').slice(0, 80),
    size: String(i.size || '').slice(0, 30), colour: String(i.colour || i.color || '').slice(0, 40),
    qty: Math.max(1, Math.min(999, Math.round(+i.qty || 1))), price: +i.price || 0 })).filter(i => i.name);
  if (!fields.some(f => f.value) && !items.length) return { ok: false, error: 'Empty form' };

  const table = String(b.table || 'Website enquiries').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Website enquiries';
  const isOrder = /order|checkout|cart|purchase/i.test(table) || items.length > 0;
  const c = readAll_('Clients').find(x => x.id === ref.id); if (!c) return { ok: false, error: 'Unknown site' };
  const ss = clientData_(c, true);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let stockNote = '';
  try {
    const want = fields.map(f => ({ name: f.name, type: guessType_(f.name, f.value) }));
    if (items.length) { want.push({ name: 'Items', type: 'longtext' }, { name: 'Item count', type: 'number' });
      if (!fields.some(f => /^total$/i.test(f.name))) want.push({ name: 'Total', type: 'money' }); }
    want.push({ name: 'Status', type: 'choice', options: isOrder ? ['New', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'] : ['New', 'Contacted', 'Done'] });
    if (items.length) want.push({ name: 'Stock', type: 'text' });
    want.push({ name: 'Came from', type: 'text' });
    const seen = {}, uniq = want.filter(w => { const k = w.name.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; });
    const t = dbEnsure_(ss, table, uniq);
    if (t.sh.getLastRow() - 1 >= DB_LIMIT.rows) {
      return { ok: false, error: 'This table is full. Please contact the business directly.' };
    }

    const val = {};
    fields.forEach(f => val[f.name.toLowerCase()] = f.value);
    if (items.length) {
      const total = items.reduce((s, i) => s + i.price * i.qty, 0);
      val['items'] = items.map(i => i.qty + ' × ' + i.name + [i.variant, i.colour, i.size].filter(Boolean).map(x => ' · ' + x).join('') + (i.price ? ' — ₹' + (i.price * i.qty).toLocaleString('en-IN') : '')).join('\n');
      val['item count'] = String(items.reduce((s, i) => s + i.qty, 0));
      if (val['total'] === undefined) val['total'] = String(total);
      stockNote = takeStock_(ss, items);
      val['stock'] = stockNote;
    }
    val['status'] = 'New';
    val['came from'] = [String(b.ref || 'direct').slice(0, 30), String(b.device || '').slice(0, 10)].filter(Boolean).join(' · ');
    const sh = t.sh, id = randomKey_(10);
    sh.appendRow([id, new Date()].concat(t.cols.map(col => dbCell_(col, val[col.name.toLowerCase()]))));
    bumpRev_(c);
    if (isOrder) { orderAlertPing_(); orderEmail_(c, fields, items, val, sh.getName()); }
    clientLog_(c, { ts: new Date().toISOString(), type: 'lead_submit', label: clip_(table + (items.length ? ' · ' + items.length + ' item(s)' : ''), 60), ref: String(b.ref || 'direct').slice(0, 30), device: String(b.device || '').slice(0, 10), path: String(b.path || '').slice(0, 80), vid: vid });
    return { ok: true, id: id, table: sh.getName(), stock: stockNote || undefined };
  } finally { lock.releaseLock(); }
}

/* ============================== WhatsApp order alerts ==============================
 * Every new order on any client's website is sent to that client's WhatsApp (their number in Clients)
 * from the NOWORA number, by the GitHub workflow .github/workflows/whatsapp.yml (Playwright + WhatsApp Web).
 * A new order pings the workflow straight away when the script property GITHUB_ALERT_TOKEN is set
 * (fine-grained GitHub token, Contents: read & write on the NOWORA repo); the workflow also checks every
 * 15 minutes, so nothing is missed. Set a client's Notes to include "alerts off" to skip them. */
function orderAlertPing_() {
  const tok = prop_('GITHUB_ALERT_TOKEN'); if (!tok) return;
  try {
    UrlFetchApp.fetch('https://api.github.com/repos/' + (prop_('GITHUB_ALERT_REPO') || 'Sarthak-B/Nowora') + '/dispatches', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' }, payload: JSON.stringify({ event_type: 'order-alert' }) });
  } catch (e) { console.error('order alert ping: ' + e); }
}
/** Instant email to the client for every new website order (their Email in Clients; several can be
 *  separated by commas). Sent from this Google account as "NOWORA orders". Notes with "email off" or
 *  "alerts off" skip a client. Never blocks the order: any problem is only logged. */
function orderEmail_(c, fields, items, val, table) {
  try {
    const to = String(c.email || '').split(/[,;\s]+/).filter(x => /^\S+@\S+\.\S+$/.test(x)).join(',');
    if (!to || /(email|alerts?) off/i.test(String(c.notes || ''))) return;
    const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
    const get = re => { const f = fields.find(x => re.test(x.name)); return f ? f.value : ''; };
    const name = get(/^(name|customer|full name)$/i), phone = get(/^(phone|mobile|whatsapp|phone \/ whatsapp)$/i), orderId = get(/^order (id|no\.?)$/i);
    const total = Number(val['total']) || items.reduce((s, i) => s + i.price * i.qty, 0);
    const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN');
    const addr = ['address', 'city', 'state', 'pin code', 'pincode', 'pin'].map(k => val[k]).filter(Boolean).join(', ');
    const shown = /^(order (id|no\.?)|name|customer|full name|phone|mobile|whatsapp|address|city|state|pin ?code|pin|total)$/i;
    const other = fields.filter(f => f.value && !shown.test(f.name));
    const dash = (prop_('SITE_URL') || 'https://nowora.vercel.app') + '/client/' + (c.portalKey || '');
    const subject = '🛍️ New order' + (name ? ' from ' + name : '') + ' — ' + inr(total) + ' · ' + (c.business || 'your website');
    const row = (k, v) => v ? '<tr><td style="padding:6px 14px 6px 0;color:#6b7a74;white-space:nowrap;vertical-align:top">' + esc(k) + '</td><td style="padding:6px 0;color:#14211D">' + v + '</td></tr>' : '';
    const html =
      '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#14211D">' +
      '<p style="font-size:13px;color:#6b7a74;margin:0 0 4px">' + esc(c.business || '') + ' · ' + esc(table) + '</p>' +
      '<h2 style="margin:0 0 16px;font-size:24px">New order' + (name ? ' from ' + esc(name) : '') + '</h2>' +
      '<table style="border-collapse:collapse;font-size:15px;width:100%">' +
        row('Order', esc(orderId)) + row('Customer', esc(name)) +
        row('Phone', phone ? '<a href="tel:' + esc(phone.replace(/[^\d+]/g, '')) + '">' + esc(phone) + '</a> · <a href="https://wa.me/' + esc((phone.replace(/\D/g, '').length === 10 ? '91' : '') + phone.replace(/\D/g, '')) + '">WhatsApp</a>' : '') +
        row('Address', esc(addr)) + other.map(f => row(f.name, esc(f.value))).join('') +
      '</table>' +
      (items.length ? '<table style="border-collapse:collapse;font-size:15px;width:100%;margin-top:16px;border-top:1px solid #dfe5e1">' +
        items.map(i => '<tr><td style="padding:8px 0;border-bottom:1px solid #eef1ef">' + i.qty + ' × ' + esc(i.name) + '<br><span style="color:#6b7a74;font-size:13px">' + esc([i.variant, i.colour, i.size].filter(Boolean).join(' · ')) + '</span></td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #eef1ef;white-space:nowrap">' + inr(i.price * i.qty) + '</td></tr>').join('') +
        '<tr><td style="padding:10px 0;font-weight:700">Total</td><td style="padding:10px 0;text-align:right;font-weight:700">' + inr(total) + '</td></tr></table>' : row('Total', inr(total))) +
      '<p style="margin:22px 0"><a href="' + esc(dash) + '" style="background:#1D4A3D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;display:inline-block">Open your dashboard to send it</a></p>' +
      '<p style="font-size:12px;color:#8a978f">Sent by NOWORA the moment the order was placed on your website.</p></div>';
    const text = ['New order — ' + (c.business || ''), '', 'Order: ' + orderId, 'Customer: ' + name, 'Phone: ' + phone, 'Address: ' + addr]
      .concat(other.map(f => f.name + ': ' + f.value), [''], items.map(i => i.qty + ' x ' + i.name + ' ' + [i.variant, i.colour, i.size].filter(Boolean).join(' / ') + ' — ' + inr(i.price * i.qty)),
        ['Total: ' + inr(total), '', 'Dashboard: ' + dash]).join('\n');
    sendMail_({ to: to, subject: subject, body: text, htmlBody: html, name: 'NOWORA orders' });
  } catch (e) { console.error('order email: ' + e); }
}
/* ============================== sending email as NOWORA ==============================
 * Emails go out FROM noworasites@gmail.com (script property MAIL_FROM to change it) when that address is a
 * "Send mail as" alias of the Gmail account that owns this script (Gmail → Settings → Accounts and Import →
 * Send mail as → Add another email address). Until the alias is added, they go from this account with
 * Reply-To set to noworasites@gmail.com, so replies still land in the NOWORA inbox. */
function mailFrom_() { return prop_('MAIL_FROM') || 'noworasites@gmail.com'; }
function sendMail_(o) {
  const from = mailFrom_();
  try {
    if (Session.getEffectiveUser().getEmail().toLowerCase() === from.toLowerCase() || GmailApp.getAliases().map(a => a.toLowerCase()).indexOf(from.toLowerCase()) > -1) {
      const opt = { name: o.name || 'NOWORA', replyTo: from };
      if (o.htmlBody) opt.htmlBody = o.htmlBody;
      if (Session.getEffectiveUser().getEmail().toLowerCase() !== from.toLowerCase()) opt.from = from;
      GmailApp.sendEmail(o.to, o.subject, o.body || '', opt);
      return 'from ' + from;
    }
  } catch (e) { console.error('send as ' + from + ' failed, using the script account: ' + e); }
  MailApp.sendEmail(Object.assign({ replyTo: from }, o));
  return 'from the script account (add ' + from + ' as a Send mail as alias to send from it)';
}
/** Run this once from the editor (select it, press Run): grants email permission and sends you a test. */
function testOrderEmail() {
  const how = sendMail_({ to: mailFrom_(), subject: 'NOWORA order email test', body: 'If this arrived, order emails work.', htmlBody: '<p>If this arrived, order emails work. ✅</p>', name: 'NOWORA orders' });
  Logger.log('Test email sent ' + how);
}

/** Orders placed after `since` on every client's website, for the alert workflow. */
function orderAlerts_(since) {
  let from = new Date(since || Date.now() - 36e5); if (isNaN(from)) from = new Date(Date.now() - 36e5);
  from = new Date(Math.max(from.getTime(), Date.now() - 2 * 864e5));
  const site = prop_('SITE_URL') || 'https://nowora.vercel.app', out = [];
  readAll_('Clients').forEach(c => {
    if (!c.dataSheet || c.status === 'paused' || /alerts? off/i.test(String(c.notes || ''))) return;
    let ss; try { ss = clientData_(c, false); } catch (e) { return; } if (!ss) return;
    dbTables_(ss).filter(t => /order|checkout|cart|purchase/i.test(t.sh.getName())).forEach(t => {
      dbRead_(t).forEach(r => {
        const ts = new Date(r._ts); if (isNaN(ts) || ts <= from) return;
        const fields = [];
        t.cols.forEach(col => { const v = r[col.id]; if (v === '' || v == null || v === false || /^(status|stock|came from|item count)$/i.test(col.name)) return;
          fields.push([col.name, col.type === 'money' ? '₹' + Number(v).toLocaleString('en-IN') : String(v)]); });
        out.push({ client: c.id, business: c.business, to: String(c.phone || '').replace(/\D/g, ''), id: r._id, ts: ts.toISOString(), table: t.sh.getName(),
          dashboard: c.portalKey ? site + '/client/' + c.portalKey : '', fields: fields });
      });
    });
  });
  return out.sort((a, b) => a.ts < b.ts ? -1 : 1).slice(-100);
}

/** Finds a table by name (any case) or makes it, and adds any columns it is missing. */
function dbEnsure_(ss, name, want) {
  const all = dbTables_(ss);
  let t = all.find(x => x.sh.getName().toLowerCase() === name.toLowerCase());
  if (!t) {
    if (all.length >= DB_LIMIT.tables) throw new Error('This site has too many tables');
    const cols = dbCleanCols_(want.slice(0, DB_LIMIT.columns));
    const sh = ss.insertSheet(dbTabName_(ss, name)), id = randomKey_(10);
    sh.addDeveloperMetadata('nowora_table', JSON.stringify({ id: id, cols: cols }));
    dbStyle_(sh, cols);
    return { sh: sh, id: id, cols: cols, md: sh.getDeveloperMetadata().find(m => m.getKey() === 'nowora_table') };
  }
  const have = t.cols.map(c => c.name.toLowerCase());
  const add = want.filter(w => have.indexOf(w.name.toLowerCase()) < 0).slice(0, Math.max(0, DB_LIMIT.columns - t.cols.length));
  if (add.length) {
    const cols = dbCleanCols_(t.cols.concat(add));
    t.md.setValue(JSON.stringify({ id: t.id, cols: cols }));
    dbStyle_(t.sh, cols);                              // new columns go on the right; existing data stays where it is
    t.cols = cols;
  }
  return t;
}
function guessType_(name, v) {
  const n = name.toLowerCase();
  if (/e-?mail/.test(n) || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) return 'email';
  if (/phone|mobile|whatsapp|contact no|tel/.test(n)) return 'phone';
  if (/address|note|message|comment|details|requirement|question/.test(n) || v.length > 80) return 'longtext';
  if (/\b(date|dob|day)\b/.test(n) && /^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
  if (/price|amount|total|budget|fee|cost/.test(n) && /^[₹\d,.\s]+$/.test(v)) return 'money';
  if (/\b(qty|quantity|people|guests|count|number of)\b/.test(n) && /^\d+$/.test(v)) return 'number';
  if (/website|url|link/.test(n)) return 'link';
  return 'text';
}
/**
 * Reduces stock for ordered items. Looks for a table with an item/product name column and a
 * stock column ("In stock", "Stock", "Qty"…). When the stock table has Size / Colour columns,
 * the matching variant row is used. Returns a short note for the order row.
 */
function takeStock_(ss, items) {
  const inv = dbTables_(ss).map(t => {
    const nameCol = t.cols.find(c => /^(item|product|name|item name|product name|title)$/i.test(c.name)) || t.cols.find(c => /item|product/i.test(c.name) && c.type === 'text');
    const stockCol = t.cols.find(c => c.type === 'number' && /stock|qty|quantity|available|in hand/i.test(c.name));
    return nameCol && stockCol ? { t: t, name: nameCol, stock: stockCol, size: t.cols.find(c => /^size$/i.test(c.name)), colour: t.cols.find(c => /^(colour|color|variant|shade)$/i.test(c.name)) } : null;
  }).filter(Boolean)[0];
  if (!inv) return '';
  const sh = inv.t.sh, last = sh.getLastRow(); if (last < 2) return 'Not in your stock list: ' + items.map(i => i.name).join(', ');
  const n = 2 + inv.t.cols.length, data = sh.getRange(2, 1, last - 1, n).getValues();
  const at = col => 2 + inv.t.cols.indexOf(col);
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const missing = [], low = [];
  items.forEach(i => {
    const cand = data.map((r, k) => ({ r: r, k: k })).filter(x => norm(x.r[at(inv.name)]) === norm(i.name));
    let hit = cand;
    if (inv.size && i.size) { const s = cand.filter(x => norm(x.r[at(inv.size)]) === norm(i.size)); if (s.length) hit = s; else if (cand.some(x => x.r[at(inv.size)] !== '')) hit = []; }
    if (inv.colour && (i.colour || i.variant)) { const v = norm(i.colour || i.variant), s = hit.filter(x => norm(x.r[at(inv.colour)]) === v); if (s.length) hit = s; else if (hit.some(x => x.r[at(inv.colour)] !== '')) hit = []; }
    if (!hit.length) { missing.push(i.name + [i.colour, i.size].filter(Boolean).map(x => ' ' + x).join('')); return; }
    const row = hit[0], cur = Number(row.r[at(inv.stock)]) || 0, next = cur - i.qty;
    row.r[at(inv.stock)] = next;
    sh.getRange(row.k + 2, at(inv.stock) + 1).setValue(next);
    if (next <= 0) low.push(i.name + (i.size ? ' ' + i.size : '') + ' is out');
  });
  return [missing.length ? 'Not in stock list: ' + missing.join(', ') : 'Stock updated', low.join(', ')].filter(Boolean).join(' · ');
}

/* ============================== weekly review ============================== */

function weeklyReport() {
  const weekAgo = Date.now() - 7 * 864e5;
  const inWeek = r => new Date(r.ts).getTime() > weekAgo;
  const ev = readAll_('Events').filter(inWeek);
  const visitors = {}; ev.filter(e => e.type === 'pageview').forEach(e => visitors[e.vid] = 1);
  const taps = ev.filter(e => /^cta_/.test(e.type)).length;
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
  try { refreshClientIndex_(); } catch (e) { console.error(e); }
  append_('Automation', { ts: new Date().toISOString(), workflow: 'weekly', status: 'success', summary: 'Weekly review sent · ' + leads.length + ' enquiries · ' + pitches + ' messages', details: '' });
}

/* ============================== helpers ============================== */

function notify_(subject, text) {
  const p = PropertiesService.getScriptProperties().getProperties();
  if (p.NOTIFY_EMAIL) {
    try { sendMail_({ to: p.NOTIFY_EMAIL, subject: subject, body: text, name: 'NOWORA' }); } catch (e) { console.error('Email failed: ' + e); }
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

/** True once tidyUp() has run: times are stored as real dates and events in plain words. */
function tidy_() { if (tidy_.v === undefined) tidy_.v = prop_('SCHEMA') === '2'; return tidy_.v; }

function sheet_(name) {
  const ss = SpreadsheetApp.getActive(), title = TAB_TITLE[name] || name;
  let sh = ss.getSheetByName(title) || ss.getSheetByName(name);
  if (sh && sh.getName() !== title) sh.setName(title);           // old short names are renamed to the readable ones
  if (!sh && SHEETS[name]) { sh = ss.insertSheet(title); styleTab_(sh, name, SHEETS[name]); }
  if (!sh) throw new Error('Missing sheet "' + title + '" — run setup() once');
  const want = SHEETS[name];                                      // add any new columns automatically
  if (want && sh.getLastColumn() < want.length) styleTab_(sh, name, want);
  return sh;
}
function readAll_(name) {
  const sh = sheet_(name), headers = SHEETS[name];
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues().map(r => rowToObj_(headers, r, name));
}
function append_(name, obj) {
  sheet_(name).appendRow(rowCells_(name, obj));
}
/** A sheet row back into plain strings: times as ISO, dates as yyyy-MM-dd, event words as codes. */
function rowToObj_(headers, row, name) {
  const o = {}, times = TIME_COLS[name] || [];
  headers.forEach((h, i) => {
    let v = row[i];
    if (v === undefined || v === null) v = '';
    else if (v instanceof Date) v = isNaN(v) ? '' : (times.indexOf(h) >= 0 ? v.toISOString() : Utilities.formatDate(v, TZ, 'yyyy-MM-dd'));
    else if (v === true || v === false) v = v ? 'TRUE' : 'FALSE';
    else v = String(v);
    if (h === 'type' && (name === 'Events' || name === '_client') && EVENT_CODE[v]) v = EVENT_CODE[v];
    o[h] = v;
  });
  return o;
}
/** An object into the cells for one row of a tab. */
function rowCells_(name, obj) {
  const keys = name === '_client' ? CLIENT_LOG : SHEETS[name], times = TIME_COLS[name] || [];
  return keys.map(k => {
    const v = obj[k];
    if (tidy_() && times.indexOf(k) >= 0 && v) { const d = v instanceof Date ? v : new Date(v); if (!isNaN(d)) return d; }
    if (tidy_() && k === 'type' && (name === 'Events' || name === '_client') && EVENT_WORDS[v]) return EVENT_WORDS[v];
    return cell_(v);
  });
}
/** Headings, widths, colours, formats and drop-downs for one tab. Safe to run again. */
function styleTab_(sh, name, keys) {
  const head = HEAD[name] || keys.map(k => [k, 120]), n = keys.length, times = TIME_COLS[name] || [];
  sh.getRange(1, 1, 1, n).setValues([head.map(h => h[0])])
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1D4A3D').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 34);
  sh.setFrozenRows(1);
  if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  const rows = Math.max(sh.getMaxRows() - 1, 1);
  keys.forEach((k, i) => {
    const col = sh.getRange(2, i + 1, rows, 1);
    sh.setColumnWidth(i + 1, head[i] ? head[i][1] : 120);
    col.setNumberFormat(times.indexOf(k) >= 0 ? TIME_FORMAT : '@');          // '@' = plain text, so PINs and phone numbers keep every digit
    if (TECH_COLS.indexOf(k) >= 0) col.setFontColor('#8A9691'); else col.setFontColor('#14211D');
    const ch = (CHOICES[name] || {})[k];
    col.setDataValidation(ch ? SpreadsheetApp.newDataValidation().requireValueInList(ch, true).setAllowInvalid(true).build() : null);
  });
  sh.getRange(2, 1, rows, n).setWrap(false).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('top').setFontSize(10);
  sh.getBandings().forEach(b => b.remove());
  sh.getRange(1, 1, sh.getMaxRows(), n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor('#1D4A3D').setFirstRowColor('#FFFFFF').setSecondRowColor('#F4F6F2');
  if (TAB_COLOR[name]) sh.setTabColor(TAB_COLOR[name]);
  if (TAB_ABOUT[name]) sh.getRange(1, 1).setNote(TAB_ABOUT[name]);
}

/* ============================== client sites spreadsheet ============================== */
// One spreadsheet, one tab per client, plus an "All clients" summary tab. Each tab is found by its
// client ID (stored on the tab), so renaming the tab or the client never breaks the link.

function clientDb_(create) {
  if (clientDb_.ss) return clientDb_.ss;
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('CLIENT_DB_ID');
  if (id) { try { return (clientDb_.ss = SpreadsheetApp.openById(id)); } catch (e) { if (!create) throw e; } }
  if (!create) return null;
  const ss = SpreadsheetApp.create('NOWORA — Client sites');
  ss.setSpreadsheetTimeZone(TZ);
  p.setProperty('CLIENT_DB_ID', ss.getId());
  const idx = ss.getSheets()[0]; idx.setName('All clients');
  try { const main = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents(); if (main.hasNext()) DriveApp.getFileById(ss.getId()).moveTo(main.next()); } catch (e) { /* stays in My Drive */ }
  return (clientDb_.ss = ss);
}
function tabName_(business, ss, own) {
  let base = String(business || 'Client').replace(/[\[\]\*\?\/\\:']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Client';
  if (base === 'All clients') base = 'Client ' + base;
  let name = base, n = 2;
  while (true) { const sh = ss.getSheetByName(name); if (!sh || (own && sh.getSheetId() === own.getSheetId())) return name; name = base + ' (' + n++ + ')'; }
}
/** The client's log tab; made the first time it is needed. */
function clientTab_(c, create) {
  if (!c || !c.id) return null;
  const ss = clientDb_(create); if (!ss) return null;
  const cache = CacheService.getScriptCache(), ck = 'ctab_' + c.id, sid = cache.get(ck);
  if (sid) { const hit = ss.getSheets().find(s => String(s.getSheetId()) === sid); if (hit) return hit; }
  const found = ss.createDeveloperMetadataFinder().withKey('nowora_client').withValue(String(c.id))
    .withLocationType(SpreadsheetApp.DeveloperMetadataLocationType.SHEET).find();
  let sh = found.length ? found[0].getLocation().getSheet() : null;
  if (!sh && create) {
    sh = ss.insertSheet(tabName_(c.business, ss), ss.getSheets().length);
    sh.addDeveloperMetadata('nowora_client', String(c.id));
    styleTab_(sh, '_client', CLIENT_LOG);
    sh.setTabColor('#1D4A3D');
    sh.getRange(1, 1).setNote((c.business || 'Client') + ' — every visit, tap, enquiry, change request and website edit, newest at the bottom.' + (c.site ? '\nWebsite: ' + c.site : ''));
    try { refreshClientIndex_(); } catch (e) { console.error(e); }
  }
  if (sh) cache.put(ck, String(sh.getSheetId()), 21600);
  return sh;
}
/** Adds one row to a client's log. Never breaks the request that called it. */
function clientLog_(c, row) {
  try {
    if (!c || !c.id) return;
    const sh = clientTab_(c, true);
    if (sh) sh.appendRow(rowCells_('_client', row));
  } catch (e) { console.error('client log: ' + e); }
}
function readClientLog_(c) {
  let sh; try { sh = clientTab_(c, false); } catch (e) { return []; }
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, CLIENT_LOG.length).getValues().map(r => rowToObj_(CLIENT_LOG, r, '_client'));
}
function readLegacyClientEvents_() {
  if (readLegacyClientEvents_.rows) return readLegacyClientEvents_.rows;
  const sh = SpreadsheetApp.getActive().getSheetByName('ClientEvents');
  return (readLegacyClientEvents_.rows = sh && sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, LEGACY_CLIENT_EVENTS.length).getDisplayValues().map(r => rowToObj_(LEGACY_CLIENT_EVENTS, r, 'ClientEvents')) : []);
}
/** Keeps the tab name in step with the client's business name. */
function afterClientChange_(c) {
  try {
    const sh = clientTab_(c, !!prop_('CLIENT_DB_ID')); if (!sh) return;
    const want = tabName_(c.business, sh.getParent(), sh);
    if (sh.getName() !== want) { sh.setName(want); refreshClientIndex_(); }
  } catch (e) { console.error('client tab: ' + e); }
}
/** A removed client's tab is kept (their history), renamed "… (removed)" and moved to the end. */
function retireClientTab_(c) {
  const sh = clientTab_(c, false); if (!sh) return;
  const ss = sh.getParent();
  sh.setName(tabName_(String(c.business || 'Client').slice(0, 70) + ' (removed)', ss, sh));
  sh.setTabColor('#B5483A');
  ss.setActiveSheet(sh); ss.moveActiveSheet(ss.getSheets().length);
  sh.getDeveloperMetadata().forEach(m => { if (m.getKey() === 'nowora_client') m.setKey('nowora_removed'); });
  CacheService.getScriptCache().remove('ctab_' + c.id);
  refreshClientIndex_();
}
/** The "All clients" summary tab: one row per client with live 30-day numbers (Sheets formulas). */
function refreshClientIndex_() {
  const ss = clientDb_(false); if (!ss) return;
  let idx = ss.getSheetByName('All clients'); if (!idx) idx = ss.insertSheet('All clients', 0);
  ss.setActiveSheet(idx); ss.moveActiveSheet(1);
  const clients = readAll_('Clients'), site = prop_('SITE_URL') || 'https://nowora.vercel.app';
  const head = [['Client',170],['Website',210],['Status',90],['Care plan',90],['Visitors · 30 days',130],['WhatsApp & calls · 30 days',170],['Enquiries · 30 days',140],['Last activity',150],['Client dashboard',230],['Open their log',140],['Their database',150]];
  const q = n => "'" + String(n).replace(/'/g, "''") + "'";
  const rows = clients.map(c => {
    const sh = clientTab_(c, false), t = sh ? q(sh.getName()) : null, recent = t ? t + '!A2:A>=NOW()-30' : '';
    return [c.business, c.site, c.status, c.carePlan === 'yes' ? 'yes' : 'no',
      t ? '=IFERROR(COUNTUNIQUE(FILTER(' + t + '!G2:G,' + t + '!B2:B="' + EVENT_WORDS.pageview + '",' + recent + ')),0)' : 0,
      t ? '=COUNTIFS(' + t + '!B2:B,"' + EVENT_WORDS.cta_whatsapp + '",' + t + '!A2:A,">="&(NOW()-30))+COUNTIFS(' + t + '!B2:B,"' + EVENT_WORDS.cta_call + '",' + t + '!A2:A,">="&(NOW()-30))' : 0,
      t ? '=COUNTIFS(' + t + '!B2:B,"' + EVENT_WORDS.lead_submit + '",' + t + '!A2:A,">="&(NOW()-30))' : 0,
      t ? '=IFERROR(MAX(' + t + '!A2:A),"")' : '',
      c.portalKey ? site + '/client/' + c.portalKey : '',
      sh ? '=HYPERLINK("#gid=' + sh.getSheetId() + '","Open log →")' : 'no activity yet',
      c.dataSheet ? '=HYPERLINK("https://docs.google.com/spreadsheets/d/' + c.dataSheet + '","Open database →")' : 'not started'];
  });
  idx.clear(); idx.getBandings().forEach(b => b.remove());
  if (idx.getMaxColumns() > head.length) idx.deleteColumns(head.length + 1, idx.getMaxColumns() - head.length);
  idx.getRange(1, 1, 1, head.length).setValues([head.map(h => h[0])]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1D4A3D').setVerticalAlignment('middle').setWrap(true);
  head.forEach((h, i) => idx.setColumnWidth(i + 1, h[1]));
  idx.setRowHeight(1, 34); idx.setFrozenRows(1); idx.setTabColor('#F2A33A');
  if (rows.length) {
    idx.getRange(2, 1, rows.length, head.length).setValues(rows).setFontSize(10).setVerticalAlignment('top');
    idx.getRange(2, 8, rows.length, 1).setNumberFormat(TIME_FORMAT);
    idx.getRange(1, 1, rows.length + 1, head.length).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
      .setHeaderRowColor('#1D4A3D').setFirstRowColor('#FFFFFF').setSecondRowColor('#F4F6F2');
  }
  idx.getRange(1, 1).setNote('One row per client. Numbers update by themselves from each client\'s tab. Each client\'s own tab has their full log.');
}

/**
 * RUN THIS ONCE after pasting the new code (select tidyUp ▸ Run). Safe to run again.
 *  - gives every tab a readable name and plain-English headings, colours, widths and drop-downs
 *  - shows times as "2 Nov 2026, 5:47 am" (India time) and events in words
 *  - makes the "NOWORA — Client sites" spreadsheet with one tab per client, and moves their logs there
 *  - adds a "Read me" tab explaining each tab
 */
function tidyUp() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  PropertiesService.getScriptProperties().setProperty('SCHEMA', '2'); tidy_.v = true;

  // 1) your own tabs
  TAB_ORDER.forEach(name => {
    const sh = sheet_(name), keys = SHEETS[name], last = sh.getLastRow();
    styleTab_(sh, name, keys);
    if (last > 1) {                                  // rewrite the data so times become real dates and events become words
      const range = sh.getRange(2, 1, last - 1, keys.length);
      const fixed = range.getValues().map(r => rowCells_(name, rowToObj_(keys, r, name)));
      range.setValues(fixed);
    }
  });
  TAB_ORDER.forEach((name, i) => { ss.setActiveSheet(sheet_(name)); ss.moveActiveSheet(i + 2); });

  // 2) client sites spreadsheet + move the old ClientEvents tab into it
  const db = clientDb_(true), clients = readAll_('Clients');
  clients.forEach(c => clientTab_(c, true));
  const legacy = ss.getSheetByName('ClientEvents');
  let moved = 0, dropped = 0;
  if (legacy) {
    const byTrack = {}; clients.forEach(c => { if (c.trackId) byTrack[c.trackId] = c; });
    const groups = {};
    readLegacyClientEvents_().forEach(e => {
      const c = byTrack[e.cid];
      if (!c || junkClientEvent_(e)) { dropped++; return; }
      (groups[c.id] = groups[c.id] || { c: c, rows: [] }).rows.push(rowCells_('_client', e));
    });
    Object.keys(groups).forEach(id => {
      const g = groups[id], sh = clientTab_(g.c, true), start = sh.getLastRow() + 1;
      g.rows.sort((a, b) => a[0] - b[0]);
      sh.getRange(start, 1, g.rows.length, CLIENT_LOG.length).setValues(g.rows);
      moved += g.rows.length;
    });
    ss.deleteSheet(legacy);
  }
  db.getSheets().forEach(sh => { if (sh.getName() === 'Sheet1' && sh.getLastRow() === 0) db.deleteSheet(sh); });
  refreshClientIndex_();

  // 3) read-me tab + remove the empty default tab
  let me = ss.getSheetByName('Read me'); if (!me) me = ss.insertSheet('Read me', 0);
  ss.setActiveSheet(me); ss.moveActiveSheet(1);
  me.clear(); me.getBandings().forEach(b => b.remove());
  const dbUrl = 'https://docs.google.com/spreadsheets/d/' + db.getId();
  const lines = [['NOWORA — your studio data', ''], ['', ''], ['Tab', 'What is in it']]
    .concat(TAB_ORDER.map(n => [TAB_TITLE[n], TAB_ABOUT[n]]))
    .concat([['', ''], ['Client logs', 'Each client has their own tab in the "NOWORA — Client sites" spreadsheet: ' + dbUrl],
      ['', ''], ['Good to know', 'The website and dashboards write to these tabs. You can edit cells, but keep the columns in this order and don\'t rename tabs. Grey columns are IDs the system uses.']]);
  me.getRange(1, 1, lines.length, 2).setValues(lines).setVerticalAlignment('top').setWrap(true);
  me.getRange(1, 1).setFontSize(18).setFontWeight('bold').setFontColor('#1D4A3D');
  me.getRange(3, 1, 1, 2).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1D4A3D');
  me.getRange(4, 1, TAB_ORDER.length, 1).setFontWeight('bold');
  me.getRange(lines.length - 2, 1, 3, 1).setFontWeight('bold');
  me.setColumnWidth(1, 200); me.setColumnWidth(2, 640); me.setTabColor('#F2A33A');
  if (me.getMaxColumns() > 2) me.deleteColumns(3, me.getMaxColumns() - 2);
  const blank = ss.getSheetByName('Sheet1'); if (blank && blank.getLastRow() === 0) ss.deleteSheet(blank);
  ss.setActiveSheet(me);

  Logger.log('Done. Your tabs are tidied.');
  Logger.log('Client sites spreadsheet: ' + dbUrl);
  Logger.log('Moved ' + moved + ' client log rows into it' + (dropped ? ' (skipped ' + dropped + ' test or preview rows)' : '') + '.');
}

function cell_(v) {
  if (v === undefined || v === null) return '';
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  if (typeof v === 'string' && /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{4} \d{2}:\d{2}:\d{2} GMT/.test(v)) { const d = new Date(v.replace(/\s*\(.*\)$/, '')); if (!isNaN(d)) return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? "'" + s : s;   // block formula injection
}
function clip_(v, n) { return v === undefined || v === null ? '' : String(v).slice(0, n); }
function truthy_(v) { return v === true || v === 'TRUE' || v === 'true' || v === '1' || v === 'yes'; }
function digits_(p) { let d = String(p || '').replace(/\D/g, ''); if (d.length === 10) d = '91' + d; return d; }
function randomKey_(n) { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += c.charAt(Math.floor(Math.random() * c.length)); return s; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
