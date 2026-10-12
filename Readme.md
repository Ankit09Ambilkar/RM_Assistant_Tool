# FitWise — Invest in What Fits, Not Just What Pays
fdndj
**FitWise** is an AI-powered decision-support platform for bank Relationship Managers (RMs) who work with structured investment products. It combines AI-guided client discovery, real-market payoff analysis, rule-based suitability checks, and machine-learning-based barrier-breach risk estimation in a single workspace.

A dedicated manager dashboard enables administrators to review analyses, manage Relationship Managers, and monitor suitability and platform activity.

**Repository:** [Ankit09Ambilkar/RM_Assistant_Tool](https://github.com/Ankit09Ambilkar/RM_Assistant_Tool)

**Live application:** [FitWise](https://fitwise-lud9.onrender.com)  
**API documentation:** [FastAPI Swagger UI](https://fitwise-lud9.onrender.com/docs)

> **Note:** The application is a hackathon prototype intended for educational and decision-support purposes. It is not investment advice. The free Render instance may sleep after periods of inactivity.

---

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Accounts and Roles](#accounts-and-roles)
- [Application Pages](#application-pages)
- [API Endpoints](#api-endpoints)
- [Calculation Rules](#calculation-rules)
- [ML Barrier-Breach Risk Model](#ml-barrier-breach-risk-model)
- [AI Safety and Reliability](#ai-safety-and-reliability)
- [Testing](#testing)
- [Deployment](#deployment)
- [Limitations](#limitations)

---

## Features

### 1. AI-Guided Client Discovery

- Collects client information, including investment goals, amount, investment horizon, risk appetite, maximum acceptable loss, liquidity requirements, experience, and sector exposure.
- Generates plain-English interpretations of client profiles using an LLM.
- Helps Relationship Managers understand client requirements before configuring an investment product.

### 2. Structured Product Configuration

Configure a **Barrier Reverse Convertible (BRC)** using:

- Underlying stock or market index.
- Investment notional.
- Investment tenor.
- Coupon rate.
- Barrier level.
- Strike price.

Supported underlyings include US stocks, Indian stocks, and market indices.

### 3. Payoff Simulation

- Evaluates seven predefined market scenarios.
- Calculates coupon payments, capital returned, and total investment outcomes.
- Helps RMs explain potential outcomes under different market conditions.

### 4. Rule-Based Suitability Assessment

Evaluates product suitability across four dimensions:

- Risk appetite compatibility.
- Investment horizon.
- Maximum acceptable loss.
- Sector concentration.

Each dimension receives a **Match**, **Warning**, or **Mismatch** result.

### 5. Machine Learning-Based Barrier-Breach Risk

- Estimates the probability of the underlying closing below the barrier at maturity.
- Uses historical market features and a gradient-boosting model.
- Provides contributing risk factors and a volatility-only benchmark.
- Uses probability calibration to improve the reliability of estimated probabilities.

### 6. Live Market Data

- Retrieves market prices and historical price data through Yahoo Finance using `yfinance`.
- Calculates historical volatility and related market features.
- Caches market data to reduce unnecessary requests.

### 7. AI-Powered Client Explanations

- Converts technical product analysis into plain English.
- Helps RMs explain risks and potential outcomes to clients.
- Provides a report page for reviewing the analysis.

### 8. Manager Dashboard

- Tracks analysis totals and review status.
- Displays suitability breakdowns and RM activity.
- Allows managers to add, edit, or deactivate RMs.
- Supports approving analyses or flagging them with a review note.

### 9. Authentication and Access Control

- Supabase Auth for email-and-password authentication.
- Role-based access for RMs and managers.
- RMs can access only their own client and analysis records.
- Manager-only endpoints protect administrative operations.
- Backend endpoints validate incoming data.

---

## How It Works

### Application Workflow

```text
Landing Page
     |
Sign In / Register
     |
Role Verification
     |
     +--------------------------+
     |                          |
Relationship Manager          Manager
     |                          |
RM Dashboard                Admin Dashboard
     |                          |
Client Discovery            Manage RMs
     |                          |
Client Profile              Review Analyses
     |                          |
Configure Product           Approve / Flag
     |
Payoff Simulation
     |
Suitability Assessment
     |
ML Barrier-Breach Risk
     |
AI Explanation
     |
Analysis Report
```

### System Architecture

```text
React + TypeScript Frontend
             |
             v
       FastAPI Backend
             |
     +-------+--------+----------------+
     |                |                |
     v                v                v
 Authentication   Payoff Engine    ML Risk Model
     |                |                |
     v                v                v
 Supabase Auth    Suitability      scikit-learn
                      Rules
             |
     +-------+----------------+
     |                        |
     v                        v
Supabase PostgreSQL      Yahoo Finance
     |
     v
Client & Analysis Records

FastAPI AI Proxy
     |
     v
Groq LLM / Supported xAI Grok Configuration
```

The backend serves both the API and the built React frontend in production.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| UI and Styling | Tailwind CSS v4 |
| Routing | React Router 7 |
| Charts | Recharts |
| Backend | Python 3.13, FastAPI, Pydantic, Uvicorn |
| Database | Supabase PostgreSQL, SQLite fallback |
| Authentication | Supabase Auth, JWT verification |
| Market Data | Yahoo Finance, `yfinance` |
| Machine Learning | scikit-learn, HistGradientBoosting |
| Probability Calibration | Platt scaling |
| AI Integration | Groq LLM, supported xAI Grok configuration |
| Hosting | Render |

---

## Project Structure

```text
RM_Assistant_Tool/
├── render.yaml
├── start.sh
├── PROJECT_LOG.md
│
├── backend/
│   ├── main.py
│   ├── auth.py
│   ├── db.py
│   ├── engine.py
│   ├── market.py
│   ├── ai.py
│   ├── seed_auth.py
│   ├── test_api.py
│   ├── requirements.txt
│   │
│   └── ml/
│       ├── features.py
│       ├── model.py
│       ├── train_breach_model.py
│       ├── serve.py
│       ├── breach_model.joblib
│       └── model_card.json
│
└── frontend/
    ├── vite.config.ts
    ├── public/
    └── src/
        ├── App.tsx
        ├── store.tsx
        ├── lib/
        │   ├── api.ts
        │   ├── supabase.ts
        │   └── grok.ts
        ├── components/
        │   ├── Layout
        │   ├── LogoMark
        │   ├── MarketCard
        │   ├── BreachRiskCard
        │   └── story/
        └── pages/
            ├── RM pages
            └── admin/
```

*The structure above summarizes the main components; retain the exact filenames and directories from your current repository.*

---

## Getting Started

### Prerequisites

Install the following before running the project:

- Python 3.13 or compatible version.
- Node.js 20 or compatible version.
- npm.
- Git.
- A Supabase project for production authentication and persistent database storage.
- An AI provider API key for AI-generated explanations.

### 1. Clone the Repository

```bash
git clone https://github.com/Ankit09Ambilkar/RM_Assistant_Tool.git

cd RM_Assistant_Tool
```

### 2. Configure Backend Environment

```bash
cp backend/.env.example backend/.env
```

Add your required configuration to `backend/.env`. For local experimentation, the SQLite fallback and demo authentication may be available without Supabase configuration, depending on the current implementation.

### 3. Configure Frontend Environment

```bash
cp frontend/.env.example frontend/.env.local
```

Add the browser-safe Supabase configuration where required.

### 4. Run the Application

If the repository contains the provided startup script:

```bash
./start.sh
```

The script installs dependencies when necessary and starts the backend and frontend.

Local URLs:

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Admin panel | http://localhost:5173/admin |
| Backend API | http://localhost:8000 |
| API documentation | http://localhost:8000/docs |

### Manual Setup

**Backend**

```bash
cd backend

python -m venv .venv
```

Activate the virtual environment and install the dependencies:

```bash
# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend**

Open a second terminal:

```bash
cd frontend

npm install
npm run dev
```

### Production-Style Local Run

Build the frontend:

```bash
cd frontend
npm run build
```

Then start FastAPI:

```bash
cd ../backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## Environment Variables

Never commit `.env` files, private API keys, database passwords, or service-role credentials to GitHub.

### Backend — `backend/.env`

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string; leave unset for the SQLite fallback when supported. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SECRET_KEY` | Server-side Supabase secret used for privileged operations. |
| `ADMIN_EMAILS` | Comma-separated list of authorized manager email addresses. |
| `XAI_API_KEY` | AI provider key used by the server-side AI integration. |
| `MINDSPARKS_AUTH` | Optional authentication setting used by the existing application and tests. |

### Frontend — `frontend/.env.local`

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase publishable key. |
| `XAI_API_KEY` | Used by the development AI proxy if required by the existing Vite configuration. |
| `GROK_MODEL` | Optional AI model override. |
| `GROK_API_URL` | Optional AI API endpoint override. |

**Security note:** Variables prefixed with `VITE_` can be exposed to the browser. Never put secret keys in frontend environment variables. Keep privileged credentials on the server only.

Variable names above follow the supplied project configuration. Confirm them against the current `.env.example` files before deployment.

---

## Accounts and Roles

| Role | Permissions | Entry Point |
|---|---|---|
| Relationship Manager | Manage own clients, configure products, run analyses, and generate reports. | `/` |
| Manager | View administrative statistics, manage RMs, and review analyses. | `/admin` |

Demo accounts and their credentials, if enabled, are defined by the existing seed configuration.

For a production deployment:

- Replace all demo credentials.
- Create manager accounts using the server-side provisioning process.
- Configure `ADMIN_EMAILS` with authorized manager email addresses.
- Ensure inactive RMs cannot continue using the application.
- Do not publish generated passwords or private credentials.

---

## Application Pages

| Route | Description |
|---|---|
| `/` | Landing page and sign-in |
| `/register` | RM registration |
| `/reset-password` | Password reset |
| `/dashboard` | RM dashboard |
| `/discovery` | AI-guided client discovery |
| `/clients` | Client listing |
| `/profile/:clientId` | Individual client profile |
| `/configure/:clientId` | Structured product configuration |
| `/analysis/:analysisId` | Payoff, suitability, ML risk, and AI explanation |
| `/analyses` | RM analysis history |
| `/reports` | Available reports |
| `/report/:analysisId` | Individual analysis report |
| `/admin` | Manager dashboard |
| `/admin/rms` | RM management |
| `/admin/reviews` | Analysis review |

---

## API Endpoints

Base URL:

```text
/api/v1
```

Authenticated requests use a Supabase access token:

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

### Authentication and System

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Server and database health |
| GET/POST/HEAD | `/cron` | Public | Service and database keep-alive |
| GET | `/me` | Signed in | Current user and role information |
| POST | `/auth/register` | Public | Register a new RM |

### Analysis and Market Data

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/engine/analyze` | RM | Calculate payoff and suitability |
| POST | `/ml/breach-risk` | RM | Estimate barrier-breach risk |
| GET | `/market/underlyings` | RM | List supported underlyings |
| GET | `/market/{ticker}` | RM | Retrieve market data |

### Client and Analysis Management

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/clients` | RM | Retrieve own clients |
| POST | `/clients` | RM | Create a client |
| PUT | `/clients/{cid}` | RM | Update a client |
| GET | `/analyses` | RM | Retrieve own analyses |
| POST | `/analyses` | RM | Save an analysis |
| PUT | `/analyses/{aid}` | RM | Update product terms |

### Manager Operations

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/rms` | Manager | List RMs and statistics |
| GET | `/rms/{rm_id}` | Authorized user | Retrieve an RM record |
| POST | `/rms` | Manager | Add an RM |
| PUT | `/rms/{rm_id}` | Manager | Edit or deactivate an RM |
| PUT | `/analyses/{aid}/review` | Manager | Approve or flag an analysis |
| GET | `/admin/stats` | Manager | Retrieve administrative statistics |
| POST | `/admin/reset` | Manager | Reset demo data |

### AI Integration

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/grok/status` | Public | Check AI configuration status |
| POST | `/api/grok` | Signed in | Generate AI-assisted explanations |

Refer to the interactive [API documentation](https://fitwise-lud9.onrender.com/docs) for the deployed API's available routes, request schemas, and response formats.

---

## Calculation Rules

FitWise models a Barrier Reverse Convertible with the barrier observed at maturity.

### 1. Coupon Calculation

For notional \(N\), annual coupon rate \(c\), and tenor \(T\) in months:

\[
\text{Coupon}=N\times c\times\frac{T}{12}
\]

The coupon is assumed to be paid in every simulated scenario under the prototype's product rules.

### 2. Capital Returned

Let \(S_T\) be the final underlying price, \(K\) the strike price, and \(B\) the barrier.

\[
\text{Capital Returned}=
\begin{cases}
N, & S_T\ge B\\
N\times \frac{S_T}{K}, & S_T<B
\end{cases}
\]

Total proceeds equal capital returned plus the coupon. The investor's net profit or loss is calculated relative to the original notional.

These formulas represent the prototype's simplified contract assumptions. Real structured products may have different terms, observation schedules, settlement methods, and issuer-specific conditions.

### 3. Risk Appetite

Product risk is assigned using a simplified rule:

- Index underlying: base score of 1.
- Stock underlying: base score of 2.
- Add 1 when the barrier is at least 80%.

The result is compared with the client's risk score:

| Client Risk Appetite | Score |
|---|---:|
| Conservative | 1 |
| Moderate | 2 |
| Aggressive | 3 |

### 4. Investment Horizon

The product tenor is compared with the client's investment horizon. A warning is generated when liquidity requirements are high and the tenor exceeds 12 months.

### 5. Loss Tolerance

The prototype evaluates a stress scenario of:

- Stocks: 40% decline.
- Indices: 25% decline.

The estimated stress loss is compared with the client's stated maximum acceptable loss.

### 6. Sector Concentration

| Same-Sector Exposure | Result |
|---|---|
| Below 25% | Match |
| 25% to below 50% | Warning |
| 50% or above | Mismatch |

Indices are treated as a match under this simplified concentration rule.

---

## ML Barrier-Breach Risk Model

The machine-learning component estimates the probability that the underlying closes below the specified barrier at maturity.

### Dataset

The supplied project documentation describes a training dataset built from:

- Approximately 13 years of historical daily prices.
- 35 US and Indian large-cap stocks and indices.
- Approximately 600,000 simulated structured products.
- Eight barrier configurations and four tenors.
- Weekly product start dates.

These are project-reported figures and should be verified against the current training pipeline and model card before being presented as independently validated results.

### Feature Engineering

The model uses 16 features, including:

- Short-, medium-, and long-term volatility.
- Price momentum.
- Distance from the 52-week high.
- Barrier level and barrier distance.
- Tenor.
- Barrier distance measured in volatility units.
- Downside volatility.
- Return skewness and kurtosis.
- Worst historical decline.
- Volatility trend.
- Indicator distinguishing indices from individual stocks.

### Model Architecture

- **Algorithm:** Histogram-based Gradient Boosting.
- **Calibration:** Platt scaling.
- **Constraints:** Monotonic constraints designed to prevent estimated risk from decreasing as selected risk factors, such as volatility or drawdown, increase.
- **Validation:** Out-of-time evaluation, separating earlier maturities from later product start dates.

### Reported Model Performance

The original project documentation reports the following test results:

| Metric | ML Model | Volatility-Only Baseline |
|---|---:|---:|
| AUC | 0.756 | 0.735 |
| Brier Score | 0.037 | 0.073 |

A higher AUC generally indicates better discrimination between outcomes, while a lower Brier score indicates better probabilistic accuracy.

These metrics are reproduced from the supplied project documentation, not independently reproduced here. The Brier score should be interpreted alongside the test-set event rate, calibration plots, and evaluation methodology.

### Retraining the Model

From the backend directory:

```bash
python -m ml.train_breach_model
```

Run this command within the configured Python environment. The supplied implementation is intended to regenerate the serialized model and model card.

### Model Limitations

- Historical data can contain survivorship bias.
- Historical volatility does not capture all forward-looking market expectations.
- Real-world outcomes may differ from historical and simulated scenarios.
- Model estimates are not guarantees of future performance.
- Performance can deteriorate as market conditions change.

---

## AI Safety and Reliability

FitWise separates deterministic financial calculations from AI-generated explanations.

- **Server-side credentials:** Privileged AI API keys remain on the server.
- **Deterministic calculations:** Payoff figures and suitability outcomes are calculated by application logic rather than generated by the LLM.
- **Constrained explanations:** The AI is instructed not to invent prices, probabilities, guarantees, or buy/sell recommendations.
- **Response validation:** AI output is expected to follow a structured JSON format and is validated by the application.
- **Fallback behavior:** Rule-based explanations can be used if the AI provider is unavailable or the response fails validation.
- **Role-based access:** Authenticated endpoints enforce user permissions.

AI-generated text is explanatory, not a substitute for independent financial, legal, or compliance review.

---

## Testing

Run the backend API tests from the backend directory:

```bash
python test_api.py
```

The supplied documentation reports approximately 68 API checks covering validation, authentication, authorization, payoff calculations, and ML integration.

The tests are designed to run offline using a temporary SQLite database and disabled authentication where configured.

For meaningful regression testing, verify the actual test count and ensure the test suite passes against the current repository version.

---

## Deployment

The application is designed to run as a single Render web service, with FastAPI serving the built React frontend and API endpoints.

### Deployment Steps

1. Open [Render](https://render.com/).
2. Create a new Blueprint or Web Service.
3. Connect your GitHub repository: [Ankit09Ambilkar/RM_Assistant_Tool](https://github.com/Ankit09Ambilkar/RM_Assistant_Tool).
4. Configure the required environment variables.
5. Configure Supabase authentication and redirect URLs.
6. Deploy and verify the health endpoint and API documentation.

### Expected Build Configuration

| Setting | Value |
|---|---|
| Build command | `pip install -r backend/requirements.txt && cd frontend && npm ci --include=dev && npm run build` |
| Start command | `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health endpoint | `/api/v1/health` |
| Python version | 3.13.x |
| Node.js version | 20.x |

Use the exact versions and environment variables specified by your current `render.yaml` and deployment configuration.

### Supabase Configuration

In Supabase Authentication settings:

- Set the Site URL to your deployed application URL.
- Add the deployed application's permitted redirect URLs.
- Add local development redirect URLs when needed.
- Verify the JWT configuration and server-side database connection.

### Keep-Alive Endpoint

The project provides:

```text
https://fitwise-lud9.onrender.com/api/v1/cron
```

An external scheduled request can be used to keep the service warm and periodically access the database, subject to the hosting provider's current policies and limits. Keep-alive requests do not guarantee that a free service will remain continuously available.

---

## Limitations

- FitWise is a hackathon prototype, not a production-grade investment platform.
- Market data retrieved through Yahoo Finance may be delayed, incomplete, or rate-limited.
- The payoff engine implements simplified contract assumptions.
- Suitability rules are illustrative and do not replace a bank's regulatory suitability process.
- The ML model estimates historical-pattern-based probabilities and cannot guarantee outcomes.
- LLM explanations may require human review.
- Production deployment requires security testing, monitoring, data governance, and financial compliance review.
- Free hosting and database tiers may impose sleep, storage, and usage limits.

---

## Future Improvements

Potential areas for further development include:

- Expanded structured product support.
- More detailed market stress testing and scenario analysis.
- Improved ML calibration and monitoring.
- Auditable suitability decisions and review histories.
- Stronger automated security and integration testing.
- More comprehensive client reports and explainability.
- Integration with approved market-data providers.

---

## Project Links

- **GitHub Repository:** https://github.com/Ankit09Ambilkar/RM_Assistant_Tool
- **Live Application:** https://fitwise-lud9.onrender.com
- **API Documentation:** https://fitwise-lud9.onrender.com/docs

**FitWise — Invest in what fits, not just what pays.**
