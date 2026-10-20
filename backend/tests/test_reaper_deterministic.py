"""Equivalente DETERMINISTA de test_iteration4_reaper_and_shape.py::TestStartupReaper (que reinicia
el backend). Ejecuta el `reap_stuck_jobs()` REAL contra una BD Mongo local aislada y desechable."""
import asyncio
import os
import sys
import uuid
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).parents[1]))
from dotenv import load_dotenv  # noqa: E402
load_dotenv(Path(__file__).parents[1] / ".env")
import server  # noqa: E402


def run_reaper(monkeypatch, seed):
    async def go():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        name = f"test_reaper_{uuid.uuid4().hex[:10]}"
        db = client[name]
        try:
            for coll, docs in seed.items():
                await db[coll].insert_many([dict(d) for d in docs])
            monkeypatch.setattr(server, "db", db)
            await server.reap_stuck_jobs()
            out = {c: {d["id"]: d async for d in db[c].find({}, {"_id": 0})} for c in seed}
            out["lr_indexes"] = await db.lr_jobs.index_information()
            return out
        finally:
            await client.drop_database(name)
            client.close()
    return asyncio.run(go())


def test_reaper_marks_only_interrupted_work_failed(monkeypatch):
    out = run_reaper(monkeypatch, {
        "cloud_jobs": [{"id": "q", "status": "queued"}, {"id": "p", "status": "processing"},
                       {"id": "c", "status": "completed"}, {"id": "f", "status": "failed", "error_message": "previo"}],
        "photographer_styles": [{"id": "a", "status": "analyzing"}, {"id": "r", "status": "ready"}],
    })
    jobs, styles = out["cloud_jobs"], out["photographer_styles"]
    for jid in ("q", "p"):
        assert jobs[jid]["status"] == "failed"
        assert "reinicio" in jobs[jid]["error_message"].lower() and jobs[jid].get("updated_at")
    assert jobs["c"]["status"] == "completed" and "error_message" not in jobs["c"]
    assert jobs["f"]["error_message"] == "previo"
    assert styles["a"]["status"] == "failed" and "reinicio" in styles["a"]["error_message"].lower()
    assert styles["r"]["status"] == "ready"


def test_reaper_creates_lightroom_indexes(monkeypatch):
    idx = run_reaper(monkeypatch, {"cloud_jobs": [{"id": "x", "status": "completed"}]})["lr_indexes"]
    keys = {tuple(k for k, _ in v["key"]) for v in idx.values()}
    assert {("user_id", "status", "filename_lc"), ("user_id", "filename"), ("user_id", "path_key")} <= keys
