// Aproximación VISUAL (no revelado real) del resultado, a partir de los 13 básicos del XMP.
// Traduce los ajustes a un filtro CSS para una previsualización orientativa Antes/Después.
// No sustituye a Lightroom: es una guía rápida dentro de la app.

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// basics: array [{ key, value }] tal como lo devuelve verifyXmp.
export function basicsToMap(basics) {
  const m = {};
  (basics || []).forEach((b) => { m[b.key] = parseFloat(b.value) || 0; });
  return m;
}

export function cssFilterParts(basics) {
  const m = basicsToMap(basics);
  const exp = m.Exposure2012 || 0;        // EV
  const contrast = m.Contrast2012 || 0;   // -100..100
  const highlights = m.Highlights2012 || 0;
  const shadows = m.Shadows2012 || 0;
  const whites = m.Whites2012 || 0;
  const blacks = m.Blacks2012 || 0;
  const temp = m.Temperature || 0;        // Kelvin absoluto (0 = As Shot)
  const vibrance = m.Vibrance || 0;
  const saturation = m.Saturation || 0;
  const dehaze = m.Dehaze || 0;
  const clarity = m.Clarity2012 || 0;

  const brightness = clamp(1 + exp * 0.25 + shadows * 0.0010 + whites * 0.0010 + highlights * 0.0005 + blacks * 0.0008, 0.4, 1.8);
  const contrastF = clamp(1 + (contrast + dehaze * 0.5 + clarity * 0.4) / 200, 0.5, 1.8);
  const saturate = clamp(1 + (vibrance + saturation) / 160, 0.2, 2);

  const tempDelta = temp ? temp - 5500 : 0;                    // >0 render más cálido · <0 más frío
  const sepia = clamp(tempDelta > 0 ? tempDelta / 3000 : 0, 0, 0.35);
  const hueRotate = clamp(tempDelta < 0 ? -tempDelta / 200 : 0, 0, 20); // enfriar → leve giro a azul

  return { brightness, contrast: contrastF, saturate, sepia, hueRotate };
}

export function cssFilterFromBasics(basics) {
  const p = cssFilterParts(basics);
  return `brightness(${p.brightness.toFixed(3)}) contrast(${p.contrast.toFixed(3)}) saturate(${p.saturate.toFixed(3)}) sepia(${p.sepia.toFixed(3)}) hue-rotate(${p.hueRotate.toFixed(1)}deg)`;
}
