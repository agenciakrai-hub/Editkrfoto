import { computeAiBasics, NEUTRAL_AI_BASICS, AI_BASIC_KEYS } from "./basicEngine";

const pm = (o) => ({
  p1: 8, p5: 20, p50: 128, p95: 235, p99: 246, cP50: 128,
  lowClip: 0, highClip: 0, contrastIndex: 215, scene: "normal", ...o,
});

test("expone SIEMPRE los 13 parámetros", () => {
  const { aiBasicAdjustments } = computeAiBasics({ photometrics: pm({}), color: null });
  expect(Object.keys(aiBasicAdjustments).sort()).toEqual([...AI_BASIC_KEYS].sort());
});

test("foto oscura → sube exposición sin quemar (highlights no positivos)", () => {
  const { aiBasicAdjustments, exposureClassification } = computeAiBasics({ photometrics: pm({ cP50: 55, p50: 60, p99: 180 }) });
  expect(aiBasicAdjustments.exposure).toBeGreaterThan(0);
  expect(aiBasicAdjustments.highlights).toBeLessThanOrEqual(0);
  expect(exposureClassification).toBe("subexpuesta");
});

test("foto clara → baja exposición sin oscurecer artificialmente de más", () => {
  const { aiBasicAdjustments, exposureClassification } = computeAiBasics({ photometrics: pm({ cP50: 210, p50: 205, p99: 255, highClip: 0.02 }) });
  expect(aiBasicAdjustments.exposure).toBeLessThan(0);
  expect(exposureClassification).toBe("sobreexpuesta");
});

test("foto ya correcta → apenas se toca (todos ~0, WB As Shot)", () => {
  const { aiBasicAdjustments } = computeAiBasics({ photometrics: pm({}), color: { meanR: 128, meanG: 128, meanB: 128, skinRatio: 0 } });
  expect(aiBasicAdjustments.exposure).toBe(0);
  expect(aiBasicAdjustments.contrast).toBe(0);
  expect(aiBasicAdjustments.highlights).toBe(0);
  expect(aiBasicAdjustments.shadows).toBe(0);
  expect(aiBasicAdjustments.whites).toBe(0);
  expect(aiBasicAdjustments.blacks).toBe(0);
  expect(aiBasicAdjustments.temperature).toBeNull();
});

test("no levanta sombras automáticamente en foto correcta", () => {
  const { aiBasicAdjustments } = computeAiBasics({ photometrics: pm({}) });
  expect(aiBasicAdjustments.shadows).toBe(0);
});

test("valores DISTINTOS por foto (no un preset genérico)", () => {
  const a = computeAiBasics({ photometrics: pm({ cP50: 55 }) }).aiBasicAdjustments;
  const b = computeAiBasics({ photometrics: pm({ cP50: 210, highClip: 0.02 }) }).aiBasicAdjustments;
  expect(a.exposure).not.toBe(b.exposure);
});

test("sin fotometría → neutral (no inventa corrección)", () => {
  const { aiBasicAdjustments } = computeAiBasics({});
  expect(aiBasicAdjustments).toEqual(NEUTRAL_AI_BASICS);
});

test("presencia y color quedan a 0 salvo que se justifique (no HDR)", () => {
  const { aiBasicAdjustments } = computeAiBasics({ photometrics: pm({}), color: { meanR: 130, meanG: 128, meanB: 126, skinRatio: 0 } });
  expect(aiBasicAdjustments.texture).toBe(0);
  expect(aiBasicAdjustments.clarity).toBe(0);
  expect(aiBasicAdjustments.dehaze).toBe(0);
  expect(aiBasicAdjustments.saturation).toBe(0);
});

test("auditoría presente (reasoningSummary + confianzas)", () => {
  const r = computeAiBasics({ photometrics: pm({ cP50: 55 }), color: { meanR: 160, meanG: 120, meanB: 90, skinRatio: 0 } });
  expect(typeof r.reasoningSummary).toBe("string");
  expect(r.reasoningSummary.length).toBeGreaterThan(0);
  expect(r.editingConfidence).toBeGreaterThan(0);
  expect(r.exposureClassification).toBeTruthy();
});
