from __future__ import annotations

import os
import random
import re
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from ai_usage import add_response_usage, log_from_acc

_MODEL = "gpt-4o-mini"

_ENV_FILE = (Path(__file__).resolve().parent / ".env").resolve()
load_dotenv(_ENV_FILE, override=True)

SYSTEM_PROMPT = """You are Cryptelix — the trader's calm, sharp post-trade personal assistant.
You write ONE short insight for THIS specific closed trade only (Deal Base AI Insights column).

NUMBERS (hard — wrong numbers = failed answer)
- The Official P&L, commission, funding, entry, exit, and quantity in the user message are FACTS.
- Quote Official P&L exactly as given. Never invent a different P&L.
- NEVER recompute P&L as (exit − entry) × quantity. That formula is wrong here
  (fees, funding, contract size). If you mention the price move, do not equate it to P&L.
- If a field is n/a, skip it. Do not guess.

GOAL
- Supportive, clear-headed, personal. Use THIS trade's facts (side, prices, Official P&L,
  commission, notes, Spot vs Futures USDT-M / COIN-M, leverage/funding when present).
- Sound like a trusted coaching partner, not a lecture or a template.

TONE
- Warm, steady, respectful. No shame, no gloom, no hype.
- Losses: part of the craft. Winners: acknowledge without fireworks.

VARIETY (critical)
- NEVER start with: "This trade…", "This [pair] trade…", "In this trade…",
  or the pair ticker as the first words.
- Mention the pair at most once, later in the text — not the opening.
- Banned filler: "nuanced look", "highlights the importance", "valuable insights",
  "It's completely normal to experience a small loss".
- Each reply must open from a different angle (P&L vs fees, price path, size, notes,
  market type, process). Write like a smart friend journaling with the trader.

IMPROVEMENT
- 1–2 optional process cues for the next journal session — not orders.
- No promises of profits or "next trade will win". No financial advice.
- No buy/sell/hold/enter/exit instructions for the future.

FORMAT
- English, freeform, 70–110 words, complete sentences (do not cut off mid-sentence).
- Sometimes 0–1 emoji from this list only: 📌 📊 💡 🙂 🔥 🚀
- No other emojis. Prefer none if forced."""

_OPENING_STYLES = (
    "First sentence must be about Official P&L vs commission. Do not name the pair in sentence 1.",
    "First sentence must be about the entry-to-exit price path. Pair only later, once.",
    "First sentence must be about size/leverage feel vs the Official P&L. No 'This trade'.",
    "First sentence must mention Spot or Futures USDT-M/COIN-M, then one fill detail.",
    "First sentence must hang on the trader's note — or the silence of having no note.",
    "First sentence: a process/discipline observation, then ground it in Official P&L.",
    "Start mid-thought, like a journal continuation. Pair appears once, not first.",
    "First sentence: what quietly went right, even if Official P&L is slightly red.",
)

_FORBIDDEN_OPENER = re.compile(
    r"^\s*(this\s+trade|in\s+this\s+trade|for\s+this\s+trade|the\s+trade\s+in|the\s+trade\s+on)\b",
    re.IGNORECASE,
)

_MAX_ATTEMPTS = 3


class AIAnalysisError(Exception):
    """Raised when OpenAI is misconfigured, the call fails, or the response is unusable."""


def _decimal_str(value: object) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, Decimal):
        return format(value, "f")
    return str(value)


def _market_label(trade: object) -> str:
    account = str(getattr(trade, "account_type", "") or "").strip().lower()
    market = str(getattr(trade, "market_type", "") or "").strip().lower()
    if market == "usdm":
        return "Futures USDT-M"
    if market == "coinm":
        return "Futures COIN-M"
    if account in ("future", "futures") or account.startswith("futures"):
        return "Futures"
    return "Spot"


def _pair_token(pair: object) -> str:
    return str(pair or "").strip()


def _insight_violates_rules(text: str, pair: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True
    if _FORBIDDEN_OPENER.match(stripped):
        return True
    if pair:
        head = stripped[: max(len(pair) + 8, 24)].lower()
        if head.startswith(pair.lower()):
            return True
    if stripped.endswith((" the", " The", ",", ";", "—")):
        return True
    return False


def analyze_trade_sync(trade: object, user_id: int | None = None) -> str:
    """
    Build a user message from trade ORM fields and return the model text (GPT-4o-mini).
    OPENAI_API_KEY is read from the environment.

    Token usage across ALL attempts (including rejected drafts, which still cost
    money) is metered into ai_usage_events when user_id is provided.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or not str(api_key).strip():
        raise AIAnalysisError("OPENAI_API_KEY is not set")

    client = OpenAI(api_key=str(api_key).strip())
    usage_acc: dict[str, int] = {"prompt": 0, "completion": 0}

    date_raw = getattr(trade, "date", None) or getattr(trade, "closed_at", None)
    date_s = date_raw.isoformat()[:10] if hasattr(date_raw, "isoformat") else str(date_raw or "n/a")
    pair = _pair_token(getattr(trade, "pair", "n/a"))
    official_pnl = _decimal_str(getattr(trade, "pnl", None))

    last_error = "Empty model response"
    for attempt in range(_MAX_ATTEMPTS):
        style = random.choice(_OPENING_STYLES)
        retry_note = ""
        if attempt > 0:
            retry_note = (
                "\nPREVIOUS DRAFT WAS REJECTED. It started with a banned opener "
                "and/or treated price×qty as P&L. Rewrite from a new angle. "
                "First words must NOT be 'This trade' or the pair ticker. "
                f"Official P&L is {official_pnl} — use that figure, do not recalculate.\n"
            )

        user_content = (
            "Closed-trade facts (do not contradict):\n"
            f"Date: {date_s}\n"
            f"Market: {_market_label(trade)}\n"
            f"Pair: {pair}\n"
            f"Side: {getattr(trade, 'side', 'n/a')}\n"
            f"Entry price: {_decimal_str(getattr(trade, 'entry_price', None))}\n"
            f"Exit price: {_decimal_str(getattr(trade, 'exit_price', None))}\n"
            f"Quantity: {_decimal_str(getattr(trade, 'quantity', None))}\n"
            f"Official P&L (use exactly, never recompute): {official_pnl}\n"
            f"Commission: {_decimal_str(getattr(trade, 'commission', None))}\n"
            f"Funding: {_decimal_str(getattr(trade, 'funding', None))}\n"
            f"Leverage: {getattr(trade, 'leverage', None) if getattr(trade, 'leverage', None) is not None else 'n/a'}\n"
            f"Margin mode: {getattr(trade, 'margin_mode', None) or 'n/a'}\n"
            f"Trader notes: {getattr(trade, 'notes', None) or '(none)'}\n"
            f"{retry_note}\n"
            f"Opening instruction: {style}\n"
            "Write 70–110 words. Finish every sentence. "
            "Do not begin with 'This trade' or the pair."
        )

        try:
            response = client.chat.completions.create(
                model=_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                temperature=0.85 if attempt == 0 else 0.95,
                max_tokens=420,
                presence_penalty=0.6,
                frequency_penalty=0.5,
            )
        except Exception as exc:
            log_from_acc(
                user_id=user_id,
                endpoint="trade_analyze",
                model=_MODEL,
                acc=usage_acc,
            )
            raise AIAnalysisError(str(exc)) from exc

        add_response_usage(usage_acc, response)

        text = (response.choices[0].message.content or "").strip()
        if not text:
            last_error = "Empty model response"
            continue
        if _insight_violates_rules(text, pair):
            last_error = "Insight used a banned opener or was incomplete"
            continue
        log_from_acc(
            user_id=user_id,
            endpoint="trade_analyze",
            model=_MODEL,
            acc=usage_acc,
        )
        return text

    log_from_acc(
        user_id=user_id, endpoint="trade_analyze", model=_MODEL, acc=usage_acc
    )
    raise AIAnalysisError(last_error)
