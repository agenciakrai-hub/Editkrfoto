// Lógica pura de la capa de caras (sin dependencias del navegador ni de face-api → testeable).
export const MOVE_THRESHOLD = 0.06; // 6% del encuadre → la cara se movió de forma notable

// ¿Cambió la configuración de caras entre dos tomas? (nº distinto o alguna cara movida).
export function facesChanged(a, b) {
  const fa = a || [], fb = b || [];
  if (fa.length !== fb.length) return true;
  if (fa.length === 0) return false;
  const used = new Array(fb.length).fill(false);
  for (const f of fa) {
    let best = -1, bd = Infinity;
    fb.forEach((g, i) => {
      if (used[i]) return;
      const dd = Math.hypot(f.cx - g.cx, f.cy - g.cy);
      if (dd < bd) { bd = dd; best = i; }
    });
    if (best < 0 || bd > MOVE_THRESHOLD) return true;
    used[best] = true;
  }
  return false;
}

// Eye Aspect Ratio (ojos abiertos vs cerrados). eye: 6 puntos [p1..p6] del landmark 68.
export function eyeAspectRatio(eye) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const C = d(eye[0], eye[3]);
  return C ? (d(eye[1], eye[5]) + d(eye[2], eye[4])) / (2 * C) : 0;
}
export const EYE_OPEN_EAR = 0.20;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// Puntuación de cara de una foto [0,1]: prioriza OJOS abiertos (peor caso del grupo),
// SONRISA media y TAMAÑO del sujeto. faces: [{ ear, smile, area }]. Sin caras → null.
export function photoFaceScore(faces) {
  if (!faces || !faces.length) return null;
  const minEar = Math.min(...faces.map((f) => f.ear ?? 0));
  const meanSmile = faces.reduce((s, f) => s + (f.smile ?? 0), 0) / faces.length;
  const maxArea = Math.max(...faces.map((f) => f.area ?? 0));
  const eyesScore = clamp01((minEar - 0.15) / 0.13); // <0.15 cerrados → 0 ; >0.28 → 1
  const sizeScore = clamp01(maxArea * 6);
  return 0.55 * eyesScore + 0.30 * meanSmile + 0.15 * sizeScore;
}

// Distancia euclídea entre descriptores faciales de 128 dimensiones.
export function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

export const FACE_MATCH_THRESHOLD = 0.55; // < ~0.6 = misma persona (face-api)

// Agrupa caras por persona (clustering voraz por centroide). entries: [{ key, descriptor:number[] }].
// Devuelve { assign: {key->clusterId}, clusters: [{ centroid, n, members:[key] }] }.
export function clusterFaces(entries, threshold = FACE_MATCH_THRESHOLD) {
  const clusters = [];
  const assign = {};
  for (const e of entries) {
    if (!e.descriptor || !e.descriptor.length) continue;
    let bi = -1, bd = Infinity;
    clusters.forEach((c, i) => { const d = euclidean(e.descriptor, c.centroid); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0 && bd < threshold) {
      const c = clusters[bi];
      for (let k = 0; k < c.centroid.length; k++) c.centroid[k] = (c.centroid[k] * c.n + e.descriptor[k]) / (c.n + 1);
      c.n++; c.members.push(e.key); assign[e.key] = bi;
    } else {
      clusters.push({ centroid: e.descriptor.slice(), n: 1, members: [e.key] });
      assign[e.key] = clusters.length - 1;
    }
  }
  return { assign, clusters };
}
