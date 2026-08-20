import { computeBasic } from "./exposureEngine";

// Fotometría de un RETRATO exterior LUMINOSO (familia a contraluz con fondo brillante):
// sin recorte fuerte, p99 no llega al blanco → el motor "sin protección" estiraba blancos +.
const brightPortrait = {
  p1: 25, p5: 45, p50: 130, p95: 235, p99: 197,
  cP50: 128, lowClip: 0.0, highClip: 0.0, contrastIndex: 190, scene: "normal",
};

describe("Protección del sujeto en retratos (no sobreiluminar a las personas)", () => {
  test("SIN caras: comportamiento clásico (puede estirar blancos hacia arriba)", () => {
    const r = computeBasic(brightPortrait, "balanced"); // meterOverride=null
    expect(r.whites).toBeGreaterThan(0); // ruta sin protección: estira el punto blanco
  });

  test("CON caras y sujeto CLARO: exposición 0 y blancos NO se estiran (≤0)", () => {
    // subjectLuma alto (sujeto bien/alto expuesto)
    const r = computeBasic(brightPortrait, "balanced", 128, 135);
    expect(r.exposure).toBeLessThanOrEqual(0);
    expect(r.whites).toBeLessThanOrEqual(0);          // clave: no reventar piel/ropa clara
    expect(r.contrast).toBeLessThanOrEqual(Math.round(35 * 0.45)); // contraste positivo contenido
  });

  test("CON caras y sujeto OSCURO: aún puede recuperar exposición y algo de blancos", () => {
    const dark = { ...brightPortrait, cP50: 92, p50: 100 };
    const r = computeBasic(dark, "balanced", 92, 92);
    expect(r.whites).toBeGreaterThanOrEqual(0);       // sujeto oscuro → se permite algo de lift acotado
    expect(r.exposure).toBeGreaterThanOrEqual(0);
  });

  test("recuperación de blancos quemados SIEMPRE permitida (whites negativos)", () => {
    const blown = { ...brightPortrait, p99: 254, highClip: 0.06 };
    const r = computeBasic(blown, "balanced", 150, 150);
    expect(r.whites).toBeLessThan(0);                 // recupera altas luces reventadas
  });
});
