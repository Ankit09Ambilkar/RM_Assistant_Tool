# FitWise: Project Log

_Formerly "MindSparks" (renamed 2026-10-04)._

A running record of every change made to this project. Each update adds a new entry at the top of the **Change Log**.

---

## Project Approach (Hackathon Prototype)

- **Goal:** a working prototype for a demo, not a production system.
- **Authentication:** Supabase Auth (email + password) when the Supabase keys are configured. Without them, the app falls back to the old demo sign-in (pick an RM, any password).
- **No scaling work:** no load balancing, caching layers, microservices or heavy infra.
- **Low friction:** one command (`./start.sh`) runs everything. The backend uses SQLite (a single file, no database server). If the backend is down, the frontend falls back to browser-only mode.
- **Priority order:** works > looks good for the demo > clean code > everything else.

**What it is:** an AI-guided structured product decision support tool for Relationship Managers (RMs), built from `Structured_Product_AI_PRD.docx`.

---

## Tech Stack

| Layer    | Choice | Why |
|----------|--------|-----|
| Frontend | React 19 + TypeScript + Vite 6 | Fast dev server, matches the PRD |
| Styling  | Tailwind CSS v4 | "Teal paper" theme (from the wallet/clock story video): textured teal paper with a dot grid, cream paper cards, dark ink, leather-brown stitched buttons. Fonts: RELIGATH Demo (display headings, local only, see below), Caveat (story handwriting + fallback), Inter (body) |
| Routing  | react-router-dom v7 | Page navigation |
| Charts   | Recharts | Payoff graph |
| Backend  | FastAPI (Python 3.13) + Uvicorn | REST API at `/api/v1`, docs at http://localhost:8000/docs |
| Database | **Supabase Postgres** when `DATABASE_URL` is set in `backend/.env`; otherwise SQLite (`backend/mindsparks.db`) | Same code for both. Tables are auto-created and seeded on first run |
| Market data | yfinance (Yahoo Finance), cached 15 min | Real prices, history and volatility for all 8 underlyings |
| Payoff + suitability | Python engine (`backend/engine.py`) | Deterministic, as the PRD requires. The browser engine is only an offline fallback |
| AI       | Live LLM, auto-detected from the key: **Groq** (`gsk_…` → `openai/gpt-oss-120b`) or **xAI Grok** (`xai-…` → `grok-4.20-0309-non-reasoning`), with a rule-based fallback | Works with no key ("AI demo mode"). Add a key and the same screens switch to Grok |
| Export   | Browser print → Save as PDF | No server-side PDF needed |

---

## How to Run

```bash
./start.sh       # from the project root: starts backend + frontend (installs everything on first run)
```

| What | URL |
|---|---|
| RM app | http://localhost:5173 |
| Admin panel | http://localhost:5173/admin |
| API docs (Swagger) | http://localhost:8000/docs |

Or run them separately in two terminals:
```bash
cd backend && .venv/bin/uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```
Vite proxies `/api/v1/*` to the backend, so the frontend only ever calls its own origin.

### Deploy on Render
1. Push to GitHub, then Render → **New → Blueprint** → pick the repo (it reads `render.yaml`).
2. Fill the secret env vars when asked: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_EMAILS` (from `backend/.env`), plus `XAI_API_KEY`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (from `frontend/.env.local`).
3. After the first deploy, in Supabase → Authentication → URL Configuration, set **Site URL** to the Render URL and add `https://<app>.onrender.com/**` to Redirect URLs (needed for password-reset links).

### Enabling Grok (optional)
1. Open `frontend/.env.local` (git-ignored) and set `XAI_API_KEY=` to either a Groq key (`gsk_…`) or an xAI key (`xai-…`).
2. That's it. No restart needed. The header badge changes from **"AI demo mode"** to **"Groq connected"** or **"Grok connected"**.

**Currently configured: a Groq key** (`openai/gpt-oss-120b`).

The key is used only by a small proxy inside the Vite dev server (`/api/grok` in `vite.config.ts`). It is never sent to the browser. Optional settings: `GROK_MODEL` and `GROK_API_URL` (see `frontend/.env.example`).

Demo tip: on the Discovery page, click **"Fill demo answers"** to jump straight to a complete profile. On the Dashboard, **"Reset demo data"** resets the backend database to the seed data.

---

## Pages & Navigation Flow

```
Login (/)  →  Dashboard (/dashboard)
                 ├── + New Client Analysis → Discovery (/discovery)
                 │                              → Client Profile (/profile/:clientId)   [editable]
                 │                                  → Configure Product (/configure/:clientId)
                 │                                      → Analysis (/analysis/:analysisId)
                 │                                          ├── Overview
                 │                                          ├── Payoff (chart + slider + 7 preset scenarios)
                 │                                          ├── Suitability (4 dimensions + reasons)
                 │                                          ├── AI Insights → Explore Alternatives (modal)
                 │                                          ├── Explain to Client (Regenerate)
                 │                                          └── Export report → Report (/report/:analysisId)
                 ├── Analyze Product → pick client → Configure Product
                 └── Recent analyses row → Analysis
Top nav: Dashboard · Clients (/clients) · Analyses (/analyses) · Reports (/reports)

Admin panel (/admin), linked from the Login page:
  Dashboard (/admin)          → KPIs, analyses per RM, suitability by dimension, RM workload
  RM Management (/admin/rms)  → search/filter, add/edit RM, RM detail drawer (clients + analyses)
  Analysis Review (/admin/reviews) → Pending/Flagged/Approved queue → review drawer → Approve / Flag with note
```
A flagged analysis shows the reviewer's note to the RM on the Analysis page. If the RM edits the terms, the review resets to Pending.

---

## Features

| Feature (PRD section) | Status | Notes |
|---------|--------|-------|
| Login (Page 1) | Done | Mock only, with inline validation |
| Dashboard (Page 2) | Done | Two primary actions, recent analyses, client picker modal |
| AI Client Discovery (Page 3) | Done | 6 fixed questions, then up to 4 adaptive "AI" follow-ups with "Why am I being asked this?" |
| Client Investment Profile (Page 3B) | Done | Every field editable. AI interpretation updates live |
| Configure Product (Page 4) | Done | All 7 fields + validation, client snapshot, AI consideration panel |
| Payoff & Scenario Simulator | Done | Deterministic engine, barrier/strike overlay, custom slider |
| Client Suitability | Done | Risk, Horizon, Loss Tolerance, Concentration, each with a reason + next step |
| AI Insights | Done | Template-based, "Why am I seeing this?" on personalised items |
| Explore Alternatives | Done | Compare current vs alternative suitability, apply in one click |
| Explain to Client | Done | Plain-language paragraph + key rows, Regenerate |
| Export Report | Done | Printable page (Save as PDF) |
| Clients / Analyses / Reports pages | Done | List views, all clickable |
| Grok API integration | Done | Discovery follow-ups, profile interpretation, AI insights and client explanation. JSON is schema-validated, with a fallback to rules on any error |
| Backend (FastAPI) | Done | RMs, clients, analyses, reviews, engine, market data, admin stats, reset |
| Real market data | Done | Market reference on Configure. Historical context on Payoff (3M–5Y, barrier/strike price levels, source + timestamp) |
| Python payoff engine | Done | Scenarios, payoff curve and suitability (with `source_rule` ids) come from the backend |
| Admin panel | Done | Dashboard, RM Management, Analysis Review |
| Multi-RM login | Done | 6 seeded RMs. Each RM sees only their own clients and analyses |

---

## Code Map

```
frontend/src/
  main.tsx, App.tsx       → entry + all routes
  store.tsx               → app state (clients, analyses) + localStorage + seed demo data
  index.css               → Tailwind theme + shared classes (card, btn-primary, input…)
  components/Layout.tsx   → top nav bar + logo
  components/ui.tsx       → StatusBadge, Why (expandable), KV row, AIBadge…
  lib/payoff.ts           → deterministic Barrier Reverse Convertible payoff engine
  lib/suitability.ts      → 4 rule-based suitability checks
  lib/discovery.ts        → question engine (fixed + adaptive), profile builder, AI interpretation
  lib/insights.ts         → AI insights, considerations, client explanation (demo mode)
  lib/market.ts           → supported underlyings, product types, tenors
  lib/grok.ts             → Grok client (calls /api/grok), useAI hook (cache + fallback), status
  lib/ai.ts               → Grok prompts + JSON validation for the 4 AI features
  lib/useAnalysisAI.ts    → shared insights/explanation hooks (Analysis page + Report)
  vite.config.ts          → grok-proxy plugin: keeps the API key server-side
  pages/*.tsx             → one file per page
```

```
backend/
  main.py        → FastAPI app + all /api/v1 routes (pydantic validation)
  engine.py      → Python payoff + suitability engine (mirrors the rules below)
  market.py      → underlyings + yfinance fetch with a 15-min cache
  db.py          → SQLite schema + seed data (6 RMs, 8 clients, 8 analyses)
  requirements.txt
frontend/src/
  lib/api.ts             → backend client, useEngine (Python engine + browser fallback), useMarket
  components/MarketCard.tsx → real market chart card
  pages/admin/*          → AdminLayout, AdminDashboard, AdminRMs, AdminReviews
start.sh                 → one-command launcher
```

### API (all under `/api/v1`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Backend up? |
| POST | `/engine/analyze` | Profile + product → scenarios, curve, suitability, concerns |
| GET | `/market/underlyings` · `/market/{ticker}?period=1y` | Supported list · real price data |
| GET/POST/PUT | `/rms`, `/rms/{id}` | RM CRUD |
| GET/POST/PUT | `/clients?rm_id=`, `/clients/{id}` | Clients |
| GET/POST/PUT | `/analyses?rm_id=&include_results=`, `/analyses/{id}` | Analyses (editing resets the review) |
| PUT | `/analyses/{id}/review` | Approve / Flag / Pending + note |
| GET | `/admin/stats` | Admin dashboard numbers |
| POST | `/admin/reset` | Reset DB to seed data |

### Seeded RMs
| RM | Branch | Region | Status | Clients |
|---|---|---|---|---|
| Priya Sharma (Senior RM) | Mumbai – BKC | West | Active | John Mathew, Sarah Khan |
| Arjun Mehta | New Delhi – Connaught Place | North | Active | Neha Kapoor |
| Kavya Nair (Senior RM) | Bengaluru – MG Road | South | Active | Rajesh Iyer, Fatima Sheikh |
| Rohan Desai (Associate RM) | Pune – Koregaon Park | West | Active | Amit Joshi |
| Ananya Gupta | Kolkata – Park Street | East | Active | Sunita Banerjee |
| Vikram Singh | Hyderabad – Banjara Hills | South | On Leave | Dev Malhotra |

Each RM also has an email (`firstname.lastname@mindsparks.demo`), a phone number, an employee ID, a joining date, AUM, certifications and notes.

### Calculation rules (for judges / Q&A)
- **Payoff:** coupon = notional × coupon% × tenor/12, always paid. If the final level ≥ barrier, the full notional comes back. Otherwise the client gets notional × final/strike.
- **Risk appetite:** product risk score is 1 for an index or 2 for a stock, +1 if the barrier ≥ 80%. It's compared with the client (Conservative 1 / Moderate 2 / Aggressive 3).
- **Horizon:** tenor must be ≤ the client's horizon. A warning appears if liquidity need is High and tenor > 12 months.
- **Loss tolerance:** loss in a stress scenario (stock −40%, index −25%) vs the client's max loss. Above the max is a mismatch, any loss within the max is a warning, and no loss is a match.
- **Concentration:** same-sector exposure ≥ 50% is a mismatch, ≥ 25% is a warning. Indices always match.

---

### How the AI stays safe (PRD §7)
- Grok **never does maths**. It receives pre-computed scenarios and suitability results and only explains them.
- In Discovery, Grok **chooses and phrases** the next question from an allowed list of categories. Answer options stay fixed, so profile fields always map to real answers.
- Every response must be JSON that passes validation (`lib/ai.ts`). Otherwise the rule-based version is shown with a small warning.
- Badges show where each piece of text came from: **GROK** or **AI · DEMO**.

## Change Log

### 2026-10-04: Public cron endpoint
- `GET/POST/HEAD /api/v1/cron` takes no auth, by request (zero friction). It runs `SELECT 1` on the database and loads the ML model, then returns `{ok, database, model, ms, time}`. It is read-only and returns no data, so it is safe to leave public. Use: an external cron calls it every 10–14 min to keep the free Render service awake and the Supabase project active. Test added (68/68).

### 2026-10-04: Hackathon deck
- Built `~/Desktop/FitWise_TeamSynergia_Hackathon.pptx` on the MindSpark'26 template (7 slides: title, solution and unique idea, technical approach, architecture, feasibility, impact, references). The unique idea: fit-first, not coupon-first. Rules decide, ML estimates loss likelihood, AI only explains, and the manager reviews every analysis. The deck is not in the repo.

### 2026-10-04: README rewritten
- `Readme.md` (it previously said only "Created Readme") now holds full docs: features, flow/architecture, tech stack, structure, local run, env vars, roles, pages, every API endpoint with its access level, calculation rules, ML model and metrics, AI safety, testing, Render deploy, dependencies and limitations. Manager passwords are not included. `backend/README.md` intro updated (it used to say SQLite only).

### 2026-10-04: Live on Render ✅
- Live at **https://fitwise-lud9.onrender.com** (Render free web service, Singapore). Supabase Site URL is set to it; the redirect URLs are the live site plus `http://localhost:5173/**`.
- Live check passed 24/24: pages and deep links, font, Supabase DB reads and writes, RM and admin sign-in, 401/403 rules, RM data scoping, payoff engine, yfinance from Render, ML model, and the Groq AI proxy (blocked without sign-in).

### 2026-10-04: RELIGATH font deployed
- The live Render site showed headings in the Caveat fallback because `RELIGATH-Demo.otf` was git-ignored. At the user's choice it is now committed so the deployed site matches localhost. The demo licence is personal use only; this is a non-commercial hackathon demo. Buy a licence before any commercial use.

### 2026-10-04: Render deployment ready + full connection check
- **Checked live (19/19 pass):** frontend → backend proxy, Supabase Postgres, Supabase Auth sign-in for an RM and the admin, wrong-password rejection, `/me` roles, 401 without a token, 403 for RMs on admin routes, RM-scoped data, DB writes (create/update client + analysis, admin review; test rows removed), payoff engine, yfinance, ML breach risk, live Groq call. `test_api.py`: 67/67.
- **Production fix:** the `/api/v1` and Groq proxies only existed in the Vite dev server, so a deployed build would have no API and no AI. Now:
  - `backend/ai.py` + `/api/grok`, `/api/grok/status` in FastAPI (same behaviour as the dev proxy). Chat requires sign-in so the key can't be abused; `grok.ts` sends the Supabase token.
  - FastAPI serves `frontend/dist` with an SPA fallback (deep links like `/dashboard` work). Missing files return 404, and unknown `/api/*` routes stay JSON 404s.
- **Deploy config:** `render.yaml` (one Python web service that builds the frontend too, with health check `/api/v1/health`), `backend/.python-version` (3.13.9), and pinned `requirements.txt` (numpy/pandas/scikit-learn must match the trained `breach_model.joblib`).
- Verified a production run locally (`uvicorn` on one port serving the built app): sign-in, session restore, AI and data calls work in the browser with no console errors.

### 2026-10-04: Wordmark font → Gonzaga style
- Reference font **Gonzaga** (Fontfabric) is commercial; the free copies online are personal-use or trial builds from unofficial sites, so it is not bundled. The wordmark now uses **Bitter ExtraBold** (Google Fonts, free), the closest Clarendon-style heavy slab-serif, in mixed case ("FitWise").
- `--font-brand: "Gonzaga", "Bitter", …`: if a licensed Gonzaga file is added later (local `@font-face`, like RELIGATH), it takes over automatically. Colour kept as ink (not the reference's pink).

### 2026-10-04: Wordmark font
- The "FitWise" name in the logo now uses **Space Grotesk** bold (closest free match to the supplied "Build Fast on Groq" reference), in normal case, via a `--font-brand` theme token / `font-brand` class. Previously it used RELIGATH, which has no lowercase, so it rendered as "FITWISE". Headings elsewhere are unchanged.

### 2026-10-04: Renamed to FitWise
- The product is now **FitWise** (pairs with the tagline "Invest in what fits"): logo wordmark, browser title, landing copy, footer ©, manager sign-in, logo alt text, drawn-note serial (FW), API title and backend README.
- Kept on purpose: demo login emails `…@mindsparks.demo` and their password (real Supabase accounts; renaming would break sign-in), the project folder, and internal storage keys.

### 2026-10-04: New logo
- Recreated the supplied logo mark (teal blade with a light left edge, crossed by a leather-brown wave with a lighter underside and an upward hook) as a crisp, transparent SVG: `components/LogoMark.tsx`.
- `Logo` now shows the mark + "MindSparks" everywhere (RM and admin headers, landing nav, register, reset password, manager sign-in, report). On the leather footer (`light` variant) the mark sits on a cream tile so the brown wave stays visible.
- Browser tab icon: `public/favicon.svg`. The placeholder "YOUR BRAND / TAGLINE" from the image was not used; the name stays MindSparks.

### 2026-10-04: Real (non-demo) admin account
- Added a personal admin-panel login for the project owner (real inbox, so "Forgot password" works). The email is listed only in `backend/.env` → `ADMIN_EMAILS` (kept out of the public repo). The password was randomly generated, shown once, and is not stored anywhere.
- The demo manager (`manager@mindsparks.demo`) is kept as well, as chosen. Both verified live: sign in → admin → admin stats 200.
- `seed_auth.py --manager [email]` now creates or resets an admin login for any email (default: the demo manager). Add the email to `ADMIN_EMAILS` too.

### 2026-10-04: AI text font + landing nav
- **Explain to Client:** the AI-generated paragraph now uses the body font (Inter, normal case) instead of the all-caps RELIGATH display font, so it's readable like the rest of the page text. Other AI text (insights, profile interpretation) already used the body font.
- **Landing nav:** removed the "Register" button; only Sign In remains. Registration is still available via "Register as RM" in the hero and "Register here" in the sign-in modal.

### 2026-10-04: ML barrier-breach risk model
- **What it answers:** the chance the underlying **closes below the barrier at maturity**. That's when this app's payoff engine applies a capital loss, so it's consistent with the payoff numbers.
- **Data:** 13 years of daily prices (yfinance) for **35 assets**: the app's 8 underlyings plus US and Indian large caps and indices. **~600k labelled examples**: weekly start dates × 8 barriers (50–90%) × 4 tenors (6–24 months). Labels are real outcomes.
- **Features** (`ml/features.py`, shared by training and serving): volatility (1/3/12 months), downside volatility, momentum, distance below the 52-week high, worst fall in the past year, skew, kurtosis, volatility trend, barrier, tenor, barrier distance in volatility units, index flag. Implied volatility is not used (no free history).
- **Model** (`ml/model.py`): scikit-learn HistGradientBoosting with **monotonic sanity constraints** (higher barrier / volatility / deeper fall can never lower risk) + **Platt calibration**. Explanations = probability change when each factor is reset to its typical value.
- **Validation** (`ml/train_breach_model.py`): strictly out-of-time. Train on products maturing before 2022, test on products starting 2022+ (195k examples). **AUC 0.756 vs 0.735** for a volatility-only lognormal baseline, **Brier 0.037 vs 0.073**, well calibrated up to ~20%. The final model is refit on all data. Metrics and limitations are in `ml/model_card.json`.
- **Known limitation:** survivorship bias (the universe is today's large caps), so it may understate risk for very volatile single stocks. The UI always shows the volatility-only estimate next to it.
- **Serving:** `POST /api/v1/ml/breach-risk` (signed-in RMs) scores live with 2-year daily data (`market.py`'s 2y view switched from weekly to daily). Terms outside 50–90% / 6–24 months are clamped and flagged.
- **UI:** "Barrier-breach risk (ML)" card on Analysis → Overview: probability, the volatility-only estimate, top factors (↑/↓ pts) and a one-line back-test summary.
- `ml/breach_model.joblib` (1.3 MB) is committed so nobody needs to retrain. To retrain: `cd backend && .venv/bin/python -m ml.train_breach_model` (~1 min). Added `scikit-learn==1.9.1`, `joblib`.
- **Tests:** `test_api.py` 67/67 (+ offline model checks: valid probabilities, monotonic sanity, beats baseline, explanations).

### 2026-10-04: Admin panel = single manager account
- New manager login **`manager@mindsparks.demo`** (Supabase user with `app_metadata.role = admin`). Its password was randomly generated by `seed_auth.py --manager`, shown once, and is **not stored in the repo**. Re-run that command to reset it.
- `ADMIN_EMAILS=manager@mindsparks.demo` (backend `.env` + code default). **Priya is now a normal RM**: admin stats, RM list and reviews return 403 for her.
- `/admin` shows a **Manager sign in** page (`pages/admin/AdminLogin.tsx`) to anyone who isn't the signed-in manager. RM credentials there are refused and signed out ("Only the manager account can open the admin panel"). The manager has no RM workspace: RM routes redirect to `/admin`. Signing in as the manager on the landing page also goes to `/admin`.
- Admin header: "Manager" + **Log out** (replaces "Exit to RM app"). The RM header's Admin link is removed.
- Registering an RM with the manager's email is refused (409).
- Verified live (API + browser): Priya → 403 on admin endpoints, own 3 clients still visible, `/admin` shows manager sign-in; manager → admin dashboard, RM routes redirect to `/admin`, logout → manager sign-in. `test_api.py` 60/60.

### 2026-10-04: Removed more circled UI (user screenshots)
- Discovery: removed the "Fill demo answers (for presentations)" link and its handler.
- Register: removed the Designation field (new RMs are saved as "Relationship Manager"; admins can change it in RM Management). Shortened the certifications label so the grid aligns. The old "Prototype note… not sent or stored" text was already gone since real auth; the screenshot showed a stale tab.
- Admin → Analysis Review drawer: the heading is now just "Suitability" (dropped "(Python engine)").

### 2026-10-04: Authentication live ✅
- The secret key had been pasted across two lines in `backend/.env`. It's joined back into one line and verified against the Supabase admin API.
- `seed_auth.py` created 7 logins (6 demo RMs + the user-registered RM `name@gmail.com`), all with password **`MindSparks@2026`**. Admin: `priya.sharma@mindsparks.demo`.
- Fixed: an admin's RM workspace loaded *everyone's* clients (admins may read all). The store now always requests the signed-in RM's own data; the admin panel still sees everything.
- **Verified end to end with real Supabase tokens:** wrong password rejected; Priya → own 3 clients + Admin link + admin panel; Arjun → only his 1 client (even when asking for another RM's), 403 on admin stats / RM list / reviews, cannot edit Priya's client, `/admin` shows "Admins only"; logout → protected pages redirect to `/`; garbage or missing token → 401. Registration → login works → empty workspace; duplicate → 409 (test account deleted afterwards). Console clean. `test_api.py` 60/60.

### 2026-10-04: Real authentication with Supabase Auth
- **Frontend** (`@supabase/supabase-js`, `lib/supabase.ts`): email + password sign-in, real logout, sessions persisted and auto-refreshed, "Forgot password?" (email link → new `/reset-password` page). Every API call sends `Authorization: Bearer <token>`. RM app routes require sign-in (`RequireAuth`); `/admin` requires an admin (`RequireAdmin`, "Admins only" page). The header shows an **Admin** link for admins only. "Reset demo data" is admin-only. RM pills removed from sign-in (demo mode only).
- **Backend** (`auth.py`, PyJWT): verifies Supabase tokens locally against the project's JWKS (ES256, no secret needed). The user maps to an RM by email; admins come from `ADMIN_EMAILS` (default `priya.sharma@mindsparks.demo`). Inactive RMs are blocked.
- **Access rules:** `/health` public; `/me` signed in; `/auth/register` public; engine/market signed in; clients/analyses **own only** (admins: all); reviews, RM list/create/edit, admin stats, reset **admin only**.
- **Registration:** `POST /api/v1/auth/register` creates a confirmed Supabase login (server-side, secret key) + the RM profile in one step, then the frontend signs in. If an admin pre-added the RM, the login is linked to that profile. Supabase stores the passwords (hashed); we never do.
- `backend/seed_auth.py`: creates demo logins for every RM (password `MindSparks@2026`, `--reset` to reset).
- **Fallbacks:** no Supabase keys → demo sign-in as before. `MINDSPARKS_AUTH=off` disables backend auth (tests do this).
- **Tests:** `test_api.py` is now 60 checks (+ registration, 401 without/garbage token, RM vs admin access rules). All pass.
- **Verified live:** all data endpoints return 401 without sign-in; protected pages redirect to `/`; a wrong password is rejected by Supabase.
- ~~Pending: secret key~~ → done (see next entry).

### 2026-10-04: Removed circled text & buttons (user screenshots)
- Landing footer: "· Hackathon prototype" (only © 2026 MindSparks remains).
- Sign-in modal: "Prototype: pick any demo RM · any password".
- Dashboard hero: the "New client analysis" button and "← start here" (the same action is still on the card below).
- App header: the "Groq connected / AI demo mode" badge.
- Market card (Configure + Payoff): the "Historical · Yahoo Finance via yfinance · last close … Past prices do not predict future outcomes." line.
- Analysis page: the "⚙ Calculated by Python engine (FastAPI)" / "Backend offline: calculated in browser" note.
- Explain to Client: "All figures come from the payoff engine. Not a guarantee of future returns."
- Report: "AI text: generated by Grok…" and "Scenarios are illustrative… responsible for the final suitability assessment."
- Reports page: the subtitle "Open a printable client report…".
- The landing footer still carries the data source + "not investment advice" note. Verified in the browser that none of the removed strings appear on any page (including the Payoff / Explain tabs and the sign-in modal).

### 2026-10-04: Full health check (Supabase connected)
- Frontend 200. Backend health → `"database": "postgres"` (directly and via the Vite proxy). RMs/clients/analyses/admin stats/market data/engine all 200. Groq configured. `test_api.py` 42/42.
- Fixed a React warning on every page: `ScrollToTop`'s effect returned `window.scrollTo(...)`, which newer Chrome makes return a Promise, so React complained the effect returned a non-function. It now uses a braced body. The fresh-tab console is clean across landing, dashboard, analysis, admin and register.

### 2026-10-04: Connected to Supabase ✅
- `backend/.env` now uses the **Session pooler** host `aws-0-ap-northeast-1.pooler.supabase.com:5432` with user `postgres.fkmpasdkasxkdqesgtef`. The project is in **ap-northeast-1 (Tokyo)**. The direct `db.*.supabase.co` host is IPv6-only and unreachable from this Mac.
- On first connection the backend created `rms`, `clients` and `analyses` in Supabase and seeded the demo data (6 RMs, 8 clients, 8 analyses). `/api/v1/health` → `"database": "postgres"`.
- Verified: RLS enabled on all 3 tables; create → read → delete round-trip through the API; the dashboard loads from Supabase with no "Backend offline" badge.
- Latency (Tokyo round trips): ~0.6–0.9 s for most API calls, ~2.3 s for admin stats. Fine for a demo.
- To go back to local SQLite, empty `DATABASE_URL` in `backend/.env` (the backend restarts automatically).

### 2026-10-04: Supabase (PostgreSQL) support
- `backend/db.py` now picks the database from `DATABASE_URL` (loaded from `backend/.env` via python-dotenv): **Supabase/Postgres** if set, the **local SQLite** file if empty. A small adapter keeps the existing `with db.connect() as c: c.execute("... ?", ...)` code unchanged (qmark→%s, DictCursor rows, a pooled connection of max 5, SSL required for Supabase).
- Postgres schema: same tables, `aum_cr` as `DOUBLE PRECISION`. **Row Level Security is enabled** on all three tables so Supabase's public REST API can't read them (the backend connects as the owner and isn't affected).
- `/api/v1/health` now reports `"database": "postgres" | "sqlite"`.
- Added `psycopg2-binary` and `python-dotenv` to `requirements.txt` (`-binary` avoids needing pg_config to compile).
- `backend/.env` (git-ignored) holds the connection string. `backend/.env.example` is the committed template. `start.sh` runs uvicorn with `--reload-include .env`, so saving `.env` restarts the backend.
- **Networking:** the direct host `db.fkmpasdkasxkdqesgtef.supabase.co` is IPv6-only and this Mac has no IPv6 route, so use the **Session pooler** connection string (IPv4).
- **Tested:** all 42 `test_api.py` checks pass on SQLite **and** on a real local PostgreSQL 17 (throwaway instance, deleted afterwards). Tests always use a throwaway SQLite DB, never Supabase.

### 2026-10-03: RM registration page
- New `/register` page (`pages/Register.tsx`, paper style): full name, work email, phone (optional), employee ID, designation, branch, region, certifications (optional), password + confirm, "details are correct" checkbox.
- Inline validation mirrors the backend rules (name 2–100 with letters, valid email, phone pattern, employee ID + branch required, password ≥ 8 and must match). Backend errors are shown inline (e.g. "An RM with this email already exists").
- On success: creates the RM via `POST /api/v1/rms` (status Active, AUM 0, notes "Self-registered"), signs them in and opens the Dashboard. The new RM appears in Admin → RM Management.
- **Password is never sent or stored**, because prototype sign-in is mocked; storing it without hashing would be worse than not storing it. This is stated on the form.
- Entry points: **Register** in the landing nav, **Register as RM** next to Get Started, and "New RM? Register here" in the sign-in modal.
- App-wide: pages now open scrolled to the top (`ScrollToTop` in `App.tsx`). Previously `/register` opened mid-page.
- Tested: empty and invalid submissions, duplicate email, valid registration → dashboard as the new RM. The test RM was removed from the DB afterwards.

### 2026-10-03: Footer: no Sign In, more compact
- Removed the footer's "Get started" column (Sign In button + demo hint). Sign-in is still in the top nav and the Get Started CTA.
- Compacted the footer: 3 columns (brand + tagline, 2×2 links, one-paragraph disclaimer), tighter padding. It's now ~161 px tall instead of ~240 px on desktop.

### 2026-10-03: Landing-page footer
- Added a leather-band footer with a dashed stitched edge (matches the wallet). Columns: **brand** (light logo + handwritten "Invest in what fits." + one-liner), **Explore** (About Us / Features / Benefits / FAQ anchors), **Get started** (Sign In opens the sign-in modal, demo hint), **Data & disclaimer** (Yahoo Finance via yfinance; scenarios are illustrative; not investment advice; the RM decides). Bottom bar: © year · Hackathon prototype · Back to top. No admin link.
- `Logo` gained a working `light` variant (cream tile + cream wordmark) for dark backgrounds.

### 2026-10-03: FAQ replaced
- The landing-page FAQ now has the 5 user-provided Q&As: what the platform does, who it's for, real market data, how the suitability check works, and whether the AI decides investments.

### 2026-10-03: Removed "See how it works" button
- The landing hero now has a single CTA: **Get Started**. Features are still reachable from the nav.

### 2026-10-03: Removed admin link from landing page
- Removed the "Admin panel →" link under the FAQ. There's no admin link on the public landing page anymore; the admin panel is still reachable directly at `/admin`.

### 2026-10-03: Heading font switched to RELIGATH Demo
- `RELIGATH-Demo.otf` (Enxyclo Studio) is now the display/heading font (`--font-serif`) across the app: page titles, logo, KPI numbers, landing headline.
- **License: free for PERSONAL use only, no commercial use.** Fine for this hackathon prototype, but the file must not be redistributed, so it lives at `frontend/public/fonts/RELIGATH-Demo.otf` and is **git-ignored** (never pushed to the public repo). Anyone cloning the repo gets the Caveat fallback automatically. **Buy a commercial license (enxyclo.gumroad.com) before any commercial use.**
- The font has no ₹ / ← / →, so those characters fall back to Caveat per glyph.
- The story's hand-drawn notes ("Coupon 10% p.a." etc.) stay in Caveat. RELIGATH is all-caps and too wide for the scribbled circles.
- RELIGATH has one weight: faux-bold is disabled (`font-synthesis: none`), and heading sizes were reduced for the wider caps (landing h1, dashboard greeting, analysis stat values).

### 2026-10-03: Whole-app retheme: "teal paper" story style (AAE.mp4 reference)
- Reference: a short motion-graphics story (wallet → notes rise → hand-drawn "Salary 200000" → "It's not about money" → clock "It's all about time") on teal grungy paper with a dot grid and handwritten text.
- **Theme (`index.css`):** teal paper body (grain via SVG noise, dot grid, vignette), cream paper cards with soft drop shadows, ink text, leather-brown accent with a stitched edge (`stitch` utility), Caveat handwritten headings. Tokens remapped, so every page (RM app + admin) switched. Charts, tooltips and status colours moved to an ink-on-paper palette.
- **Landing hero:** new `components/story/Story.tsx` + `story.css`, pure HTML/CSS/SVG on a 10 s seamless loop with a panning "camera". Wallet → notes rise → circled **"Coupon 10% p.a."** → dashed arrow → note + **"It's not about returns"** → arrow → ticking brass clock + **"It's about time & fit"** (story adapted to the product, as chosen). Handwriting writes on, the scribble circle and arrows draw themselves. Reduced motion shows a finished frame. Headline: "Invest in what *fits*, not just what pays."
- **Banknotes are stylised generic ₹ notes**, not reproductions of real RBI notes.
- **Dashboard:** paper greeting card with handwritten name underline, "← start here", and a small wallet-with-notes doodle.
- **Removed:** the dark-blue theme, the 3D coin (`components/coin/`), the CSS `HeroScene`, and the `three` / `@react-three/*` dependencies (bundle is smaller).
- **Verified:** landing (all story beats, text inside the frame), mobile (story scales to fit), Dashboard, Analysis + Payoff charts, Admin. Zero console errors across all pages in a fresh tab. Build passes.

### 2026-10-03: Landing hero: real 3D tumbling ₹ coin (Three.js / React Three Fiber)
- Added `three`, `@react-three/fiber@9`, `@react-three/drei@10`. New `components/coin/CoinScene.tsx` is lazy-loaded only on the landing page (its own ~283 KB gzip chunk). The CSS scene shows while it loads.
- **Motion measured from the reference video** (frames every 0.33 s): the symbol is upright about every 1.0 s → **5 face-axis turns / 10 s** at constant speed. The coin is widest around 0 s / 5.3 s and narrowest around 2.3 s / 8.3 s → **2 Y-axis swings / 10 s** between near face-on (−17°) and almost edge-on (−74°). It never flips round (no back face is ever visible in the video). Plus a lean (−7° ± 2°), a backward tilt (6° ± 2°) and a tiny elliptical drift. Everything divides the 10 s loop → seamless.
- **Coin:** lathe-built rim with bevel and raised lip, frosted speckled face (canvas texture + glitter), PBR metal. **₹ is real extruded, bevelled geometry** from the Inter Bold glyph (SIL OFL), on both faces, rotating with the coin.
- **Lighting:** a bright opening as the main back/right light, a front-right key (so the face falls into navy shadow as it turns away), cyan and warm-pink rims, and an Environment of Lightformers for reflections that move across the metal.
- **Floor:** glossy blurred reflector ledge with the coin's reflection, plus a contact shadow.
- **Room:** unlit hand-shaded gradients (back wall, pillar, block, ledge face, floor) keep the reference's saturated royal blue.
- **Landing content per reference:** "Empowering Your *Financial* Future", Get Started, nav (About Us, Features, Benefits, FAQ, Sign In). Added small Benefits/FAQ sections so the nav links work. The admin link moved to the FAQ section.
- **Responsive:** tablet and phone layouts move the coin below the text and push the light opening right so the heading stays readable.
- **Accessibility:** reduced motion holds a still pose (₹ upright, coin turned ~37°).
- Dev-only tuning hook: `window.__COIN_T = <seconds>` freezes the loop at that moment.

### 2026-10-03: Invalid-input audit: backend + frontend hardened
**Backend (19 issues found by probing every endpoint, all fixed in `backend/main.py`):**
- Unknown tickers no longer fall back to NVIDIA silently. They return 422 (body) or 404 (`/market/{ticker}`).
- Product: only "Barrier Reverse Convertible" is accepted, barrier ≤ strike is enforced on every endpoint (analyze, create, update), and amounts are capped at ₹10,000 Cr.
- RMs: name required (1–100 chars), valid email (stored lowercase, duplicates case-insensitive → 409), phone pattern, AUM ≥ 0, joined date must be YYYY-MM-DD and not in the future. Changing an RM's email to an existing one now returns 409 instead of crashing with a 500.
- Clients: name required, the RM must exist (404).
- Reviews: flagging requires a note.
- New `backend/test_api.py`: 42 good/bad-input checks against a throwaway DB → **all pass**. Run: `cd backend && .venv/bin/python test_api.py`.

**Frontend:**
- Backend validation errors are shown as readable sentences (not raw JSON).
- Discovery: name (2–100 chars, must contain letters), amount (₹1,000–₹10,000 Cr), percentages (0–100) are validated inline, and Continue is disabled until valid.
- Profile: inline errors for amount/max loss/sector exposure, an empty field no longer silently becomes 0, and save errors are shown (previously swallowed).
- Configure + Explore Alternatives share one `lib/validate.ts`. Alternatives previously accepted any value and could "apply" terms the server rejected.
- Store: `updateClient` / `updateAnalysis` now wait for the backend and surface errors, so the screen never shows rejected data.
- Fixed a stale-state bug in the RM, Profile, Configure and Alternatives forms (quick successive edits could drop a field).
- Replaced `alert()` popups with inline error messages (Discovery has a "Try again" option).
- RM form validates phone, AUM, future dates and email before calling the API.

**Verified:** every page loads in a fresh tab with **zero console errors**. Frontend ↔ backend calls (RMs, clients, analyses, engine, market data, admin stats, Groq) all return 200. Bad input was tested on every form in the browser. The demo DB was reset afterwards.

### 2026-10-03: UI redesign: dark royal-blue theme with a 3D coin hero (video reference)
- Reference: a fintech hero video (glass pill nav, bold headline with one gradient word, violet glowing CTA, a glossy coin turning in a beam of light). Used for style only; no brand names copied.
- `index.css`: tokens remapped to dark (`navy` = text, `cream` = background, `white` = glass surface), so every page switched at once. Added `bg-accent`, `glass`, `text-gradient` utilities. Print still renders light.
- New `components/HeroScene.tsx` + `hero-scene.css`: a CSS-only 3D coin (₹, 16 edge layers, glitter face) that slowly turns and floats in front of a glowing doorway with a lit ledge. Static under reduced motion. Replaces `WaveLines` (deleted).
- Login: hero layout from the reference ("Structured Products, *Clearly* Explained", Get Started, bottom-left blurb, feature cards). Sign-in moved into a glass pop-up with RM pills.
- App + admin headers are floating glass pills with gradient active tabs. The Dashboard hero uses the coin scene.
- Charts and tooltips recoloured for dark (shared `lib/chart.ts`). Fixed dark-on-dark text in the AI interpretation card and scenario cards.
- AI safety: live Groq output used "He". Gendered pronouns are now rejected in code (`neutral()` in `lib/grok.ts`), with one automatic retry and then the rule-based fallback.
- Verified in the browser: landing (coin animating, no overlap at medium widths), sign-in, Dashboard, Payoff charts, Profile, Admin.

### 2026-10-03: Frontend + remaining files pushed to GitHub
- Pushed `frontend/`, `start.sh`, `PROJECT_LOG.md` and `.claude/launch.json` to `shri-i/CodeX_Fintech` (`main`, commit `6756f78`).
- Before pushing, scanned all staged files for API keys: none found. `frontend/.env.local` (Groq key), `node_modules`, `.venv` and `*.db` stay local via `.gitignore`.
- **New teammates:** clone, copy `frontend/.env.example` → `frontend/.env.local`, add a key (optional), run `./start.sh`.

### 2026-10-03: New UI theme + animated wave lines (Pareto-style reference)
- New palette and fonts in `index.css` (token names kept, so every page updated): deep green ink, sage surface, mint CTA, Newsreader serif, IBM Plex Mono labels. Pill buttons, glassy rounded cards.
- New `components/WaveLines.tsx`: a canvas animation of ~64 lines per side that converge on a focus element and ripple like a wave. It respects reduced motion (static frame), is DPR-aware, and on narrow screens the lines flow behind the card.
- Login is now a landing page in the reference layout: nav, ENTER APP pill, a glass login card (with the RM's clients/AUM/region), RM pills, a serif headline and mono subtext, with the wave converging on the card.
- Light translucent app header with mono pill nav. Dashboard has a wave hero behind the greeting. The admin header is deep green with mint accents.
- Serif for headline numbers (admin KPIs, analysis stats), pill-shaped tab bars, chart colours updated.
- Verified on desktop and mobile (375px); the animation is confirmed running.

### 2026-10-03: Fix: Dashboard / Analyses / Reports stuck on "Loading…"
- Cause: logging in as the RM already saved in the browser (e.g. Priya) set `loading = true`, but the RM id didn't change, so the data reload that clears the flag never ran.
- Fix (`frontend/src/store.tsx` → `login`): same RM → reload data directly. A different RM switches as before.
- Verified: logging in as Priya again now shows the Dashboard table, Analyses and Reports.

### 2026-10-03: Git repo + backend pushed to GitHub
- Initialized git at the project root (branch `main`, remote `git@github.com:shri-i/CodeX_Fintech.git`).
- Added a root `.gitignore` (keeps out `.env.local` with the API key, `node_modules`, `.venv`, `*.db`, `dist`).
- Pushed **backend only** (`backend/` + `.gitignore`, plus a new `backend/README.md`), rebased on the repo's existing `Readme.md` commit.
- Not pushed yet: `frontend/`, `start.sh`, `PROJECT_LOG.md`, `.claude/`.

### 2026-10-03: FastAPI backend, real market data, Python engine, admin panel
- Added `backend/`: FastAPI + SQLite + yfinance. It runs on :8000, and Vite proxies `/api/v1`.
- Ported the payoff and suitability engines to Python (`engine.py`). Its results match the browser engine exactly (John: 2 concerns, Sarah: 0). The Analysis page, Explore Alternatives and Admin Review all use it.
- Added real market data from Yahoo Finance via yfinance (e.g. NVDA $233.95, last close 2026-10-02): a market reference card on Configure, and historical context on the Payoff tab with the barrier/strike levels shown as prices.
- Moved clients and analyses to the backend. The store now loads per logged-in RM and falls back to localStorage if the backend is down (tested by stopping the backend).
- The Login page now offers the 6 seeded RMs, and the header shows the RM's designation and branch.
- Admin panel (`/admin`): Dashboard (KPIs + 2 charts + workload table), RM Management (search, filters, add/edit, detail drawer), Analysis Review (queue, review drawer with Python suitability + scenarios, Approve/Flag with note).
- The review status is visible to RMs (an Analyses table column, plus the flag note on the Analysis page). Editing terms resets the review to Pending.
- Added `start.sh` (one command for everything) and a backend entry in `.claude/launch.json`.
- Tested end-to-end: RM login scoping, new client → analysis saved to the DB → appears in the admin queue, flagging shows on the RM side, adding an RM, offline fallback. The demo DB was reset afterwards.

### 2026-10-03: Live AI switched on (Groq key)
- The key provided is a **Groq** key (`gsk_`), not an xAI Grok key, so xAI rejected it. The proxy now detects the provider from the key prefix and routes to Groq (`openai/gpt-oss-120b`) or xAI automatically.
- Badges renamed: **AI · LIVE** / **AI · DEMO**. The header shows "Groq connected".
- Prompt fixes after reviewing live output: the exact payoff rules are now passed to the AI (the coupon is always paid), and gendered pronouns for clients are banned.
- Tested live: adaptive discovery questions, profile interpretation, AI insights and client explanation all generate and pass validation.

### 2026-10-03: Grok API integrated
- Added the `grok-proxy` Vite plugin (`/api/grok`, `/api/grok/status`). It reads `XAI_API_KEY` from `frontend/.env.local` on every request, so no restart is needed.
- Grok now powers: adaptive discovery follow-up questions, the profile AI interpretation (with Regenerate), AI insights (with Regenerate) and the Explain to Client paragraph. The report uses the same cached outputs.
- Everything falls back to the existing rule-based logic when there's no key or on any API/validation error.
- Added a "Grok connected / AI demo mode" badge in the header and GROK / AI · DEMO source badges.
- Fixed: pressing Back in Discovery now pre-fills the previous answer.
- Tested: demo mode end-to-end, and the proxy reaching xAI (a fake key is correctly rejected with an "Incorrect API key" error).

### 2026-10-03: All UI pages built and connected (from the PRD)
- Created the `frontend/` app (React + TS + Vite + Tailwind + Recharts + React Router).
- Built all pages: Login, Dashboard, Discovery, Client Profile, Configure, Analysis (5 tabs), Explore Alternatives, Report, Clients, Analyses, Reports.
- Added the deterministic payoff engine, the 4-rule suitability engine and the template-based AI layer.
- Seeded demo data (John Mathew / NVDA with 2 concerns, Sarah Khan / AAPL complete), matching the PRD's demo scenario.
- Verified the PRD demo outcome: Loss Tolerance MISMATCH + Concentration WARNING. Explore Alternatives (S&P 500, 60% barrier) clears both.
- Added a "Fill demo answers" shortcut on Discovery and "Reset demo data" on the Dashboard.
- Added `.claude/launch.json` for the dev server.

### 2026-10-03: Project initialized
- Created `PROJECT_LOG.md` to track all project updates.
- Set ground rules: prototype only, no auth, no scaling concerns.
