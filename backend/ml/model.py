"""The barrier-breach model: gradient boosting + Platt calibration, plus simple per-prediction explanations."""
from dataclasses import dataclass, field

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression

from .features import FEATURES, LABELS

# Sanity rules the model must respect (1 = risk can only rise with the feature, -1 = only fall, 0 = learned freely).
# barrier_z = ln(barrier)/(σ√T) is negative; a value closer to 0 means the barrier is close to the start level → riskier.
MONOTONIC = {
    "vol_1m": 1, "vol_3m": 1, "vol_12m": 1,
    "mom_1m": 0, "mom_3m": 0, "mom_12m": 0,
    "drawdown_52w": -1,     # further below the 52-week high (more negative) can never lower risk
    "barrier": 1,
    "tenor_months": 0,
    "barrier_z": 1,
    "downside_vol_12m": 1,
    "skew_12m": 0, "kurt_12m": 0,
    "max_dd_12m": -1,       # a deeper recent fall can never lower risk (guards against survivorship "bounce-back" bias)
    "vol_ratio": 0,
    "is_index": 0,
}


class PlattCalibrator:
    """Smooth calibration: logistic regression on the model's log-odds (stable even where examples are scarce)."""

    def __init__(self) -> None:
        self.lr = LogisticRegression(C=1.0)

    @staticmethod
    def _logit(p: np.ndarray) -> np.ndarray:
        p = np.clip(p, 1e-6, 1 - 1e-6)
        return np.log(p / (1 - p)).reshape(-1, 1)

    def fit(self, raw: np.ndarray, y: np.ndarray) -> "PlattCalibrator":
        self.lr.fit(self._logit(raw), y)
        return self

    def predict(self, raw: np.ndarray) -> np.ndarray:
        return self.lr.predict_proba(self._logit(raw))[:, 1]


@dataclass
class BreachModel:
    gbm: HistGradientBoostingClassifier
    calibrator: PlattCalibrator
    typical: dict = field(default_factory=dict)  # training medians, used as the "typical" reference in explanations
    card: dict = field(default_factory=dict)     # metrics + training details shown in the app

    @staticmethod
    def new_gbm() -> HistGradientBoostingClassifier:
        return HistGradientBoostingClassifier(
            max_iter=400, learning_rate=0.05, max_leaf_nodes=63, min_samples_leaf=100, l2_regularization=0.5,
            monotonic_cst=[MONOTONIC[f] for f in FEATURES], random_state=7,
        )

    def predict(self, rows: np.ndarray) -> np.ndarray:
        raw = self.gbm.predict_proba(rows)[:, 1]
        return np.clip(self.calibrator.predict(raw), 0.0, 1.0)

    def explain(self, f: dict, top: int = 4) -> list[dict]:
        """Effect of each feature = prediction change when it is set back to its typical (training median) value."""
        x = np.array([[f[k] for k in FEATURES]])
        p = float(self.predict(x)[0])
        out = []
        for j, name in enumerate(FEATURES):
            if name in ("tenor_months",):  # a product term, not a market condition
                continue
            x2 = x.copy()
            x2[0, j] = self.typical[name]
            delta = p - float(self.predict(x2)[0])
            out.append({"feature": name, "label": LABELS[name], "value": f[name], "typical": self.typical[name], "effect": round(delta, 4)})
        out.sort(key=lambda d: abs(d["effect"]), reverse=True)
        return [d for d in out[:top] if abs(d["effect"]) >= 0.005]
