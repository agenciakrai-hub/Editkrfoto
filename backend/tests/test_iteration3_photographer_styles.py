"""Iteration 3 backend tests — Photographer Style Profiles (auth, scoping, vision analysis)."""
import os
import time
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
    u = _seed_user(mongo_db, "photoA")
    yield u
    mongo_db.photographer_styles.delete_many({"user_id": u["user_id"]})
    mongo_db.user_sessions.delete_many({"user_id": u["user_id"]})
    mongo_db.users.delete_many({"user_id": u["user_id"]})


@pytest.fixture(scope="module")
def user_b(mongo_db):
    u = _seed_user(mongo_db, "photoB")
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


# ---------- Auth ----------
class TestPhotographerStylesAuth:
    def test_list_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/photographer-styles").status_code == 401

    def test_create_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/photographer-styles",
                          json={"name": "x", "gallery_url": "https://example.com"})
        assert r.status_code == 401

    def test_get_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/photographer-styles/some-id")
        assert r.status_code == 401

    def test_delete_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/photographer-styles/some-id")
        assert r.status_code == 401


# ---------- Validation / failure path ----------
class TestPhotographerStylesFailure:
    def test_gallery_with_no_images_ends_failed(self, user_a, mongo_db):
        c = _client(user_a["token"])
        r = c.post(f"{BASE_URL}/api/photographer-styles",
                   json={"name": "TEST_no_images", "gallery_url": "https://example.com"})
        assert r.status_code == 200, r.text
        prof = r.json()
        assert prof["status"] == "analyzing"
        assert prof["user_id"] == user_a["user_id"]
        pid = prof["id"]

        # Poll up to 45s — should end in 'failed' with error_message
        deadline = time.time() + 45
        last = None
        while time.time() < deadline:
            r = c.get(f"{BASE_URL}/api/photographer-styles/{pid}")
            assert r.status_code == 200
            last = r.json()
            if last["status"] in ("failed", "ready"):
                break
            time.sleep(2)
        assert last is not None
        assert last["status"] == "failed", f"Expected failed, got {last}"
        assert last.get("error_message"), "error_message should be non-empty on failure"

        # cleanup
        c.delete(f"{BASE_URL}/api/photographer-styles/{pid}")


# ---------- Cross-user scoping ----------
class TestPhotographerStylesScoping:
    def test_list_and_delete_scoping(self, user_a, user_b, mongo_db):
        ca, cb = _client(user_a["token"]), _client(user_b["token"])

        # Insert a profile directly for A to avoid triggering LLM
        pid = "test-prof-scoping-" + str(int(time.time() * 1000))
        mongo_db.photographer_styles.insert_one({
            "id": pid,
            "user_id": user_a["user_id"],
            "name": "TEST_scoping",
            "gallery_url": "https://example.com",
            "status": "ready",
            "images_analyzed": 5,
            "confidence": 0.8,
            "description": "seeded",
            "color_profile": {"temp": "warm"},
            "edit_profile": {"contrast": "med"},
            "representative_image": None,
            "error_message": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            # A sees it
            r = ca.get(f"{BASE_URL}/api/photographer-styles")
            assert r.status_code == 200
            ids_a = [p["id"] for p in r.json()]
            assert pid in ids_a
            for p in r.json():
                assert p["user_id"] == user_a["user_id"]

            # B does NOT see it
            r = cb.get(f"{BASE_URL}/api/photographer-styles")
            assert r.status_code == 200
            assert pid not in [p["id"] for p in r.json()]

            # B cannot GET
            r = cb.get(f"{BASE_URL}/api/photographer-styles/{pid}")
            assert r.status_code == 404

            # B cannot DELETE
            r = cb.delete(f"{BASE_URL}/api/photographer-styles/{pid}")
            assert r.status_code == 404

            # A can DELETE
            r = ca.delete(f"{BASE_URL}/api/photographer-styles/{pid}")
            assert r.status_code == 200

            # Gone
            r = ca.get(f"{BASE_URL}/api/photographer-styles/{pid}")
            assert r.status_code == 404
        finally:
            mongo_db.photographer_styles.delete_one({"id": pid})


# ---------- Happy path (one real analysis) ----------
class TestPhotographerStylesHappyPath:
    def test_wikipedia_gallery_reaches_ready(self, user_a, mongo_db):
        c = _client(user_a["token"])
        r = c.post(f"{BASE_URL}/api/photographer-styles", json={
            "name": "TEST_wiki_wedding",
            "gallery_url": "https://en.wikipedia.org/wiki/Wedding_photography",
        })
        assert r.status_code == 200, r.text
        prof = r.json()
        assert prof["status"] == "analyzing"
        assert prof["user_id"] == user_a["user_id"]
        assert prof["gallery_url"].startswith("https://en.wikipedia.org")
        pid = prof["id"]

        # Poll up to 90s
        deadline = time.time() + 90
        last = None
        while time.time() < deadline:
            r = c.get(f"{BASE_URL}/api/photographer-styles/{pid}")
            assert r.status_code == 200
            last = r.json()
            if last["status"] in ("ready", "failed"):
                break
            time.sleep(3)

        assert last is not None, "no response polled"
        # We expect 'ready' per task; if 'failed', still non-crash
        if last["status"] == "failed":
            pytest.fail(f"Expected 'ready', got failed: {last.get('error_message')}")

        assert last["status"] == "ready"
        assert last.get("images_analyzed", 0) > 0
        assert last.get("confidence") is not None
        assert last.get("color_profile") is not None
        assert last.get("edit_profile") is not None
        assert last.get("description")
        assert last.get("representative_image")

        # cleanup
        c.delete(f"{BASE_URL}/api/photographer-styles/{pid}")
