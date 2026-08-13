// Lógica pura de agrupado y selección (sin dependencias de navegador → testeable).
export function hamming(a, b) {
  let x = a ^ b, c = 0;
  while (x) { c += Number(x & 1n); x >>= 1n; }
  return c;
}

export const PHASH_THRESHOLD = 8;    // distancia máx. para "misma secuencia"
export const AMBIGUOUS_MARGIN = 0.92; // 2ª mejor ≥92% de la mejor → también se elige

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
