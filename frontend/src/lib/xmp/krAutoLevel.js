// KR Auto Nivelado — nivelado base técnico de sidecars XMP.
// Aplica desplazamientos FIJOS a 5 parámetros técnicos sobre el valor existente del XMP.
// No es el "Auto" de Lightroom: no analiza píxeles ni toca estilo, WB, curvas, HSL,
// calibración ni máscaras. Preserva íntegro el resto del archivo y el nombre original.

export const LEVEL_RULES = [
  { attr: "Exposure2012", label: "Exposición", delta: 0.10, min: -5, max: 5, dec: 2 },
  { attr: "Highlights2012", label: "Luces", delta: -15, min: -100, max: 100, dec: 0 },
  { attr: "Shadows2012", label: "Sombras", delta: 15, min: -100, max: 100, dec: 0 },
  { attr: "Whites2012", label: "Blancos", delta: 5, min: -100, max: 100, dec: 0 },
  { attr: "Blacks2012", label: "Negros", delta: -5, min: -100, max: 100, dec: 0 },
];

function fmtVal(v, dec) {
  if (dec > 0) {
    const s = v.toFixed(dec);
    return v > 0 ? `+${s}` : s; // exposición: +0.10 / -0.30 / 0.00
  }
  const r = Math.round(v);
  return r > 0 ? `+${r}` : `${r}`; // enteros: +15 / -15 / 0
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function injectAttr(xmp, attr, value) {
  const idx = xmp.search(/<rdf:Description\b/);
  if (idx === -1) return xmp;
  const end = xmp.indexOf(">", idx);
  if (end === -1) return xmp;
  let insertAt = end;
  if (xmp[end - 1] === "/") insertAt = end - 1; // etiqueta auto-cerrada
  const insertion = `\n   crs:${attr}="${value}"`;
  return xmp.slice(0, insertAt) + insertion + xmp.slice(insertAt);
}

// Devuelve { text, changes }. `changes` lista los 5 parámetros con su valor original y nivelado.
export function levelXmp(text) {
  let out = text;
  const changes = [];
  for (const rule of LEVEL_RULES) {
    const attrRe = new RegExp(`(crs:${rule.attr}=")([+-]?[0-9]*\\.?[0-9]+)(")`);
    const elRe = new RegExp(`(<crs:${rule.attr}>)([+-]?[0-9]*\\.?[0-9]+)(</crs:${rule.attr}>)`);
    const am = out.match(attrRe);
    const em = am ? null : out.match(elRe);
    const m = am || em;
    const base = m ? parseFloat(m[2]) : 0;
    const leveled = clamp(base + rule.delta, rule.min, rule.max);
    const newStr = fmtVal(leveled, rule.dec);
    if (am) out = out.replace(attrRe, `$1${newStr}$3`);
    else if (em) out = out.replace(elRe, `$1${newStr}$3`);
    else out = injectAttr(out, rule.attr, newStr);
    changes.push({ label: rule.label, attr: rule.attr, original: m ? fmtVal(base, rule.dec) : "0", leveled: newStr, existed: !!m });
  }
  return { text: out, changes };
}
