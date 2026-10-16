"""Normalized records keep statistical dates separate from publication times."""
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

@dataclass(frozen=True)
class Observation:
    period_date: date
    value: Decimal | None
    published_at: datetime | None = None
    observed_at: datetime | None = None
    quality_flags: list[str] = field(default_factory=list)

@dataclass(frozen=True)
class Bar:
    trading_date: date
    bar_time: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal | None = None
    observed_at: datetime | None = None
    quality_flags: list[str] = field(default_factory=list)

@dataclass(frozen=True)
class Quote:
    value: Decimal
    asof_at: datetime
    fetched_at: datetime
    currency: str
    quality_flags: list[str] = field(default_factory=list)
    market_state: str = 'unknown'
