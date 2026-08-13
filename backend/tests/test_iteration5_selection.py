"""Backend tests for AI Selection burst-grouping bug fix.

Verifies /api/selection/analyze:
- Unreliable timestamps (1000 identical) -> selected == total (bug scenario)
- Realistic spread -> time_reliable=true, bursts<total, selected==bursts
- MAX_BURST=8 cap prevents mega-burst collapse
- Deterministic scoring
- Auth 401 & empty 400
"""
import math
import os
import time
import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or \
    open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split('\n')[0].strip()
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ.get('DB_NAME', 'test_database')

ANALYZE = f"{BASE_URL}/api/selection/analyze"


@pytest.fixture(scope="module")
def mongo_db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def auth_token(mongo_db):
    ts = int(time.time() * 1000)
    user_id = f"test-user-sel-{ts}"
    token = f"test_session_sel_{ts}"
    mongo_db.users.insert_one({
        "user_id": user_id, "email": f"qa.sel+{ts}@example.com",
        "name": "QA Sel", "picture": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    mongo_db.user_sessions.insert_one({
        "user_id": user_id, "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield token
    mongo_db.user_sessions.delete_many({"user_id": user_id})
    mongo_db.users.delete_many({"user_id": user_id})


@pytest.fixture
def client(auth_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth_token}",
                      "Content-Type": "application/json"})
    return s


# ---------- Auth & validation ----------
def test_analyze_requires_auth():
    r = requests.post(ANALYZE, json={"files": [{"name": "a.cr2", "size": 1, "last_modified": 0}]})
    assert r.status_code == 401


def test_analyze_empty_files_400(client):
    r = client.post(ANALYZE, json={"files": []})
    assert r.status_code == 400


# ---------- BUG FIX: unreliable timestamps ----------
def test_1000_identical_timestamps_selects_all(client):
    """Original user bug: 1000 same-timestamp CR2 -> was selecting ~90, must be ~1000."""
    same_ts = 1_700_000_000_000
    files = [{"name": f"IMG_{i:04d}.CR2", "size": 20_000_000 + i, "last_modified": same_ts}
             for i in range(1000)]
    r = client.post(ANALYZE, json={"files": files})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1000
    assert data["time_reliable"] is False
    assert data["bursts"] == 1000, f"expected 1000 bursts (each photo isolated), got {data['bursts']}"
    assert data["selected"] == 1000, f"BUG: expected 1000 selected, got {data['selected']}"


# ---------- Realistic spread ----------
def test_realistic_spread_time_reliable(client):
    """Mix of rapid ~200ms bursts and 3-6s gaps over 1000 files."""
    files = []
    t = 1_700_000_000_000
    i = 0
    while i < 1000:
        # rapid burst of 3-5 frames at 200ms
        burst_n = 3 + (i % 3)
        for _ in range(burst_n):
            if i >= 1000:
                break
            files.append({"name": f"IMG_{i:04d}.CR2", "size": 20_000_000 + i, "last_modified": t})
            t += 200
            i += 1
        # gap 3-6s
        t += 3000 + (i % 4) * 1000

    r = client.post(ANALYZE, json={"files": files})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1000
    assert data["time_reliable"] is True
    assert data["bursts"] < data["total"]
    assert data["selected"] == data["bursts"], "selected must equal bursts (best-of-each)"
    # Substantial fraction, not ~90
    assert data["selected"] >= 200, f"selected too few: {data['selected']}"
    # No burst should exceed MAX_BURST=8
    from collections import Counter
    burst_sizes = Counter(p["burst_id"] for p in data["photos"])
    assert max(burst_sizes.values()) <= 8


# ---------- MAX_BURST cap ----------
def test_max_burst_cap_splits_long_run(client):
    """100 files in one continuous <1500ms rapid run with distinct timestamps -> 13 bursts."""
    files = [{"name": f"IMG_{i:04d}.CR2", "size": 20_000_000, "last_modified": 1_700_000_000_000 + i * 500}
             for i in range(100)]
    r = client.post(ANALYZE, json={"files": files})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 100
    assert data["time_reliable"] is True
    expected = math.ceil(100 / 8)
    assert data["bursts"] == expected, f"expected {expected}, got {data['bursts']}"
    assert data["selected"] == expected


# ---------- Determinism ----------
def test_deterministic_scoring(client):
    files = [{"name": f"IMG_{i:04d}.CR2", "size": 20_000_000 + i, "last_modified": 1_700_000_000_000 + i * 100}
             for i in range(50)]
    r1 = client.post(ANALYZE, json={"files": files}).json()
    r2 = client.post(ANALYZE, json={"files": files}).json()
    assert r1 == r2
