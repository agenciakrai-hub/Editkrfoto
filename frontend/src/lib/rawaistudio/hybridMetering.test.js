// A1 — Tests de metering híbrido con caras (12 escenarios de boda).
// Comprueba: meter anterior (cP50) vs híbrido, Exposure antes/después, y las protecciones.
import { computeAiBasics } from "./basicEngine";
import { computeMeter } from "./hybridMetering";

const pm = (o) => ({ p1: 8, p5: 20, p50: 128, p95: 235, p99: 246, cP50: 128, lowClip: 0, highClip: 0, contrastIndex: 215, scene: "normal", ...o });
const face = (o = {}) => ({ cx: 0.5, cy: 0.45, area: 0.07, faceSharpness: 0.7, score: 0.95, luma: 130, pose: { roll: 0, yaw: 0 }, ...o });
const run = (photometrics, faces, mode = "balanced") => computeAiBasics({ photometrics, color: null, faces }, { mode });
const noFaceExp = (photometrics, mode = "balanced") => run(photometrics, null, mode).aiBasicAdjustments.exposure;

describe("A1 metering híbrido — 12 escenarios", () => {
  test("1. Contraluz caras oscuras + fondo brillante → sube con moderación (no agresivo)", () => {
    const p = pm({ cP50: 150, scene: "backlit", highClip: 0.12, p99: 240 });
    const faces = [face({ luma: 55, area: 0.08 })];
    const before = noFaceExp(p);
    const after = run(p, faces).aiBasicAdjustments.exposure;
    expect(after).toBeGreaterThan(before);          // el sujeto oscuro pesa
    expect(after).toBeLessThanOrEqual(0.6);          // pero acotado por el modo
  });
  test("2. Retrato correctamente expuesto → NO CHANGE (exposure 0)", () => {
    const p = pm({ cP50: 128 });
    expect(run(p, [face({ luma: 128 })]).aiBasicAdjustments.exposure).toBe(0);
  });
  test("3. Novia vestido blanco (p99 al límite) → no subexpone por cara algo oscura", () => {
    const p = pm({ cP50: 175, p99: 254, highClip: 0.06 });
    const faces = [face({ luma: 120, area: 0.05 })];
    const after = run(p, faces).aiBasicAdjustments.exposure;
    expect(after).toBeLessThanOrEqual(0.15);         // protección: no empuja hacia blancos
  });
  test("4. Novio traje negro → no se lee como subexposición global", () => {
    const p = pm({ cP50: 70, p1: 2, lowClip: 0.15 });   // mucho negro en la escena
    const faces = [face({ luma: 135, area: 0.06 })];    // pero la CARA está bien
    const after = run(p, faces).aiBasicAdjustments.exposure;
    const before = noFaceExp(p);
    expect(after).toBeLessThan(before);                 // la cara bien expuesta frena la subida
  });
  test("5. Interior oscuro con personas → corrige hacia el sujeto", () => {
    const p = pm({ cP50: 70 });
    const after = run(p, [face({ luma: 70 })]).aiBasicAdjustments.exposure;
    expect(after).toBeGreaterThan(0);
  });
  test("6. Flash (sujeto ya iluminado) → subida contenida", () => {
    const p = pm({ cP50: 120, scene: "flash" });
    expect(run(p, [face({ luma: 150 })]).aiBasicAdjustments.exposure).toBeLessThanOrEqual(0.3);
  });
  test("7. Golden hour (cálida) → no fuerza exposición si el sujeto está bien", () => {
    const p = pm({ cP50: 130 });
    expect(run(p, [face({ luma: 132 })]).aiBasicAdjustments.exposure).toBe(0);
  });
  test("8. Iglesia cálida interior → decide por el sujeto, sin exagerar", () => {
    const p = pm({ cP50: 95 });
    const after = run(p, [face({ luma: 95, area: 0.05 })]).aiBasicAdjustments.exposure;
    expect(after).toBeGreaterThanOrEqual(0);
    expect(after).toBeLessThanOrEqual(0.6);
  });
  test("9. Sin personas → idéntico al motor anterior (meter = cP50)", () => {
    const p = pm({ cP50: 90 });
    expect(run(p, null).aiBasicAdjustments.exposure).toBe(noFaceExp(p));
    expect(run(p, []).aiBasicAdjustments.exposure).toBe(noFaceExp(p));
  });
  test("10. Varias caras, una principal → la principal domina el meter", () => {
    const p = pm({ cP50: 140 });
    const faces = [face({ cx: 0.5, area: 0.09, luma: 60, faceSharpness: 0.8 }), face({ cx: 0.85, area: 0.02, luma: 200, faceSharpness: 0.4, score: 0.6 })];
    const m = computeMeter(p, faces);
    expect(m.subjectLuma).toBeLessThan(120);          // pesa la principal (oscura), no la 2ª pequeña clara
    expect(m.meter).toBeLessThan(140);
  });
  test("11. Cara pequeña en fondo muy brillante → no domina el metering", () => {
    const p = pm({ cP50: 200, p99: 255, highClip: 0.2 });
    const m = computeMeter(p, [face({ area: 0.006, luma: 60, faceSharpness: 0.4, score: 0.6 })]);
    expect(m.faceWeight).toBeLessThan(0.2);           // peso bajo por tamaño/confianza
    const after = run(p, [face({ area: 0.006, luma: 60, score: 0.6 })]).aiBasicAdjustments.exposure;
    expect(after).toBeLessThanOrEqual(0);             // no sube exposición por una cara diminuta
  });
  test("12. Foto ya correcta con cara correcta → exposure 0 y zonas muertas", () => {
    const r = run(pm({ cP50: 128 }), [face({ luma: 128 })]).aiBasicAdjustments;
    expect(r.exposure).toBe(0);
    expect(r.contrast).toBe(0);
    expect(r.shadows).toBe(0);
  });
});

test("cara borrosa/secundaria pesa menos que una principal nítida", () => {
  const p = pm({ cP50: 140 });
  const wSharp = computeMeter(p, [face({ area: 0.08, faceSharpness: 0.85 })]).faceWeight;
  const wBlur = computeMeter(p, [face({ area: 0.08, faceSharpness: 0.15 })]).faceWeight;
  expect(wSharp).toBeGreaterThan(wBlur);
});
