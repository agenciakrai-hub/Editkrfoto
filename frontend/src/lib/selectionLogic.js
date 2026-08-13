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

// items: [{ name, size, file, metrics:{sharpness,exposure,hash}|null }]
// Agrupa por similitud visual (pHash) y marca la mejor toma de cada secuencia (o varias si hay empate).
export function groupAndSelect(items) {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  let burstId = 0;
  let prevHash = null;
  for (const it of sorted) {
    const h = it.metrics ? it.metrics.hash : null;
    const same = h != null && prevHash != null && hamming(prevHash, h) <= PHASH_THRESHOLD;
    if (!same) burstId += 1;
    it.burstId = burstId;
    if (h != null) prevHash = h;
  }

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
