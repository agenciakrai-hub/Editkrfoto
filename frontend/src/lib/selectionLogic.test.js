import { groupAndSelect, hamming, autoToneFromHistogram } from "./selectionLogic";

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
