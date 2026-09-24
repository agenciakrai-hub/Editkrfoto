import { jsPDF } from "jspdf";
import { orientedCanvasFromFile, coverCrop } from "./albumImage";

// Exporta los spreads a un PDF de páginas dobles (relación 2:1). Cada slot se rellena con recorte cover.
export async function exportAlbumPdf(spreads, opts = {}) {
  const onProgress = opts.onProgress;
  const bg = opts.bg || "#ffffff";
  const W = 1400, H = 700; // puntos por spread (2:1)
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [W, H], compress: true });

  // Cachea el canvas recto de cada foto (una foto puede repetirse entre spreads).
  const cache = new Map();
  const getCanvas = async (photo) => {
    if (cache.has(photo.name)) return cache.get(photo.name);
    const c = await orientedCanvasFromFile(photo.file, 1400);
    cache.set(photo.name, c);
    return c;
  };

  for (let i = 0; i < spreads.length; i++) {
    if (i > 0) doc.addPage([W, H], "landscape");
    doc.setFillColor(bg);
    doc.rect(0, 0, W, H, "F");
    const spread = spreads[i];
    for (const slot of spread.slots) {
      const x = slot.x * W, y = slot.y * H, w = slot.w * W, h = slot.h * H;
      try {
        const src = await getCanvas(slot.photo);
        if (!src) continue;
        const cropped = coverCrop(src, w / h);
        const data = cropped.toDataURL("image/jpeg", 0.9);
        doc.addImage(data, "JPEG", x, y, w, h, undefined, "FAST");
      } catch { /* omite slot ilegible */ }
    }
    onProgress?.(i + 1, spreads.length);
  }
  cache.clear();
  const name = (opts.filename || "Album_RAWAI").replace(/\s+/g, "_");
  doc.save(`${name}.pdf`);
}
