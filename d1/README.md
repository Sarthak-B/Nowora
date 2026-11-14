# make4yu on Cloudflare D1 (trial)

Clients whose row is in D1 run entirely on Cloudflare: dashboard data, forms from their website, their
website itself (served at `<host>.make4yu.com` straight from D1) and the scheduled jobs. Everyone else
keeps using Google Sheets + Apps Script exactly as before — nothing changes for them.

## What lives where
- `d1/schema.sql` — the tables. Run once in the D1 console.
- `lib/m4y.js` — the backend (same actions as `apps-script/Code.gs`), `lib/seed.js` + `lib/test-sites.js` — the four test clients.
- `functions/api/v2.js` — the endpoint (`POST /api/v2`). `functions/client/[slug].js` points a D1 client's dashboard at it.
- `functions/_middleware.js` — serves D1 websites; other subdomains still come from `site/_sites/`.
- `workers/cron/` — scheduled Worker: alerts every minute, uptime every 5 min, GitHub-repo sites hourly, backup nightly.

## Set up (once)
1. Cloudflare → Storage & databases → D1 → Create database `make4yu`.
2. Open it → Console → paste `d1/schema.sql` → Run.
3. Workers & Pages → make4yu → Settings → Bindings → Add → D1 database: variable `DB`, database `make4yu`. Redeploy.
4. `node scripts/d1-seed.mjs https://make4yu.com` — makes the four test clients once and prints their dashboards + PINs.
5. Scheduled jobs: Workers & Pages → Create → Import a repository → `Sarthak-B/make4yu`, root directory `workers/cron`
   (put the D1 database id in `workers/cron/wrangler.toml` first).
6. Optional secrets on the Worker: `WA_TOKEN`, `WA_PHONE_ID`, `WA_TEMPLATE` (WhatsApp Cloud API, client alerts),
   `CALLMEBOT_PHONE`, `CALLMEBOT_APIKEY` (your own WhatsApp), `GITHUB_TOKEN`. Optional on the Pages project:
   `ADMIN_KEY` (same as Apps Script's, so owner view works for D1 clients).

## Free-plan limits to keep in mind
50 D1 queries per request, 5 M rows read and 100 k rows written per day, 500 MB per database, 7 days of
Time Travel restore. The dashboard's 30-second refresh only reads new events to stay well inside these.

## Local test
```
npx wrangler d1 execute make4yu --local -c d1/wrangler.local.toml --persist-to /tmp/m4y --file d1/schema.sql
npx wrangler pages dev site --d1 DB=local-test --persist-to /tmp/m4y --port 8788
node scripts/d1-seed.mjs
```

## Clients moved from Sheets (bridge)
A client with `bridge = 'apps-script'` keeps their account, PIN, change requests, website editing and the
new-order email in Apps Script; their visits, orders, payments and records live in D1. Move one from their
dashboard: `https://make4yu.com/client/<key>?move=cloudflare`. Needs the Pages secret `AUTOMATION_KEY`
(same value as Apps Script's). To undo: delete their row from `clients` in D1.
