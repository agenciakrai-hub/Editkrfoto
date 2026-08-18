// Inserta un paquete XMP (ajustes de revelado + rating/label) DENTRO de un archivo DNG (TIFF).
// Lightroom Classic ignora los sidecar .xmp para DNG: los ajustes deben ir en el propio DNG.
// Estrategia segura: NO se reescribe en el sitio; se AÑADE el XMP al final del archivo y se
// re-apunta la etiqueta TIFF 700 (XMLPacket) de la IFD0 a esa nueva posición.

const TAG_XMP = 0x02bc; // 700

function tiffReader(b) {
  const le = b[0] === 0x49 && b[1] === 0x49;
  const be = b[0] === 0x4d && b[1] === 0x4d;
  if (!le && !be) return null;
  const magic = le ? b[2] | (b[3] << 8) : (b[2] << 8) | b[3];
  if (magic !== 0x2a) return null;
  const u16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24))
                         : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])) >>> 0;
  return { le, u16, u32 };
}

// Envuelve el XMP como xpacket (formato que espera Adobe dentro del TIFF/DNG).
export function wrapXpacket(xmpBody) {
  const head = '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n';
  const tail = '\n<?xpacket end="w"?>';
  const pad = "\n" + " ".repeat(2048); // relleno recomendado para futuras ediciones
  return head + xmpBody.trim() + tail + pad;
}

// Devuelve { ok, bytes, reason }. bytes = Uint8Array del DNG con el XMP embebido.
export function embedXmpInDng(input, xmpBody) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const r = tiffReader(b);
  if (!r) return { ok: false, reason: "no-tiff" };
  const ifd0 = r.u32(4);
  if (ifd0 + 2 > b.length) return { ok: false, reason: "bad-ifd" };
  const count = r.u16(ifd0);
  let entry = -1;
  for (let i = 0; i < count; i++) {
    const off = ifd0 + 2 + i * 12;
    if (off + 12 > b.length) break;
    if (r.u16(off) === TAG_XMP) { entry = off; break; }
  }
  if (entry < 0) return { ok: false, reason: "no-xmp-tag" }; // DNG sin etiqueta 700 (raro)

  const enc = new TextEncoder();
  const xmpBytes = enc.encode(wrapXpacket(xmpBody));
  let appendAt = b.length + (b.length % 2); // alinear a par
  const out = new Uint8Array(appendAt + xmpBytes.length);
  out.set(b, 0);
  out.set(xmpBytes, appendAt);

  // Parchear la entrada 700: type=1 (BYTE), count=len, valueOffset=appendAt
  const w16 = (o, v) => { if (r.le) { out[o] = v & 0xff; out[o + 1] = (v >> 8) & 0xff; } else { out[o] = (v >> 8) & 0xff; out[o + 1] = v & 0xff; } };
  const w32 = (o, v) => {
    if (r.le) { out[o] = v & 0xff; out[o + 1] = (v >> 8) & 0xff; out[o + 2] = (v >> 16) & 0xff; out[o + 3] = (v >> 24) & 0xff; }
    else { out[o] = (v >> 24) & 0xff; out[o + 1] = (v >> 16) & 0xff; out[o + 2] = (v >> 8) & 0xff; out[o + 3] = v & 0xff; }
  };
  w16(entry + 2, 1);                 // type BYTE
  w32(entry + 4, xmpBytes.length);   // count
  w32(entry + 8, appendAt);          // offset al nuevo XMP
  return { ok: true, bytes: out };
}
