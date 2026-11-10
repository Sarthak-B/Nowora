# make4yu — Make it happen.

make4yu is my web studio. I design and build websites, landing pages and sales funnels for students, creators and small businesses. Every client starts with two free samples, and the site goes live in about a week.

This repo is the whole studio system I built for it: the public website, a private owner dashboard, a Google Sheets backend, and Playwright automations that run on GitHub Actions.

![make4yu website hero](docs/hero.jpg)

## What's inside

| Part | What it does |
| --- | --- |
| **Website** (`site/index.html`) | Single-file site: live "site being built" hero animation, filterable showcase with hover-scroll previews, services, plans with an INR / USD toggle, care plan, scroll-pinned process, FAQ and an enquiry form that hands off to WhatsApp or email. No framework, no build step. |
| **Owner dashboard** (`site/index.html#admin`) | Live analytics (visitors, WhatsApp/email taps, enquiries, conversion, sources, visitor journey), a lead inbox, an outreach CRM with message templates and a daily target, client and care-plan tracking with onboarding checklists, portfolio from a link (paste a URL: title, description, niche and filter are read automatically, with a live embedded preview), automation health and 12-month goal tracking. |
| **Client dashboards** (`site/client/`, `site/t.js`) | Each client gets `make4yu.vercel.app/client/<name>` (the old nowora.vercel.app address still works) + a 6-digit PIN: live "right now" visitors, 7/30/90-day traffic with comparisons, sources (tap to filter), devices, top pages, a when-people-visit heatmap, a visit→enquiry funnel, a live preview of their site, health (uptime, speed, HTTPS), a printable QR code, project progress, payments, care plan, and change requests with photos. Visitor stats come from a one-line `t.js` snippet. Try `/client/demo` (PIN 123456). |
| **Shop** (`site/client/shop.js`) | For store clients, the dashboard gets a Shop tab automatically (when their site has a product catalogue or their database has an Orders table). **Sales:** confirmed vs waiting revenue, orders, average order, sales over time, best sellers and latest orders, read from the client's Orders table. **Products:** clients upload photos, type a name, set price and sizes; each photo's colour is detected in the browser and same-colour photos are grouped, and the category is picked from the name (new categories are created when needed). Publish commits the photos and the updated catalogue (`<script type="application/json" id="nowora-products">` in their page) through the same `site_publish` action as the editor. The owner dashboard shows every client's store sales and a total. |
| **Website editor** (`site/client/editor.js`) | From their dashboard, clients edit their real site visually: text, buttons and WhatsApp links, photos, entrance and hover animations, duplicate/move/delete cards and sections, hide sections, theme colours and fonts, and add ready-made sections recommended for their niche (styled to match the site). Undo/redo, drafts, desktop/phone preview, Publish (commits to the client's repo, which redeploys) and version history with restore. Needs Apps Script property `GITHUB_TOKEN` (fine-grained, Contents read & write). |
| **Auto-added client sites** (`scripts/discover.mjs`) | Any repo of yours with a `nowora.json` file at its root is found within 10 minutes: it gets a showcase card, a scrolling preview and a client dashboard, and you're emailed the link + PIN. Add a `DISCOVER_TOKEN` secret (read-only access to your repos) to include private repos. |
| **Backend** (`apps-script/Code.gs`) | Google Apps Script web app on top of Google Sheets. Records events and enquiries, sends instant WhatsApp and email alerts, stores uploads in Google Drive, serves the dashboard behind an admin key, checks every client site every 5 minutes with instant down/up alerts, and emails a weekly review. |
| **Automations** (`scripts/`, `.github/workflows/`) | Playwright in GitHub Actions. **Uptime:** every 3 hours, opens each care-plan client site, checks it really renders and alerts on downtime. **Prospect audit:** every morning, scores a prospect's site on desktop and iPhone, lists issues worth fixing and saves a mobile screenshot for the pitch. **Portfolio previews:** within minutes of adding a link, scrolls through the site and captures a tall preview for the showcase. |

![Website showcase](docs/showcase.jpg)
![Owner dashboard](docs/dashboard.jpg)
![Outreach CRM](docs/outreach.jpg)

## How it fits together

```
Visitor ──► Website ──(visits, taps, enquiries)──► Apps Script ──► Google Sheet
                                                       │
                                                       ├─► WhatsApp alert
                                                       └─► Email alert
Owner ──► Dashboard ◄──(live data every 15 s)──── Apps Script
GitHub Actions + Playwright ──(uptime, audits, portfolio previews)──► Apps Script
```

**Built with:** HTML, CSS and vanilla JavaScript · Google Apps Script · Google Sheets and Drive · Node.js · Playwright · GitHub Actions

## Privacy by design

The repo is public, so nothing private lives in it:
- Keys are stored in Apps Script properties and GitHub Secrets, never in code.
- Leads, clients and prospects live in a private Google Sheet.
- Automation logs only print counts. Site names, results and screenshots go straight to the private Sheet and Drive.

---

## Setup

### 1. Google Sheet backend

1. Open the Google Sheet, then **Extensions → Apps Script**. Paste `apps-script/Code.gs` and save.
2. Run `setup` once and approve permissions (**Advanced → Go to project → Allow**).
3. Copy `ADMIN_KEY` and `AUTOMATION_KEY` from the **Execution log**.
4. In **Project Settings → Script properties**, set `NOTIFY_EMAIL`, plus `CALLMEBOT_PHONE` and `CALLMEBOT_APIKEY` for WhatsApp alerts.
5. Go to **Deploy → New deployment → Web app**, set Execute as **Me** and Who has access **Anyone**. Copy the `/exec` URL.
6. Set `endpoint` at the top of `site/index.html` to that URL.

After editing Code.gs later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

**How the data is laid out**
- **Your studio sheet** holds only your own data, one readable tab each: Read me, Enquiries, Clients, Change requests, Outreach, Outreach messages, Showcase, Website visits, Automation log. Times show in India time; events are written in words ("Tapped WhatsApp").
- **"make4yu — Client sites"** is a separate spreadsheet (made automatically, saved next to your studio sheet). It has an **All clients** summary tab with live 30-day numbers, and one tab per client with their full log: visits, taps, enquiries, change requests, website edits, and downtime. A removed client's tab is kept and renamed "… (removed)".
- Upgrading an existing sheet: paste the new Code.gs, redeploy, then select **tidyUp** in the Apps Script toolbar and press **Run** once. It is safe to run again any time.

### 2. WhatsApp alerts (CallMeBot)

Follow the WhatsApp API steps on callmebot.com to get a free API key for your own number. Then run `testAlerts` in Apps Script.

### 3. GitHub Actions

Under **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
| --- | --- |
| `STUDIO_ENDPOINT` | the Apps Script `/exec` URL |
| `STUDIO_AUTOMATION_KEY` | the `AUTOMATION_KEY` |

Run each workflow once from the **Actions** tab to confirm.

**Portfolio previews** check for new links every 10 minutes (a few seconds when there's nothing to do). To start them the moment you add a link instead, create a fine-grained GitHub token with **Actions: Read and write** on this repo and add Apps Script properties `GITHUB_TOKEN` (the token) and `GITHUB_REPO` (`Sarthak-B/make4yu`).

Local test, which leaves the Sheet untouched:

```bash
npm install && npx playwright install chromium
TEST_SITES=https://example.com npm run test:audit
TEST_SITES=https://example.com node scripts/portfolio.mjs --dry-run
```

### 4. Dashboard

Open `yoursite/#admin` and sign in with `ADMIN_KEY`. Without a backend, it runs in demo mode with sample data stored in the browser.

---

© 2026 make4yu. All rights reserved. This code is shared to show my work; it is not licensed for reuse.
