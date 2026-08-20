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
   crs:ToneCurveName2012="Custom" crs:SplitToningHighlightHue="45"
   crs:WhiteBalance="As Shot"
   xmp:Rating="5" xmp:Label="Green">
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
