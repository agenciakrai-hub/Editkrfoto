import { extractPreview } from "@/lib/rawThumb";
import { orientToCanvas } from "@/lib/exif";

// Devuelve un canvas RECTO (aplica orientación EXIF) de la vista previa incrustada del RAW/JPG.
export async function orientedCanvasFromFile(file, maxW = 1400) {
  const { blob, orientation } = await extractPreview(file);
  if (!blob) return null;
  const bmp = await createImageBitmap(blob, { imageOrientation: "none" });
  let canvas;
  if (orientation && orientation !== 1) {
    canvas = orientToCanvas(bmp, orientation);
  } else {
    canvas = document.createElement("canvas");
    canvas.width = bmp.width; canvas.height = bmp.height;
    canvas.getContext("2d").drawImage(bmp, 0, 0);
  }
  if (bmp.close) bmp.close();
  const scale = Math.min(1, maxW / canvas.width);
  if (scale < 1) {
    const out = document.createElement("canvas");
    out.width = Math.round(canvas.width * scale);
    out.height = Math.round(canvas.height * scale);
    out.getContext("2d").drawImage(canvas, 0, 0, out.width, out.height);
    return out;
  }
  return canvas;
}

// Recorte "cover": recorta el centro del canvas al ratio objetivo (rellena el hueco sin deformar).
export function coverCrop(src, targetAspect) {
  const sa = src.width / src.height;
  let sx = 0, sy = 0, sw = src.width, sh = src.height;
  if (sa > targetAspect) { sw = Math.round(src.height * targetAspect); sx = Math.round((src.width - sw) / 2); }
  else { sh = Math.round(src.width / targetAspect); sy = Math.round((src.height - sh) / 2); }
  const out = document.createElement("canvas");
  out.width = sw; out.height = sh;
  out.getContext("2d").drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

// Prepara las fotos: miniatura recta (object URL) + aspecto real. Ligero para cientos de fotos.
export async function preparePhotos(files, onProgress) {
  const out = [];
  let done = 0;
  for (const file of files) {
    try {
      const canvas = await orientedCanvasFromFile(file, 640);
      if (canvas) {
        const aspect = canvas.width / canvas.height;
        const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
        out.push({ name: file.name, file, url: URL.createObjectURL(blob), aspect });
      }
    } catch { /* omite fotos ilegibles */ }
    done++;
    onProgress?.(done);
  }
  return out;
}

// Miniatura base64 (para enviar a la IA de orden narrativo).
export async function thumbBase64FromFile(file, maxW = 320) {
  const canvas = await orientedCanvasFromFile(file, maxW);
  if (!canvas) return null;
  return canvas.toDataURL("image/jpeg", 0.7).replace(/^data:image\/jpeg;base64,/, "");
}
