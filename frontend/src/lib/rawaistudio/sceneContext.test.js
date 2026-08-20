import { classifyAmbience, warmthPreserveFactor } from "./sceneContext";
import { computeWhiteBalance } from "./whiteBalance";
import { computeAiBasics } from "./basicEngine";

describe("classifyAmbience (contexto por color)", () => {
  test("cálido y con luz → golden_hour", () => {
    const a = classifyAmbience({ meanR: 170, meanG: 130, meanB: 95 }, { p50: 140 });
    expect(a.ambience).toBe("golden_hour");
  });
  test("cálido y oscuro → tungsteno", () => {
    const a = classifyAmbience({ meanR: 130, meanG: 95, meanB: 70 }, { p50: 60 });
    expect(a.ambience).toBe("tungsten");
  });
  test("azulado → cool", () => {
    expect(classifyAmbience({ meanR: 95, meanG: 120, meanB: 165 }, { p50: 120 }).ambience).toBe("cool");
  });
  test("neutro → neutral", () => {
    expect(classifyAmbience({ meanR: 128, meanG: 128, meanB: 126 }, { p50: 128 }).ambience).toBe("neutral");
  });
  test("factor de conservación de calidez", () => {
    expect(warmthPreserveFactor("golden_hour")).toBeGreaterThan(warmthPreserveFactor("tungsten"));
    expect(warmthPreserveFactor("neutral")).toBe(0);
  });
});

describe("WB preserva la atmósfera cálida (golden hour)", () => {
  const warm = { meanR: 170, meanG: 130, meanB: 95 }; // cast cálido evidente
  test("neutral enfría más que golden_hour", () => {
    const neutral = computeWhiteBalance(warm, { ambience: "neutral" });
    const golden = computeWhiteBalance(warm, { ambience: "golden_hour" });
    // ambos bajan la temperatura por debajo del neutro, pero golden hour MENOS (conserva calidez).
    expect(neutral.temperature).toBeLessThan(5500);
    expect(golden.temperature).toBeGreaterThan(neutral.temperature);
  });
  test("tungsteno corrige más que golden_hour pero no del todo", () => {
    const tung = computeWhiteBalance(warm, { ambience: "tungsten" });
    const golden = computeWhiteBalance(warm, { ambience: "golden_hour" });
    expect(tung.temperature).toBeLessThan(golden.temperature);
  });
});

describe("WB por piel FACIAL (A2) tiene prioridad", () => {
  test("faceSkin manda sobre gris-mundo y marca skinSource=face", () => {
    // color gris-mundo neutro, pero la piel facial es cálida → debe corregir por la piel.
    const wb = computeWhiteBalance(
      { meanR: 128, meanG: 128, meanB: 128, skinRatio: 0 },
      { faceSkin: { r: 220, g: 150, b: 95 } }
    );
    expect(wb.skinSource).toBe("face");
    expect(wb.skinDetected).toBe(true);
    expect(wb.temperature).not.toBeNull();
  });

  test("sin faceSkin cae a la ruta anterior (grayworld/skin) — sin regresión", () => {
    const wb = computeWhiteBalance({ meanR: 128, meanG: 128, meanB: 128, skinRatio: 0 }, {});
    expect(wb.skinSource).toBe("grayworld");
  });
});

describe("Integración en computeAiBasics con caras (A2)", () => {
  const pm = { p1: 8, p5: 20, p50: 128, p95: 235, p99: 246, cP50: 128, lowClip: 0, highClip: 0, contrastIndex: 215, scene: "normal" };
  test("usa la piel de las caras para el WB", () => {
    const faces = [{ area: 0.05, score: 0.99, faceSharpness: 0.6, pose: { yaw: 0, roll: 0 }, luma: 130, skin: { r: 225, g: 150, b: 92, count: 200 } }];
    const r = computeAiBasics({ photometrics: pm, color: { meanR: 128, meanG: 128, meanB: 128, skinRatio: 0 }, faces }, { mode: "balanced" });
    expect(r.wbSource).toBe("face");
    expect(r.skinDetected).toBe(true);
  });
});
