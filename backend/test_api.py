"""Validation smoke test: hits every endpoint with good and bad input against a throwaway DB.

Run:  .venv/bin/python test_api.py      (exit code 1 if anything fails; your real mindsparks.db is untouched)
"""
import os, pathlib, sys, tempfile, warnings
os.environ["MINDSPARKS_AUTH"] = "off"  # functional checks run without login; auth checks toggle it below
warnings.filterwarnings("ignore")
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import db
db.DATABASE_URL = None  # never touch Supabase from tests
db.DB_PATH = pathlib.Path(tempfile.mkdtemp()) / "test.db"
import main
from fastapi.testclient import TestClient
c = TestClient(main.app, raise_server_exceptions=False)

P = {"goal":"Regular Income","investmentAmount":500000,"horizon":"1–3 Years","riskAppetite":"Moderate","maxLossPct":15,"liquidityNeed":"Medium","experience":"Some","preferredUnderlying":"NVDA","sectorExposurePct":28}
PR = {"underlying":"NVDA","productType":"Barrier Reverse Convertible","notional":500000,"tenorMonths":12,"couponPct":10,"barrierPct":70,"strikePct":100}
FAILED = []


def chk(name, method, url, body=None, expect=(400, 404, 409, 422)):
    r = getattr(c, method)(url, json=body) if body is not None else getattr(c, method)(url)
    ok = r.status_code in expect if isinstance(expect, tuple) else r.status_code == expect
    print(("PASS" if ok else "FAIL"), r.status_code, name, "" if ok else str(r.text)[:120])
    if not ok:
        FAILED.append(name)

# engine
chk("analyze valid", "post", "/api/v1/engine/analyze", {"profile":P,"product":PR}, 200)
chk("analyze negative notional", "post", "/api/v1/engine/analyze", {"profile":P,"product":{**PR,"notional":-5}})
chk("analyze barrier > strike", "post", "/api/v1/engine/analyze", {"profile":P,"product":{**PR,"barrierPct":95,"strikePct":90}})
chk("analyze unknown underlying", "post", "/api/v1/engine/analyze", {"profile":P,"product":{**PR,"underlying":"FAKE"}})
chk("analyze unknown preferredUnderlying", "post", "/api/v1/engine/analyze", {"profile":{**P,"preferredUnderlying":"FAKE"},"product":PR})
chk("analyze string notional", "post", "/api/v1/engine/analyze", {"profile":P,"product":{**PR,"notional":"abc"}})
chk("analyze huge notional", "post", "/api/v1/engine/analyze", {"profile":P,"product":{**PR,"notional":1e300}})
chk("analyze bad goal", "post", "/api/v1/engine/analyze", {"profile":{**P,"goal":"Get rich"},"product":PR})
chk("analyze tenor 0", "post", "/api/v1/engine/analyze", {"profile":P,"product":{**PR,"tenorMonths":0}})
chk("analyze fractional tenor", "post", "/api/v1/engine/analyze", {"profile":P,"product":{**PR,"tenorMonths":12.7}})
chk("analyze unsupported product type", "post", "/api/v1/engine/analyze", {"profile":P,"product":{**PR,"productType":"Magic Note"}})
chk("analyze missing body", "post", "/api/v1/engine/analyze", {})
chk("analyze investment 0", "post", "/api/v1/engine/analyze", {"profile":{**P,"investmentAmount":0},"product":PR})
# market
chk("market unknown ticker", "get", "/api/v1/market/FAKE")
chk("market bad period", "get", "/api/v1/market/NVDA?period=99y")
# rms
RM = {"name":"Test RM","email":"t@x.demo"}
chk("rm create valid", "post", "/api/v1/rms", RM, 200)
chk("rm empty name", "post", "/api/v1/rms", {"name":"  ","email":"a@b.demo"})
chk("rm invalid email", "post", "/api/v1/rms", {"name":"A","email":"not-an-email"})
chk("rm duplicate email", "post", "/api/v1/rms", RM, 409)
chk("rm duplicate email (case)", "post", "/api/v1/rms", {"name":"B","email":"T@X.DEMO"}, 409)
chk("rm bad region", "post", "/api/v1/rms", {"name":"A","email":"r@b.demo","region":"Mars"})
chk("rm negative aum", "post", "/api/v1/rms", {"name":"A","email":"n@b.demo","aum_cr":-10})
chk("rm bad date", "post", "/api/v1/rms", {"name":"A","email":"d@b.demo","joined_on":"yesterday"})
chk("rm update to existing email", "put", "/api/v1/rms/rm-2", {"name":"Arjun Mehta","email":"priya.sharma@mindsparks.demo"}, 409)
chk("rm update missing", "put", "/api/v1/rms/nope", {"name":"A","email":"z@b.demo"}, 404)
chk("rm get missing", "get", "/api/v1/rms/nope", None, 404)
# clients
chk("client unknown rm", "post", "/api/v1/clients", {"rmId":"nope","name":"X","profile":P})
chk("client empty name", "post", "/api/v1/clients", {"rmId":"rm-1","name":"   ","profile":P})
chk("client bad profile", "post", "/api/v1/clients", {"rmId":"rm-1","name":"X","profile":{**P,"maxLossPct":150}})
chk("client update missing", "put", "/api/v1/clients/nope", {"interpretation":"x"}, 404)
chk("client update bad profile", "put", "/api/v1/clients/c-john", {"profile":{**P,"sectorExposurePct":-3}})
# analyses
chk("analysis unknown client", "post", "/api/v1/analyses", {"clientId":"nope","product":PR}, 404)
chk("analysis barrier > strike", "post", "/api/v1/analyses", {"clientId":"c-john","product":{**PR,"barrierPct":99,"strikePct":90}})
chk("analysis unknown underlying", "post", "/api/v1/analyses", {"clientId":"c-john","product":{**PR,"underlying":"FAKE"}})
chk("analysis update barrier > strike", "put", "/api/v1/analyses/a-john", {**PR,"barrierPct":99,"strikePct":90})
chk("analysis update missing", "put", "/api/v1/analyses/nope", PR, 404)
chk("review bad status", "put", "/api/v1/analyses/a-john/review", {"status":"Maybe","note":""})
chk("review flag without note", "put", "/api/v1/analyses/a-john/review", {"status":"Flagged","note":"  "})
chk("review missing analysis", "put", "/api/v1/analyses/nope/review", {"status":"Approved"}, 404)
chk("list analyses unknown rm", "get", "/api/v1/analyses?rm_id=nope", None, 200)
chk("admin stats", "get", "/api/v1/admin/stats", None, 200)
chk("unknown route", "get", "/api/v1/nothing", None, 404)

# registration (auth off → creates the RM profile only)
REG = {"name": "Reg Tester", "email": "Reg.Tester@MindSparks.demo", "password": "longenough1", "employee_id": "EMP-9", "branch": "Pune"}
chk("register valid", "post", "/api/v1/auth/register", REG, 200)
chk("register duplicate", "post", "/api/v1/auth/register", REG, 409)
chk("register short password", "post", "/api/v1/auth/register", {**REG, "email": "x@y.demo", "password": "short"})
chk("register missing branch", "post", "/api/v1/auth/register", {**REG, "email": "z@y.demo", "branch": " "})

# auth on: protected endpoints refuse requests without a valid token (no network needed)
import auth
auth.ENABLED = True
chk("auth: me without token", "get", "/api/v1/me", None, 401)
chk("auth: clients without token", "get", "/api/v1/clients", None, 401)
chk("auth: admin stats without token", "get", "/api/v1/admin/stats", None, 401)
chk("auth: engine without token", "post", "/api/v1/engine/analyze", {"profile": P, "product": PR}, 401)
r = c.get("/api/v1/clients", headers={"Authorization": "Bearer not-a-real-token"})
ok = r.status_code == 401
print(("PASS" if ok else "FAIL"), r.status_code, "auth: garbage token")
if not ok:
    FAILED.append("auth: garbage token")
chk("auth: health stays public", "get", "/api/v1/health", None, 200)
chk("cron: public, no token needed", "get", "/api/v1/cron", None, 200)

# auth on: role rules (simulate verified users without Supabase)
from main import app as _app
non_admin = auth.User("priya.sharma@mindsparks.demo", "u1", {"id": "rm-1", "status": "Active"}, False)
_app.dependency_overrides[auth.current_user] = lambda: non_admin
chk("rbac: RM cannot list all RMs", "get", "/api/v1/rms", None, 403)
chk("rbac: RM cannot review", "put", "/api/v1/analyses/a-john/review", {"status": "Approved"}, 403)
chk("rbac: RM cannot read admin stats", "get", "/api/v1/admin/stats", None, 403)
chk("rbac: RM cannot edit another RM's client", "put", "/api/v1/clients/c-rajesh", {"interpretation": "x"}, 404)
r = c.get("/api/v1/clients?rm_id=rm-3")
ok = r.status_code == 200 and all(x["rmId"] == "rm-1" for x in r.json())
print(("PASS" if ok else "FAIL"), r.status_code, "rbac: RM sees only own clients even if asking for another RM")
if not ok:
    FAILED.append("rbac own clients")
admin = auth.User("priya.sharma@mindsparks.demo", "u1", {"id": "rm-1", "status": "Active"}, True)
_app.dependency_overrides[auth.current_user] = lambda: admin
chk("rbac: admin can list RMs", "get", "/api/v1/rms", None, 200)
chk("rbac: admin can read stats", "get", "/api/v1/admin/stats", None, 200)
_app.dependency_overrides.clear()
auth.ENABLED = False

# ML barrier-breach model (offline: synthetic market features, no network)
import numpy as np
from ml.features import FEATURES
from ml.serve import load_model
m = load_model()
def ml_p(**over):
    f = {**m.typical, **over}
    return float(m.predict(np.array([[f[k] for k in FEATURES]]))[0])
def ml_chk(name, ok):
    print(("PASS" if ok else "FAIL"), "-", name)
    if not ok:
        FAILED.append(name)
ml_chk("ml: probability is between 0 and 1", 0.0 <= ml_p() <= 1.0)
ml_chk("ml: higher barrier never lowers risk", ml_p(barrier=0.6) <= ml_p(barrier=0.7) <= ml_p(barrier=0.8) <= ml_p(barrier=0.9))
ml_chk("ml: higher volatility never lowers risk", ml_p(vol_12m=0.2) <= ml_p(vol_12m=0.4) <= ml_p(vol_12m=0.8))
ml_chk("ml: deeper recent fall never lowers risk", ml_p(max_dd_12m=-0.05) <= ml_p(max_dd_12m=-0.3) <= ml_p(max_dd_12m=-0.6))
ml_chk("ml: model card has out-of-sample metrics", m.card["test"]["auc"] > m.card["test"]["baseline_auc"] and m.card["test"]["brier"] < m.card["test"]["baseline_brier"])
ml_chk("ml: explanations returned", isinstance(m.explain({**m.typical, "vol_12m": 0.9, "barrier": 0.8}), list))

print(f"\n{'ALL PASSED' if not FAILED else f'{len(FAILED)} FAILED: ' + ', '.join(FAILED)} ({sum(1 for _ in open(__file__) if _.strip().startswith(('chk(', 'print((', 'ml_chk(')))} checks)")
sys.exit(1 if FAILED else 0)
