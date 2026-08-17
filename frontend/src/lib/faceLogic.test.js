import { clusterFaces, euclidean, facesChanged, eyeAspectRatio, photoFaceScore } from "./faceLogic";

const face = (cx, cy) => ({ cx, cy, w: 0.2, h: 0.25, score: 0.9 });

// --- facesChanged ---
test("sin caras en ninguna → no cambia", () => {
  expect(facesChanged([], [])).toBe(false);
});
test("distinto número de caras → cambia", () => {
  expect(facesChanged([face(0.5, 0.5)], [face(0.5, 0.5), face(0.3, 0.4)])).toBe(true);
});
test("mismas caras misma posición → no cambia", () => {
  expect(facesChanged([face(0.4, 0.5), face(0.6, 0.5)], [face(0.405, 0.498), face(0.598, 0.503)])).toBe(false);
});
test("cara movida notablemente → cambia", () => {
  expect(facesChanged([face(0.4, 0.5)], [face(0.4, 0.62)])).toBe(true);
});
test("empareja por cercanía (orden distinto) → no cambia", () => {
  expect(facesChanged([face(0.3, 0.5), face(0.7, 0.5)], [face(0.702, 0.5), face(0.298, 0.5)])).toBe(false);
});

// --- euclidean / clusterFaces ---
test("euclidean calcula distancia", () => {
  expect(euclidean([0, 0], [3, 4])).toBe(5);
});

test("agrupa dos personas distintas en 2 clusters", () => {
  const A = [0, 0, 0], B = [10, 10, 10];
  const entries = [
    { key: "p1#0", descriptor: A },
    { key: "p2#0", descriptor: [0.1, 0.05, 0] },   // ~persona A
    { key: "p3#0", descriptor: B },
    { key: "p4#0", descriptor: [10.1, 9.9, 10] },   // ~persona B
  ];
  const { assign, clusters } = clusterFaces(entries, 0.55);
  expect(clusters.length).toBe(2);
  expect(assign["p1#0"]).toBe(assign["p2#0"]);
  expect(assign["p3#0"]).toBe(assign["p4#0"]);
  expect(assign["p1#0"]).not.toBe(assign["p3#0"]);
});

test("descriptores idénticos → un solo cluster", () => {
  const d = [1, 2, 3];
  const { clusters } = clusterFaces([
    { key: "a", descriptor: d.slice() },
    { key: "b", descriptor: d.slice() },
    { key: "c", descriptor: d.slice() },
  ]);
  expect(clusters.length).toBe(1);
  expect(clusters[0].members.length).toBe(3);
});

// --- ojos (EAR) y puntuación de cara ---
const openEye = [{ x: 0, y: 0 }, { x: 1, y: -1 }, { x: 2, y: -1 }, { x: 3, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }];
const closedEye = [{ x: 0, y: 0 }, { x: 1, y: -0.05 }, { x: 2, y: -0.05 }, { x: 3, y: 0 }, { x: 2, y: 0.05 }, { x: 1, y: 0.05 }];

test("EAR alto con ojo abierto y bajo con ojo cerrado", () => {
  expect(eyeAspectRatio(openEye)).toBeGreaterThan(0.5);
  expect(eyeAspectRatio(closedEye)).toBeLessThan(0.1);
});

test("photoFaceScore: null sin caras", () => {
  expect(photoFaceScore([])).toBeNull();
  expect(photoFaceScore(null)).toBeNull();
});

test("photoFaceScore: ojos abiertos + sonrisa puntúa más que ojos cerrados", () => {
  const good = photoFaceScore([{ ear: 0.30, smile: 0.9, area: 0.2 }]);
  const blink = photoFaceScore([{ ear: 0.10, smile: 0.9, area: 0.2 }]);
  expect(good).toBeGreaterThan(blink);
});

test("photoFaceScore: en grupo penaliza si ALGUIEN tiene los ojos cerrados", () => {
  const allOpen = photoFaceScore([{ ear: 0.30, smile: 0.5, area: 0.1 }, { ear: 0.29, smile: 0.5, area: 0.1 }]);
  const oneBlink = photoFaceScore([{ ear: 0.30, smile: 0.5, area: 0.1 }, { ear: 0.10, smile: 0.5, area: 0.1 }]);
  expect(allOpen).toBeGreaterThan(oneBlink);
});
