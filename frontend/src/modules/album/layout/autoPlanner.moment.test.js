import { planAutoLayout } from "@/modules/album/layout/autoPlanner";

// Cerebro de momentos: la maquetación automática agrupa por MOMENTO (pHash/tiempo)
// manteniendo el orden y NUNCA mezcla fotos de momentos distintos en un lienzo.
const album = { width_mm: 600, height_mm: 300, gutter_mm: 6, margin_mm: 10, photo_gap_mm: 3, max_photos_per_spread: 6 };

// pHash de 16 hex (64 bits). Momentos muy distintos entre sí (distancia > 18).
const PH = { A: "0000000000000000", B: "ffffffffffffffff", C: "0f0f0f0f0f0f0f0f" };
const mk = (id, ph, t) => ({ id, phash: ph, capture_time: t, orientation: "landscape", width_px: 3000, height_px: 2000 });

function momentOfGroups(plan, momentById) {
  // Devuelve, por cada lienzo del plan, el conjunto de momentos que contiene.
  return plan.groups.map((g) => new Set(g.assignment.filter(Boolean).map((id) => momentById.get(id))));
}

describe("planAutoLayout — cerebro de momentos", () => {
  test("no mezcla dos momentos en el mismo lienzo (salto de pHash)", () => {
    const photos = [
      mk("a1", PH.A), mk("a2", PH.A), mk("a3", PH.A), mk("a4", PH.A),
      mk("b1", PH.B), mk("b2", PH.B), mk("b3", PH.B), mk("b4", PH.B),
    ];
    const momentById = new Map(photos.map((p) => [p.id, p.id[0]]));
    const plan = planAutoLayout(album, photos, new Map(), { maxPerSpread: 6 });
    const sets = momentOfGroups(plan, momentById);
    for (const s of sets) expect(s.size).toBe(1); // cada lienzo = un solo momento
    // Se colocan las 8 fotos (2 momentos de 4, ambos ≤ cap).
    const placed = plan.groups.reduce((n, g) => n + g.assignment.filter(Boolean).length, 0);
    expect(placed).toBe(8);
  });

  test("separa por hueco temporal aunque el pHash sea parecido", () => {
    const photos = [
      mk("x1", PH.A, 1000), mk("x2", PH.A, 2000), mk("x3", PH.A, 3000),
      mk("y1", PH.A, 3000 + 5 * 60000), mk("y2", PH.A, 3000 + 5 * 60000 + 1000),
    ];
    // Momento por bloque temporal: x* antes del hueco, y* después.
    const momentById = new Map([["x1", "x"], ["x2", "x"], ["x3", "x"], ["y1", "y"], ["y2", "y"]]);
    const plan = planAutoLayout(album, photos, new Map(), { maxPerSpread: 6 });
    for (const s of momentOfGroups(plan, momentById)) expect(s.size).toBe(1);
  });

  test("mantiene el ORDEN: las fotos de un momento van juntas y en secuencia", () => {
    const photos = [
      mk("a1", PH.A), mk("a2", PH.A),
      mk("b1", PH.B), mk("b2", PH.B),
      mk("c1", PH.C), mk("c2", PH.C),
    ];
    const plan = planAutoLayout(album, photos, new Map(), { maxPerSpread: 6 });
    // Concatenando las asignaciones de todos los lienzos, el orden relativo se conserva.
    const flat = plan.groups.flatMap((g) => g.assignment.filter(Boolean));
    const idx = (id) => flat.indexOf(id);
    expect(idx("a1")).toBeGreaterThanOrEqual(0);
    expect(idx("a2")).toBeGreaterThan(idx("a1"));
    // Ningún lienzo mezcla momentos.
    const momentById = new Map(photos.map((p) => [p.id, p.id[0]]));
    for (const s of momentOfGroups(plan, momentById)) expect(s.size).toBe(1);
  });

  test("un momento grande se reparte en varios lienzos DEL MISMO momento", () => {
    const photos = Array.from({ length: 9 }, (_, i) => mk("a" + i, PH.A));
    const plan = planAutoLayout(album, photos, new Map(), { maxPerSpread: 6 });
    expect(plan.groups.length).toBeGreaterThanOrEqual(2); // 9 > cap 6 → ≥2 lienzos
    const momentById = new Map(photos.map((p) => [p.id, "a"]));
    for (const s of momentOfGroups(plan, momentById)) expect(s.size).toBe(1);
  });
});
