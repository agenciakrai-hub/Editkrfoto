"""Iteration 2 backend tests — Style Profiles + Cloud Jobs (scoping, lifecycle, ZIP)."""
import io
import os
import time
import zipfile
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or \
    open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split('\n')[0].strip()

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


def _seed_user(mongo_db, tag):
    ts = int(time.time() * 1000)
    uid = f"test-user-{tag}-{ts}"
    tok = f"test_session_{tag}_{ts}"
    email = f"qa.{tag}+{ts}@example.com"
    mongo_db.users.insert_one({
        "user_id": uid, "email": email, "name": f"QA {tag}",
        "picture": "https://via.placeholder.com/150",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    mongo_db.user_sessions.insert_one({
        "user_id": uid, "session_token": tok,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"user_id": uid, "token": tok, "email": email}


@pytest.fixture(scope="module")
def mongo_db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def user_a(mongo_db):
    u = _seed_user(mongo_db, "A")
    yield u
    mongo_db.style_profiles.delete_many({"user_id": u["user_id"]})
    mongo_db.cloud_jobs.delete_many({"user_id": u["user_id"]})
    mongo_db.projects.delete_many({"user_id": u["user_id"]})
    mongo_db.user_sessions.delete_many({"user_id": u["user_id"]})
    mongo_db.users.delete_many({"user_id": u["user_id"]})


@pytest.fixture(scope="module")
def user_b(mongo_db):
    u = _seed_user(mongo_db, "B")
    yield u
    mongo_db.style_profiles.delete_many({"user_id": u["user_id"]})
    mongo_db.cloud_jobs.delete_many({"user_id": u["user_id"]})
    mongo_db.projects.delete_many({"user_id": u["user_id"]})
    mongo_db.user_sessions.delete_many({"user_id": u["user_id"]})
    mongo_db.users.delete_many({"user_id": u["user_id"]})


def _client(token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    return s


# ---------- Style Profiles ----------
class TestStyleProfiles:
    def test_create_list_delete_and_cross_user_scoping(self, user_a, user_b):
        ca, cb = _client(user_a["token"]), _client(user_b["token"])

        # A creates profile
        payload = {
            "name": "TEST_Boda_Clara",
            "parameters": {"exposure": 0.4, "contrast": 10},
            "camera_profile": "Adobe Standard",
            "precision_mode": "balanced",
        }
        r = ca.post(f"{BASE_URL}/api/style-profiles", json=payload)
        assert r.status_code == 200, r.text
        prof = r.json()
        assert prof["name"] == "TEST_Boda_Clara"
        assert prof["user_id"] == user_a["user_id"]
        assert prof["parameters"]["exposure"] == 0.4
        pid = prof["id"]

        # A lists — includes it
        r = ca.get(f"{BASE_URL}/api/style-profiles")
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert pid in ids
        for p in r.json():
            assert p["user_id"] == user_a["user_id"]

        # B lists — must NOT see A's profile
        r = cb.get(f"{BASE_URL}/api/style-profiles")
        assert r.status_code == 200
        ids_b = [p["id"] for p in r.json()]
        assert pid not in ids_b

        # B tries to delete A's — 404
        r = cb.delete(f"{BASE_URL}/api/style-profiles/{pid}")
        assert r.status_code == 404

        # A deletes own
        r = ca.delete(f"{BASE_URL}/api/style-profiles/{pid}")
        assert r.status_code == 200

        # Gone
        r = ca.get(f"{BASE_URL}/api/style-profiles")
        assert pid not in [p["id"] for p in r.json()]

    def test_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/style-profiles").status_code == 401
        assert requests.post(f"{BASE_URL}/api/style-profiles", json={"name": "x"}).status_code == 401


# ---------- Cloud Jobs ----------
class TestCloudJobs:
    @pytest.fixture
    def project(self, user_a):
        c = _client(user_a["token"])
        r = c.post(f"{BASE_URL}/api/projects", json={"name": "TEST_CloudJob_Proj"})
        assert r.status_code == 200
        pid = r.json()["id"]
        yield pid
        c.delete(f"{BASE_URL}/api/projects/{pid}")

    def test_create_poll_download_lifecycle(self, user_a, project):
        c = _client(user_a["token"])
        payload = {
            "filenames": ["IMG_A.CR2", "IMG_B.NEF", "IMG_C.ARW"],
            "parameters": {"exposure": 0.3, "contrast": 8},
            "camera_profile": "Adobe Standard",
            "precision_mode": "balanced",
            "preset_name": "Boda Clara",
        }
        r = c.post(f"{BASE_URL}/api/projects/{project}/cloud-jobs", json=payload)
        assert r.status_code == 200, r.text
        job = r.json()
        assert job["status"] in ("queued", "processing")
        assert job["total"] == 3
        assert job["user_id"] == user_a["user_id"]
        assert job["project_id"] == project
        job_id = job["id"]

        # Project state.cloudJobId set
        r = c.get(f"{BASE_URL}/api/projects/{project}")
        assert r.status_code == 200
        assert r.json()["rawai_state"].get("cloudJobId") == job_id

        # Before completion, download -> 409
        # (may race — try immediately after create)
        r_dl_early = c.get(f"{BASE_URL}/api/cloud-jobs/{job_id}/download")
        # Could be 409 (not done) or 200 (finished super fast). Accept both but log.
        assert r_dl_early.status_code in (200, 409)

        # Poll up to 20s
        completed = False
        deadline = time.time() + 20
        last = None
        while time.time() < deadline:
            r = c.get(f"{BASE_URL}/api/cloud-jobs/{job_id}")
            assert r.status_code == 200
            last = r.json()
            if last["status"] == "completed":
                completed = True
                break
            time.sleep(1.5)
        assert completed, f"Job did not complete in 20s: last={last}"
        assert last["processed"] == 3

        # Download ZIP
        r = c.get(f"{BASE_URL}/api/cloud-jobs/{job_id}/download")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/zip")
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = set(z.namelist())
        assert "IMG_A.xmp" in names
        assert "IMG_B.xmp" in names
        assert "IMG_C.xmp" in names
        assert "LEEME.txt" in names
        xmp = z.read("IMG_A.xmp").decode("utf-8")
        assert "IMG_A.CR2" in xmp
        assert 'crs:CameraProfile="Adobe Standard"' in xmp

    def test_empty_filenames_returns_400(self, user_a, project):
        c = _client(user_a["token"])
        r = c.post(f"{BASE_URL}/api/projects/{project}/cloud-jobs",
                   json={"filenames": [], "parameters": {}})
        assert r.status_code == 400

    def test_cross_user_access_404(self, user_a, user_b, project, mongo_db):
        ca, cb = _client(user_a["token"]), _client(user_b["token"])
        # Create a job as A
        r = ca.post(f"{BASE_URL}/api/projects/{project}/cloud-jobs", json={
            "filenames": ["X.CR2"], "parameters": {}
        })
        assert r.status_code == 200
        job_id = r.json()["id"]

        # B cannot GET or DOWNLOAD
        assert cb.get(f"{BASE_URL}/api/cloud-jobs/{job_id}").status_code == 404
        assert cb.get(f"{BASE_URL}/api/cloud-jobs/{job_id}/download").status_code == 404

    def test_cloud_job_requires_auth(self, project):
        r = requests.post(f"{BASE_URL}/api/projects/{project}/cloud-jobs",
                          json={"filenames": ["a.CR2"]})
        assert r.status_code == 401
