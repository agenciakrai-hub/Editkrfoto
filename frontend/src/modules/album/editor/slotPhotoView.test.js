import { photoPanMargins, minZoomForFullOriginal } from "@/modules/album/editor/slotPhotoView";

// Modelo de paneo consistente con el render (object-fit:cover + scale(k) + translate).
describe("photoPanMargins — arrastre en modo relleno", () => {
  test("a escala 1 el margen es 0 (la foto ya cubre; arrastrar no deja franja)", () => {
    expect(photoPanMargins({ w_mm: 100, h_mm: 80, transform: { scale: 1 } })).toEqual({ mx: 0, my: 0 });
  });
  test("a escala 2 el margen es (k-1)/2·lado por eje", () => {
    expect(photoPanMargins({ w_mm: 100, h_mm: 80, transform: { scale: 2 } })).toEqual({ mx: 50, my: 40 });
  });
  test("nunca devuelve null con geometría válida (eje siempre limitado)", () => {
    const m = photoPanMargins({ w_mm: 100, h_mm: 80, transform: { scale: 1.5 } });
    expect(m.mx).toBeCloseTo(25); expect(m.my).toBeCloseTo(20);
  });
  test("sin geometría → null", () => {
    expect(photoPanMargins({ w_mm: 0, h_mm: 0 })).toBeNull();
  });
});

describe("minZoomForFullOriginal — suelo de zoom", () => {
  test("relleno: mínimo 1 (siempre cubre, no se puede alejar por debajo del cover)", () => {
    expect(minZoomForFullOriginal({ w_mm: 100, h_mm: 80, fit_mode: "fill" })).toBe(1);
  });
  test("contener: mínimo 0.3 (foto completa, se puede alejar)", () => {
    expect(minZoomForFullOriginal({ w_mm: 100, h_mm: 80, fit_mode: "fit" })).toBe(0.3);
  });
});
