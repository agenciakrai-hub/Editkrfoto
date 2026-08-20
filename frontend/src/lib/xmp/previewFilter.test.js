import { cssFilterParts, cssFilterFromBasics, basicsToMap } from "./previewFilter";

const b = (obj) => Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));

describe("previewFilter (aproximación visual del XMP)", () => {
  test("más exposición → más brillo; menos → menos", () => {
    const up = cssFilterParts(b({ Exposure2012: "+0.60" }));
    const down = cssFilterParts(b({ Exposure2012: "-0.60" }));
    expect(up.brightness).toBeGreaterThan(1);
    expect(down.brightness).toBeLessThan(1);
  });

  test("contraste positivo → contrast > 1", () => {
    expect(cssFilterParts(b({ Contrast2012: "40" })).contrast).toBeGreaterThan(1);
  });

  test("vibración/saturación → saturate > 1", () => {
    expect(cssFilterParts(b({ Vibrance: "30", Saturation: "10" })).saturate).toBeGreaterThan(1);
  });

  test("temperatura cálida (>5500) añade sepia; fría (<5500) añade hue-rotate", () => {
    const warm = cssFilterParts(b({ Temperature: "7000" }));
    const cool = cssFilterParts(b({ Temperature: "4000" }));
    expect(warm.sepia).toBeGreaterThan(0);
    expect(cool.hueRotate).toBeGreaterThan(0);
  });

  test("As Shot (sin Temperature) → sin sepia ni hue-rotate", () => {
    const p = cssFilterParts(b({ Exposure2012: "0.00" }));
    expect(p.sepia).toBe(0);
    expect(p.hueRotate).toBe(0);
  });

  test("cssFilterFromBasics devuelve string CSS válido", () => {
    const s = cssFilterFromBasics(b({ Exposure2012: "+0.35", Contrast2012: "6", Vibrance: "8" }));
    expect(s).toMatch(/brightness\([0-9.]+\) contrast\([0-9.]+\) saturate\([0-9.]+\) sepia\([0-9.]+\) hue-rotate\([0-9.]+deg\)/);
  });

  test("basicsToMap parsea valores", () => {
    expect(basicsToMap(b({ Highlights2012: "-35" })).Highlights2012).toBe(-35);
  });
});
