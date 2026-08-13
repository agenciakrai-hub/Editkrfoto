from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import zipfile
import logging
import uuid
import requests
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


class XmpRequest(BaseModel):
    filenames: List[str]
    parameters: Dict[str, float] = Field(default_factory=dict)
    camera_profile: Optional[str] = "Adobe Standard"
    precision_mode: Optional[str] = "balanced"
    preset_name: Optional[str] = None


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


@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: User = Depends(get_current_user)):
    res = await db.projects.delete_one({"id": project_id, "user_id": user.user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return {"ok": True}


# ----------------------------- XMP generation -----------------------------
CRS_MAP = {
    "exposure": "Exposure2012",
    "contrast": "Contrast2012",
    "highlights": "Highlights2012",
    "shadows": "Shadows2012",
    "whites": "Whites2012",
    "blacks": "Blacks2012",
    "clarity": "Clarity2012",
    "vibrance": "Vibrance",
    "saturation": "Saturation",
    "temperature": "Temperature",
    "tint": "Tint",
}


def build_xmp(filename: str, params: Dict[str, float], camera_profile: str, process_precision: str) -> str:
    crs_lines = ['   crs:Version="15.0"',
                 f'   crs:ProcessVersion="11.0"',
                 f'   crs:CameraProfile="{camera_profile}"',
                 '   crs:WhiteBalance="As Shot"',
                 f'   crs:HasSettings="True"']
    for key, value in params.items():
        attr = CRS_MAP.get(key)
        if not attr:
            continue
        if key in ("temperature", "tint"):
            crs_lines.append(f'   crs:{attr}="{int(round(value))}"')
        else:
            crs_lines.append(f'   crs:{attr}="{value:+.2f}"' if attr.endswith("2012") and key == "exposure" else f'   crs:{attr}="{int(round(value))}"')
    crs_block = "\n".join(crs_lines)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    return f'''<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="RAW AI Studio 1.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:xmp="http://ns.adobe.com/xap/1.0/"
   xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   xmp:CreatorTool="RAW AI Studio"
   xmp:ModifyDate="{now}"
   crs:RawFileName="{filename}"
   crs:Precision="{process_precision}"
{crs_block}>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
'''


@api_router.post("/projects/{project_id}/generate-xmp")
async def generate_xmp(project_id: str, req: XmpRequest, user: User = Depends(get_current_user)):
    doc = await db.projects.find_one({"id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    if not req.filenames:
        raise HTTPException(status_code=400, detail="No hay archivos en la cola")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in req.filenames:
            base = fname.rsplit(".", 1)[0]
            xmp_content = build_xmp(fname, req.parameters, req.camera_profile or "Adobe Standard", req.precision_mode or "balanced")
            zf.writestr(f"{base}.xmp", xmp_content)
        readme = (f"RAW AI Studio — Paquete XMP\nProyecto: {doc.get('name')}\n"
                  f"Perfil de cámara: {req.camera_profile}\nModo de precisión: {req.precision_mode}\n"
                  f"Preset: {req.preset_name or 'Personalizado'}\nArchivos XMP: {len(req.filenames)}\n\n"
                  "Coloca cada archivo .xmp junto a su RAW correspondiente en Lightroom / Camera Raw.\n"
                  "Los archivos RAW originales NO se modifican.\n")
        zf.writestr("LEEME.txt", readme)
    buf.seek(0)

    await db.projects.update_one({"id": project_id}, {"$set": {
        "status": "completed", "processed_images": len(req.filenames),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})

    safe = (doc.get("name") or "proyecto").replace(" ", "_")
    return StreamingResponse(
        io.BytesIO(buf.read()),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="RAWAI_{safe}_XMP.zip"'},
    )


@api_router.get("/")
async def root():
    return {"message": "RAW AI Studio API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
