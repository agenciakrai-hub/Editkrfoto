import { Check, Layers, Users, User, UserX, AlertTriangle, UserCheck } from "lucide-react";
import Thumbnail from "@/components/studio/Thumbnail";

// Tarjeta de foto de la revisión (extraída de ReviewStep para reducir complejidad).
export default function PhotoCard({ p, onToggle }) {
  return (
    <button data-testid={`photo-${p.name}`} onClick={() => onToggle(p.id)}
      className={`group relative overflow-hidden rounded-lg border text-left transition-all duration-200
        ${p.selectedForEdit ? "border-emerald-400/70 ring-2 ring-emerald-400/40" : "border-zinc-800 hover:border-zinc-600"}`}>
      <div className="relative aspect-[4/3] w-full bg-zinc-900">
        <Thumbnail file={p.file || p.previewFile} fallback={p.thumb} alt={p.name} className="aspect-[4/3] w-full" dimmed={!p.selectedForEdit} />
        {p.selectedForEdit && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400 text-zinc-950 shadow">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        )}
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 backdrop-blur">
          <Layers className="h-3 w-3" /> R{p.burstId}
        </span>
        {p.facesAnalyzed && (
          <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 backdrop-blur" data-testid={`faces-${p.name}`}>
            {p.noPeople ? <UserX className="h-3 w-3 text-zinc-400" /> : p.isGroup ? <Users className="h-3 w-3 text-sky-300" /> : <User className="h-3 w-3 text-zinc-200" />}
            {p.noPeople ? "Sin personas" : p.faceCount}
          </span>
        )}
        <div className="absolute left-2 bottom-2 flex flex-col gap-1">
          {p.doubt && (
            <span className="flex w-fit items-center gap-1 rounded-md bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950 shadow" data-testid={`doubt-${p.name}`}>
              <AlertTriangle className="h-3 w-3" /> Dudas
            </span>
          )}
          {p.faceDistinct && (
            <span className="flex w-fit items-center gap-1 rounded-md bg-emerald-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950 shadow" data-testid={`distinct-${p.name}`}>
              <UserCheck className="h-3 w-3" /> Cara distinta
            </span>
          )}
        </div>
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate font-mono text-[11px] text-zinc-400">{p.name}</p>
        <p className="text-[10px] text-zinc-600">calidad {p.score}</p>
      </div>
    </button>
  );
}
