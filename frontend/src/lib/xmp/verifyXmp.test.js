import { verifyXmp } from "./verifyXmp";
import { embedXmpInDng, readXmpFromDng } from "../dngXmp";
import { TextEncoder, TextDecoder } from "util";

if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;

const APPLIED = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"
   xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:HasSettings="True"
   crs:Exposure2012="+0.35" crs:Contrast2012="6" crs:Highlights2012="-35"
   crs:Shadows2012="0" crs:Whites2012="-6" crs:Blacks2012="-13"
   crs:Vibrance="0" crs:Saturation="0" crs:Dehaze="0"
   crs:Texture="0" crs:Clarity2012="0"
   crs:ToneCurveName2012="Custom" crs:SplitToningHighlightHue="45"
   crs:WhiteBalance="As Shot"
   xmp:Rating="5" xmp:Label="Verde">
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;

const PRESET_TEMPLATE = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:PresetType="Normal" crs:UUID="ABC" crs:ShowInPresets="True"
   crs:HasSettings="True" crs:Exposure2012="0.00" crs:ToneCurveName2012="Custom">
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;

describe("verifyXmp", () => {
  test("detecta ajustes aplicados: básicas + look + no-template + 5★/verde", () => {
    const v = verifyXmp(APPLIED);
    expect(v.ok).toBe(true);
    expect(v.hasBasics).toBe(true);
    expect(v.activeCount).toBeGreaterThan(0); // Exposure/Contrast/Highlights/Whites/Blacks ≠ 0
    expect(v.hasLook).toBe(true);
    expect(v.isPresetTemplate).toBe(false);
    expect(v.ratingOk).toBe(true);
  });

  test("marca preset-template como NO aplicado (bug DNG)", () => {
    const v = verifyXmp(PRESET_TEMPLATE);
    expect(v.isPresetTemplate).toBe(true);
    expect(v.ok).toBe(false);
  });

  test("xmp vacío/ausente → ok:false", () => {
    expect(verifyXmp(null).ok).toBe(false);
    expect(verifyXmp("").ok).toBe(false);
  });

  test("XMP con crs:Look de PERFIL (UUID + SupportsAmount) NO es preset-template", () => {
    const withLook = APPLIED.replace(
      "</rdf:Description>",
      `<crs:Look>
        <rdf:Description crs:Name="Adobe Landscape" crs:Amount="1"
         crs:UUID="6F9C877E84273F4E8271E6B91BEB36A1"
         crs:SupportsAmount="false" crs:SupportsMonochrome="false"
         crs:SupportsOutputReferred="false" crs:Stubbed="true"/>
       </crs:Look></rdf:Description>`
    );
    const v = verifyXmp(withLook);
    expect(v.isPresetTemplate).toBe(false); // el Look del perfil NO debe marcarse como wrapper
    expect(v.ok).toBe(true);
  });
});

describe("verifyXmp estricto (13 básicos, rangos, metadatos, errores por foto)", () => {
  const set = (xmp, attr, value) => xmp.replace(new RegExp(`crs:${attr}="[^"]*"`), `crs:${attr}="${value}"`);
  const drop = (xmp, attr) => xmp.replace(new RegExp(`\\s*crs:${attr}="[^"]*"`), "");

  test("As Shot sin Temperature/Tint es válido; Custom sin ellos no", () => {
    expect(verifyXmp(APPLIED).errors).toEqual([]);
    const custom = set(APPLIED, "WhiteBalance", "Custom");
    const v = verifyXmp(custom);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/Falta Temp/);
  });

  test("falta un básico → error con su nombre", () => {
    const v = verifyXmp(drop(APPLIED, "Texture"));
    expect(v.ok).toBe(false);
    expect(v.hasBasics).toBe(false);
    expect(v.errors).toContain("Falta Textura");
  });

  test.each([["Exposure2012", "NaN"], ["Exposure2012", "Infinity"], ["Contrast2012", "abc"], ["Contrast2012", ""]])(
    "%s=%s no finito → error", (k, val) => {
      const v = verifyXmp(set(APPLIED, k, val));
      expect(v.ok).toBe(false);
      expect(v.errors.some((e) => /no es un número/.test(e))).toBe(true);
    });

  test("fuera de rango → error", () => {
    expect(verifyXmp(set(APPLIED, "Exposure2012", "+7.00")).errors.join()).toMatch(/fuera de rango/);
    expect(verifyXmp(set(APPLIED, "Highlights2012", "-140")).errors.join()).toMatch(/fuera de rango/);
    const wb = set(set(APPLIED, "WhiteBalance", "Custom"), "Dehaze", "0").replace('crs:Dehaze="0"', 'crs:Dehaze="0" crs:Temperature="900" crs:Tint="0"');
    expect(verifyXmp(wb).errors.join()).toMatch(/Temp\. fuera de rango/);
  });

  test("básico duplicado (preset + IA) → error", () => {
    const dup = APPLIED.replace('crs:Dehaze="0"', 'crs:Dehaze="0" crs:Contrast2012="40"');
    expect(verifyXmp(dup).errors.join()).toMatch(/Contraste aparece 2 veces/);
  });

  test("exige HasSettings, 5★ y etiqueta Verde/Green", () => {
    expect(verifyXmp(drop(APPLIED, "HasSettings")).errors.join()).toMatch(/HasSettings/);
    expect(verifyXmp(APPLIED.replace('xmp:Rating="5"', 'xmp:Rating="3"')).errors.join()).toMatch(/5★/);
    expect(verifyXmp(APPLIED.replace('xmp:Label="Verde"', 'xmp:Label="Rojo"')).errors.join()).toMatch(/Verde/);
    expect(verifyXmp(APPLIED.replace('xmp:Label="Verde"', 'xmp:Label="Green"')).ok).toBe(true);
  });

  test("forma de elemento <crs:X>v</crs:X> sigue siendo compatible", () => {
    const el = drop(APPLIED, "Clarity2012").replace("</rdf:Description>", "<crs:Clarity2012>5</crs:Clarity2012></rdf:Description>");
    expect(verifyXmp(el).ok).toBe(true);
  });
});

describe("readXmpFromDng round-trip", () => {
  function tinyDng() {
    const oldXmp = new TextEncoder().encode("<x:xmpmeta>OLD</x:xmpmeta>");
    const ifd0 = 8, entries = 1, dataStart = ifd0 + 2 + entries * 12 + 4;
    const b = new Uint8Array(dataStart + oldXmp.length);
    b[0] = 0x49; b[1] = 0x49; b[2] = 0x2a; b[3] = 0x00;
    const w32 = (o, v) => { b[o] = v & 0xff; b[o + 1] = (v >> 8) & 0xff; b[o + 2] = (v >> 16) & 0xff; b[o + 3] = (v >> 24) & 0xff; };
    const w16 = (o, v) => { b[o] = v & 0xff; b[o + 1] = (v >> 8) & 0xff; };
    w32(4, ifd0); w16(ifd0, entries);
    const e = ifd0 + 2;
    w16(e, 0x02bc); w16(e + 2, 1); w32(e + 4, oldXmp.length); w32(e + 8, dataStart);
    w32(ifd0 + 2 + 12, 0);
    b.set(oldXmp, dataStart);
    return b;
  }

  test("lo incrustado se puede leer y verificar", () => {
    const emb = embedXmpInDng(tinyDng(), APPLIED);
    expect(emb.ok).toBe(true);
    const back = readXmpFromDng(emb.bytes);
    expect(back).toContain('crs:Highlights2012="-35"');
    const v = verifyXmp(back);
    expect(v.ok).toBe(true);
    expect(v.isPresetTemplate).toBe(false);
    expect(v.hasBasics).toBe(true);
  });
});
