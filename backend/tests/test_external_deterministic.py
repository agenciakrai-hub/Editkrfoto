"""Equivalentes DETERMINISTAS (sin Internet, DNS, LLM ni backend en marcha) de los tests de
integración con servicios reales:
  test_iteration3_photographer_styles.py::TestPhotographerStylesHappyPath::test_wikipedia_gallery_reaches_ready
  test_iteration13_regression.py::TestProfileExtractor::test_analyze_unreachable_url_returns_structured_error
  test_iteration14_security.py::TestSSRF::test_ssrf_blocks_internal_urls
Se ejercita el código REAL del servidor; solo se sustituyen socket.getaddrinfo, requests.get,
el cliente LLM y la colección Mongo."""
import asyncio
import base64
import os
import socket
import sys
import types
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")
import server  # noqa: E402

PUBLIC_IP = "93.184.216.34"
INTERNAL_URLS = ["http://169.254.169.254/latest/meta-data/", "http://localhost:8001/api/", "http://127.0.0.1/",
                 "http://10.0.0.1/", "http://192.168.1.1/", "http://[::1]/"]
GALLERY = "https://galeria.example.org/boda"
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 6000 + b"\xff\xd9"


def fake_dns(table):
    """host → ip | Exception; IPs literales se resuelven a sí mismas (como el real)."""
    def getaddrinfo(host, *a, **k):
        r = table.get(host)
        if r is None:
            try:
                socket.inet_pton(socket.AF_INET6 if ":" in host else socket.AF_INET, host)
                r = host
            except OSError:
                raise socket.gaierror(-2, "Name or service not known")
        if isinstance(r, Exception):
            raise r
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (r, 0))]
    return getaddrinfo


class Resp:
    def __init__(self, url, body=b"", ctype="text/html", status=200, final_url=None):
        self.url, self.content, self.status_code = final_url or url, body, status
        self.headers = {"content-type": ctype}
        self.text = body.decode("utf-8", "ignore")

    def raise_for_status(self):
        if self.status_code >= 400:
            raise server.requests.exceptions.HTTPError(f"{self.status_code}")

    def iter_content(self, n):
        yield self.content

    def close(self):
        pass


def fake_http(routes, calls):
    def get(url, **kw):
        calls.append(url)
        if url not in routes:
            raise AssertionError(f"petición HTTP inesperada: {url}")
        return routes[url]
    return get


class StylesDb:
    def __init__(self, doc):
        self.doc = doc
        self.photographer_styles = self

    async def find_one(self, flt, proj=None):
        return dict(self.doc) if flt.get("id") == self.doc["id"] else None

    async def update_one(self, flt, upd):
        self.doc.update(upd["$set"])


def run_style(monkeypatch, url, dns, routes, llm_reply=None):
    calls = []
    db = StylesDb({"id": "st1", "gallery_url": url, "status": "analyzing"})
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server.socket, "getaddrinfo", fake_dns(dns))
    monkeypatch.setattr(server.requests, "get", fake_http(routes, calls))
    sent = []

    class FakeChat:
        def __init__(self, **kw):
            pass

        def with_model(self, *a):
            return self

        async def send_message(self, msg):
            sent.append(msg)
            return llm_reply

    mod = types.ModuleType("emergentintegrations.llm.chat")
    mod.LlmChat = FakeChat
    mod.UserMessage = lambda text, file_contents: SimpleNamespace(text=text, files=file_contents)
    mod.ImageContent = lambda image_base64: image_base64
    monkeypatch.setitem(sys.modules, "emergentintegrations.llm.chat", mod)
    asyncio.run(server.analyze_photographer_style("st1"))
    return db.doc, calls, sent


LLM_JSON = ('Respuesta: {"description": "Luz suave y tonos cálidos", "confidence": 82,'
            ' "color_profile": {"summary": "cálido"}, "edit_profile": {"summary": "aireado"},'
            ' "suggested_parameters": {"exposure": "0.3", "temperature": 5600, "tint": "x"}}')


# --------- equivalente de test_wikipedia_gallery_reaches_ready ---------
def test_style_analysis_reaches_ready(monkeypatch):
    html = (b'<html><meta property="og:image" content="https://cdn.example.org/a.jpg">'
            b'<img src="/b.jpg"><img data-src="https://cdn.example.org/icon.svg"><img src="data:x"></html>')
    routes = {GALLERY: Resp(GALLERY, html),
              "https://cdn.example.org/a.jpg": Resp("a", JPEG, "image/jpeg"),
              "https://galeria.example.org/b.jpg": Resp("b", JPEG, "image/jpeg")}
    doc, calls, sent = run_style(monkeypatch, GALLERY, {"galeria.example.org": PUBLIC_IP, "cdn.example.org": PUBLIC_IP},
                                 routes, LLM_JSON)
    assert doc["status"] == "ready", doc.get("error_message")
    assert doc["images_analyzed"] == 2 and doc["confidence"] == 82.0
    assert doc["color_profile"] and doc["edit_profile"] and doc["description"]
    assert doc["representative_image"] == "https://cdn.example.org/a.jpg"
    assert doc["suggested_parameters"] == {"exposure": 0.3, "temperature": 5600.0}  # "x" descartado
    assert len(sent) == 1 and len(sent[0].files) == 2
    assert base64.b64decode(sent[0].files[0]) == JPEG
    assert not any(u.endswith(".svg") or u.startswith("data:") for u in calls)


def test_style_analysis_invalid_llm_json_fails_visibly(monkeypatch):
    routes = {GALLERY: Resp(GALLERY, b'<img src="https://cdn.example.org/a.jpg">'),
              "https://cdn.example.org/a.jpg": Resp("a", JPEG, "image/jpeg")}
    doc, _, _ = run_style(monkeypatch, GALLERY, {"galeria.example.org": PUBLIC_IP, "cdn.example.org": PUBLIC_IP},
                          routes, "sin json")
    assert doc["status"] == "failed" and "JSON" in doc["error_message"]


# --------- equivalentes de TestSSRF::test_ssrf_blocks_internal_urls ---------
@pytest.mark.parametrize("url", INTERNAL_URLS)
def test_ssrf_internal_gallery_fails_without_any_request(monkeypatch, url):
    doc, calls, sent = run_style(monkeypatch, url, {"localhost": "127.0.0.1"}, {})
    assert doc["status"] == "failed"
    assert "no permitida" in doc["error_message"].lower() and "interna" in doc["error_message"].lower()
    assert calls == [] and sent == []  # nunca se conecta ni llama al LLM


def test_ssrf_public_name_resolving_to_internal_ip_is_blocked(monkeypatch):
    doc, calls, _ = run_style(monkeypatch, "https://trampa.example.org/", {"trampa.example.org": "169.254.169.254"}, {})
    assert doc["status"] == "failed" and calls == []


def test_ssrf_internal_image_inside_public_gallery_is_skipped(monkeypatch):
    routes = {GALLERY: Resp(GALLERY, b'<img src="http://169.254.169.254/x.jpg">')}
    doc, calls, sent = run_style(monkeypatch, GALLERY, {"galeria.example.org": PUBLIC_IP}, routes, LLM_JSON)
    assert doc["status"] == "failed" and calls == [GALLERY] and sent == []


def test_ssrf_redirect_to_internal_is_revalidated(monkeypatch):
    url = "https://perfil.example.org/a.xmp"
    monkeypatch.setattr(server.socket, "getaddrinfo", fake_dns({"perfil.example.org": PUBLIC_IP}))
    monkeypatch.setattr(server.requests, "get", fake_http(
        {url: Resp(url, b"<x/>", final_url="http://169.254.169.254/latest/")}, []))
    with pytest.raises(HTTPException) as exc:
        server._fetch(url)
    assert exc.value.status_code == 400 and "interna" in exc.value.detail


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://example.org/x.xmp", "gopher://example.org/"])
def test_ssrf_non_http_scheme_rejected(url):
    with pytest.raises(HTTPException) as exc:
        server._assert_safe_url(url)
    assert exc.value.status_code == 400


# --------- equivalente de test_analyze_unreachable_url_returns_structured_error ---------
def test_unresolvable_host_is_structured_400(monkeypatch):
    calls = []
    monkeypatch.setattr(server.socket, "getaddrinfo", fake_dns({}))
    monkeypatch.setattr(server.requests, "get", fake_http({}, calls))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.analyze_url(server.AnalyzeUrlRequest(url="http://nonexistent.invalid.tld/none.xmp"),
                                       SimpleNamespace(user_id="u")))
    assert exc.value.status_code == 400 and exc.value.detail == "No se pudo resolver el host"
    assert calls == []


def test_unreachable_public_host_is_structured_400(monkeypatch):
    def boom(url, **kw):
        raise server.requests.exceptions.ConnectTimeout("connect timeout")
    monkeypatch.setattr(server.socket, "getaddrinfo", fake_dns({"caido.example.org": PUBLIC_IP}))
    monkeypatch.setattr(server.requests, "get", boom)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.analyze_url(server.AnalyzeUrlRequest(url="https://caido.example.org/a.xmp"),
                                       SimpleNamespace(user_id="u")))
    assert exc.value.status_code == 400 and "No se pudo acceder a la URL" in exc.value.detail
