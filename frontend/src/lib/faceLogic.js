// Lógica pura de la capa de caras (sin dependencias del navegador ni de face-api → testeable).
export const MOVE_THRESHOLD = 0.06; // 6% del encuadre → la cara se movió de forma notable

// ¿Cambió la configuración de caras entre dos tomas? (nº distinto o alguna cara movida).
export function facesChanged(a, b) {
  const fa = a || [], fb = b || [];
  if (fa.length !== fb.length) return true;
  if (fa.length === 0) return false;
  const used = new Array(fb.length).fill(false);
  for (const f of fa) {
    let best = -1, bd = Infinity;
    fb.forEach((g, i) => {
      if (used[i]) return;
      const dd = Math.hypot(f.cx - g.cx, f.cy - g.cy);
      if (dd < bd) { bd = dd; best = i; }
    });
    if (best < 0 || bd > MOVE_THRESHOLD) return true;
    used[best] = true;
  }
  return false;
}
