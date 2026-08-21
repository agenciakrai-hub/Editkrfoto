// Mejora: EXPONER PARA LA PERSONA. Cuando hay caras, la exposición apunta a la piel
// (banda ideal), no al fotómetro mezclado cara+fondo. Así una cara oscura sobre fondo
// claro SÍ se levanta. Gated por opts.subjectTarget → no afecta a las rutas existentes.
import { computeBasic } from "./exposureEngine";
import { computeAiBasics } from "./basicEngine";

// Retrato con fondo relativamente claro (cP50 alto) pero sin recorte de altas luces.
const portrait = {
  p1: 20, p5: 40, p50: 110, p95: 210, p99: 235,
  cP50: 150, lowClip: 0, highClip: 0, contrastIndex: 190, scene: "normal",
};

describe("Exposición orientada al sujeto (personas mejor expuestas)", () => {
  test("cara OSCURA sobre fondo claro: sube la exposición hacia la piel", () => {
    const withTarget = computeBasic(portrait, "balanced", 140, 95, { subjectTarget: true });
    expect(withTarget.exposure).toBeGreaterThan(0);
  });

  test("subject-target levanta MÁS una cara oscura que la ruta clásica (fondo la enmascara)", () => {
    const withTarget = computeBasic(portrait, "balanced", 140, 95, { subjectTarget: true });
    const classic = computeBasic(portrait, "balanced", 140, 95); // sin opts → ruta clásica
    expect(withTarget.exposure).toBeGreaterThan(classic.exposure);
  });

  test("cara YA bien expuesta (dentro de la banda de piel): no la toca", () => {
    const r = computeBasic(portrait, "balanced", 130, 130, { subjectTarget: true });
    expect(r.exposure).toBe(0);
  });

  test("cara MUY clara: nunca la sobreexpone (exposición <= 0)", () => {
    const r = computeBasic(portrait, "balanced", 160, 160, { subjectTarget: true });
    expect(r.exposure).toBeLessThanOrEqual(0);
  });

  test("computeAiBasics con caras activa el subject-target: cara oscura → sube exposición", () => {
    const faces = [{
      area: 0.08, luma: 95, faceSharpness: 0.8, score: 0.95,
      skin: { r: 150, g: 110, b: 90, count: 80 }, pose: { yaw: 0, roll: 0 },
    }];
    const r = computeAiBasics(
      { photometrics: portrait, color: { meanR: 128, meanG: 128, meanB: 128 }, faces },
      { mode: "balanced", deadzone: "prudent", wbStrength: 0.5, subjectDetected: true }
    );
    expect(r.aiBasicAdjustments.exposure).toBeGreaterThan(0);
    expect(r.subjectLuma).toBeLessThan(120); // el sujeto estaba subexpuesto
  });

  test("SIN caras (fixture de regresión): ruta clásica intacta (no se activa subject-target)", () => {
    const r = computeAiBasics({ photometrics: portrait }, { mode: "balanced" });
    const classic = computeBasic(portrait, "balanced"); // meterOverride null → clásica
    expect(r.aiBasicAdjustments.exposure).toBe(
      Math.abs(classic.exposure) < 0.06 ? 0 : Math.round(classic.exposure * 100) / 100
    );
  });
});
