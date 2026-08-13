// Heurística de selección IA (MVP): agrupa ráfagas por proximidad temporal y marca la mejor toma.
export const RAW_EXTS = ["cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2", "pef", "srw", "jpg", "jpeg"];

export const SAMPLE_THUMBS = [
  "https://images.unsplash.com/photo-1519741196428-6a2175fa2557?crop=entropy&cs=srgb&fm=jpg&q=80&w=500",
  "https://images.unsplash.com/photo-1724280120520-c52b4c1170fd?crop=entropy&cs=srgb&fm=jpg&q=80&w=500",
  "https://images.unsplash.com/photo-1630526720753-aa4e71acf67d?crop=entropy&cs=srgb&fm=jpg&q=80&w=500",
  "https://images.unsplash.com/photo-1715285977649-4a83c0820399?crop=entropy&cs=srgb&fm=jpg&q=80&w=500",
];

export function extOf(name) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

export function isRaw(name) {
  return RAW_EXTS.includes(extOf(name));
}

// Puntuación de calidad determinista (repetible) a partir del nombre y tamaño del archivo.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

function qualityScore(file) {
  const base = hashString(file.name) * 70;             // 0..70 nitidez/composición simulada
  const sizeBonus = Math.min(30, (file.size || 0) / (6 * 1024 * 1024) * 30); // ficheros mayores ~ mejor detalle
  return Math.round(base + sizeBonus);
}

// Devuelve la lista de "photos" con burst grouping + mejores tomas marcadas.
export function analyzeFolder(fileList) {
  const files = Array.from(fileList).filter((f) => isRaw(f.name));
  files.sort((a, b) => (a.lastModified - b.lastModified) || a.name.localeCompare(b.name));

  const BURST_GAP_MS = 1500;
  const MAX_BURST = 8;
  const uniqueTimes = new Set(files.map((f) => f.lastModified)).size;
  const timeReliable = files.length > 0 && uniqueTimes / files.length > 0.5;

  let burstId = 0;
  let lastTs = null;
  let burstLen = 0;
  const photos = files.map((f, i) => {
    const startNew = !timeReliable || lastTs === null || (f.lastModified - lastTs) > BURST_GAP_MS || burstLen >= MAX_BURST;
    if (startNew) { burstId += 1; burstLen = 0; }
    burstLen += 1;
    lastTs = f.lastModified;
    return {
      id: `${burstId}-${i}-${f.name}`,
      name: f.name,
      size: f.size,
      lastModified: f.lastModified,
      ext: extOf(f.name),
      burstId,
      score: qualityScore(f),
      thumb: SAMPLE_THUMBS[i % SAMPLE_THUMBS.length],
      file: f,
      isBest: false,
      selectedForEdit: false,
    };
  });

  // Marca la mejor toma de cada ráfaga
  const byBurst = new Map();
  for (const p of photos) {
    if (!byBurst.has(p.burstId)) byBurst.set(p.burstId, []);
    byBurst.get(p.burstId).push(p);
  }
  for (const group of byBurst.values()) {
    const best = group.reduce((a, b) => (b.score > a.score ? b : a));
    best.isBest = true;
    best.selectedForEdit = true;
  }
  return photos;
}

export function burstCount(photos) {
  return new Set(photos.map((p) => p.burstId)).size;
}
