// MOTOR IA DE AJUSTES BÁSICOS (Fase 2) — decisor ÚNICO de los 13 parámetros básicos.
// Responsabilidad EXCLUSIVA: Temperature, Tint, Exposure, Contrast, Highlights, Shadows,
// Whites, Blacks, Texture, Clarity, Dehaze, Vibrance, Saturation. NADA MÁS.
// El preset/estilo controla el resto del look y NUNCA estos 13 (aislamiento en el backend).
//
// Principios (regla del usuario):
//  - Analiza CADA foto individualmente; valores distintos por foto (no un preset genérico).
//  - "No tocar" es válido: si la foto no lo necesita, el parámetro queda en 0 (o WB = As Shot).
//  - Respeta la intención de luz (low/high-key, contraluz, flash). No crea HDR ni look.
import { computeBasic } from "./exposureEngine";
import { computeWhiteBalance } from "./whiteBalance";

export const AI_BASIC_KEYS = [
  "temperature", "tint", "exposure", "contrast", "highlights", "shadows",
  "whites", "blacks", "texture", "clarity", "dehaze", "vibrance", "saturation",
];

// Todos a 0 (temp/tint = null → As Shot): la corrección "no tocar".
export const NEUTRAL_AI_BASICS = {
  temperature: null, tint: null, exposure: 0, contrast: 0, highlights: 0, shadows: 0,
  whites: 0, blacks: 0, texture: 0, clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
};

const DEADZONE = {
  prudent: { exp: 0.06, tone: 4 },
  active: { exp: 0.03, tone: 2 },
};

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

function buildReasoning({ exposureClassification, exposure, highlights, shadows, wb, dehaze, vibrance, skinDetected }) {
  const parts = [];
  parts.push(`Fotografía ${exposureClassification}.`);
  if (exposure > 0) parts.push(`Se sube la exposición ${exposure.toFixed(2)} EV.`);
  else if (exposure < 0) parts.push(`Se baja la exposición ${exposure.toFixed(2)} EV.`);
  else parts.push("Exposición conservada.");
  if (highlights < 0) parts.push("Altas luces recuperadas sin aplanarlas.");
  else parts.push("Altas luces conservadas.");
  if (shadows > 0) parts.push("Sombras abiertas de forma controlada.");
  else parts.push("Sombras respetadas (no se levanta el fondo).");
  if (wb.temperature != null) {
    parts.push(`Balance de blancos corregido${skinDetected ? " con la piel como referencia" : ""}.`);
  } else parts.push("Balance de blancos coherente: se deja As Shot.");
  if (dehaze > 0) parts.push("Ligera eliminación de neblina.");
  if (vibrance > 0) parts.push("Pequeña corrección de vibración global.");
  if (exposure === 0 && highlights === 0 && shadows === 0 && wb.temperature == null && dehaze === 0 && vibrance === 0) {
    parts.push("La foto ya está equilibrada: apenas se modifica.");
  }
  return parts.join(" ");
}

// analysis: { photometrics, color, subjectDetected? }
// opts: { mode='balanced', wbStrength=0.5, deadzone='prudent', subjectDetected }
export function computeAiBasics(analysis, opts = {}) {
  const { mode = "balanced", wbStrength = 0.5, deadzone = "prudent" } = opts;
  const pm = analysis && analysis.photometrics;
  const color = analysis && analysis.color;
  const subjectDetected = opts.subjectDetected ?? analysis?.subjectDetected ?? false;
  const dz = DEADZONE[deadzone] || DEADZONE.prudent;
  const snap = (v, t) => (Math.abs(v) < t ? 0 : Math.round(v));

  // --- Exposición y tono (6): motor v2 + zona muerta "no tocar" ---
  const base = pm ? computeBasic(pm, mode)
    : { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 };
  const exposure = Math.abs(base.exposure) < dz.exp ? 0 : Math.round(base.exposure * 100) / 100;
  const contrast = snap(base.contrast, dz.tone);
  const highlights = snap(base.highlights, dz.tone);
  const shadows = clamp(snap(pm ? base.shadows - 8 : 0, dz.tone), -100, 100); // sin lift automático de sombras
  const whites = snap(base.whites, dz.tone);
  const blacks = snap(base.blacks, dz.tone);

  // --- Balance de blancos (2) ---
  const wb = computeWhiteBalance(color, { strength: wbStrength });

  // --- Presencia (3): 0 salvo que la fotometría lo justifique (nada de HDR) ---
  const contrastIndex = pm ? pm.contrastIndex : 100;
  const p5 = pm ? pm.p5 : 20;
  const hazy = pm && contrastIndex < 90 && p5 > 30; // velo: poco contraste + negros levantados
  const dehaze = hazy ? clamp(Math.round((90 - contrastIndex) * 0.3), 0, 20) : 0;
  const clarity = 0;
  const texture = 0;

  // --- Color (2): SOLO corrección de equilibrio, no look ---
  let vibrance = 0;
  const saturation = 0;
  if (color) {
    const mx = Math.max(color.meanR, color.meanG, color.meanB);
    const mn = Math.min(color.meanR, color.meanG, color.meanB);
    const sat = mx ? (mx - mn) / mx : 0;
    if (sat < 0.06) vibrance = Math.round(8 * (wbStrength / 0.5)); // imagen muy plana → sube un poco
  }

  const aiBasicAdjustments = {
    temperature: wb.temperature, tint: wb.tint, exposure, contrast, highlights, shadows,
    whites, blacks, texture, clarity, dehaze, vibrance, saturation,
  };

  // --- Auditoría ---
  const meter = pm ? (pm.cP50 || pm.p50) : 128;
  const bands = { conservative: [110, 150], balanced: [105, 155], aggressive: [100, 160] }[mode] || [105, 155];
  const exposureClassification = meter < bands[0] ? "subexpuesta" : (meter > bands[1] ? "sobreexpuesta" : "correcta");
  const skinDetected = wb.skinDetected;
  let editingConfidence = 0.85;
  if (pm && pm.highClip > 0.08 && pm.lowClip > 0.08) editingConfidence -= 0.25; // escena difícil (doble recorte)
  if (!skinDetected && wb.temperature != null) editingConfidence -= 0.1;        // WB sin piel = menos fiable
  editingConfidence = Math.round(clamp(editingConfidence, 0.3, 0.95) * 100) / 100;

  return {
    aiBasicAdjustments,
    editingConfidence,
    exposureClassification,
    subjectDetected: !!subjectDetected,
    skinDetected,
    whiteBalanceConfidence: wb.whiteBalanceConfidence,
    reasoningSummary: buildReasoning({ exposureClassification, exposure, highlights, shadows, wb, dehaze, vibrance, skinDetected }),
  };
}
