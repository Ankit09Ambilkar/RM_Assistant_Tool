"""Groq / xAI Grok proxy for production (in dev the Vite plugin in frontend/vite.config.ts does the same job).

The API key stays on the server. Key: XAI_API_KEY (or GROQ_API_KEY) from the environment / backend/.env,
falling back to frontend/.env.local so a local production build works with no extra setup.
"""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

LOCAL_ENV = Path(__file__).parent.parent / "frontend" / ".env.local"


def _env(name: str) -> str:
    if os.getenv(name):
        return os.environ[name].strip()
    try:
        for line in LOCAL_ENV.read_text().splitlines():
            k, sep, v = line.strip().partition("=")
            if sep and k.strip() == name:
                return v.strip().strip("'\"")
    except OSError:
        pass
    return ""


def config() -> dict:
    key = _env("XAI_API_KEY") or _env("GROQ_API_KEY")
    groq = key.startswith("gsk_")  # provider is picked from the key prefix, same as the dev proxy
    return {
        "key": key,
        "provider": "Groq" if groq else "Grok",
        "model": _env("GROK_MODEL") or ("openai/gpt-oss-120b" if groq else "grok-4.20-0309-non-reasoning"),
        "url": _env("GROK_API_URL") or ("https://api.groq.com/openai/v1/chat/completions" if groq else "https://api.x.ai/v1/chat/completions"),
    }


def status() -> dict:
    c = config()
    return {"configured": bool(c["key"]), "model": c["model"], "provider": c["provider"]}


def chat(messages: list) -> tuple[int, dict]:
    """Forward chat messages (JSON mode). Returns (http_status, body) shaped like the dev proxy."""
    c = config()
    if not c["key"]:
        return 503, {"error": "XAI_API_KEY is not set on the server"}
    body = json.dumps({"model": c["model"], "messages": messages, "temperature": 0.4, "response_format": {"type": "json_object"}}).encode()
    req = urllib.request.Request(c["url"], data=body, method="POST", headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {c['key']}", "User-Agent": "FitWise/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
        return 200, {"content": data.get("choices", [{}])[0].get("message", {}).get("content", "")}
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read()).get("error")
        except Exception:
            err = None
        msg = err.get("message") if isinstance(err, dict) else err
        return e.code, {"error": msg or f"AI API error {e.code}"}
    except Exception as e:  # network / timeout
        return 502, {"error": str(e)}
