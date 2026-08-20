// Verificación (sin Lightroom) del XMP que realmente quedará leído por Lightroom:
// confirma que trae las básicas de la IA, el look del preset, que NO es preset-template
// (ajustes APLICADOS a la foto) y que lleva 5★ + etiqueta verde.

const CRS_BASICS = [
  ["Exposure2012", "Exposición"], ["Contrast2012", "Contraste"], ["Highlights2012", "Luces"],
  ["Shadows2012", "Sombras"], ["Whites2012", "Blancos"], ["Blacks2012", "Negros"],
  ["Temperature", "Temp."], ["Tint", "Tinte"], ["Texture", "Textura"], ["Clarity2012", "Claridad"],
  ["Dehaze", "Neblina"], ["Vibrance", "Vibración"], ["Saturation", "Saturación"],
];

// Atributos del "look" creativo del preset (curva, HSL, split toning, color grading, sharpening).
const LOOK_ATTRS = [
  "ToneCurvePV2012", "ToneCurveName2012", "HueAdjustmentRed", "SaturationAdjustmentRed",
  "LuminanceAdjustmentRed", "SplitToningHighlightHue", "SplitToningShadowHue",
  "ColorGradeMidtoneHue", "ColorGradeHighlightHue", "Sharpness", "MaskGroupBasedCorrections",
];

// Envoltura de preset-template: si aparece, Lightroom NO aplica los básicos a la foto (bug DNG).
const PRESET_WRAPPER = ["PresetType", "UUID", "ShowInPresets", "SupportsAmount"];

function attr(xmp, name) {
  const a = xmp.match(new RegExp('crs:' + name + '="([^"]*)"'));
  if (a) return a[1];
  const e = xmp.match(new RegExp('<crs:' + name + '>([^<]*)</crs:' + name + '>'));
  return e ? e[1] : null;
}
function present(xmp, name) {
  return new RegExp('crs:' + name + '[=>]').test(xmp);
}

export function verifyXmp(xmp) {
  if (!xmp || typeof xmp !== "string") return { ok: false, reason: "no-xmp" };

  const basics = CRS_BASICS
    .map(([key, label]) => ({ key, label, value: attr(xmp, key) }))
    .filter((b) => b.value !== null);
  const activeBasics = basics.filter((b) => parseFloat(b.value) !== 0);

  const hasBasics = basics.length > 0;
  const hasLook = LOOK_ATTRS.some((a) => present(xmp, a));
  const isPresetTemplate = PRESET_WRAPPER.some((a) => present(xmp, a));
  const rating = (xmp.match(/xmp:Rating="([^"]*)"/) || [])[1] || null;
  const label = (xmp.match(/xmp:Label="([^"]*)"/) || [])[1] || null;
  const hasSettings = /crs:HasSettings="True"/i.test(xmp);
  const whiteBalance = attr(xmp, "WhiteBalance");

  // Está bien SOLO si trae los básicos, HasSettings, y NO es un preset-template.
  const ok = hasBasics && hasSettings && !isPresetTemplate;

  return {
    ok,
    basics,
    activeCount: activeBasics.length,
    hasBasics,
    hasLook,
    isPresetTemplate,
    hasSettings,
    rating,
    label,
    // "Verde" (LrC español) es el valor escrito; se acepta "Green" por retrocompatibilidad.
    ratingOk: rating === "5" && (label === "Verde" || label === "Green"),
    whiteBalance,
  };
}

export { CRS_BASICS, LOOK_ATTRS, PRESET_WRAPPER };
