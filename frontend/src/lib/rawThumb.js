// Extrae la previsualización JPEG incrustada dentro de un archivo RAW (CR2, NEF, ARW, DNG…).
// Casi todos los RAW llevan uno o más JPEG embebidos (SOI 0xFFD8 … EOI 0xFFD9).
// Elegimos el JPEG más grande como miniatura. Para JPG/JPEG usamos el archivo directamente.
import { extOf } from "@/lib/rawSelection";
import { readOrientation, orientToCanvas } from "@/lib/exif";

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
  const { blob, orientation } = await extractPreview(file);
  if (!blob) return null;
  if (!orientation || orientation === 1) return URL.createObjectURL(blob);
  // Auto-rotar según EXIF (verticales de DNG/CR3 vienen de lado): decodifica sin auto-orientar y rota.
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: "none" });
    const canvas = orientToCanvas(bmp, orientation);
    if (bmp.close) bmp.close();
    const out = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    return URL.createObjectURL(out || blob);
  } catch {
    return URL.createObjectURL(blob);
  }
}

// Lee SOLO los primeros MB del RAW (file.slice) para extraer la miniatura/preview JPEG incrustada.
// Evita cargar archivos de 30-60MB en memoria: clave para manejar miles de fotos.
const HEAD_BYTES = 4 * 1024 * 1024;

async function readHead(file, len) {
  const slice = file.slice(0, Math.min(len, file.size));
  return new Uint8Array(await slice.arrayBuffer());
}

// Devuelve { blob, orientation } de la vista previa incrustada del RAW (o el propio JPG).
export async function extractPreview(file) {
  if (!file) return { blob: null, orientation: 1 };
  const ext = extOf(file.name);
  if (ext === "jpg" || ext === "jpeg") {
    const head = await readHead(file, 128 * 1024);
    return { blob: file, orientation: readOrientation(head) };
  }
  try {
    let bytes = await readHead(file, HEAD_BYTES);
    let found = findLargestJpeg(bytes);
    if ((!found || found.len < 2048) && file.size > HEAD_BYTES) {
      bytes = new Uint8Array(await file.arrayBuffer());
      found = findLargestJpeg(bytes);
    }
    if (!found || found.len < 1024) return { blob: null, orientation: 1 };
    const orientation = readOrientation(bytes);
    return { blob: new Blob([bytes.slice(found.start, found.end)], { type: "image/jpeg" }), orientation };
  } catch {
    return { blob: null, orientation: 1 };
  }
}

// Compat: devuelve solo el blob (sin orientación).
export async function extractPreviewBlob(file) {
  return (await extractPreview(file)).blob;
}
