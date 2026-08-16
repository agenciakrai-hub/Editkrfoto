import { useState } from "react";
import { ArrowRight, Check, Layers, Users, User, UserX, AlertTriangle, UserCheck } from "lucide-react";
import Thumbnail from "@/components/studio/Thumbnail";

export default function ReviewStep({ initialPhotos, onContinue }) {
  const [photos, setPhotos] = useState(initialPhotos);

  const toggle = (id) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, selectedForEdit: !p.selectedForEdit } : p)));
  };

  const selectedCount = photos.filter((p) => p.selectedForEdit).length;

  return (
    <section className="animate-fade-up" data-testid="review-step">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-800 bg-[#141418] p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Revisa la selección</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Toca cualquier foto para incluirla o excluirla de la cola de edición IA. Las verdes van a edición.
            <span className="mt-1 block text-xs text-zinc-600">
              <span className="text-amber-400">⚠ Dudas</span> = la IA no tiene una ganadora clara (decides tú) ·
              <span className="text-emerald-400"> Cara distinta</span> = misma ráfaga pero las caras cambiaron (foto diferente).
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-300" data-testid="review-count">
          {selectedCount} en cola de edición
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {photos.map((p) => (
          <button key={p.id} data-testid={`photo-${p.name}`} onClick={() => toggle(p.id)}
            className={`group relative overflow-hidden rounded-lg border text-left transition-all duration-200
              ${p.selectedForEdit ? "border-emerald-400/70 ring-2 ring-emerald-400/40" : "border-zinc-800 hover:border-zinc-600"}`}>
            <div className="relative aspect-[4/3] w-full bg-zinc-900">
              <Thumbnail file={p.file} fallback={p.thumb} alt={p.name} className="aspect-[4/3] w-full" dimmed={!p.selectedForEdit} />
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
        ))}
      </div>

      <button data-testid="review-continue-btn" disabled={!selectedCount}
        onClick={() => onContinue(photos)}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40">
        Continuar a perfil de cámara <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
