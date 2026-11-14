-- make4yu on Cloudflare D1 (test). Run once in the D1 console, or:
--   npx wrangler d1 execute make4yu --remote --file d1/schema.sql
-- Safe to run again: everything is CREATE ... IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  portal_key TEXT UNIQUE NOT NULL,      -- /client/<portal_key>
  pin TEXT NOT NULL,
  track_id TEXT UNIQUE,                 -- data-make4yu on the client's site
  host TEXT UNIQUE,                     -- <host>.make4yu.com, served from D1
  business TEXT NOT NULL,
  name TEXT, phone TEXT, email TEXT, site TEXT,
  kind TEXT DEFAULT 'services',         -- store | restaurant | salon | realestate | services
  package TEXT, price INTEGER, delivered TEXT,
  care_plan TEXT DEFAULT 'yes', care_fee INTEGER, renewal TEXT,
  status TEXT DEFAULT 'live',           -- onboarding | building | live | paused
  uptime TEXT, response_ms INTEGER, last_check TEXT,
  checklist TEXT, notes TEXT,
  advance_paid TEXT, balance_paid TEXT,
  edit_access TEXT DEFAULT 'auto',      -- auto | on | off
  wa_alerts TEXT DEFAULT 'on',
  repo TEXT, repo_sha TEXT,            -- optional: website kept in a GitHub repo, pulled in by the scheduled Worker
  bridge TEXT,                          -- 'apps-script': account, requests and editing stay in Sheets; data lives here
  created TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  ts INTEGER NOT NULL,                  -- unix seconds
  type TEXT NOT NULL, label TEXT, ref TEXT, device TEXT, path TEXT, vid TEXT, sid TEXT
);
CREATE INDEX IF NOT EXISTS events_client_ts ON events (client_id, ts);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, ts TEXT NOT NULL,
  type TEXT, message TEXT, status TEXT DEFAULT 'new', reply TEXT, updated TEXT, attachment TEXT
);
CREATE INDEX IF NOT EXISTS requests_client ON requests (client_id, ts);

-- the client's own database: tables with typed columns, rows stored as JSON
CREATE TABLE IF NOT EXISTS db_tables (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, name TEXT NOT NULL,
  cols TEXT NOT NULL,                   -- JSON [{id,name,type,options}]
  pos INTEGER DEFAULT 0,
  created TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS db_tables_client ON db_tables (client_id);
CREATE TABLE IF NOT EXISTS db_rows (
  id TEXT PRIMARY KEY, table_id TEXT NOT NULL, client_id TEXT NOT NULL,
  ts TEXT NOT NULL, data TEXT NOT NULL  -- JSON {colId: value}
);
CREATE INDEX IF NOT EXISTS db_rows_table ON db_rows (table_id, ts);
CREATE INDEX IF NOT EXISTS db_rows_client_ts ON db_rows (client_id, ts);

CREATE TABLE IF NOT EXISTS revs (client_id TEXT PRIMARY KEY, rev INTEGER NOT NULL);

-- the client's website: every publish is a version; the newest is live
CREATE TABLE IF NOT EXISTS site_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT NOT NULL, ts TEXT NOT NULL,
  message TEXT, who TEXT, html TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS site_versions_client ON site_versions (client_id, id);
CREATE TABLE IF NOT EXISTS assets (
  client_id TEXT NOT NULL, path TEXT NOT NULL, type TEXT NOT NULL, data BLOB NOT NULL,
  ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (client_id, path)
);

-- order alerts waiting to be sent (and what happened when they were)
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, ts TEXT NOT NULL, kind TEXT NOT NULL,
  title TEXT, body TEXT, to_phone TEXT, sent TEXT, tries INTEGER DEFAULT 0, error TEXT
);
CREATE INDEX IF NOT EXISTS alerts_pending ON alerts (sent, ts);

CREATE TABLE IF NOT EXISTS automation (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, job TEXT NOT NULL,
  status TEXT NOT NULL, summary TEXT, details TEXT
);

CREATE TABLE IF NOT EXISTS limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL);

