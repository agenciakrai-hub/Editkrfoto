// Contexto de AMBIENTE por COLOR (sin IA/LLM): complementa la clasificación de escena por
// luminancia (photometricAnalysis) con la dominante cromática, para entender la INTENCIÓN de
// luz del fotógrafo y NO neutralizar atmósferas deseadas (golden hour, luz de tungsteno).
// Se calcula desde el color medio ya medido. Es una SEÑAL: solo modula, nunca impone.

export const AMBIENCES = ["golden_hour", "tungsten", "cool", "neutral"];

// color: { meanR, meanG, meanB }  ·  pm: { p50 } (opcional, para separar exterior/interior)
export function classifyAmbience(color, pm = {}) {
  const none = { ambience: "neutral", warmth: 0, coolness: 0 };
  if (!color) return none;
  const { meanR = 0, meanG = 0, meanB = 0 } = color;
  const avg = (meanR + meanG + meanB) / 3 || 1;
  const warmth = (meanR - meanB) / avg;   // >0 cálido (naranja) · <0 frío (azul)
  const p50 = pm.p50 ?? 128;

  if (warmth > 0.14) {
    // Cálido y con luz media/alta → exterior de última hora (golden hour): se preserva.
    if (p50 >= 90) return { ambience: "golden_hour", warmth, coolness: 0 };
    // Cálido y oscuro → interior/tungsteno: se corrige más, pero sin dejarlo neutro.
    return { ambience: "tungsten", warmth, coolness: 0 };
  }
  if (warmth < -0.14) return { ambience: "cool", warmth: 0, coolness: -warmth };
  return none;
}

// Factor de conservación de la calidez al corregir WB (0 = neutraliza del todo, 1 = no toca).
// golden hour conserva mucho; tungsteno corrige más; el resto sin cambio.
export function warmthPreserveFactor(ambience) {
  if (ambience === "golden_hour") return 0.7;
  if (ambience === "tungsten") return 0.4;
  return 0;
}
