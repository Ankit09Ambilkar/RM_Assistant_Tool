"""Phase 1 Contract & Backward-Compatibility Tests.

Verifies:
1. Pydantic Profile, ClientIn, ClientUpdate with and without notes / extractedFacts.
2. db.client_row backward-compatibility with legacy rows.
3. Engine compatibility (engine.analyze produces identical results whether notes exist or not).
"""
import json
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent))

import db
import engine
from main import ClientIn, ClientUpdate, Profile

def test_profile_backward_compatibility():
    # Legacy profile without notes or extractedFacts
    legacy_data = {
        "goal": "Regular Income",
        "investmentAmount": 500000,
        "horizon": "1–3 Years",
        "riskAppetite": "Moderate",
        "maxLossPct": 15,
        "liquidityNeed": "Medium",
        "experience": "Some",
        "preferredUnderlying": "NVDA",
        "sectorExposurePct": 28,
    }
    p = Profile(**legacy_data)
    assert p.notes == "", f"Expected empty notes default, got {p.notes!r}"
    assert p.extractedFacts == [], f"Expected empty extractedFacts default, got {p.extractedFacts!r}"
    print("[PASS] Profile backward-compatibility (legacy profile without notes)")

def test_profile_with_notes_and_facts():
    data = {
        "goal": "Growth",
        "investmentAmount": 1000000,
        "horizon": "3–5 Years",
        "riskAppetite": "Aggressive",
        "maxLossPct": 25,
        "liquidityNeed": "Low",
        "experience": "Experienced",
        "preferredUnderlying": "AAPL",
        "sectorExposurePct": 15,
        "notes": "Client plans to retire in 5 years and prefers tech stocks.",
        "extractedFacts": [
            {"field": "horizon", "label": "Investment Horizon", "value": "3–5 Years", "confirmed": True}
        ],
    }
    p = Profile(**data)
    assert p.notes == "Client plans to retire in 5 years and prefers tech stocks."
    assert len(p.extractedFacts) == 1
    assert p.extractedFacts[0]["confirmed"] is True
    print("[PASS] Profile with notes and extractedFacts validates correctly")

def test_client_in_and_update():
    legacy_profile = {
        "goal": "Preserve Capital",
        "investmentAmount": 300000,
        "horizon": "< 1 Year",
        "riskAppetite": "Conservative",
        "maxLossPct": 5,
        "liquidityNeed": "High",
        "experience": "None",
        "preferredUnderlying": "NIFTY50",
        "sectorExposurePct": 0,
    }
    # Test ClientIn without notes
    cin = ClientIn(rmId="rm-1", name="Test Client", profile=Profile(**legacy_profile))
    assert cin.notes == ""
    assert cin.extractedFacts == []

    # Test ClientIn with notes
    cin2 = ClientIn(
        rmId="rm-1",
        name="Test Client 2",
        profile=Profile(**legacy_profile),
        notes="Meeting notes from initial call",
        extractedFacts=[{"field": "goal", "label": "Goal", "value": "Preserve Capital", "confirmed": True}]
    )
    assert cin2.notes == "Meeting notes from initial call"
    assert len(cin2.extractedFacts) == 1

    # Test ClientUpdate
    cup = ClientUpdate(notes="Updated meeting notes")
    assert cup.notes == "Updated meeting notes"
    assert cup.profile is None
    print("[PASS] ClientIn and ClientUpdate models validate correctly")

def test_db_client_row_backward_compatibility():
    # Simulate a database row created before Phase 1 (no notes/extractedFacts in profile JSON)
    legacy_profile_json = json.dumps({
        "goal": "Regular Income",
        "investmentAmount": 500000,
        "horizon": "1–3 Years",
        "riskAppetite": "Moderate",
        "maxLossPct": 15,
        "liquidityNeed": "Medium",
        "experience": "Some",
        "preferredUnderlying": "NVDA",
        "sectorExposurePct": 28,
    })
    mock_row = {
        "id": "c-test-1",
        "rm_id": "rm-1",
        "name": "Legacy Client",
        "profile": legacy_profile_json,
        "interpretation": "Test interpretation",
        "created_at": "2026-09-28T10:00:00Z",
    }
    res = db.client_row(mock_row)
    assert res["id"] == "c-test-1"
    assert res["notes"] == ""
    assert res["extractedFacts"] == []
    assert res["profile"]["goal"] == "Regular Income"

    # Simulate a database row with notes and extracted facts
    new_profile_json = json.dumps({
        "goal": "Regular Income",
        "investmentAmount": 500000,
        "horizon": "1–3 Years",
        "riskAppetite": "Moderate",
        "maxLossPct": 15,
        "liquidityNeed": "Medium",
        "experience": "Some",
        "preferredUnderlying": "NVDA",
        "sectorExposurePct": 28,
        "notes": "Prefers dividend-paying structured products",
        "extractedFacts": [{"field": "notes", "label": "Notes", "value": "yes", "confirmed": True}]
    })
    mock_new_row = {
        "id": "c-test-2",
        "rm_id": "rm-1",
        "name": "New Client",
        "profile": new_profile_json,
        "interpretation": "Test interpretation",
        "created_at": "2026-10-14T10:00:00Z",
    }
    res2 = db.client_row(mock_new_row)
    assert res2["id"] == "c-test-2"
    assert res2["notes"] == "Prefers dividend-paying structured products"
    assert len(res2["extractedFacts"]) == 1
    print("[PASS] db.client_row preserves backward-compatibility with legacy rows and reads new rows")

def test_engine_suitability_unchanged():
    legacy_profile = {
        "goal": "Regular Income",
        "investmentAmount": 500000,
        "horizon": "1–3 Years",
        "riskAppetite": "Moderate",
        "maxLossPct": 15,
        "liquidityNeed": "Medium",
        "experience": "Some",
        "preferredUnderlying": "NVDA",
        "sectorExposurePct": 28,
    }
    profile_with_notes = {
        **legacy_profile,
        "notes": "Extra background note here that should not alter math",
        "extractedFacts": [{"field": "goal", "label": "Goal", "value": "Regular Income", "confirmed": True}]
    }
    product = {
        "underlying": "NVDA",
        "productType": "Barrier Reverse Convertible",
        "notional": 500000,
        "tenorMonths": 12,
        "couponPct": 10,
        "barrierPct": 70,
        "strikePct": 100,
    }
    res1 = engine.analyze(legacy_profile, product)
    res2 = engine.analyze(profile_with_notes, product)

    assert res1["suitability"] == res2["suitability"], "Suitability output changed!"
    assert res1["concerns"] == res2["concerns"], "Concerns count changed!"
    assert res1["couponAmount"] == res2["couponAmount"], "Coupon calculation changed!"
    assert res1["scenarios"] == res2["scenarios"], "Scenarios calculation changed!"
    print("[PASS] engine.analyze outputs are 100% identical with and without notes")

if __name__ == "__main__":
    print("Running Phase 1 Contract and Backward-Compatibility Checks...")
    test_profile_backward_compatibility()
    test_profile_with_notes_and_facts()
    test_client_in_and_update()
    test_db_client_row_backward_compatibility()
    test_engine_suitability_unchanged()
    print("\nALL CONTRACT & BACKWARD-COMPATIBILITY CHECKS PASSED!")
