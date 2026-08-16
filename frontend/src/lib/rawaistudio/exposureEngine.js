// Capa de revelado (determinista) del motor de ajustes básicos v2.
// Traduce la fotometría a los ajustes básicos de Camera Raw/Lightroom, con TOPES por modo
// de precisión. Nunca inventa: parte de percentiles reales y de la medición ponderada al sujeto.
// Los presets/estilos NO pasan por aquí: solo tocan color. Aquí se calcula SOLO lo básico.
import { computePhotometrics } from "./photometricAnalysis";

// Modos de precisión con topes reales (±EV, ±tonos y banda de mediana objetivo).
export const PRECISION_PROFILES = {
  conservative: { key: "conservative", label: "Conservador", expMax: 0.35, toneMax: 20, medLo: 110, medHi: 150 },
  balanced:     { key: "balanced",     label: "Equilibrado", expMax: 0.6,  toneMax: 35, medLo: 105, medHi: 155 },
  aggressive:   { key: "aggressive",   label: "Agresivo",    expMax: 1.0,  toneMax: 55, medLo: 100, medHi: 160 },
};

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// Devuelve { exposure, contrast, highlights, shadows, whites, blacks } para ESTA foto.
export function computeBasic(pm, mode = "balanced") {
  const P = PRECISION_PROFILES[mode] || PRECISION_PROFILES.balanced;
  const meter = pm.cP50 || pm.p50; // medición ponderada al sujeto (centro)

  // --- Exposición: lleva la medición del sujeto a la banda objetivo del modo ---
  let target;
  if (meter < P.medLo) target = P.medLo;
  else if (meter > P.medHi) target = P.medHi;
  else target = meter; // ya está bien expuesto → no toca
  let exposure = clamp(Math.log2(target / Math.max(4, meter)), -P.expMax, P.expMax);

  // Capa contextual (sin IA): ajusta la intención según la escena.
  if (pm.scene === "low_key" && exposure > 0) exposure *= 0.4;               // preserva el ambiente oscuro
  if (pm.scene === "high_key") exposure = Math.min(exposure, P.expMax * 0.25); // no sobreexpone lo aireado
  if (pm.scene === "flash" && exposure > 0) exposure *= 0.5;                 // el sujeto ya está iluminado
  if (pm.scene === "backlit") exposure = clamp(exposure + 0.15, -P.expMax, P.expMax); // levanta un poco al sujeto
  if (pm.highClip > 0.05 && exposure > 0) exposure *= 0.5;                   // no quemar más las luces
  exposure = Math.round(exposure * 100) / 100;

  const f = Math.pow(2, exposure);
  const hiE = Math.min(255, pm.p99 * f); // extremos estimados tras la exposición
  const loE = Math.max(0, pm.p1 * f);

  // --- Blancos / negros: estira el rango hasta casi tocar extremos sin recortar ---
  const whites = clamp(Math.round((246 - hiE) / 1.5), -P.toneMax, P.toneMax);
  const blacks = clamp(Math.round((10 - loE) / 1.5), -P.toneMax, P.toneMax);

  // --- Recuperación de luces / apertura de sombras (según recorte real y escena) ---
  let hi = -pm.highClip * 600 - Math.max(0, hiE - 248) * 3;
  let sh = pm.lowClip * 600 + Math.max(0, 8 - loE) * 3 + 8;
  if (pm.scene === "backlit") sh += 22;              // abre al sujeto a contraluz
  if (pm.scene === "high_key") hi -= 15;             // protege altas luces aireadas
  if (pm.scene === "low_key") { sh -= 18; hi += 6; } // mantiene cuerpo en las sombras
  const highlights = clamp(Math.round(hi), -P.toneMax, 0);
  const shadows = clamp(Math.round(sh), 0, P.toneMax);

  // --- Contraste: acerca el rango tonal a un objetivo (más suave en clave alta/baja) ---
  let contrast = Math.round((215 - pm.contrastIndex) * 0.35);
  if (pm.scene === "low_key") contrast += 8;
  if (pm.scene === "high_key") contrast -= 6;
  contrast = clamp(contrast, -P.toneMax, P.toneMax);

  return { exposure, contrast, highlights, shadows, whites, blacks };
}

// Conveniencia: desde histogramas directamente.
export function basicFromHistograms(hists, mode = "balanced") {
  return computeBasic(computePhotometrics(hists), mode);
}
