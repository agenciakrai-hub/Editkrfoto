// Capa de caras (extra, no toca el motor de selección). 100% local y gratis:
// usa @vladmandic/face-api con modelos servidos desde /public/models. Detecta caras sobre
// la miniatura JPEG incrustada del RAW → cuenta personas, marca fotos de grupo / sin personas,
// y afina las ráfagas: si las caras cambian de posición (aunque el cuerpo no), son fotos DISTINTAS.
import * as faceapi from "@vladmandic/face-api";
import { extractThumb } from "@/lib/rawThumb";
import { mapLimit } from "@/lib/imageAnalysis";
import { clusterFaces, eyeAspectRatio, photoFaceScore } from "@/lib/faceLogic";
import { decideSequence, splitByMainFace } from "@/lib/burstDecision";

let modelsPromise = null;
export function loadFaceModels() {
  if (!modelsPromise) {
    const url = (process.env.PUBLIC_URL || "") + "/models";
    modelsPromise = (async () => {
      if (faceapi.tf) {
        try { await faceapi.tf.setBackend("webgl"); }
        catch (err) { if (process.env.NODE_ENV === "development") console.debug("WebGL no disponible, backend por defecto:", err?.message); }
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

// Resolución de detección ALTA: los ojos/parpadeo necesitan landmarks precisos.
// 320 hacía que caras pequeñas quedaran borrosas → falsos "ojos cerrados".
const DET_OPTS = new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 });

function imgFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Nitidez facial real: varianza del laplaciano sobre el recorte de la cara (0..1).
function measureFaceSharpness(img, box) {
  try {
    const S = 48;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, Math.max(0, box.x), Math.max(0, box.y), Math.max(1, box.width), Math.max(1, box.height), 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
    const g = new Float32Array(S * S);
    let lumaSum = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) { g[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; lumaSum += g[p]; }
    let mean = 0, n = 0;
    const lap = new Float32Array((S - 2) * (S - 2));
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      const idx = y * S + x;
      const l = 4 * g[idx] - g[idx - 1] - g[idx + 1] - g[idx - S] - g[idx + S];
      lap[n] = l; mean += l; n++;
    }
    mean /= (n || 1);
    let varr = 0;
    for (let k = 0; k < n; k++) { const v = lap[k] - mean; varr += v * v; }
    const raw = n ? varr / n : 0;
    return { sharpness: raw / (raw + 150), luma: lumaSum / (S * S) }; // sharpness 0..1 ; luma 0..255
  } catch { return { sharpness: 0.5, luma: 128 }; }
}

// Ángulo/pose de la cara desde landmarks: roll (inclinación, grados) y yaw (giro, ratio).
function computePose(pts) {
  const mean = (idx) => {
    let x = 0, y = 0;
    for (const i of idx) { x += pts[i].x; y += pts[i].y; }
    return { x: x / idx.length, y: y / idx.length };
  };
  const le = mean([36, 37, 38, 39, 40, 41]);
  const re = mean([42, 43, 44, 45, 46, 47]);
  const roll = Math.atan2(re.y - le.y, re.x - le.x) * 180 / Math.PI;
  const eyesMid = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 };
  const interEye = Math.hypot(re.x - le.x, re.y - le.y) || 1;
  const nose = pts[30] || eyesMid;
  const yaw = (nose.x - eyesMid.x) / interEye; // >0 girada a un lado
  return { roll, yaw };
}

// Detecta caras con landmarks + expresiones + descriptor. Devuelve por cara:
// { cx, cy, w, h, score, descriptor, ear, smile, area, faceSharpness, pose }.
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
    const crop = measureFaceSharpness(img, box);
    return {
      cx: (box.x + box.width / 2) / W, cy: (box.y + box.height / 2) / H,
      w: box.width / W, h: box.height / H, score: r.detection.score,
      descriptor: Array.from(r.descriptor), ear, smile, area: (box.width / W) * (box.height / H),
      faceSharpness: crop.sharpness, luma: crop.luma, pose: computePose(pts),
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

  // DECISOR ÚNICO por secuencia (burstDecision): comparación ESTRICTA por etapas
  // (técnica → sujetos/posiciones → ojos → comparación → decisión). Garantiza ≥1
  // seleccionada por secuencia y añade warnings + auditoría por foto. applyFaceLayer
  // ya NO impone selección propia: solo detecta caras y delega en el decisor.
  const groups = {};
  photos.forEach((p) => { (groups[p.burstId] = groups[p.burstId] || []).push(p); });
  const buildInput = (p) => ({
    id: p.id, name: p.name,
    technicalScore: (p.score ?? 50) / 100,
    photometrics: p.photometrics || null,
    faces: (p.faces || []).map((f) => ({
      cx: f.cx, cy: f.cy, area: f.area, ear: f.ear, smile: f.smile,
      w: f.w, h: f.h, detScore: f.score, faceSharpness: f.faceSharpness,
    })),
  });
  let doubts = 0;
  let nextBurstId = 1;
  for (const g of Object.values(groups)) {
    // Orden temporal (los frames de una ráfaga son secuenciales por nombre de archivo).
    const ordered = [...g].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
    // Agrupación ESTRICTA: divide la ráfaga si la cara PRINCIPAL cambia de posición o ángulo.
    const subgroups = splitByMainFace(ordered);
    for (const sub of subgroups) {
      const bid = nextBurstId++;
      sub.forEach((p) => { p.burstId = bid; }); // re-numera secuencias tras la división
      const byId = Object.fromEntries(sub.map((p) => [p.id, p]));
      const res = decideSequence(sub.map(buildInput), bid);
      for (const rp of res.photos) {
        const p = byId[rp.id];
        if (!p) continue;
        p.selectedForEdit = rp.selected;
        p.warning = rp.warning;
        p.doubt = rp.warning;               // compat: "duda" = necesita revisión humana
        p.warningTypes = rp.warningTypes;
        p.state = rp.state;                 // SELECTED | SELECTED_WARNING | NOT_SELECTED
        p.reason = rp.reason;
        p.subjects = rp.subjects;
        p.selectionConfidence = rp.selectionConfidence;
        p.score = rp.score;
        p.audit = {
          technicalScore: rp.technicalScore, faceScore: rp.faceScore, eyesScore: rp.eyesScore,
          expressionScore: rp.expressionScore, sharpnessScore: rp.sharpnessScore,
          exposureScore: rp.exposureScore, selectionConfidence: rp.selectionConfidence,
        };
        if (rp.warning) doubts++;
      }
    }
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
