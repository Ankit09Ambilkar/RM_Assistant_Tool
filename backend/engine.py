"""Deterministic payoff + suitability engine (Barrier Reverse Convertible, barrier observed at maturity).

- Coupon is always paid: notional x coupon% x tenor/12.
- Final level >= barrier: full notional returned.
- Final level <  barrier: notional x (final / strike), i.e. the client takes the underlying's loss.
"""
from market import get_underlying

HORIZON_MAX_MONTHS = {"< 1 Year": 12, "1–3 Years": 36, "3–5 Years": 60, "5+ Years": 120}
RISK_SCORE = {"Conservative": 1, "Moderate": 2, "Aggressive": 3}


# ---------- payoff ----------

def coupon_amount(p: dict) -> float:
    return p["notional"] * (p["couponPct"] / 100) * (p["tenorMonths"] / 12)


def final_value_at(p: dict, level_pct: float) -> tuple[float, bool]:
    breached = level_pct < p["barrierPct"]
    capital = p["notional"] * (level_pct / p["strikePct"]) if breached else p["notional"]
    return capital + coupon_amount(p), breached


def scenario(p: dict, name: str, move_pct: float) -> dict:
    final_value, breached = final_value_at(p, 100 + move_pct)
    pnl = final_value - p["notional"]
    return {
        "name": name,
        "movePct": move_pct,
        "finalValue": round(final_value, 2),
        "pnl": round(pnl, 2),
        "returnPct": round(pnl / p["notional"] * 100, 4),
        "barrierBreached": breached,
    }


def preset_scenarios(p: dict) -> list[dict]:
    breach_move = p["barrierPct"] - 100 - 1
    presets = [("Market +10%", 10), ("Sideways", 0), ("Market −10%", -10), ("Market −20%", -20),
               ("Market −30%", -30), ("Market −40%", -40), (f"Barrier breach ({breach_move:g}%)", breach_move)]
    return [scenario(p, n, m) for n, m in presets]


def payoff_curve(p: dict) -> list[dict]:
    return [{"level": lvl, "value": round(final_value_at(p, lvl)[0])} for lvl in range(0, 151)]


def worst_case_loss_pct(p: dict) -> float:
    return max(0.0, -scenario(p, "", -100)["returnPct"])


def stress_move_pct(kind: str) -> int:
    """Illustrative severe-but-plausible fall: bigger for single stocks than for indices."""
    return -25 if kind == "Index" else -40


# ---------- suitability ----------

def product_risk(p: dict) -> dict:
    u = get_underlying(p["underlying"])
    score = 1 if u["kind"] == "Index" else 2
    if p["barrierPct"] >= 80:
        score += 1
    label = "Conservative" if score <= 1 else "Moderate" if score == 2 else "Aggressive"
    return {"score": score, "label": label}


def run_suitability(c: dict, p: dict) -> list[dict]:
    u = get_underlying(p["underlying"])
    out: list[dict] = []

    # 1. Risk appetite
    pr = product_risk(p)
    if pr["score"] <= RISK_SCORE[c["riskAppetite"]]:
        out.append({"dimension": "Risk Appetite", "status": "MATCH", "source_rule": "risk_v1",
                    "reason": f"Product risk is {pr['label'].lower()} ({u['kind'].lower()} underlying, {p['barrierPct']:g}% barrier), within the client's {c['riskAppetite'].lower()} risk appetite."})
    else:
        out.append({"dimension": "Risk Appetite", "status": "MISMATCH", "source_rule": "risk_v1",
                    "reason": f"Product risk is {pr['label'].lower()} but the client's risk appetite is {c['riskAppetite'].lower()}.",
                    "action": "Try an index underlying or a lower barrier."})

    # 2. Investment horizon
    max_months = HORIZON_MAX_MONTHS[c["horizon"]]
    if p["tenorMonths"] > max_months:
        out.append({"dimension": "Investment Horizon", "status": "MISMATCH", "source_rule": "horizon_v1",
                    "reason": f"{p['tenorMonths']}-month maturity is longer than the client's {c['horizon']} horizon.",
                    "action": f"Choose a tenor of {max_months} months or less."})
    elif c["liquidityNeed"] == "High" and p["tenorMonths"] > 12:
        out.append({"dimension": "Investment Horizon", "status": "WARNING", "source_rule": "horizon_v1",
                    "reason": f"Tenor fits the {c['horizon']} horizon, but the client has a high liquidity need and early exit may be costly.",
                    "action": "Consider a 12-month or shorter tenor."})
    else:
        out.append({"dimension": "Investment Horizon", "status": "MATCH", "source_rule": "horizon_v1",
                    "reason": f"{p['tenorMonths']}-month maturity fits the client's {c['horizon']} horizon."})

    # 3. Loss tolerance: loss in an illustrative stress scenario vs the client's stated limit
    stress = stress_move_pct(u["kind"])
    stress_loss = max(0.0, -scenario(p, "", stress)["returnPct"])
    worst = worst_case_loss_pct(p)
    if stress_loss > c["maxLossPct"]:
        out.append({"dimension": "Loss Tolerance", "status": "MISMATCH", "source_rule": "loss_v2",
                    "reason": f"If {u['name']} falls {-stress}% (stress scenario), the {p['barrierPct']:g}% barrier is breached and the product loses about {stress_loss:.0f}%, above the client's stated {c['maxLossPct']:g}% limit.",
                    "action": "Lower the barrier, use an index underlying, or reduce the amount."})
    elif stress_loss > 0:
        out.append({"dimension": "Loss Tolerance", "status": "WARNING", "source_rule": "loss_v2",
                    "reason": f"In a {-stress}% stress scenario the loss is about {stress_loss:.0f}%, within the {c['maxLossPct']:g}% limit, but a deeper fall could lose up to {worst:.0f}%.",
                    "action": "Make sure the client understands the deep-crash scenario."})
    else:
        out.append({"dimension": "Loss Tolerance", "status": "MATCH", "source_rule": "loss_v2",
                    "reason": f"The {p['barrierPct']:g}% barrier holds in a {-stress}% stress scenario, so there is no capital loss. A fall below the barrier could still lose up to {worst:.0f}%."})

    # 4. Concentration
    is_stock = u["kind"] == "Stock"
    client_sector = get_underlying(c["preferredUnderlying"])["sector"]
    exposure = c["sectorExposurePct"] if client_sector == u["sector"] else 0
    if not is_stock:
        out.append({"dimension": "Concentration", "status": "MATCH", "source_rule": "conc_v1",
                    "reason": f"{u['name']} is a diversified index, so it does not add single-sector concentration."})
    elif exposure >= 50:
        out.append({"dimension": "Concentration", "status": "MISMATCH", "source_rule": "conc_v1",
                    "reason": f"Existing {u['sector'].lower()} exposure is already {exposure:g}%. Adding {u['name']} increases it further.",
                    "action": "Use a diversified index or a different sector."})
    elif exposure >= 25:
        out.append({"dimension": "Concentration", "status": "WARNING", "source_rule": "conc_v1",
                    "reason": f"Existing {u['sector'].lower()} exposure: {exposure:g}%. Underlying: {u['name']} ({u['sector']}).",
                    "action": "Consider a diversified index underlying."})
    else:
        out.append({"dimension": "Concentration", "status": "MATCH", "source_rule": "conc_v1",
                    "reason": f"Existing {u['sector'].lower()} exposure is {exposure:g}%, which is a manageable level."})

    return out


def analyze(profile: dict, product: dict) -> dict:
    suit = run_suitability(profile, product)
    return {
        "scenarios": preset_scenarios(product),
        "curve": payoff_curve(product),
        "suitability": suit,
        "concerns": sum(1 for s in suit if s["status"] != "MATCH"),
        "productRisk": product_risk(product),
        "couponAmount": round(coupon_amount(product), 2),
        "worstCaseLossPct": round(worst_case_loss_pct(product), 2),
        "engine": "python",
    }
