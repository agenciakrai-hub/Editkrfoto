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
