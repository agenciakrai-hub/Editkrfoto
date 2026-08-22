// FASE 1 — Decisor ÚNICO de selección por secuencia (ráfaga). Puro y auditable.
//
// FILOSOFÍA (regla del usuario):
//   El motor es un ASISTENTE: de CADA secuencia selecciona SIEMPRE la mejor foto
//   disponible y AVISA (warning) cuando esa selección tiene algún problema.
//   NUNCA deja una secuencia sin selección (salvo que no tenga ninguna foto).
//   Estados por foto: SELECTED · SELECTED+WARNING · NOT_SELECTED.
//
// FLUJO: técnica → caras → sujetos/posiciones (identidad relativa) → ojos
//        → comparación de candidatas → decisión final de secuencia.
//
// Entrada esperada por foto (mapeada desde faceEngine, sin dependencias de navegador):
//   { id, name?, technicalScore(0..1), photometrics?{highClip,lowClip,p50,p5,p95},
//     faces:[{ cx, cy, area, ear, smile, detScore, faceSharpness(0..1)? }] }

export const WARNING = {
  CLOSED_EYES: "WARNING_CLOSED_EYES",
  PARTIAL_BLINK: "WARNING_PARTIAL_BLINK",
  LOW_SHARPNESS: "WARNING_LOW_SHARPNESS",
  EXPOSURE: "WARNING_EXPOSURE",
  FACE_OCCLUDED: "WARNING_FACE_OCCLUDED",
  MISSING_SUBJECT: "WARNING_MISSING_SUBJECT",
  MULTIPLE_FACE_ISSUES: "WARNING_MULTIPLE_FACE_ISSUES",
  NO_PERFECT_CANDIDATE: "WARNING_NO_PERFECT_CANDIDATE",
  SUBJECT_TRACKING_UNCERTAIN: "WARNING_SUBJECT_TRACKING_UNCERTAIN",
  TIE: "WARNING_TIE",
};

export const WARNING_LABELS = {
  WARNING_CLOSED_EYES: "Ojos cerrados",
  WARNING_PARTIAL_BLINK: "Parpadeo",
  WARNING_LOW_SHARPNESS: "Poca nitidez",
  WARNING_EXPOSURE: "Exposición",
  WARNING_FACE_OCCLUDED: "Cara tapada",
  WARNING_MISSING_SUBJECT: "Falta un sujeto",
  WARNING_MULTIPLE_FACE_ISSUES: "Varios problemas de caras",
  WARNING_NO_PERFECT_CANDIDATE: "Ninguna toma perfecta",
  WARNING_SUBJECT_TRACKING_UNCERTAIN: "Sujetos inciertos",
  WARNING_TIE: "Empate (elige tú)",
};

// --- Umbrales -------------------------------------------------------------
export const TECH_MIN = 0.45;      // validez técnica mínima (0..1)
export const EAR_OPEN = 0.23;      // >= abierto
export const EAR_CLOSED = 0.15;    // < cerrado ; entre ambos = parpadeo
export const DET_MIN = 0.5;        // confianza de detección mínima; si no → ojo "unknown"
export const MAIN_AREA_RATIO = 0.4; // sujeto principal si área >= 40% de la cara mayor
export const POS_TOL = 0.12;       // tolerancia de emparejamiento de sujetos (distancia)
export const MOVE_TOL = 0.10;      // movimiento por encima → seguimiento incierto
export const TIE_RATIO = 0.97;     // 2ª candidata >= 97% de la mejor → empate real
export const MAX_SELECTED = 2;     // máximo de fotos SELECTED+WARNING por empate
export const LOW_SHARP = 45;       // sharpnessScore por debajo → poca nitidez
export const VIS_LOW = 0.5;        // visibilidad por debajo → cara tapada/cortada
export const FACE_SHARP_FLOOR = 0.12; // nitidez facial absoluta mínima (evita excluir todo si todas son blandas)
export const FACE_SHARP_REL = 0.72;   // válida si nitidez facial >= 72% de la mejor de la secuencia

// --- Agrupación estricta por cara principal ------------------------------
// Umbrales de corte de secuencia (si la cara PRINCIPAL cambia mucho → secuencia nueva).
export const SPLIT_POS = 0.14;     // desplazamiento del centro de la cara (fracción de frame)
export const SPLIT_SIZE = 1.4;     // cambio de tamaño de cara (ratio)
export const SPLIT_ROLL = 12;      // cambio de inclinación (grados)
export const SPLIT_YAW = 0.18;     // cambio de giro (ratio)

function mainFaceOf(faces) {
  if (!faces || !faces.length) return null;
  return faces.reduce((a, b) => (b.area > (a ? a.area : -1) ? b : a), null);
}

// Divide una ráfaga en subsecuencias cuando la cara PRINCIPAL cambia de posición o ángulo
// de forma significativa. Puro y testeable. `photos` debe venir en orden temporal.
export function splitByMainFace(photos, opts = {}) {
  const posTol = opts.posTol ?? SPLIT_POS, sizeTol = opts.sizeTol ?? SPLIT_SIZE;
  const rollTol = opts.rollTol ?? SPLIT_ROLL, yawTol = opts.yawTol ?? SPLIT_YAW;
  const groups = [];
  let cur = [];
  for (const p of photos) {
    if (!cur.length) { cur = [p]; continue; }
    const a = mainFaceOf(cur[cur.length - 1].faces);
    const b = mainFaceOf(p.faces);
    let split = false;
    if ((a === null) !== (b === null)) {
      split = true; // aparece/desaparece la persona principal
    } else if (a && b) {
      const dpos = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      const ratio = Math.max(a.w || 0.001, 0.001) / Math.max(b.w || 0.001, 0.001);
      const sizeChange = Math.max(ratio, 1 / ratio);
      const droll = Math.abs((a.pose ? a.pose.roll : 0) - (b.pose ? b.pose.roll : 0));
      const dyaw = Math.abs((a.pose ? a.pose.yaw : 0) - (b.pose ? b.pose.yaw : 0));
      if (dpos > posTol || sizeChange > sizeTol || droll > rollTol || dyaw > yawTol) split = true;
    }
    if (split) { groups.push(cur); cur = [p]; } else cur.push(p);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function clamp01(v) { return clamp(v, 0, 1); }

// Estado del ojo SIN inventar certeza: si no hay landmarks/confianza fiable → "unknown".
export function eyeState(face) {
  if (!face || !Number.isFinite(face.ear)) return "unknown";
  if ((face.detScore ?? 1) < DET_MIN) return "unknown";
  if (face.ear >= EAR_OPEN) return "open";
  if (face.ear >= EAR_CLOSED) return "partial";
  return "closed";
}

function relativePosition(cx) {
  if (cx < 0.4) return "left";
  if (cx > 0.6) return "right";
  return "center";
}

// Identidad RELATIVA dentro de la secuencia (sin biometría, sin almacenar nada):
// se toma como referencia el fotograma con más caras y se emparejan por posición+tamaño.
export function assignSubjects(photos) {
  let ref = null;
  for (const p of photos) {
    const n = (p.faces || []).length;
    if (!ref || n > ref.n || (n === ref.n && (p.technicalScore ?? 0) > (ref.tech ?? 0))) {
      ref = { n, tech: p.technicalScore ?? 0, faces: p.faces || [] };
    }
  }
  const refCount = ref ? ref.n : 0;
  if (!refCount) {
    return { subjectsByPhoto: {}, refCount: 0, refSubjects: [], trackingUncertain: false };
  }
  const refSorted = [...ref.faces].sort((a, b) => a.cx - b.cx);
  const refSubjects = refSorted.map((f, i) => ({
    subjectId: i, relativePosition: relativePosition(f.cx), anchor: { cx: f.cx, cy: f.cy, area: f.area || 0 },
  }));

  let trackingUncertain = false;
  const subjectsByPhoto = {};
  for (const p of photos) {
    const faces = [...(p.faces || [])];
    const used = new Array(faces.length).fill(false);
    const subjects = refSubjects.map((rs) => {
      // Empareja el sujeto de referencia con la cara más cercana no usada.
      let best = -1, bd = Infinity;
      faces.forEach((f, i) => {
        if (used[i]) return;
        const d = Math.hypot(f.cx - rs.anchor.cx, f.cy - rs.anchor.cy);
        if (d < bd) { bd = d; best = i; }
      });
      if (best < 0 || bd > POS_TOL) {
        return { subjectId: rs.subjectId, relativePosition: rs.relativePosition, faceDetected: false,
          eyesOpen: null, eyeState: "absent", partialBlink: false, faceSharpness: 0,
          expressionScore: 0, visibility: 0, confidence: 0, area: 0, isMain: false };
      }
      used[best] = true;
      if (bd > MOVE_TOL) trackingUncertain = true;
      const f = faces[best];
      const st = eyeState(f);
      const visibility = clamp01((f.detScore ?? 0.9) * edgeFactor(f));
      return {
        subjectId: rs.subjectId, relativePosition: rs.relativePosition, faceDetected: true,
        eyesOpen: st === "open" ? true : (st === "unknown" ? null : false),
        eyeState: st, partialBlink: st === "partial",
        faceSharpness: clamp01(f.faceSharpness ?? 0.5),
        expressionScore: clamp01(f.smile ?? 0),
        visibility, confidence: clamp01((f.detScore ?? 0.9) * (1 - Math.min(1, bd / POS_TOL) * 0.4)),
        area: f.area || 0, isMain: false,
      };
    });
    // Caras no emparejadas (más caras que la referencia) → seguimiento incierto.
    if (used.some((u) => !u) || faces.length !== refCount) trackingUncertain = true;
    // Marca sujetos principales según tamaño relativo dentro de ESTA foto.
    const maxArea = Math.max(0, ...subjects.map((s) => s.area));
    subjects.forEach((s) => { s.isMain = s.faceDetected && maxArea > 0 && s.area >= MAIN_AREA_RATIO * maxArea; });
    subjectsByPhoto[p.id] = subjects;
  }
  return { subjectsByPhoto, refCount, refSubjects, trackingUncertain };
}

// Penaliza caras pegadas al borde del encuadre (posible corte/oclusión).
function edgeFactor(f) {
  const halfW = (f.w || Math.sqrt(f.area || 0.04)) / 2;
  const halfH = (f.h || Math.sqrt(f.area || 0.04)) / 2;
  const margin = Math.min(f.cx - halfW, 1 - (f.cx + halfW), f.cy - halfH, 1 - (f.cy + halfH));
  return clamp01(0.7 + margin * 3); // dentro con holgura → ~1 ; cortada → baja
}

function eyeVal(state) {
  switch (state) {
    case "open": return 1;
    case "partial": return 0.35;
    case "unknown": return 0.4;
    default: return 0; // closed / absent
  }
}

function subjectScore(s) {
  // Prioriza OJOS ABIERTOS y NITIDEZ FACIAL (regla del usuario); expresión/visibilidad secundarios.
  return 100 * (0.5 * eyeVal(s.eyeState) + 0.35 * s.faceSharpness + 0.1 * s.visibility + 0.05 * s.expressionScore);
}

// Evalúa UNA foto (scores + warnings) con sus sujetos ya asignados.
function evalPhoto(p, subjects, trackingUncertain) {
  const technicalScore = Math.round(clamp01(p.technicalScore ?? 0.5) * 100);
  const pm = p.photometrics;
  const exposureScore = pm
    ? Math.round(100 * clamp01(1 - Math.min(1, (pm.highClip || 0) * 4 + (pm.lowClip || 0) * 3)))
    : technicalScore;
  const exposureOk = !pm || ((pm.highClip || 0) < 0.06 && (pm.lowClip || 0) < 0.12);

  const hasPeople = subjects.length > 0;
  const mains = subjects.filter((s) => s.isMain);
  const closed = subjects.filter((s) => s.eyeState === "closed");
  const partial = subjects.filter((s) => s.eyeState === "partial");
  // Tolerancia de PARPADEO en grupos grandes: 1 ojo cerrado por cada 8 personas.
  // Grupos pequeños (≤7) → tolerancia 0 = comportamiento estricto de siempre.
  const peopleCount = subjects.filter((s) => s.faceDetected).length;
  const eyeTolerance = Math.floor(peopleCount / 8);
  const occluded = subjects.filter((s) => s.faceDetected && s.visibility < VIS_LOW);
  const missing = subjects.filter((s) => !s.faceDetected);

  // NITIDEZ del SUJETO PRINCIPAL (no de la imagen completa): base del descarte por trepidación.
  const mainSharpSet = (mains.length ? mains : subjects).filter((s) => s.faceDetected);
  const mainFaceSharp = mainSharpSet.length ? Math.max(...mainSharpSet.map((s) => s.faceSharpness)) : 0;
  const sharpnessScore = hasPeople ? Math.round(mainFaceSharp * 100) : technicalScore;

  // eyesScore: 100 si todos los principales abiertos; resta por problemas (más si es principal).
  let eyesScore = 100;
  for (const s of subjects) {
    const w = s.isMain ? 1 : 0.4;
    if (s.eyeState === "closed") eyesScore -= 45 * w;
    else if (s.eyeState === "partial") eyesScore -= 22 * w;
    else if (s.eyeState === "unknown") eyesScore -= 18 * w;
    else if (!s.faceDetected) eyesScore -= 30 * w;
  }
  eyesScore = Math.round(clamp(eyesScore, 0, 100));

  let expressionScore, faceScore;
  if (hasPeople) {
    expressionScore = Math.round(100 * (subjects.reduce((a, s) => a + s.expressionScore, 0) / subjects.length));
    const evalSet = mains.length ? mains : subjects;
    const worst = Math.min(...evalSet.map(subjectScore));
    const mean = subjects.reduce((a, s) => a + subjectScore(s), 0) / subjects.length;
    const meanVis = subjects.reduce((a, s) => a + s.visibility, 0) / subjects.length;
    faceScore = Math.round(clamp(0.55 * worst + 0.25 * mean + 0.20 * meanVis * 100, 0, 100));
  } else {
    expressionScore = 0;
    faceScore = null;
  }

  const score = hasPeople ? Math.round(0.45 * technicalScore + 0.55 * faceScore) : technicalScore;
  const mainsNotOpen = mains.filter((s) => s.eyeState !== "open").length;
  const allMainOpen = mains.length > 0 && mainsNotOpen <= eyeTolerance;

  // Warnings intrínsecos de la foto (los de selección se añaden al decidir).
  const warningTypes = [];
  if (closed.length > eyeTolerance) warningTypes.push(WARNING.CLOSED_EYES);
  if (partial.length > eyeTolerance) warningTypes.push(WARNING.PARTIAL_BLINK);
  if (sharpnessScore < LOW_SHARP) warningTypes.push(WARNING.LOW_SHARPNESS);
  if (!exposureOk) warningTypes.push(WARNING.EXPOSURE);
  if (occluded.length) warningTypes.push(WARNING.FACE_OCCLUDED);
  if (missing.length) warningTypes.push(WARNING.MISSING_SUBJECT);
  const faceIssues = Math.max(0, closed.length - eyeTolerance) + Math.max(0, partial.length - eyeTolerance) + occluded.length + missing.length;
  if (faceIssues >= 2) warningTypes.push(WARNING.MULTIPLE_FACE_ISSUES);
  if (hasPeople && trackingUncertain) warningTypes.push(WARNING.SUBJECT_TRACKING_UNCERTAIN);

  return {
    id: p.id, filename: p.name || p.id, hasPeople, score,
    mainFaceSharp, exposureOk, allMainOpen, missingCount: missing.length, occludedCount: occluded.length,
    technicalScore, faceScore, eyesScore, expressionScore, sharpnessScore, exposureScore,
    subjects, warningTypes,
  };
}

// DECISOR ÚNICO por secuencia. Devuelve el resultado completo + por foto.
// GARANTÍA: si `photos` tiene ≥1 elemento, SIEMPRE hay ≥1 foto con selected=true.
export function decideSequence(photos, sequenceId = null) {
  const list = Array.isArray(photos) ? photos : [];
  if (!list.length) {
    return { sequenceId, photos: [], selectedPhoto: null, selectionConfidence: 0, hasWarning: false, warnings: [], subjects: [] };
  }

  const { subjectsByPhoto, refSubjects, trackingUncertain } = assignSubjects(list);
  const evals = list.map((p) => evalPhoto(p, subjectsByPhoto[p.id] || [], trackingUncertain));

  // Validez técnica basada en la NITIDEZ FACIAL del sujeto principal (relativa a la secuencia):
  // una toma trepidada pierde frente a otra con la MISMA persona más nítida.
  const seqMaxFaceSharp = Math.max(0, ...evals.filter((e) => e.hasPeople).map((e) => e.mainFaceSharp));
  const faceSharpMin = Math.max(FACE_SHARP_FLOOR, FACE_SHARP_REL * seqMaxFaceSharp);
  for (const e of evals) {
    e.techValid = e.hasPeople
      ? (e.mainFaceSharp >= faceSharpMin && e.exposureOk)
      : (e.technicalScore >= TECH_MIN * 100);
    e.clean = e.techValid && (e.hasPeople
      ? (e.allMainOpen && e.missingCount === 0 && e.occludedCount === 0)
      : (e.sharpnessScore >= LOW_SHARP && e.exposureOk));
  }

  // Cascada de pool NO VACÍO → garantiza selección siempre.
  const techValid = evals.filter((e) => e.techValid);
  const cleanPool = techValid.filter((e) => e.clean);
  const pool = cleanPool.length ? cleanPool : (techValid.length ? techValid : evals);
  const sorted = [...pool].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const fromClean = cleanPool.includes(best);

  // Empate real → hasta MAX_SELECTED (todas SELECTED+WARNING).
  const selectedIds = new Set([best.id]);
  for (let i = 1; i < sorted.length && selectedIds.size < MAX_SELECTED; i++) {
    if (best.score > 0 && sorted[i].score >= best.score * TIE_RATIO) selectedIds.add(sorted[i].id);
    else break;
  }
  const tie = selectedIds.size > 1;

  // Confianza de la secuencia.
  const runnerUp = sorted[1];
  const gap = runnerUp ? best.score - runnerUp.score : 100;
  let confidence;
  if (!techValid.length) confidence = 25;
  else if (!cleanPool.length) confidence = 40;
  else if (tie || gap < 4) confidence = 60;
  else confidence = 92;
  if (trackingUncertain) confidence = Math.max(20, confidence - 15);

  const outPhotos = evals.map((e) => {
    const selected = selectedIds.has(e.id);
    const warningTypes = [...e.warningTypes];
    if (selected) {
      if (!fromClean && !warningTypes.includes(WARNING.NO_PERFECT_CANDIDATE)) warningTypes.push(WARNING.NO_PERFECT_CANDIDATE);
      if (tie && !warningTypes.includes(WARNING.TIE)) warningTypes.push(WARNING.TIE);
    }
    const warning = selected && warningTypes.length > 0;
    return {
      id: e.id, filename: e.filename, selected, warning, warningTypes: selected ? warningTypes : e.warningTypes,
      technicalScore: e.technicalScore, faceScore: e.faceScore, eyesScore: e.eyesScore,
      expressionScore: e.expressionScore, sharpnessScore: e.sharpnessScore, exposureScore: e.exposureScore,
      score: e.score, subjects: e.subjects,
      selectionConfidence: e.id === best.id ? confidence : (selected ? confidence : 100 - confidence),
      state: selected ? (warning ? "SELECTED_WARNING" : "SELECTED") : "NOT_SELECTED",
      reason: selected
        ? (fromClean ? (tie ? "empate real: revisa cuál prefieres" : "mejor de la secuencia (técnica válida, ojos abiertos)")
                     : "mejor disponible aunque ninguna es perfecta → revisar")
        : (!e.techValid ? "descartada por calidad técnica"
           : (!e.clean ? "peor que la ganadora (problemas de caras/ojos)" : "peor que la ganadora de la secuencia")),
    };
  });

  const selectedPhotos = outPhotos.filter((p) => p.selected);
  const warnings = Array.from(new Set(selectedPhotos.flatMap((p) => p.warningTypes)));
  return {
    sequenceId,
    photos: outPhotos,
    selectedPhoto: best.id,
    selectionConfidence: confidence,
    hasWarning: selectedPhotos.some((p) => p.warning),
    warnings,
    subjects: refSubjects.map((s) => ({ subjectId: s.subjectId, relativePosition: s.relativePosition })),
  };
}

// Conveniencia: decide TODAS las ráfagas a partir de fotos con `burstId`.
// Devuelve { byId: {photoId->resultadoFoto}, sequences:[resultadoSecuencia] }.
export function decideAllBursts(photos, buildInput) {
  const groups = {};
  for (const p of photos) (groups[p.burstId] = groups[p.burstId] || []).push(p);
  const byId = {};
  const sequences = [];
  for (const [bid, group] of Object.entries(groups)) {
    const input = group.map((p) => (buildInput ? buildInput(p) : p));
    const res = decideSequence(input, bid);
    sequences.push(res);
    res.photos.forEach((rp) => { byId[rp.id] = rp; });
  }
  return { byId, sequences };
}
