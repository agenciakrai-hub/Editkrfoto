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

### Iteración 4 (2026-08-13)
- Aplicar estilo detectado: el análisis devuelve `suggested_parameters` (valores numéricos crs) que se aplican a los parámetros del revelado al seleccionar el estilo.
- Miniaturas de galería: se guardan y muestran varias imágenes de referencia (`gallery_images`), no solo una.
- Nivelado ajustable: KR Auto Nivelado permite afinar los 5 deltas (sliders) con vista previa en vivo antes de generar el ZIP.
- Reanudar nube: reaper en @startup marca como `failed` los cloud_jobs (queued/processing) y photographer_styles (analyzing) que quedaron colgados tras un reinicio.
- Testing: backend 23/23 pytest OK (regresión + reaper + shape), sin bugs.

### Fix (2026-08-13): selección solo 90 de 1000
- Causa: al copiar 1000 fotos desde tarjeta/descarga, `lastModified` colapsa a valores casi idénticos → el agrupado por tiempo las encadenaba en pocas ráfagas gigantes → 1 seleccionada por ráfaga.
- Solución: la selección IA se calcula ahora en el backend (POST /api/selection/analyze), testeable. Detecta si los timestamps son fiables (únicos/total > 0.5); si NO lo son, cada foto es su propia ráfaga y se selecciona todo; si lo son, agrupa ráfagas rápidas (<1500ms) con tope de 8 fotos y elige la mejor de cada una.
- Verificado: 1000 timestamps idénticos → 1000 seleccionadas; 1000 realistas → 583. Testing 30/30 OK.

### Iteración 6 (2026-08-13)
- Modelo de edición actualizado: **ajustes básicos (luz/tono + balance de blancos) siempre automáticos por IA**; presets y estilos solo aplican la **capa creativa** (claridad, vibración, saturación) y NUNCA tocan lo básico. `AUTO_BASIC_PARAMS` se inyecta siempre en el XMP; `pickCreative`/`creativeParametersFromConfig`/`fullParametersFromConfig` en lib/paramDefs.js. Panel de Presets separa "Ajustes básicos — automático" (bloqueado) de "Ajustes creativos".
- Antes/Después: previsualización simulada con filtros CSS derivados de los parámetros (slider comparador). BeforeAfterPreview.jsx.
- Comparar estilos: dos galerías lado a lado con tabla de diferencias color/edición + confianza (selects). En PhotographerStyles.
- Exportar perfil: descarga un estilo detectado como `.xmp` listo para Lightroom (buildStyleXmp).
- Verificado: compilación limpia + XMP end-to-end (base auto + creativa con atributos crs correctos). Flujos UI internos dependen del selector de carpeta (no automatizable headless).

### Iteración 7 (2026-08-13): selección precisa + motor optimizado 5000 fotos
- Selección por CONTENIDO real (antes era un hash aleatorio del nombre): nitidez (varianza del laplaciano) + exposición (histograma) + perceptual hash (average-hash 8x8) para agrupar por similitud visual. Elige la más nítida/mejor expuesta de cada secuencia; si hay empate (≥92% de la mejor) selecciona más de una; nunca descarta fotos sin métrica. Lógica pura en `src/lib/selectionLogic.js` (6 tests jest).
- Motor optimizado para miles de fotos: `extractPreviewBlob` lee SOLO los primeros 4MB del RAW con `file.slice` (no carga el archivo entero) para sacar la miniatura JPEG incrustada; cola con concurrencia limitada (mapLimit) + barra de progreso en SelectionStep.
- Salida final EXCLUSIVAMENTE `.xmp`: `build_zip` genera un ZIP solo con los sidecars .xmp (sin LEEME) para descargar y pegar en la carpeta raíz.
- Verificado: jest 6/6 (motor selección) + backend 31/31 (regresión + ZIP xmp-only). Sin bugs.

### Iteración 8 (2026-08-13): corrección por foto + preset completo
- Bug "misma corrección de luz a todas": ahora la corrección básica (exposición/luces/sombras/blancos/negros) se calcula AUTOMÁTICAMENTE POR FOTO desde su luma+recorte medidos (`autoBasicFromMetrics`) y se envía por foto. Cada XMP tiene su propia exposición.
- Bug "el preset de Lightroom no se aplica": el preset .xmp subido se conserva COMPLETO (curvas, HSL, textura, split toning…). El backend solo sustituye los atributos básicos por la corrección per-foto de la IA (`build_photo_xmp` + `_set_crs_attr`); el resto del look pasa intacto.
- Nuevo payload per-foto: `{photos:[{filename,basic}], creative_params, preset_xmp}` (con compatibilidad al formato antiguo). Cloud jobs también.
- Verificado: jest 9/9 + backend 36/36. DARK.xmp Exposure +0.85 vs BRIGHT.xmp −0.60; Clarity/Vibrance/Texture del preset preservados. Sin bugs.

### Iteración 9 (2026-08-13): precisión del auto-tono básico
- La corrección básica por foto pasó de una fórmula simple (exposición por luma media) a un AUTO-TONO real basado en el HISTOGRAMA (`autoToneFromHistogram`): percentiles 0.5/50/99.5 para fijar exposición al tono medio objetivo, blancos/negros hasta casi tocar los extremos sin recortar, y recuperación de altas luces/sombras según el recorte medido. Calculado por foto en el análisis (metrics.basic).
- Verificado: jest 10/10 (auto-tono oscuro→+EV, claro→−EV, recuperación de luces/sombras) + backend 36/36 (per-foto llega al XMP). Sin bugs de código.

## Backlog / Próximos
- P1: Persistir/reanudar selección al reabrir proyecto (restaurar por nombre de archivo tras re-seleccionar carpeta).
- P1: Vista de thumbnails reales de RAW (embedded preview) en vez de imágenes de muestra.
- P2: Procesamiento en la nube (CloudJob) con cola y estado.
- P2: Carga de preset .xmp externo y gestión de perfiles de estilo guardados.
- P2: Estadísticas del reportaje / bento report ampliado.

## Notas
- Selección IA es heurística determinista (sin LLM).
- Thumbnails de revisión usan imágenes de muestra (los RAW no son previsualizables en navegador).
