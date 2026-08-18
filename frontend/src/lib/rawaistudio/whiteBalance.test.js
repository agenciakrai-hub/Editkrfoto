import { computeWhiteBalance } from "./whiteBalance";

test("color neutro → sin corrección de WB (As Shot)", () => {
  const wb = computeWhiteBalance({ meanR: 128, meanG: 128, meanB: 128, skinRatio: 0 });
  expect(wb.temperature).toBeNull();
  expect(wb.tint).toBeNull();
});

test("dominante cálida sin piel → enfría (temperatura < 5500)", () => {
  const wb = computeWhiteBalance({ meanR: 165, meanG: 120, meanB: 85, skinRatio: 0 });
  expect(wb.temperature).toBeLessThan(5500);
});

test("dominante azulada sin piel → calienta (temperatura > 5500)", () => {
  const wb = computeWhiteBalance({ meanR: 90, meanG: 120, meanB: 165, skinRatio: 0 });
  expect(wb.temperature).toBeGreaterThan(5500);
});

test("con piel demasiado azul → calienta usando la piel como referencia", () => {
  const wb = computeWhiteBalance({ meanR: 130, meanG: 128, meanB: 130, skinR: 190, skinG: 150, skinB: 165, skinRatio: 0.03 });
  expect(wb.skinDetected).toBe(true);
  expect(wb.temperature).toBeGreaterThan(5500);
  expect(wb.whiteBalanceConfidence).toBeGreaterThan(0.6);
});

test("con piel demasiado cálida → enfría", () => {
  const wb = computeWhiteBalance({ meanR: 140, meanG: 120, meanB: 100, skinR: 210, skinG: 150, skinB: 100, skinRatio: 0.03 });
  expect(wb.skinDetected).toBe(true);
  expect(wb.temperature).toBeLessThan(5500);
});
