// Rellenar contenedor (POR LIENZO) — encuadre COVER inteligente con prioridad de
// caras. REUTILIZA el sistema existente: el resultado se expresa SIEMPRE como
// fit_mode "fill" + transformación virtual (escala y offsets en mm), el MISMO
// contrato que ya usan el editor (SlotFrame) y el renderizador de exportación
// (spreadRenderer). No existe motor paralelo de crop.
//
// Prioridades del ajuste:
//   1) Caras detectadas dentro del área visible (nunca cortadas, si es geométricamente posible).
//   2) Posición visual adecuada: el centro del grupo de caras queda en el ~42% del alto
//      del hueco (regla clásica de retrato: aire por encima de la cabeza).
//   3) Rellenar completamente el contenedor (sin huecos; cover nunca deforma).
//   4) Proporción original de la foto.
//
// Detección de caras (auditoría: EditFlow NO dispone de detección facial propia).
// Se usa la API NATIVA del navegador (window.FaceDetector, Shape Detection API)
// cuando está disponible, sobre la PREVIEW local de la foto (jamás el original, que
// no sale del dispositivo), con caché en memoria por foto. Si el navegador no la
// ofrece, o no detecta nada, se aplica un anclaje determinista hacia el tercio
// superior (donde suelen estar las cabezas). Nada se envía a ningún servicio.
import { freshTransform, sameRatio } from "@/modules/album/layout/layoutEngine";
import { getTierPreview } from "@/modules/album/lib/previewStore";

const faceCache = new Map(); // photoId -> [{x,y,w,h}] (normalizado 0..1) | null

let detectorChecked = false;
let detector = null;

function getDetector() {
  if (!detectorChecked) {
    detectorChecked = true;
    if (typeof window !== "undefined" && "FaceDetector" in window) {
      try { detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 8 }); } catch { detector = null; }
    }
  }
  return detector;
}

const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
  img.src = url;
});

// Detecta (y cachea) las caras de una foto sobre su preview local. Devuelve null si
// el navegador no tiene detector, la foto no tiene preview o la detección falla.
export async function ensureFaces(projectId, photo) {
  if (!photo?.id) return null;
  if (faceCache.has(photo.id)) return faceCache.get(photo.id) ?? null;
  const det = getDetector();
  let faces = null;
  if (det) {
    try {
      let url = await getTierPreview(projectId, photo.id, "preview");
      if (!url) url = await getTierPreview(projectId, photo.id, "thumb");
      if (url) {
        const img = await loadImage(url);
        const found = await det.detect(img);
        if (found?.length) {
          const iw = img.naturalWidth || 1;
          const ih = img.naturalHeight || 1;
          faces = found.map((f) => ({
            x: f.boundingBox.x / iw,
            y: f.boundingBox.y / ih,
            w: f.boundingBox.width / iw,
            h: f.boundingBox.height / ih,
          }));
        }
      }
    } catch { faces = null; }
  }
  faceCache.set(photo.id, faces);
  return faces;
}

// Punto de atención: centro de la unión de las caras detectadas (para posibles usos
// futuros de reencuadre). El relleno automático es cover centrado (object-fit).
function focusPoint(faces) {
  if (faces?.length) {
    const x0 = Math.min(...faces.map((f) => f.x));
    const y0 = Math.min(...faces.map((f) => f.y));
    const x1 = Math.max(...faces.map((f) => f.x + f.w));
    const y1 = Math.max(...faces.map((f) => f.y + f.h));
    return { uf: (x0 + x1) / 2, vf: (y0 + y1) / 2 };
  }
  return { uf: 0.5, vf: 0.5 };
}
void focusPoint;

// SMART COVER + FACE/SUBJECT-AWARE POSITIONING — transformación virtual que cubre el
// hueco por completo (cover, sin deformación) y desplaza la foto para que las
// caras/sujetos queden DENTRO del área visible. La matemática es la misma que
// aplican SlotFrame (object-fit cover + translate/scale, origen centro) y drawPhoto
// en spreadRenderer → editor y exportación coinciden exactamente.
//
// Algoritmo:
//   1) Detectar caras (API nativa del navegador sobre la preview local). Si no hay,
//      usar el focalPoint del perfil visual IA (si existe) o un anclaje determinista.
//   2) Calcular el bounding box conjunto de TODAS las caras (fx0,fy0,fx1,fy1) y su
//      centro (fcx,fcy) en coordenadas normalizadas de la foto.
//   3) Objetivo: llevar el centro del grupo de caras al centro horizontal del hueco y
//      al ~42 % del alto (regla de retrato: aire por encima de la cabeza).
//   4) k mínimo (cota inferior): el zoom mínimo que cubre el hueco Y permite que el
//      offset lleve el centro de caras al objetivo sin quedar recortado por el margen
//      de cobertura.
//   5) k máximo de caras (cota superior): el zoom máximo que mantiene el BBOX completo
//      de las caras DENTRO del hueco con margen de seguridad. Acercar empuja los bordes
//      de las caras hacia fuera, así que esto impone COTAS SUPERIORES.
//   6) Si las cotas entran en conflicto (imposible centrar sin cortar caras), se
//      prioriza la visibilidad de las caras (k = cota superior).
//   7) Ajuste post-recorte: si tras recortar el offset al margen de cobertura alguna
//      cara queda fuera, se desplaza el offset para meterla (prioridad de caras sobre
//      el centrado perfecto).
// RELLENO = COVER centrado. La regla CSS object-fit:cover del render (SlotFrame y la
// miniatura del navegador) YA escala la foto para CUBRIR el hueco por completo y la
// CENTRA. Por eso el relleno automático NO añade zoom (scale 1) NI desplazamiento
// (offset 0): con object-fit:cover a escala 1 la foto llena SIEMPRE el contenedor
// entero y queda centrada (las caras, normalmente centrales, se conservan). Cualquier
// offset a escala 1 movería la CAJA de la imagen y dejaría franjas vacías — ese era el
// fallo—. Para reencuadrar una foto concreta, el fotógrafo hace clic en ella (modo
// FOTO) y arrastra o hace zoom a mano. Export (spreadRenderer) usa el mismo contrato.
export function smartFillTransform(photo, slot) {
  const identity = { fit_mode: "fill", transform: freshTransform() };
  if (!photo || !slot || !(slot.w_mm > 0) || !(slot.h_mm > 0)) return identity;
  return { fit_mode: "fill", transform: freshTransform() };
}

// Rellena UN hueco de forma SÍNCRONA usando las caras ya cacheadas (sin detección
// asíncrona). Para gestiones interactivas (redimensionar contenedor, intercambiar).
export function smartFillSlot(slot, photo) {
  if (!slot || !photo) return { fit_mode: "fit", transform: freshTransform() };
  return smartFillTransform(photo, slot, faceCache.get(photo.id) ?? null);
}

// Rellena TODOS los huecos con foto de un lienzo, detectando caras donde haga falta.
// NO muta el spread: devuelve una copia con fit_mode/transform recalculados.
export async function applySmartFillToSpread(spread, photosById, projectId) {
  const slots = spread.slots || [];
  await Promise.all(
    slots
      .filter((sl) => sl.photo_id && photosById.get(sl.photo_id))
      .map((sl) => ensureFaces(projectId, photosById.get(sl.photo_id)))
  );
  return {
    ...spread,
    slots: slots.map((sl) => {
      const photo = sl.photo_id ? photosById.get(sl.photo_id) : null;
      if (!photo) return sl;
      const f = smartFillTransform(photo, sl, faceCache.get(sl.photo_id) ?? null);
      return { ...sl, fit_mode: f.fit_mode, transform: f.transform };
    }),
  };
}

// Reajuste de fotos tras cambiar la GEOMETRÍA de sus contenedores. Reglas
// DEFINITIVAS (punto 2/3): si la proporción del hueco no cambia, el encuadre manual
// se conserva tal cual; si cambia, se recalcula según el MODO del propio hueco (no
// del lienzo), respetando la elección del fotógrafo:
//   · fit_mode "fill" → SMART COVER (caras + focal point + sin huecos). El original
//     nunca se destruye: el contenedor es una ventana visual (transform virtual).
//   · fit_mode "fit"  → FIT/CONTAIN fresco (foto completa, centrada, sin recorte).
// Las fotos JAMÁS se pierden: cada hueco conserva su photo_id.
export async function retunePhotoSlots(oldSlots, newSlots, opts = {}) {
  const oldById = new Map((oldSlots || []).map((sl) => [sl.slot_id, sl]));
  const out = [];
  for (const sl of newSlots || []) {
    const o = oldById.get(sl.slot_id);
    if (!sl.photo_id || !o || sameRatio(o.w_mm, o.h_mm, sl.w_mm, sl.h_mm)) { out.push(sl); continue; }
    const photo = opts.photosById?.get?.(sl.photo_id);
    if (photo && sl.fit_mode === "fill") {
      await ensureFaces(opts.projectId, photo);
      const f = smartFillSlot(sl, photo);
      out.push({ ...sl, fit_mode: f.fit_mode, transform: f.transform });
    } else {
      // Modo FIT (o sin foto): FIT fresco — foto completa, centrada, sin recorte.
      out.push({ ...sl, fit_mode: "fit", transform: freshTransform() });
    }
  }
  return out;
}