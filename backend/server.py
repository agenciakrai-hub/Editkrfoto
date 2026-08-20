from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import pymongo
import os
import io
import re
import base64
import hashlib
import asyncio
import zipfile
import logging
import uuid
import requests
from urllib.parse import urljoin
from xml.sax.saxutils import escape as _xesc
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

# Strong references to background tasks so they are not garbage-collected mid-run.
_bg_tasks = set()

def _spawn(coro):
    task = asyncio.create_task(coro)
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)
    return task


# ----------------------------- Models -----------------------------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None


class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    event_date: Optional[str] = None
    client_name: Optional[str] = None
    raw_folder_path: Optional[str] = None
    total_images: int = 0
    processed_images: int = 0
    status: str = "created"  # created | processing | completed
    rawai_state: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ProjectCreate(BaseModel):
    name: str
    event_date: Optional[str] = None
    client_name: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    event_date: Optional[str] = None
    client_name: Optional[str] = None
    raw_folder_path: Optional[str] = None
    total_images: Optional[int] = None
    processed_images: Optional[int] = None
    status: Optional[str] = None
    rawai_state: Optional[Dict[str, Any]] = None


class PhotoBasic(BaseModel):
    filename: str
    basic: Dict[str, float] = Field(default_factory=dict)     # compat (6 básicos v2)
    ai_basics: Dict[str, Any] = Field(default_factory=dict)   # Motor IA: los 13 básicos (temp/tint pueden ser null)


class XmpRequest(BaseModel):
    photos: List[PhotoBasic] = Field(default_factory=list)   # NUEVO: corrección básica por foto
    creative_params: Dict[str, float] = Field(default_factory=dict)  # capa creativa (sliders/estilo)
    preset_xmp: Optional[str] = None                         # preset Lightroom completo (texto .xmp)
    filenames: List[str] = Field(default_factory=list)       # compatibilidad
    parameters: Dict[str, float] = Field(default_factory=dict)  # compatibilidad
    camera_profile: Optional[str] = "Adobe Standard"
    precision_mode: Optional[str] = "balanced"
    preset_name: Optional[str] = None


class StyleProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    parameters: Dict[str, float] = Field(default_factory=dict)
    camera_profile: Optional[str] = "Adobe Standard"
    precision_mode: Optional[str] = "balanced"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class StyleProfileCreate(BaseModel):
    name: str
    parameters: Dict[str, float] = Field(default_factory=dict)
    camera_profile: Optional[str] = "Adobe Standard"
    precision_mode: Optional[str] = "balanced"


class CloudJob(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    project_id: str
    status: str = "queued"  # queued | processing | completed | failed
    total: int = 0
    processed: int = 0
    filenames: List[str] = Field(default_factory=list)
    photos: List[Dict[str, Any]] = Field(default_factory=list)
    parameters: Dict[str, float] = Field(default_factory=dict)
    creative_params: Dict[str, float] = Field(default_factory=dict)
    preset_xmp: Optional[str] = None
    camera_profile: Optional[str] = "Adobe Standard"
    precision_mode: Optional[str] = "balanced"
    preset_name: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PhotographerStyleProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    gallery_url: str
    representative_image: Optional[str] = None
    gallery_images: List[str] = Field(default_factory=list)
    images_analyzed: int = 0
    confidence: Optional[float] = None
    description: Optional[str] = None
    color_profile: Optional[Dict[str, Any]] = None
    edit_profile: Optional[Dict[str, Any]] = None
    suggested_parameters: Optional[Dict[str, float]] = None
    status: str = "analyzing"  # analyzing | ready | failed
    error_message: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PhotographerStyleCreate(BaseModel):
    name: str
    gallery_url: str


class FileMeta(BaseModel):
    name: str
    size: int = 0
    last_modified: int = 0


class SelectionRequest(BaseModel):
    files: List[FileMeta]


# ----------------------------- Auth helpers -----------------------------
async def get_current_user(request: Request) -> User:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Sesión inválida")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Sesión expirada")

    user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return User(**user_doc)


# ----------------------------- Auth routes -----------------------------
@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Falta X-Session-ID")

    try:
        r = requests.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": session_id}, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception:
        raise HTTPException(status_code=401, detail="No se pudo validar la sesión de Google")

    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "name": data.get("name", existing.get("name")),
            "picture": data.get("picture", existing.get("picture")),
        }})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name", email),
            "picture": data.get("picture"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    response.set_cookie(
        key="session_token", value=session_token, httponly=True,
        secure=True, samesite="none", path="/", max_age=7 * 24 * 60 * 60,
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": User(**user_doc).model_dump()}


@api_router.get("/auth/me")
async def auth_me(user: User = Depends(get_current_user)):
    return user.model_dump()


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ==== Conexión propia con plugin de Lightroom (independiente de terceros) ====
# El plugin (LrHttp) se conecta a este backend HTTPS con un token de emparejamiento por cuenta.
# Empareja las fotos por NOMBRE DE ARCHIVO; el plugin resuelve la ruta desde el catálogo.

class LrPushBody(BaseModel):
    photos: List[Dict[str, Any]] = Field(default_factory=list)  # [{filename, xmp_content}]

class LrCompleteBody(BaseModel):
    ids: List[str] = Field(default_factory=list)

async def _user_from_lr_token(request: Request) -> str:
    tok = request.headers.get("X-LR-Token") or request.query_params.get("token")
    if not tok:
        raise HTTPException(status_code=401, detail="Falta token del plugin")
    u = await db.users.find_one({"lr_token": tok}, {"_id": 0, "user_id": 1})
    if not u:
        raise HTTPException(status_code=401, detail="Token de plugin inválido")
    return u["user_id"]

@api_router.get("/lr/token")
async def lr_get_token(user: User = Depends(get_current_user)):
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "lr_token": 1})
    tok = (doc or {}).get("lr_token")
    if not tok:
        tok = f"lrk_{uuid.uuid4().hex}"
        await db.users.update_one({"user_id": user.user_id}, {"$set": {"lr_token": tok}})
    return {"token": tok}

@api_router.post("/lr/token/rotate")
async def lr_rotate_token(user: User = Depends(get_current_user)):
    tok = f"lrk_{uuid.uuid4().hex}"
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"lr_token": tok}})
    return {"token": tok}

@api_router.post("/lr/push")
async def lr_push(body: LrPushBody, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    written = 0
    for p in body.photos:
        fn = (p.get("filename") or "").strip()
        xmp = p.get("xmp_content") or ""
        if not fn or not xmp:
            continue
        # una entrada pendiente por (usuario, nombre de archivo): la última sustituye a la anterior.
        await db.lr_jobs.update_one(
            {"user_id": user.user_id, "filename": fn},
            {"$set": {"user_id": user.user_id, "filename": fn, "xmp_content": xmp,
                      "status": "pending", "updated_at": now},
             "$setOnInsert": {"id": f"lrj_{uuid.uuid4().hex[:12]}", "created_at": now}},
            upsert=True,
        )
        written += 1
    return {"written": written}

@api_router.get("/lr/pending")
async def lr_pending(request: Request):
    user_id = await _user_from_lr_token(request)
    docs = await db.lr_jobs.find(
        {"user_id": user_id, "status": "pending"},
        {"_id": 0, "id": 1, "filename": 1, "xmp_content": 1},
    ).to_list(5000)
    return {"jobs": docs, "count": len(docs)}

PLUGIN_DIR = ROOT_DIR / "lightroom-plugin" / "rawai_studio.lrplugin"

@api_router.get("/lr/plugin-download")
async def lr_plugin_download():
    if not PLUGIN_DIR.is_dir():
        raise HTTPException(status_code=404, detail="Plugin no disponible")
    root = PLUGIN_DIR.parent  # /app/backend/lightroom-plugin
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(root.rglob("*")):
            if not path.is_file():
                continue
            arc = str(path.relative_to(root))
            zi = zipfile.ZipInfo(arc)
            # bit ejecutable para el instalador de macOS
            perm = 0o755 if path.suffix in (".command", ".sh") else 0o644
            zi.external_attr = perm << 16
            zi.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(zi, path.read_bytes())
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="rawai_studio_plugin.zip"'})


@api_router.post("/lr/complete")
async def lr_complete(body: LrCompleteBody, request: Request):
    user_id = await _user_from_lr_token(request)
    if body.ids:
        await db.lr_jobs.update_many(
            {"user_id": user_id, "id": {"$in": body.ids}},
            {"$set": {"status": "done", "done_at": datetime.now(timezone.utc).isoformat()}},
        )
    return {"ok": True, "completed": len(body.ids)}



# ----------------------------- Project routes -----------------------------
@api_router.get("/projects", response_model=List[Project])
async def list_projects(user: User = Depends(get_current_user)):
    docs = await db.projects.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Project(**d) for d in docs]


@api_router.post("/projects", response_model=Project)
async def create_project(payload: ProjectCreate, user: User = Depends(get_current_user)):
    project = Project(user_id=user.user_id, **payload.model_dump())
    await db.projects.insert_one(project.model_dump())
    return project


@api_router.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str, user: User = Depends(get_current_user)):
    doc = await db.projects.find_one({"id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return Project(**doc)


@api_router.put("/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, payload: ProjectUpdate, user: User = Depends(get_current_user)):
    doc = await db.projects.find_one({"id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.projects.update_one({"id": project_id}, {"$set": patch})
    updated = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return Project(**updated)


@api_router.patch("/projects/{project_id}/state", response_model=Project)
async def merge_state(project_id: str, patch: Dict[str, Any], user: User = Depends(get_current_user)):
    doc = await db.projects.find_one({"id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    state = doc.get("rawai_state", {}) or {}
    state.update(patch)
    await db.projects.update_one({"id": project_id}, {"$set": {
        "rawai_state": state,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    updated = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return Project(**updated)


@api_router.get("/projects/{project_id}/final-selection")
async def get_final_selection(project_id: str, user: User = Depends(get_current_user)):
    # Selección final estructurada para el futuro plugin de Lightroom Classic.
    doc = await db.projects.find_one({"id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    state = doc.get("rawai_state", {}) or {}
    items = [x for x in (state.get("finalSelection") or []) if isinstance(x, dict)]
    selected = [x for x in items if x.get("selected")]
    return {
        "project_id": project_id,
        "total": len(items),
        "selected_count": len(selected),
        "items": items,           # {filename, selected, source: "ai"|"manual", rating:5, label:"Verde"}
        "selected": selected,
    }


@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: User = Depends(get_current_user)):
    res = await db.projects.delete_one({"id": project_id, "user_id": user.user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return {"ok": True}


# ----------------------------- XMP generation -----------------------------
CRS_MAP = {
    "temperature": "Temperature",
    "tint": "Tint",
    "exposure": "Exposure2012",
    "contrast": "Contrast2012",
    "highlights": "Highlights2012",
    "shadows": "Shadows2012",
    "whites": "Whites2012",
    "blacks": "Blacks2012",
    "texture": "Texture",
    "clarity": "Clarity2012",
    "dehaze": "Dehaze",
    "vibrance": "Vibrance",
    "saturation": "Saturation",
}


def build_xmp(filename: str, params: Dict[str, float], camera_profile: str, process_precision: str) -> str:
    filename = _xesc(str(filename), {'"': "&quot;"})          # evita inyección XML (incluye comillas)
    has_wb = params.get("temperature") is not None
    crs_lines = ['   crs:Version="15.0"',
                 f'   crs:ProcessVersion="11.0"',
                 f'   crs:WhiteBalance="{"Custom" if has_wb else "As Shot"}"',
                 f'   crs:HasSettings="True"']
    for key, value in params.items():
        attr = CRS_MAP.get(key)
        if not attr or value is None:
            continue
        if key == "exposure":
            crs_lines.append(f'   crs:{attr}="{float(value):+.2f}"')
        else:
            crs_lines.append(f'   crs:{attr}="{int(round(float(value)))}"')
    crs_block = "\n".join(crs_lines)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    xmp = f'''<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="RAW AI Studio 1.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:xmp="http://ns.adobe.com/xap/1.0/"
   xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   xmp:CreatorTool="RAW AI Studio"
   xmp:ModifyDate="{now}"
   crs:RawFileName="{filename}"
   crs:Precision="{process_precision}"
   xmp:Rating="5"
   xmp:Label="Verde"
{crs_block}>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
'''
    return _apply_profile(xmp, camera_profile)  # perfil SELECCIONADO (Look Adobe por UUID o CameraProfile)


BASIC_ATTR_MAP = {
    "exposure": "Exposure2012",
    "contrast": "Contrast2012",
    "highlights": "Highlights2012",
    "shadows": "Shadows2012",
    "whites": "Whites2012",
    "blacks": "Blacks2012",
}

# Los 13 parámetros de PROPIEDAD EXCLUSIVA del Motor IA (aislamiento estricto del preset).
AI_BASIC_ATTR_MAP = {
    "temperature": "Temperature", "tint": "Tint",
    "exposure": "Exposure2012", "contrast": "Contrast2012",
    "highlights": "Highlights2012", "shadows": "Shadows2012",
    "whites": "Whites2012", "blacks": "Blacks2012",
    "texture": "Texture", "clarity": "Clarity2012", "dehaze": "Dehaze",
    "vibrance": "Vibrance", "saturation": "Saturation",
}

# Atributos crs que se ELIMINAN de cualquier preset ANTES de inyectar los de la IA.
STRIP_CRS_NAMES = list(dict.fromkeys(list(AI_BASIC_ATTR_MAP.values()) + [
    "Exposure", "Contrast", "Highlights", "Shadows", "Whites", "Blacks", "Clarity",
    "WhiteBalance", "IncrementalTemperature", "IncrementalTint", "AutoWhiteVersion",
]))

# Envoltura de PRESET-TEMPLATE de Lightroom. Si el .xmp subido es un PRESET exportado
# (crs:PresetType/ShowInPresets/UUID/Supports*…), Lightroom lo trata como una DEFINICIÓN de
# preset y NO aplica los básicos como ajustes de la foto (solo se ve el look creativo/máscaras).
# Al generar el XMP por foto hay que convertir el preset-template en AJUSTES APLICADOS:
# se eliminan estos campos identitarios; el look (curvas, HSL, split toning, máscaras) se conserva.
PRESET_WRAPPER_NAMES = [
    "PresetType", "UUID", "Cluster", "PresetSubtype",
    "SupportsAmount", "SupportsAmount2", "SupportsColor", "SupportsMonochrome",
    "SupportsHighDynamicRange", "SupportsNormalDynamicRange",
    "SupportsSceneReferred", "SupportsOutputReferred",
    "RequiresRGBTables", "ShowInPresets", "ShowInQuickActions",
    "CameraModelRestriction",
    "Name", "ShortName", "SortName", "Group", "Description",
]

# UUID de los Look de perfil de Adobe (constantes globales de Lightroom/Camera Raw 2018+).
# CLAVE: Lightroom resuelve un <crs:Look Stubbed="true"> por UUID, NO por nombre. Un UUID
# ausente/incorrecto hace que Lightroom caiga a "Adobe Estándar".
# (Se completan con los XMP exportados del propio Lightroom del usuario cuando estén disponibles.)
ADOBE_LOOK_UUIDS = {
    "Adobe Color": "B952C231111CD8E0ECCF14B86BAA7077",
    "Adobe Landscape": "6F9C877E84273F4E8271E6B91BEB36A1",
    "Adobe Vivid": "EA1DE074F188405965EF399C72C221D9",
    "Adobe Portrait": "D6496412E06A83789C499DF9540AA616",
    "Adobe Monochrome": "0CFE8F8AB5F63B2A73CE0B0077D20817",
}
# Perfiles legacy referenciados por crs:CameraProfile (sin bloque Look).
CAMERA_PROFILE_NAMES = {"Adobe Standard"}


def _set_crs_str_attr(xmp, attr, value):
    """Inserta/actualiza un atributo crs de tipo TEXTO (p. ej. CameraProfile)."""
    value = _xesc(str(value), {'"': "&quot;"})
    if re.search(r'crs:' + attr + r'="[^"]*"', xmp):
        return re.sub(r'crs:' + attr + r'="[^"]*"', f'crs:{attr}="{value}"', xmp, count=1)
    idx = xmp.find("<rdf:Description")
    if idx == -1:
        return xmp
    end = xmp.find(">", idx)
    if end == -1:
        return xmp
    insert_at = end - 1 if xmp[end - 1] == "/" else end
    return xmp[:insert_at] + f'\n   crs:{attr}="{value}"' + xmp[insert_at:]


def _remove_profile(xmp):
    """Quita el perfil embebido (Look + CameraProfile + Digest) para que gane el SELECCIONADO."""
    xmp = re.sub(r'\s*<crs:Look>.*?</crs:Look>', '', xmp, flags=re.DOTALL)
    xmp = re.sub(r'\s*<crs:Look\b[^>]*?/>', '', xmp)
    xmp = re.sub(r'\s*crs:CameraProfileDigest="[^"]*"', '', xmp)
    xmp = re.sub(r'\s*crs:CameraProfile="[^"]*"', '', xmp)
    return xmp


def _insert_before_desc_close(xmp, block):
    idx = xmp.find("</rdf:Description>")
    if idx == -1:
        return xmp
    return xmp[:idx] + "   " + block + "\n  " + xmp[idx:]


def _apply_profile(xmp, profile_name):
    """Inyecta el perfil SELECCIONADO. Perfiles Adobe modernos → bloque crs:Look (por UUID);
    legacy/camera-matching/personalizados → crs:CameraProfile por nombre."""
    name = (profile_name or "Adobe Color").strip()
    uuid = ADOBE_LOOK_UUIDS.get(name)
    if uuid:
        xmp = _set_crs_str_attr(xmp, "CameraProfile", "Adobe Standard")  # base de los Look Adobe
        name_esc = _xesc(name, {'"': "&quot;"})
        look = ('<crs:Look>\n'
                '    <rdf:Description\n'
                f'     crs:Name="{name_esc}"\n'
                '     crs:Amount="1"\n'
                f'     crs:UUID="{uuid}"\n'
                '     crs:SupportsAmount="false"\n'
                '     crs:SupportsMonochrome="false"\n'
                '     crs:SupportsOutputReferred="false"\n'
                '     crs:Stubbed="true"/>\n'
                '   </crs:Look>')
        return _insert_before_desc_close(xmp, look)
    return _set_crs_str_attr(xmp, "CameraProfile", name)




def _fmt_basic(key, value):
    if key == "exposure":
        return f"{float(value):+.2f}"
    return str(int(round(float(value))))


def _set_crs_attr(xmp, attr, value):
    pat = re.compile(r'(crs:' + attr + r'=")([+-]?[0-9]*\.?[0-9]+)(")')
    if pat.search(xmp):
        return pat.sub(lambda m: m.group(1) + value + m.group(3), xmp, count=1)
    # también forma de elemento <crs:Attr>val</crs:Attr>
    epat = re.compile(r'(<crs:' + attr + r'>)([+-]?[0-9]*\.?[0-9]+)(</crs:' + attr + r'>)')
    if epat.search(xmp):
        return epat.sub(lambda m: m.group(1) + value + m.group(3), xmp, count=1)
    idx = xmp.find("<rdf:Description")
    if idx == -1:
        return xmp
    end = xmp.find(">", idx)
    if end == -1:
        return xmp
    insert_at = end - 1 if xmp[end - 1] == "/" else end
    return xmp[:insert_at] + f'\n   crs:{attr}="{value}"' + xmp[insert_at:]


def _strip_crs_attrs(xmp, names):
    # Elimina crs:Name="..." (atributo), <crs:Name>...</crs:Name> y <crs:Name/> (elemento).
    for name in names:
        xmp = re.sub(r'\s*crs:' + re.escape(name) + r'="[^"]*"', '', xmp)
        xmp = re.sub(r'\s*<crs:' + re.escape(name) + r'>.*?</crs:' + re.escape(name) + r'>', '', xmp, flags=re.DOTALL)
        xmp = re.sub(r'\s*<crs:' + re.escape(name) + r'/>', '', xmp)
    return xmp


def _set_wb(xmp, value):
    if re.search(r'crs:WhiteBalance="[^"]*"', xmp):
        return re.sub(r'crs:WhiteBalance="[^"]*"', f'crs:WhiteBalance="{value}"', xmp, count=1)
    idx = xmp.find("<rdf:Description")
    if idx == -1:
        return xmp
    end = xmp.find(">", idx)
    if end == -1:
        return xmp
    insert_at = end - 1 if xmp[end - 1] == "/" else end
    return xmp[:insert_at] + f'\n   crs:WhiteBalance="{value}"' + xmp[insert_at:]


def _set_xmp_meta(xmp):
    # Inserta/actualiza xmp:Rating="5" y xmp:Label="Verde" sin borrar ningún otro campo del sidecar.
    # NOTA: en Lightroom la etiqueta se ve VERDE solo si el texto coincide con el juego de etiquetas
    # activo. En LrC en español el verde por defecto es "Verde" (en inglés sería "Green").
    if "xmlns:xmp=" not in xmp:
        xmp = xmp.replace("<rdf:Description", '<rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/"', 1)
    for attr, val in (("Rating", "5"), ("Label", "Verde")):
        apat = re.compile(r'(xmp:' + attr + r'=")([^"]*)(")')
        epat = re.compile(r'(<xmp:' + attr + r'>)([^<]*)(</xmp:' + attr + r'>)')
        if apat.search(xmp):
            xmp = apat.sub(lambda m, val=val: m.group(1) + val + m.group(3), xmp, count=1)
        elif epat.search(xmp):
            xmp = epat.sub(lambda m, val=val: m.group(1) + val + m.group(3), xmp, count=1)
        else:
            idx = xmp.find("<rdf:Description")
            end = xmp.find(">", idx) if idx != -1 else -1
            if end == -1:
                continue
            insert_at = end - 1 if xmp[end - 1] == "/" else end
            xmp = xmp[:insert_at] + f'\n   xmp:{attr}="{val}"' + xmp[insert_at:]
    return xmp


def build_photo_xmp(filename, ai, creative_params, preset_xmp, camera_profile, precision):
    # AISLAMIENTO ESTRICTO: los 13 básicos son propiedad EXCLUSIVA del Motor IA.
    ai = ai or {}
    if preset_xmp:
        # 1) ELIMINA del preset cualquier ajuste de los 13 básicos (+ WhiteBalance).
        xmp = _strip_crs_attrs(preset_xmp, STRIP_CRS_NAMES)
        # 1a) QUITA el perfil embebido del preset (Look/CameraProfile) → gana el SELECCIONADO.
        xmp = _remove_profile(xmp)
        # 1b) CONVIERTE preset-template → ajustes aplicados (quita PresetType/UUID/ShowInPresets…).
        #     Se hace DESPUÉS de quitar el Look, para no corromper su UUID/Name.
        xmp = _strip_crs_attrs(xmp, PRESET_WRAPPER_NAMES)
        # 2) INYECTA los 13 valores calculados por la IA (temp/tint solo si hay corrección).
        for key, attr in AI_BASIC_ATTR_MAP.items():
            v = ai.get(key)
            if v is None:
                continue
            xmp = _set_crs_attr(xmp, attr, _fmt_basic(key, v))
        xmp = _set_wb(xmp, "Custom" if ai.get("temperature") is not None else "As Shot")
        # 3) INYECTA el perfil de cámara SELECCIONADO (base de color antes del look del preset).
        xmp = _apply_profile(xmp, camera_profile)
        return _set_xmp_meta(xmp)  # 5★ + etiqueta verde para la selección final
    # Sin preset: XMP nuevo con SOLO los 13 básicos de la IA.
    return build_xmp(filename, dict(ai), camera_profile or "Adobe Standard", precision or "balanced")


def xmp_entries(req_or_job, camera_profile, precision):
    photos = req_or_job.get("photos") or []
    creative = req_or_job.get("creative_params") or {}
    preset_xmp = req_or_job.get("preset_xmp")
    entries = []
    if photos:
        for p in photos:
            fn = p["filename"]
            base = fn.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].rsplit(".", 1)[0] or "foto"  # sin traversal
            entries.append((f"{base}.xmp", build_photo_xmp(fn, p.get("ai_basics") or p.get("basic") or {}, creative, preset_xmp, camera_profile, precision)))
    else:
        # compatibilidad: mismos parámetros para todas
        params = req_or_job.get("parameters") or {}
        for fn in (req_or_job.get("filenames") or []):
            base = fn.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].rsplit(".", 1)[0] or "foto"
            entries.append((f"{base}.xmp", build_xmp(fn, params, camera_profile or "Adobe Standard", precision or "balanced")))
    return entries


def build_zip_from_entries(entries):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in entries:
            zf.writestr(name, content)
    buf.seek(0)
    return buf


@api_router.post("/projects/{project_id}/lr-push")
async def project_lr_push(project_id: str, req: XmpRequest, user: User = Depends(get_current_user)):
    """Genera los XMP en el servidor y los encola directamente para el plugin de Lightroom.
    Evita el round-trip de ZIP por el navegador (clave con cientos de fotos)."""
    doc = await db.projects.find_one({"id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    data = req.model_dump()
    photos = data.get("photos") or []
    creative = data.get("creative_params") or {}
    preset_xmp = data.get("preset_xmp")
    now = datetime.now(timezone.utc).isoformat()
    written = 0
    ops = []
    for p in photos:
        fn = (p.get("filename") or "").strip()
        if not fn:
            continue
        xmp = build_photo_xmp(fn, p.get("ai_basics") or p.get("basic") or {}, creative,
                              preset_xmp, req.camera_profile, req.precision_mode)
        ops.append(pymongo.UpdateOne(
            {"user_id": user.user_id, "filename": fn},
            {"$set": {"user_id": user.user_id, "filename": fn, "xmp_content": xmp,
                      "status": "pending", "updated_at": now},
             "$setOnInsert": {"id": f"lrj_{uuid.uuid4().hex[:12]}", "created_at": now}},
            upsert=True))
        written += 1
    if ops:
        await db.lr_jobs.bulk_write(ops, ordered=False)
    return {"written": written}


@api_router.post("/projects/{project_id}/generate-xmp")
async def generate_xmp(project_id: str, req: XmpRequest, user: User = Depends(get_current_user)):
    doc = await db.projects.find_one({"id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    data = req.model_dump()
    entries = xmp_entries(data, req.camera_profile, req.precision_mode)
    if not entries:
        raise HTTPException(status_code=400, detail="No hay archivos en la cola")

    buf = build_zip_from_entries(entries)
    await db.projects.update_one({"id": project_id}, {"$set": {
        "status": "completed", "processed_images": len(entries),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    safe = (doc.get("name") or "proyecto").replace(" ", "_")
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="RAWAI_{safe}_XMP.zip"'})


# ----------------------------- Style Profiles -----------------------------
@api_router.get("/style-profiles", response_model=List[StyleProfile])
async def list_style_profiles(user: User = Depends(get_current_user)):
    docs = await db.style_profiles.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [StyleProfile(**d) for d in docs]


@api_router.post("/style-profiles", response_model=StyleProfile)
async def create_style_profile(payload: StyleProfileCreate, user: User = Depends(get_current_user)):
    profile = StyleProfile(user_id=user.user_id, **payload.model_dump())
    await db.style_profiles.insert_one(profile.model_dump())
    return profile


@api_router.delete("/style-profiles/{profile_id}")
async def delete_style_profile(profile_id: str, user: User = Depends(get_current_user)):
    res = await db.style_profiles.delete_one({"id": profile_id, "user_id": user.user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return {"ok": True}


# ----------------------------- Cloud Jobs -----------------------------
async def run_cloud_job(job_id: str):
    try:
        job = await db.cloud_jobs.find_one({"id": job_id}, {"_id": 0})
        if not job:
            return
        total = job.get("total", 0)
        await db.cloud_jobs.update_one({"id": job_id}, {"$set": {"status": "processing"}})
        processed = 0
        step = max(1, total // 20)
        while processed < total:
            await asyncio.sleep(0.6)
            processed = min(total, processed + step)
            await db.cloud_jobs.update_one({"id": job_id}, {"$set": {
                "processed": processed, "updated_at": datetime.now(timezone.utc).isoformat()}})
        await db.cloud_jobs.update_one({"id": job_id}, {"$set": {
            "status": "completed", "processed": total, "updated_at": datetime.now(timezone.utc).isoformat()}})
        await db.projects.update_one({"id": job["project_id"]}, {"$set": {
            "status": "completed", "processed_images": total, "updated_at": datetime.now(timezone.utc).isoformat()}})
    except Exception as exc:
        logging.exception("run_cloud_job failed")
        await db.cloud_jobs.update_one({"id": job_id}, {"$set": {
            "status": "failed", "error_message": str(exc), "updated_at": datetime.now(timezone.utc).isoformat()}})


@api_router.post("/projects/{project_id}/cloud-jobs", response_model=CloudJob)
async def create_cloud_job(project_id: str, req: XmpRequest, user: User = Depends(get_current_user)):
    doc = await db.projects.find_one({"id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    total = len(req.photos) or len(req.filenames)
    if total == 0:
        raise HTTPException(status_code=400, detail="No hay archivos en la cola")
    job = CloudJob(user_id=user.user_id, project_id=project_id, total=total,
                   filenames=[p.filename for p in req.photos] or req.filenames,
                   photos=[p.model_dump() for p in req.photos],
                   parameters=req.parameters, creative_params=req.creative_params, preset_xmp=req.preset_xmp,
                   camera_profile=req.camera_profile, precision_mode=req.precision_mode, preset_name=req.preset_name)
    await db.cloud_jobs.insert_one(job.model_dump())
    await db.projects.update_one({"id": project_id}, {"$set": {
        "status": "processing", "rawai_state.cloudJobId": job.id,
        "updated_at": datetime.now(timezone.utc).isoformat()}})
    _spawn(run_cloud_job(job.id))
    return job


@api_router.get("/cloud-jobs/{job_id}", response_model=CloudJob)
async def get_cloud_job(job_id: str, user: User = Depends(get_current_user)):
    doc = await db.cloud_jobs.find_one({"id": job_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    return CloudJob(**doc)


@api_router.get("/cloud-jobs/{job_id}/download")
async def download_cloud_job(job_id: str, user: User = Depends(get_current_user)):
    job = await db.cloud_jobs.find_one({"id": job_id, "user_id": user.user_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="El trabajo aún no ha terminado")
    project = await db.projects.find_one({"id": job["project_id"]}, {"_id": 0})
    pname = project.get("name") if project else "proyecto"
    entries = xmp_entries(job, job.get("camera_profile"), job.get("precision_mode"))
    buf = build_zip_from_entries(entries)
    safe = (pname or "proyecto").replace(" ", "_")
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="RAWAI_{safe}_XMP.zip"'})


# ----------------------------- Photographer Style Profiles -----------------------------
IMG_EXT_RE = re.compile(r"\.(jpe?g|png|webp)(\?|$)", re.I)


def scrape_gallery_images(url, limit=12):
    _assert_safe_url(url)  # SSRF guard: bloquea IP internas/metadata
    headers = {"User-Agent": "Mozilla/5.0 (compatible; RAWAIStudio/1.0)"}
    r = requests.get(url, headers=headers, timeout=20)
    r.raise_for_status()
    html = r.text
    candidates = []
    for m in re.finditer(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.I):
        candidates.append(m.group(1))
    for m in re.finditer(r"<img\b[^>]*>", html, re.I):
        tag = m.group(0)
        for attr in ("data-src", "data-original", "data-lazy", "src"):
            am = re.search(attr + r'=["\']([^"\']+)["\']', tag, re.I)
            if am:
                candidates.append(am.group(1))
                break
    for m in re.finditer(r'srcset=["\']([^"\']+)["\']', html, re.I):
        first = m.group(1).split(",")[0].strip().split(" ")[0]
        if first:
            candidates.append(first)

    seen, urls = set(), []
    for u in candidates:
        if not u or u.startswith("data:") or u.lower().endswith(".svg"):
            continue
        full = urljoin(url, u)
        if full in seen:
            continue
        seen.add(full)
        urls.append(full)
    return urls


def download_images_b64(urls, limit=12):
    out = []
    for u in urls:
        if len(out) >= limit:
            break
        try:
            _assert_safe_url(u)  # SSRF guard por cada imagen
            resp = requests.get(u, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
            ctype = resp.headers.get("content-type", "")
            if not ctype.startswith("image/") or "svg" in ctype or "gif" in ctype:
                continue
            if len(resp.content) < 3000 or len(resp.content) > 6 * 1024 * 1024:
                continue
            out.append((u, base64.b64encode(resp.content).decode("ascii")))
        except Exception:
            continue
    return out


STYLE_SYSTEM = (
    "Eres un director de fotografía y colorista experto en analizar el estilo visual de fotógrafos "
    "de boda. Analizas el COLOR (balance de blancos, contraste, saturación, tono de piel, rango tonal) "
    "y la EDICIÓN (recorte/composición, tratamiento de luces y sombras, nitidez percibida, consistencia) "
    "por separado. Respondes SIEMPRE en español y SOLO con un objeto JSON válido, sin texto adicional."
)

STYLE_PROMPT = (
    "Analiza el estilo fotográfico común de estas {n} imágenes de la galería de un mismo fotógrafo. "
    "Devuelve EXCLUSIVAMENTE este JSON (sin markdown):\n"
    "{{\n"
    '  "description": "descripción del estilo en 2-3 frases",\n'
    '  "confidence": 0-100,\n'
    '  "color_profile": {{\n'
    '    "white_balance_tendency": "texto",\n'
    '    "contrast": "low|medium|high",\n'
    '    "saturation": "muted|natural|vivid",\n'
    '    "skin_tone": "warm|natural|cool",\n'
    '    "tonal_range": "texto",\n'
    '    "summary": "resumen del color"\n'
    "  }},\n"
    '  "edit_profile": {{\n'
    '    "crop_style": "texto",\n'
    '    "light_shadow_treatment": "texto",\n'
    '    "sharpening_look": "texto",\n'
    '    "consistency": "low|medium|high",\n'
    '    "summary": "resumen de la edición"\n'
    "  }},\n"
    '  "suggested_parameters": {{\n'
    '    "exposure": número -1.5..1.5,\n'
    '    "contrast": -40..40,\n'
    '    "highlights": -60..40,\n'
    '    "shadows": -40..60,\n'
    '    "whites": -40..40,\n'
    '    "blacks": -40..40,\n'
    '    "clarity": -30..40,\n'
    '    "vibrance": -40..40,\n'
    '    "saturation": -60..40,\n'
    '    "temperature": 3800..7500,\n'
    '    "tint": -20..20\n'
    "  }}\n"
    "}}\n"
    "En suggested_parameters da valores numéricos realistas de PUNTO DE PARTIDA que reproduzcan el "
    "look detectado (p.ej. saturación negativa si es 'muted', temperatura alta si la piel es 'warm', "
    "sombras positivas y luces negativas si el rango es suave y aireado)."
)


def parse_json_block(text):
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Respuesta sin JSON")
    import json
    return json.loads(text[start:end + 1])


async def analyze_photographer_style(profile_id):
    try:
        prof = await db.photographer_styles.find_one({"id": profile_id}, {"_id": 0})
        if not prof:
            return
        urls = await asyncio.to_thread(scrape_gallery_images, prof["gallery_url"], 30)
        if not urls:
            raise ValueError("No se encontraron imágenes en la galería (puede requerir JavaScript).")
        rep = urls[0]
        await db.photographer_styles.update_one({"id": profile_id}, {"$set": {"representative_image": rep}})
        images = await asyncio.to_thread(download_images_b64, urls, 12)
        if not images:
            raise ValueError("No se pudieron descargar imágenes válidas de la galería.")

        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"style-{profile_id}", system_message=STYLE_SYSTEM).with_model("openai", "gpt-5.4")
        msg = UserMessage(
            text=STYLE_PROMPT.format(n=len(images)),
            file_contents=[ImageContent(image_base64=b64) for _, b64 in images],
        )
        reply = await chat.send_message(msg)
        data = parse_json_block(reply if isinstance(reply, str) else str(reply))

        conf = data.get("confidence")
        try:
            conf = float(conf)
        except (TypeError, ValueError):
            conf = None
        sugg = data.get("suggested_parameters")
        if isinstance(sugg, dict):
            clean = {}
            for k, v in sugg.items():
                try:
                    clean[k] = float(v)
                except (TypeError, ValueError):
                    continue
            sugg = clean or None
        else:
            sugg = None
        await db.photographer_styles.update_one({"id": profile_id}, {"$set": {
            "status": "ready",
            "description": data.get("description"),
            "confidence": conf,
            "color_profile": data.get("color_profile"),
            "edit_profile": data.get("edit_profile"),
            "suggested_parameters": sugg,
            "images_analyzed": len(images),
            "representative_image": rep,
            "gallery_images": [u for u, _ in images],
        }})
    except Exception as exc:
        logging.exception("analyze_photographer_style failed")
        await db.photographer_styles.update_one({"id": profile_id}, {"$set": {
            "status": "failed", "error_message": str(exc)}})


@api_router.get("/photographer-styles", response_model=List[PhotographerStyleProfile])
async def list_photographer_styles(user: User = Depends(get_current_user)):
    docs = await db.photographer_styles.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [PhotographerStyleProfile(**d) for d in docs]


@api_router.post("/photographer-styles", response_model=PhotographerStyleProfile)
async def create_photographer_style(payload: PhotographerStyleCreate, user: User = Depends(get_current_user)):
    profile = PhotographerStyleProfile(user_id=user.user_id, name=payload.name, gallery_url=payload.gallery_url)
    await db.photographer_styles.insert_one(profile.model_dump())
    _spawn(analyze_photographer_style(profile.id))
    return profile


@api_router.get("/photographer-styles/{profile_id}", response_model=PhotographerStyleProfile)
async def get_photographer_style(profile_id: str, user: User = Depends(get_current_user)):
    doc = await db.photographer_styles.find_one({"id": profile_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return PhotographerStyleProfile(**doc)


@api_router.delete("/photographer-styles/{profile_id}")
async def delete_photographer_style(profile_id: str, user: User = Depends(get_current_user)):
    res = await db.photographer_styles.delete_one({"id": profile_id, "user_id": user.user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return {"ok": True}


# ----------------------------- AI Selection (burst grouping) -----------------------------
RAW_EXTS = {"cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2", "pef", "srw", "jpg", "jpeg"}
BURST_GAP_MS = 1500
MAX_BURST = 8


def _is_raw(name):
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return ext in RAW_EXTS


def _quality_score(name, size):
    h = int(hashlib.sha256(name.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF
    base = h * 70.0
    size_bonus = min(30.0, (size / (6 * 1024 * 1024)) * 30.0)
    return round(base + size_bonus)


def compute_selection(files):
    items = [f for f in files if _is_raw(f.name)] or list(files)
    items = sorted(items, key=lambda f: (f.last_modified, f.name))
    n = len(items)
    unique_times = len({f.last_modified for f in items})
    # Marcas de tiempo fiables solo si hay suficiente dispersión (copiar 1000 fotos suele
    # dejar timestamps casi idénticos: en ese caso NO agrupamos para no colapsar la selección).
    time_reliable = n > 0 and (unique_times / n) > 0.5

    photos = []
    burst_id = 0
    last_ts = None
    burst_len = 0
    for f in items:
        start_new = (not time_reliable) or last_ts is None or (f.last_modified - last_ts) > BURST_GAP_MS or burst_len >= MAX_BURST
        if start_new:
            burst_id += 1
            burst_len = 0
        burst_len += 1
        last_ts = f.last_modified
        photos.append({"name": f.name, "size": f.size, "burst_id": burst_id,
                       "score": _quality_score(f.name, f.size), "is_best": False, "selected_for_edit": False})

    groups = {}
    for p in photos:
        groups.setdefault(p["burst_id"], []).append(p)
    for g in groups.values():
        best = max(g, key=lambda x: x["score"])
        best["is_best"] = True
        best["selected_for_edit"] = True

    selected = sum(1 for p in photos if p["selected_for_edit"])
    return {"photos": photos, "total": n, "bursts": len(groups), "selected": selected, "time_reliable": time_reliable}


@api_router.post("/selection/analyze")
async def analyze_selection(req: SelectionRequest, user: User = Depends(get_current_user)):
    if not req.files:
        raise HTTPException(status_code=400, detail="No hay archivos para analizar")
    return compute_selection(req.files)


# ----------------------------- RAW AI Learning (aprendizaje de mis correcciones) -----------------------------
LEARN_BASIC_KEYS = ["exposure", "contrast", "highlights", "shadows", "whites", "blacks", "temperature", "tint"]
LEARN_CREATIVE_KEYS = ["clarity", "vibrance", "saturation"]
LEARN_ALL_KEYS = LEARN_BASIC_KEYS + LEARN_CREATIVE_KEYS

_LEARN_LABELS = {
    "exposure": "la exposición", "contrast": "el contraste", "highlights": "las altas luces",
    "shadows": "las sombras", "whites": "los blancos", "blacks": "los negros",
    "temperature": "la temperatura", "tint": "el tinte",
    "clarity": "la claridad", "vibrance": "la vibración", "saturation": "la saturación",
}


class PersonalProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    samples: int = 0
    basic: Dict[str, float] = Field(default_factory=dict)
    creative: Dict[str, float] = Field(default_factory=dict)
    stats: Dict[str, Any] = Field(default_factory=dict)
    active: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class LearnAnalyzeRequest(BaseModel):
    samples: List[Dict[str, float]] = Field(default_factory=list)


class PersonalProfileCreate(BaseModel):
    name: str
    samples: List[Dict[str, float]] = Field(default_factory=list)


def _learn_round(v, key):
    return round(v, 2) if key == "exposure" else round(v)


def aggregate_learning(samples):
    stats, basic, creative = {}, {}, {}
    for key in LEARN_ALL_KEYS:
        vals = [float(s[key]) for s in samples if key in s and s[key] is not None]
        if not vals:
            continue
        mean = sum(vals) / len(vals)
        stats[key] = {"mean": round(mean, 2), "min": round(min(vals), 2), "max": round(max(vals), 2), "count": len(vals)}
        target = basic if key in LEARN_BASIC_KEYS else creative
        target[key] = _learn_round(mean, key)
    return stats, basic, creative


def learning_summary(basic, creative, n):
    merged = {**basic, **creative}
    notable = []
    for key in LEARN_ALL_KEYS:
        if key not in merged:
            continue
        val = merged[key]
        label = _LEARN_LABELS.get(key, key)
        if key == "exposure":
            if abs(val) >= 0.05:
                notable.append(f"ajustas {label} {val:+.2f} EV de media")
        elif key == "temperature":
            if val > 5600:
                notable.append("prefieres un balance más cálido")
            elif val < 5400:
                notable.append("prefieres un balance más frío")
        else:
            if abs(val) >= 3:
                verb = "subes" if val > 0 else "bajas"
                notable.append(f"{verb} {label} ({val:+.0f})")
    if not notable:
        return f"Tus {n} correcciones son muy neutras: apenas te desvías de la base automática."
    return f"En tus {n} correcciones sueles: " + ", ".join(notable[:5]) + "."


@api_router.post("/learning/analyze")
async def learning_analyze(req: LearnAnalyzeRequest, user: User = Depends(get_current_user)):
    if not req.samples:
        raise HTTPException(status_code=400, detail="No hay correcciones para analizar")
    stats, basic, creative = aggregate_learning(req.samples)
    return {
        "samples": len(req.samples),
        "basic": basic,
        "creative": creative,
        "stats": stats,
        "summary": learning_summary(basic, creative, len(req.samples)),
    }


@api_router.get("/learning/profiles", response_model=List[PersonalProfile])
async def list_personal_profiles(user: User = Depends(get_current_user)):
    docs = await db.personal_profiles.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [PersonalProfile(**d) for d in docs]


@api_router.post("/learning/profiles", response_model=PersonalProfile)
async def create_personal_profile(payload: PersonalProfileCreate, user: User = Depends(get_current_user)):
    if not payload.samples:
        raise HTTPException(status_code=400, detail="No hay correcciones para aprender")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    stats, basic, creative = aggregate_learning(payload.samples)
    existing = await db.personal_profiles.count_documents({"user_id": user.user_id})
    profile = PersonalProfile(
        user_id=user.user_id, name=payload.name.strip(), samples=len(payload.samples),
        basic=basic, creative=creative, stats=stats, active=(existing == 0),
    )
    await db.personal_profiles.insert_one(profile.model_dump())
    return profile


@api_router.patch("/learning/profiles/{profile_id}/activate", response_model=PersonalProfile)
async def activate_personal_profile(profile_id: str, user: User = Depends(get_current_user)):
    doc = await db.personal_profiles.find_one({"id": profile_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    await db.personal_profiles.update_many({"user_id": user.user_id}, {"$set": {"active": False}})
    await db.personal_profiles.update_one({"id": profile_id, "user_id": user.user_id}, {"$set": {"active": True}})
    doc["active"] = True
    return PersonalProfile(**doc)


@api_router.delete("/learning/profiles/{profile_id}")
async def delete_personal_profile(profile_id: str, user: User = Depends(get_current_user)):
    res = await db.personal_profiles.delete_one({"id": profile_id, "user_id": user.user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return {"ok": True}


@api_router.get("/")
async def root():
    return {"message": "RAW AI Studio API"}


# ----------------------------- Profile Extractor (URL) -----------------------------
import socket
import ipaddress
from urllib.parse import urlparse

PROFILE_EXTS = ("xmp", "dcp", "lrtemplate", "xml")
MAX_FETCH_BYTES = 8 * 1024 * 1024
MAX_LINKS = 25
MAX_FILE_FETCHES = 12


class ExtractedProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str = ""
    display_name: str = ""
    manufacturer: str = ""
    camera_model: str = ""
    profile_type: str = ""
    format: str = ""
    source_url: str = ""
    download_url: str = ""
    compatible: str = "unknown"  # yes | documented | unknown
    metadata: Dict[str, Any] = Field(default_factory=dict)
    status: str = "new"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AnalyzeUrlRequest(BaseModel):
    url: str


class SaveProfilesRequest(BaseModel):
    profiles: List[Dict[str, Any]] = Field(default_factory=list)


def _assert_safe_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Solo se permiten URLs http/https")
    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="URL inválida")
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        raise HTTPException(status_code=400, detail="No se pudo resolver el host")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise HTTPException(status_code=400, detail="URL no permitida (dirección interna)")


def _fetch(url, max_bytes=MAX_FETCH_BYTES):
    _assert_safe_url(url)
    resp = requests.get(url, timeout=15, stream=True, headers={"User-Agent": "WeddingRAWAI-ProfileExtractor/1.0"}, allow_redirects=True)
    resp.raise_for_status()
    if resp.url != url:
        _assert_safe_url(resp.url)  # revalida tras redirección
    content = b""
    for chunk in resp.iter_content(65536):
        if not chunk:
            continue
        remaining = max_bytes - len(content)
        if remaining <= 0:
            break
        content += chunk[:remaining]
        if len(content) >= max_bytes:
            break
    resp.close()
    return content, resp.headers.get("content-type", "")


def _ext_of(url):
    path = urlparse(url).path.lower()
    return path.rsplit(".", 1)[-1] if "." in path else ""


def _parse_xmp_profile(prof, text):
    m = re.search(r'crs:CameraProfile="([^"]+)"', text)
    n = re.search(r'crs:Name="([^"]+)"', text) or re.search(r'<crs:Name>.*?<rdf:li[^>]*>([^<]+)</rdf:li>', text, re.S)
    make = re.search(r'tiff:Make="([^"]+)"', text)
    model = re.search(r'tiff:Model="([^"]+)"', text)
    prof["name"] = (m.group(1) if m else (n.group(1) if n else "")).strip()
    prof["display_name"] = prof["name"]
    prof["manufacturer"] = make.group(1).strip() if make else ""
    prof["camera_model"] = model.group(1).strip() if model else ""
    prof["profile_type"] = "camera_profile" if m else ("preset" if re.search(r'crs:(Exposure2012|ToneCurve|Look)', text) else "xmp")
    prof["compatible"] = "yes" if (m or n) else "documented"


def _parse_lrtemplate_profile(prof, text):
    t = re.search(r'title\s*=\s*"([^"]+)"', text)
    internal = re.search(r'internalName\s*=\s*"([^"]+)"', text)
    prof["name"] = (t.group(1) if t else (internal.group(1) if internal else "")).strip()
    prof["display_name"] = prof["name"]
    prof["profile_type"] = "lrtemplate"
    prof["compatible"] = "yes" if (t or internal) else "documented"


def _parse_profile(content, ext, url):
    text = content.decode("utf-8", errors="ignore")
    prof = {"name": "", "display_name": "", "manufacturer": "", "camera_model": "",
            "profile_type": "", "format": ext, "source_url": url, "download_url": url,
            "compatible": "unknown", "metadata": {}, "status": "new"}
    if ext == "xmp":
        _parse_xmp_profile(prof, text)
    elif ext == "lrtemplate":
        _parse_lrtemplate_profile(prof, text)
    elif ext == "dcp":
        prof["profile_type"] = "camera_profile"
        prof["compatible"] = "yes"  # DCP es un perfil de cámara real de Lightroom
    else:
        prof["profile_type"] = ext or "unknown"
        prof["compatible"] = "documented"
    if not prof["name"]:
        base = urlparse(url).path.rsplit("/", 1)[-1]
        prof["name"] = re.sub(r"\.(xmp|dcp|lrtemplate|xml)$", "", base, flags=re.I) or base
        prof["display_name"] = prof["name"]
    return prof


def _extract_from_html(html, base_url):
    links = []
    for m in re.finditer(r'href=["\']([^"\']+)["\']', html, re.I):
        href = m.group(1)
        full = urljoin(base_url, href)
        if _ext_of(full) in PROFILE_EXTS and full not in links:
            links.append(full)
        if len(links) >= MAX_LINKS:
            break
    profiles = []
    for link in links[:MAX_FILE_FETCHES]:
        try:
            content, _ = _fetch(link, max_bytes=4 * 1024 * 1024)
            profiles.append(_parse_profile(content, _ext_of(link), link))
        except Exception:
            profiles.append({"name": urlparse(link).path.rsplit("/", 1)[-1], "display_name": "", "manufacturer": "",
                             "camera_model": "", "profile_type": _ext_of(link), "format": _ext_of(link),
                             "source_url": base_url, "download_url": link, "compatible": "documented",
                             "metadata": {}, "status": "new"})
    return profiles


def _dedup_key(p):
    return f"{(p.get('manufacturer') or '').lower()}|{(p.get('camera_model') or '').lower()}|{(p.get('name') or '').lower()}"


@api_router.post("/profile-extractor/analyze")
async def analyze_url(req: AnalyzeUrlRequest, user: User = Depends(get_current_user)):
    url = req.url.strip()
    try:
        content, ctype = _fetch(url)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se pudo acceder a la URL: {exc}")

    ext = _ext_of(url)
    errors = []
    profiles = []  # inicializado siempre para evitar usos indefinidos
    if ext in PROFILE_EXTS:
        profiles = [_parse_profile(content, ext, url)]
    elif "html" in ctype or content[:200].lstrip().startswith(b"<"):
        profiles = _extract_from_html(content.decode("utf-8", errors="ignore"), url)
        if not profiles:
            errors.append("No se encontraron archivos de perfil (.xmp/.dcp/.lrtemplate) enlazados en la página.")
    else:
        profiles = []
        errors.append("El contenido no es un perfil ni una página HTML con perfiles.")

    existing = await db.extracted_profiles.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    existing_keys = {_dedup_key(e) for e in existing}
    new_count = 0
    for p in profiles:
        if _dedup_key(p) in existing_keys:
            p["status"] = "existing"
        else:
            p["status"] = "new"
            new_count += 1
    return {"url": url, "found": len(profiles), "new": new_count,
            "existing": len(profiles) - new_count, "errors": errors, "profiles": profiles}


@api_router.post("/profile-extractor/save")
async def save_profiles(req: SaveProfilesRequest, user: User = Depends(get_current_user)):
    existing = await db.extracted_profiles.find({"user_id": user.user_id}, {"_id": 0}).to_list(2000)
    existing_keys = {_dedup_key(e) for e in existing}
    saved = 0
    for p in req.profiles:
        key = _dedup_key(p)
        if key in existing_keys:
            continue
        prof = ExtractedProfile(user_id=user.user_id, name=p.get("name", ""), display_name=p.get("display_name") or p.get("name", ""),
                                manufacturer=p.get("manufacturer", ""), camera_model=p.get("camera_model", ""),
                                profile_type=p.get("profile_type", ""), format=p.get("format", ""),
                                source_url=p.get("source_url", ""), download_url=p.get("download_url", ""),
                                compatible=p.get("compatible", "unknown"), metadata=p.get("metadata", {}), status="saved")
        await db.extracted_profiles.insert_one(prof.model_dump())
        existing_keys.add(key)
        saved += 1
    return {"saved": saved}


@api_router.get("/profile-extractor/profiles", response_model=List[ExtractedProfile])
async def list_extracted_profiles(user: User = Depends(get_current_user)):
    docs = await db.extracted_profiles.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [ExtractedProfile(**d) for d in docs]


@api_router.delete("/profile-extractor/profiles/{profile_id}")
async def delete_extracted_profile(profile_id: str, user: User = Depends(get_current_user)):
    res = await db.extracted_profiles.delete_one({"id": profile_id, "user_id": user.user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return {"ok": True}


def _profile_to_xmp(p):
    name = _xesc((p.get("display_name") or p.get("name") or "Perfil").replace('"', "'"))
    lines = ['   crs:Version="15.0"', f'   crs:Name="{name}"']
    if p.get("profile_type") == "camera_profile":
        lines.append(f'   crs:CameraProfile="{name}"')
    make = _xesc((p.get("manufacturer") or "").replace('"', "'"))
    model = _xesc((p.get("camera_model") or "").replace('"', "'"))
    tiff = ""
    if make:
        tiff += f'\n   tiff:Make="{make}"'
    if model:
        tiff += f'\n   tiff:Model="{model}"'
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    return (f'<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Wedding RAW AI">\n'
            f' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
            f'  <rdf:Description rdf:about=""\n'
            f'   xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"\n'
            f'   xmlns:tiff="http://ns.adobe.com/tiff/1.0/"\n'
            f'   xmlns:xmp="http://ns.adobe.com/xap/1.0/"\n'
            f'   xmp:ModifyDate="{now}"{tiff}\n'
            f'{chr(10).join(lines)}>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n')


@api_router.get("/profile-extractor/export/json")
async def export_profiles_json(user: User = Depends(get_current_user)):
    import json
    docs = await db.extracted_profiles.find({"user_id": user.user_id}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(5000)
    data = json.dumps(docs, ensure_ascii=False, indent=2).encode("utf-8")
    return StreamingResponse(io.BytesIO(data), media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="catalogo_perfiles.json"'})


@api_router.get("/profile-extractor/export/zip")
async def export_profiles_zip(user: User = Depends(get_current_user)):
    docs = await db.extracted_profiles.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    if not docs:
        raise HTTPException(status_code=400, detail="El catálogo está vacío")
    used = {}
    entries = []
    for p in docs:
        base = re.sub(r"[^\w\- ]+", "", (p.get("display_name") or p.get("name") or "perfil")).strip().replace(" ", "_") or "perfil"
        used[base] = used.get(base, 0) + 1
        fname = f"{base}.xmp" if used[base] == 1 else f"{base}_{used[base]}.xmp"
        entries.append((fname, _profile_to_xmp(p)))
    buf = build_zip_from_entries(entries)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="catalogo_perfiles_xmp.zip"'})
app.include_router(api_router)

_cors_origins = [o for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o]
_cors_wildcard = '*' in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_credentials=not _cors_wildcard,  # nunca combinar '*' con credenciales (robo cross-site)
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def reap_stuck_jobs():
    # Tras un reinicio, las tareas en memoria se pierden: marca como 'failed' todo lo que quedó a medias.
    now = datetime.now(timezone.utc).isoformat()
    await db.cloud_jobs.update_many(
        {"status": {"$in": ["queued", "processing"]}},
        {"$set": {"status": "failed", "error_message": "Interrumpido por reinicio del servidor. Vuelve a enviarlo.", "updated_at": now}},
    )
    await db.photographer_styles.update_many(
        {"status": "analyzing"},
        {"$set": {"status": "failed", "error_message": "Interrumpido por reinicio del servidor. Vuelve a analizar la galería."}},
    )


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
