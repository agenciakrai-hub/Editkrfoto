
## 2026-06 — Fix producción: XMP/Lightroom con catálogos grandes + editor Álbum
- Álbum: modo "Relleno" (object-fit: cover) ahora reencuadra arrastrando vía object-position (focus_x/focus_y). Antes el offset se recortaba a 0 al 100% → no se podía mover. Archivos: SlotFrame.jsx, AlbumEditorPage.jsx (onFocus), PropertiesPanel.jsx.
- Backend memoria: generate-xmp y cloud-job/download escriben el ZIP a disco (tempfile) entrada a entrada; xmp_entries ahora es generador; lr-push hace bulk_write por lotes de 500. Resuelve OOM del pod (tier_0 512Mi) con bodas reales + preset por foto. Verificado: 5000 fotos y 3000 con preset → 200 ZIP válido, sin temporales huérfanos.
- Frontend: ReportStep.jsx y LightroomPlugin.jsx muestran el código/detalle HTTP real en los errores (antes toast genérico).
- Auth producción (RCA deployer): login rebotaba en ai-xmp-gen.emergent.host por CORS_ORIGINS=* (desactiva allow_credentials) siendo cross-origin con la API en editflow.krfoto.com. Solución: usar editflow.krfoto.com (mismo origen) o fijar CORS_ORIGINS explícito. Sin cambios de código.
