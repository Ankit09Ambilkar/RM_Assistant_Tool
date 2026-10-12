"""Features for the barrier-breach model. Shared by training and live scoring, so both compute exactly the same thing.

All features use only prices up to the start date (no look-ahead).
"""
import math

import numpy as np

TRADING_DAYS = 252
FEATURES = [
    "vol_1m", "vol_3m", "vol_12m",       # annualised volatility of daily log returns
    "mom_1m", "mom_3m", "mom_12m",       # trailing returns
    "drawdown_52w",                      # close vs 52-week high (≤ 0)
    "barrier", "tenor_months",           # product terms (barrier as a fraction of the start level)
    "barrier_z",                         # distance to barrier in volatility units: ln(barrier) / (vol_12m * sqrt(T))
    "downside_vol_12m",                  # volatility of down days only
    "skew_12m", "kurt_12m",              # shape of the return distribution (crash-proneness, fat tails)
    "max_dd_12m",                        # worst peak-to-trough fall in the past year (≤ 0)
    "vol_ratio",                         # vol_1m / vol_12m: is volatility rising?
    "is_index",
]
MIN_HISTORY = TRADING_DAYS + 1  # need a full year of history before a start date

# Readable names for the factor explanations shown in the app.
LABELS = {
    "vol_1m": "1-month volatility",
    "vol_3m": "3-month volatility",
    "vol_12m": "12-month volatility",
    "mom_1m": "1-month momentum",
    "mom_3m": "3-month momentum",
    "mom_12m": "12-month momentum",
    "drawdown_52w": "Distance below 52-week high",
    "barrier": "Barrier level",
    "tenor_months": "Tenor",
    "barrier_z": "Barrier distance (in volatility units)",
    "downside_vol_12m": "Downside volatility",
    "skew_12m": "Return skew (crash-proneness)",
    "kurt_12m": "Fat tails (kurtosis)",
    "max_dd_12m": "Worst fall in the past year",
    "vol_ratio": "Volatility trend (1m vs 12m)",
    "is_index": "Index vs single stock",
}


def _vol(logret: np.ndarray, n: int) -> float:
    return float(np.std(logret[-n:], ddof=1) * math.sqrt(TRADING_DAYS))


def _moment(x: np.ndarray, k: int) -> float:
    sd = np.std(x)
    return float(np.mean(((x - x.mean()) / sd) ** k)) if sd > 0 else 0.0


def features_at(closes: np.ndarray, i: int, barrier: float, tenor_months: int, is_index: bool) -> dict:
    """Features for a product starting at index i of `closes` (uses closes[:i+1] only)."""
    window = closes[i - TRADING_DAYS: i + 1]
    logret = np.diff(np.log(window))
    vol_12m = _vol(logret, TRADING_DAYS)
    t_years = tenor_months / 12
    return {
        "vol_1m": _vol(logret, 21),
        "vol_3m": _vol(logret, 63),
        "vol_12m": vol_12m,
        "mom_1m": float(window[-1] / window[-22] - 1),
        "mom_3m": float(window[-1] / window[-64] - 1),
        "mom_12m": float(window[-1] / window[0] - 1),
        "drawdown_52w": float(window[-1] / window.max() - 1),
        "barrier": barrier,
        "tenor_months": float(tenor_months),
        "barrier_z": float(math.log(barrier) / max(vol_12m * math.sqrt(t_years), 1e-6)),
        "downside_vol_12m": float(np.sqrt(np.mean(np.minimum(logret, 0) ** 2)) * math.sqrt(TRADING_DAYS)),
        "skew_12m": _moment(logret, 3),
        "kurt_12m": _moment(logret, 4) - 3.0,
        "max_dd_12m": float((window / np.maximum.accumulate(window) - 1).min()),
        "vol_ratio": float(_vol(logret, 21) / max(vol_12m, 1e-6)),
        "is_index": 1.0 if is_index else 0.0,
    }


def baseline_probability(f: dict) -> float:
    """Volatility-only benchmark: lognormal, zero drift. P(S_T < barrier · S_0)."""
    sigma = max(f["vol_12m"], 1e-6)
    t = f["tenor_months"] / 12
    z = (math.log(f["barrier"]) + 0.5 * sigma * sigma * t) / (sigma * math.sqrt(t))
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))
