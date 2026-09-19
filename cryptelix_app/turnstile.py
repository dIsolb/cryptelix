"""Cloudflare Turnstile verification (bot / brute-force mitigation).

Config-driven graceful degradation:
- TURNSTILE_SECRET unset  -> verification disabled (returns True). This keeps
  local dev working with no Cloudflare account. Use Cloudflare's test keys in
  dev to still exercise the real code path.
- TURNSTILE_SECRET set     -> the client token is verified server-side against
  Cloudflare's siteverify endpoint.

Failure policy:
- No/empty token when enabled            -> reject (False).
- siteverify says success=false          -> reject (False).
- Network/timeout error reaching CF      -> fail-open (True) + warning log, so a
  Cloudflare outage cannot hard-lock every login. Matches the Redis fail-open
  decision. Flip _FAIL_OPEN to False for strict fail-closed behavior.
"""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request

_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
_TIMEOUT_S = 5
_FAIL_OPEN = True


def turnstile_enabled() -> bool:
    return bool((os.getenv("TURNSTILE_SECRET") or "").strip())


def verify_turnstile(token: str | None, remote_ip: str | None = None) -> bool:
    """Return True if the request may proceed, False if it must be rejected."""
    secret = (os.getenv("TURNSTILE_SECRET") or "").strip()
    if not secret:
        # Disabled (local dev without Cloudflare). Nothing to verify.
        return True

    if not token or not str(token).strip():
        return False

    data = {"secret": secret, "response": str(token).strip()}
    if remote_ip:
        data["remoteip"] = remote_ip
    encoded = urllib.parse.urlencode(data).encode("utf-8")

    try:
        req = urllib.request.Request(_SITEVERIFY_URL, data=encoded, method="POST")
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return bool(payload.get("success"))
    except Exception as exc:
        print(
            f"[turnstile] siteverify unreachable, fail-open={_FAIL_OPEN}: {exc!r}",
            flush=True,
        )
        return _FAIL_OPEN
