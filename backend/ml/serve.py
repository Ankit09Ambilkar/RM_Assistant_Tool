"""Live scoring: today's market features for an underlying → calibrated breach probability + explanations."""
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

from market import get_underlying, market_data

from .features import FEATURES, MIN_HISTORY, baseline_probability, features_at

MODEL_PATH = Path(__file__).parent / "breach_model.joblib"


@lru_cache(maxsize=1)
def load_model():
    if not MODEL_PATH.exists():
        raise FileNotFoundError("ml/breach_model.joblib is missing. Train it with: .venv/bin/python -m ml.train_breach_model")
    return joblib.load(MODEL_PATH)


def breach_risk(ticker: str, barrier_pct: float, tenor_months: int) -> dict:
    model = load_model()
    md = market_data(ticker, "2y")  # needs > 1 year of daily closes
    closes = np.array([p["close"] for p in md["history"]], dtype=float)
    if len(closes) < MIN_HISTORY:
        raise ValueError(f"Not enough price history for {ticker}")

    card = model.card
    barrier = barrier_pct / 100
    # The model was trained on barriers 50–90% and tenors 6–24 months; clamp beyond that and say so.
    b_used = min(max(barrier, min(card["barriers"])), max(card["barriers"]))
    t_used = min(max(tenor_months, min(card["tenors"])), max(card["tenors"]))
    out_of_range = b_used != barrier or t_used != tenor_months

    f = features_at(closes, len(closes) - 1, b_used, t_used, get_underlying(ticker)["kind"] == "Index")
    prob = float(model.predict(np.array([[f[k] for k in FEATURES]]))[0])
    test = card["test"]
    return {
        "probability": round(prob, 4),
        "baselineProbability": round(baseline_probability(f), 4),
        "factors": model.explain(f),
        "outOfRange": out_of_range,
        "asOf": md["asOf"],
        "model": {
            "name": card["name"],
            "algorithm": card["algorithm"],
            "label": card["label"],
            "nAssets": card["n_assets"],
            "nExamples": card["n_examples"],
            "dataFrom": card["data_from"],
            "dataTo": card["data_to"],
            "testPeriod": test["period"],
            "auc": test["auc"],
            "baselineAuc": test["baseline_auc"],
            "brier": test["brier"],
            "baselineBrier": test["baseline_brier"],
        },
    }
