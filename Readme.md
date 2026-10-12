# FitWise: Invest in what fits, not just what pays

FitWise is a decision-support platform for bank **Relationship Managers (RMs)** who sell **structured products**. It puts AI-guided client discovery, payoff analysis on real market data, rule-based suitability checks and an ML barrier-breach risk model into one guided workspace. A **manager** reviews every analysis in a separate admin panel.

**Live:** https://fitwise-lud9.onrender.com · **API docs:** https://fitwise-lud9.onrender.com/docs

> The free Render plan sleeps after about 15 idle minutes. A cron job calling `https://fitwise-lud9.onrender.com/api/v1/cron` every 10–14 minutes keeps it awake (and keeps the free Supabase project from pausing).

---

## Contents
- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Run locally](#run-locally)
- [Environment variables](#environment-variables)
- [Accounts and roles](#accounts-and-roles)
- [Pages](#pages)
- [API endpoints](#api-endpoints)
- [Calculation rules](#calculation-rules)
- [ML barrier-breach model](#ml-barrier-breach-model)
- [AI safety](#ai-safety)
- [Testing](#testing)
- [Deploy on Render](#deploy-on-render)
- [Dependencies](#dependencies)
- [Notes and limitations](#notes-and-limitations)

---

## Features

**For RMs**
- **AI client discovery:** guided questions build a client profile (goal, amount, horizon, risk appetite, max loss, liquidity, experience, sector exposure), and AI writes a plain-English interpretation of it.
- **Product configuration:** a Barrier Reverse Convertible on one of 8 underlyings (US and Indian stocks and indices), with notional, tenor, coupon, barrier and strike.
- **Payoff engine:** 7 market scenarios with coupon, capital returned and total outcome.
- **Suitability checks:** 4 rules (risk, horizon, loss tolerance, concentration), each rated match, warning or mismatch.
- **ML breach risk:** a calibrated probability that the barrier is breached, the main factors behind it, and a volatility-only benchmark for comparison.
- **Live market data:** price, history and volatility from Yahoo Finance.
- **Explain to client:** an AI summary in simple language, plus a report page.

**For the manager (admin panel)**
- Dashboard with totals, review status, suitability by dimension and per-RM activity.
- RM management: add, edit, deactivate.
- Analysis review: approve, or flag with a note.

**Platform**
- Real authentication (Supabase Auth). RMs only ever see their own data; the admin panel accepts only manager accounts.
- Supabase Postgres database, with SQLite as the automatic fallback for local use.
- Strict input validation on every endpoint.

---

## How it works

```
Landing → Sign in / Register (Supabase Auth) → role?
   ├─ RM:      Dashboard → Client discovery → Product configure → Analysis (payoff · suitability · ML risk) → Explain & report
   └─ Manager: Admin dashboard → RM management → Analysis review (approve / flag)

Browser (React) ──► Render web service (FastAPI)
                       ├─ /api/v1/*   API routes (JWT check, roles) ──► Supabase Postgres, Supabase Auth
                       ├─ engine.py   payoff + suitability
                       ├─ ml/         breach-risk model           ──► Yahoo Finance (yfinance)
                       ├─ /api/grok   AI proxy (key stays server-side) ──► Groq LLM
                       └─ /*          built React app (frontend/dist)
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS v4, React Router 7, Recharts |
| Backend | Python 3.13, FastAPI, Pydantic, Uvicorn |
| Database | Supabase Postgres (psycopg2, pooled), with a SQLite fallback |
| Auth | Supabase Auth (email + password); the backend verifies ES256 JWTs via JWKS |
| Market data | yfinance (Yahoo Finance), cached for 15 minutes |
| ML | scikit-learn HistGradientBoosting + Platt calibration |
| AI | Groq `openai/gpt-oss-120b` (xAI Grok also supported, auto-detected from the key) |
| Hosting | Render (one web service) |

---

## Project structure

```
MIndSparks/
├── render.yaml               # Render blueprint (build, start, health check, env vars)
├── start.sh                  # Local: starts backend + frontend together
├── PROJECT_LOG.md            # Full change log
├── backend/
│   ├── main.py               # All API routes + serves the built frontend
│   ├── auth.py               # JWT verification, roles, Supabase admin helpers
│   ├── db.py                 # Postgres/SQLite adapter, schema, seed data
│   ├── engine.py             # Payoff + suitability engine
│   ├── market.py             # Underlyings + yfinance data
│   ├── ai.py                 # Groq/Grok proxy (production)
│   ├── seed_auth.py          # Creates demo RM logins / manager login
│   ├── test_api.py           # 67 API checks
│   ├── requirements.txt      # Pinned Python deps
│   └── ml/
│       ├── features.py       # 16 features shared by training and scoring
│       ├── model.py          # BreachModel, calibration, explanations
│       ├── train_breach_model.py
│       ├── serve.py          # Live scoring
│       ├── breach_model.joblib
│       └── model_card.json   # Metrics, data, limitations
└── frontend/
    ├── vite.config.ts        # Dev proxy for /api/v1 + dev AI proxy
    ├── public/               # favicon, fonts
    └── src/
        ├── App.tsx           # Routes + auth guards
        ├── store.tsx         # Session, user, data loading
        ├── lib/              # api.ts, supabase.ts, grok.ts
        ├── components/       # Layout, LogoMark, MarketCard, BreachRiskCard, story/
        └── pages/            # RM pages + admin/
```

---

## Run locally

**Requirements:** Python 3.13+, Node 20+.

```bash
git clone git@github.com:shri-i/CodeX_Fintech.git
cd CodeX_Fintech
cp backend/.env.example backend/.env           # fill in (see below), or leave empty for SQLite + demo login
cp frontend/.env.example frontend/.env.local   # fill in
./start.sh
```

`start.sh` installs everything on the first run, then starts:
- App: http://localhost:5173
- Admin: http://localhost:5173/admin
- API docs: http://localhost:8000/docs

**Manual start:**
```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
# second terminal
cd frontend && npm install && npm run dev
```

**Production-style run (one server, like Render):**
```bash
cd frontend && npm run build && cd ../backend
.venv/bin/uvicorn main:app --port 8000      # app + API on http://localhost:8000
```

**Create login accounts (once, after Supabase is configured):**
```bash
cd backend
.venv/bin/python seed_auth.py                       # demo logins for all seeded RMs
.venv/bin/python seed_auth.py --manager you@x.com   # manager login; prints a random password once
```

---

## Environment variables

Never commit `.env` files; both are git-ignored.

**`backend/.env`**

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase **session pooler** connection string (IPv4). Leave empty to use local SQLite. |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` key (server only: registration, password resets) |
| `ADMIN_EMAILS` | Comma-separated emails allowed into the admin panel |
| `XAI_API_KEY` | AI key, needed in production. `gsk_…` = Groq, `xai-…` = xAI Grok |
| `MINDSPARKS_AUTH` | Optional. `off` disables auth (used by tests). |

**`frontend/.env.local`**

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Same Supabase URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` key (browser-safe) |
| `XAI_API_KEY` | AI key, used by the dev server's AI proxy |
| `GROK_MODEL`, `GROK_API_URL` | Optional overrides |

Without Supabase settings, the app falls back to a demo sign-in (pick an RM) and SQLite.

---

## Accounts and roles

| Role | Can do | Signs in at |
|---|---|---|
| **RM** | Own clients, analyses, discovery, reports | `/` → Sign In |
| **Manager** | Admin dashboard, RM management, reviews | `/admin` |

- **Demo RMs** (seeded): Priya Sharma, Arjun Mehta, Kavya Nair, Rohan Desai, Ananya Gupta, Vikram Singh (On Leave). Emails follow `firstname.lastname@mindsparks.demo`. The shared demo password is set in `backend/seed_auth.py`; change it before sharing the site publicly.
- **Manager accounts** are listed in `ADMIN_EMAILS`. Passwords are random and never stored in the repo.
- New RMs can self-register at `/register`. Inactive RMs are blocked.

---

## Pages

| Path | Page |
|---|---|
| `/` | Landing page (story, features, FAQ) + sign-in |
| `/register` | RM registration |
| `/reset-password` | Set a new password from the email link |
| `/dashboard` | RM dashboard |
| `/discovery` | AI client discovery |
| `/clients`, `/profile/:clientId` | Clients and client profile |
| `/configure/:clientId` | Product configuration |
| `/analysis/:analysisId` | Analysis: overview, payoff, suitability, ML risk, explain to client |
| `/analyses` | All my analyses |
| `/reports`, `/report/:analysisId` | Reports |
| `/admin` | Admin dashboard (manager only) |
| `/admin/rms` | RM management |
| `/admin/reviews` | Analysis review |

---

## API endpoints

Base path `/api/v1`. Send `Authorization: Bearer <Supabase access token>`.
**Access:** Public = no sign-in · Signed in = any user · RM = signed-in RM (own data only) · Manager = admin only.

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/health` | Public | Server and database status |
| GET/POST/HEAD | `/cron` | Public | Keep-alive for an external cron job: wakes the service, pings the DB, warms the ML model |
| GET | `/me` | Signed in | Current user, RM profile, admin flag |
| POST | `/auth/register` | Public | Register a new RM (login + RM record) |
| POST | `/engine/analyze` | RM | Payoff scenarios + 4 suitability checks |
| POST | `/ml/breach-risk` | RM | Barrier-breach probability + factors |
| GET | `/market/underlyings` | RM | The 8 supported underlyings |
| GET | `/market/{ticker}` | RM | Price, history, volatility |
| GET | `/clients` | RM | My clients |
| POST | `/clients` | RM | Create a client |
| PUT | `/clients/{cid}` | RM | Update a client |
| GET | `/analyses` | RM | My analyses |
| POST | `/analyses` | RM | Save an analysis |
| PUT | `/analyses/{aid}` | RM | Edit product terms |
| GET | `/rms` | Manager | All RMs with stats |
| GET | `/rms/{rm_id}` | Signed in | One RM (RMs: only themselves) |
| POST | `/rms` | Manager | Add an RM |
| PUT | `/rms/{rm_id}` | Manager | Edit / deactivate an RM |
| PUT | `/analyses/{aid}/review` | Manager | Approve or flag (note required to flag) |
| GET | `/admin/stats` | Manager | Admin dashboard numbers |
| POST | `/admin/reset` | Manager | Reset demo data |

**AI proxy (outside `/api/v1`)**

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/grok/status` | Public | Whether AI is configured, provider, model |
| POST | `/api/grok` | Signed in | `{ messages }` → `{ content }` (JSON mode) |

Every other path serves the React app, so deep links work. Missing files return 404.

**Supported underlyings:** NVDA, AAPL, MSFT, TSLA, RELIANCE, HDFCBANK, NIFTY50, SPX.

---

## Calculation rules

Product: a **Barrier Reverse Convertible**. The barrier is observed at maturity.

- **Payoff:** coupon = notional × coupon% × tenor/12 and is always paid. If the final level is at or above the barrier, the full notional comes back; otherwise the client gets notional × final/strike.
- **Risk appetite:** product risk is 1 for an index or 2 for a stock, plus 1 if the barrier is 80% or higher. It is compared with the client (Conservative 1, Moderate 2, Aggressive 3).
- **Horizon:** tenor must be within the client's horizon. A warning appears if liquidity need is High and tenor is over 12 months.
- **Loss tolerance:** loss in a stress scenario (stock −40%, index −25%) vs the client's max loss. Above the max is a mismatch, any loss within it is a warning, and no loss is a match.
- **Concentration:** same-sector exposure of 50% or more is a mismatch, 25% or more is a warning. Indices always match.

---

## ML barrier-breach model

- **Question:** will the price close below the barrier at maturity, i.e. will the client lose capital?
- **Data:** 13 years of daily prices for 35 assets (US and Indian large caps and indices), about 600k simulated products (8 barriers × 4 tenors, one start date per week).
- **Features (16):** 1/3/12-month volatility and momentum, distance from the 52-week high, barrier, tenor, barrier distance in volatility units, downside volatility, skew, kurtosis, worst fall in the past year, volatility trend, index flag.
- **Model:** gradient boosting with monotonic constraints (risk can't fall as volatility or drawdown rises) plus Platt calibration.
- **Validation:** strictly out-of-time. It trains on products that matured before 2022 and tests on products that started from 2022 on.

| Metric (test) | Model | Volatility-only baseline |
|---|---|---|
| AUC | **0.756** | 0.735 |
| Brier score (lower is better) | **0.037** | 0.073 |

- **Retrain:** `cd backend && .venv/bin/python -m ml.train_breach_model` (rewrites `breach_model.joblib` and `model_card.json`).
- **Limitations:** survivorship bias (today's large caps); no implied volatility (not free); estimates, not predictions.

---

## AI safety

- The API key never reaches the browser: calls go through `/api/grok` (FastAPI in production, the Vite plugin in dev), and only signed-in users can use it.
- The AI only explains; every number comes from the engine. The prompt forbids inventing prices or probabilities, guarantees, and buy/sell advice.
- Responses must be valid JSON and are validated in code. Gendered pronouns are rejected and retried once.
- If AI is unavailable or a response fails validation, the app falls back to rule-based text.

---

## Testing

```bash
cd backend && .venv/bin/python test_api.py     # 68 checks: validation, auth rules, roles, engine, ML
```
The tests run offline with auth disabled and a throwaway SQLite database.

---

## Deploy on Render

`render.yaml` defines a single **Python web service** that builds the React app and serves it from FastAPI.

| Setting | Value |
|---|---|
| Build command | `pip install -r backend/requirements.txt && cd frontend && npm ci --include=dev && npm run build` |
| Start command | `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health check | `/api/v1/health` |
| Env vars | `PYTHON_VERSION=3.13.9`, `NODE_VERSION=20.17.0`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_EMAILS`, `XAI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

Steps:
1. Render → **New → Blueprint** (or Web Service) → pick this repo and fill in the env vars.
2. In Supabase → Authentication → URL Configuration, set **Site URL** to the Render URL and add `https://<app>.onrender.com/**` (and `http://localhost:5173/**`) to Redirect URLs.
3. Every push to `main` redeploys automatically.

---

## Dependencies

**Backend:** fastapi 0.142.2 · uvicorn[standard] 0.54.0 · pydantic 2.13.5 · yfinance 1.7.0 · psycopg2-binary 2.9.13 · python-dotenv 1.2.4 · pyjwt[crypto] 2.15.1 · cryptography 50.0.2 · scikit-learn 1.9.1 · scipy 1.18.1 · numpy 2.5.3 · pandas 3.0.6 · joblib 1.6.0.
These are pinned because the saved model needs matching numpy and scikit-learn versions.

**Frontend:** react 19 · react-dom 19 · react-router-dom 7 · recharts 2 · @supabase/supabase-js 2.
**Build tools:** vite 6 · @vitejs/plugin-react · tailwindcss 4 · @tailwindcss/vite · typescript 5.

**External services:** Supabase (Postgres + Auth) · Groq · Yahoo Finance · Render.

---

## Notes and limitations

- This is a hackathon prototype and a decision-support tool, not investment advice.
- Market data comes from Yahoo Finance via yfinance and can be delayed or rate-limited.
- The **RELIGATH** heading font is a personal-use demo font; buy a licence before any commercial use. The wordmark uses Bitter (Google Fonts).
- See [PROJECT_LOG.md](PROJECT_LOG.md) for the full change history.
