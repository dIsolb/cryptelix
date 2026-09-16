"""Combined Binance portfolio snapshots (spot + USDT-M + COIN-M wallets).

Used for the Constructor Portfolio widget: latest allocation pie and a daily
equity curve. One REST poll per user at 00:00 UTC (plus bootstrap / connect).
Does not reconstruct holdings from journal fills.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from database import SessionLocal
from exchange_service import ExchangeService
from models import APIKey, BalanceSpotTransaction, PortfolioDailySnapshot
from price_service import DECIMAL_ZERO, get_asset_usdt_rate

logger = logging.getLogger("cryptelix")

EXCHANGE_NAME = "binance"
_SKIP_BALANCE_KEYS = frozenset(
    {"info", "timestamp", "datetime", "free", "used", "total", "debt"}
)


def _to_decimal(value: object) -> Decimal:
    if value is None:
        return DECIMAL_ZERO
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return DECIMAL_ZERO


def _seconds_until_next_utc_midnight() -> float:
    now = datetime.now(tz=timezone.utc)
    nxt = datetime.combine(now.date() + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return max(1.0, (nxt - now).total_seconds())


def _iter_wallet_assets(balance: dict | None) -> list[tuple[str, Decimal, Decimal, Decimal]]:
    if not isinstance(balance, dict):
        return []
    free_map = balance.get("free") or {}
    used_map = balance.get("used") or {}
    total_map = balance.get("total") or {}
    names = set()
    if isinstance(total_map, dict):
        names.update(total_map.keys())
    if isinstance(free_map, dict):
        names.update(free_map.keys())
    rows: list[tuple[str, Decimal, Decimal, Decimal]] = []
    for raw in names:
        asset = str(raw or "").strip().upper()
        if not asset or asset.lower() in _SKIP_BALANCE_KEYS:
            continue
        total = _to_decimal(total_map.get(raw) if isinstance(total_map, dict) else None)
        if total <= DECIMAL_ZERO:
            continue
        free = _to_decimal(free_map.get(raw) if isinstance(free_map, dict) else None)
        locked = _to_decimal(used_map.get(raw) if isinstance(used_map, dict) else None)
        rows.append((asset, total, free, locked))
    return rows


def _unrealized_usdt(balance: dict | None) -> Decimal:
    if not isinstance(balance, dict):
        return DECIMAL_ZERO
    info = balance.get("info")
    if not isinstance(info, dict):
        return DECIMAL_ZERO
    return _to_decimal(info.get("totalUnrealizedProfit"))


def _add_asset(
    buckets: dict[str, dict[str, Any]],
    asset: str,
    amount: Decimal,
    value_usdt: Decimal,
    source: str,
) -> None:
    row = buckets.get(asset)
    if row is None:
        buckets[asset] = {
            "asset": asset,
            "amount": amount,
            "value_usdt": value_usdt,
            "sources": [source],
        }
        return
    row["amount"] = _to_decimal(row["amount"]) + amount
    row["value_usdt"] = _to_decimal(row["value_usdt"]) + value_usdt
    sources = row["sources"]
    if source not in sources:
        sources.append(source)


async def _value_wallet(
    client,
    balance: dict | None,
    source: str,
    at: datetime,
    buckets: dict[str, dict[str, Any]],
) -> None:
    for asset, total, _free, _locked in _iter_wallet_assets(balance):
        rate, _fx = await get_asset_usdt_rate(client, asset, at)
        _add_asset(buckets, asset, total, total * rate, source)
    if source == "usdm":
        upnl = _unrealized_usdt(balance)
        if upnl != DECIMAL_ZERO:
            _add_asset(buckets, "USDT", DECIMAL_ZERO, upnl, "usdm")


async def _fetch_market_balance(client, default_type: str) -> dict | None:
    options = getattr(client, "options", None)
    if isinstance(options, dict):
        options["defaultType"] = default_type
    else:
        client.options = {"defaultType": default_type}
    try:
        return await client.fetch_balance()
    except Exception as exc:
        logger.warning("Portfolio %s balance fetch failed: %s", default_type, exc)
        return None


def _serialize_assets(buckets: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in buckets.values():
        value = float(_to_decimal(row["value_usdt"]))
        amount = float(_to_decimal(row["amount"]))
        out.append(
            {
                "asset": row["asset"],
                "amount": f"{amount:.8f}".rstrip("0").rstrip("."),
                "value_usdt": round(value, 2),
                "sources": list(row["sources"]),
            }
        )
    out.sort(key=lambda a: a["value_usdt"], reverse=True)
    return out


def _upsert_snapshot(
    db: Session,
    user_id: int,
    snapshot_date: date,
    assets: list[dict[str, Any]],
    captured_at: datetime,
) -> PortfolioDailySnapshot:
    total = sum(float(a.get("value_usdt") or 0) for a in assets)
    row = (
        db.query(PortfolioDailySnapshot)
        .filter(
            PortfolioDailySnapshot.user_id == user_id,
            PortfolioDailySnapshot.exchange_name == EXCHANGE_NAME,
            PortfolioDailySnapshot.snapshot_date == snapshot_date,
        )
        .first()
    )
    if row is None:
        row = PortfolioDailySnapshot(
            user_id=user_id,
            exchange_name=EXCHANGE_NAME,
            snapshot_date=snapshot_date,
            total_usdt=total,
            assets=assets,
            captured_at=captured_at,
        )
        db.add(row)
    else:
        row.total_usdt = total
        row.assets = assets
        row.captured_at = captured_at
    db.commit()
    db.refresh(row)
    return row


async def capture_binance_portfolio(user_id: int) -> Optional[PortfolioDailySnapshot]:
    """REST-poll spot + futures wallets and upsert today's UTC snapshot."""
    db = SessionLocal()
    service: ExchangeService | None = None
    now = datetime.now(tz=timezone.utc)
    buckets: dict[str, dict[str, Any]] = {}
    try:
        service = ExchangeService.from_db_credentials(EXCHANGE_NAME, db, user_id=user_id)
        await service.client.load_markets()
        await service._prepare_client_time()

        spot = await _fetch_market_balance(service.client, "spot")
        await _value_wallet(service.client, spot, "spot", now, buckets)

        usdm = await _fetch_market_balance(service.client, "future")
        await _value_wallet(service.client, usdm, "usdm", now, buckets)

        coinm = await _fetch_market_balance(service.client, "delivery")
        await _value_wallet(service.client, coinm, "coinm", now, buckets)

        assets = _serialize_assets(buckets)
        return _upsert_snapshot(db, user_id, now.date(), assets, now)
    except Exception:
        logger.exception("Binance portfolio capture failed for user_id=%s", user_id)
        return None
    finally:
        if service is not None:
            try:
                await service.close()
            except Exception:
                pass
        db.close()


async def run_daily_portfolio_snapshots() -> None:
    db = SessionLocal()
    try:
        user_ids = [
            row[0]
            for row in db.query(APIKey.user_id)
            .filter(APIKey.exchange_name == EXCHANGE_NAME)
            .distinct()
            .all()
        ]
    finally:
        db.close()

    for user_id in user_ids:
        try:
            await capture_binance_portfolio(int(user_id))
        except Exception:
            logger.exception("Daily portfolio snapshot failed for user_id=%s", user_id)


async def portfolio_daily_loop() -> None:
    while True:
        await asyncio.sleep(_seconds_until_next_utc_midnight())
        try:
            await run_daily_portfolio_snapshots()
        except Exception:
            logger.exception("Daily portfolio snapshot run failed")


def _spot_fallback_assets(db: Session, user_id: int) -> tuple[list[dict[str, Any]], datetime | None]:
    latest = (
        db.query(
            BalanceSpotTransaction.asset,
            func.max(BalanceSpotTransaction.executed_at).label("max_at"),
        )
        .filter(
            BalanceSpotTransaction.user_id == user_id,
            BalanceSpotTransaction.exchange_name == EXCHANGE_NAME,
            BalanceSpotTransaction.type == "BALANCE_SNAPSHOT",
        )
        .group_by(BalanceSpotTransaction.asset)
        .subquery()
    )
    rows = (
        db.query(BalanceSpotTransaction)
        .join(
            latest,
            (BalanceSpotTransaction.asset == latest.c.asset)
            & (BalanceSpotTransaction.executed_at == latest.c.max_at),
        )
        .filter(
            BalanceSpotTransaction.user_id == user_id,
            BalanceSpotTransaction.exchange_name == EXCHANGE_NAME,
            BalanceSpotTransaction.type == "BALANCE_SNAPSHOT",
        )
        .all()
    )
    assets: list[dict[str, Any]] = []
    captured: datetime | None = None
    for row in rows:
        amount = float(row.amount or 0)
        rate = float(row.quote_to_usdt_rate or 0)
        value = amount * rate if rate else 0.0
        assets.append(
            {
                "asset": row.asset,
                "amount": str(row.amount),
                "value_usdt": round(value, 2),
                "sources": ["spot"],
            }
        )
        if row.executed_at and (captured is None or row.executed_at > captured):
            captured = row.executed_at
    assets.sort(key=lambda a: a["value_usdt"], reverse=True)
    return assets, captured


def get_binance_portfolio_payload(db: Session, user_id: int) -> dict[str, Any]:
    latest = (
        db.query(PortfolioDailySnapshot)
        .filter(
            PortfolioDailySnapshot.user_id == user_id,
            PortfolioDailySnapshot.exchange_name == EXCHANGE_NAME,
        )
        .order_by(PortfolioDailySnapshot.snapshot_date.desc())
        .first()
    )

    history_rows = (
        db.query(PortfolioDailySnapshot)
        .filter(
            PortfolioDailySnapshot.user_id == user_id,
            PortfolioDailySnapshot.exchange_name == EXCHANGE_NAME,
        )
        .order_by(PortfolioDailySnapshot.snapshot_date.asc())
        .all()
    )
    history = [
        {
            "date": row.snapshot_date.isoformat(),
            "total_usdt": float(row.total_usdt or 0),
        }
        for row in history_rows
    ]

    if latest is not None:
        assets = list(latest.assets or [])
        captured_at = latest.captured_at
        total = float(latest.total_usdt or 0)
    else:
        assets, captured_at = _spot_fallback_assets(db, user_id)
        total = round(sum(float(a.get("value_usdt") or 0) for a in assets), 2)

    needs_capture = latest is None

    return {
        "exchange_name": EXCHANGE_NAME,
        "total_usdt": round(total, 2),
        "assets": assets,
        "captured_at": captured_at.isoformat() if captured_at else None,
        "history": history,
        "needs_capture": needs_capture,
    }
