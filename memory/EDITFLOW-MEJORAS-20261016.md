# Mejoras selectivas de EditFlow · 16 octubre 2026

Base: 4156995, Emergent Edit Weding, editflow.krfoto.com. Copia original en rollback-editflow-20261016 (solo local, excluida de Git).

Selección remota de la pantalla Revisión/Por ráfaga: comparación de todas las candidatas por torneo <=8, una ganadora final, validación JSON estricta sin elegir primera por defecto, previews >10px, aliases cortos sin nombres, guardado por ráfaga con identidad ruta/tamaño/fecha y versión burst-winner-v2. Continuar pendientes omite grupos completos y decisiones manuales. Pausa cancela peticiones pendientes, mantiene resultados y evita doble ejecución entre pestañas mediante Web Locks.

Guardado de Studio en cola para impedir sobrescritura fuera de orden. No cuenta éxito hasta guardar. Un fallo detiene el lote pendiente. HTTP429 y503/502/500 tienen recuperación visible y acotada; 401/402/403 y timeout504 no se reintentan automáticamente. Sin cambio automático de proveedor.

Modelos: selección explícita por herramienta, validación contra catálogo/asignaciones, todos los modelos buscables (antes solo40). Configuración y claves existentes conservadas. Transporte custom ejecuta I/O fuera del event loop y conserva códigos HTTP/Retry-After. Adaptación NVIDIA DiffusionGemma de schema y enable_thinking=false limitada a ese endpoint/modelo.

Edición: se conservan motor local fotométrico, estilos/presets, originales, XMP, streaming a disco y envío Lightroom. Se bloquea la transición a edición si falta fotometría válida en una imagen; no se inventan ajustes. Se diferencia propuesta local de comparación remota en la UI.

No implica validación visual de un reportaje real, ni acceso gratuito garantizado a proveedores. No migrar claves desde Base44, ni tocar EditKR Foto o KRAI Connect. No habilitar Stripe ni cambiar acceso privado. La selección IA de álbum multietapa es otro flujo y no se presenta como migrado.
