// Motor de BALANCE DE BLANCOS del Motor IA (parte de los 13 básicos).
// La previsualización ya viene revelada, así que estimamos una CORRECCIÓN alrededor de un
// neutro de 5500K (nunca imponemos un Kelvin fijo: si no hay dominante clara → As Shot).
// Con personas usamos la PIEL como referencia (no la neutralizamos: la llevamos a un tono
// natural). Sin personas, gris-mundo conservador con zona muerta. Nunca inventa: si no hay
// señal fiable → no corrige.
export const NEUTRAL_TEMP = 5500;

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// color: { meanR, meanG, meanB, skinR, skinG, skinB, skinRatio }
// strength: 0.5 = suave/conservador (def), 1.0 = neutro estricto.
// ambience: 'golden_hour'|'tungsten'|'cool'|'neutral' (preserva la atmósfera cálida).
// faceSkin: { r, g, b } piel de las caras (Fase 1) → referencia PRIORITARIA del WB (A2).
export function computeWhiteBalance(color, { strength = 0.5, skinMin = 0.006, ambience = "neutral", faceSkin = null } = {}) {
  const none = { temperature: null, tint: null, whiteBalanceConfidence: 0, skinDetected: false, skinSource: "none", cast: 0 };
  const useFace = !!(faceSkin && faceSkin.r > 0);
  if (!color && !useFace) return none;
  const { meanR = 0, meanG = 0, meanB = 0, skinR = 0, skinG = 0, skinB = 0, skinRatio = 0 } = color || {};
  const globalSkin = skinRatio >= skinMin && skinR > 0;

  // "warmth" = exceso de calidez a RETIRAR (>0 → enfriar / bajar temp).
  // "green"  = exceso de verde a RETIRAR   (>0 → añadir magenta / subir tint).
  // Jerarquía A2: piel FACIAL → piel agregada (global) → gris-mundo → As Shot.
  let warmth, green, confidence, skinSource;
  if (useFace) {
    const base = faceSkin.r || 1;
    warmth = 0.68 - faceSkin.b / base;   // piel natural bRatio≈0.68
    green = faceSkin.g / base - 0.80;    // piel natural gRatio≈0.80
    confidence = 0.9;
    skinSource = "face";
  } else if (globalSkin) {
    const base = skinR || 1;
    warmth = 0.68 - skinB / base;
    green = skinG / base - 0.80;
    confidence = clamp(0.6 + Math.min(0.35, skinRatio * 8), 0.6, 0.95);
    skinSource = "skin";
  } else {
    const avg = (meanR + meanG + meanB) / 3 || 1;
    warmth = (meanR - meanB) / avg;
    green = (meanG - (meanR + meanB) / 2) / avg;
    confidence = 0.45;
    skinSource = "grayworld";
  }
  const skinDetected = useFace || globalSkin;

  // Zona muerta (prudente): dominantes pequeñas no se tocan → respeta la atmósfera.
  const dz = 0.045;
  const s = strength / 0.5;
  const wEff = Math.abs(warmth) < dz ? 0 : warmth - Math.sign(warmth) * dz;
  const gEff = Math.abs(green) < dz ? 0 : green - Math.sign(green) * dz;

  let dTemp = clamp(-wEff * 6000 * strength, -1500 * s, 1500 * s);
  const dTint = clamp(gEff * 200 * strength, -25 * s, 25 * s);

  // Preserva la atmósfera cálida: en golden hour/tungsteno NO se enfría del todo.
  if (dTemp < 0 && (ambience === "golden_hour" || ambience === "tungsten")) {
    const keep = ambience === "golden_hour" ? 0.7 : 0.4; // % de calidez conservada
    dTemp *= (1 - keep);
  }

  if (Math.abs(dTemp) < 40 && Math.abs(dTint) < 2) {
    return { ...none, skinDetected, skinSource, whiteBalanceConfidence: Math.round(confidence * 100) / 100 };
  }
  return {
    temperature: Math.round(NEUTRAL_TEMP + dTemp),
    tint: Math.round(dTint),
    whiteBalanceConfidence: Math.round(confidence * 100) / 100,
    skinDetected,
    skinSource,
    cast: Math.round((Math.abs(wEff) + Math.abs(gEff)) * 100) / 100,
  };
}
