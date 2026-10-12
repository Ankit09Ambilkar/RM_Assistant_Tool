"""Supabase Auth for the API.

Enabled when SUPABASE_URL is set in backend/.env (set MINDSPARKS_AUTH=off to disable, e.g. in tests).
- Every protected request carries `Authorization: Bearer <Supabase access token>`.
- Tokens are verified locally against the project's public signing keys (JWKS, ES256), so no secret is needed for that.
- The user is mapped to an RM row by email. The admin panel belongs to the manager account (ADMIN_EMAILS,
  default manager@mindsparks.demo); RMs are never admins.
- The secret key (SUPABASE_SECRET_KEY) is only used server-side to create accounts (register / demo seeding).
"""
import json
import os
import urllib.error
import urllib.request
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException

import db  # loads backend/.env

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "").strip()
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "manager@mindsparks.demo").split(",") if e.strip()}
ENABLED = bool(SUPABASE_URL) and os.getenv("MINDSPARKS_AUTH", "on").lower() != "off"

_jwks: Optional[jwt.PyJWKClient] = None


def _jwks_client() -> jwt.PyJWKClient:
    global _jwks
    if _jwks is None:
        _jwks = jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)
    return _jwks


def verify_token(token: str) -> dict:
    try:
        key = _jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(token, key.key, algorithms=["ES256", "RS256"], audience="authenticated", leeway=30)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired. Please sign in again.")
    except Exception:
        raise HTTPException(401, "Invalid session. Please sign in again.")


class User:
    def __init__(self, email: str, sub: str, rm: Optional[dict], is_admin: bool):
        self.email, self.sub, self.rm, self.is_admin = email, sub, rm, is_admin

    @property
    def rm_id(self) -> Optional[str]:
        return self.rm["id"] if self.rm else None


def current_user(authorization: str = Header(default="")) -> Optional[User]:
    """None when auth is disabled (local/dev mode: everything stays open as before)."""
    if not ENABLED:
        return None
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Please sign in.")
    claims = verify_token(authorization.split(" ", 1)[1].strip())
    email = (claims.get("email") or "").lower()
    with db.connect() as c:
        row = c.execute("SELECT * FROM rms WHERE lower(email)=?", (email,)).fetchone()
    rm = db.rm_row(row) if row else None
    is_admin = email in ADMIN_EMAILS or (claims.get("app_metadata") or {}).get("role") == "admin"
    if rm and rm["status"] == "Inactive" and not is_admin:
        raise HTTPException(403, "Your RM account is inactive. Contact an administrator.")
    return User(email, claims.get("sub", ""), rm, is_admin)


def require_rm(user: Optional[User] = Depends(current_user)) -> Optional[User]:
    if user and not user.rm and not user.is_admin:
        raise HTTPException(403, "No RM profile is linked to this account.")
    return user


def require_admin(user: Optional[User] = Depends(current_user)) -> Optional[User]:
    if user and not user.is_admin:
        raise HTTPException(403, "Admins only.")
    return user


def can_access_rm(user: Optional[User], rm_id: str) -> bool:
    return user is None or user.is_admin or user.rm_id == rm_id


# ---------- account creation (server-side, secret key) ----------

def _admin_request(method: str, path: str, body: Optional[dict] = None) -> dict:
    if not SECRET_KEY.startswith("sb_secret_") and not SECRET_KEY.startswith("eyJ"):
        raise HTTPException(503, "Registration is not configured: add the Supabase SECRET key to backend/.env.")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/auth/v1{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": SECRET_KEY, "Authorization": f"Bearer {SECRET_KEY}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")
        try:
            detail = json.loads(detail).get("msg") or json.loads(detail).get("message") or detail
        except Exception:
            pass
        raise HTTPException(e.code if e.code in (400, 409, 422) else 502, f"Supabase: {detail}")


def find_auth_user(email: str) -> Optional[dict]:
    page = 1
    while True:
        data = _admin_request("GET", f"/admin/users?page={page}&per_page=200")
        users = data.get("users", [])
        for u in users:
            if (u.get("email") or "").lower() == email.lower():
                return u
        if len(users) < 200:
            return None
        page += 1


def create_auth_user(email: str, password: str) -> dict:
    """Creates a confirmed user (no confirmation email needed)."""
    return _admin_request("POST", "/admin/users", {"email": email, "password": password, "email_confirm": True})


def set_password(user_id: str, password: str) -> dict:
    return _admin_request("PUT", f"/admin/users/{user_id}", {"password": password, "email_confirm": True})
