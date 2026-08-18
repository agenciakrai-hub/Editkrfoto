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
export function computeWhiteBalance(color, { strength = 0.5, skinMin = 0.006 } = {}) {
  const none = { temperature: null, tint: null, whiteBalanceConfidence: 0, skinDetected: false, cast: 0 };
  if (!color) return none;
  const { meanR = 0, meanG = 0, meanB = 0, skinR = 0, skinG = 0, skinB = 0, skinRatio = 0 } = color;
  const skinDetected = skinRatio >= skinMin && skinR > 0;

  // "warmth" = exceso de calidez a RETIRAR (>0 → enfriar / bajar temp).
  // "green"  = exceso de verde a RETIRAR   (>0 → añadir magenta / subir tint).
  let warmth, green, confidence;
  if (skinDetected) {
    const base = skinR || 1;
    const gRatio = skinG / base, bRatio = skinB / base;
    warmth = 0.68 - bRatio; // piel natural bRatio≈0.68; si es menos azul → demasiado cálida
    green = gRatio - 0.80;  // piel natural gRatio≈0.80; si es más verde → falta magenta
    confidence = clamp(0.6 + Math.min(0.35, skinRatio * 8), 0.6, 0.95);
  } else {
    const avg = (meanR + meanG + meanB) / 3 || 1;
    warmth = (meanR - meanB) / avg;
    green = (meanG - (meanR + meanB) / 2) / avg;
    confidence = 0.45;
  }

  // Zona muerta (prudente): dominantes pequeñas no se tocan → respeta la atmósfera.
  const dz = 0.045;
  const s = strength / 0.5;
  const wEff = Math.abs(warmth) < dz ? 0 : warmth - Math.sign(warmth) * dz;
  const gEff = Math.abs(green) < dz ? 0 : green - Math.sign(green) * dz;

  const dTemp = clamp(-wEff * 6000 * strength, -1500 * s, 1500 * s);
  const dTint = clamp(gEff * 200 * strength, -25 * s, 25 * s);

  if (Math.abs(dTemp) < 40 && Math.abs(dTint) < 2) {
    return { ...none, skinDetected, whiteBalanceConfidence: Math.round(confidence * 100) / 100 };
  }
  return {
    temperature: Math.round(NEUTRAL_TEMP + dTemp),
    tint: Math.round(dTint),
    whiteBalanceConfidence: Math.round(confidence * 100) / 100,
    skinDetected,
    cast: Math.round((Math.abs(wEff) + Math.abs(gEff)) * 100) / 100,
  };
}
