import { useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Star, Check, Plus, Sparkles, Hand } from "lucide-react";
import Thumbnail from "@/components/studio/Thumbnail";

export default function PhotoViewer({ list, index, onClose, onNav, onToggle }) {
  const p = list[index];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNav(-1);
      if (e.key === "ArrowRight") onNav(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNav]);
  if (!p) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur" data-testid="photo-viewer">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <span className="font-mono">{p.name}</span>
          {p.selectedForEdit
            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300"><Check className="h-3 w-3" /> Seleccionada</span>
            : <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-400">No seleccionada</span>}
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
            {p.source === "manual" ? <><Hand className="h-3 w-3" /> Manual</> : <><Sparkles className="h-3 w-3 text-emerald-400" /> IA</>}
          </span>
          {p.selectedForEdit && (
            <span className="inline-flex items-center gap-0.5" data-testid="viewer-stars">
              {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />)}
              <span className="ml-1 h-3 w-3 rounded-full bg-emerald-500" title="Etiqueta verde" />
            </span>
          )}
        </div>
        <button data-testid="viewer-close" onClick={onClose} className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5" /></button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
        <button data-testid="viewer-prev" onClick={() => onNav(-1)} className="absolute left-4 rounded-full bg-zinc-900/70 p-3 text-zinc-200 hover:bg-zinc-800"><ChevronLeft className="h-6 w-6" /></button>
        <div className="max-h-[70vh] max-w-[80vw]">
          <Thumbnail file={p.file || p.previewFile} fallback={p.thumb} alt={p.name} className="max-h-[70vh] w-auto rounded-lg" />
        </div>
        <button data-testid="viewer-next" onClick={() => onNav(1)} className="absolute right-4 rounded-full bg-zinc-900/70 p-3 text-zinc-200 hover:bg-zinc-800"><ChevronRight className="h-6 w-6" /></button>
      </div>

      <div className="flex items-center justify-center gap-3 px-4 py-4">
        <span className="text-xs text-zinc-500">{index + 1} / {list.length}</span>
        {p.selectedForEdit ? (
          <button data-testid="viewer-remove" onClick={() => onToggle(p.id)}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/20">
            <X className="h-4 w-4" /> Quitar de la selección
          </button>
        ) : (
          <button data-testid="viewer-add" onClick={() => onToggle(p.id)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:scale-[1.02]">
            <Plus className="h-4 w-4" /> Añadir a la selección (5★ + verde)
          </button>
        )}
      </div>
    </div>
  );
}
