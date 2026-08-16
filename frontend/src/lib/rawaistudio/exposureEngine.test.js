import { computeBasic, PRECISION_PROFILES } from "./exposureEngine";
import { computePhotometrics, classifyScene } from "./photometricAnalysis";

// Construye un histograma determinista a partir de pares [valor, cuenta].
function buildHist(pairs) {
  const h = new Array(256).fill(0);
  let total = 0;
  for (const [v, n] of pairs) { h[Math.max(0, Math.min(255, v))] += n; total += n; }
  return { hist: h, total };
}

function pm(globalPairs, centerPairs) {
  const g = buildHist(globalPairs);
  const c = centerPairs ? buildHist(centerPairs) : null;
  return computePhotometrics({
    histGlobal: g.hist, totalGlobal: g.total,
    histCenter: c ? c.hist : undefined, totalCenter: c ? c.total : undefined,
  });
}

test("foto oscura → sube exposición dentro del tope del modo", () => {
  const p = pm([[40, 10000]]);
  const b = computeBasic(p, "balanced");
  expect(b.exposure).toBeGreaterThan(0);
  expect(b.exposure).toBeLessThanOrEqual(PRECISION_PROFILES.balanced.expMax);
});

test("foto clara → baja exposición", () => {
  const b = computeBasic(pm([[210, 10000]]), "balanced");
  expect(b.exposure).toBeLessThan(0);
});

test("los modos de precisión aplican topes reales (agresivo > conservador)", () => {
  const p = pm([[40, 10000]]);
  const cons = computeBasic(p, "conservative").exposure;
  const aggr = computeBasic(p, "aggressive").exposure;
  expect(cons).toBeLessThanOrEqual(PRECISION_PROFILES.conservative.expMax);
  expect(aggr).toBeGreaterThan(cons);
  expect(aggr).toBeLessThanOrEqual(PRECISION_PROFILES.aggressive.expMax);
});

test("detecta CONTRALUZ (sujeto oscuro, fondo claro) y abre sombras", () => {
  const global = [[90, 2000], [130, 3000], [200, 2000], [250, 1500], [255, 800]];
  const center = [[28, 4000]];
  const p = pm(global, center);
  expect(p.scene).toBe("backlit");
  const b = computeBasic(p, "balanced");
  expect(b.shadows).toBeGreaterThan(20);
});

test("detecta CLAVE ALTA y no sobreexpone (protege luces)", () => {
  const p = pm([[200, 3000], [230, 4000], [250, 3000]]);
  expect(p.scene).toBe("high_key");
  const b = computeBasic(p, "balanced");
  expect(b.exposure).toBeLessThanOrEqual(PRECISION_PROFILES.balanced.expMax * 0.25);
  expect(b.highlights).toBeLessThanOrEqual(0);
});

test("detecta CLAVE BAJA y mantiene el ambiente (sombras no se disparan)", () => {
  const p = pm([[10, 4000], [40, 3000], [60, 2000]]);
  expect(p.scene).toBe("low_key");
  const b = computeBasic(p, "balanced");
  expect(b.shadows).toBeGreaterThanOrEqual(0);
});

test("clasificación de escena expuesta y estable", () => {
  expect(classifyScene({ p5: 200, p50: 235, p95: 250, cP50: 235, highClip: 0.0, lowClip: 0 })).toBe("high_key");
  expect(classifyScene({ p5: 200, p50: 120, p95: 250, cP50: 30, highClip: 0.05, lowClip: 0 })).toBe("backlit");
});

test("datos degenerados no rompen el motor", () => {
  const b = computeBasic(pm([[0, 1]]), "balanced");
  expect(b).toHaveProperty("exposure");
  expect(b).toHaveProperty("shadows");
});
