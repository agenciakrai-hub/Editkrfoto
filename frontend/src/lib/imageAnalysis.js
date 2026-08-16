// Análisis de imagen real (cliente) optimizado para miles de fotos.
// Extrae SOLO la miniatura JPEG incrustada del RAW (vía file.slice en rawThumb) y mide
// NITIDEZ (enfoque) y EXPOSICIÓN. El agrupado/selección vive en selectionLogic (puro).
import { extractPreviewBlob } from "@/lib/rawThumb";
import { autoToneFromHistogram } from "@/lib/selectionLogic";
import { computePhotometrics } from "@/lib/rawaistudio/photometricAnalysis";
import { computeBasic } from "@/lib/rawaistudio/exposureEngine";
export { groupAndSelect, hamming, autoToneFromHistogram, PHASH_THRESHOLD, AMBIGUOUS_MARGIN } from "@/lib/selectionLogic";

async function bitmapFromFile(file) {
  const blob = await extractPreviewBlob(file);
  if (!blob) return null;
  try {
    return await createImageBitmap(blob, { resizeWidth: 256, resizeQuality: "low" });
  } catch {
    try { return await createImageBitmap(blob); } catch { return null; }
  }
}

function metricsFromBitmap(bmp) {
  const w = Math.min(256, bmp.width) || 256;
  const h = Math.max(1, Math.round(w * (bmp.height / bmp.width)));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const gray = new Float32Array(w * h);
  const hist = new Array(256).fill(0);
  let sum = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    gray[p] = g; sum += g; hist[Math.min(255, g | 0)]++;
  }
  // Nitidez: varianza del laplaciano (más alto = más enfocado / detalle).
  let mean = 0, n = 0;
  const lap = new Float32Array((w - 2) * (h - 2));
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const l = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - w] - gray[idx + w];
      lap[n] = l; mean += l; n++;
    }
  }
  mean /= (n || 1);
  let varr = 0;
  for (let k = 0; k < n; k++) { const v = lap[k] - mean; varr += v * v; }
  const sharpness = n ? varr / n : 0;

  // Exposición: penaliza recorte de altas luces/sombras y medias muy oscuras/claras.
  const total = w * h;
  const avg = sum / total;
  const shadowClip = hist[0] / total;
  const highClip = hist[255] / total;
  let exposure = 1 - (shadowClip * 0.5 + highClip * 0.5);
  if (avg < 45) exposure *= avg / 45;
  if (avg > 215) exposure *= (255 - avg) / 40;
  exposure = Math.max(0, Math.min(1, exposure));

  // pHash (average hash 8x8) para similitud visual.
  const pc = document.createElement("canvas");
  pc.width = 8; pc.height = 8;
  const pctx = pc.getContext("2d", { willReadFrequently: true });
  pctx.drawImage(bmp, 0, 0, 8, 8);
  const pd = pctx.getImageData(0, 0, 8, 8).data;
  const g8 = new Float32Array(64);
  let s8 = 0;
  for (let i = 0, p = 0; i < pd.length; i += 4, p++) {
    const g = 0.299 * pd[i] + 0.587 * pd[i + 1] + 0.114 * pd[i + 2];
    g8[p] = g; s8 += g;
  }
  const m8 = s8 / 64;
  let hash = 0n;
  for (let i = 0; i < 64; i++) if (g8[i] > m8) hash |= (1n << BigInt(i));

  return { sharpness, exposure, hash, luma: avg, shadowClip, highClip, basic: autoToneFromHistogram(hist, total) };
}

export async function analyzeFile(file) {
  const bmp = await bitmapFromFile(file);
  if (!bmp) return null;
  try { return metricsFromBitmap(bmp); }
  catch { return null; }
  finally { if (bmp.close) bmp.close(); }
}

// --- Motor v2 (laboratorio): histograma global + PONDERADO AL CENTRO para comparar ---
function labMetricsFromBitmap(bmp, mode = "balanced") {
  const w = Math.min(256, bmp.width) || 256;
  const h = Math.max(1, Math.round(w * (bmp.height / bmp.width)));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const histGlobal = new Array(256).fill(0);
  const histCenter = new Array(256).fill(0);
  let totalCenter = 0;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const sigma = 0.42; // fracción del radio para la ponderación gaussiana
  const maxD = Math.hypot(cx, cy) || 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const g = Math.min(255, (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0);
      histGlobal[g] += 1;
      const dist = Math.hypot(x - cx, y - cy) / maxD;
      const wgt = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      histCenter[g] += wgt;
      totalCenter += wgt;
    }
  }
  const totalGlobal = w * h;
  const photometrics = computePhotometrics({ histGlobal, totalGlobal, histCenter, totalCenter });
  const oldBasic = autoToneFromHistogram(histGlobal, totalGlobal);
  const newBasic = computeBasic(photometrics, mode);
  return { photometrics, oldBasic, newBasic };
}

// Analiza una foto para el laboratorio de comparación (motor antiguo vs v2).
export async function analyzeFileForLab(file, mode = "balanced") {
  const bmp = await bitmapFromFile(file);
  if (!bmp) return null;
  try { return labMetricsFromBitmap(bmp, mode); }
  catch { return null; }
  finally { if (bmp.close) bmp.close(); }
}

// Cola con concurrencia limitada (bounded) para no saturar memoria/CPU con miles de fotos.
export async function mapLimit(arr, limit, fn, onProgress) {
  let i = 0, done = 0;
  const results = new Array(arr.length);
  async function worker() {
    while (i < arr.length) {
      const idx = i++;
      results[idx] = await fn(arr[idx], idx);
      done++; onProgress && onProgress(done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, worker));
  return results;
}
