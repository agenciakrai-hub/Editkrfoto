// Capa de caras (extra, no toca el motor de selección). 100% local y gratis:
// usa @vladmandic/face-api con modelos servidos desde /public/models. Detecta caras sobre
// la miniatura JPEG incrustada del RAW → cuenta personas, marca fotos de grupo / sin personas,
// y afina las ráfagas: si las caras cambian de posición (aunque el cuerpo no), son fotos DISTINTAS.
import * as faceapi from "@vladmandic/face-api";
import { extractThumb } from "@/lib/rawThumb";
import { mapLimit } from "@/lib/imageAnalysis";
import { clusterFaces, eyeAspectRatio, photoFaceScore } from "@/lib/faceLogic";

let modelsPromise = null;
export function loadFaceModels() {
  if (!modelsPromise) {
    const url = (process.env.PUBLIC_URL || "") + "/models";
    modelsPromise = (async () => {
      if (faceapi.tf) {
        try { await faceapi.tf.setBackend("webgl"); } catch { /* usa el backend disponible */ }
        await faceapi.tf.ready();
      }
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
        faceapi.nets.faceExpressionNet.loadFromUri(url),
      ]);
      return true;
    })().catch((e) => {
      modelsPromise = null; // permite reintentar
      throw e;
    });
  }
  return modelsPromise;
}

const DET_OPTS = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 });

function imgFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Detecta caras con landmarks + expresiones + descriptor. Devuelve por cara:
// { cx, cy, w, h, score, descriptor, ear (ojos abiertos), smile (0..1), area }.
export async function detectFacesFromUrl(url) {
  const img = await imgFromUrl(url);
  const W = img.naturalWidth || img.width || 1;
  const H = img.naturalHeight || img.height || 1;
  const res = await faceapi.detectAllFaces(img, DET_OPTS)
    .withFaceLandmarks().withFaceExpressions().withFaceDescriptors();
  return res.map((r) => {
    const pts = r.landmarks.positions;
    const ear = (eyeAspectRatio(pts.slice(36, 42)) + eyeAspectRatio(pts.slice(42, 48))) / 2;
    const smile = r.expressions?.happy ?? 0;
    const box = r.detection.box;
    return {
      cx: (box.x + box.width / 2) / W, cy: (box.y + box.height / 2) / H,
      w: box.width / W, h: box.height / H, score: r.detection.score,
      descriptor: Array.from(r.descriptor), ear, smile, area: (box.width / W) * (box.height / H),
    };
  });
}

// Recorta la cara (box normalizado) de la miniatura del RAW → dataURL 96x96 para el panel de personas.
async function cropFace(file, box) {
  let url = null;
  try {
    url = await extractThumb(file);
    if (!url) return null;
    const img = await imgFromUrl(url);
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const bw = box.w * W, bh = box.h * H;
    const pad = 0.45;
    const sx = Math.max(0, box.cx * W - bw * (1 + pad) / 2);
    const sy = Math.max(0, box.cy * H - bh * (1 + pad) / 2);
    const sw = Math.min(W - sx, bw * (1 + pad));
    const sh = Math.min(H - sy, bh * (1 + pad));
    const c = document.createElement("canvas");
    c.width = 96; c.height = 96;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 96, 96);
    return c.toDataURL("image/jpeg", 0.8);
  } catch { return null; }
  finally { if (url) URL.revokeObjectURL(url); }
}

// ¿Cambió la configuración de caras entre dos tomas? → ver faceLogic.facesChanged

// Ejecuta la capa de caras SOLO sobre ráfagas (>1) y fotos ya seleccionadas por la IA (rápido).
// Muta `photos` (faces, faceCount, isGroup, noPeople, faceDistinct, doubt, facesAnalyzed, people[]).
// Devuelve stats + people (protagonistas agrupados por reconocimiento facial, para filtrar/etiquetar).
export async function applyFaceLayer(photos, onProgress) {
  try { await loadFaceModels(); }
  catch { return { photos, stats: null, people: [], error: true }; }

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
    p.faceScore = photoFaceScore(p.faces); // ojos/sonrisa/tamaño
    p.facesAnalyzed = true;
    done++;
    onProgress && onProgress(done, targets.length);
  });

  // Re-selección CRÍTICA por ráfaga: dentro de una ráfaga las tomas son casi idénticas,
  // así que se elige UNA sola (la mejor: nitidez/exposición + ojos abiertos + sonrisa).
  // Solo se conserva una 2ª (máx 2 extra) si hay EMPATE real (≥97% de la mejor) → "Dudas".
  const groups = {};
  photos.forEach((p) => { (groups[p.burstId] = groups[p.burstId] || []).push(p); });
  let doubts = 0;
  const rankOf = (p) => {
    const base = (p.score || 50) / 100;
    return p.faceScore == null ? base : 0.55 * base + 0.45 * p.faceScore;
  };
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    g.forEach((p) => { p.rank = rankOf(p); p.selectedForEdit = false; p.doubt = false; p.faceDistinct = false; });
    const sorted = [...g].sort((a, b) => b.rank - a.rank);
    const best = sorted[0];
    best.selectedForEdit = true;
    let extras = 0;
    for (let i = 1; i < sorted.length && extras < 2; i++) {
      const p = sorted[i];
      if (p.rank >= best.rank * 0.97) {
        p.selectedForEdit = true; p.doubt = true; best.doubt = true; doubts++; extras++;
      } else break; // el resto puntúa claramente peor → descartadas
    }
    g.forEach((p) => { p.score = Math.round(p.rank * 100); });
  }
  const rescued = 0;

  // Reconocimiento → agrupa personas (protagonistas) por descriptor facial.
  const entries = [];
  for (const p of photos) {
    if (!p.faces) continue;
    p.faces.forEach((f, idx) => {
      if (f.descriptor) entries.push({ key: `${p.id}#${idx}`, descriptor: f.descriptor, photo: p, box: f, area: f.w * f.h });
    });
  }
  const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
  const { assign, clusters } = clusterFaces(entries.map((e) => ({ key: e.key, descriptor: e.descriptor })));

  const photoPeople = {};
  for (const e of entries) {
    const cid = assign[e.key];
    (photoPeople[e.photo.id] = photoPeople[e.photo.id] || new Set()).add(cid);
  }
  photos.forEach((p) => { p.people = Array.from(photoPeople[p.id] || []); });

  const meta = clusters.map((c, i) => {
    const photoSet = new Set();
    let rep = null;
    for (const key of c.members) {
      const e = byKey[key];
      if (!e) continue;
      photoSet.add(e.photo.id);
      if (!rep || e.area > rep.area) rep = e;
    }
    return { id: i, count: photoSet.size, faces: c.members.length, rep };
  }).filter((m) => m.rep).sort((a, b) => b.count - a.count);

  const top = meta.slice(0, 12);
  for (const m of top) m.thumb = await cropFace(m.rep.photo.file, m.rep.box);
  const people = top.map((m) => ({ id: m.id, count: m.count, faces: m.faces, thumb: m.thumb }));

  const analyzed = photos.filter((p) => p.facesAnalyzed);
  const stats = {
    analyzed: analyzed.length,
    withPeople: analyzed.filter((p) => p.faceCount > 0).length,
    groupPhotos: analyzed.filter((p) => p.isGroup).length,
    noPeople: analyzed.filter((p) => p.noPeople).length,
    people: people.length,
    rescued,
    doubts,
  };
  return { photos, stats, people, error: false };
}
