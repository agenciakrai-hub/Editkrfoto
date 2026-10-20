// Metadatos de captura (EXIF) para agrupar ráfagas: hora original (+subsegundos) e identidad de
// cámara (marca/modelo/nº de serie). Cubre TIFF (CR2/NEF/ARW/DNG), JPEG (APP1) y CR3 (CMT1/CMT2),
// recorriendo todas las cabeceras TIFF de los primeros KB. Puro → testeable.
const TAGS = { 0x010f: "make", 0x0110: "model", 0x9003: "dateTimeOriginal", 0x9291: "subSec", 0xa431: "serial", 0xc62f: "serial" };
const EXIF_IFD = 0x8769;
export const META_HEAD_BYTES = 512 * 1024;

function u16(b, o, le) { return le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]; }
function u32(b, o, le) {
  return (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24))
             : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])) >>> 0;
}

function ascii(b, base, off, le) {
  const n = u32(b, off + 4, le);
  if (u16(b, off + 2, le) !== 2 || n === 0 || n > 256) return null;
  const start = n <= 4 ? off + 8 : base + u32(b, off + 8, le);
  if (start + n > b.length) return null;
  let s = "";
  for (let i = start; i < start + n && b[i]; i++) s += String.fromCharCode(b[i]);
  return s.trim() || null;
}

function readIfd(b, base, ifdOff, le, out, depth) {
  const ifd = base + ifdOff;
  if (ifdOff < 8 || ifd + 2 > b.length) return;
  const count = u16(b, ifd, le);
  if (count === 0 || count > 512) return;
  for (let e = 0; e < count; e++) {
    const off = ifd + 2 + e * 12;
    if (off + 12 > b.length) break;
    const tag = u16(b, off, le);
    if (tag === EXIF_IFD && depth < 1) readIfd(b, base, u32(b, off + 8, le), le, out, depth + 1);
    const name = TAGS[tag];
    if (name && out[name] == null) out[name] = ascii(b, base, off, le);
  }
}

// "YYYY:MM:DD HH:MM:SS" (+ subsegundos) → ms (reloj local de la cámara, tratado como UTC).
export function parseExifDate(s, subSec) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || "");
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (!Number.isFinite(t) || +m[1] < 1990) return null;
  const frac = /^\d+$/.test(subSec || "") ? Number("0." + subSec) * 1000 : 0;
  return t + Math.round(frac);
}

export function readCaptureMeta(bytes) {
  const out = {};
  const n = Math.min(bytes.length, META_HEAD_BYTES);
  let headers = 0;
  for (let i = 0; i < n - 8 && headers < 8; i++) {
    const le = bytes[i] === 0x49 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0x2a && bytes[i + 3] === 0x00;
    const be = bytes[i] === 0x4d && bytes[i + 1] === 0x4d && bytes[i + 2] === 0x00 && bytes[i + 3] === 0x2a;
    if (!le && !be) continue;
    headers++;
    readIfd(bytes, i, u32(bytes, i + 4, le), le, out, 0);
    if (out.dateTimeOriginal && out.model && out.serial) break;
  }
  const camera = [out.make, out.model, out.serial].filter(Boolean).join(" ") || null;
  return { captureTime: parseExifDate(out.dateTimeOriginal, out.subSec), camera, hasSerial: !!out.serial };
}

export async function readCaptureMetaFromFile(file) {
  try {
    const head = new Uint8Array(await file.slice(0, Math.min(META_HEAD_BYTES, file.size)).arrayBuffer());
    return readCaptureMeta(head);
  } catch {
    return { captureTime: null, camera: null, hasSerial: false };
  }
}
