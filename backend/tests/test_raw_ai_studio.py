"""Backend tests for RAW AI Studio — auth, projects CRUD, XMP ZIP generation."""
import io
import os
import time
import zipfile
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or \
    open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split('\n')[0].strip()

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


@pytest.fixture(scope="session")
def mongo_db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="session")
def test_session(mongo_db):
    """Seed a test user + session token in Mongo."""
    ts = int(time.time() * 1000)
    user_id = f"test-user-{ts}"
    token = f"test_session_{ts}"
    email = f"qa.raw+{ts}@example.com"
    mongo_db.users.insert_one({
        "user_id": user_id, "email": email, "name": "QA Fotografo",
        "picture": "https://via.placeholder.com/150",
        "created_at": "2026-01-01T00:00:00+00:00",
    })
    from datetime import datetime, timezone, timedelta
    mongo_db.user_sessions.insert_one({
        "user_id": user_id, "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield {"user_id": user_id, "token": token, "email": email}
    # cleanup
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


# ---------- Auth ----------
class TestAuth:
    def test_me_without_token_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_valid_token(self, auth_client, test_session):
        r = auth_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == test_session["user_id"]
        assert data["email"] == test_session["email"]
        assert data["name"] == "QA Fotografo"

    def test_me_with_invalid_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": "Bearer invalid_token_xyz"})
        assert r.status_code == 401


# ---------- Projects CRUD ----------
class TestProjects:
    def test_full_crud_and_scoping(self, auth_client, test_session, mongo_db):
        # CREATE
        r = auth_client.post(f"{BASE_URL}/api/projects", json={
            "name": "TEST_Boda_Ana_Luis",
            "event_date": "2026-06-15",
            "client_name": "Ana & Luis",
        })
        assert r.status_code == 200, r.text
        proj = r.json()
        assert proj["name"] == "TEST_Boda_Ana_Luis"
        assert proj["user_id"] == test_session["user_id"]
        assert proj["status"] == "created"
        pid = proj["id"]

        # LIST — must include ours, must not include other users'
        r = auth_client.get(f"{BASE_URL}/api/projects")
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert pid in ids
        for p in r.json():
            assert p["user_id"] == test_session["user_id"]

        # GET single
        r = auth_client.get(f"{BASE_URL}/api/projects/{pid}")
        assert r.status_code == 200
        assert r.json()["id"] == pid

        # PUT update
        r = auth_client.put(f"{BASE_URL}/api/projects/{pid}", json={
            "status": "processing", "total_images": 42,
        })
        assert r.status_code == 200
        upd = r.json()
        assert upd["status"] == "processing"
        assert upd["total_images"] == 42
        # verify persistence
        r = auth_client.get(f"{BASE_URL}/api/projects/{pid}")
        assert r.json()["status"] == "processing"
        assert r.json()["total_images"] == 42

        # PATCH state merge — set initial
        r = auth_client.patch(f"{BASE_URL}/api/projects/{pid}/state",
                              json={"step": 2, "camera_profile": "Adobe Standard"})
        assert r.status_code == 200
        assert r.json()["rawai_state"]["step"] == 2
        assert r.json()["rawai_state"]["camera_profile"] == "Adobe Standard"

        # PATCH state merge — add a key, must preserve prior keys
        r = auth_client.patch(f"{BASE_URL}/api/projects/{pid}/state",
                              json={"preset_name": "Boda Clara"})
        assert r.status_code == 200
        state = r.json()["rawai_state"]
        assert state["preset_name"] == "Boda Clara"
        assert state["step"] == 2  # preserved
        assert state["camera_profile"] == "Adobe Standard"  # preserved

        # DELETE
        r = auth_client.delete(f"{BASE_URL}/api/projects/{pid}")
        assert r.status_code == 200
        # Verify gone
        r = auth_client.get(f"{BASE_URL}/api/projects/{pid}")
        assert r.status_code == 404

    def test_projects_require_auth(self):
        r = requests.get(f"{BASE_URL}/api/projects")
        assert r.status_code == 401

    def test_cannot_access_other_users_project(self, auth_client, mongo_db):
        # Insert a project belonging to another user directly
        other_uid = "other-user-xyz"
        other_pid = "other-project-abc"
        mongo_db.projects.insert_one({
            "id": other_pid, "user_id": other_uid, "name": "Other",
            "total_images": 0, "processed_images": 0, "status": "created",
            "rawai_state": {},
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        })
        try:
            r = auth_client.get(f"{BASE_URL}/api/projects/{other_pid}")
            assert r.status_code == 404
            r = auth_client.delete(f"{BASE_URL}/api/projects/{other_pid}")
            assert r.status_code == 404
        finally:
            mongo_db.projects.delete_one({"id": other_pid})


# ---------- XMP generation ----------
class TestXmpGeneration:
    @pytest.fixture
    def project_id(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/projects", json={"name": "TEST_XMP_Project"})
        assert r.status_code == 200
        pid = r.json()["id"]
        yield pid
        auth_client.delete(f"{BASE_URL}/api/projects/{pid}")

    def test_generate_xmp_zip_content(self, auth_client, project_id):
        payload = {
            "filenames": ["IMG_001.CR2", "IMG_002.NEF"],
            "parameters": {"exposure": 0.35, "contrast": 12, "temperature": 5600},
            "camera_profile": "Adobe Standard",
            "precision_mode": "balanced",
            "preset_name": "Boda Clara",
        }
        r = auth_client.post(f"{BASE_URL}/api/projects/{project_id}/generate-xmp",
                             json=payload)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/zip")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert ".zip" in cd.lower()

        # Verify ZIP contents
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        # ZIP must contain EXCLUSIVELY .xmp entries (no LEEME.txt or extras)
        assert sorted(names) == sorted(["IMG_001.xmp", "IMG_002.xmp"])

        xmp1 = z.read("IMG_001.xmp").decode("utf-8")
        assert "crs:Exposure2012" in xmp1
        assert "crs:CameraProfile=\"Adobe Standard\"" in xmp1
        assert "crs:Contrast2012" in xmp1
        assert "crs:Temperature" in xmp1
        assert "IMG_001.CR2" in xmp1  # RawFileName

        # Verify status became 'completed'
        r2 = auth_client.get(f"{BASE_URL}/api/projects/{project_id}")
        assert r2.status_code == 200
        assert r2.json()["status"] == "completed"
        assert r2.json()["processed_images"] == 2

    def test_generate_xmp_empty_filenames_returns_400(self, auth_client, project_id):
        r = auth_client.post(f"{BASE_URL}/api/projects/{project_id}/generate-xmp",
                             json={"filenames": [], "parameters": {}})
        assert r.status_code == 400

    def test_generate_xmp_requires_auth(self, project_id):
        r = requests.post(f"{BASE_URL}/api/projects/{project_id}/generate-xmp",
                          json={"filenames": ["a.CR2"]})
        assert r.status_code == 401


    def test_generate_xmp_exclusively_xmp_A_CR3_B_NEF(self, auth_client, project_id):
        """Review-request explicit check: filenames ['A.CR3','B.NEF'] -> ZIP entries EXACTLY ['A.xmp','B.xmp']."""
        payload = {
            "filenames": ["A.CR3", "B.NEF"],
            "parameters": {"exposure": 0.1, "contrast": 5, "temperature": 5500},
            "camera_profile": "Adobe Standard",
            "precision_mode": "balanced",
        }
        r = auth_client.post(f"{BASE_URL}/api/projects/{project_id}/generate-xmp", json=payload)
        assert r.status_code == 200, r.text
        z = zipfile.ZipFile(io.BytesIO(r.content))
        assert sorted(z.namelist()) == ["A.xmp", "B.xmp"]
        xmp_a = z.read("A.xmp").decode("utf-8")
        assert "crs:" in xmp_a and "A.CR3" in xmp_a
