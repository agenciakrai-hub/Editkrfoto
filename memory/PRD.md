# RAW AI Studio — PRD

## Problema original
Recrear "RAW AI Studio": app de selección y edición IA de bodas. Del proyecto al ZIP final:
importar carpeta RAW, IA agrupa ráfagas y marca mejores tomas, revisión, perfil de cámara,
presets/correcciones IA, procesamiento local y descarga de XMP. Los RAW nunca se modifican.

## Elecciones del usuario
- Alcance: MVP funcional del flujo principal.
- Selección IA: heurística inteligente (elección del agente).
- XMP: archivos sidecar reales descargables en ZIP.
- Auth: Google login (Emergent-managed Google Auth).
- Procesamiento: solo local (sin nube).

## Stack
React 19 + FastAPI + MongoDB. Tema oscuro pro (bg #101012, paneles #141418, acento emerald #34D399).
Fuentes: Outfit (títulos), Inter (cuerpo), JetBrains Mono. sonner para toasts, JSZip/file-saver descarga.

## Implementado (2026-08-13)
- Auth Emergent Google (cookie session_token httpOnly + Bearer fallback): /api/auth/session, /me, /logout.
- Proyectos CRUD por usuario: crear/listar/ver/actualizar/eliminar + PATCH /state (deep-merge de rawai_state).
- Generación XMP real: POST /api/projects/{id}/generate-xmp -> ZIP con un .xmp (atributos crs:) por foto + LEEME.txt.
- Frontend: Login, Dashboard (crear/abrir/eliminar proyectos), Studio stepper de 6 pasos:
  Carpeta RAW -> Selección IA (burst grouping + best-shot) -> Revisión -> Perfil cámara -> Presets/params IA -> Procesamiento -> Reporte + descarga ZIP.
- Heurística de selección: agrupa por proximidad temporal (lastModified), scoring determinista, marca mejor toma de cada ráfaga.

### Iteración 2 (2026-08-13)
- Miniaturas reales: extracción del JPEG embebido en el RAW (lib/rawThumb.js) con carga perezosa (IntersectionObserver) en Revisión.
- Perfiles de estilo propios: subir .xmp (parseo crs -> config) y guardar/cargar/eliminar perfiles reutilizables (/api/style-profiles).
- Procesamiento en la nube: /api/projects/{id}/cloud-jobs (cola asíncrona queued->processing->completed), página /processing con polling + descarga ZIP.
- Reanudar selección por nombre de archivo al reabrir proyecto tras re-elegir carpeta.

### Iteración 3 (2026-08-13)
- KR Auto Nivelado (herramienta principal, 100% cliente con JSZip): nivelado técnico fijo de sidecars XMP (Exposición +0.10, Luces −15, Sombras +15, Blancos +5, Negros −5), preserva nombres y el resto del archivo. lib/xmp/krAutoLevel.js + componente KrAutoNivelado.jsx con vista previa y ZIP descargable.
- Estilos desde galería (PhotographerStyleProfile): analiza la URL pública de otro fotógrafo con visión (GPT-5.4 vía Universal Key), scraping HTML + 12 imágenes, devuelve color_profile + edit_profile + descripción + confianza. /api/photographer-styles CRUD + análisis en background. Seleccionable como estilo de referencia en Presets.
- Testing: backend 22/22 pytest OK (auth, scoping cross-user, cloud jobs, XMP, photographer styles happy/fail path).

## Backlog / Próximos
- P1: Persistir/reanudar selección al reabrir proyecto (restaurar por nombre de archivo tras re-seleccionar carpeta).
- P1: Vista de thumbnails reales de RAW (embedded preview) en vez de imágenes de muestra.
- P2: Procesamiento en la nube (CloudJob) con cola y estado.
- P2: Carga de preset .xmp externo y gestión de perfiles de estilo guardados.
- P2: Estadísticas del reportaje / bento report ampliado.

## Notas
- Selección IA es heurística determinista (sin LLM).
- Thumbnails de revisión usan imágenes de muestra (los RAW no son previsualizables en navegador).
