import uuid



from sqlalchemy import (

    Boolean,

    Column,

    Date,

    DateTime,

    ForeignKey,

    Integer,

    Numeric,

    String,

    Text,

    func,

)

from sqlalchemy.dialects.postgresql import UUID, JSONB



from database import Base, engine





class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=True)
    email = Column(String(100), nullable=False, unique=True, index=True)
    created_at = Column(DateTime, nullable=True)
    # NULL until the invited user completes first-time activation (set password).
    password_hash = Column(String(255), nullable=True)
    # H1: bump to invalidate all of this user's existing access tokens.
    token_version = Column(Integer, nullable=False, default=0, server_default="0")

    @property
    def is_activated(self) -> bool:
        return self.password_hash is not None





class Trade(Base):

    __tablename__ = "trades"



    id = Column(

        UUID(as_uuid=True),

        primary_key=True,

        default=uuid.uuid4,

        nullable=False,

    )

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    exchange_trade_id = Column(String(128), index=True, nullable=True)

    exchange_name = Column(String(50), nullable=True)

    account_type = Column(String(20), nullable=False, default="spot")

    date = Column(DateTime, nullable=False)

    closed_at = Column(DateTime, nullable=True, index=True)

    pair = Column(String(50), nullable=False)

    side = Column(String(10), nullable=False)

    entry_price = Column(Numeric(18, 8), nullable=True)

    exit_price = Column(Numeric(18, 8), nullable=True)

    quantity = Column(Numeric(18, 8), nullable=False)

    pnl = Column(Numeric(18, 2), nullable=True)

    commission = Column(Numeric(18, 8), nullable=True)

    custom_fields = Column(JSONB, default=dict)

    is_manual = Column(Boolean, nullable=True)

    external_id = Column(String(128), nullable=True)

    notes = Column(Text, nullable=True)

    ai_report = Column(Text, nullable=True, default=None)

    # Futures-only columns. NULL for spot rows; a DB CHECK + backend invariant
    # require market_type to be set whenever account_type != 'spot'.
    market_type = Column(String(10), nullable=True)

    funding = Column(Numeric(18, 8), nullable=True)

    net_pnl_ex_funding = Column(Numeric(18, 2), nullable=True)

    leverage = Column(Integer, nullable=True)

    margin_mode = Column(String(10), nullable=True)

    liquidation_price = Column(Numeric(18, 8), nullable=True)

    # Real MFE/MAE from public klines (NULL until background fill).
    mfe_points = Column(Numeric(24, 8), nullable=True)
    mae_points = Column(Numeric(24, 8), nullable=True)
    mfe_percent = Column(Numeric(18, 8), nullable=True)
    mae_percent = Column(Numeric(18, 8), nullable=True)





class APIKey(Base):

    __tablename__ = "api_keys"



    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    exchange_name = Column(String(50), nullable=False)

    api_key_encrypted = Column(String(512), nullable=False)

    api_secret_encrypted = Column(String(512), nullable=False)





class BalanceSpotTransaction(Base):

    """Raw spot events: fills, balance snapshots, deposits, opening lots."""



    __tablename__ = "balance_spot_transactions"



    id = Column(

        UUID(as_uuid=True),

        primary_key=True,

        default=uuid.uuid4,

        nullable=False,

    )

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    type = Column(String(20), nullable=False)

    amount = Column(Numeric(24, 8), nullable=False)

    asset = Column(String(20), nullable=False)

    executed_at = Column(DateTime(timezone=True), nullable=False, index=True)

    external_id = Column(String(100), nullable=True)

    created_at = Column(

        DateTime(timezone=True),

        nullable=False,

        server_default=func.now(),

    )

    pair = Column(String(50), nullable=True)

    price = Column(Numeric(24, 8), nullable=True)

    quote_asset = Column(String(20), nullable=True)

    fee = Column(Numeric(24, 8), nullable=True)

    fee_asset = Column(String(20), nullable=True)

    exchange_name = Column(String(20), nullable=False, default="binance")

    source = Column(String(20), nullable=True)

    processed_at = Column(DateTime(timezone=True), nullable=True)

    quote_to_usdt_rate = Column(Numeric(24, 8), nullable=True)

    fee_usdt = Column(Numeric(24, 8), nullable=True)

    fx_source = Column(String(20), nullable=True)

    free = Column(Numeric(24, 8), nullable=True)

    locked = Column(Numeric(24, 8), nullable=True)





class PairInventory(Base):

    """WAC state per user and trading pair."""



    __tablename__ = "pair_inventory"



    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    pair = Column(String(50), nullable=False)

    base_asset = Column(String(20), nullable=False)

    quote_asset = Column(String(20), nullable=False)

    qty = Column(Numeric(24, 8), nullable=False, default=0)

    total_cost = Column(Numeric(24, 8), nullable=False, default=0)

    avg_entry_price = Column(Numeric(24, 8), nullable=False, default=0)

    fee_pool = Column(Numeric(24, 8), nullable=False, default=0)

    updated_at = Column(

        DateTime(timezone=True),

        nullable=False,

        server_default=func.now(),

        onupdate=func.now(),

    )





class BinanceWs(Base):

    """Binance User Data Stream session state."""



    __tablename__ = "binance_ws"



    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    account_type = Column(String(20), nullable=False)

    listen_key = Column(String(128), nullable=True)

    listen_key_updated_at = Column(DateTime(timezone=True), nullable=True)

    ws_status = Column(String(20), nullable=False, default="idle")

    last_backfill_at = Column(DateTime(timezone=True), nullable=True)

    last_balance_sync_at = Column(DateTime(timezone=True), nullable=True)

    last_error = Column(Text, nullable=True)

    created_at = Column(

        DateTime(timezone=True),

        nullable=False,

        server_default=func.now(),

    )

    updated_at = Column(

        DateTime(timezone=True),

        nullable=False,

        server_default=func.now(),

        onupdate=func.now(),

    )





class ChatSession(Base):

    __tablename__ = "chat_sessions"

    __table_args__ = {"schema": "public"}



    id = Column(

        UUID(as_uuid=True),

        primary_key=True,

        default=uuid.uuid4,

        nullable=False,

    )

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False)

    updated_at = Column(DateTime(timezone=True), nullable=False)





class ChatMessage(Base):

    __tablename__ = "chat_messages"

    __table_args__ = {"schema": "public"}



    id = Column(

        UUID(as_uuid=True),

        primary_key=True,

        default=uuid.uuid4,

        nullable=False,

    )

    session_id = Column(

        UUID(as_uuid=True),

        ForeignKey("public.chat_sessions.id", ondelete="CASCADE"),

        nullable=False,

        index=True,

    )

    role = Column(String(32), nullable=False)

    content = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), nullable=False)





class FuturesFill(Base):
    """Raw futures fills (USDT-M + COIN-M), analogous to BalanceSpotTransaction.

    One row per Binance userTrade / ORDER_TRADE_UPDATE fill. The aggregator
    walks these chronologically to derive closed positions in `trades`.
    """

    __tablename__ = "futures_fills"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    exchange_name = Column(String(20), nullable=False, default="binance")
    market_type = Column(String(10), nullable=False)  # 'usdm' | 'coinm'
    symbol = Column(String(50), nullable=False)  # ccxt unified, e.g. 'SOL/USD:SOL'
    pair = Column(String(50), nullable=False)  # display, e.g. 'SOL/USD'
    external_id = Column(String(100), nullable=False)  # Binance trade id
    order_id = Column(String(64), nullable=True)
    side = Column(String(10), nullable=False)  # buy | sell
    position_side = Column(String(10), nullable=True)  # LONG | SHORT | BOTH
    price = Column(Numeric(24, 8), nullable=False)
    qty = Column(Numeric(24, 8), nullable=False)
    realized_pnl = Column(Numeric(24, 8), nullable=False, default=0)  # settle asset
    commission = Column(Numeric(24, 8), nullable=False, default=0)  # commission asset
    commission_asset = Column(String(20), nullable=True)
    realized_pnl_usd = Column(Numeric(24, 8), nullable=True)
    commission_usd = Column(Numeric(24, 8), nullable=True)
    executed_at = Column(DateTime(timezone=True), nullable=False)
    source = Column(String(20), nullable=True)  # 'rest' | 'websocket'
    processed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class FuturesFunding(Base):
    """FUNDING_FEE income events, allocated to open positions by time overlap."""

    __tablename__ = "futures_funding"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    market_type = Column(String(10), nullable=False)
    symbol = Column(String(50), nullable=False)
    income = Column(Numeric(24, 8), nullable=False)  # neg = paid
    income_usd = Column(Numeric(24, 8), nullable=True)
    external_id = Column(String(100), nullable=True)  # Binance income tranId
    executed_at = Column(DateTime(timezone=True), nullable=False)
    source = Column(String(20), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class FuturesPositionInventory(Base):
    """Signed position aggregation state (long > 0 / short < 0), per position side."""

    __tablename__ = "futures_position_inventory"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    market_type = Column(String(10), nullable=False)
    symbol = Column(String(50), nullable=False)
    pair = Column(String(50), nullable=False)
    position_side = Column(String(10), nullable=False, default="BOTH")
    qty = Column(Numeric(24, 8), nullable=False, default=0)
    avg_entry_price = Column(Numeric(24, 8), nullable=False, default=0)
    opened_at = Column(DateTime(timezone=True), nullable=True)
    realized_acc = Column(Numeric(24, 8), nullable=False, default=0)
    commission_acc = Column(Numeric(24, 8), nullable=False, default=0)
    # Weighted-average-exit accumulators for the currently open position, so the
    # exit price is correct even when closing fills span multiple sync batches.
    close_qty_acc = Column(Numeric(24, 8), nullable=False, default=0)
    close_notional_acc = Column(Numeric(24, 8), nullable=False, default=0)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class PortfolioDailySnapshot(Base):
    """One combined Binance equity point per UTC day (spot + futures wallets)."""

    __tablename__ = "portfolio_daily_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    exchange_name = Column(String(20), nullable=False, default="binance")
    snapshot_date = Column(Date, nullable=False)
    total_usdt = Column(Numeric(24, 8), nullable=False, default=0)
    assets = Column(JSONB, nullable=False, default=list)
    captured_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Feedback(Base):
    """Post-onboarding product survey (one row per user)."""

    __tablename__ = "feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status = Column(String(32), nullable=False, default="not_offered")
    q1 = Column(Integer, nullable=True)
    q2 = Column(Integer, nullable=True)
    q3 = Column(Integer, nullable=True)
    comment = Column(Text, nullable=True)
    skipped_at = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


if __name__ == "__main__":

    Base.metadata.create_all(bind=engine)


