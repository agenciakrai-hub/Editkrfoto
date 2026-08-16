// Modelo de edición:
//  - AJUSTES BÁSICOS (luz/tono + balance de blancos): SIEMPRE automáticos por la IA.
//    El fotógrafo no los toca; presets y estilos NO los modifican.
//  - AJUSTES CREATIVOS (claridad, vibración, saturación): la capa que aportan los
//    presets y los estilos de otros fotógrafos.
export const PARAM_DEFS = [
  { key: "exposure", label: "Exposición", min: -5, max: 5, step: 0.05, def: 0, unit: "EV", basic: true },
  { key: "contrast", label: "Contraste", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "highlights", label: "Altas luces", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "shadows", label: "Sombras", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "whites", label: "Blancos", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "blacks", label: "Negros", min: -100, max: 100, step: 1, def: 0, basic: true },
  { key: "temperature", label: "Temperatura", min: 2000, max: 12000, step: 50, def: 5500, unit: "K", basic: true },
  { key: "tint", label: "Tinte", min: -150, max: 150, step: 1, def: 0, basic: true },
  { key: "clarity", label: "Claridad", min: -100, max: 100, step: 1, def: 0, basic: false },
  { key: "vibrance", label: "Vibración", min: -100, max: 100, step: 1, def: 0, basic: false },
  { key: "saturation", label: "Saturación", min: -100, max: 100, step: 1, def: 0, basic: false },
];

export const BASIC_KEYS = PARAM_DEFS.filter((p) => p.basic).map((p) => p.key);
export const CREATIVE_KEYS = PARAM_DEFS.filter((p) => !p.basic).map((p) => p.key);

// Base técnica que la IA aplica automáticamente a los ajustes básicos (nivelado por foto).
export const AUTO_BASIC_PARAMS = { exposure: 0.10, highlights: -15, shadows: 15, whites: 5, blacks: -5 };

export function defaultParameterConfig() {
  const cfg = {};
  for (const p of PARAM_DEFS) cfg[p.key] = { enabled: false, value: p.def };
  return cfg;
}

// Solo los parámetros CREATIVOS habilitados (lo que aportan preset/estilo).
export function creativeParametersFromConfig(config) {
  const out = {};
  for (const p of PARAM_DEFS) {
    if (!p.basic && config[p.key]?.enabled) out[p.key] = config[p.key].value;
  }
  return out;
}

// Lo que se envía al XMP: base automática de la IA + capa creativa del preset/estilo.
export function fullParametersFromConfig(config) {
  return { ...AUTO_BASIC_PARAMS, ...creativeParametersFromConfig(config) };
}

// Descarta cualquier clave básica de un mapa de parámetros (presets/estilos no tocan lo básico).
export function pickCreative(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (CREATIVE_KEYS.includes(k)) out[k] = v;
  }
  return out;
}

export const PRECISION_MODES = [
  { key: "conservative", label: "Conservador", desc: "Correcciones sutiles (±0.35 EV). Máxima seguridad." },
  { key: "balanced", label: "Equilibrado", desc: "Balance recomendado (±0.6 EV)." },
  { key: "aggressive", label: "Agresivo", desc: "Correcciones amplias (±1.0 EV). Máximo impacto." },
];

// Presets de estilo: SOLO capa creativa (claridad, vibración, saturación).
export const STYLE_PRESETS = [
  { name: "Boda Clara", desc: "Luminoso, aireado y limpio", apply: { clarity: 8, vibrance: 12 } },
  { name: "Cálido Atardecer", desc: "Tonos dorados y románticos", apply: { clarity: 5, vibrance: 20, saturation: 6 } },
  { name: "Editorial B/N", desc: "Blanco y negro con carácter", apply: { clarity: 22, saturation: -100 } },
  { name: "Natural", desc: "Fiel a la escena, sutil", apply: { clarity: 4, vibrance: 6 } },
];

export function applyPreset(config, preset) {
  const next = { ...config };
  for (const [key, value] of Object.entries(pickCreative(preset.apply))) {
    next[key] = { enabled: true, value };
  }
  return next;
}
