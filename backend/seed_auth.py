"""Create Supabase Auth logins for every RM in the database (demo accounts).

Run:  .venv/bin/python seed_auth.py            # creates missing RM logins with the demo password
      .venv/bin/python seed_auth.py --reset    # also resets existing RM logins to the demo password
      .venv/bin/python seed_auth.py --manager [email]  # creates/resets an admin-panel login (default
                                               # manager@mindsparks.demo) with a NEW random password, printed once
                                               # and never saved. Add the email to ADMIN_EMAILS in backend/.env.
Needs SUPABASE_URL + SUPABASE_SECRET_KEY in backend/.env. Safe to re-run.
"""
import secrets
import string
import sys

import auth
import db

DEMO_PASSWORD = "MindSparks@2026"


MANAGER_EMAIL = "manager@mindsparks.demo"


def setup_manager(email: str = MANAGER_EMAIL) -> None:
    """An admin-panel account. The password is random and shown once (the repo is public)."""
    alphabet = string.ascii_letters + string.digits
    password = "Mgr-" + "".join(secrets.choice(alphabet) for _ in range(12)) + "#26"
    existing = auth.find_auth_user(email)
    body = {"password": password, "email_confirm": True, "app_metadata": {"role": "admin"}}
    if existing:
        auth._admin_request("PUT", f"/admin/users/{existing['id']}", body)
        print(f"  reset    {email}")
    else:
        auth._admin_request("POST", "/admin/users", {"email": email, **body})
        print(f"  created  {email}")
    print(f"\nAdmin-panel login\n  email:    {email}\n  password: {password}\n(Shown once. Store it somewhere safe; re-run with --manager {email} to reset.)")


def main() -> None:
    if not auth.SUPABASE_URL:
        sys.exit("SUPABASE_URL is not set in backend/.env")
    if "--manager" in sys.argv:
        i = sys.argv.index("--manager")
        email = sys.argv[i + 1] if len(sys.argv) > i + 1 and "@" in sys.argv[i + 1] else MANAGER_EMAIL
        return setup_manager(email.strip().lower())
    reset = "--reset" in sys.argv
    with db.connect() as c:
        rms = [db.rm_row(r) for r in c.execute("SELECT * FROM rms ORDER BY name")]
    for rm in rms:
        existing = auth.find_auth_user(rm["email"])
        if existing and reset:
            auth.set_password(existing["id"], DEMO_PASSWORD)
            print(f"  reset    {rm['email']}")
        elif existing:
            print(f"  exists   {rm['email']}")
        else:
            auth.create_auth_user(rm["email"], DEMO_PASSWORD)
            print(f"  created  {rm['email']}")
    print(f"\nDemo password for created accounts: {DEMO_PASSWORD}")
    print("Admins:", ", ".join(sorted(auth.ADMIN_EMAILS)))


if __name__ == "__main__":
    main()
