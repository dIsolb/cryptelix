"""AI usage metering (Shar 1 — measure-first).

Records every OpenAI API call into ai_usage_events with the exact token counts
returned by the API and a cost computed from the price map below. This is the
observability layer that later lets us set real per-user quotas (backlog 4.4)
from actual p50/p95 usage instead of guesses.

Design rules:
- Metering must NEVER break the product. Every public helper swallows its own
  errors (logs a warning, returns) — a failed insert must not fail an AI reply.
- It opens its own short-lived SessionLocal, so it is safe to call from a
  worker thread (run_in_threadpool) without touching the request session.
- cost_usd is frozen at call time. If the model price changes later, history
  stays accurate; only new rows use the new rate.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from database import SessionLocal
from models import AiUsageEvent

# Price per 1M tokens in USD (input, output). Keep this in sync with
# https://openai.com/api/pricing/ . Unknown models fall back to (0, 0): the
# call is still logged with token counts so cost can be backfilled later.
_MODEL_PRICES_PER_1M: dict[str, tuple[Decimal, Decimal]] = {
    "gpt-4o-mini": (Decimal("0.15"), Decimal("0.60")),
    "gpt-4o": (Decimal("2.50"), Decimal("10.00")),
    "gpt-4.1-mini": (Decimal("0.40"), Decimal("1.60")),
    "gpt-4.1": (Decimal("2.00"), Decimal("8.00")),
    "gpt-4.1-nano": (Decimal("0.10"), Decimal("0.40")),
}

_ONE_MILLION = Decimal("1000000")
_COST_QUANT = Decimal("0.000001")  # numeric(12,6)


def _prices_for(model: str) -> tuple[Decimal, Decimal]:
    key = (model or "").strip().lower()
    if key in _MODEL_PRICES_PER_1M:
        return _MODEL_PRICES_PER_1M[key]
    # Prefix match (e.g. dated variants like 'gpt-4o-mini-2024-07-18').
    for name, prices in _MODEL_PRICES_PER_1M.items():
        if key.startswith(name):
            return prices
    return (Decimal("0"), Decimal("0"))


def estimate_cost_usd(
    model: str, prompt_tokens: int, completion_tokens: int
) -> Decimal:
    """Cost in USD from token counts and the model price map."""
    in_rate, out_rate = _prices_for(model)
    prompt = Decimal(int(prompt_tokens or 0))
    completion = Decimal(int(completion_tokens or 0))
    cost = (prompt * in_rate + completion * out_rate) / _ONE_MILLION
    return cost.quantize(_COST_QUANT, rounding=ROUND_HALF_UP)


def _extract_usage(response: Any) -> tuple[int, int]:
    """Pull (prompt_tokens, completion_tokens) from an OpenAI response."""
    usage = getattr(response, "usage", None)
    if usage is None:
        return 0, 0
    prompt = getattr(usage, "prompt_tokens", None)
    completion = getattr(usage, "completion_tokens", None)
    return int(prompt or 0), int(completion or 0)


def add_response_usage(acc: dict[str, int], response: Any) -> None:
    """Accumulate one response's token usage into a mutable acc dict.

    acc keys: 'prompt', 'completion'. Safe to call after every create() so that
    retries and multi-round tool loops are all counted (rejected drafts and
    tool rounds still cost money).
    """
    try:
        prompt, completion = _extract_usage(response)
        acc["prompt"] = acc.get("prompt", 0) + prompt
        acc["completion"] = acc.get("completion", 0) + completion
    except Exception as exc:  # never break the caller
        print(f"[ai_usage] usage-accumulate skipped: {exc!r}", flush=True)


def log_ai_usage(
    *,
    user_id: int | None,
    endpoint: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> None:
    """Persist one metering row. Swallows all errors (best-effort logging)."""
    if user_id is None:
        return
    prompt = int(prompt_tokens or 0)
    completion = int(completion_tokens or 0)
    if prompt <= 0 and completion <= 0:
        return

    db = None
    try:
        cost = estimate_cost_usd(model, prompt, completion)
        db = SessionLocal()
        db.add(
            AiUsageEvent(
                user_id=user_id,
                endpoint=endpoint,
                model=model,
                prompt_tokens=prompt,
                completion_tokens=completion,
                total_tokens=prompt + completion,
                cost_usd=cost,
            )
        )
        db.commit()
    except Exception as exc:  # metering must never break the product
        print(f"[ai_usage] log skipped: {exc!r}", flush=True)
        if db is not None:
            try:
                db.rollback()
            except Exception:
                pass
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass


def log_from_acc(
    *, user_id: int | None, endpoint: str, model: str, acc: dict[str, int]
) -> None:
    """Convenience: log accumulated usage from an acc dict."""
    log_ai_usage(
        user_id=user_id,
        endpoint=endpoint,
        model=model,
        prompt_tokens=acc.get("prompt", 0),
        completion_tokens=acc.get("completion", 0),
    )
