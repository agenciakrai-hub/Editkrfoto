// Capa de caras (extra, no toca el motor de selección). 100% local y gratis:
// usa @vladmandic/face-api con modelos servidos desde /public/models. Detecta caras sobre
// la miniatura JPEG incrustada del RAW → cuenta personas, marca fotos de grupo / sin personas,
// y afina las ráfagas: si las caras cambian de posición (aunque el cuerpo no), son fotos DISTINTAS.
import * as faceapi from "@vladmandic/face-api";
import { extractThumb } from "@/lib/rawThumb";
import { mapLimit } from "@/lib/imageAnalysis";
import { facesChanged } from "@/lib/faceLogic";

let modelsPromise = null;
export function loadFaceModels() {
  if (!modelsPromise) {
    const url = (process.env.PUBLIC_URL || "") + "/models";
    modelsPromise = (async () => {
      if (faceapi.tf) {
        try { await faceapi.tf.setBackend("webgl"); } catch { /* usa el backend disponible */ }
        await faceapi.tf.ready();
      }
      await faceapi.nets.tinyFaceDetector.loadFromUri(url);
      return true;
    })().catch((e) => {
      modelsPromise = null; // permite reintentar
      throw e;
    });
  }
  return modelsPromise;
}

const DET_OPTS = new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.35 });

function imgFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Devuelve caras normalizadas: [{ cx, cy, w, h, score }] (0..1 respecto al encuadre).
export async function detectFacesFromUrl(url) {
  const img = await imgFromUrl(url);
  const dets = await faceapi.detectAllFaces(img, DET_OPTS);
  const W = img.naturalWidth || img.width || 1;
  const H = img.naturalHeight || img.height || 1;
  return dets.map((d) => ({
    cx: (d.box.x + d.box.width / 2) / W,
    cy: (d.box.y + d.box.height / 2) / H,
    w: d.box.width / W,
    h: d.box.height / H,
    score: d.score,
  }));
}

// ¿Cambió la configuración de caras entre dos tomas? → ver faceLogic.facesChanged

// Ejecuta la capa de caras SOLO sobre ráfagas (>1) y fotos ya seleccionadas por la IA (rápido).
// Muta `photos` añadiendo: faces, faceCount, isGroup, noPeople, faceDistinct, doubt, facesAnalyzed.
export async function applyFaceLayer(photos, onProgress) {
  try { await loadFaceModels(); }
  catch { return { photos, stats: null, error: true }; }

  const burstSize = {};
  photos.forEach((p) => { burstSize[p.burstId] = (burstSize[p.burstId] || 0) + 1; });
  const targets = photos.filter((p) => burstSize[p.burstId] > 1 || p.selectedForEdit);

  let done = 0;
  await mapLimit(targets, 2, async (p) => {
    let url = null;
    try {
      url = await extractThumb(p.file);
      p.faces = url ? await detectFacesFromUrl(url) : [];
    } catch { p.faces = []; }
    finally { if (url) URL.revokeObjectURL(url); }
    p.faceCount = p.faces.length;
    p.isGroup = p.faceCount >= 3;
    p.noPeople = p.faceCount === 0;
    p.facesAnalyzed = true;
    done++;
    onProgress && onProgress(done, targets.length);
  });

  // Afinado de ráfagas + notas de "Dudas"
  const groups = {};
  photos.forEach((p) => { (groups[p.burstId] = groups[p.burstId] || []).push(p); });
  let rescued = 0, doubts = 0;
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    const best = g.reduce((a, b) => (b.score > a.score ? b : a));
    // Rescata como foto DISTINTA cualquier hermana cuya configuración de caras cambió.
    for (const p of g) {
      if (p === best || !p.facesAnalyzed) continue;
      if (facesChanged(best.faces, p.faces)) {
        if (!p.selectedForEdit) { p.selectedForEdit = true; rescued++; }
        p.faceDistinct = true;
      }
    }
    // Duda: varias tomas seleccionadas con la MISMA configuración de caras y sin ganadora clara.
    const sameLayoutSelected = g.filter((p) => p.selectedForEdit && p.facesAnalyzed && !p.faceDistinct);
    if (sameLayoutSelected.length > 1) {
      sameLayoutSelected.forEach((p) => { p.doubt = true; });
      doubts += sameLayoutSelected.length;
    }
  }

  const analyzed = photos.filter((p) => p.facesAnalyzed);
  const stats = {
    analyzed: analyzed.length,
    withPeople: analyzed.filter((p) => p.faceCount > 0).length,
    groupPhotos: analyzed.filter((p) => p.isGroup).length,
    noPeople: analyzed.filter((p) => p.noPeople).length,
    rescued,
    doubts,
  };
  return { photos, stats, error: false };
}
