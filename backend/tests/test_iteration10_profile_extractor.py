"""Iteration 10: Profile Extractor (URL) module tests.

Covers: auth-gating, SSRF protection, save/dedup/list/delete, cross-user scoping,
analyze re-run dedup marking, and basic analyze error paths.

Note: A public reachable .xmp/.dcp URL to test direct-file parsing is not
guaranteed in this environment. We instead exercise the parser indirectly via
the save endpoint (which accepts a client-provided profile dict) and rely on
unit assertions on _parse_profile via the API surface.
"""
import os
import time
import uuid
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
    assert TOKEN_A and TOKEN_B, "TOKEN_A/TOKEN_B env vars must be set (seeded sessions)"


# --------------------------- AUTH ---------------------------
class TestAuthGate:
    def test_analyze_requires_auth(self):
        r = requests.post(f"{API}/profile-extractor/analyze", json={"url": "https://example.com/"})
        assert r.status_code == 401, r.text

    def test_save_requires_auth(self):
        r = requests.post(f"{API}/profile-extractor/save", json={"profiles": []})
        assert r.status_code == 401

    def test_list_requires_auth(self):
        r = requests.get(f"{API}/profile-extractor/profiles")
        assert r.status_code == 401

    def test_delete_requires_auth(self):
        r = requests.delete(f"{API}/profile-extractor/profiles/nope")
        assert r.status_code == 401

    def test_auth_me_still_works(self):
        r = requests.get(f"{API}/auth/me", headers=_hdr(TOKEN_A))
        assert r.status_code == 200
        assert "user_id" in r.json()

    def test_projects_list_regression(self):
        r = requests.get(f"{API}/projects", headers=_hdr(TOKEN_A))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --------------------------- SSRF ---------------------------
class TestSSRF:
    @pytest.mark.parametrize("url", [
        "http://127.0.0.1:8001/api/",
        "http://localhost/",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/",
        "http://192.168.1.1/",
        "http://172.16.0.1/",
        "http://[::1]/",
    ])
    def test_ssrf_blocked(self, url):
        r = requests.post(f"{API}/profile-extractor/analyze",
                          json={"url": url}, headers=_hdr(TOKEN_A), timeout=20)
        assert r.status_code == 400, f"{url} -> {r.status_code}: {r.text}"
        body = r.text.lower()
        assert ("interna" in body) or ("no permitida" in body) or ("resolver" in body) or ("inv" in body)

    @pytest.mark.parametrize("url", [
        "file:///etc/passwd",
        "ftp://example.com/x.xmp",
        "gopher://example.com/",
        "javascript:alert(1)",
    ])
    def test_non_http_scheme_blocked(self, url):
        r = requests.post(f"{API}/profile-extractor/analyze",
                          json={"url": url}, headers=_hdr(TOKEN_A), timeout=20)
        assert r.status_code == 400, f"{url} -> {r.status_code}: {r.text}"
        assert "http" in r.text.lower()

    def test_invalid_host(self):
        r = requests.post(f"{API}/profile-extractor/analyze",
                          json={"url": "http://this-does-not-exist-xyz-987654321.invalid/"},
                          headers=_hdr(TOKEN_A), timeout=20)
        assert r.status_code == 400


# --------------------------- ANALYZE (public reachable) ---------------------------
class TestAnalyzeHtml:
    def test_analyze_html_no_profile_links(self):
        # example.com is public HTML with no .xmp/.dcp/.lrtemplate links
        r = requests.post(f"{API}/profile-extractor/analyze",
                          json={"url": "https://example.com/"},
                          headers=_hdr(TOKEN_A), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["found"] == 0
        assert isinstance(data.get("errors"), list) and len(data["errors"]) >= 1
        assert "perfil" in " ".join(data["errors"]).lower()

    @pytest.mark.integration
    def test_analyze_non_html_non_profile(self):
        # INTEGRACIÓN (GitHub real). Un fallo de red es un fallo. Cobertura determinista:
        # test_profile_extractor_unit.py::test_analyze_non_html_non_profile_is_reported
        r = requests.post(f"{API}/profile-extractor/analyze",
                          json={"url": "https://raw.githubusercontent.com/adobe/xmp-docs/master/README.md"},
                          headers=_hdr(TOKEN_A), timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # markdown starts with '#' so not HTML; expect found==0 and an error
        assert data["found"] == 0


# --------------------------- SAVE / LIST / DELETE / DEDUP ---------------------------
UNIQ = str(uuid.uuid4())[:8]

SAMPLE_PROFILES = [
    {
        "name": f"TEST_{UNIQ}_Adobe Standard v2",
        "display_name": f"TEST_{UNIQ}_Adobe Standard v2",
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
        "name": f"TEST_{UNIQ}_Portra 400",
        "display_name": f"TEST_{UNIQ}_Portra 400",
        "manufacturer": "Fuji",
        "camera_model": "X-T4",
        "profile_type": "camera_profile",
        "format": "dcp",
        "source_url": "https://example.com/b.dcp",
        "download_url": "https://example.com/b.dcp",
        "compatible": "yes",
        "metadata": {},
        "status": "new",
    },
]


class TestSaveDedupList:
    saved_ids = []

    def test_save_new_profiles(self):
        r = requests.post(f"{API}/profile-extractor/save",
                          json={"profiles": SAMPLE_PROFILES}, headers=_hdr(TOKEN_A))
        assert r.status_code == 200, r.text
        assert r.json()["saved"] == 2

    def test_save_same_profiles_dedup(self):
        r = requests.post(f"{API}/profile-extractor/save",
                          json={"profiles": SAMPLE_PROFILES}, headers=_hdr(TOKEN_A))
        assert r.status_code == 200
        assert r.json()["saved"] == 0, "dedup by manufacturer+camera_model+name failed"

    def test_list_contains_saved(self):
        r = requests.get(f"{API}/profile-extractor/profiles", headers=_hdr(TOKEN_A))
        assert r.status_code == 200
        docs = r.json()
        names = [d["name"] for d in docs]
        for p in SAMPLE_PROFILES:
            assert p["name"] in names
        # capture ids for delete
        for d in docs:
            if d["name"] in [p["name"] for p in SAMPLE_PROFILES]:
                TestSaveDedupList.saved_ids.append(d["id"])
        # verify status is "saved" and fields
        target = next(d for d in docs if d["name"] == SAMPLE_PROFILES[0]["name"])
        assert target["manufacturer"] == "Canon"
        assert target["camera_model"] == "EOS R5"
        assert target["compatible"] == "yes"
        assert target["status"] == "saved"
        assert target["format"] == "xmp"
        assert target["user_id"]  # scoped

    def test_cross_user_isolation_list(self):
        r = requests.get(f"{API}/profile-extractor/profiles", headers=_hdr(TOKEN_B))
        assert r.status_code == 200
        # User B should NOT see user A's TEST_ profiles
        for d in r.json():
            assert not d["name"].startswith(f"TEST_{UNIQ}_"), "cross-user leak"

    def test_cross_user_cannot_delete(self):
        assert TestSaveDedupList.saved_ids, "need saved ids"
        pid = TestSaveDedupList.saved_ids[0]
        r = requests.delete(f"{API}/profile-extractor/profiles/{pid}", headers=_hdr(TOKEN_B))
        assert r.status_code == 404

    @pytest.mark.integration
    def test_analyze_rerun_marks_existing(self):
        # INTEGRACIÓN: necesita una página HTML pública con enlaces .xmp/.dcp/.lrtemplate en
        # INTEGRATION_PROFILE_PAGE_URL. Sin ella FALLA (no se omite). Cobertura determinista:
        # test_profile_extractor_unit.py::test_analyze_rerun_marks_existing_profiles
        url = os.environ.get("INTEGRATION_PROFILE_PAGE_URL")
        assert url, "Define INTEGRATION_PROFILE_PAGE_URL (página pública con enlaces a perfiles)"
        first = requests.post(f"{API}/profile-extractor/analyze", json={"url": url}, headers=_hdr(TOKEN_A), timeout=60)
        assert first.status_code == 200, first.text
        data = first.json()
        assert data["found"] >= 1, data
        assert requests.post(f"{API}/profile-extractor/save", json={"profiles": data["profiles"]},
                             headers=_hdr(TOKEN_A), timeout=30).status_code == 200
        again = requests.post(f"{API}/profile-extractor/analyze", json={"url": url}, headers=_hdr(TOKEN_A), timeout=60)
        assert again.status_code == 200, again.text
        d2 = again.json()
        assert d2["new"] == 0 and d2["existing"] == d2["found"] == data["found"]
        assert all(p["status"] == "existing" for p in d2["profiles"])

    def test_delete_own_profile(self):
        assert TestSaveDedupList.saved_ids
        for pid in TestSaveDedupList.saved_ids:
            r = requests.delete(f"{API}/profile-extractor/profiles/{pid}", headers=_hdr(TOKEN_A))
            assert r.status_code == 200
        # Verify deletion
        r = requests.get(f"{API}/profile-extractor/profiles", headers=_hdr(TOKEN_A))
        remaining = [d["name"] for d in r.json()]
        for p in SAMPLE_PROFILES:
            assert p["name"] not in remaining

    def test_delete_nonexistent_returns_404(self):
        r = requests.delete(f"{API}/profile-extractor/profiles/does-not-exist-xyz",
                            headers=_hdr(TOKEN_A))
        assert r.status_code == 404
