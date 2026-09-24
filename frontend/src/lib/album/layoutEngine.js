// Motor de maquetación de álbum (PURO, determinista). Reparte fotos en spreads (páginas dobles)
// y elige una plantilla por spread según cantidad y orientación. No toca el DOM ni archivos:
// recibe fotos con { name, aspect } y devuelve spreads con slots en coordenadas normalizadas
// [0..1] sobre el lienzo del spread (relación 2:1). El render/PDF aplican object-fit cover.

export const DENSITY = {
  airy: { key: "airy", label: "Aireado", range: [1, 2] },
  balanced: { key: "balanced", label: "Equilibrado", range: [2, 3] },
  dense: { key: "dense", label: "Denso", range: [3, 4] },
};

const orientOf = (aspect) => (aspect >= 1.15 ? "land" : aspect <= 0.87 ? "port" : "sq");

// Plantillas: rects [x, y, w, h] normalizados dentro del spread (2:1).
export function templateFor(group) {
  const n = group.length;
  if (n <= 1) {
    const o = orientOf(group[0]?.aspect ?? 1.5);
    if (o === "port") return { id: "solo-port", rects: [[0.30, 0.06, 0.40, 0.88]] };
    if (o === "sq") return { id: "solo-sq", rects: [[0.34, 0.08, 0.32, 0.84]] };
    return { id: "solo-land", rects: [[0, 0, 1, 1]] };
  }
  if (n === 2) return { id: "duo", rects: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] };
  if (n === 3) {
    if (group.every((p) => orientOf(p.aspect) === "port"))
      return { id: "trio-cols", rects: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]] };
    return { id: "trio-hero", rects: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] };
  }
  return { id: "quad", rects: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] };
}

// Margen visual homogéneo: el eje X mide el doble que el Y (spread 2:1), así que el pad en X es la mitad.
function insetRect([x, y, w, h], padX, padY) {
  const nx = x + padX, ny = y + padY;
  return [nx, ny, Math.max(0, w - padX * 2), Math.max(0, h - padY * 2)];
}

function makeSpread(group, index, kind, gutter) {
  const { id, rects } = kind === "cover"
    ? { id: "cover", rects: [[0, 0, 1, 1]] } // portada: foto hero a sangre completa
    : templateFor(group);
  const padX = gutter / 2, padY = gutter;
  const slots = group.slice(0, rects.length).map((photo, i) => {
    const [x, y, w, h] = insetRect(rects[i], padX, padY);
    return { photo, x, y, w, h };
  });
  return { index, kind, templateId: id, slots };
}

// Reparte las fotos en spreads. La portada (opcional) es un spread con una sola foto destacada.
// El resto alterna entre el máximo y el mínimo de la densidad para dar ritmo al álbum.
export function planAlbum(photos, opts = {}) {
  const list = (photos || []).filter((p) => p && p.name);
  const density = DENSITY[opts.density] ? opts.density : "balanced";
  const [minN, maxN] = DENSITY[density].range;
  const gutter = opts.gutter == null ? 0.02 : opts.gutter;
  const withCover = opts.cover !== false && list.length > 0;

  const spreads = [];
  let i = 0;
  if (withCover) { spreads.push(makeSpread([list[0]], spreads.length, "cover", gutter)); i = 1; }

  let toggle = 0;
  while (i < list.length) {
    const remaining = list.length - i;
    let n = toggle % 2 === 0 ? maxN : minN;
    // Una foto apaisada suelta luce mejor a sangre completa que forzada en una rejilla.
    if (n >= 2 && remaining >= 1 && orientOf(list[i].aspect) === "land" && toggle % 5 === 4) n = 1;
    n = Math.min(n, remaining);
    spreads.push(makeSpread(list.slice(i, i + n), spreads.length, "inner", gutter));
    i += n;
    toggle++;
  }
  return spreads;
}

// Utilidad para tests/UI: total de fotos colocadas.
export function countPlaced(spreads) {
  return spreads.reduce((acc, s) => acc + s.slots.length, 0);
}
