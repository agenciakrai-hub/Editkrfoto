// Extrae la previsualización JPEG incrustada dentro de un archivo RAW (CR2, NEF, ARW, DNG…).
// Casi todos los RAW llevan uno o más JPEG embebidos (SOI 0xFFD8 … EOI 0xFFD9).
// Elegimos el JPEG más grande como miniatura. Para JPG/JPEG usamos el archivo directamente.
import { extOf } from "@/lib/rawSelection";

function findLargestJpeg(bytes) {
  let best = null;
  let i = 0;
  const n = bytes.length;
  while (i < n - 3) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      let j = i + 2;
      let end = -1;
      while (j < n - 1) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) { end = j + 2; break; }
        j++;
      }
      if (end === -1) break;
      const len = end - i;
      if (!best || len > best.len) best = { start: i, end, len };
      i = end;
    } else {
      i++;
    }
  }
  return best;
}

export async function extractThumb(file) {
  if (!file) return null;
  const ext = extOf(file.name);
  if (ext === "jpg" || ext === "jpeg") return URL.createObjectURL(file);
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const found = findLargestJpeg(bytes);
    if (!found || found.len < 1024) return null;
    const blob = new Blob([bytes.slice(found.start, found.end)], { type: "image/jpeg" });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
