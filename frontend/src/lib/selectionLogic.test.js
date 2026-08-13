import { groupAndSelect, hamming, autoBasicFromMetrics } from "./selectionLogic";

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

test("corrección básica es POR FOTO (foto oscura sube exposición, clara la baja)", () => {
  const dark = autoBasicFromMetrics({ luma: 60, shadowClip: 0.01, highClip: 0 });
  const bright = autoBasicFromMetrics({ luma: 190, shadowClip: 0, highClip: 0.01 });
  expect(dark.exposure).toBeGreaterThan(0);   // subexpuesta -> +EV
  expect(bright.exposure).toBeLessThan(0);    // sobreexpuesta -> -EV
  expect(dark.exposure).not.toBe(bright.exposure); // cada foto distinta
});

test("recorte de altas luces baja blancos y comprime altas luces", () => {
  const clipped = autoBasicFromMetrics({ luma: 150, shadowClip: 0, highClip: 0.1 });
  expect(clipped.whites).toBeLessThanOrEqual(0);
  expect(clipped.highlights).toBeLessThan(-15);
});

test("dos fotos con luma distinta dan exposición distinta", () => {
  const a = autoBasicFromMetrics({ luma: 90 });
  const b = autoBasicFromMetrics({ luma: 140 });
  expect(a.exposure).not.toBe(b.exposure);
});
