"""Supported underlyings + real market data from Yahoo Finance (yfinance), cached in memory."""
import math
import time
from datetime import datetime, timezone

UNDERLYINGS = [
    {"ticker": "NVDA", "symbol": "NVDA", "name": "NVIDIA", "sector": "Technology", "kind": "Stock"},
    {"ticker": "AAPL", "symbol": "AAPL", "name": "Apple", "sector": "Technology", "kind": "Stock"},
    {"ticker": "MSFT", "symbol": "MSFT", "name": "Microsoft", "sector": "Technology", "kind": "Stock"},
    {"ticker": "TSLA", "symbol": "TSLA", "name": "Tesla", "sector": "Automobiles", "kind": "Stock"},
    {"ticker": "RELIANCE", "symbol": "RELIANCE.NS", "name": "Reliance Industries", "sector": "Energy", "kind": "Stock"},
    {"ticker": "HDFCBANK", "symbol": "HDFCBANK.NS", "name": "HDFC Bank", "sector": "Financials", "kind": "Stock"},
    {"ticker": "NIFTY50", "symbol": "^NSEI", "name": "NIFTY 50", "sector": "Diversified Index", "kind": "Index"},
    {"ticker": "SPX", "symbol": "^GSPC", "name": "S&P 500", "sector": "Diversified Index", "kind": "Index"},
]
_BY_TICKER = {u["ticker"]: u for u in UNDERLYINGS}
TICKERS = frozenset(_BY_TICKER)


def get_underlying(ticker: str) -> dict:
    return _BY_TICKER.get(ticker, UNDERLYINGS[0])


_cache: dict[tuple[str, str], tuple[float, dict]] = {}
CACHE_SECONDS = 15 * 60


def market_data(ticker: str, period: str = "1y") -> dict:
    """Reference price + history for an underlying. Raises on failure (caller returns 502)."""
    key = (ticker, period)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]

    import yfinance as yf  # imported lazily so the API starts fast

    u = get_underlying(ticker)
    t = yf.Ticker(u["symbol"])
    hist = t.history(period=period, interval="1d" if period in ("1mo", "3mo", "6mo", "1y", "2y") else "1wk")
    if hist.empty:
        raise RuntimeError(f"No market data returned for {u['symbol']}")

    closes = hist["Close"].dropna()
    returns = closes.pct_change().dropna()
    vol = float(returns.std() * math.sqrt(252) * 100) if len(returns) > 2 else None
    try:
        currency = t.fast_info.get("currency") or ("INR" if u["symbol"].endswith(".NS") or u["symbol"] == "^NSEI" else "USD")
    except Exception:
        currency = "INR" if u["symbol"].endswith(".NS") or u["symbol"] == "^NSEI" else "USD"

    data = {
        **u,
        "currency": currency,
        "lastPrice": round(float(closes.iloc[-1]), 2),
        "asOf": closes.index[-1].date().isoformat(),
        "periodChangePct": round(float((closes.iloc[-1] / closes.iloc[0] - 1) * 100), 2),
        "periodHigh": round(float(closes.max()), 2),
        "periodLow": round(float(closes.min()), 2),
        "annualVolatilityPct": round(vol, 1) if vol is not None else None,
        "period": period,
        "history": [{"date": d.date().isoformat(), "close": round(float(v), 2)} for d, v in closes.items()],
        "source": "Yahoo Finance via yfinance",
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    _cache[key] = (time.time(), data)
    return data
