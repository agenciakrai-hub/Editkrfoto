import { buildValidationReport } from "./validationReport";

const photo = (id, burstId, over = {}) => ({
  id, name: id, burstId, analyzedOk: true,
  selectedForEdit: false, warning: false, warningTypes: [], state: "NOT_SELECTED",
  reason: "", selectionConfidence: 100 - 90, faceCount: 0, subjects: [],
  audit: { technicalScore: 70, faceScore: null, eyesScore: 100, expressionScore: 0, sharpnessScore: 70, exposureScore: 80 },
  ...over,
});

test("regla fundamental: cada secuencia procesable tiene ≥1 seleccionada → rulePass", () => {
  const photos = [
    photo("a1", 1, { selectedForEdit: true, state: "SELECTED", selectionConfidence: 92 }),
    photo("a2", 1),
    photo("b1", 2, { selectedForEdit: true, state: "SELECTED_WARNING", warning: true, warningTypes: ["WARNING_CLOSED_EYES", "WARNING_NO_PERFECT_CANDIDATE"], selectionConfidence: 40 }),
  ];
  const { summary, sequences } = buildValidationReport(photos);
  expect(summary.processableSequences).toBe(2);
  expect(summary.sequencesWithSelection).toBe(2);
  expect(summary.sequencesWithoutSelection).toBe(0);
  expect(summary.rulePass).toBe(true);
  expect(summary.selectedClean).toBe(1);
  expect(summary.selectedWarning).toBe(1);
  expect(summary.warningBreakdown.WARNING_CLOSED_EYES).toBe(1);
  expect(sequences.length).toBe(2);
});

test("detecta incumplimiento: secuencia procesable sin selección → rulePass false", () => {
  const photos = [
    photo("a1", 1, { selectedForEdit: true, state: "SELECTED" }),
    photo("b1", 2), // ninguna seleccionada en la secuencia 2 (no debería pasar nunca)
  ];
  const { summary } = buildValidationReport(photos);
  expect(summary.rulePass).toBe(false);
  expect(summary.sequencesWithoutSelection).toBe(1);
  expect(summary.sequencesWithoutSelectionIds).toEqual([2]);
});

test("secuencia no procesable no cuenta para la regla", () => {
  const photos = [
    photo("a1", 1, { selectedForEdit: true, state: "SELECTED" }),
    photo("z1", 2, { analyzedOk: false }),
  ];
  const { summary } = buildValidationReport(photos);
  expect(summary.processableSequences).toBe(1);
  expect(summary.nonProcessableSequences).toBe(1);
  expect(summary.rulePass).toBe(true);
});

test("expone detalle de sujetos por foto", () => {
  const photos = [photo("a1", 1, {
    selectedForEdit: true, state: "SELECTED", faceCount: 2,
    subjects: [
      { subjectId: 0, relativePosition: "left", isMain: true, faceDetected: true, eyeState: "open", partialBlink: false, faceSharpness: 0.7, visibility: 0.9, confidence: 0.88 },
      { subjectId: 1, relativePosition: "right", isMain: true, faceDetected: true, eyeState: "closed", partialBlink: false, faceSharpness: 0.6, visibility: 0.8, confidence: 0.8 },
    ],
  })];
  const { sequences } = buildValidationReport(photos);
  const subs = sequences[0].photos[0].subjects;
  expect(subs).toHaveLength(2);
  expect(subs[1].eyeState).toBe("closed");
  expect(subs[0].relativePosition).toBe("left");
});
