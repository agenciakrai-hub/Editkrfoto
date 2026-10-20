"""Iteration 4 backend tests — startup reaper + PhotographerStyleProfile shape."""
import os
import time
import subprocess
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
    u = _seed_user(mongo_db, "iter4A")
    yield u
    mongo_db.photographer_styles.delete_many({"user_id": u["user_id"]})
    mongo_db.cloud_jobs.delete_many({"user_id": u["user_id"]})
    mongo_db.user_sessions.delete_many({"user_id": u["user_id"]})
    mongo_db.users.delete_many({"user_id": u["user_id"]})


@pytest.fixture(scope="module")
def user_b(mongo_db):
    u = _seed_user(mongo_db, "iter4B")
    yield u
    mongo_db.photographer_styles.delete_many({"user_id": u["user_id"]})
    mongo_db.user_sessions.delete_many({"user_id": u["user_id"]})
    mongo_db.users.delete_many({"user_id": u["user_id"]})


def _client(token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    return s


def _wait_backend_up(timeout=45):
    """Wait until backend responds < 500 (handles parallel reaper restart)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(f"{BASE_URL}/api/", timeout=3)
            if r.status_code < 500:
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


# ---------- Startup reaper ----------
class TestStartupReaper:
    # INTEGRACIÓN DESTRUCTIVA: reinicia el backend compartido (supervisorctl) → rompe cualquier
    # test en paralelo (502 / "Interrumpido por reinicio"). Ejecutar aislado con RUN_INTEGRATION=1 -n 0.
    # Determinista: test_reaper_deterministic.py
    @pytest.mark.integration
    def test_reaper_marks_stuck_docs_failed(self, mongo_db, user_a):
        now = datetime.now(timezone.utc).isoformat()
        job_id = f"test-job-reaper-{int(time.time()*1000)}"
        style_id = f"test-style-reaper-{int(time.time()*1000)}"

        mongo_db.cloud_jobs.insert_one({
            "id": job_id,
            "user_id": user_a["user_id"],
            "status": "processing",
            "created_at": now,
            "updated_at": now,
        })
        mongo_db.photographer_styles.insert_one({
            "id": style_id,
            "user_id": user_a["user_id"],
            "name": "TEST_reaper_stuck",
            "gallery_url": "https://example.com",
            "status": "analyzing",
            "gallery_images": [],
            "images_analyzed": 0,
            "created_at": now,
        })

        try:
            # Confirm seeded state
            assert mongo_db.cloud_jobs.find_one({"id": job_id})["status"] == "processing"
            assert mongo_db.photographer_styles.find_one({"id": style_id})["status"] == "analyzing"

            # Restart backend
            subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, capture_output=True)

            # Wait for backend to come up and reaper to run
            deadline = time.time() + 30
            up = False
            while time.time() < deadline:
                try:
                    r = requests.get(f"{BASE_URL}/api/", timeout=2)
                    if r.status_code < 500:
                        up = True
                        break
                except Exception:
                    pass
                time.sleep(1)
            assert up, "Backend did not come back up after restart"
            time.sleep(2)  # allow reaper to complete

            job = mongo_db.cloud_jobs.find_one({"id": job_id})
            style = mongo_db.photographer_styles.find_one({"id": style_id})

            assert job["status"] == "failed", f"cloud_job not reaped: {job}"
            assert job.get("error_message"), "cloud_job error_message should be non-empty"
            assert "reinicio" in job["error_message"].lower() or "interrump" in job["error_message"].lower()

            assert style["status"] == "failed", f"photographer_style not reaped: {style}"
            assert style.get("error_message"), "style error_message should be non-empty"
            assert "reinicio" in style["error_message"].lower() or "interrump" in style["error_message"].lower()
        finally:
            mongo_db.cloud_jobs.delete_one({"id": job_id})
            mongo_db.photographer_styles.delete_one({"id": style_id})


# ---------- Response shape: suggested_parameters + gallery_images ----------
class TestPhotographerStyleShape:
    def test_get_returns_suggested_parameters_and_gallery_images(self, mongo_db, user_a, user_b):
        assert _wait_backend_up(), "Backend not reachable"
        ca, cb = _client(user_a["token"]), _client(user_b["token"])
        pid = f"test-shape-{int(time.time()*1000)}"
        sugg = {
            "temperature": 5600.0,
            "tint": 8.0,
            "exposure": 0.35,
            "contrast": 12.0,
            "highlights": -20.0,
            "shadows": 25.0,
            "whites": 5.0,
            "blacks": -10.0,
            "vibrance": 8.0,
            "saturation": -4.0,
            "clarity": 6.0,
        }
        gallery = [
            "https://example.com/a.jpg",
            "https://example.com/b.jpg",
            "https://example.com/c.jpg",
            "https://example.com/d.jpg",
            "https://example.com/e.jpg",
        ]
        mongo_db.photographer_styles.insert_one({
            "id": pid,
            "user_id": user_a["user_id"],
            "name": "TEST_shape",
            "gallery_url": "https://example.com",
            "status": "ready",
            "images_analyzed": 5,
            "confidence": 0.82,
            "description": "seeded shape test",
            "color_profile": {"temp": "warm"},
            "edit_profile": {"contrast": "medium"},
            "suggested_parameters": sugg,
            "gallery_images": gallery,
            "representative_image": gallery[0],
            "error_message": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            # Owner GET returns full shape
            r = ca.get(f"{BASE_URL}/api/photographer-styles/{pid}")
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["id"] == pid
            assert data["user_id"] == user_a["user_id"]
            assert data["status"] == "ready"
            assert data.get("suggested_parameters") == sugg
            assert data.get("gallery_images") == gallery
            assert isinstance(data["gallery_images"], list)
            assert len(data["gallery_images"]) == 5

            # Owner list also includes the new fields
            r = ca.get(f"{BASE_URL}/api/photographer-styles")
            assert r.status_code == 200
            found = [p for p in r.json() if p["id"] == pid]
            assert len(found) == 1
            assert found[0]["suggested_parameters"] == sugg
            assert found[0]["gallery_images"] == gallery

            # Cross-user returns 404
            r = cb.get(f"{BASE_URL}/api/photographer-styles/{pid}")
            assert r.status_code == 404
        finally:
            mongo_db.photographer_styles.delete_one({"id": pid})

    def test_new_profile_defaults_for_new_fields(self, mongo_db, user_a):
        """A doc inserted WITHOUT the new fields must still deserialize with defaults."""
        assert _wait_backend_up(), "Backend not reachable"
        ca = _client(user_a["token"])
        pid = f"test-shape-defaults-{int(time.time()*1000)}"
        mongo_db.photographer_styles.insert_one({
            "id": pid,
            "user_id": user_a["user_id"],
            "name": "TEST_defaults",
            "gallery_url": "https://example.com",
            "status": "ready",
            "images_analyzed": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = ca.get(f"{BASE_URL}/api/photographer-styles/{pid}")
            assert r.status_code == 200, r.text
            data = r.json()
            assert "suggested_parameters" in data
            assert "gallery_images" in data
            assert data["gallery_images"] == []
            assert data["suggested_parameters"] is None
        finally:
            mongo_db.photographer_styles.delete_one({"id": pid})
