"""Idempotent schema patches applied at API startup."""

from sqlalchemy import text

from database import engine


def ensure_balance_spot_constraints() -> None:
    """
    After renaming balance_transactions -> balance_spot_transactions,
    PostgreSQL keeps the old CHECK (DEPOSIT/WITHDRAWAL only).
    Both constraints must not coexist — drop the legacy one.
    """
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE balance_spot_transactions "
                "DROP CONSTRAINT IF EXISTS balance_transactions_type_check"
            )
        )
        # Legacy single-user constraint: external_id was globally unique.
        # In multi-user mode the same Binance trade id can appear for
        # different users, so per-user uniqueness (created in
        # ensure_multi_user_constraints) is what we keep — drop the global one.
        conn.execute(
            text(
                "ALTER TABLE balance_spot_transactions "
                "DROP CONSTRAINT IF EXISTS balance_transactions_external_id_key"
            )
        )
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'balance_spot_transactions_type_check'
                          AND conrelid = 'balance_spot_transactions'::regclass
                    ) THEN
                        ALTER TABLE balance_spot_transactions
                            ADD CONSTRAINT balance_spot_transactions_type_check
                            CHECK (
                                type IN (
                                    'BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL',
                                    'BALANCE_SNAPSHOT', 'OPENING_LOT'
                                )
                            );
                    END IF;
                END $$;
                """
            )
        )


def ensure_multi_user_constraints() -> None:
    """Per-user uniqueness for trades, inventory, ws sessions, and spot fills."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_exchange_trade_id_key"
            )
        )
        # Legacy single-user index: exchange_trade_id was globally unique.
        # In multi-user mode the same exchange_trade_id (e.g. wac-<id>) can
        # appear for different users, so per-user uniqueness below is what we
        # keep. Re-create it as a plain (non-unique) lookup index to match the
        # model's index=True intent and preserve query performance.
        conn.execute(text("DROP INDEX IF EXISTS ix_trades_exchange_trade_id"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_trades_exchange_trade_id "
                "ON trades (exchange_trade_id)"
            )
        )
        # Legacy global unique on username breaks multi-user activation when two
        # invited users share the same display name. The model does not declare
        # username unique, so drop it.
        conn.execute(
            text("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key")
        )
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS trades_user_exchange_trade_id_unique
                    ON trades (user_id, exchange_trade_id)
                    WHERE exchange_trade_id IS NOT NULL
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS pair_inventory_user_pair_unique
                    ON pair_inventory (user_id, pair)
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS binance_ws_user_account_unique
                    ON binance_ws (user_id, account_type)
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS balance_spot_user_exchange_external_unique
                    ON balance_spot_transactions (user_id, exchange_name, external_id)
                    WHERE external_id IS NOT NULL
                """
            )
        )


def ensure_futures_tables() -> None:
    """Create the futures aggregation tables (idempotent, create-only).

    Mirrors the spot aggregator layout: raw fills (futures_fills) + funding
    events (futures_funding) + running signed position state
    (futures_position_inventory). Final aggregated trades go into `trades`.
    All tables are strictly multi-user: user_id NOT NULL FK -> users(id) and
    every uniqueness/dedup index is scoped per user_id.

    Does NOT touch the `trades` table or delete any data. The trades column
    extension + spot-only-NULL CHECK is applied later, together with the
    one-time cleanup of legacy raw futures rows.
    """
    with engine.begin() as conn:
        # 1) Raw futures fills (analogous to balance_spot_transactions).
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS futures_fills (
                    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id           integer NOT NULL REFERENCES users(id),
                    exchange_name     varchar(20)  NOT NULL DEFAULT 'binance',
                    market_type       varchar(10)  NOT NULL,
                    symbol            varchar(50)  NOT NULL,
                    pair              varchar(50)  NOT NULL,
                    external_id       varchar(100) NOT NULL,
                    order_id          varchar(64),
                    side              varchar(10)  NOT NULL,
                    position_side     varchar(10),
                    price             numeric(24,8) NOT NULL,
                    qty               numeric(24,8) NOT NULL,
                    realized_pnl      numeric(24,8) NOT NULL DEFAULT 0,
                    commission        numeric(24,8) NOT NULL DEFAULT 0,
                    commission_asset  varchar(20),
                    realized_pnl_usd  numeric(24,8),
                    commission_usd    numeric(24,8),
                    executed_at       timestamptz  NOT NULL,
                    source            varchar(20),
                    processed_at      timestamptz,
                    created_at        timestamptz  NOT NULL DEFAULT now()
                )
                """
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS futures_fills_user_market_ext_unique "
                "ON futures_fills (user_id, market_type, external_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_futures_fills_user_symbol_time "
                "ON futures_fills (user_id, symbol, executed_at)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_futures_fills_user_unprocessed "
                "ON futures_fills (user_id, executed_at) WHERE processed_at IS NULL"
            )
        )

        # 2) Funding events (dedicated table, per user).
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS futures_funding (
                    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id       integer NOT NULL REFERENCES users(id),
                    market_type   varchar(10)  NOT NULL,
                    symbol        varchar(50)  NOT NULL,
                    income        numeric(24,8) NOT NULL,
                    income_usd    numeric(24,8),
                    external_id   varchar(100),
                    executed_at   timestamptz  NOT NULL,
                    source        varchar(20),
                    created_at    timestamptz  NOT NULL DEFAULT now()
                )
                """
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS futures_funding_user_market_ext_unique "
                "ON futures_funding (user_id, market_type, external_id) "
                "WHERE external_id IS NOT NULL"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_futures_funding_user_symbol_time "
                "ON futures_funding (user_id, symbol, executed_at)"
            )
        )

        # 3) Signed position aggregation state (analogous to pair_inventory).
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS futures_position_inventory (
                    id              serial PRIMARY KEY,
                    user_id         integer NOT NULL REFERENCES users(id),
                    market_type     varchar(10)  NOT NULL,
                    symbol          varchar(50)  NOT NULL,
                    pair            varchar(50)  NOT NULL,
                    position_side   varchar(10)  NOT NULL DEFAULT 'BOTH',
                    qty             numeric(24,8) NOT NULL DEFAULT 0,
                    avg_entry_price numeric(24,8) NOT NULL DEFAULT 0,
                    opened_at       timestamptz,
                    realized_acc    numeric(24,8) NOT NULL DEFAULT 0,
                    commission_acc  numeric(24,8) NOT NULL DEFAULT 0,
                    close_qty_acc      numeric(24,8) NOT NULL DEFAULT 0,
                    close_notional_acc numeric(24,8) NOT NULL DEFAULT 0,
                    updated_at      timestamptz  NOT NULL DEFAULT now()
                )
                """
            )
        )
        # Accumulators added after initial table creation — idempotent for DBs
        # that already have futures_position_inventory without these columns.
        conn.execute(
            text(
                "ALTER TABLE futures_position_inventory "
                "ADD COLUMN IF NOT EXISTS close_qty_acc numeric(24,8) NOT NULL DEFAULT 0"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE futures_position_inventory "
                "ADD COLUMN IF NOT EXISTS close_notional_acc numeric(24,8) NOT NULL DEFAULT 0"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS futures_pos_user_symbol_side_unique "
                "ON futures_position_inventory (user_id, symbol, position_side)"
            )
        )


def ensure_trades_futures_columns() -> None:
    """Extend `trades` with nullable futures columns + spot-only-NULL invariant.

    Order matters: add columns, then remove legacy raw futures rows (the old MVP
    wrote per-fill futures rows straight into `trades` with a NULL market_type),
    then add the CHECK so it cannot fail on pre-existing violating rows. All are
    idempotent, so this is safe to run on every startup.
    """
    with engine.begin() as conn:
        for column, ddl_type in (
            ("market_type", "varchar(10)"),
            ("funding", "numeric(18,8)"),
            ("net_pnl_ex_funding", "numeric(18,2)"),
            ("leverage", "integer"),
            ("margin_mode", "varchar(10)"),
            ("liquidation_price", "numeric(18,8)"),
        ):
            conn.execute(
                text(f"ALTER TABLE trades ADD COLUMN IF NOT EXISTS {column} {ddl_type}")
            )

        # One-time cleanup of legacy raw futures rows: any futures row without a
        # market_type is an un-aggregated MVP row. It is re-derived by the
        # aggregator from futures_fills, so drop it. Idempotent: once the
        # aggregator writes rows (which set market_type) nothing matches.
        conn.execute(
            text(
                "DELETE FROM trades "
                "WHERE account_type IN ('future', 'futures') "
                "AND market_type IS NULL"
            )
        )

        # Invariant: futures rows must carry market_type; spot rows leave it NULL.
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'trades_futures_marker_chk'
                          AND conrelid = 'trades'::regclass
                    ) THEN
                        ALTER TABLE trades
                            ADD CONSTRAINT trades_futures_marker_chk
                            CHECK (account_type = 'spot' OR market_type IS NOT NULL);
                    END IF;
                END $$;
                """
            )
        )


def ensure_trades_mfe_columns() -> None:
    """Nullable kline-based MFE/MAE on trades (filled in the background)."""
    with engine.begin() as conn:
        for column, ddl_type in (
            ("mfe_points", "numeric(24,8)"),
            ("mae_points", "numeric(24,8)"),
            ("mfe_percent", "numeric(18,8)"),
            ("mae_percent", "numeric(18,8)"),
        ):
            conn.execute(
                text(f"ALTER TABLE trades ADD COLUMN IF NOT EXISTS {column} {ddl_type}")
            )


def ensure_portfolio_daily_snapshots() -> None:
    """Combined Binance equity points (spot + futures), one row per user per UTC day."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS portfolio_daily_snapshots (
                    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id         integer NOT NULL REFERENCES users(id),
                    exchange_name   varchar(20) NOT NULL DEFAULT 'binance',
                    snapshot_date   date NOT NULL,
                    total_usdt      numeric(24, 8) NOT NULL DEFAULT 0,
                    assets          jsonb NOT NULL DEFAULT '[]'::jsonb,
                    captured_at     timestamptz NOT NULL DEFAULT now()
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS portfolio_daily_user_exchange_date_unique
                    ON portfolio_daily_snapshots (user_id, exchange_name, snapshot_date)
                """
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_portfolio_daily_snapshots_user_id "
                "ON portfolio_daily_snapshots (user_id)"
            )
        )
