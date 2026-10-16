// Whole-burst tournament: every original participates; persist only the final winner.
export const COMPARISON_VERSION = "burst-winner-v2";
export const photoIdentity = (p) => JSON.stringify([p.file?.webkitRelativePath || p.relativePath || p.name, p.size || p.file?.size || 0, p.file?.lastModified || p.lastModified || 0]);
export const groupIdentity = (photos) => JSON.stringify(photos.map(photoIdentity).sort());
export function completedComparison(photos) {
  const group = groupIdentity(photos);
  const c = photos[0]?.selectionComparison;
  return !!c && c.version === COMPARISON_VERSION && c.group === group && photos.every(p => p.selectionComparison?.group === group && p.selectionComparison?.winner === c.winner) && photos.filter(p => p.selectedForEdit).length === 1 && photos.some(p => p.selectedForEdit && photoIdentity(p) === c.winner);
}
export async function compareWholeBurst(photos, compare, checkAlive = () => {}) {
  if (photos.length < 2) throw new Error("Se necesitan al menos dos fotos");
  let round = [...photos], reason = "";
  while (round.length > 1) {
    const winners = [];
    for (let i = 0; i < round.length; i += 8) {
      checkAlive();
      const batch = round.slice(i, i + 8);
      if (batch.length === 1) { winners.push(batch[0]); continue; }
      const result = await compare(batch);
      checkAlive();
      const winner = batch.find(p => p.id === result?.winnerId);
      if (!winner || typeof result?.reason !== "string" || !result.reason.trim()) throw new Error("Comparación inválida: no se cambia la selección");
      winners.push(winner);
      reason = result.reason;
    }
    round = winners;
  }
  return { winner: round[0], comparison: { version: COMPARISON_VERSION, group: groupIdentity(photos), winner: photoIdentity(round[0]), group_size: photos.length, reason } };
}
export function applyComparison(all, members, result) {
  const ids = new Set(members.map(p => p.id));
  return all.map(p => ids.has(p.id) ? {...p, selectedForEdit: p.id === result.winner.id, isBest: p.id === result.winner.id, source: "ai", selectionComparison: result.comparison} : p);
}
