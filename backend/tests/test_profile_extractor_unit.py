"""Cobertura DETERMINISTA del extractor de perfiles (sin red ni BD): `_fetch` y la colección
`extracted_profiles` se sustituyen por dobles. Equivalentes locales de los tests de integración
test_iteration10_profile_extractor.py::TestAnalyzeHtml::test_analyze_non_html_non_profile y
::TestSaveDedupList::test_analyze_rerun_marks_existing."""
import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")
import server  # noqa: E402

USER = SimpleNamespace(user_id="unit-user")
PAGE = "https://perfiles.example.org/canon/"
XMP_A = b'<x:xmpmeta><rdf:Description crs:CameraProfile="Canon Fiel" tiff:Make="Canon" tiff:Model="EOS R5"/></x:xmpmeta>'
XMP_B = b'<x:xmpmeta><rdf:Description crs:CameraProfile="Canon Retrato" tiff:Make="Canon" tiff:Model="EOS R5"/></x:xmpmeta>'
HTML = (b'<html><body><a href="fiel.xmp">Fiel</a> <a href="/canon/retrato.xmp">Retrato</a>'
        b' <a href="otra.html">x</a></body></html>')


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, n):
        return list(self.docs[:n])


class FakeDb:
    def __init__(self, existing=()):
        self.existing = list(existing)
        self.queries = []
        self.extracted_profiles = self

    def find(self, flt, proj=None):
        self.queries.append(flt)
        return FakeCursor([d for d in self.existing if d.get("user_id") == flt.get("user_id")])

    async def insert_one(self, doc):
        self.existing.append(dict(doc))


def fake_fetch(responses):
    calls = []

    def _fetch(url, max_bytes=None):
        calls.append(url)
        r = responses[url]
        if isinstance(r, Exception):
            raise r
        return r
    _fetch.calls = calls
    return _fetch


def analyze(url, monkeypatch, responses, existing=()):
    db = FakeDb(existing)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "_fetch", fake_fetch(responses))
    return asyncio.run(server.analyze_url(server.AnalyzeUrlRequest(url=url), USER)), db


def test_analyze_non_html_non_profile_is_reported(monkeypatch):
    url = "https://raw.example.org/README.md"
    data, _ = analyze(url, monkeypatch, {url: (b"# Titulo\n\nTexto markdown.", "text/plain")})
    assert data["found"] == 0 and data["profiles"] == []
    assert data["errors"] == ["El contenido no es un perfil ni una página HTML con perfiles."]


def test_analyze_html_extracts_linked_profiles_only(monkeypatch):
    data, _ = analyze(PAGE, monkeypatch, {PAGE: (HTML, "text/html"),
                                          PAGE + "fiel.xmp": (XMP_A, "application/xml"),
                                          PAGE + "retrato.xmp": (XMP_B, "application/xml")})
    assert data["found"] == 2 and data["new"] == 2 and data["existing"] == 0 and data["errors"] == []
    assert [p["name"] for p in data["profiles"]] == ["Canon Fiel", "Canon Retrato"]
    assert all(p["manufacturer"] == "Canon" and p["camera_model"] == "EOS R5" for p in data["profiles"])


def test_analyze_rerun_marks_existing_profiles(monkeypatch):
    responses = {PAGE: (HTML, "text/html"), PAGE + "fiel.xmp": (XMP_A, "x"), PAGE + "retrato.xmp": (XMP_B, "x")}
    saved = [{"user_id": "unit-user", "manufacturer": "Canon", "camera_model": "EOS R5", "name": "Canon Fiel"},
             {"user_id": "otro", "manufacturer": "Canon", "camera_model": "EOS R5", "name": "Canon Retrato"}]
    data, db = analyze(PAGE, monkeypatch, responses, existing=saved)
    status = {p["name"]: p["status"] for p in data["profiles"]}
    assert status == {"Canon Fiel": "existing", "Canon Retrato": "new"}  # el de otro usuario no cuenta
    assert data["found"] == 2 and data["new"] == 1 and data["existing"] == 1
    assert db.queries == [{"user_id": "unit-user"}]


def test_analyze_network_failure_is_an_error_not_hidden(monkeypatch):
    url = "https://caido.example.org/a.xmp"
    with pytest.raises(HTTPException) as exc:
        analyze(url, monkeypatch, {url: requests.exceptions.ConnectTimeout("timeout")})
    assert exc.value.status_code == 400 and "No se pudo acceder a la URL" in exc.value.detail


def test_analyze_linked_file_failure_is_documented_not_dropped(monkeypatch):
    data, _ = analyze(PAGE, monkeypatch, {PAGE: (HTML, "text/html"), PAGE + "fiel.xmp": (XMP_A, "x"),
                                          PAGE + "retrato.xmp": requests.exceptions.ReadTimeout("t")})
    by = {p["download_url"]: p for p in data["profiles"]}
    assert by[PAGE + "retrato.xmp"]["compatible"] == "documented" and data["found"] == 2


def test_analyze_save_rerun_full_cycle_marks_all_existing(monkeypatch):
    # Equivalente completo de TestSaveDedupList::test_analyze_rerun_marks_existing (página mock).
    responses = {PAGE: (HTML, "text/html"), PAGE + "fiel.xmp": (XMP_A, "x"), PAGE + "retrato.xmp": (XMP_B, "x")}
    db = FakeDb()
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "_fetch", fake_fetch(responses))
    req = server.AnalyzeUrlRequest(url=PAGE)
    first = asyncio.run(server.analyze_url(req, USER))
    assert first["found"] == 2 and first["new"] == 2 and first["existing"] == 0
    saved = asyncio.run(server.save_profiles(server.SaveProfilesRequest(profiles=first["profiles"]), USER))
    assert saved == {"saved": 2} and len(db.existing) == 2
    assert all(d["user_id"] == "unit-user" and d["status"] == "saved" for d in db.existing)
    again = asyncio.run(server.analyze_url(req, USER))
    assert again["new"] == 0 and again["existing"] == again["found"] == first["found"]
    assert all(p["status"] == "existing" for p in again["profiles"])
    resave = asyncio.run(server.save_profiles(server.SaveProfilesRequest(profiles=again["profiles"]), USER))
    assert resave == {"saved": 0} and len(db.existing) == 2  # sin duplicados
