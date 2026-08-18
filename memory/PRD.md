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

### Iteración 10 (2026-08-13): Extractor de perfiles desde URL (módulo aditivo)
- Módulo independiente (no toca motor ni flujos existentes). Colección `extracted_profiles` + endpoints `/api/profile-extractor/{analyze,save,profiles,{id}}`.
- Extrae perfiles (.xmp/.dcp/.lrtemplate) de un archivo directo o de una página con enlaces; estructura normalizada; dedup por manufacturer+camera_model+name; compatibilidad LR (yes/documented/unknown).
- Seguridad SSRF: bloquea localhost/privadas/link-local/reservadas/metadata + esquemas no http; límites de tamaño/enlaces/tiempo; revalida tras redirección; sin ejecución de código.
- UI: página `/profiles` (enlace "Perfiles" en la barra) con URL, Analizar, tabla de resultados y catálogo guardado.
- Verificado: 27 casos backend + E2E frontend PASS. Sin bugs.

### Iteración 12 (2026-08-16): Portado desde app de referencia — Biblioteca de Estilos + RAW AI Learning
- Navegación ampliada (AppShell): barra con Proyectos / Estilos / Aprendizaje / Perfiles + resaltado de página activa.
- **Biblioteca de Estilos** (página dedicada `/styles`): hub central que reutiliza el componente PhotographerStyles para crear/analizar/gestionar estilos de galería fuera del wizard.
- **RAW AI Learning** (`/learning`, "Aprende de mis correcciones"): sube tus .xmp editados a mano → parseo cliente (parseXmp) → `POST /api/learning/analyze` agrega medias por clave (básicos + creativos) con stats{mean,min,max,count} y resumen en español. Guardar/activar/eliminar perfiles personales: `personal_profiles` + endpoints GET/POST/PATCH(activate)/DELETE `/api/learning/profiles`. Primer perfil se activa solo; activación exclusiva por usuario; scoping por user_id.
- Dashboard: tarjetas de proyecto con barra de progreso + "X fotografías · estado" (etiqueta localizada).
- NOTA: aplicar el perfil personal aprendido al motor de auto-tono queda como P2 (tarea futura); por ahora el módulo es aditivo y no toca el motor existente.
- Verificado: testing_agent iteración 12 — backend 18/18 pytest OK (CRUD + scoping cross-user + regresión), frontend 100% flujos críticos (nav, /styles, /learning upload→analyze→save→activate→delete, tarjeta dashboard). Sin bugs.

### Iteración 13 (2026-08-16): Motor de ajustes básicos v2 (dos capas, sin IA/coste) + Laboratorio de comparación
- Nuevo motor determinista en `src/lib/rawaistudio/`:
  - `photometricAnalysis.js` (capa técnica): percentiles p1/p5/p50/p95/p99, clipping luces/sombras, **medición ponderada al centro** (fotómetro real, prioriza al sujeto) y **clasificación de escena sin IA** (high_key / low_key / backlit / flash / normal) derivada de la fotometría.
  - `exposureEngine.js` (capa de revelado): traduce fotometría → básicos (exposure/contrast/highlights/shadows/whites/blacks) con **modos de precisión con topes reales**: Conservador ±0.35EV/±20, Equilibrado ±0.6EV/±35 (default), Agresivo ±1.0EV/±55, con banda de mediana objetivo por modo. Ajustes contextuales por escena (contraluz abre sombras, clave alta protege luces, flash/clave baja preservan intención).
- Página **Laboratorio del motor** (`/engine-lab`, nav "Motor", beta): elige carpeta → muestra de 24 fotos → compara valor **antiguo (`autoToneFromHistogram`) vs nuevo v2** por foto, con conmutador de modo en vivo y etiqueta de escena. 100% local, los RAW no se modifican. El motor actual NO se ha sustituido todavía (a validar por el usuario antes de reemplazar).
- Nav ampliada: Proyectos · Estilos · Aprendizaje · Motor · Perfiles (+ menú móvil en el avatar).
- Verificado: jest 8/8 del nuevo motor (oscura→+EV, clara→−EV, topes por modo, contraluz→+sombras, clave alta no sobreexpone, degenerados no rompen). Compila y renderiza OK.
- PENDIENTE (tras validación): sustituir `autoToneFromHistogram` por el motor v2 en el flujo del estudio y cloud, y aplicar el modo de precisión elegido por foto.

### Iteración 14 (2026-08-16): Motor v2 CONECTADO al flujo real
- `imageAnalysis.metricsFromBitmap` ahora calcula `photometrics` por foto (histograma global + ponderado al centro) durante la selección; se adjunta a cada foto en `SelectionStep`.
- `Studio.buildPayload` calcula los básicos por foto con `computeBasic(photometrics, mode)` (motor v2) aplicando el **modo de precisión elegido**; fallback a base técnica si no hay fotometría (selección restaurada). Vale para local y nube.
- `PRECISION_MODES` ahora son reales: Conservador / Equilibrado (default) / Agresivo, con topes ±EV efectivos.
- Backend sin cambios (ya mapea `contrast`→Contrast2012). Verificado end-to-end: 2 fotos → XMP distintos (DARK +0.60 EV / BRIGHT −0.44 EV) con contraste y capa creativa correctos. jest 18/18 OK.
- El auto-tono antiguo (`autoToneFromHistogram`) se conserva como fallback y para el laboratorio de comparación.

### Iteración 15 (2026-08-16): Capa de caras (Fase 1) — selección IA con detección de personas
- Librería **@vladmandic/face-api** (local, gratis, sin nube). Modelos TinyFaceDetector servidos desde `/public/models` (verificado 200 en preview; detección real confirmada: 4 caras en foto de grupo).
- `faceLogic.js` (puro, testeado): `facesChanged(a,b)` → mismo nº de caras y sin desplazamientos >6% del encuadre = misma toma; si cambian = **foto distinta**. jest 5/5.
- `faceEngine.js` (capa extra, NO toca el motor de selección): `loadFaceModels` (inicializa backend tfjs webgl→fallback), `detectFacesFromUrl`, `applyFaceLayer`.
- `applyFaceLayer` corre **solo sobre ráfagas (>1) y fotos ya seleccionadas** (rápido). Añade por foto: `faceCount`, `isGroup` (≥3), `noPeople`, y afina ráfagas: **rescata** hermanas cuya configuración de caras cambió (`faceDistinct`, se marcan como seleccionadas) y marca **`doubt`** cuando hay varias tomas iguales sin ganadora clara.
- UI: `SelectionStep` muestra 2ª fase "Analizando caras…" + resumen (grupo / rescatadas / dudas). `ReviewStep` muestra badges por foto: nº personas / grupo / sin personas, **⚠ Dudas**, **Cara distinta**, con leyenda.
- Garantía: el motor solo AÑADE selecciones (nunca quita) → **mínimo 1 foto por ráfaga** siempre. Si los modelos fallan, el flujo continúa sin caras (no bloquea).
- PENDIENTE Fase 2: filtros (grupo / sin personas / protagonistas), agrupado automático de caras (clustering con face_recognition) + etiquetado por el usuario (novia/novio/invitados).
- NOTA: el flujo completo en el estudio requiere subir una carpeta de RAW real (no automatizable en headless); validado por partes (detección e2e + tests + compilación). Pendiente validación del usuario con fotos reales.

### Iteración 16 (2026-08-16): Fase 2 — reconocimiento de caras (protagonistas) + filtros
- Modelos añadidos y servidos localmente: `face_landmark_68` + `face_recognition` (además de tiny_face_detector). `loadFaceModels` carga los 3.
- `detectFacesFromUrl(url, withDescriptors)` → descriptores 128-d por cara (verificado en navegador: 4 caras, len 128, distancias 0.63–0.77 = personas distintas).
- `faceLogic.js` (puro, testeado): `euclidean` + `clusterFaces` (clustering voraz por centroide, umbral 0.55). jest 8/8 en faceLogic.
- `applyFaceLayer` ahora agrupa personas por reconocimiento, asigna `p.people=[clusterId]`, y devuelve `people` (top 12 protagonistas con recorte 96x96 `thumb` + nº de fotos).
- UI `ReviewStep` reescrito con: barra de **filtros** (Todas / Con personas / Grupos / Sin personas) + **panel de protagonistas** (avatar recortado, nombre editable —novia/novio/invitados—, contador, clic para filtrar por persona). `SelectionStep` muestra "N personas".
- Threading: `SelectionStep.onContinue(photos, people)` → `Studio` guarda `people` → `ReviewStep`.
- Todo local y gratis. No toca el motor de selección ni el de ajustes básicos. Compila; jet total 26/26.
- NOTA: flujo completo requiere carpeta RAW real (no automatizable en headless); verificado por partes (reconocimiento e2e + tests + compilación). Pendiente validación del usuario. Etiquetas de personas son de sesión (no persistidas aún).

### Iteración 17 (2026-08-16): Herramienta "Auto básicos → XMP" (independiente, 100% local)
- Nueva página `/auto-basic` (nav "Auto XMP"): importa carpeta → el motor v2 analiza TODAS las fotos → calcula los 6 básicos por foto (modo de precisión elegido) → exporta ZIP de .xmp con jszip en el navegador (sin backend, sin coste).
- Sin ráfagas, sin selección, sin presets/estilos: SOLO ajustes básicos (los creativos no se incluyen).
- Reutiliza `analyzeFile` (fotometría), `computeBasic` (exposureEngine v2), `buildStyleXmp` (cliente) y file-saver. Fallback a AUTO_BASIC_PARAMS si una foto no da fotometría.
- Cambiar de modo tras analizar recalcula al instante (no reanaliza). Perfil de cámara configurable (def. Adobe Standard).
- Verificado: página renderiza (nav, picker, modos, perfil) + test de XMP (incluye los 6 básicos, excluye Clarity/Vibrance/Saturation, formato exposición +0.00). jet total: pasa.
- NOTA: análisis de carpeta real no automatizable en headless; validado por partes.

### Iteración 18 (2026-08-16): Revisión de código — correcciones seguras
- `server.py analyze_url`: inicializado `profiles = []` antes del if/elif/else (defensivo; el hallazgo "undefined" era falso positivo pero se blinda).
- `Studio.jsx persist`: `console.warn` ahora solo en desarrollo (`NODE_ENV === 'development'`).
- REVISADO y NO cambiado (falsos positivos): los `is None`/`is not None` del backend (líneas 188/293/411/790/859) son el idioma CORRECTO de Python; cambiarlos a `==` sería un anti-patrón. Catch "vacíos" en LearningModule/faceEngine son *skips* intencionados y ya llevan comentario + fallback.
- DIFERIDO (riesgo de regresión sobre código probado, ya anotado en handoff): refactor de complejidad de componentes (ReviewStep/PhotographerStyles/PresetParamsStep/SelectionStep) y `_parse_profile`/`analyze_photographer_style`; y los cambios masivos de dependencias de hooks (efectos de montaje intencionados).

### Iteración 19 (2026-08-16): Aplicadas correcciones de la revisión de código
- Hooks: añadido `eslint-disable-next-line react-hooks/exhaustive-deps` con motivo a los efectos de montaje intencionados (Dashboard, ProfileExtractor, LearningModule, PresetParamsStep, SelectionStep, Studio). AuthContext ya era correcto (useCallback/useMemo con deps válidas). Sin cambios de comportamiento.
- LearningModule: `ALL_KEYS` hoisted a scope de módulo (evita recrear el array en cada render).
- Backend: `_parse_profile` refactorizado en helpers `_parse_xmp_profile` / `_parse_lrtemplate_profile` (menos complejidad). Verificado idéntico en XMP/lrtemplate/dcp/fallback.
- Frontend: `PhotographerStyles` descompuesto → `StyleComparePanel` (IIFE de comparación) + `StyleCard` (+ StatusPill). Renderiza OK.
- Falsos positivos confirmados y NO tocados: `is None`/`is not None` (idioma correcto Python); catch intencionados con comentario.
- PENDIENTE (opcional, refactor de complejidad en flujos entrelazados no auto-testeables sin subir RAW real): descomposición de `ReviewStep`/`SelectionStep`/`PresetParamsStep` y de `analyze_photographer_style`/`compute_selection`. Se dejan para una pasada dedicada con pruebas de regresión.

### Iteración 20 (2026-08-16): Más refactors de complejidad (verificados en regresión)
- `ReviewStep` → extrae `PhotoCard`. `SelectionStep` → extrae `SelectionProgress`. (Junto a StyleCard/StyleComparePanel de la iter. 19).
- Regresión testing_agent (iteration_13.json): backend 21/21, frontend 6/6 rutas renderizan, sin issues, sin errores de consola, retest_needed=false. Comportamiento idéntico confirmado.
- HECHO de la revisión de código: bug `profiles` (blindado), hooks (eslint-disable con motivo), `_parse_profile` (helpers), console.warn (dev-gate), ALL_KEYS (hoist), y complejidad de PhotographerStyles/ReviewStep/SelectionStep reducida.
- PENDIENTE (Important, no crítico): `PresetParamsStep` y backend `analyze_photographer_style`/`compute_selection` — funciones con lógica/estado entrelazado; se dejan para una pasada dedicada con pruebas.

### Iteración 21 (2026-08-17): Motor de selección IA — precisión (Parte 1)
- **Auto-rotación EXIF** (`exif.js`): lee la orientación (JPEG/TIFF/CR3-CMT1) y la aplica en `rawThumb.extractThumb` (miniatura upright) y en `imageAnalysis.bitmapFromFile` (análisis upright). Arregla verticales de lado y el falso "Sin personas" (las caras giradas ya no se detectaban).
- **Ojos y expresión**: `detectFacesFromUrl` ahora usa landmarks + expresiones + descriptor → por cara `ear` (ojos abiertos), `smile`, `area`. `photoFaceScore` (pure) penaliza ojos cerrados (peor caso del grupo), premia sonrisa y tamaño de sujeto. Modelo `face_expression` añadido a /models.
- **Selección precisa por ráfaga**: re-ranking en `applyFaceLayer` = 55% base (nitidez/exposición) + 45% cara → elige SOLO la mejor. "Dudas" solo en empate real ≥98.5%. "Cara distinta" solo si las caras cambiaron de posición (>6% encuadre).
- Verificado: EXIF reader (test), detección+ojos+expresión e2e en navegador (3 caras, EAR 0.26-0.30, happy, desc 128), `photoFaceScore`/EAR (tests). jet total 33+ OK. Flujo con RAW real: pendiente prueba del usuario.

### Iteración 22 (2026-08-17): Selección final (finalSelection) + 5★/verde + visor
- **Regla IA→Revisión→final**: `finalSelection` (en `rawai_state`) es la fuente de verdad. La IA solo propone (`source:"ai"`); cada cambio manual marca `source:"manual"` y persiste al instante (`Studio.persistFinal` + `ReviewStep.onChange`).
- **Persistencia/restauración**: al reabrir, `FolderSelectStep` restaura `finalSelection` por nombre (manual prevalece); NO re-ejecuta la IA sobre lo ya decidido. Descartadas se conservan (pestaña "No seleccionadas").
- **XMP**: `build_xmp` añade `xmp:Rating="5"` + `xmp:Label="Green"`; ruta preset usa `_set_xmp_meta` (inserta/actualiza esos 2 atributos y el namespace xmp SIN borrar Look/ToneCurve/HSL…). Verificado XML bien formado.
- **Endpoint** `GET /api/projects/{id}/final-selection` → estructura para el plugin de Lightroom: `{filename, selected, source, rating, label}`.
- **UI** `ReviewStep` reescrito: pestañas Seleccionadas(X)/No seleccionadas(X), tarjetas grandes con 5★+etiqueta verde+estado+IA/Manual+añadir/quitar. Nuevo `PhotoViewer` (grande, ←/→, estado, IA/manual, añadir/quitar, Esc).
- No se tocó el motor de selección (puntuación/ráfagas/caras/ojos/sonrisa intactos).
- NOTA: el panel de filtros por protagonista (iter.16) NO se muestra en la nueva revisión por pestañas (el reconocimiento sigue corriendo); se puede re-añadir si se desea. Flujo con RAW real: pendiente prueba del usuario.

### Iteración 23 (2026-08-17): Auditoría de seguridad — correcciones (verificadas 17/17)
- SSRF: `_assert_safe_url` aplicado en `scrape_gallery_images` y `download_images_b64` (bloquea IP internas/metadata). Verificado rechaza 169.254.169.254 / localhost / 127.0.0.1.
- CORS: `CORS_ORIGINS` explícito (edit.krfoto.com + preview); `allow_credentials=False` si comodín. No refleja orígenes arbitrarios con credenciales.
- XML: `_xesc` (incluye `&quot;`) en `build_xmp` (filename/camera_profile) y `_profile_to_xmp`; ruta preset con `_set_xmp_meta` sin borrar campos.
- ZIP: nombres de entrada saneados a basename (sin path traversal).
- `final-selection` blindado ante entradas no-dict. Testing_agent iteration_15: 100% (17/17), sin issues.

### Iteración 24 (2026-08-17): Fix DNG — ajustes no visibles tras actualizar metadatos
- Causa: Lightroom IGNORA los sidecar `.xmp` para DNG (los ajustes deben ir DENTRO del `.dng`).
- Fix: `dngXmp.embedXmpInDng` inserta el XMP (básicos + `xmp:Rating=5` + `xmp:Label=Green`) dentro del DNG re-apuntando la etiqueta TIFF 700 (append seguro, sin reescritura in situ). CR3/otros mantienen sidecar `.xmp`.
- Conectado en la herramienta **Auto XMP** (`/auto-basic`): DNG → `.dng` con XMP embebido; resto → `.xmp`.
- Verificado: unit tests dngXmp 3/3 (tag 700 apunta al nuevo XMP con crs+rating+label; falla limpio si no es TIFF) + testing_agent frontend 6/6 rutas sin errores. Validación final en Lightroom: la hace el usuario.
- PENDIENTE: conectar el embebido DNG también en el flujo de Studio (ReportStep, con presets) — hoy Studio genera ZIP en backend (sidecars); DNG en Studio requiere procesar el archivo en cliente. Compatible con el plugin vía `final-selection`.

## Backlog / Próximos
- P1: Persistir/reanudar selección al reabrir proyecto (restaurar por nombre de archivo tras re-seleccionar carpeta).
- P1: Vista de thumbnails reales de RAW (embedded preview) en vez de imágenes de muestra.
- P2: Procesamiento en la nube (CloudJob) con cola y estado.
- P2: Carga de preset .xmp externo y gestión de perfiles de estilo guardados.
- P2: Estadísticas del reportaje / bento report ampliado.

## Notas
- Selección IA es heurística determinista (sin LLM).
- Thumbnails de revisión usan imágenes de muestra (los RAW no son previsualizables en navegador).
