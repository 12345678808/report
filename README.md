# ICCC Daily Report Card — Full-Stack Edition

A full-stack rebuild of the ICCC Daily Report Card dashboard: **React (Vite)** frontend,
**Express/Node** backend, **PostgreSQL** database (built for your Neon Postgres instance).

This is the **core MVP**: real login (bcrypt + JWT, httpOnly cookie) and the org-wide
KPI table with live database read/write (Admin can edit, Commissioner is read-only).
Zone-wise report, the analytics chart, PDF export, and mobile styling from the original
single-file dashboard are **not yet ported** to this version — planned for the next
iteration. The original `ICCC_Daily_Report_Card.html` (single file, all features) still
works standalone and is unaffected by this project.

## Project layout

```
iccc-app/
  server/     Express API + PostgreSQL access
  client/     React (Vite) frontend
```

## 1. Database setup

The `.env` file in `server/` is already filled in with your Neon connection string, so
you generally only need to run the migration + seed commands below. If you ever need to
point it at a different database, edit `server/.env`:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

Then, from the `server/` folder:

```bash
cd server
npm install
npm run migrate   # creates tables + indexes (safe to re-run — uses IF NOT EXISTS)
npm run seed       # wipes and reloads demo users, zones, KPI catalog, and one day of figures
```

`npm run seed` truncates and reloads `users`, `zones`, `kpi_items`, `kpi_entries` — only
run it on a fresh/dev database, not on data you want to keep.

Demo accounts created by the seed script:

| Username       | Password    | Role         |
|----------------|-------------|--------------|
| `admin`        | `admin@2026`| admin (can edit) |
| `commissioner` | `comm@2026` | commissioner (read-only) |

**Change these passwords** (or add real accounts) before using this anywhere but your
own machine — see "Security notes" below.

### Switching to your company's real logins

There's no self-serve signup page (by design — only two roles exist, and both control
real KPI data, so accounts are provisioned deliberately rather than opened to anyone).
To replace a demo account with a real one, use the `user:set` script from `server/`:

```bash
# Rename the demo "admin" login to a real company email, in place:
npm run user:set -- admin.desk@ccmc.gov.in "SomeStrongPassword123" admin "ICCC Admin Desk" admin

# Add a brand-new commissioner login (doesn't touch existing accounts):
npm run user:set -- commissioner@ccmc.gov.in "AnotherStrongPassword" commissioner "Thiru. Katta Ravi Teja"
```

The `username` field is a plain text column — an email address works fine as-is, no
schema change needed. The last argument (the existing username to replace, e.g. `admin`)
is optional: include it to rename an existing login in place, leave it off to add a new
one alongside whatever's already there. Password must be at least 8 characters. Run this
once per person who needs to log in, then give them their email + password directly —
there's nowhere in the app itself to view or reset a password, so keep a note of what you
set.

## 2. Run the backend

```bash
cd server
npm run dev     # nodemon-style --watch, restarts on file changes
# or: npm start
```

Starts on `http://localhost:4000` by default (`PORT` in `.env`). Check it's alive:

```bash
curl http://localhost:4000/api/health
# {"ok":true}
```

## 3. Run the frontend

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Starts on `http://localhost:5173`. Open that in your browser, log in with one of the
demo accounts above.

If you run the backend on a different host/port, set `client/.env`:

```
VITE_API_BASE=http://localhost:4000/api
```

## How it works

- **Auth**: `POST /api/auth/login` checks the bcrypt hash in `users`, signs a JWT, and
  sets it as an httpOnly cookie (`iccc_token`) — the token never touches browser
  JavaScript/localStorage. `GET /api/auth/me` restores the session on page reload.
- **KPI data**: `kpi_items` is the catalog (department, report name, unit, common vs.
  zone-scoped). `kpi_entries` holds the actual dated figures (target/achievement/note).
  Pending, performance %, and status (Ok/Medium/Low) are **computed on every read**
  from target+achievement — never stored — so there's one source of truth and nothing
  can drift out of sync.
- **Editing**: `PUT /api/kpi/entry` is admin-only (`requireAdmin` middleware — the
  Commissioner role gets a 403). It upserts one day's figures for one KPI item (and
  zone, if zone-scoped).

## Google Sheets two-way sync (optional)

You can connect one Google Sheet so that it stays in sync with the database in **both
directions**:

- **Admin edits in the app → Sheet updates automatically.** Every `PUT /api/kpi/entry`
  (Admin clicking Save) also pushes that row to the Sheet.
- **Someone edits a cell in the Sheet → the database updates.** A small Apps Script
  bound to the Sheet calls this server whenever a row changes.

This is off by default (`GOOGLE_SHEETS_ENABLED=false`) — the app works exactly as
described above with it left off. It only needs the Google Sheets ID: your
[spreadsheet](https://docs.google.com/spreadsheets/d/1HDTBwDr_Dy-mgrkf1-FPMXu-UUdBS19PxC-XYF8Y8aU/edit)
is already wired into `server/.env` as `GOOGLE_SHEETS_SPREADSHEET_ID`. Two things are
still missing before it can actually turn on — a Google service account, and a public
URL for the webhook — both described below.

### Why this needs a service account (and why I couldn't finish this part for you)

Reading and writing a Google Sheet from a server requires a **Google Cloud service
account** — a robot identity with its own login key, separate from your personal Google
account. Creating one means going into *your* Google Cloud console and generating a key
file, which only you can do (I have no access to your Google account, and this sandbox
also can't reach Google's servers at all — the same network restriction that stopped me
from live-testing your Neon database applies to Google APIs too). Everything else — the
sync code, the upsert logic, the webhook, the Apps Script — is built and tested against
a local database standing in for yours; only this credentials step needs you.

### Setup steps

**1. Create the service account (about 5 minutes, free, no billing needed for this):**

1. Go to [console.cloud.google.com](https://console.cloud.google.com/), create a new
   project (or use an existing one).
2. In the search bar, search "Google Sheets API" → open it → click **Enable**.
3. Go to **IAM & Admin → Service Accounts → Create Service Account**. Give it any name
   (e.g. "iccc-sheets-sync"). Skip the optional role/access steps — click through to Done.
4. Open the new service account → **Keys** tab → **Add Key → Create new key → JSON**.
   This downloads a `.json` file — keep it private, it's a credential.
5. Open that JSON file. You need two values from it:
   - `client_email` → this is `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → this is `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (paste it into `.env`
     on one line, keeping the `\n` sequences exactly as they appear in the JSON file —
     don't turn them into real line breaks)

**2. Share the Sheet with that service account:**

Open your Sheet → **Share** → paste in the `client_email` value from the JSON file →
give it **Editor** access. Without this step the service account can't read or write
the Sheet even with a valid key.

**3. Fill in `server/.env`:**

```
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SHEETS_SPREADSHEET_ID=1HDTBwDr_Dy-mgrkf1-FPMXu-UUdBS19PxC-XYF8Y8aU
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
SHEETS_WEBHOOK_SECRET=<already generated for you — check the current value in .env>
```

**4. Bootstrap the Sheet with your current data:**

```bash
cd server
npm run sheets:resync
```

This creates a "KPI Data" tab (if missing) and writes all 144 rows (4 org-wide + 5
zones × 28 each) from the database, with a header row. Re-run this command any time you
want the Sheet to forcibly match the database again.

At this point, **Database → Sheet is fully live**: any Admin edit in the app will now
also update the Sheet. The other direction (Sheet → Database) needs one more step,
because it needs a URL Google's servers can reach:

**5. Deploy the backend somewhere with a public URL** (Render, Railway, Fly.io, a VPS —
anywhere that isn't `localhost`), or use a tunnel like `ngrok http 4000` while testing.

**6. Wire up the Apps Script:**

1. In your Sheet: **Extensions → Apps Script**.
2. Delete the placeholder code, paste in the contents of
   `server/google-apps-script/onEdit.gs` (included in this project).
3. Near the top of that file, replace `WEBHOOK_URL` with
   `https://your-public-server-url/api/sheets/webhook`, and replace `WEBHOOK_SECRET`
   with the exact `SHEETS_WEBHOOK_SECRET` value from your `.env`.
4. In the Apps Script editor, click the clock icon (**Triggers**) → **Add Trigger** →
   function `onEditInstallable`, event source "From spreadsheet", event type "On edit" →
   **Save**. Approve the permission prompt the first time it asks.

Now editing Target, Achievement, or Note in the "KPI Data" tab pushes that change to the
database within a second or two, the same as if an Admin had edited it in the app.

### Things worth knowing

- **The Sheet doesn't create new KPI parameters.** It can only update figures for
  departments/report names that already exist in the catalog (the same 32 parameters
  seeded from your original dashboard). Typos in the Zone/Department/Report columns
  will fail the sync with a clear error in the Apps Script execution log (**Executions**
  tab in the Apps Script editor) rather than silently doing nothing.
- **Pending, Performance %, and Status columns are display-only.** They're recalculated
  by the server from Target + Achievement every time, so editing them directly in the
  Sheet has no effect — the next sync overwrites them with the correct computed value.
  This keeps one source of truth instead of the Sheet and database disagreeing.
- **Conflict handling is last-write-wins.** If someone edits the app and someone else
  edits the Sheet for the same row within moments of each other, whichever write reaches
  the database last is what sticks — there's no merge logic. For a small team doing
  daily figure entry this is rarely an issue in practice, but it's worth knowing.
- **The webhook secret is a real credential.** Anyone with your webhook URL *and* the
  secret can write to your database through it, so treat `SHEETS_WEBHOOK_SECRET` like a
  password — don't post it anywhere public, and rotate it (generate a new random value,
  update both `.env` and the Apps Script) if you ever suspect it's leaked.
- **Commissioner accounts are unaffected.** This sync only ever writes through the same
  validated path Admin edits use — there's no way to grant Sheet-editing power to the
  Commissioner role through this feature; anyone who can edit the Sheet has effectively
  Admin-level write access to KPI figures, so control Sheet edit access accordingly.

## Security notes before you deploy or share this

- Rotate the demo passwords (`admin@2026` / `comm@2026`) — they're seeded in plaintext
  in `server/src/seed.js`, fine for local dev, not for anything reachable by others.
- `server/.env` contains your real database connection string and a JWT signing secret.
  It's already excluded from git via `.gitignore` — never commit it or paste it
  somewhere public.
- Set `NODE_ENV=production` when actually deploying, so the auth cookie gets the
  `secure` flag (HTTPS-only).

## What's next (not yet built)

- Zone-wise report tab (5 zones × 28 KPIs each — schema and seed data already support
  this; only the API routes for it exist so far, not a corresponding UI)
- Analytics chart (the radial gauge + trend view from the original dashboard)
- PDF export
- Mobile-responsive styling for the React client (the original single-file dashboard
  already has this — see `ICCC_Daily_Report_Card.html`)
- Date picker (currently hardcoded to the one seeded date, `2026-07-12`)
