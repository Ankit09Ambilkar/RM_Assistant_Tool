# FitWise Backend

FastAPI + Supabase Postgres (SQLite fallback) + yfinance + a Python payoff/suitability engine and ML breach-risk model. See the root Readme.md for full docs.

## Run
```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
```
API docs: http://localhost:8000/docs. The SQLite DB (`mindsparks.db`) is created and seeded with demo RMs/clients/analyses on first run.

## Files
- `main.py`: all `/api/v1` routes (RMs, clients, analyses, reviews, engine, market data, admin stats)
- `engine.py`: Barrier Reverse Convertible payoff + 4-rule suitability engine
- `market.py`: supported underlyings + Yahoo Finance data via yfinance (15-min cache)
- `db.py`: SQLite schema + seed data
