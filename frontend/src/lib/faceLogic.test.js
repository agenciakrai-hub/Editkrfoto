import { facesChanged } from "./faceLogic";

const face = (cx, cy) => ({ cx, cy, w: 0.2, h: 0.25, score: 0.9 });

test("sin caras en ninguna → no cambia", () => {
  expect(facesChanged([], [])).toBe(false);
});

test("distinto número de caras → cambia (foto distinta)", () => {
  expect(facesChanged([face(0.5, 0.5)], [face(0.5, 0.5), face(0.3, 0.4)])).toBe(true);
});

test("mismas caras en la misma posición → no cambia (misma toma)", () => {
  const a = [face(0.4, 0.5), face(0.6, 0.5)];
  const b = [face(0.405, 0.498), face(0.598, 0.503)];
  expect(facesChanged(a, b)).toBe(false);
});

test("cuerpo igual pero la cara se movió notablemente → cambia (foto distinta)", () => {
  const a = [face(0.4, 0.5)];
  const b = [face(0.4, 0.62)]; // se movió 12% en vertical
  expect(facesChanged(a, b)).toBe(true);
});

test("emparejamiento por cara más cercana (orden distinto) → no cambia", () => {
  const a = [face(0.3, 0.5), face(0.7, 0.5)];
  const b = [face(0.702, 0.5), face(0.298, 0.5)];
  expect(facesChanged(a, b)).toBe(false);
});
