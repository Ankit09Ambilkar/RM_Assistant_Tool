"""FitWise backend: FastAPI + SQLite + yfinance + Python payoff engine.

Run:  .venv/bin/uvicorn main:app --reload --port 8000   (docs at http://localhost:8000/docs)
All routes live under /api/v1. The Vite dev server proxies /api/v1 here.
"""
import json
import time
import uuid
from datetime import datetime, timezone
import re
from datetime import date
from typing import Annotated, Literal, Optional

from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import AfterValidator, BaseModel, Field, StringConstraints, field_validator, model_validator

import ai
import auth
import db
import engine
from auth import User, can_access_rm, current_user, require_admin, require_rm
from market import TICKERS, UNDERLYINGS, market_data

app = FastAPI(title="FitWise API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
api = APIRouter(prefix="/api/v1")

db.init()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# ---------- schemas ----------
# All validation lives here, so every endpoint rejects bad input with a 422 and a readable message.

MAX_AMOUNT = 1e11  # ₹10,000 Cr: far above any real ticket, but keeps numbers finite

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


def _known_ticker(v: str) -> str:
    if v not in TICKERS:
        raise ValueError(f"Unsupported underlying '{v}'. Supported: {', '.join(sorted(TICKERS))}")
    return v


Ticker = Annotated[str, AfterValidator(_known_ticker)]
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Profile(BaseModel):
    goal: Literal["Regular Income", "Growth", "Preserve Capital", "Combination"]
    investmentAmount: float = Field(gt=0, le=MAX_AMOUNT)
    horizon: Literal["< 1 Year", "1–3 Years", "3–5 Years", "5+ Years"]
    riskAppetite: Literal["Conservative", "Moderate", "Aggressive"]
    maxLossPct: float = Field(ge=0, le=100)
    liquidityNeed: Literal["Low", "Medium", "High"]
    experience: Literal["None", "Some", "Experienced"]
    preferredUnderlying: Ticker
    sectorExposurePct: float = Field(ge=0, le=100)


class Product(BaseModel):
    underlying: Ticker
    productType: Literal["Barrier Reverse Convertible"] = "Barrier Reverse Convertible"
    notional: float = Field(gt=0, le=MAX_AMOUNT)
    tenorMonths: int = Field(gt=0, le=120)
    couponPct: float = Field(gt=0, le=30)
    barrierPct: float = Field(ge=40, le=100)
    strikePct: float = Field(ge=50, le=120)

    @model_validator(mode="after")
    def barrier_not_above_strike(self):
        if self.barrierPct > self.strikePct:
            raise ValueError("Barrier cannot be above the strike.")
        return self


class AnalyzeIn(BaseModel):
    profile: Profile
    product: Product


class ClientIn(BaseModel):
    rmId: str
    name: Name
    profile: Profile
    interpretation: LongText = ""


class ClientUpdate(BaseModel):
    profile: Optional[Profile] = None
    interpretation: Optional[LongText] = None


class AnalysisIn(BaseModel):
    clientId: str
    product: Product


class ReviewIn(BaseModel):
    status: Literal["Pending", "Approved", "Flagged"]
    note: LongText = ""

    @model_validator(mode="after")
    def flag_needs_note(self):
        if self.status == "Flagged" and not self.note:
            raise ValueError("A note is required when flagging an analysis.")
        return self


class RMIn(BaseModel):
    name: Name
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=200)]
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30, pattern=r"^[0-9+\-\s()]*$")] = ""
    employee_id: ShortText = ""
    designation: Name = "Relationship Manager"
    branch: ShortText = ""
    region: Literal["North", "South", "East", "West"] = "West"
    joined_on: str = ""
    status: Literal["Active", "Inactive", "On Leave"] = "Active"
    aum_cr: float = Field(default=0, ge=0, le=1e6)
    certifications: list[ShortText] = Field(default_factory=list, max_length=20)
    notes: LongText = ""

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        if not EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address.")
        return v

    @field_validator("joined_on")
    @classmethod
    def valid_date(cls, v: str) -> str:
        v = v.strip()
        if not v:
            return v
        try:
            d = date.fromisoformat(v)
        except ValueError:
            raise ValueError("Joined date must be YYYY-MM-DD.")
        if d > date.today():
            raise ValueError("Joined date cannot be in the future.")
        return v


class RegisterIn(BaseModel):
    name: Name
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=200)]
    password: Annotated[str, StringConstraints(min_length=8, max_length=72)]
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30, pattern=r"^[0-9+\-\s()]*$")] = ""
    employee_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
    designation: Name = "Relationship Manager"
    branch: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    region: Literal["North", "South", "East", "West"] = "West"
    certifications: list[ShortText] = Field(default_factory=list, max_length=20)

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        if not EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address.")
        return v


Me = Optional[User]

# ---------- health / auth / engine / market ----------

@api.get("/health")
def health():
    return {"ok": True, "engine": "python", "database": db.backend_name(), "time": now()}


@api.api_route("/cron", methods=["GET", "POST", "HEAD"])
def cron():
    """Public keep-alive for an external cron job: wakes the Render service and touches the database
    (Supabase's free tier pauses idle projects). Cheap, read-only and returns no data, so it's safe to leave open."""
    started = time.perf_counter()
    try:
        with db.connect() as cx:
            cx.execute("SELECT 1").fetchone()
        database = "ok"
    except Exception as e:  # report, don't crash the cron
        database = f"error: {type(e).__name__}"
    try:
        from ml.serve import load_model
        load_model()  # keeps the model warm in memory
        model = "ok"
    except Exception as e:
        model = f"error: {type(e).__name__}"
    return {"ok": database == "ok", "database": database, "model": model,
            "ms": round((time.perf_counter() - started) * 1000), "time": now()}


@api.get("/me")
def me(user: Me = Depends(current_user)):
    if user is None:
        return {"authEnabled": False}
    return {"authEnabled": True, "email": user.email, "isAdmin": user.is_admin, "rm": user.rm}


@api.post("/auth/register")
def register(body: RegisterIn):
    """Creates the login (Supabase Auth, already confirmed) and the RM profile in one step.
    If an admin already added this RM by email but they have no login yet, the login is created and linked."""
    with db.connect() as c:
        existing = c.execute("SELECT * FROM rms WHERE lower(email)=?", (body.email,)).fetchone()
    if auth.ENABLED:
        if auth.find_auth_user(body.email):
            raise HTTPException(409, "An account with this email already exists. Please sign in.")
        auth.create_auth_user(body.email, body.password)
    elif existing:
        raise HTTPException(409, "An RM with this email already exists")
    if existing:
        return db.rm_row(existing)
    rid = new_id("rm")
    with db.connect() as c:
        c.execute("INSERT INTO rms VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (rid, body.name, body.email, body.phone, body.employee_id, body.designation, body.branch, body.region,
                   datetime.now().date().isoformat(), "Active", 0, json.dumps(body.certifications), "Self-registered"))
        return db.rm_row(c.execute("SELECT * FROM rms WHERE id=?", (rid,)).fetchone())


@api.post("/engine/analyze")
def analyze(body: AnalyzeIn, user: Me = Depends(require_rm)):
    return engine.analyze(body.profile.model_dump(), body.product.model_dump())


@api.post("/ml/breach-risk")
def ml_breach_risk(body: Product, user: Me = Depends(require_rm)):
    """ML estimate of the chance the underlying closes below the barrier at maturity (see backend/ml/)."""
    from ml.serve import breach_risk  # imported lazily: keeps API start-up fast

    try:
        return breach_risk(body.underlying, body.barrierPct, body.tenorMonths)
    except FileNotFoundError as e:
        raise HTTPException(503, str(e))
    except Exception as e:  # market data / network issues
        raise HTTPException(502, f"Breach-risk model unavailable: {e}")


@api.get("/market/underlyings")
def underlyings(user: Me = Depends(require_rm)):
    return UNDERLYINGS


@api.get("/market/{ticker}")
def market(ticker: str, period: Literal["1mo", "3mo", "6mo", "1y", "2y", "5y"] = "1y", user: Me = Depends(require_rm)):
    if ticker not in TICKERS:
        raise HTTPException(404, f"Unsupported underlying '{ticker}'")
    try:
        return market_data(ticker, period)
    except Exception as e:  # network / Yahoo issues → frontend shows "market data unavailable"
        raise HTTPException(502, f"Market data unavailable: {e}")


# ---------- RMs ----------

def _all_rms() -> list[dict]:
    with db.connect() as c:
        rows = [db.rm_row(r) for r in c.execute("SELECT * FROM rms ORDER BY name")]
        counts = {r["rm_id"]: (r["clients"]) for r in c.execute("SELECT rm_id, COUNT(*) clients FROM clients GROUP BY rm_id")}
        acounts = {r["rm_id"]: (r["n"]) for r in c.execute("SELECT rm_id, COUNT(*) n FROM analyses GROUP BY rm_id")}
    for r in rows:
        r["clientCount"] = counts.get(r["id"], 0)
        r["analysisCount"] = acounts.get(r["id"], 0)
    return rows


@api.get("/rms")
def list_rms(user: Me = Depends(require_admin)):
    return _all_rms()


def _get_rm(rm_id: str) -> dict:
    with db.connect() as c:
        r = c.execute("SELECT * FROM rms WHERE id=?", (rm_id,)).fetchone()
    if not r:
        raise HTTPException(404, "RM not found")
    return db.rm_row(r)


@api.get("/rms/{rm_id}")
def get_rm(rm_id: str, user: Me = Depends(current_user)):
    if not can_access_rm(user, rm_id):
        raise HTTPException(403, "Not allowed")
    return _get_rm(rm_id)


@api.post("/rms")
def create_rm(body: RMIn, user: Me = Depends(require_admin)):
    rid = new_id("rm")
    d = body.model_dump()
    d["joined_on"] = d["joined_on"] or datetime.now().date().isoformat()
    with db.connect() as c:
        if c.execute("SELECT 1 FROM rms WHERE lower(email)=?", (d["email"],)).fetchone():
            raise HTTPException(409, "An RM with this email already exists")
        c.execute("INSERT INTO rms VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (rid, d["name"], d["email"], d["phone"], d["employee_id"], d["designation"], d["branch"], d["region"],
                   d["joined_on"], d["status"], d["aum_cr"], json.dumps(d["certifications"]), d["notes"]))
    return _get_rm(rid)


@api.put("/rms/{rm_id}")
def update_rm(rm_id: str, body: RMIn, user: Me = Depends(require_admin)):
    d = body.model_dump()
    with db.connect() as c:
        if not c.execute("SELECT 1 FROM rms WHERE id=?", (rm_id,)).fetchone():
            raise HTTPException(404, "RM not found")
        if c.execute("SELECT 1 FROM rms WHERE lower(email)=? AND id<>?", (d["email"], rm_id)).fetchone():
            raise HTTPException(409, "Another RM already uses this email")
        cur = c.execute("""UPDATE rms SET name=?, email=?, phone=?, employee_id=?, designation=?, branch=?, region=?,
                           joined_on=?, status=?, aum_cr=?, certifications=?, notes=? WHERE id=?""",
                        (d["name"], d["email"], d["phone"], d["employee_id"], d["designation"], d["branch"], d["region"],
                         d["joined_on"], d["status"], d["aum_cr"], json.dumps(d["certifications"]), d["notes"], rm_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "RM not found")
    return _get_rm(rm_id)


# ---------- clients ----------

@api.get("/clients")
def list_clients(rm_id: Optional[str] = None, user: Me = Depends(require_rm)):
    if user and not user.is_admin:
        rm_id = user.rm_id  # RMs only ever see their own clients
    q, args = "SELECT * FROM clients", ()
    if rm_id:
        q, args = q + " WHERE rm_id=?", (rm_id,)
    with db.connect() as c:
        return [db.client_row(r) for r in c.execute(q + " ORDER BY created_at DESC", args)]


@api.post("/clients")
def create_client(body: ClientIn, user: Me = Depends(require_rm)):
    if user and not user.is_admin:
        body.rmId = user.rm_id
    cid = new_id("c")
    with db.connect() as c:
        if not c.execute("SELECT 1 FROM rms WHERE id=?", (body.rmId,)).fetchone():
            raise HTTPException(404, "RM not found")
        c.execute("INSERT INTO clients VALUES (?,?,?,?,?,?)",
                  (cid, body.rmId, body.name, body.profile.model_dump_json(), body.interpretation, now()))
        return db.client_row(c.execute("SELECT * FROM clients WHERE id=?", (cid,)).fetchone())


@api.put("/clients/{cid}")
def update_client(cid: str, body: ClientUpdate, user: Me = Depends(require_rm)):
    with db.connect() as c:
        row = c.execute("SELECT * FROM clients WHERE id=?", (cid,)).fetchone()
        if not row or not can_access_rm(user, row["rm_id"]):
            raise HTTPException(404, "Client not found")
        if body.profile:
            c.execute("UPDATE clients SET profile=? WHERE id=?", (body.profile.model_dump_json(), cid))
        if body.interpretation is not None:
            c.execute("UPDATE clients SET interpretation=? WHERE id=?", (body.interpretation, cid))
        return db.client_row(c.execute("SELECT * FROM clients WHERE id=?", (cid,)).fetchone())


# ---------- analyses ----------

def _with_results(a: dict, profile: dict) -> dict:
    res = engine.analyze(profile, a["product"])
    a["concerns"] = res["concerns"]
    a["suitability"] = res["suitability"]
    return a


def _analyses(rm_id: Optional[str] = None, include_results: bool = False) -> list[dict]:
    q, args = "SELECT * FROM analyses", ()
    if rm_id:
        q, args = q + " WHERE rm_id=?", (rm_id,)
    with db.connect() as c:
        rows = [db.analysis_row(r) for r in c.execute(q + " ORDER BY created_at DESC", args)]
        if include_results:
            profiles = {r["id"]: json.loads(r["profile"]) for r in c.execute("SELECT id, profile FROM clients")}
            rows = [_with_results(a, profiles[a["clientId"]]) for a in rows if a["clientId"] in profiles]
    return rows


@api.get("/analyses")
def list_analyses(rm_id: Optional[str] = None, include_results: bool = False, user: Me = Depends(require_rm)):
    if user and not user.is_admin:
        rm_id = user.rm_id
    return _analyses(rm_id, include_results)


@api.post("/analyses")
def create_analysis(body: AnalysisIn, user: Me = Depends(require_rm)):
    aid = new_id("a")
    with db.connect() as c:
        cl = c.execute("SELECT rm_id FROM clients WHERE id=?", (body.clientId,)).fetchone()
        if not cl or not can_access_rm(user, cl["rm_id"]):
            raise HTTPException(404, "Client not found")
        c.execute("INSERT INTO analyses (id, client_id, rm_id, product, created_at) VALUES (?,?,?,?,?)",
                  (aid, body.clientId, cl["rm_id"], body.product.model_dump_json(), now()))
        return db.analysis_row(c.execute("SELECT * FROM analyses WHERE id=?", (aid,)).fetchone())


@api.put("/analyses/{aid}")
def update_analysis(aid: str, body: Product, user: Me = Depends(require_rm)):
    # Changing terms invalidates any previous review (PRD business rule).
    with db.connect() as c:
        owner = c.execute("SELECT rm_id FROM analyses WHERE id=?", (aid,)).fetchone()
        if not owner or not can_access_rm(user, owner["rm_id"]):
            raise HTTPException(404, "Analysis not found")
        cur = c.execute("UPDATE analyses SET product=?, review_status='Pending', review_note=NULL, reviewed_at=NULL WHERE id=?",
                        (body.model_dump_json(), aid))
        if cur.rowcount == 0:
            raise HTTPException(404, "Analysis not found")
        return db.analysis_row(c.execute("SELECT * FROM analyses WHERE id=?", (aid,)).fetchone())


@api.put("/analyses/{aid}/review")
def review_analysis(aid: str, body: ReviewIn, user: Me = Depends(require_admin)):
    with db.connect() as c:
        cur = c.execute("UPDATE analyses SET review_status=?, review_note=?, reviewed_at=? WHERE id=?",
                        (body.status, body.note or None, now() if body.status != "Pending" else None, aid))
        if cur.rowcount == 0:
            raise HTTPException(404, "Analysis not found")
        return db.analysis_row(c.execute("SELECT * FROM analyses WHERE id=?", (aid,)).fetchone())


# ---------- admin ----------

@api.get("/admin/stats")
def admin_stats(user: Me = Depends(require_admin)):
    rms = _all_rms()
    analyses = _analyses(include_results=True)
    with db.connect() as c:
        client_count = c.execute("SELECT COUNT(*) FROM clients").fetchone()[0]
    by_status = {s: sum(1 for a in analyses if a["reviewStatus"] == s) for s in ("Pending", "Approved", "Flagged")}
    by_dim: dict[str, dict[str, int]] = {}
    for a in analyses:
        for s in a["suitability"]:
            by_dim.setdefault(s["dimension"], {"MATCH": 0, "WARNING": 0, "MISMATCH": 0})[s["status"]] += 1
    return {
        "rms": {"total": len(rms), "active": sum(1 for r in rms if r["status"] == "Active")},
        "clients": client_count,
        "analyses": len(analyses),
        "reviews": by_status,
        "withConcerns": sum(1 for a in analyses if a["concerns"] > 0),
        "totalAumCr": round(sum(r["aum_cr"] for r in rms), 1),
        "totalNotional": sum(a["product"]["notional"] for a in analyses),
        "perRm": [{"id": r["id"], "name": r["name"], "analyses": r["analysisCount"], "clients": r["clientCount"],
                   "pending": sum(1 for a in analyses if a["rmId"] == r["id"] and a["reviewStatus"] == "Pending")} for r in rms],
        "suitabilityByDimension": by_dim,
    }


@api.post("/admin/reset")
def reset_demo(user: Me = Depends(require_admin)):
    db.init(reset=True)
    return {"ok": True}


app.include_router(api)


# ---- AI proxy (production; the Vite dev server has its own copy) ----
class GrokIn(BaseModel):
    messages: list[dict] = Field(min_length=1, max_length=20)


@app.get("/api/grok/status")
def grok_status():
    return ai.status()


@app.post("/api/grok")
def grok_chat(body: GrokIn, user: User = Depends(current_user)):  # signed-in users only, so the key can't be abused
    code, data = ai.chat(body.messages)
    return JSONResponse(data, status_code=code)


# ---- Built frontend (frontend/dist), served by the same service in production ----
DIST = Path(__file__).parent.parent / "frontend" / "dist"

if DIST.is_dir():
    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        f = (DIST / path).resolve()
        if path and f.is_file() and f.is_relative_to(DIST.resolve()):
            return FileResponse(f)
        if Path(path).suffix:  # a missing asset/file (e.g. the git-ignored font) is a real 404, not the app shell
            raise HTTPException(404, "Not found")
        return FileResponse(DIST / "index.html")  # client-side routes (/dashboard, /admin, …)
