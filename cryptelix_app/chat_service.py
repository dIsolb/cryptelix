from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Mapping
from uuid import UUID

from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from binance_market_service import (
    ALL_FIELDS as BINANCE_MARKET_FIELDS,
    BinanceMarketError,
    format_market_snapshot_for_model,
    get_market_snapshot,
    parse_fields as parse_binance_market_fields,
)
from ai_usage import add_response_usage, log_from_acc
from models import ChatMessage as ChatMessageModel
from models import ChatSession as ChatSessionModel
from models import Trade as TradeModel

_CHAT_MODEL = "gpt-4o-mini"
from trade_visibility import connected_exchange_names, visible_trades_sqlalchemy_filter

_ENV_FILE = (Path(__file__).resolve().parent / ".env").resolve()
load_dotenv(_ENV_FILE, override=True)

CHAT_SYSTEM_PROMPT = (
    "Role: You are the Cryptelix AI post-trade analytics assistant. "
    "You help users understand their Deal Base history with clarity, structure, and empathy.\n\n"
    "Language: Always reply in the user's message language.\n\n"
    "DATA & TOOLS:\n"
    "- A compact Deal Base summary is always in context (counts, net PnL after commissions, date span, "
    "breakdown by Spot / Futures USDT-M / Futures COIN-M, newest 3).\n"
    "- For any metric (win rate, avg win/loss, profit factor, streaks, period PnL, etc.) or lists by date, "
    "you MUST call get_trade_stats and/or get_user_trades. Never say you lack winning-trade data if tools can compute it.\n"
    "- For live market quotes (current price, bid/ask, 24h change/high/low/volume, short-window avg price), "
    "you MUST call get_binance_market_data. Never invent live prices. "
    "This is public Binance Spot data, not the user's private balances.\n"
    "- You may combine Deal Base tools with get_binance_market_data in one turn "
    "(e.g. user's BTC trades + current BTCUSDT price).\n"
    "- MARKETS (critical — never mix blindly):\n"
    "  • Spot = account_type spot.\n"
    "  • Futures = account_type future/futures; within futures:\n"
    "    – USDT-M (linear) = market_type usdm\n"
    "    – COIN-M (inverse/coin-margined) = market_type coinm\n"
    "  When the user asks about spot, futures, USDT-M, or COIN-M, pass market=spot|futures|usdm|coinm "
    "to tools. When they ask overall, you may use market=all but still report Spot vs Futures "
    "(and USDT-M vs COIN-M) separately if both exist — do not pretend they are one pile.\n"
    "- Win = pnl > 0, Loss = pnl < 0, Flat = pnl == 0 or null. "
    "Win rate (percent profitable) = winners / total_trades * 100. "
    "Net PnL matches Deal Base TOTAL PNL: sum(pnl) - sum(commission).\n"
    "- For months without a year (e.g. June / червень), use the current year unless context says otherwise. "
    "Do NOT ask clarifying questions about dates — call tools and answer.\n"
    "- Never invent trades, pairs, PnL, dates, or metrics.\n\n"
    "ANALYSIS DEPTH (ask once at chat start):\n"
    "- On the first user message of a new session: if they already asked a concrete analytics question, "
    "answer it first with clear structured steps, then gently ask once whether they prefer "
    "short answers or detailed breakdowns going forward.\n"
    "- If their first message is a greeting or open-ended, warmly ask once: short summary vs detailed analysis.\n"
    "- Remember their preference for the rest of the session. Do not re-ask every turn.\n"
    "- Short: key numbers + 2–4 sentences. Detailed: numbered steps, definitions, empathy, gentle takeaways.\n\n"
    "HOW TO ANSWER METRICS:\n"
    "- Be structured: result first, then step-by-step how you got it, then a short empathetic interpretation "
    "(post-analytics only — patterns in past trades, not what to buy next).\n"
    "- Be warm, calm, and supportive. Never aggressive, shaming, or pressure-selling.\n"
    "- Wording must stay unique; do not copy-paste the same reply.\n\n"
    "FORMATTING (critical — chat renders Markdown + KaTeX math):\n"
    "- Use normal Markdown: **bold**, lists, headings.\n"
    "- When a real formula is needed (win rate, RR, averages, etc.), use LaTeX with delimiters:\n"
    "  inline: $...$   display (preferred for key formulas): $$...$$ on their own lines.\n"
    "- Example display formula:\n"
    "$$\n"
    "\\text{Win Rate} = \\left(\\frac{\\text{winners}}{\\text{total}}\\right) \\times 100 "
    "= \\left(\\frac{7}{28}\\right) \\times 100 = 25\\%\n"
    "$$\n"
    "- Do NOT wrap formulas in square brackets [ ... ]. Use $$ ... $$ only.\n"
    "- Do not dump raw \\frac without $ delimiters.\n"
    "- Keep non-math prose as normal Markdown.\n\n"
    "GUARDRAILS (hard):\n"
    "- You are NOT a financial advisor. No buy/sell/hold instructions, no 'you should enter X', "
    "no guaranteed ways to win, no leverage/position-sizing orders framed as advice to make money.\n"
    "- No confidential data (API keys, secrets, account numbers).\n"
    "- If the user asks for future trading advice, what to buy, how to win the next trade, or similar, "
    "politely refuse with a unique, empathetic paraphrase of this core message (adapt wording each time, "
    "keep the meaning, reply in the user's language when they wrote in another language):\n"
    "\"I'm an AI assistant made to help you with post-trade analytics — not a financial advisor. "
    "I can walk through your past Deal Base metrics with care, but I can't tell you what to buy or how to win. "
    "Thank you for understanding.\"\n"
    "- Anti-FOMO / anti-greed only as gentle reflection on past behavior, never as a trading command."
)

_MARKET_PARAM: dict[str, Any] = {
    "type": "string",
    "enum": ["all", "spot", "futures", "usdm", "coinm"],
    "description": (
        "Market filter. all=everything (default); spot; futures=all futures; "
        "usdm=USDT-M futures only; coinm=COIN-M futures only."
    ),
}

GET_USER_TRADES_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_user_trades",
        "description": (
            "Fetch the user's Deal Base trades from the database (list form). "
            "Use for listing trades, portfolio rows, or trades in a period. "
            "For win rate and aggregate metrics prefer get_trade_stats. "
            "Pass from_date/to_date as YYYY-MM-DD when a period is mentioned. "
            "Pass market to restrict Spot vs Futures USDT-M vs Futures COIN-M."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "from_date": {
                    "type": "string",
                    "description": "Inclusive start date YYYY-MM-DD. Omit for no lower bound.",
                },
                "to_date": {
                    "type": "string",
                    "description": "Inclusive end date YYYY-MM-DD. Omit for no upper bound.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max trades to return (default 30, max 50).",
                },
                "market": _MARKET_PARAM,
            },
        },
    },
}

GET_TRADE_STATS_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_trade_stats",
        "description": (
            "Compute Deal Base analytics from the database: total trades, winners, losers, flats, "
            "win rate (percent profitable), sum pnl, commissions, net PnL (pnl − commission), "
            "gross profit/loss, avg win, avg loss, avg trade, profit factor, largest win/loss. "
            "ALWAYS call this for win rate, average win, RR, or any aggregate metric question. "
            "Optional from_date/to_date YYYY-MM-DD to scope a period. "
            "Pass market=spot|futures|usdm|coinm when the user scopes to that market; "
            "with market=all, response includes a per-market breakdown."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "from_date": {
                    "type": "string",
                    "description": "Inclusive start date YYYY-MM-DD. Omit for all-time.",
                },
                "to_date": {
                    "type": "string",
                    "description": "Inclusive end date YYYY-MM-DD. Omit for all-time.",
                },
                "market": _MARKET_PARAM,
            },
        },
    },
}

GET_BINANCE_MARKET_DATA_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_binance_market_data",
        "description": (
            "Fetch live public Binance Spot market data for a symbol (no user API keys). "
            "Provides last price, best bid/ask, 24h statistics (change %, high/low, volume), "
            "and short-window average price. "
            "ALWAYS call this for current price / market quotes. "
            "Accepts BTCUSDT, BTC/USDT, or bare BTC (defaults to USDT). "
            "Optional fields filter; omit fields to get all four datasets."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Spot pair or base asset, e.g. BTCUSDT, ETH/USDT, SOL.",
                },
                "fields": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": list(BINANCE_MARKET_FIELDS),
                    },
                    "description": (
                        "Which datasets to fetch. "
                        "last_price | bid_ask | ticker_24h | avg_price. "
                        "Omit for all."
                    ),
                },
            },
            "required": ["symbol"],
        },
    },
}

CHAT_TOOLS = [GET_USER_TRADES_TOOL, GET_TRADE_STATS_TOOL, GET_BINANCE_MARKET_DATA_TOOL]

MAX_TOOL_ROUNDS = 4
DEFAULT_TRADE_LIMIT = 30
MAX_TRADE_LIMIT = 50
MAX_STATS_TRADES = 5000


class ChatServiceError(Exception):
    """OpenAI or configuration failure for global chat."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _decimal_str(value: object) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, Decimal):
        return format(value, "f")
    return str(value)


def _row_val(row: Mapping[str, Any], *names: str) -> Any:
    for n in names:
        if n in row:
            return row[n]
        ln = n.lower()
        for k in row:
            if str(k).lower() == ln:
                return row[k]
    return None


def _format_pnl_display(pnl: object) -> str:
    if pnl is None:
        return "n/a"
    try:
        v = float(pnl)
    except (TypeError, ValueError):
        return str(pnl)
    s = f"{v:.2f}$"
    if v > 0:
        return f"+{s}"
    return s


def _parse_market_filter(raw: object) -> str:
    """Normalize tool market arg → all|spot|futures|usdm|coinm."""
    if raw is None:
        return "all"
    s = str(raw).strip().lower()
    aliases = {
        "all": "all",
        "any": "all",
        "spot": "spot",
        "futures": "futures",
        "future": "futures",
        "usdm": "usdm",
        "usdt-m": "usdm",
        "usdt_m": "usdm",
        "usdtm": "usdm",
        "coinm": "coinm",
        "coin-m": "coinm",
        "coin_m": "coinm",
    }
    return aliases.get(s, "all")


def _market_segment(account_type: object, market_type: object) -> str:
    """Canonical segment: spot | futures_usdm | futures_coinm | futures_other."""
    mt = str(market_type or "").strip().lower()
    at = str(account_type or "").strip().lower()
    if mt == "usdm":
        return "futures_usdm"
    if mt == "coinm":
        return "futures_coinm"
    if at in ("future", "futures") or at.startswith("futures"):
        return "futures_other"
    return "spot"


def _market_label(account_type: object, market_type: object) -> str:
    seg = _market_segment(account_type, market_type)
    return {
        "spot": "Spot",
        "futures_usdm": "Futures USDT-M",
        "futures_coinm": "Futures COIN-M",
        "futures_other": "Futures",
    }.get(seg, "Spot")


def _sql_market_clauses(market: str) -> list[Any]:
    """SQLAlchemy filter clauses for market scope (empty = all)."""
    if market == "spot":
        return [TradeModel.account_type == "spot"]
    if market == "futures":
        return [
            or_(
                TradeModel.account_type.in_(("future", "futures")),
                TradeModel.market_type.isnot(None),
            )
        ]
    if market == "usdm":
        return [TradeModel.market_type == "usdm"]
    if market == "coinm":
        return [TradeModel.market_type == "coinm"]
    return []


def _date_part(dt_raw: object) -> str:
    if hasattr(dt_raw, "isoformat"):
        return dt_raw.isoformat()[:10]
    if dt_raw is None:
        return "n/a"
    s = str(dt_raw)
    return s[:10] if s else "n/a"


def _format_trade_compact(row: Mapping[str, Any]) -> str:
    pair = _row_val(row, "pair") or "?"
    side = _row_val(row, "side") or "?"
    pnl_s = _format_pnl_display(_row_val(row, "pnl"))
    d_part = _date_part(_row_val(row, "date", "closed_at", "created_at"))
    market = _market_label(_row_val(row, "account_type"), _row_val(row, "market_type"))
    return f"{d_part} | {market} | {pair} | {side} | PnL {pnl_s}"


def _format_trade_line(row: Mapping[str, Any], idx: int, total: int) -> str:
    pair = _row_val(row, "pair") or "?"
    side = _row_val(row, "side") or "?"
    pnl_s = _format_pnl_display(_row_val(row, "pnl"))
    d_part = _date_part(_row_val(row, "date", "closed_at", "created_at"))
    market = _market_label(_row_val(row, "account_type"), _row_val(row, "market_type"))
    comm = _row_val(row, "commission")
    if comm is None:
        comm_s = "n/a"
    else:
        try:
            comm_s = f"{float(comm):.2f}$"
        except (TypeError, ValueError):
            comm_s = str(comm)
    ep = _row_val(row, "entry_price")
    xp = _row_val(row, "exit_price")
    ep_s = _decimal_str(ep) if ep is not None else "n/a"
    xp_s = _decimal_str(xp) if xp is not None else "n/a"
    if total == 1:
        head = "Your latest trade"
    elif idx == 1:
        head = f"Your most recent trade (1 of {total})"
    else:
        head = f"Trade {idx} of {total} (newest first)"
    extra = ""
    lev = _row_val(row, "leverage")
    if lev is not None:
        extra += f", leverage: {lev}x"
    funding = _row_val(row, "funding")
    if funding is not None:
        try:
            extra += f", funding: {float(funding):.4f}"
        except (TypeError, ValueError):
            extra += f", funding: {funding}"
    return (
        f"{head}: [{market}] {pair}, {side}, P&L: {pnl_s}, commission: {comm_s}, "
        f"entry: {ep_s}, exit: {xp_s}, date: {d_part}{extra}"
    )


def _visible_trades_filter(db: Session, user_id: int):
    connected = connected_exchange_names(db, user_id)
    return (
        TradeModel.user_id == user_id,
        visible_trades_sqlalchemy_filter(connected),
    )


def _parse_iso_date(raw: object) -> datetime | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        # Naive datetime — matches Trade.date filters elsewhere in the app.
        return datetime.strptime(s[:10], "%Y-%m-%d")
    except ValueError:
        return None


def _trade_to_mapping(t: TradeModel) -> dict[str, Any]:
    return {
        "id": t.id,
        "date": t.date,
        "pair": t.pair,
        "side": t.side,
        "entry_price": t.entry_price,
        "exit_price": t.exit_price,
        "quantity": t.quantity,
        "pnl": t.pnl,
        "commission": t.commission,
        "notes": t.notes,
        "account_type": t.account_type,
        "market_type": t.market_type,
        "funding": t.funding,
        "leverage": t.leverage,
        "margin_mode": t.margin_mode,
    }


def fetch_last_trades_raw(
    db: Session, user_id: int, limit: int = 10
) -> list[Mapping[str, Any]]:
    """
    Last rows from public.trades for this user (visible with current API keys only).
    Uses column `date` for ordering (Cryptelix schema); there is no created_at on trades.
    """
    rows = (
        db.query(TradeModel)
        .filter(*_visible_trades_filter(db, user_id))
        .order_by(TradeModel.date.desc().nullslast())
        .limit(limit)
        .all()
    )
    return [_trade_to_mapping(t) for t in rows]


def fetch_trades_in_range(
    db: Session,
    user_id: int,
    *,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    limit: int = DEFAULT_TRADE_LIMIT,
    market: str = "all",
) -> list[Mapping[str, Any]]:
    """Visible trades optionally filtered by inclusive date range and market."""
    limit = max(1, min(int(limit or DEFAULT_TRADE_LIMIT), MAX_TRADE_LIMIT))
    q = (
        db.query(TradeModel)
        .filter(*_visible_trades_filter(db, user_id))
    )
    for clause in _sql_market_clauses(market):
        q = q.filter(clause)
    if from_date is not None:
        q = q.filter(TradeModel.date >= from_date)
    if to_date is not None:
        # Inclusive end day: everything before next midnight UTC.
        end_exclusive = to_date + timedelta(days=1)
        q = q.filter(TradeModel.date < end_exclusive)
    rows = q.order_by(TradeModel.date.desc().nullslast()).limit(limit).all()
    return [_trade_to_mapping(t) for t in rows]


def _segment_net_breakdown(
    db: Session, user_id: int
) -> list[tuple[str, int, float]]:
    """Return [(label, count, net_pnl), ...] for non-empty segments."""
    rows = (
        db.query(
            TradeModel.account_type,
            TradeModel.market_type,
            func.count(TradeModel.id),
            func.coalesce(func.sum(TradeModel.pnl), 0),
            func.coalesce(func.sum(TradeModel.commission), 0),
        )
        .filter(*_visible_trades_filter(db, user_id))
        .group_by(TradeModel.account_type, TradeModel.market_type)
        .all()
    )
    buckets: dict[str, list[float]] = {}
    for account_type, market_type, cnt, sum_pnl, sum_comm in rows:
        label = _market_label(account_type, market_type)
        entry = buckets.setdefault(label, [0.0, 0.0])
        entry[0] += float(cnt or 0)
        entry[1] += float(sum_pnl or 0) - float(sum_comm or 0)
    order = ["Spot", "Futures USDT-M", "Futures COIN-M", "Futures"]
    out: list[tuple[str, int, float]] = []
    for label in order:
        if label in buckets:
            cnt, net = buckets[label]
            out.append((label, int(cnt), net))
    for label, (cnt, net) in buckets.items():
        if label not in order:
            out.append((label, int(cnt), net))
    return out


def build_compact_trades_summary(db: Session, user_id: int) -> str:
    """
    Always-on Deal Base snapshot: counts + date span + market breakdown + 3 newest.
    Kept short to limit token usage.
    Net PnL matches Deal Base TOTAL PNL: sum(pnl) - sum(commission).
    """
    filt = _visible_trades_filter(db, user_id)
    count, sum_pnl, sum_comm, min_d, max_d = (
        db.query(
            func.count(TradeModel.id),
            func.coalesce(func.sum(TradeModel.pnl), 0),
            func.coalesce(func.sum(TradeModel.commission), 0),
            func.min(TradeModel.date),
            func.max(TradeModel.date),
        )
        .filter(*filt)
        .one()
    )
    if not count:
        return (
            "Deal Base summary: 0 saved trades. "
            "If the user asks about trades, say so honestly; do not invent trades."
        )

    try:
        net_pnl = float(sum_pnl) - float(sum_comm)
        net_s = _format_pnl_display(net_pnl)
        comm_s = _format_pnl_display(sum_comm).lstrip("+")
    except Exception:
        net_s = str(sum_pnl)
        comm_s = str(sum_comm)

    lines = [
        f"Deal Base summary: {int(count)} trades | net PnL {net_s} "
        f"(pnl minus commissions; commissions {comm_s}) | "
        f"dates {_date_part(min_d)} → {_date_part(max_d)}.",
    ]
    breakdown = _segment_net_breakdown(db, user_id)
    if breakdown:
        bits = [
            f"{label} {cnt} trades net {_format_pnl_display(net)}"
            for label, cnt, net in breakdown
        ]
        lines.append("By market: " + " | ".join(bits) + ".")
    lines.append("Newest 3 (use get_user_trades for periods or full lists):")
    for row in fetch_last_trades_raw(db, user_id, limit=3):
        lines.append(f"- {_format_trade_compact(row)}")
    return "\n".join(lines)


def execute_get_user_trades(db: Session, user_id: int, args: Mapping[str, Any]) -> str:
    """Run get_user_trades tool and return a compact text payload for the model."""
    from_d = _parse_iso_date(args.get("from_date"))
    to_d = _parse_iso_date(args.get("to_date"))
    market = _parse_market_filter(args.get("market"))
    try:
        limit = int(args.get("limit") or DEFAULT_TRADE_LIMIT)
    except (TypeError, ValueError):
        limit = DEFAULT_TRADE_LIMIT
    limit = max(1, min(limit, MAX_TRADE_LIMIT))

    rows = fetch_trades_in_range(
        db,
        user_id,
        from_date=from_d,
        to_date=to_d,
        limit=limit,
        market=market,
    )

    range_bits: list[str] = []
    if from_d is not None:
        range_bits.append(f"from {_date_part(from_d)}")
    if to_d is not None:
        range_bits.append(f"to {_date_part(to_d)}")
    range_bits.append(f"market={market}")
    range_label = " ".join(range_bits) if range_bits else "all dates"

    if not rows:
        return f"get_user_trades ({range_label}): 0 trades found. Do not invent trades."

    net = 0.0
    comm_total = 0.0
    for r in rows:
        try:
            p = _row_val(r, "pnl")
            if p is not None:
                net += float(p)
        except (TypeError, ValueError):
            pass
        try:
            c = _row_val(r, "commission")
            if c is not None:
                comm_total += float(c)
        except (TypeError, ValueError):
            pass
    net_after_comm = net - comm_total

    lines = [
        f"get_user_trades ({range_label}): showing {len(rows)} trade(s), "
        f"net PnL (pnl − commissions) {_format_pnl_display(net_after_comm)}, "
        f"commissions {_format_pnl_display(comm_total).lstrip('+')} "
        f"(capped at {limit}, newest first):",
    ]
    for i, row in enumerate(rows, start=1):
        lines.append(f"{i}. {_format_trade_line(row, i, len(rows))}")
    return "\n".join(lines)


def _safe_float(value: object) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _stats_block(rows: list[Mapping[str, Any]], heading: str) -> list[str]:
    """Format aggregate metrics for a list of trade mappings."""
    if not rows:
        return [
            f"{heading}: 0 trades. Cannot compute win rate; do not invent metrics.",
        ]

    total = len(rows)
    winners = 0
    losers = 0
    flats = 0
    sum_pnl = 0.0
    sum_comm = 0.0
    wins: list[float] = []
    losses: list[float] = []

    for r in rows:
        pnl = _safe_float(_row_val(r, "pnl")) if _row_val(r, "pnl") is not None else None
        comm = _safe_float(_row_val(r, "commission"))
        sum_comm += comm
        if pnl is None:
            flats += 1
            continue
        sum_pnl += pnl
        if pnl > 0:
            winners += 1
            wins.append(pnl)
        elif pnl < 0:
            losers += 1
            losses.append(pnl)
        else:
            flats += 1

    net = sum_pnl - sum_comm
    win_rate = (winners / total * 100.0) if total else 0.0
    avg_win = (sum(wins) / len(wins)) if wins else 0.0
    avg_loss = (sum(losses) / len(losses)) if losses else 0.0
    avg_trade = net / total if total else 0.0
    gross_profit = sum(wins)
    gross_loss = sum(losses)
    loss_mag = abs(gross_loss)
    profit_factor = (gross_profit / loss_mag) if loss_mag > 1e-12 else None
    largest_win = max(wins) if wins else 0.0
    largest_loss = min(losses) if losses else 0.0
    avg_rr = abs(avg_win / avg_loss) if avg_loss != 0 else None

    pf_s = f"{profit_factor:.2f}" if profit_factor is not None else "n/a"
    rr_s = f"{avg_rr:.2f}" if avg_rr is not None else "n/a"

    return [
        f"{heading}:",
        f"total_trades={total}",
        f"winners={winners} (pnl>0)",
        f"losers={losers} (pnl<0)",
        f"flats={flats} (pnl==0 or null)",
        f"win_rate_percent_profitable={win_rate:.2f}%  # winners/total*100",
        f"sum_pnl={_format_pnl_display(sum_pnl)}",
        f"sum_commission={_format_pnl_display(sum_comm).lstrip('+')}",
        f"net_pnl={_format_pnl_display(net)}  # sum_pnl - sum_commission (Deal Base TOTAL PNL)",
        f"gross_profit={_format_pnl_display(gross_profit)}",
        f"gross_loss={_format_pnl_display(gross_loss)}",
        f"avg_win={_format_pnl_display(avg_win)}",
        f"avg_loss={_format_pnl_display(avg_loss)}",
        f"avg_trade_net={_format_pnl_display(avg_trade)}",
        f"avg_rr_abs_avg_win_over_avg_loss={rr_s}",
        f"profit_factor={pf_s}",
        f"largest_win={_format_pnl_display(largest_win)}",
        f"largest_loss={_format_pnl_display(largest_loss)}",
    ]


def execute_get_binance_market_data(args: Mapping[str, Any]) -> str:
    """Run get_binance_market_data tool (public Binance Spot quotes)."""
    try:
        fields = parse_binance_market_fields(args.get("fields"))
        snapshot = get_market_snapshot(args.get("symbol"), fields)
        return format_market_snapshot_for_model(snapshot)
    except BinanceMarketError as exc:
        return (
            f"get_binance_market_data error: {exc}. "
            "Tell the user the live quote could not be fetched; do not invent a price."
        )
    except Exception as exc:
        return (
            f"get_binance_market_data error: {exc}. "
            "Tell the user the live quote could not be fetched; do not invent a price."
        )


def execute_get_trade_stats(db: Session, user_id: int, args: Mapping[str, Any]) -> str:
    """Aggregate Deal Base metrics (win rate, avg win/loss, net PnL, etc.)."""
    from_d = _parse_iso_date(args.get("from_date"))
    to_d = _parse_iso_date(args.get("to_date"))
    market = _parse_market_filter(args.get("market"))

    q = db.query(TradeModel).filter(*_visible_trades_filter(db, user_id))
    for clause in _sql_market_clauses(market):
        q = q.filter(clause)
    if from_d is not None:
        q = q.filter(TradeModel.date >= from_d)
    if to_d is not None:
        q = q.filter(TradeModel.date < to_d + timedelta(days=1))
    trade_rows = q.order_by(TradeModel.date.asc()).limit(MAX_STATS_TRADES).all()
    rows = [_trade_to_mapping(t) for t in trade_rows]

    range_bits: list[str] = []
    if from_d is not None:
        range_bits.append(f"from {_date_part(from_d)}")
    if to_d is not None:
        range_bits.append(f"to {_date_part(to_d)}")
    range_bits.append(f"market={market}")
    range_label = " ".join(range_bits)

    lines = _stats_block(rows, f"get_trade_stats ({range_label})")
    if not rows:
        return "\n".join(lines)

    if market == "all":
        by_seg: dict[str, list[Mapping[str, Any]]] = {}
        for r in rows:
            label = _market_label(_row_val(r, "account_type"), _row_val(r, "market_type"))
            by_seg.setdefault(label, []).append(r)
        if len(by_seg) > 1:
            lines.append("Per-market breakdown (do not mix these when answering scoped questions):")
            for label in ("Spot", "Futures USDT-M", "Futures COIN-M", "Futures"):
                seg_rows = by_seg.get(label)
                if not seg_rows:
                    continue
                lines.extend(_stats_block(seg_rows, f"  [{label}]"))

    lines.append(
        "Definitions: Win rate = winners / total_trades * 100. "
        "Use these numbers; explain steps empathetically; no future buy/sell advice. "
        "Keep Spot / Futures USDT-M / Futures COIN-M distinct unless the user asked for combined."
    )
    return "\n".join(lines)


def _message_to_dict(m: ChatMessageModel) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "role": m.role,
        "content": m.content,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def list_sessions(db: Session, user_id: int) -> list[dict[str, Any]]:
    rows: list[ChatSessionModel] = (
        db.query(ChatSessionModel)
        .filter(ChatSessionModel.user_id == user_id)
        .order_by(ChatSessionModel.updated_at.desc())
        .all()
    )
    return [
        {
            "id": str(s.id),
            "title": s.title,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in rows
    ]


def list_session_messages(db: Session, session_id: UUID) -> list[dict[str, Any]]:
    """Caller must ensure session exists and belongs to the user."""
    rows: list[ChatMessageModel] = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id == session_id)
        .order_by(ChatMessageModel.created_at.asc())
        .all()
    )
    return [_message_to_dict(m) for m in rows]


def _run_chat_completion_with_tools(
    client: OpenAI,
    db: Session,
    user_id: int,
    oai_messages: list[dict[str, Any]],
    usage_acc: dict[str, int],
) -> str:
    """Chat Completions loop: model may call Deal Base tools up to MAX_TOOL_ROUNDS.

    Token usage from every round (each tool round is a billed call) is
    accumulated into usage_acc so the caller can meter the full turn.
    """
    for round_i in range(MAX_TOOL_ROUNDS + 1):
        print(
            f"[chat_service/send_chat] OpenAI round {round_i + 1}…",
            flush=True,
        )
        response = client.chat.completions.create(
            model=_CHAT_MODEL,
            messages=oai_messages,
            tools=CHAT_TOOLS,
            tool_choice="auto",
            temperature=0.5,
            max_tokens=1400,
        )
        add_response_usage(usage_acc, response)
        msg = response.choices[0].message
        tool_calls = msg.tool_calls or []

        if not tool_calls:
            text = (msg.content or "").strip()
            if not text:
                raise ChatServiceError("Empty model response")
            return text

        if round_i >= MAX_TOOL_ROUNDS:
            raise ChatServiceError("Too many tool rounds")

        oai_messages.append(
            {
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments or "{}",
                        },
                    }
                    for tc in tool_calls
                ],
            }
        )

        for tc in tool_calls:
            name = tc.function.name
            raw_args = tc.function.arguments or "{}"
            try:
                args = json.loads(raw_args)
                if not isinstance(args, dict):
                    args = {}
            except json.JSONDecodeError:
                args = {}

            print(
                f"[chat_service/send_chat] tool {name} args={args}",
                flush=True,
            )
            if name == "get_user_trades":
                result = execute_get_user_trades(db, user_id, args)
            elif name == "get_trade_stats":
                result = execute_get_trade_stats(db, user_id, args)
            elif name == "get_binance_market_data":
                result = execute_get_binance_market_data(args)
            else:
                result = f"Unknown tool: {name}"

            oai_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                }
            )

    raise ChatServiceError("Tool loop exhausted without final answer")


def send_chat(
    db: Session,
    user_id: int,
    session_id: UUID | None,
    message: str,
) -> dict[str, Any]:
    print("[chat_service/send_chat] enter", flush=True)
    text = message.strip()
    if not text:
        raise ChatServiceError("Empty message")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or not str(api_key).strip():
        raise ChatServiceError("OPENAI_API_KEY is not set")

    now = _utcnow()
    session: ChatSessionModel | None = None
    if session_id is not None:
        session = db.get(ChatSessionModel, session_id)
        if session is None or session.user_id != user_id:
            raise ChatServiceError("Session not found")
        print("[chat_service/send_chat] loaded session", session.id, flush=True)

    if session is None:
        session = ChatSessionModel(
            id=uuid.uuid4(),
            user_id=user_id,
            title=None,
            created_at=now,
            updated_at=now,
        )
        db.add(session)
        db.flush()
        print("[chat_service/send_chat] created session", session.id, flush=True)

    prior: list[ChatMessageModel] = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id == session.id)
        .order_by(ChatMessageModel.created_at.asc())
        .all()
    )

    user_row = ChatMessageModel(
        id=uuid.uuid4(),
        session_id=session.id,
        role="user",
        content=text,
        created_at=now,
    )
    db.add(user_row)
    db.flush()
    print("[chat_service/send_chat] saved user message id=", user_row.id, flush=True)

    if not session.title or not str(session.title).strip():
        snippet = text.replace("\n", " ").strip()
        session.title = (snippet[:80] + ("..." if len(snippet) > 80 else "")) or "Chat"

    summary = build_compact_trades_summary(db, user_id)
    is_first_user_turn = not any(m.role == "user" for m in prior)
    session_note = ""
    if is_first_user_turn:
        session_note = (
            "\n\nSession note: This is the first user message in this chat. "
            "If they asked a concrete metric/analytics question, answer with tools first "
            "(structured + empathetic), then once ask whether they prefer short or detailed "
            "answers next. If they only greeted, ask that preference first."
        )
    system_content = f"{CHAT_SYSTEM_PROMPT}\n\n{summary}{session_note}"

    oai_messages: list[dict[str, Any]] = [{"role": "system", "content": system_content}]
    for m in prior[-30:]:
        if m.role not in ("user", "assistant"):
            continue
        oai_messages.append({"role": m.role, "content": m.content})
    oai_messages.append({"role": "user", "content": text})

    print("[chat_service/send_chat] calling OpenAI gpt-4o-mini (tools)…", flush=True)
    client = OpenAI(api_key=str(api_key).strip())
    usage_acc: dict[str, int] = {"prompt": 0, "completion": 0}
    try:
        assistant_text = _run_chat_completion_with_tools(
            client, db, user_id, oai_messages, usage_acc
        )
    except ChatServiceError:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        print("[chat_service/send_chat] OpenAI error:", repr(exc), flush=True)
        raise ChatServiceError(str(exc)) from exc
    finally:
        # Meter tokens spent this turn even if the turn ultimately failed.
        log_from_acc(
            user_id=user_id, endpoint="chat_send", model=_CHAT_MODEL, acc=usage_acc
        )

    print(
        "[chat_service/send_chat] OpenAI OK, reply len=",
        len(assistant_text),
        flush=True,
    )

    asst_now = _utcnow()
    assistant_row = ChatMessageModel(
        id=uuid.uuid4(),
        session_id=session.id,
        role="assistant",
        content=assistant_text,
        created_at=asst_now,
    )
    db.add(assistant_row)
    session.updated_at = asst_now
    print("[chat_service/send_chat] committing assistant message…", flush=True)
    db.commit()
    db.refresh(user_row)
    db.refresh(assistant_row)
    db.refresh(session)

    return {
        "session_id": str(session.id),
        "title": session.title,
        "user_message": _message_to_dict(user_row),
        "assistant_message": _message_to_dict(assistant_row),
    }
