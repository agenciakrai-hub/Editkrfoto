import { planAlbum, templateFor, countPlaced, DENSITY } from "./layoutEngine";

const mk = (n, aspect = 1.5) => Array.from({ length: n }, (_, i) => ({ name: `IMG_${i}.jpg`, aspect }));

describe("templateFor", () => {
  test("una foto apaisada = sangre completa", () => {
    expect(templateFor([{ name: "a", aspect: 1.5 }]).rects).toEqual([[0, 0, 1, 1]]);
  });
  test("una foto vertical = centrada", () => {
    expect(templateFor([{ name: "a", aspect: 0.66 }]).id).toBe("solo-port");
  });
  test("dos fotos = duo lado a lado", () => {
    expect(templateFor(mk(2)).rects.length).toBe(2);
  });
  test("tres verticales = tres columnas", () => {
    expect(templateFor(mk(3, 0.66)).id).toBe("trio-cols");
  });
  test("tres mixtas = hero + 2", () => {
    expect(templateFor([{ aspect: 1.5 }, { aspect: 0.66 }, { aspect: 1.5 }]).id).toBe("trio-hero");
  });
  test("cuatro = rejilla 2x2", () => {
    expect(templateFor(mk(4)).id).toBe("quad");
  });
});

describe("planAlbum", () => {
  test("coloca todas las fotos exactamente una vez", () => {
    const photos = mk(23, 1.5);
    const spreads = planAlbum(photos, { density: "balanced" });
    expect(countPlaced(spreads)).toBe(23);
    const names = spreads.flatMap((s) => s.slots.map((sl) => sl.photo.name));
    expect(new Set(names).size).toBe(23);
  });

  test("el primer spread es la portada con una sola foto", () => {
    const spreads = planAlbum(mk(10));
    expect(spreads[0].kind).toBe("cover");
    expect(spreads[0].slots.length).toBe(1);
    expect(spreads[0].slots[0].photo.name).toBe("IMG_0.jpg");
  });

  test("sin portada cuando cover=false", () => {
    const spreads = planAlbum(mk(6), { cover: false });
    expect(spreads.every((s) => s.kind === "inner")).toBe(true);
    expect(countPlaced(spreads)).toBe(6);
  });

  test("los slots quedan dentro de [0,1] tras aplicar márgenes", () => {
    const spreads = planAlbum(mk(30, 0.66), { density: "dense" });
    for (const s of spreads) for (const sl of s.slots) {
      expect(sl.x).toBeGreaterThanOrEqual(0);
      expect(sl.y).toBeGreaterThanOrEqual(0);
      expect(sl.x + sl.w).toBeLessThanOrEqual(1.0001);
      expect(sl.y + sl.h).toBeLessThanOrEqual(1.0001);
    }
  });

  test("densidad denso usa más fotos por spread que aireado", () => {
    const airy = planAlbum(mk(40), { density: "airy", cover: false }).length;
    const dense = planAlbum(mk(40), { density: "dense", cover: false }).length;
    expect(dense).toBeLessThan(airy);
  });

  test("array vacío = sin spreads", () => {
    expect(planAlbum([]).length).toBe(0);
    expect(planAlbum(null).length).toBe(0);
  });

  test("ignora fotos sin nombre", () => {
    const spreads = planAlbum([{ name: "ok.jpg", aspect: 1.5 }, { aspect: 1.5 }, null]);
    expect(countPlaced(spreads)).toBe(1);
  });

  test("DENSITY expone las tres densidades", () => {
    expect(Object.keys(DENSITY)).toEqual(["airy", "balanced", "dense"]);
  });
});
