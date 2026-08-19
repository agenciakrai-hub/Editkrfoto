// A1 — Metering HÍBRIDO: combina el fotómetro fotométrico (cP50) con el SUJETO (caras Fase 1).
// Las caras son señal PRIORITARIA, nunca autoridad absoluta: el peso está acotado (WMAX)
// y depende de tamaño, confianza, nitidez y frontalidad. Sin caras → devuelve cP50 (NO CHANGE).
const WMAX = 0.6;                 // las caras nunca pesan más del 60% del fotómetro
const MAIN_AREA_REF = 0.06;       // área (fracción de frame) de un retrato "pleno"

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function frontalness(pose) {
  if (!pose) return 1;
  return clamp(1 - Math.abs(pose.yaw || 0) * 0.8 - Math.abs(pose.roll || 0) / 60, 0.3, 1);
}
// Prioridad del sujeto: NO es solo el tamaño; pondera nitidez, confianza y frontalidad.
function priority(f) {
  const area = f.area || 0;
  const sharp = 0.5 + 0.5 * clamp(f.faceSharpness ?? 0.5, 0, 1);
  const conf = clamp(f.score ?? 0.9, 0, 1);
  return area * sharp * conf * frontalness(f.pose);
}

export function computeMeter(pm, faces, opts = {}) {
  const cP50 = pm ? (pm.cP50 ?? pm.p50 ?? 128) : 128;
  const list = (faces || []).filter((f) => f && (f.area || 0) > 0);
  if (!list.length) {
    return { meter: cP50, faceWeight: 0, subjectLuma: null, mainPriority: 0, reason: "sin caras → fotometría (cP50)" };
  }
  // Cara principal = mayor prioridad (no mayor faceCount ni solo área).
  const ranked = [...list].sort((a, b) => priority(b) - priority(a));
  const main = ranked[0];
  const mainArea = main.area || 0;

  // Luminancia del sujeto: media ponderada por prioridad (la principal domina, las 2ª aportan menos).
  const wsum = ranked.reduce((s, f) => s + priority(f), 0) || 1;
  const subjectLuma = ranked.reduce((s, f) => s + (f.luma ?? cP50) * priority(f), 0) / wsum;

  // Peso DINÁMICO de las caras: tamaño × confianza × nitidez × frontalidad, acotado a WMAX.
  const sizeScore = clamp(mainArea / MAIN_AREA_REF, 0, 1);          // cara pequeña → poco peso
  const confScore = clamp(main.score ?? 0.9, 0, 1);
  const sharpScore = clamp((main.faceSharpness ?? 0.5) / 0.6, 0, 1);
  let faceWeight = WMAX * sizeScore * confScore * (0.5 + 0.5 * sharpScore) * frontalness(main.pose);
  faceWeight = clamp(faceWeight, 0, WMAX);

  const meter = cP50 * (1 - faceWeight) + subjectLuma * faceWeight;
  return {
    meter, faceWeight, subjectLuma, mainPriority: priority(main), mainArea,
    reason: `híbrido: cP50=${Math.round(cP50)} · sujeto=${Math.round(subjectLuma)} · peso=${faceWeight.toFixed(2)}`,
  };
}

export { WMAX, MAIN_AREA_REF };
