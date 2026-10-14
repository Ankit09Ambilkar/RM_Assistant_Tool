"""Storage layer: Supabase/PostgreSQL when DATABASE_URL is set (backend/.env), otherwise a local SQLite file.

Both backends expose the same tiny interface used by main.py:
    with db.connect() as c:
        c.execute("SELECT ... WHERE id=?", (x,)).fetchone()   # rows support r["col"] and r[0]
Profiles/products are stored as JSON text to keep the schema simple.
"""
import json
import os
import re
import sqlite3
import threading
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "").strip() or None
DB_PATH = Path(__file__).parent / "mindsparks.db"

_TABLES = """
CREATE TABLE IF NOT EXISTS rms (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, employee_id TEXT,
  designation TEXT, branch TEXT, region TEXT, joined_on TEXT, status TEXT DEFAULT 'Active',
  aum_cr {real} DEFAULT 0, certifications TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, rm_id TEXT NOT NULL, name TEXT NOT NULL, profile TEXT NOT NULL,
  interpretation TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, rm_id TEXT NOT NULL, product TEXT NOT NULL,
  created_at TEXT NOT NULL, review_status TEXT DEFAULT 'Pending', review_note TEXT, reviewed_at TEXT
);
"""


def backend_name() -> str:
    return "postgres" if DATABASE_URL else "sqlite"


# ---------- PostgreSQL (Supabase) ----------

_pool = None
_pool_lock = threading.Lock()


def _pg_pool():
    global _pool
    with _pool_lock:
        if _pool is None:
            from psycopg2.pool import ThreadedConnectionPool

            # Small pool: Supabase's pooler has a modest connection limit on the free tier.
            # Supabase requires SSL; a local Postgres (used for testing) usually doesn't have it.
            ssl = {"sslmode": "require"} if "supabase" in DATABASE_URL and "sslmode=" not in DATABASE_URL else {}
            _pool = ThreadedConnectionPool(1, 5, DATABASE_URL, connect_timeout=10, **ssl)
        return _pool


class _PgCursor:
    def __init__(self, cur):
        self._cur = cur

    @property
    def rowcount(self):
        return self._cur.rowcount

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def __iter__(self):
        return iter(self._cur.fetchall())


class _PgConnection:
    """Mimics the sqlite3 connection API used in this app (qmark params, execute → cursor, context manager)."""

    def __enter__(self):
        import psycopg2.extras

        self._conn = _pg_pool().getconn()
        self._extras = psycopg2.extras
        return self

    def __exit__(self, exc_type, *_):
        try:
            if exc_type:
                self._conn.rollback()
            else:
                self._conn.commit()
        finally:
            _pg_pool().putconn(self._conn)
        return False

    @staticmethod
    def _sql(sql: str) -> str:
        return re.sub(r"\?", "%s", sql)

    def execute(self, sql: str, params=()):
        cur = self._conn.cursor(cursor_factory=self._extras.DictCursor)
        cur.execute(self._sql(sql), tuple(params))
        return _PgCursor(cur)

    def executemany(self, sql: str, rows):
        cur = self._conn.cursor()
        cur.executemany(self._sql(sql), [tuple(r) for r in rows])

    def executescript(self, script: str):
        cur = self._conn.cursor()
        for stmt in (s.strip() for s in script.split(";")):
            if stmt:
                cur.execute(stmt)


# ---------- SQLite (local fallback) ----------

class _SqliteConnection:
    def __enter__(self):
        self._conn = sqlite3.connect(DB_PATH)
        self._conn.row_factory = sqlite3.Row
        return self._conn

    def __exit__(self, exc_type, *_):
        try:
            if exc_type:
                self._conn.rollback()
            else:
                self._conn.commit()
        finally:
            self._conn.close()
        return False


def connect():
    return _PgConnection() if DATABASE_URL else _SqliteConnection()


def init(reset: bool = False) -> None:
    with connect() as conn:
        if reset:
            conn.executescript("DROP TABLE IF EXISTS rms; DROP TABLE IF EXISTS clients; DROP TABLE IF EXISTS analyses;")
        conn.executescript(_TABLES.format(real="DOUBLE PRECISION" if DATABASE_URL else "REAL"))
        if DATABASE_URL:
            # Supabase exposes the public schema through its REST API. Enable RLS with no policies so
            # those endpoints return nothing; this backend connects as the owner and is unaffected.
            conn.executescript("ALTER TABLE rms ENABLE ROW LEVEL SECURITY; ALTER TABLE clients ENABLE ROW LEVEL SECURITY; "
                               "ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;")
        if conn.execute("SELECT COUNT(*) FROM rms").fetchone()[0] == 0:
            seed(conn)


# ---------- row helpers ----------

def rm_row(r) -> dict:
    d = dict(r)
    d["certifications"] = json.loads(d["certifications"] or "[]")
    return d


def client_row(r) -> dict:
    prof = json.loads(r["profile"])
    return {
        "id": r["id"],
        "rmId": r["rm_id"],
        "name": r["name"],
        "profile": prof,
        "notes": prof.get("notes", ""),
        "extractedFacts": prof.get("extractedFacts", []),
        "interpretation": r["interpretation"] or "",
        "createdAt": r["created_at"],
    }


def analysis_row(r) -> dict:
    return {"id": r["id"], "clientId": r["client_id"], "rmId": r["rm_id"], "product": json.loads(r["product"]),
            "createdAt": r["created_at"], "reviewStatus": r["review_status"], "reviewNote": r["review_note"],
            "reviewedAt": r["reviewed_at"]}


# ---------- seed data ----------

RMS = [
    ("rm-1", "Priya Sharma", "priya.sharma@mindsparks.demo", "+91 98200 11234", "EMP-1042", "Senior Relationship Manager",
     "Mumbai – Bandra Kurla Complex", "West", "2019-06-03", "Active", 182.5, ["NISM Series XV", "CFP"], "Top performer FY26. Focus on HNI income clients."),
    ("rm-2", "Arjun Mehta", "arjun.mehta@mindsparks.demo", "+91 98111 45678", "EMP-1077", "Relationship Manager",
     "New Delhi – Connaught Place", "North", "2021-01-18", "Active", 96.0, ["NISM Series V-A"], "Strong with first-time structured product investors."),
    ("rm-3", "Kavya Nair", "kavya.nair@mindsparks.demo", "+91 99001 22567", "EMP-1103", "Senior Relationship Manager",
     "Bengaluru – MG Road", "South", "2018-09-10", "Active", 214.2, ["NISM Series XV", "CFA Level II"], "Tech-founder client base; high technology concentration to watch."),
    ("rm-4", "Rohan Desai", "rohan.desai@mindsparks.demo", "+91 97690 33891", "EMP-1150", "Associate Relationship Manager",
     "Pune – Koregaon Park", "West", "2024-04-01", "Active", 38.7, ["NISM Series V-A"], "New joiner. Analyses need review before client meetings."),
    ("rm-5", "Ananya Gupta", "ananya.gupta@mindsparks.demo", "+91 98300 77412", "EMP-1068", "Relationship Manager",
     "Kolkata – Park Street", "East", "2020-11-23", "Active", 121.4, ["NISM Series XV"], "Conservative client book; mostly capital preservation."),
    ("rm-6", "Vikram Singh", "vikram.singh@mindsparks.demo", "+91 98490 66120", "EMP-0991", "Relationship Manager",
     "Hyderabad – Banjara Hills", "South", "2017-03-15", "On Leave", 88.9, ["NISM Series V-A", "NISM Series XV"], "On sabbatical until Dec 2026. Clients reassigned temporarily."),
]


def profile(goal, amount, horizon, risk, max_loss, liquidity, exp, und, exposure):
    return {"goal": goal, "investmentAmount": amount, "horizon": horizon, "riskAppetite": risk, "maxLossPct": max_loss,
            "liquidityNeed": liquidity, "experience": exp, "preferredUnderlying": und, "sectorExposurePct": exposure}


def product(und, notional, tenor, coupon, barrier, strike=100):
    return {"underlying": und, "productType": "Barrier Reverse Convertible", "notional": notional, "tenorMonths": tenor,
            "couponPct": coupon, "barrierPct": barrier, "strikePct": strike}


CLIENTS = [
    ("c-john", "rm-1", "John Mathew", profile("Regular Income", 500000, "1–3 Years", "Moderate", 15, "Medium", "Some", "NVDA", 28),
     "Prefers income over aggressive capital growth and has moderate downside tolerance (max 15% loss). Existing technology exposure (28%) should be considered before adding NVIDIA-linked exposure.", "2026-09-28T10:00:00Z"),
    ("c-sarah", "rm-1", "Sarah Khan", profile("Growth", 1000000, "3–5 Years", "Aggressive", 30, "Low", "Experienced", "AAPL", 15),
     "Is focused on growing capital over time and has aggressive downside tolerance (max 30% loss).", "2026-09-25T10:00:00Z"),
    ("c-neha", "rm-2", "Neha Kapoor", profile("Preserve Capital", 300000, "< 1 Year", "Conservative", 5, "High", "None", "NIFTY50", 0),
     "Prioritises protecting the original investment and has conservative downside tolerance (max 5% loss). High liquidity need, so shorter tenors are preferable. New to structured products. Explain barriers carefully.", "2026-09-22T09:30:00Z"),
    ("c-rajesh", "rm-3", "Rajesh Iyer", profile("Growth", 2500000, "1–3 Years", "Aggressive", 20, "Low", "Experienced", "NVDA", 55),
     "Is focused on growing capital over time and has aggressive downside tolerance (max 20% loss). Existing technology exposure (55%) should be considered before adding NVIDIA-linked exposure.", "2026-09-20T12:00:00Z"),
    ("c-fatima", "rm-3", "Fatima Sheikh", profile("Combination", 1500000, "3–5 Years", "Moderate", 20, "Medium", "Some", "SPX", 10),
     "Wants a balance of income and growth and has moderate downside tolerance (max 20% loss).", "2026-09-18T15:00:00Z"),
    ("c-amit", "rm-4", "Amit Joshi", profile("Regular Income", 800000, "1–3 Years", "Moderate", 10, "Medium", "None", "RELIANCE", 30),
     "Prefers income over aggressive capital growth and has moderate downside tolerance (max 10% loss). Existing energy exposure (30%) should be considered before adding Reliance Industries-linked exposure. New to structured products. Explain barriers carefully.", "2026-09-29T11:00:00Z"),
    ("c-sunita", "rm-5", "Sunita Banerjee", profile("Preserve Capital", 600000, "1–3 Years", "Conservative", 10, "Medium", "Some", "HDFCBANK", 20),
     "Prioritises protecting the original investment and has conservative downside tolerance (max 10% loss).", "2026-09-26T10:15:00Z"),
    ("c-dev", "rm-6", "Dev Malhotra", profile("Growth", 1200000, "5+ Years", "Aggressive", 30, "Low", "Experienced", "TSLA", 12),
     "Is focused on growing capital over time and has aggressive downside tolerance (max 30% loss).", "2026-09-10T14:00:00Z"),
]

ANALYSES = [
    ("a-john", "c-john", "rm-1", product("NVDA", 500000, 12, 10, 70), "2026-09-28T10:30:00Z", "Pending", None, None),
    ("a-sarah", "c-sarah", "rm-1", product("AAPL", 1000000, 24, 9, 60), "2026-09-25T11:00:00Z", "Approved", "Fits growth mandate; client experienced.", "2026-09-26T09:00:00Z"),
    ("a-neha", "c-neha", "rm-2", product("NIFTY50", 300000, 18, 8, 75), "2026-09-22T10:00:00Z", "Flagged", "18-month tenor conflicts with <1 year horizon and high liquidity need. Please revise.", "2026-09-23T16:20:00Z"),
    ("a-rajesh", "c-rajesh", "rm-3", product("NVDA", 2500000, 12, 14, 80), "2026-09-20T12:45:00Z", "Pending", None, None),
    ("a-fatima", "c-fatima", "rm-3", product("SPX", 1500000, 24, 7, 60), "2026-09-18T15:30:00Z", "Approved", "Index underlying, good diversification.", "2026-09-19T10:00:00Z"),
    ("a-amit", "c-amit", "rm-4", product("RELIANCE", 800000, 12, 11, 70), "2026-09-29T11:20:00Z", "Pending", None, None),
    ("a-sunita", "c-sunita", "rm-5", product("HDFCBANK", 600000, 12, 9, 65), "2026-09-26T10:40:00Z", "Pending", None, None),
    ("a-dev", "c-dev", "rm-6", product("TSLA", 1200000, 36, 13, 60), "2026-09-10T14:30:00Z", "Approved", "Aggressive client, long horizon. OK.", "2026-09-11T12:00:00Z"),
]


def seed(conn) -> None:
    conn.executemany("INSERT INTO rms VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                     [(*r[:11], json.dumps(r[11]), r[12]) for r in RMS])
    conn.executemany("INSERT INTO clients VALUES (?,?,?,?,?,?)",
                     [(c[0], c[1], c[2], json.dumps(c[3]), c[4], c[5]) for c in CLIENTS])
    conn.executemany("INSERT INTO analyses VALUES (?,?,?,?,?,?,?,?)",
                     [(a[0], a[1], a[2], json.dumps(a[3]), a[4], a[5], a[6], a[7]) for a in ANALYSES])
