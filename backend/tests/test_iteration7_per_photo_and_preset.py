"""Iteration 7 — Per-photo basic correction + Lightroom preset passthrough.

Covers:
  - BUG 1: /api/projects/{id}/generate-xmp per-photo `basic` produces different
    crs:Exposure2012 per file.
  - BUG 2: `preset_xmp` creative attributes preserved; only basic light replaced.
  - Legacy fallback: filenames+parameters still works; empty -> 400.
  - Cloud jobs: photos+preset_xmp persisted; download ZIP is .xmp-only with per-photo
    Exposure and preserved preset creative attrs.
"""
import io
import os
import re
import time
import zipfile

import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or \
    open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split('\n')[0].strip()
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']


@pytest.fixture(scope="module")
def mongo_db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def test_session(mongo_db):
    ts = int(time.time() * 1000)
    user_id = f"test-user-it7-{ts}"
    token = f"test_session_it7_{ts}"
    email = f"qa.raw.it7+{ts}@example.com"
    mongo_db.users.insert_one({
        "user_id": user_id, "email": email, "name": "QA It7",
        "picture": None, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    mongo_db.user_sessions.insert_one({
        "user_id": user_id, "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield {"user_id": user_id, "token": token, "email": email}
    mongo_db.cloud_jobs.delete_many({"user_id": user_id})
    mongo_db.projects.delete_many({"user_id": user_id})
    mongo_db.user_sessions.delete_many({"user_id": user_id})
    mongo_db.users.delete_many({"user_id": user_id})


@pytest.fixture
def auth_client(test_session):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {test_session['token']}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture
def project_id(auth_client):
    r = auth_client.post(f"{BASE_URL}/api/projects", json={"name": "TEST_IT7"})
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    yield pid
    auth_client.delete(f"{BASE_URL}/api/projects/{pid}")


PRESET_XMP = '''<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
 <rdf:Description rdf:about=""
  xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
  crs:Version="15.0"
  crs:ProcessVersion="11.0"
  crs:Exposure2012="+1.50"
  crs:Contrast2012="10"
  crs:Highlights2012="-30"
  crs:Shadows2012="20"
  crs:Whites2012="0"
  crs:Blacks2012="-10"
  crs:Clarity2012="30"
  crs:Vibrance="25"
  crs:Saturation="-5"
  crs:Texture="18"
  crs:SplitToningShadowHue="220">
 </rdf:Description>
</rdf:RDF>
</x:xmpmeta>
'''


def _get_attr(xmp, name):
    m = re.search(r'crs:' + name + r'="([^"]+)"', xmp)
    return m.group(1) if m else None


class TestPerPhotoBasic:
    """BUG 1 — per-photo basic correction produces different Exposure per file."""

    def test_per_photo_exposure_differs(self, auth_client, project_id):
        payload = {
            "photos": [
                {"filename": "DARK.CR3", "basic": {
                    "exposure": 0.85, "highlights": -40, "shadows": 45,
                    "whites": 5, "blacks": -5,
                }},
                {"filename": "BRIGHT.NEF", "basic": {
                    "exposure": -0.60, "highlights": -15, "shadows": 15,
                    "whites": -10, "blacks": -5,
                }},
            ],
            "creative_params": {},
            "camera_profile": "Adobe Standard",
            "precision_mode": "balanced",
        }
        r = auth_client.post(f"{BASE_URL}/api/projects/{project_id}/generate-xmp",
                             json=payload)
        assert r.status_code == 200, r.text
        z = zipfile.ZipFile(io.BytesIO(r.content))
        assert sorted(z.namelist()) == ["BRIGHT.xmp", "DARK.xmp"]

        dark_xmp = z.read("DARK.xmp").decode("utf-8")
        bright_xmp = z.read("BRIGHT.xmp").decode("utf-8")

        dark_exp = _get_attr(dark_xmp, "Exposure2012")
        bright_exp = _get_attr(bright_xmp, "Exposure2012")
        assert dark_exp == "+0.85", f"DARK exposure {dark_exp!r}"
        assert bright_exp == "-0.60", f"BRIGHT exposure {bright_exp!r}"
        assert dark_exp != bright_exp

        # Also check other basic attrs differ per-photo
        assert _get_attr(dark_xmp, "Highlights2012") == "-40"
        assert _get_attr(bright_xmp, "Highlights2012") == "-15"
        assert _get_attr(dark_xmp, "Shadows2012") == "45"
        assert _get_attr(bright_xmp, "Shadows2012") == "15"


class TestPresetPassthrough:
    """BUG 2 — creative preset attrs preserved; basic light replaced per photo."""

    def test_preset_creative_preserved_basic_replaced(self, auth_client, project_id):
        payload = {
            "preset_xmp": PRESET_XMP,
            "photos": [
                {"filename": "P1.CR3", "basic": {
                    "exposure": 0.85, "highlights": -40, "shadows": 45,
                    "whites": 5, "blacks": -5,
                }},
                {"filename": "P2.NEF", "basic": {
                    "exposure": -0.60, "highlights": -15, "shadows": 15,
                    "whites": -10, "blacks": -5,
                }},
            ],
            "camera_profile": "Adobe Standard",
        }
        r = auth_client.post(f"{BASE_URL}/api/projects/{project_id}/generate-xmp",
                             json=payload)
        assert r.status_code == 200, r.text
        z = zipfile.ZipFile(io.BytesIO(r.content))
        assert sorted(z.namelist()) == ["P1.xmp", "P2.xmp"]

        for name, expected_exp in [("P1.xmp", "+0.85"), ("P2.xmp", "-0.60")]:
            xmp = z.read(name).decode("utf-8")
            # Basic replaced per photo (NOT the preset's +1.50)
            assert _get_attr(xmp, "Exposure2012") == expected_exp, name
            # Los 13 básicos son de la IA: el preset no los aporta (sin dato IA → 0, una sola vez)
            assert _get_attr(xmp, "Clarity2012") == "0", name
            assert _get_attr(xmp, "Vibrance") == "0", name
            assert _get_attr(xmp, "Texture") == "0", name
            assert xmp.count("crs:Clarity2012=") == 1, name
            # Look creativo del preset preservado
            assert _get_attr(xmp, "SplitToningShadowHue") == "220", name


class TestLegacyAndErrors:
    def test_legacy_filenames_still_works(self, auth_client, project_id):
        r = auth_client.post(f"{BASE_URL}/api/projects/{project_id}/generate-xmp", json={
            "filenames": ["L1.CR3", "L2.NEF"],
            "parameters": {"exposure": 0.2, "contrast": 5},
        })
        assert r.status_code == 200
        z = zipfile.ZipFile(io.BytesIO(r.content))
        assert sorted(z.namelist()) == ["L1.xmp", "L2.xmp"]

    def test_empty_returns_400(self, auth_client, project_id):
        r = auth_client.post(f"{BASE_URL}/api/projects/{project_id}/generate-xmp", json={})
        assert r.status_code == 400


class TestCloudJobPreset:
    def _wait_completed(self, auth_client, job_id, timeout=45):
        deadline = time.time() + timeout
        while time.time() < deadline:
            r = auth_client.get(f"{BASE_URL}/api/cloud-jobs/{job_id}")
            assert r.status_code == 200, r.text
            if r.json()["status"] == "completed":
                return r.json()
            if r.json()["status"] == "failed":
                pytest.fail(f"Cloud job failed: {r.json().get('error_message')}")
            time.sleep(1.0)
        pytest.fail("Cloud job did not complete in time")

    def test_cloud_job_photos_and_preset(self, auth_client, project_id):
        payload = {
            "preset_xmp": PRESET_XMP,
            "photos": [
                {"filename": "C1.CR3", "basic": {"exposure": 0.85, "highlights": -40,
                                                   "shadows": 45, "whites": 5, "blacks": -5}},
                {"filename": "C2.NEF", "basic": {"exposure": -0.60, "highlights": -15,
                                                   "shadows": 15, "whites": -10, "blacks": -5}},
            ],
            "creative_params": {},
            "camera_profile": "Adobe Standard",
        }
        r = auth_client.post(f"{BASE_URL}/api/projects/{project_id}/cloud-jobs", json=payload)
        assert r.status_code == 200, r.text
        job = r.json()
        assert job["total"] == 2
        assert job["preset_xmp"]
        assert len(job["photos"]) == 2

        self._wait_completed(auth_client, job["id"])

        r = auth_client.get(f"{BASE_URL}/api/cloud-jobs/{job['id']}/download")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/zip")
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        assert sorted(names) == ["C1.xmp", "C2.xmp"]
        # ZIP exclusively .xmp
        assert all(n.endswith(".xmp") for n in names)

        c1 = z.read("C1.xmp").decode("utf-8")
        c2 = z.read("C2.xmp").decode("utf-8")
        assert _get_attr(c1, "Exposure2012") == "+0.85"
        assert _get_attr(c2, "Exposure2012") == "-0.60"
        # Básicos IA aislados del preset; look creativo preservado
        for xmp in (c1, c2):
            assert _get_attr(xmp, "Clarity2012") == "0"
            assert _get_attr(xmp, "Vibrance") == "0"
            assert _get_attr(xmp, "Texture") == "0"
            assert _get_attr(xmp, "SplitToningShadowHue") == "220"
