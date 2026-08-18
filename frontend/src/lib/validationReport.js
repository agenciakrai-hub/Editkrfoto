// Capa de OBSERVABILIDAD de la Fase 1 (NO modifica el motor). Recibe las fotos YA decididas
// por el pipeline real (analyzeFile → groupAndSelect → applyFaceLayer) y construye un informe
// por secuencia + un resumen global con la comprobación de la regla fundamental:
//   cada secuencia PROCESABLE debe tener ≥1 fotografía seleccionada.
function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }

export function buildValidationReport(photos) {
  const groups = {};
  for (const p of photos) (groups[p.burstId] = groups[p.burstId] || []).push(p);

  const sequences = Object.entries(groups).map(([bid, ph]) => {
    const processable = ph.some((p) => p.analyzedOk !== false);
    const selected = ph.filter((p) => p.selectedForEdit);
    const best = selected.reduce((a, b) => ((b.selectionConfidence || 0) > (a ? a.selectionConfidence || 0 : -1) ? b : a), null) || selected[0] || null;
    const warnings = Array.from(new Set(selected.flatMap((p) => p.warningTypes || [])));
    return {
      sequenceId: Number(bid),
      count: ph.length,
      processable,
      selectedCount: selected.length,
      selectedFilenames: selected.map((p) => p.name),
      selectedPhoto: best ? best.name : null,
      selectionConfidence: best ? (best.selectionConfidence ?? null) : null,
      hasWarning: selected.some((p) => p.warning),
      warnings,
      photos: ph.map((p) => ({
        filename: p.name,
        selected: !!p.selectedForEdit,
        state: p.state || (p.selectedForEdit ? "SELECTED" : "NOT_SELECTED"),
        warning: !!p.warning,
        warningTypes: p.warningTypes || [],
        reason: p.reason || "",
        selectionConfidence: p.selectionConfidence ?? null,
        technicalScore: p.audit ? p.audit.technicalScore ?? null : null,
        faceScore: p.audit ? p.audit.faceScore ?? null : null,
        eyesScore: p.audit ? p.audit.eyesScore ?? null : null,
        expressionScore: p.audit ? p.audit.expressionScore ?? null : null,
        sharpnessScore: p.audit ? p.audit.sharpnessScore ?? null : null,
        exposureScore: p.audit ? p.audit.exposureScore ?? null : null,
        faceCount: p.faceCount ?? (p.faces ? p.faces.length : 0),
        subjects: (p.subjects || []).map((s) => ({
          subjectId: s.subjectId,
          relativePosition: s.relativePosition,
          isMain: !!s.isMain,
          faceDetected: !!s.faceDetected,
          eyeState: s.eyeState,
          partialBlink: !!s.partialBlink,
          faceSharpness: r2(s.faceSharpness),
          visibility: r2(s.visibility),
          confidence: r2(s.confidence),
        })),
        analyzed: p.analyzedOk !== false,
      })),
    };
  }).sort((a, b) => a.sequenceId - b.sequenceId);

  const processableSeqs = sequences.filter((s) => s.processable);
  const warningBreakdown = {};
  for (const s of sequences) {
    for (const p of s.photos) {
      if (!p.selected) continue;
      for (const w of p.warningTypes) warningBreakdown[w] = (warningBreakdown[w] || 0) + 1;
    }
  }
  const sequencesWithoutSelection = processableSeqs.filter((s) => s.selectedCount === 0);

  const summary = {
    totalSequences: sequences.length,
    processableSequences: processableSeqs.length,
    nonProcessableSequences: sequences.length - processableSeqs.length,
    sequencesWithSelection: processableSeqs.filter((s) => s.selectedCount > 0).length,
    sequencesWithoutSelection: sequencesWithoutSelection.length,
    sequencesWithoutSelectionIds: sequencesWithoutSelection.map((s) => s.sequenceId),
    totalSelectedPhotos: sequences.reduce((n, s) => n + s.selectedCount, 0),
    selectedClean: sequences.reduce((n, s) => n + s.photos.filter((p) => p.state === "SELECTED").length, 0),
    selectedWarning: sequences.reduce((n, s) => n + s.photos.filter((p) => p.state === "SELECTED_WARNING").length, 0),
    warningBreakdown,
    rulePass: processableSeqs.length > 0 && processableSeqs.every((s) => s.selectedCount > 0),
    generatedAt: new Date().toISOString(),
  };

  return { summary, sequences };
}
