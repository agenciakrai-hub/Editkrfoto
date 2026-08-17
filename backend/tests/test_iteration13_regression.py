"""Iteration 13 — regression pass after presentational refactors.

Confirms the following endpoints still behave correctly after:
- Frontend subcomponent extraction (StyleCard/StyleComparePanel/PhotoCard/SelectionProgress).
- Backend refactor: _parse_profile split into _parse_xmp_profile / _parse_lrtemplate_profile;
  analyze_url now always initializes profiles=[].
"""
import io
import os
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TOKEN = os.environ.get("TOKEN_A")


def _hdr():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def _require_token():
    assert TOKEN, "TOKEN_A env var must be set (seeded session_token)"


# --------------------------- Projects CRUD ---------------------------
class TestProjects:
    _pid = None

    def test_list_projects(self):
        r = requests.get(f"{API}/projects", headers=_hdr())
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_project(self):
        r = requests.post(f"{API}/projects", headers=_hdr(),
                          json={"name": "TEST_iter13_proj", "total_images": 3})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_iter13_proj"
        assert "id" in d
        TestProjects._pid = d["id"]

    def test_get_project(self):
        r = requests.get(f"{API}/projects/{TestProjects._pid}", headers=_hdr())
        assert r.status_code == 200
        assert r.json()["id"] == TestProjects._pid


# --------------------------- Photographer Styles ---------------------------
class TestPhotographerStyles:
    _sid = None

    def test_list_styles(self):
        r = requests.get(f"{API}/photographer-styles", headers=_hdr())
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_style(self):
        payload = {
            "name": "TEST_iter13_style",
            "gallery_url": "https://example.com/gallery",
        }
        r = requests.post(f"{API}/photographer-styles", headers=_hdr(), json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == payload["name"]
        assert "id" in d
        TestPhotographerStyles._sid = d["id"]

    def test_get_style(self):
        r = requests.get(
            f"{API}/photographer-styles/{TestPhotographerStyles._sid}", headers=_hdr()
        )
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_iter13_style"

    def test_delete_style(self):
        r = requests.delete(
            f"{API}/photographer-styles/{TestPhotographerStyles._sid}", headers=_hdr()
        )
        assert r.status_code == 200
        r2 = requests.get(
            f"{API}/photographer-styles/{TestPhotographerStyles._sid}", headers=_hdr()
        )
        assert r2.status_code == 404


# --------------------------- Selection analyze ---------------------------
class TestSelection:
    def test_selection_analyze_no_files(self):
        r = requests.post(
            f"{API}/selection/analyze", headers=_hdr(), json={"files": []}
        )
        assert r.status_code == 400, r.text

    def test_selection_analyze_with_files(self):
        files = [
            {"name": "IMG_0001.CR3", "size": 30_000_000, "last_modified": 1_700_000_000_000},
            {"name": "IMG_0002.CR3", "size": 31_000_000, "last_modified": 1_700_000_000_500},
            {"name": "IMG_0003.CR3", "size": 29_000_000, "last_modified": 1_700_000_004_000},
        ]
        r = requests.post(
            f"{API}/selection/analyze", headers=_hdr(), json={"files": files}
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total"] == 3
        assert isinstance(d.get("photos"), list)
        assert d["selected"] >= 1


# --------------------------- Learning ---------------------------
class TestLearning:
    _pid = None

    def test_learning_analyze(self):
        samples = [
            {"exposure": 0.3, "contrast": 10, "highlights": -20},
            {"exposure": 0.5, "contrast": 15, "highlights": -25},
            {"exposure": 0.4, "contrast": 12, "highlights": -22},
        ]
        r = requests.post(f"{API}/learning/analyze", headers=_hdr(), json={"samples": samples})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "basic" in d and "creative" in d
        assert d["stats"].get("exposure", {}).get("count") == 3

    def test_learning_analyze_empty(self):
        r = requests.post(f"{API}/learning/analyze", headers=_hdr(), json={"samples": []})
        assert r.status_code == 400

    def test_create_profile(self):
        payload = {
            "name": "TEST_iter13_profile",
            "samples": [
                {"exposure": 0.3, "contrast": 10},
                {"exposure": 0.5, "contrast": 15},
            ],
        }
        r = requests.post(f"{API}/learning/profiles", headers=_hdr(), json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == payload["name"]
        TestLearning._pid = d["id"]

    def test_list_profiles(self):
        r = requests.get(f"{API}/learning/profiles", headers=_hdr())
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert TestLearning._pid in ids

    def test_activate_profile(self):
        r = requests.patch(
            f"{API}/learning/profiles/{TestLearning._pid}/activate", headers=_hdr()
        )
        assert r.status_code == 200
        assert r.json()["active"] is True

    def test_delete_profile(self):
        r = requests.delete(
            f"{API}/learning/profiles/{TestLearning._pid}", headers=_hdr()
        )
        assert r.status_code == 200


# --------------------------- generate-xmp ZIP ---------------------------
class TestGenerateXmp:
    def test_generate_xmp_zip(self):
        pid = TestProjects._pid
        assert pid, "requires previous project"
        payload = {
            "photos": [
                {"filename": "IMG_0001.CR3",
                 "basic": {"Exposure2012": 0.3, "Contrast2012": 10}},
                {"filename": "IMG_0002.CR3",
                 "basic": {"Exposure2012": -0.1, "Highlights2012": -20}},
            ],
            "camera_profile": "Adobe Color",
            "precision_mode": "balanced",
        }
        r = requests.post(f"{API}/projects/{pid}/generate-xmp", headers=_hdr(), json=payload)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/zip")
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = zf.namelist()
        assert any(n.endswith("IMG_0001.xmp") for n in names), names
        assert any(n.endswith("IMG_0002.xmp") for n in names), names
        # ensure XMP body contains crs namespace
        body = zf.read(names[0]).decode("utf-8")
        assert "xmlns:crs" in body

    def test_project_status_completed_after_generate(self):
        pid = TestProjects._pid
        r = requests.get(f"{API}/projects/{pid}", headers=_hdr())
        assert r.status_code == 200
        assert r.json()["status"] == "completed"


# --------------------------- Profile Extractor ---------------------------
class TestProfileExtractor:
    def test_list_profiles(self):
        r = requests.get(f"{API}/profile-extractor/profiles", headers=_hdr())
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_analyze_unreachable_url_returns_structured_error(self):
        """After the _parse_profile refactor, unreachable URLs must return a
        structured 400 (not a 500 crash)."""
        r = requests.post(
            f"{API}/profile-extractor/analyze",
            headers=_hdr(),
            json={"url": "http://nonexistent.invalid.tld/none.xmp"},
            timeout=30,
        )
        # allow 400 (fetch error) or 200 with errors[] — must not be 500
        assert r.status_code in (400, 200), f"got {r.status_code}: {r.text}"
        if r.status_code == 400:
            assert "detail" in r.json()

    def test_analyze_html_page_still_returns_structured_body(self):
        r = requests.post(
            f"{API}/profile-extractor/analyze",
            headers=_hdr(),
            json={"url": "https://example.com/"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "found" in d and "profiles" in d


# --------------------------- Cleanup ---------------------------
class TestCleanup:
    def test_delete_project(self):
        if TestProjects._pid:
            r = requests.delete(
                f"{API}/projects/{TestProjects._pid}", headers=_hdr()
            )
            assert r.status_code in (200, 204, 404)
