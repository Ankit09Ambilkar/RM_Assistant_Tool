"""Train the barrier-breach model on real price history (yfinance).

Run from backend/:   .venv/bin/python -m ml.train_breach_model
Writes ml/breach_model.joblib (the served model) and ml/model_card.json (metrics, data, period).

Label: for a product started on day t with barrier B and tenor T, did the price close below B × start at maturity?
(This app's payoff engine observes the barrier at maturity, so this is exactly when the client takes a capital loss.)

Validation is strictly out-of-time: train on products whose maturity is before CUTOFF, test on products that start
after CUTOFF (the 2022 bear market and after). No product's label period overlaps the other set.
"""
import json
import math
import warnings
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.metrics import brier_score_loss, roc_auc_score

from .features import FEATURES, MIN_HISTORY, TRADING_DAYS, baseline_probability, features_at
from .model import BreachModel, PlattCalibrator

warnings.filterwarnings("ignore")
HERE = Path(__file__).parent

# Training universe: the app's 8 underlyings + more liquid US/Indian large caps and indices (more history = better model).
INDICES = ["^GSPC", "^NSEI", "^IXIC", "^DJI", "^NSEBANK"]
STOCKS = [
    "NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "GOOGL", "META", "JPM", "XOM", "JNJ", "PG", "KO", "INTC", "AMD", "NFLX",
    "BA", "DIS", "WMT", "RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "INFY.NS", "ICICIBANK.NS", "SBIN.NS", "ITC.NS",
    "LT.NS", "BHARTIARTL.NS", "AXISBANK.NS", "MARUTI.NS", "SUNPHARMA.NS",
]
BARRIERS = [0.50, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90]
TENORS = [6, 12, 18, 24]
STEP_DAYS = 5  # one start date per trading week
CUTOFF = pd.Timestamp("2022-01-01")


def download() -> dict[str, pd.Series]:
    data = yf.download(INDICES + STOCKS, period="13y", interval="1d", auto_adjust=True, progress=False, group_by="ticker", threads=True)
    out = {}
    for sym in INDICES + STOCKS:
        try:
            s = data[sym]["Close"].dropna()
        except KeyError:
            continue
        if len(s) > MIN_HISTORY + TRADING_DAYS:
            out[sym] = s
    return out


def build_samples(prices: dict[str, pd.Series]) -> pd.DataFrame:
    rows = []
    for sym, s in prices.items():
        closes, dates = s.to_numpy(dtype=float), s.index
        is_index = sym in INDICES
        for tenor in TENORS:
            horizon = round(tenor / 12 * TRADING_DAYS)
            for i in range(MIN_HISTORY, len(closes) - horizon, STEP_DAYS):
                start, end = closes[i], closes[i + horizon]
                for b in BARRIERS:
                    f = features_at(closes, i, b, tenor, is_index)
                    f.update(symbol=sym, start=dates[i].tz_localize(None), maturity=dates[i + horizon].tz_localize(None),
                             label=int(end < b * start))
                    rows.append(f)
    return pd.DataFrame(rows)


def fit(train: pd.DataFrame) -> BreachModel:
    """Gradient boosting on the earlier 80% of dates, Platt calibration on the later 20% (time-ordered)."""
    cut = train["start"].quantile(0.8)
    fit_part, cal_part = train[train["start"] < cut], train[train["start"] >= cut]
    gbm = BreachModel.new_gbm().fit(fit_part[FEATURES].to_numpy(), fit_part["label"].to_numpy())
    raw = gbm.predict_proba(cal_part[FEATURES].to_numpy())[:, 1]
    cal = PlattCalibrator().fit(raw, cal_part["label"].to_numpy())
    typical = {f: float(train[f].median()) for f in FEATURES}
    return BreachModel(gbm=gbm, calibrator=cal, typical=typical)


def evaluate(model: BreachModel, test: pd.DataFrame) -> dict:
    y = test["label"].to_numpy()
    p = model.predict(test[FEATURES].to_numpy())
    base = np.array([baseline_probability(r) for r in test[FEATURES].to_dict("records")])
    bins = pd.cut(p, [0, 0.05, 0.1, 0.2, 0.3, 0.5, 1.0], include_lowest=True)
    calib = (pd.DataFrame({"bin": bins, "p": p, "y": y}).groupby("bin", observed=True)
             .agg(predicted=("p", "mean"), actual=("y", "mean"), n=("y", "size")).reset_index())
    return {
        "auc": round(float(roc_auc_score(y, p)), 3),
        "brier": round(float(brier_score_loss(y, p)), 4),
        "baseline_auc": round(float(roc_auc_score(y, base)), 3),
        "baseline_brier": round(float(brier_score_loss(y, base)), 4),
        "base_rate": round(float(y.mean()), 4),
        "n_test": int(len(test)),
        "calibration": [{"bin": str(r.bin), "predicted": round(float(r.predicted), 3), "actual": round(float(r.actual), 3), "n": int(r.n)} for r in calib.itertuples()],
    }


def main() -> None:
    print("Downloading price history…")
    prices = download()
    print(f"  {len(prices)} assets")
    df = build_samples(prices)
    print(f"  {len(df):,} training examples ({df['label'].mean():.1%} breached)")

    train = df[df["maturity"] < CUTOFF]
    test = df[df["start"] >= CUTOFF]
    print(f"  out-of-time split: train {len(train):,} (maturity < {CUTOFF.date()}), test {len(test):,} (start ≥ {CUTOFF.date()})")

    metrics = evaluate(fit(train), test)
    print(f"  TEST  model AUC {metrics['auc']}  Brier {metrics['brier']}  |  volatility-only baseline AUC {metrics['baseline_auc']}  Brier {metrics['baseline_brier']}")

    # Final served model: same recipe, refit on every labelled example.
    final = fit(df)
    final.card = {
        "name": "Barrier-breach risk model",
        "algorithm": "Gradient boosting (scikit-learn HistGradientBoosting) + Platt calibration, monotonic constraints",
        "label": "Price closes below the barrier at maturity",
        "features": FEATURES,
        "assets": sorted(prices),
        "n_assets": len(prices),
        "n_examples": int(len(df)),
        "data_from": str(df["start"].min().date()),
        "data_to": str(df["maturity"].max().date()),
        "barriers": BARRIERS,
        "tenors": TENORS,
        "test": {"period": f"products starting {CUTOFF.date()} or later (out-of-time)", **metrics},
        "limitations": [
            "Survivorship bias: the training universe is today's large caps, so risk may be understated for very volatile single stocks. The app shows the volatility-only estimate alongside.",
            "Historical implied volatility is not available from free data, so it is not a feature.",
            "Estimates, not predictions: trained on 2013-2026 price behaviour; regimes can change.",
        ],
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    joblib.dump(final, HERE / "breach_model.joblib", compress=3)
    (HERE / "model_card.json").write_text(json.dumps(final.card, indent=2))
    print(f"Saved ml/breach_model.joblib and ml/model_card.json")


if __name__ == "__main__":
    main()
