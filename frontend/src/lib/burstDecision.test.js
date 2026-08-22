import { decideSequence, eyeState, assignSubjects, splitByMainFace, WARNING, MAX_SELECTED } from "./burstDecision";

// Helpers -----------------------------------------------------------------
const face = (cx, ear, { area = 0.1, smile = 0.5, det = 0.9, sharp = 0.7, cy = 0.5, w, roll = 0, yaw = 0 } = {}) => ({
  cx, cy, area, ear, smile, score: det, detScore: det, faceSharpness: sharp,
  w: w ?? Math.sqrt(area), h: Math.sqrt(area), pose: { roll, yaw },
});
const photo = (id, technicalScore, faces = []) => ({ id, name: id, technicalScore, faces });

// --- Descarte por trepidación = nitidez FACIAL del sujeto principal ------
test("cara del sujeto principal trepidada pierde ante la misma cara nítida (mismos ojos abiertos)", () => {
  const res = decideSequence([
    photo("blur", 0.8, [face(0.5, 0.30, { sharp: 0.30 })]), // cara borrosa (trepidación)
    photo("sharp", 0.8, [face(0.5, 0.30, { sharp: 0.85 })]), // misma persona, nítida
  ]);
  expect(res.selectedPhoto).toBe("sharp");
  expect(res.photos.find((p) => p.id === "blur").selected).toBe(false);
  expect(res.photos.find((p) => p.id === "sharp").sharpnessScore).toBe(85);
});

test("la nitidez global NO manda cuando hay caras: gana la de mejor cara aunque baje el score global", () => {
  const res = decideSequence([
    photo("a", 0.9, [face(0.5, 0.30, { sharp: 0.20 })]), // global alto pero cara borrosa
    photo("b", 0.5, [face(0.5, 0.30, { sharp: 0.85 })]), // global bajo pero cara nítida
  ]);
  expect(res.selectedPhoto).toBe("b");
});

// --- Agrupación estricta por cara principal ------------------------------
test("splitByMainFace mantiene junta una secuencia estable", () => {
  const g = splitByMainFace([
    { id: "1", faces: [face(0.5, 0.3)] },
    { id: "2", faces: [face(0.52, 0.3)] },
    { id: "3", faces: [face(0.5, 0.3)] },
  ]);
  expect(g).toHaveLength(1);
  expect(g[0]).toHaveLength(3);
});

test("splitByMainFace corta cuando la cara principal cambia de POSICIÓN", () => {
  const g = splitByMainFace([
    { id: "1", faces: [face(0.3, 0.3)] },
    { id: "2", faces: [face(0.32, 0.3)] },
    { id: "3", faces: [face(0.75, 0.3)] }, // salto grande de posición
  ]);
  expect(g).toHaveLength(2);
  expect(g[1].map((p) => p.id)).toEqual(["3"]);
});

test("splitByMainFace corta cuando cambia el ÁNGULO (yaw) o la presencia", () => {
  const gYaw = splitByMainFace([
    { id: "1", faces: [face(0.5, 0.3, { yaw: 0 })] },
    { id: "2", faces: [face(0.5, 0.3, { yaw: 0.4 })] }, // giro fuerte
  ]);
  expect(gYaw).toHaveLength(2);
  const gPres = splitByMainFace([
    { id: "1", faces: [face(0.5, 0.3)] },
    { id: "2", faces: [] }, // desaparece la persona principal
  ]);
  expect(gPres).toHaveLength(2);
});

// --- eyeState (nunca inventa certeza) ------------------------------------
test("eyeState clasifica open/partial/closed y unknown por baja confianza", () => {
  expect(eyeState({ ear: 0.30, detScore: 0.9 })).toBe("open");
  expect(eyeState({ ear: 0.18, detScore: 0.9 })).toBe("partial");
  expect(eyeState({ ear: 0.10, detScore: 0.9 })).toBe("closed");
  expect(eyeState({ ear: 0.30, detScore: 0.2 })).toBe("unknown"); // no asume abierto
  expect(eyeState({ ear: NaN, detScore: 0.9 })).toBe("unknown");
});

// --- Regla dura de ojos --------------------------------------------------
test("grupo GRANDE: 1 parpadeo se tolera (no marca ojos cerrados y gana a otra con más parpadeos)", () => {
  const row = (closedIdx) => Array.from({ length: 10 }, (_, i) =>
    face(0.05 + i * 0.095, closedIdx.includes(i) ? 0.10 : 0.30, { area: 0.03 }));
  const A = row([3]);        // 1 cerrado de 10 → tolerado (floor(10/8)=1)
  const B = row([2, 4, 7]);  // 3 cerrados
  const res = decideSequence([photo("A", 0.8, A), photo("B", 0.8, B)]);
  expect(res.selectedPhoto).toBe("A");
  const ra = res.photos.find((p) => p.id === "A");
  expect(ra.warningTypes).not.toContain(WARNING.CLOSED_EYES); // parpadeo tolerado en grupo grande
  expect(ra.warning).toBe(false);
  expect(res.photos.find((p) => p.id === "B").selected).toBe(false);
});

test("ojos cerrados pierden ante una alternativa con ojos abiertos", () => {
  const res = decideSequence([
    photo("A", 0.8, [face(0.5, 0.10)]), // cerrados
    photo("B", 0.8, [face(0.5, 0.30)]), // abiertos
  ]);
  expect(res.selectedPhoto).toBe("B");
  const A = res.photos.find((p) => p.id === "A");
  const B = res.photos.find((p) => p.id === "B");
  expect(B.selected).toBe(true);
  expect(B.warning).toBe(false);
  expect(A.selected).toBe(false);
});

test("subject_3 (derecha) con ojos cerrados hace ganar la foto con todos abiertos", () => {
  const A = [face(0.2, 0.30), face(0.5, 0.30), face(0.8, 0.10)]; // derecha cerrada
  const B = [face(0.2, 0.30), face(0.5, 0.30), face(0.8, 0.30)]; // todos abiertos
  const res = decideSequence([photo("A", 0.8, A), photo("B", 0.8, B)]);
  expect(res.selectedPhoto).toBe("B");
  const ra = res.photos.find((p) => p.id === "A");
  expect(ra.warningTypes).toContain(WARNING.CLOSED_EYES);
});

test("ojos 'unknown' (baja confianza) NO cuentan como abiertos", () => {
  const res = decideSequence([
    photo("A", 0.8, [face(0.5, 0.30, { det: 0.2 })]), // unknown
    photo("B", 0.8, [face(0.5, 0.30, { det: 0.9 })]), // abiertos ciertos
  ]);
  expect(res.selectedPhoto).toBe("B");
});

// --- Validez técnica -----------------------------------------------------
test("foto técnicamente inválida se excluye si hay una válida", () => {
  const res = decideSequence([
    photo("A", 0.20, [face(0.5, 0.30)]), // borrosa
    photo("B", 0.80, [face(0.5, 0.30)]),
  ]);
  expect(res.selectedPhoto).toBe("B");
  expect(res.photos.find((p) => p.id === "A").selected).toBe(false);
});

// --- Garantía: siempre ≥1 seleccionada -----------------------------------
test("todas con ojos cerrados → selecciona la mejor + WARNING (nunca vacío)", () => {
  const res = decideSequence([
    photo("A", 0.6, [face(0.5, 0.10)]),
    photo("B", 0.8, [face(0.5, 0.10)]),
    photo("C", 0.7, [face(0.5, 0.10)]),
  ]);
  const sel = res.photos.filter((p) => p.selected);
  expect(sel.length).toBeGreaterThanOrEqual(1);
  expect(res.hasWarning).toBe(true);
  const best = res.photos.find((p) => p.id === res.selectedPhoto);
  expect(best.warningTypes).toContain(WARNING.NO_PERFECT_CANDIDATE);
});

test("todas borrosas → aún así hay una seleccionada (garantía)", () => {
  const res = decideSequence([photo("A", 0.2, []), photo("B", 0.15, [])]);
  expect(res.photos.filter((p) => p.selected).length).toBeGreaterThanOrEqual(1);
});

test("secuencia de 1 foto → esa foto queda seleccionada", () => {
  const res = decideSequence([photo("solo", 0.7, [face(0.5, 0.30)])]);
  expect(res.selectedPhoto).toBe("solo");
  expect(res.photos[0].selected).toBe(true);
});

// --- Empate --------------------------------------------------------------
test("empate real → máximo 2 SELECTED+WARNING", () => {
  const clean = [face(0.5, 0.30, { smile: 0.6, sharp: 0.8 })];
  const res = decideSequence([
    photo("A", 0.90, clean),
    photo("B", 0.895, clean),
    photo("C", 0.89, clean),
  ]);
  const sel = res.photos.filter((p) => p.selected);
  expect(sel.length).toBeGreaterThanOrEqual(1);
  expect(sel.length).toBeLessThanOrEqual(MAX_SELECTED);
  if (sel.length === 2) {
    sel.forEach((p) => { expect(p.warningTypes).toContain(WARNING.TIE); });
  }
});

// --- Sin personas --------------------------------------------------------
test("sin caras: elige por técnica y no marca warning si es válida", () => {
  const res = decideSequence([photo("A", 0.8, []), photo("B", 0.6, [])]);
  expect(res.selectedPhoto).toBe("A");
  expect(res.photos.find((p) => p.id === "A").warning).toBe(false);
});

// --- Sujetos / posiciones ------------------------------------------------
test("assignSubjects asigna posición relativa izquierda/centro/derecha", () => {
  const { refCount, refSubjects } = assignSubjects([
    photo("A", 0.8, [face(0.2, 0.30), face(0.5, 0.30), face(0.85, 0.30)]),
  ]);
  expect(refCount).toBe(3);
  expect(refSubjects.map((s) => s.relativePosition)).toEqual(["left", "center", "right"]);
});

// --- INVARIANTE: 100 secuencias = ≥100 seleccionadas ---------------------
test("100 secuencias aleatorias (incluyendo degeneradas) → todas con ≥1 seleccionada", () => {
  let rng = 42;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  let sequencesWithSelection = 0;
  const N = 100;
  for (let s = 0; s < N; s++) {
    const count = 1 + Math.floor(rand() * 8);
    const photos = [];
    for (let i = 0; i < count; i++) {
      const degenerate = rand() < 0.3;
      const tech = degenerate ? rand() * 0.4 : 0.4 + rand() * 0.6;
      const nFaces = rand() < 0.4 ? 0 : 1 + Math.floor(rand() * 3);
      const faces = [];
      for (let k = 0; k < nFaces; k++) {
        const ear = degenerate ? rand() * 0.2 : rand() * 0.4;
        faces.push(face(0.2 + k * 0.25, ear, { det: rand(), sharp: rand() }));
      }
      photos.push(photo(`s${s}-p${i}`, tech, faces));
    }
    const res = decideSequence(photos, s);
    if (res.photos.some((p) => p.selected)) sequencesWithSelection++;
  }
  expect(sequencesWithSelection).toBe(N);
});
