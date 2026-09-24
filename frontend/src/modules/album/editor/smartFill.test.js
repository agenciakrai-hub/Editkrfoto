import { smartFillTransform } from "@/modules/album/editor/smartFill";

// "Rellenar" = cover COMPLETO a escala 1, centrado en el sujeto/caras, sin zoom extra.
const photo = (w, h) => ({ id: "p", width_px: w, height_px: h });
const slot = (w, h) => ({ w_mm: w, h_mm: h });

describe("smartFillTransform — rellenar = cover centrado sin zoom", () => {
  test("NUNCA amplía: escala siempre 1 (evita desbordes)", () => {
    const cases = [
      [photo(3000, 2000), slot(100, 100)],
      [photo(2000, 3000), slot(200, 80)],
      [photo(4000, 1000), slot(90, 90)],
    ];
    for (const [p, s] of cases) {
      expect(smartFillTransform(p, s, null).transform.scale).toBe(1);
    }
  });

  test("misma proporción foto/hueco → centrado exacto (offset 0,0)", () => {
    const t = smartFillTransform(photo(3000, 2000), slot(150, 100), null).transform;
    expect(t.offset_x_mm).toBeCloseTo(0, 5);
    expect(t.offset_y_mm).toBeCloseTo(0, 5);
  });

  test("modo fill y sin deformar: cubre siempre el contenedor", () => {
    const r = smartFillTransform(photo(3000, 2000), slot(80, 120), null);
    expect(r.fit_mode).toBe("fill");
    // cover: la foto (a escala 1) es >= el hueco en ambos ejes.
    // dw = h*r = 120*1.5 = 180 >= 80; dh = 120 >= 120. Offsets dentro del margen.
    expect(Math.abs(r.transform.offset_x_mm)).toBeLessThanOrEqual((180 - 80) / 2 + 0.01);
  });

  test("con caras descentradas: desplaza (no amplía) para conservarlas, dentro del margen cover", () => {
    // Foto apaisada 1.5 en hueco cuadrado 100x100 → sobra ancho (margen 25mm).
    const faces = [{ x: 0.78, y: 0.4, w: 0.08, h: 0.1 }]; // cara a la derecha
    const t = smartFillTransform(photo(3000, 2000), slot(100, 100), faces).transform;
    expect(t.scale).toBe(1);
    // dw=150 → margen 25. El offset se recorta a ±25 (nunca deja hueco).
    expect(t.offset_x_mm).toBeGreaterThanOrEqual(-25.01);
    expect(t.offset_x_mm).toBeLessThanOrEqual(0); // pana hacia la izquierda para mostrar la derecha
  });

  test("geometría inválida → identidad segura", () => {
    expect(smartFillTransform(null, slot(10, 10), null).transform.scale).toBe(1);
    expect(smartFillTransform(photo(100, 100), { w_mm: 0, h_mm: 0 }, null).fit_mode).toBe("fill");
  });
});
