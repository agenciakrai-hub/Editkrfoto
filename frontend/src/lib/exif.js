// Lee la orientación EXIF (1..8) de los primeros bytes de un archivo RAW/JPEG y la aplica.
// Cubre JPEG (APP1), TIFF (CR2/NEF/ARW/DNG) y CR3 (bloque CMT1 EXIF) buscando la cabecera TIFF.
function u16(b, o, le) { return le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]; }
function u32(b, o, le) {
  return (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24))
             : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])) >>> 0;
}

function orientationFromTiff(b, base, le) {
  const ifdOff = u32(b, base + 4, le);
  const ifd = base + ifdOff;
  if (ifd + 2 > b.length || ifdOff < 8 || ifdOff > b.length) return 0;
  const count = u16(b, ifd, le);
  if (count > 512) return 0;
  for (let e = 0; e < count; e++) {
    const off = ifd + 2 + e * 12;
    if (off + 12 > b.length) break;
    if (u16(b, off, le) === 0x0112) {
      const v = u16(b, off + 8, le);
      return v >= 1 && v <= 8 ? v : 0;
    }
  }
  return 0;
}

export function readOrientation(bytes) {
  const n = Math.min(bytes.length, 512 * 1024);
  for (let i = 0; i < n - 8; i++) {
    const le = bytes[i] === 0x49 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0x2a && bytes[i + 3] === 0x00;
    const be = bytes[i] === 0x4d && bytes[i + 1] === 0x4d && bytes[i + 2] === 0x00 && bytes[i + 3] === 0x2a;
    if (!le && !be) continue;
    const o = orientationFromTiff(bytes, i, le);
    if (o) return o;
  }
  return 1;
}

// Dibuja un bitmap/canvas aplicando la orientación EXIF y devuelve un canvas "upright".
export function orientToCanvas(bmp, orientation) {
  const w = bmp.width, h = bmp.height;
  const swap = orientation >= 5 && orientation <= 8;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext("2d");
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
    default: break;
  }
  ctx.drawImage(bmp, 0, 0);
  return canvas;
}
