import { smartFillTransform } from "@/modules/album/editor/smartFill";

// "Rellenar" = COVER centrado: object-fit:cover (en el render) cubre y centra; el
// transform es identidad (escala 1, sin offset). Así llena SIEMPRE el contenedor y
// nunca deja franjas al desplazar la caja de la imagen.
const photo = (w, h) => ({ id: "p", width_px: w, height_px: h });
const slot = (w, h) => ({ w_mm: w, h_mm: h });

describe("smartFillTransform — rellenar = cover centrado, identidad", () => {
  test("modo fill, escala 1 y sin desplazamiento (cover centrado por object-fit)", () => {
    const cases = [
      [photo(3000, 2000), slot(100, 100)],
      [photo(2000, 3000), slot(200, 80)],
      [photo(4000, 1000), slot(90, 90)],
      [photo(3000, 2000), slot(60, 280)], // apaisada en columna alta
    ];
    for (const [p, s] of cases) {
      const t = smartFillTransform(p, s).transform;
      expect(t.scale).toBe(1);
      expect(t.offset_x_mm).toBe(0);
      expect(t.offset_y_mm).toBe(0);
    }
    expect(smartFillTransform(photo(3000, 2000), slot(100, 100)).fit_mode).toBe("fill");
  });

  test("geometría inválida → identidad segura (fill, escala 1)", () => {
    expect(smartFillTransform(null, slot(10, 10)).transform.scale).toBe(1);
    const r = smartFillTransform(photo(100, 100), { w_mm: 0, h_mm: 0 });
    expect(r.fit_mode).toBe("fill");
    expect(r.transform.offset_x_mm).toBe(0);
  });
});
