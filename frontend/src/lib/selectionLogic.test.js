import { groupAndSelect, hamming, autoToneFromHistogram, applyReviewFlags } from "./selectionLogic";

// Construye un histograma sintético: cuenta 'n' píxeles centrados en 'center' (con spread).
function histAround(center, n = 10000, spread = 8) {
  const h = new Array(256).fill(0);
  for (let k = 0; k < n; k++) {
    const v = Math.max(0, Math.min(255, Math.round(center + (Math.random() * 2 - 1) * spread)));
    h[v]++;
  }
  return { hist: h, total: n };
}

const M = (sharpness, exposure, hash) => ({ sharpness, exposure, hash });

test("hamming cuenta bits diferentes", () => {
  expect(hamming(0n, 0n)).toBe(0);
  expect(hamming(0n, 0b1111n)).toBe(4);
  expect(hamming(0b1010n, 0b0101n)).toBe(4);
});

test("agrupa por similitud (pHash) y separa escenas distintas", () => {
  const items = [
    { name: "a01.CR3", metrics: M(100, 0.9, 0n) },
    { name: "a02.CR3", metrics: M(90, 0.9, 0b1111n) },      // dist 4 -> misma
    { name: "a03.CR3", metrics: M(80, 0.9, 0b1111n) },      // dist 0 -> misma
    { name: "b01.CR3", metrics: M(70, 0.9, (2n ** 64n) - 1n) }, // muy distinta -> nueva
  ];
  const r = groupAndSelect(items);
  const bursts = new Set(r.map((x) => x.burstId));
  expect(bursts.size).toBe(2);
});

test("elige la MÁS nítida de la secuencia", () => {
  const items = [
    { name: "s1.CR3", metrics: M(100, 0.9, 0n) },
    { name: "s2.CR3", metrics: M(50, 0.9, 0b11n) },
    { name: "s3.CR3", metrics: M(20, 0.9, 0b101n) },
  ];
  const r = groupAndSelect(items);
  const best = r.find((x) => x.isBest);
  expect(best.name).toBe("s1.CR3");
  const selected = r.filter((x) => x.selectedForEdit).map((x) => x.name);
  expect(selected).toEqual(["s1.CR3"]); // las claramente peores no entran
});

test("si hay empate/ambigüedad selecciona más de una", () => {
  const items = [
    { name: "t1.CR3", metrics: M(100, 0.9, 0n) },
    { name: "t2.CR3", metrics: M(98, 0.9, 0b11n) }, // casi igual -> también entra
    { name: "t3.CR3", metrics: M(30, 0.9, 0b101n) },
  ];
  const r = groupAndSelect(items);
  const selected = r.filter((x) => x.selectedForEdit).map((x) => x.name).sort();
  expect(selected).toEqual(["t1.CR3", "t2.CR3"]);
});

test("una foto única (escena aislada) siempre se selecciona", () => {
  const items = [{ name: "u1.CR3", metrics: M(10, 0.3, 12345n) }];
  const r = groupAndSelect(items);
  expect(r[0].selectedForEdit).toBe(true);
});

test("sin métricas (extracción fallida) no se descarta la foto", () => {
  const items = [
    { name: "x1.CR3", metrics: null },
    { name: "x2.CR3", metrics: null },
  ];
  const r = groupAndSelect(items);
  expect(r.every((x) => x.selectedForEdit)).toBe(true);
});

test("auto-tono es POR FOTO (oscura sube exposición, clara la baja)", () => {
  const dark = histAround(60);
  const bright = histAround(190);
  const d = autoToneFromHistogram(dark.hist, dark.total);
  const b = autoToneFromHistogram(bright.hist, bright.total);
  expect(d.exposure).toBeGreaterThan(0);
  expect(b.exposure).toBeLessThan(0);
  expect(d.exposure).not.toBe(b.exposure);
});

test("auto-tono recupera altas luces cuando hay recorte", () => {
  const h = new Array(256).fill(0);
  for (let i = 100; i < 180; i++) h[i] = 50;
  h[255] = 3000; // fuerte recorte de blancos
  const total = h.reduce((a, x) => a + x, 0);
  const t = autoToneFromHistogram(h, total);
  expect(t.highlights).toBeLessThan(0);
});

test("auto-tono abre sombras cuando están empastadas", () => {
  const h = new Array(256).fill(0);
  for (let i = 60; i < 140; i++) h[i] = 50;
  h[0] = 3000; // sombras empastadas
  const total = h.reduce((a, x) => a + x, 0);
  const t = autoToneFromHistogram(h, total);
  expect(t.shadows).toBeGreaterThan(0);
});

test("auto-tono con datos vacíos no rompe", () => {
  expect(autoToneFromHistogram(null, 0)).toEqual({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 });
});

// ---------- agrupado por captura (hora/cámara/carpeta) ----------
const T0 = Date.UTC(2026, 5, 14, 17, 0, 0);
const shot = (name, t, hash, extra = {}) => ({
  name, relativePath: `Boda/${extra.folder || "Card1"}/${name}`,
  meta: { captureTime: t, camera: extra.camera || "Canon EOS R5 111" }, metrics: M(extra.sharp || 100, 0.9, hash),
});

test("orden por hora de captura aunque los nombres no sean secuenciales", () => {
  const r = groupAndSelect([shot("Z.CR3", T0 + 400, 0n), shot("A.CR3", T0, 0n), shot("M.CR3", T0 + 200, 0b1n)]);
  expect(r.map((x) => x.name)).toEqual(["A.CR3", "M.CR3", "Z.CR3"]);
  expect(new Set(r.map((x) => x.burstId)).size).toBe(1);
  expect(r.every((x) => !x.groupUncertain)).toBe(true);
  expect(r.map((x) => x.seq)).toEqual([0, 1, 2]);
});

test("pausa larga entre disparos separa aunque el hash sea idéntico", () => {
  const r = groupAndSelect([shot("1.CR3", T0, 0n), shot("2.CR3", T0 + 60000, 0n)]);
  expect(new Set(r.map((x) => x.burstId)).size).toBe(2);
});

test("dos cámaras (o carpetas) nunca se mezclan en una ráfaga", () => {
  const r = groupAndSelect([shot("1.CR3", T0, 0n), shot("2.CR3", T0 + 100, 0n, { camera: "Nikon Z9 222" }),
    shot("3.CR3", T0 + 200, 0n, { folder: "Card2" })]);
  expect(new Set(r.map((x) => x.burstId)).size).toBe(3);
});

test("no une tomas no contiguas: una foto distinta en medio corta la cadena", () => {
  const far = (2n ** 64n) - 1n;
  const r = groupAndSelect([shot("1.CR3", T0, 0n), shot("2.CR3", T0 + 300, far), shot("3.CR3", T0 + 600, 0n)]);
  expect(new Set(r.map((x) => x.burstId)).size).toBe(3);
});

test("falta de hash reinicia la cadena (antes saltaba la foto sin hash)", () => {
  const r = groupAndSelect([shot("1.CR3", T0, 0n), { ...shot("2.CR3", T0 + 100, 0n), metrics: null }, shot("3.CR3", T0 + 200, 0n)]);
  const ids = r.map((x) => x.burstId);
  expect(ids[0]).not.toBe(ids[2]);
  expect(new Set(ids).size).toBe(3);
});

test("sin hora de captura: grupos conservadores (umbral estricto) marcados para revisión", () => {
  const items = [
    { name: "a1.CR3", metrics: M(100, 0.9, 0n) },
    { name: "a2.CR3", metrics: M(90, 0.9, 0b111n) },          // dist 3 ≤ 5 → misma, dudosa
    { name: "a3.CR3", metrics: M(90, 0.9, 0b111111111n) },    // dist 6 > 5 → nueva (con hora sería la misma)
  ];
  const r = groupAndSelect(items);
  expect(r[0].burstId).toBe(r[1].burstId);
  expect(r[2].burstId).not.toBe(r[1].burstId);
  expect(r[0].groupUncertain && r[1].groupUncertain).toBe(true);
  expect(r[2].groupUncertain).toBeFalsy();
});

test("applyReviewFlags: agrupación dudosa y caras no disponibles → advertencia + motivo accionable", () => {
  const photos = [
    { id: "1", burstId: 1, selectedForEdit: true, groupUncertain: true },
    { id: "2", burstId: 1, selectedForEdit: false, groupUncertain: true },
    { id: "3", burstId: 2, selectedForEdit: true },
  ];
  applyReviewFlags(photos, { available: false, reason: "sin conexión para descargar los modelos" });
  expect(photos[0].warning).toBe(true);
  expect(photos[0].warningTypes).toEqual(["WARNING_GROUPING_UNCERTAIN", "WARNING_FACES_UNAVAILABLE"]);
  expect(photos[0].reviewNotes.join(" ")).toMatch(/sin conexión para descargar los modelos/);
  expect(photos[1].warning).toBeUndefined(); // no seleccionada: sin badge, pero conserva el motivo
  expect(photos[2].warningTypes).toEqual(["WARNING_FACES_UNAVAILABLE"]);
});

test("applyReviewFlags: fallo facial por foto marca solo esa foto; sin problemas no toca nada", () => {
  const photos = [{ id: "1", burstId: 1, selectedForEdit: true, faceError: "x" }, { id: "2", burstId: 2, selectedForEdit: true }];
  applyReviewFlags(photos, { available: true });
  expect(photos[0].warningTypes).toEqual(["WARNING_FACES_UNAVAILABLE"]);
  expect(photos[1].warning).toBeUndefined();
});
