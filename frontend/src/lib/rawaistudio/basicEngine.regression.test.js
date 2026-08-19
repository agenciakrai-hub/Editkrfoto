// BATERÍA DE REGRESIÓN del Motor IA de básicos (congela el comportamiento ACTUAL).
// Objetivo: cualquier evolución (Fase A+) debe mantener estos snapshots salvo cambio APROBADO.
// Cubre: los 13 parámetros, zonas muertas, límites por modo y auditoría.
import { computeAiBasics } from "./basicEngine";

const pm = (o) => ({
  p1: 8, p5: 20, p50: 128, p95: 235, p99: 246, cP50: 128,
  lowClip: 0, highClip: 0, contrastIndex: 215, scene: "normal", ...o,
});
const col = (o) => ({ meanR: 128, meanG: 128, meanB: 128, skinR: 0, skinG: 0, skinB: 0, skinRatio: 0, ...o });

// Fixtures representativas (nombre → análisis).
const FIX = {
  correcta: { photometrics: pm({}), color: col({}) },
  oscura: { photometrics: pm({ cP50: 55, p50: 60, p99: 180 }), color: col({}) },
  clara: { photometrics: pm({ cP50: 210, p50: 205, p99: 255, highClip: 0.03 }), color: col({}) },
  backlit: { photometrics: pm({ cP50: 70, scene: "backlit", highClip: 0.09, p99: 255 }), color: col({}) },
  low_key: { photometrics: pm({ cP50: 60, scene: "low_key", p1: 2 }), color: col({}) },
  high_key: { photometrics: pm({ cP50: 200, scene: "high_key", p99: 255 }), color: col({}) },
  flash: { photometrics: pm({ cP50: 120, scene: "flash" }), color: col({}) },
  hazy: { photometrics: pm({ contrastIndex: 70, p5: 45 }), color: col({}) },
  plana: { photometrics: pm({}), color: col({ meanR: 130, meanG: 128, meanB: 126 }) },
  wb_calida: { photometrics: pm({}), color: col({ meanR: 165, meanG: 120, meanB: 85 }) },
  wb_fria: { photometrics: pm({}), color: col({ meanR: 90, meanG: 120, meanB: 165 }) },
  piel_calida: { photometrics: pm({}), color: col({ meanR: 140, meanG: 120, meanB: 100, skinR: 210, skinG: 150, skinB: 100, skinRatio: 0.03 }) },
  sin_foto: {},
};

const MODES = ["conservative", "balanced", "aggressive"];

describe("Regresión: los 13 parámetros por fixture y modo", () => {
  for (const [name, analysis] of Object.entries(FIX)) {
    for (const mode of MODES) {
      test(`${name} · ${mode}`, () => {
        const r = computeAiBasics(analysis, { mode, deadzone: "prudent", wbStrength: 0.5 });
        expect({ aiBasicAdjustments: r.aiBasicAdjustments, exposureClassification: r.exposureClassification,
          skinDetected: r.skinDetected, whiteBalanceConfidence: r.whiteBalanceConfidence,
          editingConfidence: r.editingConfidence }).toMatchSnapshot();
      });
    }
  }
});

describe("Regresión: zona muerta prudente vs activa (foto correcta)", () => {
  test("prudente deja la foto correcta intacta", () => {
    const r = computeAiBasics(FIX.correcta, { mode: "balanced", deadzone: "prudent" });
    expect(r.aiBasicAdjustments).toMatchSnapshot();
  });
  test("activa (más sensible)", () => {
    const r = computeAiBasics(FIX.oscura, { mode: "balanced", deadzone: "active" });
    expect(r.aiBasicAdjustments).toMatchSnapshot();
  });
});
