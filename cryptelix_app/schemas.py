from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TradeBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    date: datetime
    pair: str
    side: str
    entry_price: float
    exit_price: float | None = None
    quantity: float
    pnl: float | None = None
    commission: float | None = None
    notes: str | None = None
    ai_report: str | None = None
    custom_fields: dict = {}
    exchange_trade_id: str
    exchange_name: str
    account_type: str = "spot"


class TradeCreate(TradeBase):
    model_config = ConfigDict(from_attributes=True)


class TradeUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    date: datetime | None = None
    pair: str | None = None
    side: str | None = None
    entry_price: float | None = None
    exit_price: float | None = None
    quantity: float | None = None
    pnl: float | None = None
    commission: float | None = None
    notes: str | None = None
    ai_report: str | None = None
    custom_fields: dict | None = None


class Trade(TradeBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    is_manual: bool | None = None


class APIKeyBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    exchange_name: str
    api_key_encrypted: str
    api_secret_encrypted: str


class APIKeyCreate(APIKeyBase):
    model_config = ConfigDict(from_attributes=True)


class APIKey(APIKeyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class ExchangeCredentialsUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    exchange_name: str
    api_key: str = Field(..., min_length=1, max_length=512)
    api_secret: str = Field(..., min_length=1, max_length=512)


class ExchangeSyncTradesRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    limit: int = Field(default=100, ge=1, le=1000)
    since: int | None = Field(default=None, ge=0)
    account_type: str = Field(default="spot", min_length=3, max_length=20)


class ChatSendRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    session_id: UUID | None = None
    message: str = Field(..., min_length=1, max_length=32000)


class AuthEmailRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)


class AuthActivateRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    invite_code: str = Field(..., min_length=1, max_length=128)
    # Cloudflare Turnstile token (optional; enforced only when TURNSTILE_SECRET set).
    turnstile_token: str | None = Field(default=None, max_length=4096)


class AuthLoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)
    # Cloudflare Turnstile token (optional; enforced only when TURNSTILE_SECRET set).
    turnstile_token: str | None = Field(default=None, max_length=4096)


class UserPublic(BaseModel):
    id: int
    email: str
    username: str | None = None


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class CheckEmailResponse(BaseModel):
    status: str
    email: str


class FeedbackStatusResponse(BaseModel):
    has_row: bool
    status: str | None = None
    created_at: str | None = None
    skipped_at: str | None = None
    force: bool = False
    can_offer: bool = False
    required_active_ms: int
    skip_cooldown_seconds: int


class FeedbackSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    q1: int = Field(..., ge=0, le=2)
    q2: int = Field(..., ge=0, le=2)
    q3: int = Field(..., ge=0, le=2)
    comment: str | None = Field(default=None, max_length=4000)

