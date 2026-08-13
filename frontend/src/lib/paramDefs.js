// Definiciones de parámetros de corrección IA (mapeados a atributos crs de XMP en el backend)
export const PARAM_DEFS = [
  { key: "exposure", label: "Exposición", min: -5, max: 5, step: 0.05, def: 0, unit: "EV" },
  { key: "contrast", label: "Contraste", min: -100, max: 100, step: 1, def: 0 },
  { key: "highlights", label: "Altas luces", min: -100, max: 100, step: 1, def: 0 },
  { key: "shadows", label: "Sombras", min: -100, max: 100, step: 1, def: 0 },
  { key: "whites", label: "Blancos", min: -100, max: 100, step: 1, def: 0 },
  { key: "blacks", label: "Negros", min: -100, max: 100, step: 1, def: 0 },
  { key: "clarity", label: "Claridad", min: -100, max: 100, step: 1, def: 0 },
  { key: "vibrance", label: "Vibración", min: -100, max: 100, step: 1, def: 0 },
  { key: "saturation", label: "Saturación", min: -100, max: 100, step: 1, def: 0 },
  { key: "temperature", label: "Temperatura", min: 2000, max: 12000, step: 50, def: 5500, unit: "K" },
  { key: "tint", label: "Tinte", min: -150, max: 150, step: 1, def: 0 },
];

export function defaultParameterConfig() {
  const cfg = {};
  for (const p of PARAM_DEFS) cfg[p.key] = { enabled: false, value: p.def };
  return cfg;
}

// Solo los parámetros habilitados se envían al XMP
export function parametersFromConfig(config) {
  const out = {};
  for (const p of PARAM_DEFS) {
    if (config[p.key]?.enabled) out[p.key] = config[p.key].value;
  }
  return out;
}

export const PRECISION_MODES = [
  { key: "fast", label: "Rápido", desc: "Procesado veloz, ideal para grandes volúmenes." },
  { key: "balanced", label: "Equilibrado", desc: "Balance recomendado entre calidad y velocidad." },
  { key: "precise", label: "Preciso", desc: "Máxima fidelidad, análisis más detallado." },
];

// Presets de estilo predefinidos: aplican valores base a la configuración
export const STYLE_PRESETS = [
  { name: "Boda Clara", desc: "Luminoso, aireado y limpio",
    apply: { exposure: 0.35, highlights: -20, shadows: 25, whites: 10, clarity: 8, vibrance: 12, temperature: 5600 } },
  { name: "Cálido Atardecer", desc: "Tonos dorados y románticos",
    apply: { exposure: 0.2, contrast: 12, highlights: -15, shadows: 18, vibrance: 20, saturation: 6, temperature: 6300, tint: 8 } },
  { name: "Editorial B/N", desc: "Blanco y negro con carácter",
    apply: { contrast: 28, highlights: -10, shadows: 15, whites: 12, blacks: -18, clarity: 22, saturation: -100 } },
  { name: "Natural", desc: "Fiel a la escena, sutil",
    apply: { exposure: 0.1, highlights: -8, shadows: 10, clarity: 4, vibrance: 6, temperature: 5500 } },
];

export function applyPreset(config, preset) {
  const next = { ...config };
  for (const [key, value] of Object.entries(preset.apply)) {
    next[key] = { enabled: true, value };
  }
  return next;
}
