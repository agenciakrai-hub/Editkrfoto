// Lógica pura de agrupado y selección (sin dependencias de navegador → testeable).
export function hamming(a, b) {
  let x = a ^ b, c = 0;
  while (x) { c += Number(x & 1n); x >>= 1n; }
  return c;
}

export const PHASH_THRESHOLD = 8;    // distancia máx. para "misma secuencia"
export const AMBIGUOUS_MARGIN = 0.92; // 2ª mejor ≥92% de la mejor → también se elige

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// Corrección de luz AUTOMÁTICA POR FOTO a partir de las métricas medidas (luma + recorte).
// Cada foto recibe su propio ajuste básico (no un valor fijo para todas).
export function autoBasicFromMetrics(m) {
  if (!m) return { exposure: 0.10, contrast: 0, highlights: -15, shadows: 15, whites: 5, blacks: -5 };
  const luma = m.luma != null ? m.luma : 118;
  const sc = m.shadowClip || 0;
  const hc = m.highClip || 0;
  const exposure = clamp((118 - luma) / 70, -1.5, 1.5);
  const highlights = clamp(hc > 0.02 ? -Math.round(hc * 500) : -15, -80, 0);
  const shadows = clamp(sc > 0.02 ? Math.round(sc * 500) : 15, 0, 80);
  const whites = clamp(hc > 0.05 ? -10 : 5, -30, 30);
  const blacks = clamp(sc > 0.05 ? -15 : -5, -40, 20);
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
