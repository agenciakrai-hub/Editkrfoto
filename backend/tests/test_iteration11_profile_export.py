"""Iteration 11: Profile Extractor catalog export (JSON + ZIP).

Covers:
- Auth-gating for /export/json and /export/zip (401 without Bearer).
- JSON export: 200, correct content-type + disposition; body is a JSON array
  scoped per user; must NOT include user_id or _id.
- ZIP export: 200, application/zip + correct filename; contains one .xmp per
  saved profile; valid crs XMP contents (crs:Name, crs:CameraProfile for
  camera_profile, and tiff:Make/Model when present). Duplicate display names
  get suffixed filenames without overwrite.
- Empty catalog: /export/zip -> 400 'El catálogo está vacío'; /export/json ->
  200 with an empty array [] (acceptable per spec).
- Regression: analyze/save/profiles/{id} still work.
"""
import io
import json
import os
import re
import uuid
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

TOKEN_A = os.environ.get("TOKEN_A")
TOKEN_B = os.environ.get("TOKEN_B")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def _require_tokens():
    assert TOKEN_A and TOKEN_B, "TOKEN_A/TOKEN_B env vars must be set"


UNIQ = str(uuid.uuid4())[:8]

# Two saved profiles for user A. Same display name -> exercises filename dedup.
PROFILES_A = [
    {
        "name": f"TEST_{UNIQ}_Adobe Color",
        "display_name": f"TEST_{UNIQ}_Adobe Color",
        "manufacturer": "Canon",
        "camera_model": "EOS R5",
        "profile_type": "camera_profile",
        "format": "xmp",
        "source_url": "https://example.com/a.xmp",
        "download_url": "https://example.com/a.xmp",
        "compatible": "yes",
        "metadata": {},
        "status": "new",
    },
    {
        # Different manufacturer/model so dedup key differs, but same display_name
        "name": f"TEST_{UNIQ}_Adobe Color",
        "display_name": f"TEST_{UNIQ}_Adobe Color",
        "manufacturer": "Fujifilm",
        "camera_model": "X-T4",
        "profile_type": "look",  # not camera_profile => no crs:CameraProfile
        "format": "xmp",
        "source_url": "https://example.com/b.xmp",
        "download_url": "https://example.com/b.xmp",
        "compatible": "yes",
        "metadata": {},
        "status": "new",
    },
]


# ---------------------------- AUTH ----------------------------
class TestAuth:
    def test_export_json_requires_auth(self):
        r = requests.get(f"{API}/profile-extractor/export/json")
        assert r.status_code == 401, r.text

    def test_export_zip_requires_auth(self):
        r = requests.get(f"{API}/profile-extractor/export/zip")
        assert r.status_code == 401, r.text

    def test_export_json_wrong_token(self):
        r = requests.get(f"{API}/profile-extractor/export/json",
                         headers={"Authorization": "Bearer not-a-valid-token"})
        assert r.status_code == 401


# ------------------------ Empty catalog -----------------------
class TestEmptyCatalog:
    """User B has no saved profiles (asserted in first test)."""

    def test_user_b_starts_empty(self):
        r = requests.get(f"{API}/profile-extractor/profiles", headers=_hdr(TOKEN_B))
        assert r.status_code == 200
        # B may have leftovers from earlier iterations; skip if not empty
        if r.json():
            pytest.skip("User B not clean; skipping empty-catalog assertions")

    def test_export_zip_empty_returns_400(self):
        r = requests.get(f"{API}/profile-extractor/profiles", headers=_hdr(TOKEN_B))
        if r.json():
            pytest.skip("User B not clean")
        r = requests.get(f"{API}/profile-extractor/export/zip", headers=_hdr(TOKEN_B))
        assert r.status_code == 400, r.text
        # Spanish error message
        assert "vac" in r.text.lower()

    def test_export_json_empty_returns_empty_array(self):
        r = requests.get(f"{API}/profile-extractor/profiles", headers=_hdr(TOKEN_B))
        if r.json():
            pytest.skip("User B not clean")
        r = requests.get(f"{API}/profile-extractor/export/json", headers=_hdr(TOKEN_B))
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/json")
        assert json.loads(r.content) == []


# ------------------------ Seed user A -----------------------
class TestSeedUserA:
    def test_save_profiles(self):
        r = requests.post(f"{API}/profile-extractor/save",
                          json={"profiles": PROFILES_A}, headers=_hdr(TOKEN_A))
        assert r.status_code == 200, r.text
        # Might have 0 saves if a prior run left them; ensure we have >=2 TEST_ items
        r2 = requests.get(f"{API}/profile-extractor/profiles", headers=_hdr(TOKEN_A))
        assert r2.status_code == 200
        names = [d for d in r2.json() if d["name"] == PROFILES_A[0]["name"]]
        assert len(names) >= 2, f"expected 2 seed profiles, got {len(names)}"


# ------------------------ JSON export -----------------------
class TestJsonExport:
    def test_json_export_headers_and_body(self):
        r = requests.get(f"{API}/profile-extractor/export/json", headers=_hdr(TOKEN_A))
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert ct.startswith("application/json"), ct
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert "catalogo_perfiles.json" in cd

        data = json.loads(r.content)
        assert isinstance(data, list)
        # Includes our two TEST_ items
        ours = [d for d in data if d.get("name") == PROFILES_A[0]["name"]]
        assert len(ours) >= 2

        # No leakage of internal fields
        for d in data:
            assert "user_id" not in d, f"user_id leaked: {d}"
            assert "_id" not in d, f"_id leaked: {d}"
        # Spot-check some public fields exist on our items
        sample = ours[0]
        assert sample.get("manufacturer") in ("Canon", "Fujifilm")
        assert sample.get("display_name") == PROFILES_A[0]["display_name"]

    def test_json_export_scoped_per_user(self):
        # User B either empty or does not include user A's TEST_ items
        r = requests.get(f"{API}/profile-extractor/export/json", headers=_hdr(TOKEN_B))
        assert r.status_code == 200
        data = json.loads(r.content)
        assert isinstance(data, list)
        for d in data:
            assert d.get("name") != PROFILES_A[0]["name"], "cross-user leak in JSON export"


# ------------------------ ZIP export -----------------------
class TestZipExport:
    def test_zip_export_headers(self):
        r = requests.get(f"{API}/profile-extractor/export/zip", headers=_hdr(TOKEN_A))
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/zip")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert "catalogo_perfiles_xmp.zip" in cd

    def test_zip_contents_and_xmp_shape(self):
        r = requests.get(f"{API}/profile-extractor/export/zip", headers=_hdr(TOKEN_A))
        assert r.status_code == 200
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = zf.namelist()
        # All entries end with .xmp and no duplicates (dedup by suffix)
        assert all(n.endswith(".xmp") for n in names), names
        assert len(names) == len(set(names)), f"duplicate entries: {names}"

        # Find our TEST_ entries by prefix match on filename base
        base = re.sub(r"[^\w\- ]+", "", PROFILES_A[0]["display_name"]).strip().replace(" ", "_")
        ours = [n for n in names if n.startswith(base)]
        assert len(ours) >= 2, f"expected >=2 files starting with {base}, got {ours}"
        # Ensure suffixing (no overwrite)
        assert any(re.match(rf"^{re.escape(base)}_\d+\.xmp$", n) for n in ours), ours

        # Read one Canon (camera_profile) and one Fujifilm (look) entry — we can't
        # tell which is which from filename, so open all matching and assert
        # collectively the shape assertions.
        contents = [zf.read(n).decode("utf-8") for n in ours]
        joined = "\n".join(contents)

        # Every XMP file has required crs headers
        for c in contents:
            assert "<x:xmpmeta" in c
            assert 'xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"' in c
            assert 'crs:Name="' + PROFILES_A[0]["display_name"] + '"' in c

        # At least one camera_profile => contains crs:CameraProfile
        cam_entries = [c for c in contents if "crs:CameraProfile=" in c]
        assert len(cam_entries) >= 1, "expected camera_profile to emit crs:CameraProfile"

        # tiff:Make / tiff:Model present when we supplied them
        assert 'tiff:Make="Canon"' in joined
        assert 'tiff:Model="EOS R5"' in joined
        assert 'tiff:Make="Fujifilm"' in joined
        assert 'tiff:Model="X-T4"' in joined

    def test_zip_scoped_per_user(self):
        # User B: either 400 (empty) or a zip not containing our TEST_ files.
        r = requests.get(f"{API}/profile-extractor/export/zip", headers=_hdr(TOKEN_B))
        if r.status_code == 400:
            assert "vac" in r.text.lower()
            return
        assert r.status_code == 200
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        base = re.sub(r"[^\w\- ]+", "", PROFILES_A[0]["display_name"]).strip().replace(" ", "_")
        assert not any(n.startswith(base) for n in zf.namelist()), "cross-user zip leak"


# ------------------------ Regression -----------------------
class TestRegression:
    def test_list_profiles_still_works(self):
        r = requests.get(f"{API}/profile-extractor/profiles", headers=_hdr(TOKEN_A))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_analyze_still_works_html(self):
        r = requests.post(f"{API}/profile-extractor/analyze",
                          json={"url": "https://example.com/"},
                          headers=_hdr(TOKEN_A), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "found" in d and "profiles" in d

    def test_delete_profile_still_works(self):
        # Cleanup: delete our TEST_ items to leave the DB tidy for next runs
        r = requests.get(f"{API}/profile-extractor/profiles", headers=_hdr(TOKEN_A))
        assert r.status_code == 200
        for d in r.json():
            if d.get("name") == PROFILES_A[0]["name"]:
                dr = requests.delete(f"{API}/profile-extractor/profiles/{d['id']}",
                                     headers=_hdr(TOKEN_A))
                assert dr.status_code == 200
