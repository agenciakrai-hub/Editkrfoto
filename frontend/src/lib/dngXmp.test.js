import { TextEncoder, TextDecoder } from "util";
if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;
import { embedXmpInDng, wrapXpacket } from "./dngXmp";

// Construye un TIFF/DNG mínimo little-endian con IFD0 que contiene la etiqueta 700 (XMP) apuntando
// a un XMP viejo, para comprobar que embedXmpInDng lo reemplaza correctamente.
function makeDng() {
  const oldXmp = new TextEncoder().encode("<x:xmpmeta>OLD</x:xmpmeta>");
  const headerAndIfd = 8 + 2 + 12 + 4; // header + count + 1 entry + next-ifd
  const xmpOffset = headerAndIfd;
  const total = xmpOffset + oldXmp.length;
  const b = new Uint8Array(total);
  b[0] = 0x49; b[1] = 0x49; b[2] = 0x2a; b[3] = 0x00; // II*\0
  // IFD0 offset = 8
  b[4] = 8; b[5] = 0; b[6] = 0; b[7] = 0;
  // count = 1
  b[8] = 1; b[9] = 0;
  const e = 10;
  b[e] = 0xbc; b[e + 1] = 0x02;         // tag 700 (LE)
  b[e + 2] = 1; b[e + 3] = 0;           // type BYTE
  b[e + 4] = oldXmp.length; b[e + 5] = 0; b[e + 6] = 0; b[e + 7] = 0; // count
  b[e + 8] = xmpOffset; b[e + 9] = 0; b[e + 10] = 0; b[e + 11] = 0;   // offset
  // next IFD = 0 at e+12..e+15 (already zero)
  b.set(oldXmp, xmpOffset);
  return b;
}

function readTag700(bytes) {
  const b = bytes;
  const ifd = b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24);
  const count = b[ifd] | (b[ifd + 1] << 8);
  for (let i = 0; i < count; i++) {
    const off = ifd + 2 + i * 12;
    const tag = b[off] | (b[off + 1] << 8);
    if (tag === 0x02bc) {
      const len = (b[off + 4] | (b[off + 5] << 8) | (b[off + 6] << 16) | (b[off + 7] << 24)) >>> 0;
      const ptr = (b[off + 8] | (b[off + 9] << 8) | (b[off + 10] << 16) | (b[off + 11] << 24)) >>> 0;
      return new TextDecoder().decode(b.slice(ptr, ptr + len));
    }
  }
  return null;
}

test("wrapXpacket envuelve el XMP con cabecera y cola xpacket", () => {
  const w = wrapXpacket("<x:xmpmeta>BODY</x:xmpmeta>");
  expect(w).toContain("<?xpacket begin=");
  expect(w).toContain("<x:xmpmeta>BODY</x:xmpmeta>");
  expect(w).toContain('<?xpacket end="w"?>');
});

test("embedXmpInDng reemplaza el XMP dentro del DNG (etiqueta 700 apunta al nuevo)", () => {
  const dng = makeDng();
  const body = '<x:xmpmeta><rdf:Description crs:Exposure2012="0.30" xmp:Rating="5" xmp:Label="Green"/></x:xmpmeta>';
  const res = embedXmpInDng(dng, body);
  expect(res.ok).toBe(true);
  const embedded = readTag700(res.bytes);
  expect(embedded).toContain("crs:Exposure2012");
  expect(embedded).toContain('xmp:Rating="5"');
  expect(embedded).toContain('xmp:Label="Green"');
  expect(embedded).not.toContain("OLD"); // ya no apunta al viejo
});

test("embedXmpInDng falla limpio si no es TIFF/DNG", () => {
  expect(embedXmpInDng(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), "<x/>").ok).toBe(false);
});
