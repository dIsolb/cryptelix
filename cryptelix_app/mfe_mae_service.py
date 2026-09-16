"""Compute real MFE/MAE from public Binance klines (high/low in the trade window).

Runs in the background so FTR never waits on Binance. Values are persisted on
`trades` and reused. If klines are missing we leave the columns NULL and FTR
falls back to the entry/exit proxy.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone
from binance_market_service import BinanceMarketError, get_klines, spot_symbol_candidates
from database import SessionLocal
from models import Trade

logger = logging.getLogger("cryptelix")

_MS = 1000


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _to_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n != n:  # NaN
        return None
    return n


def _interval_for_span(start: datetime, end: datetime) -> str:
    hours = max(1.0, (end - start).total_seconds() / 3600.0)
    if hours <= 250:
        return "15m"
    if hours <= 800:
        return "1h"
    if hours <= 2000:
        return "4h"
    return "1d"


def _excursions(
    entry: float,
    side: str,
    highs: list[float],
    lows: list[float],
) -> tuple[float, float, float, float] | None:
    if not highs or not lows or entry == 0:
        return None
    hi = max(highs)
    lo = min(lows)
    is_short = side.startswith("s")
    if is_short:
        mfe = max(0.0, entry - lo)
        mae = max(0.0, hi - entry)
    else:
        mfe = max(0.0, hi - entry)
        mae = max(0.0, entry - lo)
    return mfe, mae, (mfe / abs(entry)) * 100.0, (mae / abs(entry)) * 100.0


def _candles_in_window(
    candles: list[dict],
    start_ms: int,
    end_ms: int,
) -> tuple[list[float], list[float]]:
    highs: list[float] = []
    lows: list[float] = []
    pad_ms = 24 * 60 * 60 * 1000
    for c in candles:
        open_ms = int(c.get("open_time_ms") or 0)
        if open_ms > end_ms or open_ms < start_ms - pad_ms:
            continue
        high = _to_float(c.get("high"))
        low = _to_float(c.get("low"))
        if high is not None:
            highs.append(high)
        if low is not None:
            lows.append(low)
    return highs, lows


def fill_mfe_mae_for_user(user_id: int) -> int:
    """Persist kline-based MFE/MAE for trades that still lack them. Returns count."""
    db = SessionLocal()
    updated = 0
    try:
        rows: list[Trade] = (
            db.query(Trade)
            .filter(
                Trade.user_id == user_id,
                Trade.mfe_points.is_(None),
                Trade.entry_price.isnot(None),
                Trade.date.isnot(None),
            )
            .all()
        )
        if not rows:
            return 0

        by_symbol: dict[str, list[Trade]] = defaultdict(list)
        for trade in rows:
            try:
                symbol = spot_symbol_candidates(trade.pair)[0]
            except BinanceMarketError:
                continue
            by_symbol[symbol].append(trade)

        for symbol, trades in by_symbol.items():
            starts = [_as_utc(t.date) for t in trades if t.date is not None]
            ends = [
                _as_utc(t.closed_at) or _as_utc(t.date)
                for t in trades
                if t.date is not None
            ]
            starts = [d for d in starts if d is not None]
            ends = [d for d in ends if d is not None]
            if not starts or not ends:
                continue
            span_start = min(starts)
            span_end = max(ends)
            if span_end < span_start:
                span_end = span_start
            interval = _interval_for_span(span_start, span_end)
            try:
                payload = get_klines(
                    symbol,
                    interval=interval,
                    limit=500,
                    start_time_ms=int(span_start.timestamp() * _MS),
                    end_time_ms=int(span_end.timestamp() * _MS) + 60_000,
                )
            except BinanceMarketError as exc:
                logger.warning("MFE klines failed for %s: %s", symbol, exc)
                continue
            candles = list(payload.get("candles") or [])
            if not candles:
                continue

            for trade in trades:
                entry = _to_float(trade.entry_price)
                opened = _as_utc(trade.date)
                closed = _as_utc(trade.closed_at) or opened
                if entry is None or opened is None or closed is None:
                    continue
                highs, lows = _candles_in_window(
                    candles,
                    int(opened.timestamp() * _MS),
                    int(closed.timestamp() * _MS),
                )
                result = _excursions(
                    entry, str(trade.side or "").strip().lower(), highs, lows
                )
                if result is None:
                    continue
                mfe, mae, mfe_pct, mae_pct = result
                trade.mfe_points = mfe
                trade.mae_points = mae
                trade.mfe_percent = mfe_pct
                trade.mae_percent = mae_pct
                updated += 1

        if updated:
            db.commit()
        return updated
    except Exception:
        db.rollback()
        logger.exception("MFE/MAE fill failed for user_id=%s", user_id)
        return 0
    finally:
        db.close()


def trade_mfe_mae(trade: Trade) -> tuple[float, float, float, float] | None:
    """Stored kline values, or None to let the caller use the entry/exit proxy."""
    mfe = _to_float(trade.mfe_points)
    mae = _to_float(trade.mae_points)
    mfe_pct = _to_float(trade.mfe_percent)
    mae_pct = _to_float(trade.mae_percent)
    if mfe is None or mae is None or mfe_pct is None or mae_pct is None:
        return None
    return mfe, mae, mfe_pct, mae_pct
