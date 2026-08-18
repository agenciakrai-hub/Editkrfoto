// Modelo de edición (Fase 2 — regla del usuario):
//  - MOTOR IA = AJUSTES BÁSICOS: los 13 parámetros SIEMPRE los calcula la IA por foto.
//    (Temperature, Tint, Exposure, Contrast, Highlights, Shadows, Whites, Blacks,
//     Texture, Clarity, Dehaze, Vibrance, Saturation).
//  - PRESET / ESTILO = resto del look (curvas, HSL, color grading, calibración, efectos…)
//    y NUNCA los 13 básicos. El aislamiento se garantiza en el backend.
export const PARAM_DEFS = [
  { key: "temperature", label: "Temperatura", min: 2000, max: 12000, step: 50, def: 5500, unit: "K", basic: true },
  { key: "tint", label: "Tinte", min: -150, max: 150, step: 1, def: 0, basic: true },
  { key: "exposure", label: "Exposición", min: -5, max: 5, step: 0.05, def: 0, unit: "EV", basic: true },
  { key: "contrast", label: "Contraste", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "highlights", label: "Altas luces", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "shadows", label: "Sombras", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "whites", label: "Blancos", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "blacks", label: "Negros", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "texture", label: "Textura", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "clarity", label: "Claridad", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "dehaze", label: "Borrar neblina", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "vibrance", label: "Vibración", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "saturation", label: "Saturación", min: -100, max: 100, step: 1, def: 0, basic: true },
];

// Los 13 parámetros de propiedad EXCLUSIVA del Motor IA.
export const AI_BASIC_KEYS = PARAM_DEFS.map((p) => p.key);
export const BASIC_KEYS = AI_BASIC_KEYS;
export const CREATIVE_KEYS = []; // ya no hay capa creativa: el preset no toca los 13

// Deprecado: ya no se aplica un preset básico genérico (cada foto se calcula individualmente).
export const AUTO_BASIC_PARAMS = {};

export function defaultParameterConfig() {
  const cfg = {};
  for (const p of PARAM_DEFS) cfg[p.key] = { enabled: false, value: p.def };
  return cfg;
}

// El preset/estilo NO aporta ninguno de los 13 → mapa creativo vacío.
export function creativeParametersFromConfig() { return {}; }
export function fullParametersFromConfig() { return {}; }

// Elimina CUALQUIER clave de los 13 básicos de un mapa de parámetros (presets/estilos no los tocan).
export function pickCreative(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (!AI_BASIC_KEYS.includes(k)) out[k] = v;
  }
  return out;
}

export const PRECISION_MODES = [
  { key: "conservative", label: "Conservador", desc: "Correcciones sutiles (±0.35 EV). Máxima seguridad." },
  { key: "balanced", label: "Equilibrado", desc: "Balance recomendado (±0.6 EV)." },
  { key: "aggressive", label: "Agresivo", desc: "Correcciones amplias (±1.0 EV). Máximo impacto." },
];

// Presets de "look" (el resto de parámetros): NO tocan los 13 básicos del Motor IA.
export const STYLE_PRESETS = [
  { name: "Boda Clara", desc: "Luminoso, aireado y limpio", apply: {} },
  { name: "Cálido Atardecer", desc: "Tonos dorados y románticos", apply: {} },
  { name: "Editorial B/N", desc: "Blanco y negro con carácter", apply: {} },
  { name: "Natural", desc: "Fiel a la escena, sutil", apply: {} },
];

export function applyPreset(config) { return { ...config }; }
