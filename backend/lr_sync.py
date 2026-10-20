"""Lógica pura de sincronización con el plugin de Lightroom (sin BD ni FastAPI → testeable)."""
import re
import uuid
import xml.etree.ElementTree as ET
from collections import defaultdict

import pymongo

CRS_NS = "{http://ns.adobe.com/camera-raw-settings/1.0/}"
RDF_NS = "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}"
XMP_NS = "{http://ns.adobe.com/xap/1.0/}"

# Los 13 básicos que el plugin verifica tras aplicar (clave develop settings → tolerancia).
BASIC_TOLERANCE = {
    "Exposure2012": 0.011, "Contrast2012": 0.51, "Highlights2012": 0.51, "Shadows2012": 0.51,
    "Whites2012": 0.51, "Blacks2012": 0.51, "Texture": 0.51, "Clarity2012": 0.51, "Dehaze": 0.51,
    "Vibrance": 0.51, "Saturation": 0.51, "Temperature": 50.0, "Tint": 1.01,
}
_SKIP_ATTRS = {"Version", "HasSettings", "RawFileName", "AlreadyApplied", "Precision"}
_STRING_ATTRS = {"ProcessVersion", "CameraProfile", "CameraProfileDigest", "WhiteBalance", "ToneCurveName2012", "LensProfileSetup"}


def norm_path_key(path):
    """Ruta relativa normalizada (minúsculas, '/') usada como clave estable del job."""
    s = re.sub(r"/+", "/", str(path or "").replace("\\", "/")).strip().strip("/").lower()
    return s or None


def lr_job_ops(user_id, entries, now):
    """entries: [(filename, relative_path|None, xmp)] → operaciones bulk para lr_jobs.
    Con ruta: clave (user_id, path_key) y retira jobs heredados sin ruta del mismo nombre.
    Sin ruta: clave heredada (user_id, filename) solo entre jobs sin ruta."""
    ops = []
    for fn, rel, xmp in entries:
        fn = (fn or "").strip()
        if not fn or not xmp:
            continue
        key = norm_path_key(rel)
        doc = {"user_id": user_id, "filename": fn, "filename_lc": fn.lower(), "path_key": key,
               "xmp_content": xmp, "status": "pending", "updated_at": now}
        if key:
            ops.append(pymongo.UpdateMany(
                {"user_id": user_id, "filename_lc": fn.lower(), "status": "pending", "path_key": None},
                {"$set": {"status": "superseded", "updated_at": now}}))
            flt = {"user_id": user_id, "path_key": key}
        else:
            flt = {"user_id": user_id, "filename": fn, "path_key": None}  # null también casa jobs antiguos sin el campo
        ops.append(pymongo.UpdateOne(flt, {"$set": doc, "$setOnInsert": {
            "id": f"lrj_{uuid.uuid4().hex[:12]}", "created_at": now}}, upsert=True))
    return ops


def _path_hit(catalog_path, path_key):
    return catalog_path == path_key or catalog_path.endswith("/" + path_key)


def match_lr_jobs(catalog, jobs):
    """catalog: [{key, name, path}] (fotos seleccionadas en Lightroom).
    jobs: [{id, filename/filename_lc, path_key?}] pendientes.
    Devuelve [{key, status: matched|missing|ambiguous, job_id?, via?, reason?}].
    Nunca asigna por nombre si el nombre es ambiguo; detecta colisiones antes de aplicar."""
    by_name = defaultdict(list)
    for j in jobs:
        by_name[(j.get("filename_lc") or j.get("filename") or "").lower()].append(j)
    out = []
    for ph in catalog:
        name = str(ph.get("name") or "").lower()
        path = norm_path_key(ph.get("path")) or ""
        cands = by_name.get(name, [])
        r = {"key": ph.get("key"), "name": ph.get("name")}
        if not cands:
            r.update(status="missing", reason="No hay edición pendiente para esta foto")
        else:
            hits = [j for j in cands if j.get("path_key") and _path_hit(path, j["path_key"])]
            if hits:
                longest = max(len(j["path_key"]) for j in hits)
                best = [j for j in hits if len(j["path_key"]) == longest]
                if len(best) == 1:
                    r.update(status="matched", job_id=best[0]["id"], via="path")
                else:
                    r.update(status="ambiguous", reason=f"{len(best)} ediciones con la misma ruta")
            elif len(cands) == 1:
                r.update(status="matched", job_id=cands[0]["id"], via="filename")
            else:
                r.update(status="ambiguous",
                         reason=f"{len(cands)} ediciones pendientes con este nombre y la ruta no coincide con ninguna")
        out.append(r)
    claims = defaultdict(list)
    for r in out:
        if r["status"] == "matched":
            claims[r["job_id"]].append(r)
    for rs in claims.values():
        if len(rs) < 2:
            continue
        exact = [r for r in rs if r["via"] == "path"]
        keep = exact[0] if len(exact) == 1 else None
        for r in rs:
            if r is keep:
                continue
            r.update(status="ambiguous", reason=f"{len(rs)} fotos del catálogo apuntan a la misma edición (mismo nombre)")
            r.pop("job_id", None)
            r.pop("via", None)
    return out


def _num(key, value):
    if key in _STRING_ATTRS:
        return value
    if value.lower() in ("true", "false"):
        return value.lower() == "true"
    try:
        return float(value)
    except ValueError:
        return value


def lr_job_payload(job):
    """XMP → develop settings para applyDevelopSettings (también en DNG) + valores esperados
    para verificar tras aplicar. Solo el rdf:Description principal: los atributos anidados
    (Look, máscaras) no se mezclan con los ajustes globales."""
    settings, expected, unsupported = {}, {}, []
    rating, label = None, None
    try:
        root = ET.fromstring(job.get("xmp_content") or "")
        desc = root.find(f"{RDF_NS}RDF/{RDF_NS}Description")
        if desc is None:
            raise ValueError("sin rdf:Description")
        for k, v in desc.attrib.items():
            if k.startswith(CRS_NS):
                name = k[len(CRS_NS):]
                if name not in _SKIP_ATTRS:
                    settings[name] = _num(name, v)
            elif k == f"{XMP_NS}Rating":
                rating = v
            elif k == f"{XMP_NS}Label":
                label = v
        for child in desc:
            if not child.tag.startswith(CRS_NS):
                continue
            name = child.tag[len(CRS_NS):]
            if name.startswith("ToneCurve"):
                vals = [li.text for li in child.iter(f"{RDF_NS}li") if li.text]
                settings[name] = [float(x.strip()) for pair in vals for x in pair.split(",")]
            elif name == "Look":
                look = child.find(f"{RDF_NS}Description")
                look_name = look.get(f"{CRS_NS}Name") if look is not None else None
                if look_name:
                    settings["CameraProfile"] = look_name
            elif child.text and child.text.strip() and len(child) == 0:
                settings[name] = _num(name, child.text.strip())
            else:
                unsupported.append(name)
        for k in BASIC_TOLERANCE:
            if isinstance(settings.get(k), float):
                expected[k] = settings[k]
    except (ET.ParseError, ValueError):
        settings, expected = {}, {}
    out = dict(job)
    out.update(develop_settings=settings, expected=expected, tolerance=BASIC_TOLERANCE,
               catalog_unsupported=unsupported, rating=rating, label=label)
    return out
