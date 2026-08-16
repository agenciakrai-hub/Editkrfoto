// Capa técnica (fotometría determinista) del motor de ajustes básicos v2.
// 100% local, sin IA/LLM. Trabaja sobre histogramas de luminancia (0..255):
//   - histGlobal: histograma normal (todos los píxeles).
//   - histCenter: histograma PONDERADO AL CENTRO (fotómetro real → prioriza al sujeto).
// La "capa contextual" (contraluz, clave alta/baja, flash) se DERIVA de estas medidas,
// nunca de una IA: es gratis, rápida y repetible.

export function percentile(hist, total, p) {
  if (!hist || !total) return 0;
  const t = p * total;
  let acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= t) return i; }
  return 255;
}

export const SCENES = ["high_key", "low_key", "backlit", "flash", "normal"];

// Clasifica la escena a partir de la fotometría (contexto sin IA).
export function classifyScene(pm) {
  const { p5, p50, p95, cP50, highClip, lowClip } = pm;
  // Contraluz: el sujeto (centro) es bastante más oscuro que la escena y las luces se recortan.
  if (cP50 <= p50 - 22 && (highClip > 0.02 || p95 >= 244)) return "backlit";
  // Flash / foco: el sujeto (centro) está claramente más iluminado que un fondo oscuro.
  if (cP50 >= p50 + 28 && p5 < 40) return "flash";
  // Clave alta: escena luminosa, aireada, sin sombras empastadas.
  if (p50 >= 150 && p95 >= 242 && lowClip < 0.02) return "high_key";
  // Clave baja: escena oscura, con cuerpo, sin luces quemadas.
  if (p50 <= 68 && p5 <= 16 && highClip < 0.02) return "low_key";
  return "normal";
}

export function computePhotometrics({ histGlobal, totalGlobal, histCenter, totalCenter }) {
  const g = histGlobal, tg = totalGlobal;
  const c = histCenter || histGlobal, tc = totalCenter || totalGlobal;
  const pm = {
    p1: percentile(g, tg, 0.01),
    p5: percentile(g, tg, 0.05),
    p50: percentile(g, tg, 0.5),
    p95: percentile(g, tg, 0.95),
    p99: percentile(g, tg, 0.99),
    cP50: percentile(c, tc, 0.5),
    lowClip: tg ? (g[0] + g[1]) / tg : 0,
    highClip: tg ? (g[254] + g[255]) / tg : 0,
    contrastIndex: 0,
    scene: "normal",
  };
  pm.contrastIndex = pm.p95 - pm.p5;
  pm.scene = classifyScene(pm);
  return pm;
}
