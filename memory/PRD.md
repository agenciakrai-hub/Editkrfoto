# RAW AI Studio — PRD

## Problema original
App web local-first para culling y edición de fotografía RAW (fotógrafos de bodas).
Motor de IA ajusta básicas (exposición, contraste, blancos…), aplica presets creativos
y perfiles de cámara Adobe. Genera XMP seguros y sincroniza con Lightroom Classic
mediante un **plugin nativo propio** (sin dependencias de terceros / Base44).

## Stack
- Frontend: React SPA. Módulos puros en `src/lib/rawaistudio/` (151 tests, 41 snapshots estrictos).
- Backend: FastAPI (`server.py`) + MongoDB.
- Auth: Emergent-managed Google Auth (session-based).
- LLM: OpenAI vía Emergent LLM Key.
- Plugin Lightroom: Lua en `/app/backend/lightroom-plugin/rawai_studio.lrplugin/`.
- Producción: https://edit.krfoto.com (desplegado en Emergent).

## Implementado (jun 2026)
- Limpieza de wrappers de presets → XMP aplican básicas en DNG.
- Etiqueta color i18n (Label="Verde") para LrC español.
- Inyección exacta de crs:Look con UUIDs Adobe (Color, Landscape, Vivid, Portrait, Mono).
- Motor IA: protección de sujeto (contención de Blancos/Contraste con rostros detectados).
- UI: panel de verificación XMP + auditoría IA por foto.
- UI: concurrencia + toast de progreso para 500+ fotos.
- Exportación: ZIP fragmentado (~300MB) + opción "Solo XMP (ligero)".
- Eliminación total de código legacy Base44/localhost.
- **Plugin nativo Lightroom (jun 2026) — COMPLETO Y PROBADO E2E**:
  - Backend: `/api/lr/token`, `/api/lr/token/rotate`, `/api/lr/push`, `/api/lr/pending`,
    `/api/lr/complete`, y `/api/lr/plugin-download`.
  - `/api/lr/plugin-download` empaqueta `/app/backend/lightroom-plugin/` (plugin + INSTALAR.txt
    + Instalar-Windows.bat + Instalar-Mac.command) y preserva bit ejecutable en el .command.
  - **Fix cuelgue "Enviando…" (jun 2026)**: nuevo endpoint `POST /api/projects/{id}/lr-push`
    genera los XMP en el servidor y los encola directo en `lr_jobs` con `bulk_write` (import pymongo).
    El frontend ya NO descarga/parsea ZIP en el navegador → el botón se resuelve al instante.
    Probado con 506 fotos: ~0.2s, HTTP 200.
  - Instaladores copian el plugin a la carpeta Modules de Lightroom (auto-carga al reiniciar):
    Windows `%APPDATA%\Adobe\Lightroom\Modules`, macOS `~/Library/Application Support/Adobe/Lightroom/Modules`.
    Adobe NO permite auto-instalación desde navegador; esto es lo más cercano viable.
  - Frontend `LightroomPlugin.jsx`: botón Enviar + token + descarga plugin/instalador.
  - Sync jobs persistidos en MongoDB (`db.lr_jobs`), no en memoria.

## Backlog
- P2: Análisis diferido — mover fotometría pesada al paso de Procesamiento (no en Revisión).
- P3: Seguridad diferida por orden del usuario — SSRF en análisis de URLs (server.py ~1212+),
  DoS por falta de límites en generación de ZIP.
- P4: Perfiles "Adobe Neutro" y "Adaptables" (requiere XMP del usuario para extraer UUIDs).

## Carpetas dentro de proyecto (sep 2026)
- Colección `project_folders` (id, project_id, user_id, name, raw_folder_path, total/processed_images,
  status, rawai_state, order). Cada carpeta tiene su propio culling/edición/XMP (rawai_state propio).
- Backend: GET/POST `/api/projects/{pid}/folders`, GET/PUT/DELETE `/api/folders/{fid}`,
  PATCH `/api/folders/{fid}/state`, GET `/api/folders/{fid}/final-selection`. Borrado de proyecto
  elimina sus carpetas en cascada.
- Frontend: nueva página `ProjectDetail` (`/project/:projectId`) gestor de carpetas (crear/renombrar/
  borrar + accesos rápidos: Preparativos/Ceremonia/Sesión pareja/Banquete/Fiesta). Dashboard abre
  `/project/:id`. `Studio` es folder-aware (`?folder=`): carga/guarda estado por carpeta; generate-xmp/
  lr-push/cloud-jobs siguen scopeados por proyecto. Verificado E2E (curl + screenshots).

## Stripe / Suscripciones (sep 2026) — BACKEND LISTO, UI DE PRECIOS PENDIENTE (aparcado por el usuario)
- Sandbox Stripe Flow A (país ES, modo gestionado/SMP). Catálogo `setup_stripe.py`: producto
  "RAW AI Studio Pro" con 4 precios: pro_monthly_eur (40€), pro_annual_eur (300€), pro_monthly_usd
  (44$), pro_annual_usd (324$). Prueba 15 días (TRIAL_DAYS), registro ABIERTO (ALLOWED_EMAILS=""),
  OWNER_EMAIL con acceso permanente.
- Backend: `/api/subscription/plans`, `/api/subscription/me`, `/api/payments/checkout`,
  `/api/payments/status/{sid}`, `/api/stripe/webhook`. Gating `require_access` (402) en endpoints de
  valor (create_project, create_folder, lr-push, generate-xmp, cloud-jobs, analyze-selection).
  payment_transactions + user.subscription_* en Mongo.
- FALTA: página de precios en el frontend + probar checkout E2E. El usuario pidió "construir la app
  primero, precios después".

## Motor: precisión de análisis (jun 2026)
- **Exposición orientada al sujeto** (`exposureEngine.computeBasic` + `basicEngine.computeAiBasics`):
  cuando hay una cara con peso real (faceWeight ≥ 0.25), la exposición apunta a la
  luminancia de la PIEL hacia una banda ideal (~118–148, según modo) en vez del fotómetro
  mezclado cara+fondo. Levanta caras oscuras sobre fondos claros; sigue protegiendo de
  sobreexposición. GATED por `opts.subjectTarget` → snapshots (fixtures sin caras) intactos.
- **Culling más preciso**: recorte facial de nitidez/luma subido de 48→96px (`faceEngine`)
  → mejor discriminación de la toma más nítida y mejor medida de luz de la piel.
- Tests: 157 pasan (nuevos en `subjectExposure.test.js`), 41 snapshots intactos.

## Motor v2 (jun 2026): contraluz + ojos en grupos + comparador de ráfaga
- **Contraluz extremo** (`exposureEngine`): con cara oscura en `scene==="backlit"` y subject-target,
  NO se recorta el lift por altas luces/p99 y se recupera el fondo quemado con highlights (−40).
  → caras bien expuestas con sol/ventana detrás. Gated.
- **Ojos/parpadeos en grupos grandes** (`burstDecision.evalPhoto`): tolerancia de 1 parpadeo por
  cada 8 personas (`eyeTolerance = floor(peopleCount/8)`) en `allMainOpen`, warnings CLOSED_EYES/
  PARTIAL_BLINK y faceIssues. Grupos ≤7 = estricto de siempre (tests intactos).
- **Comparador de ráfaga** (`ReviewStep`): pestaña "Por ráfaga" que agrupa por `burstId` (>1 toma),
  muestra las hermanas juntas con chips de nitidez/ojos y permite elegir la definitiva con un clic
  (`chooseExclusive`: selecciona esa y descarta las demás de la secuencia).
- Tests: 160 pasan (3 nuevos), 41 snapshots intactos.

## UI aditiva por herramienta (jun 2026)
- Dashboard: stats + buscador + orden + editar (cliente/fecha). Auto XMP: envío directo a
  Lightroom (getPhotos → /api/lr/push) + resumen de escenas. Estilos: buscador. Aprendizaje:
  consistencia + export .xmp. Motor: "analizar todas". Validación: export CSV. Perfiles:
  buscador + agrupar por fabricante. Verificado por testing agent (0 errores de consola).

## Fase 1a — Proveedores de IA (cerebro) — HECHO (sep 2026)
- Emergent LLM Key como proveedor GRATIS por defecto (visión: gpt-5.4/claude-sonnet-4-6/gemini-3-flash-preview).
- Añadir proveedores de PAGO OpenAI-compatibles (endpoint + key): verifica GET /models, marca modelos por
  tarea (seleccion/ajustes/album), retest, borrar. Solo OWNER.
- Backend: `/api/ai/providers` (GET/POST), `/api/ai/providers/{id}/models` (PUT), `/retest`, DELETE,
  `/api/ai/config` (GET/PUT), y GATEWAY `/api/ai/vision` (enruta a Emergent o al proveedor propio activo).
  Colecciones `ai_providers` + `ai_config`. `require_owner` para gestión.
- Frontend: `AIProviders.jsx` (`/ai-providers`, nav "IA"). Probado: config/list/gateway visión (Emergent
  devuelve texto sobre imagen real). Editor: la IA corrige básicos + preset aporta el resto (arquitectura ya existente).
- PENDIENTE Fase 1b: enchufar Selección IA al gateway. Luego Fase 2 Editor, Fase 3 Álbum AI.

## Fase 1b — Selección IA con visión — HECHO (sep 2026)
- Backend `/api/ai/select-burst`: recibe candidatos [{filename, image_base64}] (miniaturas), la IA de
  visión activa (Emergent por defecto) elige la mejor toma (ojos abiertos, foco en cara, expresión) y
  devuelve {best_filename, index, reason}. Helper `_ai_multi_vision` (multi-imagen, Emergent o custom).
  Probado: descarta subexpuesta/lavada y elige la buena con motivo en español.
- Frontend `rawThumb.thumbBase64(file, maxW)` genera miniatura JPEG base64 ligera (coste bajo).
  `ReviewStep` pestaña "Por ráfaga": botón "Elegir con IA" por ráfaga + "Afinar todas con IA" (con
  progreso). Aplica la elección (source="ai") y muestra el motivo. Requiere RAW reales para test en navegador.
- SIGUIENTE: Fase 2 Editor visual (IA fija básicos + preset el resto), Fase 3 Álbum AI.

## Fase 2 — Editor visual — HECHO (sep 2026)
- `components/studio/PhotoEditor.jsx`: modal con vista previa (preview JPEG incrustado) + sliders de
  básicos (exposición/contraste/luces/sombras/blancos/negros/temp/tinte/claridad/vibrance/saturación),
  vista previa aproximada por filtros CSS + overlay de temperatura/tinte, botón "mantén para ver
  original" (antes/después) y "IA" (reset a lo que fijó la IA).
- Integrado en `AutoBasic`: grid de fotos con botón "Editar"; overrides en `edits{name→básicos}` que
  se aplican en export ZIP y en "Enviar a Lightroom" (`basicFor` usa edición manual si existe).
  La IA fija los básicos; el preset/perfil aporta el resto. Compila OK; flujo visual se prueba con RAW reales.
- SIGUIENTE: Fase 3 Álbum AI (maquetación automática de spreads + export PDF).

## Fase 3 — Álbum AI — HECHO (sep 2026)
- Página `AlbumStudio.jsx` (`/album`, nav "Álbum"). Local-first: elige carpeta → miniaturas rectas
  (EXIF) + aspecto → maquetación automática en páginas dobles (spreads 2:1).
- Motor PURO `src/lib/album/layoutEngine.js` (`planAlbum`, `templateFor`): plantillas por cantidad y
  orientación (solo apaisado a sangre, vertical centrado, duo, trío columnas/hero, quad 2x2), portada
  hero a sangre completa, densidad Aireado/Equilibrado/Denso (alterna nº de fotos por spread), márgenes
  homogéneos (pad X = pad Y / 2 por el ratio 2:1). Slots en coords normalizadas [0..1]. **14 unit tests**
  en `layoutEngine.test.js` (todas pasan). No toca los 41 snapshots del motor fotométrico.
- `src/lib/album/albumImage.js`: `orientedCanvasFromFile` (recto por EXIF), `coverCrop` (recorte center-
  cover), `preparePhotos` (miniatura JPEG ligera + aspecto), `thumbBase64FromFile` (para la IA).
- `src/lib/album/albumPdf.js`: export a PDF con **jsPDF** (páginas dobles 2:1, cover-crop por slot,
  cachea el canvas por foto). `doc.save()`.
- Orden narrativo con IA (opcional): backend `POST /api/ai/album-order` (task `album` del gateway de
  visión, Emergent por defecto). Recibe hasta 24 miniaturas base64, devuelve `ordered_filenames`,
  `highlights`, `reason`. Fallback: preserva el orden original y añade las que la IA omita.
- Verificado: 14 unit tests + curl e2e del endpoint (200) + testing agent frontend 6/6 flujos
  (upload → spreads → densidad → orden IA → export PDF), 0 errores de consola.
- SIGUIENTE sugerido: destacados (highlights) a página completa en la maqueta; reordenar spreads con
  drag & drop; guardar la maqueta del álbum por proyecto/carpeta.

## Fase 4 — EDITOR DE ÁLBUM COMPLETO (port EditFlow Pro) — HECHO (jun 2026)
- El usuario pidió portar EL MISMO editor de álbum profesional de su proyecto EditFlow Pro (Base44),
  no una versión simplificada. Se copió el módulo íntegro a `src/modules/album/` (64 archivos) y se
  sustituyó la versión simple anterior (`src/pages/AlbumStudio.jsx` + `src/lib/album/*` quedan sin uso).
- Ruta `/album` -> `modules/album/pages/AlbumApp` (patrón `?project=ID`): lista de álbumes o editor.
  Envuelto en `AppShell wide` (contenedor ancho). Nav "Álbum".
- Capa de datos LOCAL-FIRST: `src/api/base44Client.js` reimplementa la API de entidades de Base44
  (`base44.entities.X.{list,get,create,update,delete,filter,bulkCreate,bulkUpdate,deleteMany}`) sobre
  **IndexedDB** del navegador. Las previews ya usaban IndexedDB (`previewStore`). Álbumes portables vía
  archivo `.editflowalbum` (⌘+S). `base44.functions.invoke` (album-engine/Selección IA por servidor)
  deshabilitado a propósito: la MAQUETACIÓN es 100% determinista y local (planificador DP en autoPlanner).
- Shim `src/components/ui/use-toast.js` -> sonner. Tokens semánticos shadcn añadidos a `index.css :root`
  (tema oscuro coherente: primary emerald). El módulo de Selección IA por servidor se excluyó (solo se
  conservó `selection/sanitizer.js`, dependencia pura de `visualAi`).
- FUNCIONES verificadas E2E por testing agent (8/8, 0 errores de consola): crear álbum -> editor;
  importar fotos (IndexedDB); biblioteca de 23 plantillas + aplicar plantilla manual; MAQUETACIÓN
  AUTOMÁTICA (multi-selección -> "Maquetar automáticamente" -> config -> previsualización "Asistencia
  IA" -> "Aplicar propuesta" -> lienzos con fotos); "Validar maquetación"; deshacer/rehacer (⌘Z);
  "Exportar" (JPEG/PNG, 150/300/600 DPI, sangrado); autosave + persistencia al recargar.
- Incluye además (del código portado, no re-testeado individualmente pero operativo): smart-fill
  face-aware (cover con caras), zoom/pan/resize de huecos (mano verde/negra), "Rellenar contenedor",
  "Relleno completo del lienzo", regenerar lienzo/no-bloqueados/álbum, "Maquetar desde JPG" (lee XMP),
  re-localización de fotos, navegador de lienzos con reordenado, paneles ocultables/redimensionables.
- NOTA UX (action item menor): tras "Aplicar propuesta" se abre automáticamente el diálogo de
  Validación (comportamiento original "validación final"); es modal y hay que cerrarlo antes de usar la
  barra superior. Se dejó como el original.
- FIXES (jun 2026, reportados por el usuario):
  1. Miniaturas de plantillas invisibles: `TemplatePreview` pintaba los huecos con `bg-foreground/60`
     (blanco en tema oscuro) sobre fondo de álbum blanco. Cambiado a gris fijo `#9ca3af` + borde interior
     → estructura visible en fondos claros y oscuros.
  2. El contenedor recortaba la foto: la maquetación forzaba `applySmartFillToSpread` (COVER) aunque los
     lienzos nacen con `fill_photos:false`. Corregido: `fitOrSmartFillSlot` y todas las vías de creación
     (applyAutoLayoutPlan / regenerateNonLocked / regenerateAll / addSpreadWithAutoLayout) ahora respetan
     `fill_photos` → por defecto FIT (foto completa, sin recorte); COVER solo con "Rellenar contenedor".

## Notas críticas
- Idioma: SIEMPRE responder en español.
- NUNCA reconectar con Base44/localhost.
- Cambios de fotometría deben ir gated para no romper los 41 snapshots.
- DOS entornos: PREVIEW (dev, editable) y PRODUCCIÓN (https://edit.krfoto.com, sin acceso directo;
  usar send_to_deployer para RCA/deploy).
