import { Sparkles, ScanFace } from "lucide-react";

// Vista de progreso del análisis IA (extraída de SelectionStep para reducir complejidad).
export default function SelectionProgress({ phase, progress, faceProgress, fileCount }) {
  const isFaces = phase === "faces";
  const pct = isFaces ? faceProgress : progress;
  return (
    <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-8" data-testid="selection-analyzing">
      <div className="flex items-center gap-3">
        {isFaces ? <ScanFace className="h-5 w-5 animate-pulse text-emerald-400" /> : <Sparkles className="h-5 w-5 animate-pulse text-emerald-400" />}
        <h2 className="font-display text-lg font-semibold">{isFaces ? "Analizando caras…" : "Analizando con IA…"}</h2>
      </div>
      <p className="mt-1.5 text-sm text-zinc-500">
        {isFaces
          ? "Detectando personas para afinar las ráfagas (caras que cambian = fotos distintas) y marcar dudas. Todo en local."
          : "Evaluando enfoque y exposición de cada toma y agrupando ráfagas por similitud visual."}
      </p>
      <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-emerald-400 transition-all duration-200" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 font-mono text-xs text-zinc-500" data-testid="selection-progress-label">
        {pct}% · {fileCount} archivos
      </p>
    </section>
  );
}
