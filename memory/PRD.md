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

## Notas críticas
- Idioma: SIEMPRE responder en español.
- NUNCA reconectar con Base44/localhost.
- Cambios de fotometría deben ir gated para no romper los 41 snapshots.
- DOS entornos: PREVIEW (dev, editable) y PRODUCCIÓN (https://edit.krfoto.com, sin acceso directo;
  usar send_to_deployer para RCA/deploy).
