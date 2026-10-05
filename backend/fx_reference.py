"""Fixed USD analytics reference rates from Federal Reserve H.10, 25 Sep 2026.

The published EUR/GBP observations are USD per source unit. INR/SGD are source
units per USD and are inverted with Decimal before storage. This reference set
is an analytics convention, not a transaction quote or an FX admin workflow.
"""

from decimal import Decimal, localcontext
import sqlite3


FX_REFERENCE_DATE = "2026-09-25"
FX_REFERENCE_SOURCE = "Federal Reserve H.10, 2026-09-25"
FX_REFERENCE_URL = "https://www.federalreserve.gov/releases/h10/current/"

# Currency code, H.10 observation, quote convention.
H10_USD_QUOTES = (
    ("EUR", "1.1400", "USD_PER_SOURCE"),
    ("GBP", "1.3250", "USD_PER_SOURCE"),
    ("INR", "95.8100", "SOURCE_PER_USD"),
    ("SGD", "1.2771", "SOURCE_PER_USD"),
)


def usd_rate(quote: str, convention: str) -> str:
    value = Decimal(quote)
    if convention == "USD_PER_SOURCE":
        return format(value, "f")
    if convention == "SOURCE_PER_USD":
        with localcontext() as context:
            context.prec = 30
            return format(Decimal(1) / value, ".24f")
    raise ValueError(f"Unsupported quote convention: {convention}")


def seed_usd_reference_rates(connection: sqlite3.Connection) -> None:
    """Insert only missing rows for currencies already configured in this DB."""
    currency_ids = dict(connection.execute("SELECT currency_code,currency_id FROM currency"))
    target_id = currency_ids.get("USD")
    if target_id is None:
        return
    for code, quote, convention in H10_USD_QUOTES:
        source_id = currency_ids.get(code)
        if source_id is None:
            continue
        connection.execute("""INSERT INTO fx_rate
            (source_currency_id,target_currency_id,rate_date,rate,source,approved)
            VALUES(?,?,?,?,?,1)
            ON CONFLICT(source_currency_id,target_currency_id,rate_date) DO NOTHING""",
            (source_id, target_id, FX_REFERENCE_DATE,
             usd_rate(quote, convention), FX_REFERENCE_SOURCE))
