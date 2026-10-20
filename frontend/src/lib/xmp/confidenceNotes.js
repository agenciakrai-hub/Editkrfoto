// Mensajes de baja confianza (auditoría del motor IA) para el usuario. Puro → testeable.
export const WB_LOW = 0.6;
export const EDIT_LOW = 0.6;

const pct = (v) => `${Math.round(v * 100)}%`;

export function confidenceNotes(audit) {
  if (!audit) return [];
  const notes = [];
  const wbc = Number(audit.whiteBalanceConfidence);
  if (audit.wbSource === "none" || (!audit.wbApplied && !(wbc > 0))) {
    notes.push({ level: "info", text: "Balance de blancos: sin datos de color fiables; se mantiene «Como se tomó». Ajústalo en Lightroom si la luz lo requiere." });
  } else if (Number.isFinite(wbc) && wbc < WB_LOW) {
    const src = audit.wbSource === "grayworld" ? "estimado por gris medio, sin piel de referencia" : "con poca piel de referencia";
    const action = audit.wbApplied
      ? "Revisa Temperatura y Tinte en Lightroom antes de sincronizar el resto"
      : "No se corrigió; comprueba si la escena tiene dominante";
    const amb = audit.ambience === "tungsten" || audit.ambience === "golden_hour"
      ? " La luz cálida de ambiente se ha conservado a propósito." : "";
    notes.push({ level: "warn", text: `Balance de blancos con baja confianza (${pct(wbc)}, ${src}). ${action}.${amb}` });
  }
  const ec = Number(audit.editingConfidence);
  if (Number.isFinite(ec) && ec < EDIT_LOW) {
    notes.push({ level: "warn", text: `Edición con baja confianza (${pct(ec)}): escena difícil (luces y sombras recortadas). Revisa exposición, luces y sombras.` });
  }
  return notes;
}
