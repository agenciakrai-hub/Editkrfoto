"""Iteration 12 — RAW AI Learning module + regression on existing endpoints.

Requires env vars:
  REACT_APP_BACKEND_URL  (base URL of preview)
  TOKEN_A                (seeded session token for user A)
  TOKEN_B                (seeded session token for user B, for scoping test)
"""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
TOKEN_A = os.environ["TOKEN_A"]
TOKEN_B = os.environ["TOKEN_B"]

HA = {"Authorization": f"Bearer {TOKEN_A}", "Content-Type": "application/json"}
HB = {"Authorization": f"Bearer {TOKEN_B}", "Content-Type": "application/json"}


# ------- Learning analyze -------
class TestLearningAnalyze:
    def test_analyze_ok(self):
        samples = [
            {"exposure": 0.30, "contrast": 10, "shadows": 20, "temperature": 5800, "clarity": 5, "saturation": -10},
            {"exposure": 0.50, "contrast": 15, "shadows": 30, "temperature": 6000, "clarity": 10, "saturation": -5},
            {"exposure": 0.10, "contrast": 5, "shadows": 10, "temperature": 5600, "clarity": 0, "saturation": -15},
        ]
        r = requests.post(f"{BASE}/learning/analyze", json={"samples": samples}, headers=HA, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["samples"] == 3
        # aggregated basic
        assert "exposure" in data["basic"]
        assert data["basic"]["exposure"] == pytest.approx(0.30, abs=0.05)
        assert data["basic"]["contrast"] == 10  # rounded
        assert data["basic"]["shadows"] == 20
        # creative bucket
        assert "clarity" in data["creative"]
        assert "saturation" in data["creative"]
        # stats
        assert data["stats"]["exposure"]["count"] == 3
        assert data["stats"]["exposure"]["min"] == 0.10
        assert data["stats"]["exposure"]["max"] == 0.50
        # summary spanish
        assert isinstance(data["summary"], str) and len(data["summary"]) > 5

    def test_analyze_empty_400(self):
        r = requests.post(f"{BASE}/learning/analyze", json={"samples": []}, headers=HA, timeout=15)
        assert r.status_code == 400

    def test_analyze_unauth(self):
        r = requests.post(f"{BASE}/learning/analyze", json={"samples": [{"exposure": 0.1}]}, timeout=15)
        assert r.status_code == 401


# ------- Personal profile CRUD -------
_created_ids = []


class TestPersonalProfiles:
    def test_create_requires_samples(self):
        r = requests.post(f"{BASE}/learning/profiles", json={"name": "TEST_noSamples", "samples": []}, headers=HA, timeout=15)
        assert r.status_code == 400

    def test_create_requires_name(self):
        r = requests.post(f"{BASE}/learning/profiles",
                          json={"name": "   ", "samples": [{"exposure": 0.1}]}, headers=HA, timeout=15)
        assert r.status_code == 400

    def test_cleanup_first(self):
        """Ensure user A has no personal profiles from prior runs so first-created becomes active."""
        r = requests.get(f"{BASE}/learning/profiles", headers=HA, timeout=15)
        assert r.status_code == 200
        for p in r.json():
            requests.delete(f"{BASE}/learning/profiles/{p['id']}", headers=HA, timeout=15)
        r2 = requests.get(f"{BASE}/learning/profiles", headers=HA, timeout=15)
        assert r2.json() == []

    def test_create_first_becomes_active(self):
        payload = {"name": "TEST_FirstProfile", "samples": [
            {"exposure": 0.2, "contrast": 8, "clarity": 5},
            {"exposure": 0.4, "contrast": 12, "clarity": 10},
        ]}
        r = requests.post(f"{BASE}/learning/profiles", json=payload, headers=HA, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_FirstProfile"
        assert d["samples"] == 2
        assert d["active"] is True
        assert d["basic"]["contrast"] == 10
        assert d["creative"]["clarity"] == 8
        _created_ids.append(d["id"])

    def test_create_second_not_active(self):
        payload = {"name": "TEST_SecondProfile",
                   "samples": [{"exposure": -0.1, "saturation": -5}]}
        r = requests.post(f"{BASE}/learning/profiles", json=payload, headers=HA, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["active"] is False
        _created_ids.append(d["id"])

    def test_list_only_own(self):
        # user A sees their two profiles
        rA = requests.get(f"{BASE}/learning/profiles", headers=HA, timeout=15)
        assert rA.status_code == 200
        ids_a = {p["id"] for p in rA.json()}
        assert set(_created_ids).issubset(ids_a)
        # user B should NOT see them
        rB = requests.get(f"{BASE}/learning/profiles", headers=HB, timeout=15)
        assert rB.status_code == 200
        ids_b = {p["id"] for p in rB.json()}
        assert ids_a.isdisjoint(ids_b) or not (set(_created_ids) & ids_b)

    def test_activate_flips_active(self):
        assert len(_created_ids) == 2
        second = _created_ids[1]
        r = requests.patch(f"{BASE}/learning/profiles/{second}/activate", headers=HA, timeout=15)
        assert r.status_code == 200
        assert r.json()["active"] is True
        # verify list: only 'second' is active
        lst = requests.get(f"{BASE}/learning/profiles", headers=HA, timeout=15).json()
        actives = [p for p in lst if p["active"]]
        assert len(actives) == 1
        assert actives[0]["id"] == second

    def test_activate_unknown_404(self):
        r = requests.patch(f"{BASE}/learning/profiles/does-not-exist/activate", headers=HA, timeout=15)
        assert r.status_code == 404

    def test_delete_unknown_404(self):
        r = requests.delete(f"{BASE}/learning/profiles/does-not-exist", headers=HA, timeout=15)
        assert r.status_code == 404

    def test_delete_removes(self):
        for pid in _created_ids:
            r = requests.delete(f"{BASE}/learning/profiles/{pid}", headers=HA, timeout=15)
            assert r.status_code == 200
        # verify removed
        lst = requests.get(f"{BASE}/learning/profiles", headers=HA, timeout=15).json()
        remaining = {p["id"] for p in lst} & set(_created_ids)
        assert not remaining


# ------- Regression on existing endpoints -------
class TestRegression:
    def test_projects_list(self):
        r = requests.get(f"{BASE}/projects", headers=HA, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_project_create_and_delete(self):
        r = requests.post(f"{BASE}/projects", json={"name": "TEST_iter12_proj"}, headers=HA, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]
        # GET verifies persistence
        g = requests.get(f"{BASE}/projects/{pid}", headers=HA, timeout=15)
        assert g.status_code == 200
        assert g.json()["name"] == "TEST_iter12_proj"
        # cleanup
        d = requests.delete(f"{BASE}/projects/{pid}", headers=HA, timeout=15)
        assert d.status_code == 200

    def test_photographer_styles_list(self):
        r = requests.get(f"{BASE}/photographer-styles", headers=HA, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_selection_analyze(self):
        payload = {"files": [
            {"name": "IMG_0001.CR3", "size": 25_000_000, "last_modified": 1_700_000_000_000},
            {"name": "IMG_0002.CR3", "size": 24_000_000, "last_modified": 1_700_000_000_500},
            {"name": "IMG_0003.CR3", "size": 24_500_000, "last_modified": 1_700_000_010_000},
        ]}
        r = requests.post(f"{BASE}/selection/analyze", json=payload, headers=HA, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 3
        assert d["selected"] >= 1
        assert "photos" in d

    def test_selection_empty_400(self):
        r = requests.post(f"{BASE}/selection/analyze", json={"files": []}, headers=HA, timeout=15)
        assert r.status_code == 400
