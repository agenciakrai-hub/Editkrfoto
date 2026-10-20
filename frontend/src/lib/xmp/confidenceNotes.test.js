import { confidenceNotes } from "./confidenceNotes";

test("WB por gris medio aplicado con baja confianza → aviso accionable", () => {
  const n = confidenceNotes({ whiteBalanceConfidence: 0.45, wbSource: "grayworld", wbApplied: true, editingConfidence: 0.85 });
  expect(n).toHaveLength(1);
  expect(n[0].level).toBe("warn");
  expect(n[0].text).toMatch(/baja confianza \(45%, estimado por gris medio/);
  expect(n[0].text).toMatch(/Revisa Temperatura y Tinte/);
});

test("ambiente cálido se explica", () => {
  const n = confidenceNotes({ whiteBalanceConfidence: 0.45, wbSource: "grayworld", wbApplied: true, ambience: "tungsten" });
  expect(n[0].text).toMatch(/luz cálida de ambiente/);
});

test("sin datos de color → As Shot informativo", () => {
  const n = confidenceNotes({ whiteBalanceConfidence: 0, wbSource: "none", wbApplied: false });
  expect(n[0].level).toBe("info");
  expect(n[0].text).toMatch(/Como se tomó/);
});

test("confianza alta → sin avisos; edición difícil → aviso", () => {
  expect(confidenceNotes({ whiteBalanceConfidence: 0.9, wbSource: "face", wbApplied: true, editingConfidence: 0.85 })).toEqual([]);
  const n = confidenceNotes({ whiteBalanceConfidence: 0.9, wbSource: "face", wbApplied: true, editingConfidence: 0.5 });
  expect(n[0].text).toMatch(/Edición con baja confianza \(50%\)/);
  expect(confidenceNotes(null)).toEqual([]);
});
