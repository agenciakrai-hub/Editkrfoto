// Lógica pura de agrupado y selección (sin dependencias de navegador → testeable).
export function hamming(a, b) {
  let x = a ^ b, c = 0;
  while (x) { c += Number(x & 1n); x >>= 1n; }
  return c;
}

export const PHASH_THRESHOLD = 8;    // distancia máx. para "misma secuencia"
export const AMBIGUOUS_MARGIN = 0.92; // 2ª mejor ≥92% de la mejor → también se elige

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// Auto-tono PRECISO por foto a partir del histograma de luminancia (0..255).
// Basado en percentiles reales: fija punto de negros/blancos sin recortar, lleva el tono
// medio al objetivo y recupera altas luces/sombras según el recorte medido. Devuelve los
// valores de los sliders básicos de Camera Raw para ESTA foto.
export function autoToneFromHistogram(hist, total) {
  if (!hist || !total) return { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 };
  const cdf = new Array(256);
  let acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; cdf[i] = acc; }
  const perc = (p) => { const t = p * total; for (let i = 0; i < 256; i++) if (cdf[i] >= t) return i; return 255; };

  const lo = perc(0.005), hi = perc(0.995), med = perc(0.5);
  const TARGET_MID = 115, TARGET_WHITE = 246, TARGET_BLACK = 10;

  // Exposición: lleva la mediana al tono medio objetivo (en EV).
  let exposure = clamp(Math.log2(TARGET_MID / Math.max(4, med)), -1.5, 1.5);
  const f = Math.pow(2, exposure);
  const hiE = Math.min(255, hi * f);   // extremos estimados tras la exposición
  const loE = lo * f;

  // Blancos/negros: estira el rango hasta casi tocar los extremos sin recortar.
  const whites = clamp(Math.round((TARGET_WHITE - hiE) / 1.5), -60, 60);
  const blacks = clamp(Math.round((TARGET_BLACK - loE) / 1.5), -60, 40);

  // Recuperación: comprime altas luces si hay recorte alto; abre sombras si están empastadas.
  const highClip = hist[255] / total, lowClip = hist[0] / total;
  const highlights = clamp(Math.round(-highClip * 500 - Math.max(0, hiE - 248) * 3), -100, 0);
  const shadows = clamp(Math.round(lowClip * 500 + Math.max(0, 8 - loE) * 3 + 8), 0, 100);

  return { exposure: Math.round(exposure * 100) / 100, contrast: 0, highlights, shadows, whites, blacks };
}

import { WARNING } from "@/lib/burstDecision";

export const MAX_GAP_MS = 2500;  // > 2,5 s entre disparos consecutivos → otra toma
export const PHASH_STRICT = 5;   // sin hora de captura: solo une si el parecido es muy alto

const natural = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true });
function folderOf(p) { const s = String(p || "").replace(/\\/g, "/"); const i = s.lastIndexOf("/"); return i < 0 ? "" : s.slice(0, i); }
const timeOf = (it) => (Number.isFinite(it.meta?.captureTime) ? it.meta.captureTime : null);

// Orden de captura: carpeta → cámara → (con hora primero) hora → nombre.
function captureOrder(a, b) {
  return natural(folderOf(a.relativePath), folderOf(b.relativePath))
    || natural(a.meta?.camera || "", b.meta?.camera || "")
    || (timeOf(a) == null) - (timeOf(b) == null)
    || (timeOf(a) != null && timeOf(b) != null ? timeOf(a) - timeOf(b) : 0)
    || natural(a.name, b.name);
}

// ¿Es `cur` la toma siguiente de la misma ráfaga que `prev`? → { same, timed }
export function linkShots(prev, cur) {
  if (!prev) return { same: false };
  if (folderOf(prev.relativePath) !== folderOf(cur.relativePath)) return { same: false };
  if ((prev.meta?.camera || "") !== (cur.meta?.camera || "")) return { same: false };
  const hp = prev.metrics?.hash, hc = cur.metrics?.hash;
  if (hp == null || hc == null) return { same: false }; // sin hash → reinicia la cadena
  const tp = timeOf(prev), tc = timeOf(cur);
  const timed = tp != null && tc != null;
  if (timed && Math.abs(tc - tp) > MAX_GAP_MS) return { same: false };
  return { same: hamming(hp, hc) <= (timed ? PHASH_THRESHOLD : PHASH_STRICT), timed };
}

// items: [{ name, relativePath?, meta?:{captureTime,camera}, metrics:{sharpness,exposure,hash}|null }]
// Agrupa por orden de captura/cámara/carpeta (hash visual como señal auxiliar, solo entre tomas
// CONTIGUAS) y marca la mejor de cada secuencia. Sin hora de captura → grupos conservadores
// marcados `groupUncertain` para revisión.
export function groupAndSelect(items) {
  const sorted = [...items].sort(captureOrder);

  let burstId = 0;
  let prev = null;
  sorted.forEach((it, i) => {
    const link = linkShots(prev, it);
    if (!link.same) burstId += 1;
    else if (!link.timed) { it.groupUncertain = true; prev.groupUncertain = true; }
    it.burstId = burstId;
    it.seq = i;
    prev = it;
  });

  const groups = new Map();
  for (const it of sorted) {
    if (!groups.has(it.burstId)) groups.set(it.burstId, []);
    groups.get(it.burstId).push(it);
  }

  for (const group of groups.values()) {
    const withM = group.filter((it) => it.metrics);
    const maxSharp = withM.reduce((m, it) => Math.max(m, it.metrics.sharpness), 0) || 1;
    for (const it of group) {
      if (it.metrics) {
        const normS = it.metrics.sharpness / maxSharp;
        it.combined = 0.72 * normS + 0.28 * it.metrics.exposure;
      } else {
        it.combined = 0.5;
      }
    }
    const best = group.reduce((a, b) => (b.combined > a.combined ? b : a));
    for (const it of group) {
      it.isBest = it === best;
      it.selectedForEdit = group.length === 1 || !it.metrics || it.combined >= best.combined * AMBIGUOUS_MARGIN;
      it.score = Math.round(it.combined * 100);
    }
  }

  return sorted;
}

export const REVIEW_NOTES = {
  [WARNING.GROUPING_UNCERTAIN]: "Agrupada solo por parecido visual (sin hora de captura en el archivo). Comprueba que es la misma toma y añade o quita fotos manualmente.",
  [WARNING.FACES_UNAVAILABLE]: "Las caras no se analizaron en esta foto. Revisa ojos y expresión manualmente antes de editar.",
};

// Añade advertencias accionables a las seleccionadas (agrupación dudosa / caras sin analizar).
// faceLayer: { available:boolean, reason?:string }. Muta y devuelve `photos`.
export function applyReviewFlags(photos, faceLayer = { available: true }) {
  const size = {};
  photos.forEach((p) => { size[p.burstId] = (size[p.burstId] || 0) + 1; });
  for (const p of photos) {
    const types = [];
    if (p.groupUncertain) types.push(WARNING.GROUPING_UNCERTAIN);
    const needsFaces = size[p.burstId] > 1 || p.selectedForEdit;
    if (needsFaces && (!faceLayer.available || p.faceError)) types.push(WARNING.FACES_UNAVAILABLE);
    if (!types.length) continue;
    p.warningTypes = Array.from(new Set([...(p.warningTypes || []), ...types]));
    const notes = types.map((t) => REVIEW_NOTES[t]);
    if (types.includes(WARNING.FACES_UNAVAILABLE) && !faceLayer.available && faceLayer.reason) {
      notes[types.indexOf(WARNING.FACES_UNAVAILABLE)] = `Análisis facial no disponible (${faceLayer.reason}). Revisa ojos y expresión manualmente; recarga la página para reintentar.`;
    }
    p.reviewNotes = Array.from(new Set([...(p.reviewNotes || []), ...notes]));
    if (p.selectedForEdit) { p.warning = true; p.doubt = true; }
  }
  return photos;
}
