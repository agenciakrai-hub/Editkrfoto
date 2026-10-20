// Verificación (sin Lightroom) del XMP que realmente quedará leído por Lightroom:
// exige los 13 básicos de la IA válidos (finitos, en rango, sin duplicados), HasSettings,
// que NO sea preset-template (ajustes APLICADOS a la foto) y 5★ + etiqueta verde.
// Devuelve `errors` por foto; mantiene los campos de la versión anterior (compatibilidad).

const CRS_BASICS = [
  ["Exposure2012", "Exposición"], ["Contrast2012", "Contraste"], ["Highlights2012", "Luces"],
  ["Shadows2012", "Sombras"], ["Whites2012", "Blancos"], ["Blacks2012", "Negros"],
  ["Temperature", "Temp."], ["Tint", "Tinte"], ["Texture", "Textura"], ["Clarity2012", "Claridad"],
  ["Dehaze", "Neblina"], ["Vibrance", "Vibración"], ["Saturation", "Saturación"],
];

const RANGES = { Exposure2012: [-5, 5], Temperature: [2000, 50000], Tint: [-150, 150] };
const DEFAULT_RANGE = [-100, 100];
const WB_KEYS = new Set(["Temperature", "Tint"]);

// Atributos del "look" creativo del preset (curva, HSL, split toning, color grading, sharpening).
const LOOK_ATTRS = [
  "ToneCurvePV2012", "ToneCurveName2012", "HueAdjustmentRed", "SaturationAdjustmentRed",
  "LuminanceAdjustmentRed", "SplitToningHighlightHue", "SplitToningShadowHue",
  "ColorGradeMidtoneHue", "ColorGradeHighlightHue", "Sharpness", "MaskGroupBasedCorrections",
];

// Marcadores INEQUÍVOCOS de preset-template: si el XMP los trae, Lightroom lo trata como
// DEFINICIÓN de preset y no aplica los básicos a la foto (bug DNG). OJO: NO usar UUID ni
// SupportsAmount aquí, porque el <crs:Look> del PERFIL de cámara los contiene legítimamente.
const PRESET_WRAPPER = ["PresetType", "ShowInPresets"];

function attr(xmp, name) {
  const a = xmp.match(new RegExp('crs:' + name + '="([^"]*)"'));
  if (a) return a[1];
  const e = xmp.match(new RegExp('<crs:' + name + '>([^<]*)</crs:' + name + '>'));
  return e ? e[1] : null;
}
function occurrences(xmp, name) {
  return (xmp.match(new RegExp('crs:' + name + '="', "g")) || []).length
    + (xmp.match(new RegExp('<crs:' + name + '>', "g")) || []).length;
}
function present(xmp, name) {
  return new RegExp('crs:' + name + '[=>]').test(xmp);
}
const NUM_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

export function verifyXmp(xmp) {
  if (!xmp || typeof xmp !== "string") return { ok: false, reason: "no-xmp", errors: ["No hay XMP para esta foto"], basics: [] };

  const whiteBalance = attr(xmp, "WhiteBalance");
  const asShot = whiteBalance === "As Shot";
  const errors = []; // errores de los 13 básicos (y WB); luego se añaden los generales
  const basics = [];
  for (const [key, label] of CRS_BASICS) {
    const value = attr(xmp, key);
    const n = occurrences(xmp, key);
    if (n > 1) errors.push(`${label} aparece ${n} veces (preset y IA duplicados)`);
    if (value === null) {
      if (!(WB_KEYS.has(key) && asShot)) errors.push(`Falta ${label}`);
      continue;
    }
    basics.push({ key, label, value });
    const num = Number(value.trim());
    if (!NUM_RE.test(value.trim()) || !Number.isFinite(num)) { errors.push(`${label} no es un número válido («${value}»)`); continue; }
    const [lo, hi] = RANGES[key] || DEFAULT_RANGE;
    if (num < lo || num > hi) errors.push(`${label} fuera de rango (${value}; permitido ${lo}…${hi})`);
  }
  if (!whiteBalance) errors.push("Falta el balance de blancos (WhiteBalance)");
  else if (!asShot && (attr(xmp, "Temperature") === null || attr(xmp, "Tint") === null)) {
    errors.push(`Balance «${whiteBalance}» sin temperatura/tinte`);
  }

  const hasBasics = errors.length === 0;
  const activeBasics = basics.filter((b) => parseFloat(b.value) !== 0);
  const hasLook = LOOK_ATTRS.some((a) => present(xmp, a));
  const isPresetTemplate = PRESET_WRAPPER.some((a) => present(xmp, a));
  const rating = (xmp.match(/xmp:Rating="([^"]*)"/) || xmp.match(/<xmp:Rating>([^<]*)</) || [])[1] || null;
  const label = (xmp.match(/xmp:Label="([^"]*)"/) || xmp.match(/<xmp:Label>([^<]*)</) || [])[1] || null;
  const hasSettings = /crs:HasSettings="True"/i.test(xmp) || /<crs:HasSettings>True</i.test(xmp);
  // "Verde" (LrC español) es el valor escrito; se acepta "Green" por retrocompatibilidad.
  const ratingOk = rating === "5" && (label === "Verde" || label === "Green");

  if (!hasSettings) errors.push("Falta crs:HasSettings=\"True\" (Lightroom ignoraría los ajustes)");
  if (isPresetTemplate) errors.push("Es un preset-template: Lightroom no aplicaría los básicos a la foto");
  if (rating !== "5") errors.push(`Valoración ${rating ? `«${rating}»` : "ausente"} (se requiere 5★)`);
  if (!(label === "Verde" || label === "Green")) errors.push(`Etiqueta ${label ? `«${label}»` : "ausente"} (se requiere Verde)`);

  return {
    ok: errors.length === 0,
    errors,
    basics,
    activeCount: activeBasics.length,
    hasBasics,
    hasLook,
    isPresetTemplate,
    hasSettings,
    rating,
    label,
    ratingOk,
    whiteBalance,
  };
}

export { CRS_BASICS, LOOK_ATTRS, PRESET_WRAPPER };
