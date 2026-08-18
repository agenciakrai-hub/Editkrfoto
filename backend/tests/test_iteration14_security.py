"""Iteration 14 — security hardening tests + regression.

Verifies:
1. SSRF guard: photographer-styles gallery analysis rejects internal/metadata hosts
   (background task sets status='failed', never 'ready').
2. CORS: evil origins are NOT reflected in Access-Control-Allow-Origin; allowed
   origins are.
3. XMP/ZIP hardening: build_xmp escapes XML chars; ZIP entry names are basenamed
   (no path traversal).
4. Regression: projects CRUD, generate-xmp with preset_xmp preservation,
   final-selection, learning profiles, selection analyze.
"""
import io
import os
import time
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TOKEN = os.environ.get("TOKEN_A")


def _hdr(extra=None):
    h = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


@pytest.fixture(scope="module", autouse=True)
def _require_token():
    assert TOKEN, "TOKEN_A env var must be set"


# ==================== SECURITY: SSRF ====================
class TestSSRF:
    """SSRF guard on photographer-styles gallery analysis."""

    INTERNAL_URLS = [
        "http://169.254.169.254/latest/meta-data/",
        "http://localhost:8001/api/",
        "http://127.0.0.1/",
    ]

    def _poll_status(self, sid, timeout=15):
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            r = requests.get(f"{API}/photographer-styles/{sid}", headers=_hdr())
            assert r.status_code == 200, r.text
            last = r.json()
            if last.get("status") in ("failed", "ready"):
                return last
            time.sleep(0.5)
        return last

    @pytest.mark.parametrize("url", INTERNAL_URLS)
    def test_ssrf_blocks_internal_urls(self, url):
        # POST returns 200 (job created), but background analyze must fail — never 'ready'.
        payload = {"name": f"TEST_ssrf_{abs(hash(url))}", "gallery_url": url}
        r = requests.post(f"{API}/photographer-styles", headers=_hdr(), json=payload)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        try:
            final = self._poll_status(sid)
            assert final is not None
            assert final.get("status") == "failed", (
                f"SSRF NOT BLOCKED for {url}: final status={final.get('status')} "
                f"err={final.get('error_message')}"
            )
            # error message should hint internal address rejection
            emsg = (final.get("error_message") or "").lower()
            assert (
                "interna" in emsg or "no permitida" in emsg or "resolver" in emsg
                or "400" in emsg
            ), f"unexpected error_message: {final.get('error_message')}"
        finally:
            requests.delete(f"{API}/photographer-styles/{sid}", headers=_hdr())


# ==================== SECURITY: CORS ====================
# CORS middleware is tested against localhost:8001 directly because the
# Kubernetes preview ingress overrides CORS headers (adds ACAO:* on preview URL).
# The backend FastAPI middleware itself is what we validate.
LOCAL_API = "http://localhost:8001/api"


class TestCORS:
    def test_evil_origin_not_reflected(self):
        r = requests.options(
            f"{LOCAL_API}/projects",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )
        acao = r.headers.get("access-control-allow-origin", "")
        assert acao != "https://evil.example.com", (
            f"Evil origin was reflected: {acao}"
        )
        assert acao != "*", "wildcard should not be present with credentials"

    def test_evil_origin_get_not_reflected(self):
        r = requests.get(
            f"{LOCAL_API}/projects",
            headers=_hdr({"Origin": "https://evil.example.com"}),
        )
        acao = r.headers.get("access-control-allow-origin", "")
        assert acao != "https://evil.example.com"
        assert acao != "*"

    def test_allowed_origin_reflected(self):
        r = requests.options(
            f"{LOCAL_API}/projects",
            headers={
                "Origin": "https://edit.krfoto.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )
        acao = r.headers.get("access-control-allow-origin", "")
        assert acao == "https://edit.krfoto.com", (
            f"expected allowed origin reflected, got: {acao}"
        )
        acac = r.headers.get("access-control-allow-credentials", "").lower()
        assert acac == "true"


# ==================== SECURITY: XML escape + ZIP path traversal ====================
class TestXmpHardening:
    _pid = None

    @classmethod
    def _ensure_project(cls):
        if cls._pid:
            return cls._pid
        r = requests.post(
            f"{API}/projects", headers=_hdr(),
            json={"name": "TEST_iter14_xmp", "total_images": 1},
        )
        assert r.status_code == 200, r.text
        cls._pid = r.json()["id"]
        return cls._pid

    def test_zip_entry_basenamed_and_xml_escaped(self):
        pid = self._ensure_project()
        # Path-traversal + < > & special chars in filename (no `"` — see next test).
        evil_name = "../../evil<x>&y.CR3"
        payload = {
            "photos": [
                {"filename": evil_name,
                 "basic": {"exposure": 0.3, "contrast": 10}},
            ],
            "camera_profile": "Adobe Color <hack> &amp",
            "precision_mode": "balanced",
        }
        r = requests.post(f"{API}/projects/{pid}/generate-xmp", headers=_hdr(), json=payload)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/zip")
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = zf.namelist()
        # No path traversal in entry names
        for n in names:
            assert ".." not in n, f"path traversal in entry: {n}"
            assert "/" not in n and "\\" not in n, f"path separator in entry: {n}"
            assert n.endswith(".xmp"), f"non-xmp entry: {n}"
        body = zf.read(names[0]).decode("utf-8")
        # raw '<hack>' must be XML-escaped
        assert "<hack>" not in body, "raw '<hack>' in XML — not escaped"
        assert "&lt;hack&gt;" in body, "no XML escaping for camera_profile"
        assert "&lt;x&gt;" in body, "no XML escaping for filename"
        assert 'xmp:Rating="5"' in body
        assert 'xmp:Label="Green"' in body
        # well-formed XML
        import xml.etree.ElementTree as ET
        ET.fromstring(body)

    def test_double_quote_in_filename_kept_wellformed(self):
        """FIX 1: `"` in filename/camera_profile must be escaped as &quot; inside
        attribute values, otherwise the XMP is malformed."""
        pid = self._ensure_project()
        payload = {
            "photos": [{"filename": 'weird"<>&.CR3',
                        "basic": {"exposure": 0.1}}],
            "camera_profile": 'Adobe "quoted" <x>&y',
        }
        r = requests.post(f"{API}/projects/{pid}/generate-xmp", headers=_hdr(), json=payload)
        assert r.status_code == 200, r.text
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        body = zf.read(zf.namelist()[0]).decode("utf-8")
        import xml.etree.ElementTree as ET
        # Must parse — this will raise if `"` in attr is not escaped
        root = ET.fromstring(body)
        # &quot; must appear (escaped attribute value contains it)
        assert "&quot;" in body, "double-quote not escaped to &quot;"
        # Raw '"' inside attribute value must not appear as attribute-breaking chars
        # (basic sanity: no bare `weird"` sequence that would close attribute)
        assert 'weird"' not in body, "raw quote leaked into attribute value"
        # rating/label preserved
        assert 'xmp:Rating="5"' in body
        assert 'xmp:Label="Green"' in body
        # Also confirm < > & escaped in both fields
        assert "&lt;" in body and "&gt;" in body and "&amp;" in body

    def test_normal_generate_xmp_regression(self):
        pid = self._ensure_project()
        payload = {
            "photos": [
                {"filename": "IMG_0001.CR3",
                 "basic": {"exposure": 0.3, "contrast": 10}},
                {"filename": "IMG_0002.CR3",
                 "basic": {"exposure": -0.1, "highlights": -20}},
            ],
            "camera_profile": "Adobe Color",
            "precision_mode": "balanced",
        }
        r = requests.post(f"{API}/projects/{pid}/generate-xmp", headers=_hdr(), json=payload)
        assert r.status_code == 200, r.text
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = zf.namelist()
        assert any(n == "IMG_0001.xmp" for n in names), names
        body = zf.read("IMG_0001.xmp").decode("utf-8")
        assert "xmlns:crs" in body
        assert 'xmp:Rating="5"' in body
        assert 'xmp:Label="Green"' in body
        assert "Exposure2012" in body

    def test_generate_xmp_preserves_preset_look(self):
        pid = self._ensure_project()
        preset_xmp = (
            '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
            ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
            '  <rdf:Description rdf:about=""\n'
            '   xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"\n'
            '   crs:Look="Modern 03"\n'
            '   crs:ToneCurveName="Medium Contrast"\n'
            '   crs:Exposure2012="+0.00"\n'
            '   crs:Contrast2012="0">\n'
            '  </rdf:Description>\n'
            ' </rdf:RDF>\n'
            '</x:xmpmeta>\n'
        )
        payload = {
            "photos": [{"filename": "IMG_0003.CR3",
                        "basic": {"exposure": 0.4, "contrast": 15}}],
            "preset_xmp": preset_xmp,
        }
        r = requests.post(f"{API}/projects/{pid}/generate-xmp", headers=_hdr(), json=payload)
        assert r.status_code == 200, r.text
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        body = zf.read("IMG_0003.xmp").decode("utf-8")
        assert 'crs:Look="Modern 03"' in body, "preset Look not preserved"
        assert 'crs:ToneCurveName="Medium Contrast"' in body, "preset ToneCurve not preserved"
        assert 'xmp:Rating="5"' in body
        assert 'xmp:Label="Green"' in body
        # exposure basic should have been updated
        assert 'crs:Exposure2012="+0.40"' in body

    @classmethod
    def teardown_class(cls):
        if cls._pid:
            requests.delete(f"{API}/projects/{cls._pid}", headers=_hdr())


# ==================== REGRESSION ====================
class TestRegression:
    _pid = None

    def test_list_projects(self):
        r = requests.get(f"{API}/projects", headers=_hdr())
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_project(self):
        r = requests.post(
            f"{API}/projects", headers=_hdr(),
            json={"name": "TEST_iter14_reg", "total_images": 2},
        )
        assert r.status_code == 200, r.text
        TestRegression._pid = r.json()["id"]

    def test_final_selection_after_patch_state(self):
        pid = TestRegression._pid
        # Per backend contract, items should be dicts {filename, selected, ...}
        state = {"finalSelection": [
            {"filename": "IMG_0001.CR3", "selected": True, "source": "ai", "rating": 5, "label": "Green"},
            {"filename": "IMG_0002.CR3", "selected": False, "source": "manual"},
        ]}
        r = requests.patch(f"{API}/projects/{pid}/state", headers=_hdr(), json=state)
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{API}/projects/{pid}/final-selection", headers=_hdr())
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["total"] == 2
        assert data["selected_count"] == 1
        assert isinstance(data["items"], list)
        assert data["items"][0]["filename"] == "IMG_0001.CR3"

    def test_final_selection_robust_when_items_are_strings(self):
        """FIX 2: PATCH /state with finalSelection as list of strings must not
        crash GET /final-selection — non-dict items are filtered out."""
        pid = TestRegression._pid
        state = {"finalSelection": ["IMG_0001.CR3", "IMG_0002.CR3"]}
        r = requests.patch(f"{API}/projects/{pid}/state", headers=_hdr(), json=state)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/projects/{pid}/final-selection", headers=_hdr())
        assert r2.status_code == 200, f"final-selection crashed: {r2.status_code} {r2.text}"
        d = r2.json()
        # non-dict items are filtered → items must be empty and selected_count == 0
        assert d.get("selected_count") == 0
        assert isinstance(d.get("items"), list)
        assert all(isinstance(x, dict) for x in d["items"])

    def test_final_selection_dicts_after_string_recovery(self):
        """After sending strings, patch back to proper dicts and confirm working."""
        pid = TestRegression._pid
        state = {"finalSelection": [
            {"filename": "A.CR3", "selected": True, "source": "ai", "rating": 5, "label": "Green"},
            {"filename": "B.CR3", "selected": False, "source": "manual"},
        ]}
        r = requests.patch(f"{API}/projects/{pid}/state", headers=_hdr(), json=state)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/projects/{pid}/final-selection", headers=_hdr())
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["selected_count"] == 1
        filenames = [x["filename"] for x in d["items"]]
        assert "A.CR3" in filenames

    def test_learning_profiles_crud(self):
        payload = {
            "name": "TEST_iter14_prof",
            "samples": [{"exposure": 0.2, "contrast": 5}, {"exposure": 0.3, "contrast": 8}],
        }
        r = requests.post(f"{API}/learning/profiles", headers=_hdr(), json=payload)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]

        r2 = requests.get(f"{API}/learning/profiles", headers=_hdr())
        assert r2.status_code == 200
        assert any(p["id"] == pid for p in r2.json())

        r3 = requests.delete(f"{API}/learning/profiles/{pid}", headers=_hdr())
        assert r3.status_code == 200

    def test_selection_analyze(self):
        files = [
            {"name": "IMG_0001.CR3", "size": 30_000_000, "last_modified": 1_700_000_000_000},
            {"name": "IMG_0002.CR3", "size": 31_000_000, "last_modified": 1_700_000_000_500},
        ]
        r = requests.post(f"{API}/selection/analyze", headers=_hdr(), json={"files": files})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total"] == 2

    @classmethod
    def teardown_class(cls):
        if cls._pid:
            requests.delete(f"{API}/projects/{cls._pid}", headers=_hdr())
