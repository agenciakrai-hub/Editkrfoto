import { useMemo, useState } from "react";
import { ArrowRight, Star, Plus, X, Sparkles, Hand, AlertTriangle } from "lucide-react";
import Thumbnail from "@/components/studio/Thumbnail";
import PhotoViewer from "@/components/studio/PhotoViewer";
import { WARNING_LABELS } from "@/lib/burstDecision";

function Stars() {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />)}
    </span>
  );
}

export default function ReviewStep({ initialPhotos, people = [], onChange, onContinue }) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [tab, setTab] = useState("selected"); // selected | unselected
  const [viewer, setViewer] = useState(null); // { index }

  const selected = useMemo(() => photos.filter((p) => p.selectedForEdit), [photos]);
  const unselected = useMemo(() => photos.filter((p) => !p.selectedForEdit), [photos]);
  const warnings = useMemo(() => photos.filter((p) => p.selectedForEdit && p.warning), [photos]);
  const list = tab === "selected" ? selected : (tab === "warnings" ? warnings : unselected);

  const applyToggle = (id) => {
    const next = photos.map((p) => (p.id === id ? { ...p, selectedForEdit: !p.selectedForEdit, source: "manual" } : p));
    setPhotos(next);
    onChange && onChange(next); // persistencia inmediata (decisión manual)
    return next;
  };

  const openViewer = (photo) => {
    setViewer({ id: photo.id });
  };

  const Card = ({ p }) => (
    <div data-testid={`review-card-${p.name}`}
      className={`group overflow-hidden rounded-xl border transition-all ${p.selectedForEdit ? "border-emerald-400/60 bg-emerald-400/[0.04]" : "border-zinc-800 bg-[#141418]"}`}>
      <button data-testid={`open-viewer-${p.name}`} onClick={() => openViewer(p)} className="block w-full">
        <div className="relative aspect-[3/2] w-full bg-zinc-900">
          <Thumbnail file={p.file} fallback={p.thumb} alt={p.name} className="aspect-[3/2] w-full" dimmed={!p.selectedForEdit} />
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300 backdrop-blur">
            {p.source === "manual" ? <><Hand className="h-3 w-3" /> Manual</> : <><Sparkles className="h-3 w-3 text-emerald-400" /> IA</>}
          </span>
          {p.selectedForEdit && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-emerald-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950" data-testid={`stars-${p.name}`}>
              <Stars /> <span className="h-2.5 w-2.5 rounded-full bg-emerald-700" title="Verde" />
            </span>
          )}
          {p.selectedForEdit && p.warning && (
            <span className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950" data-testid={`warning-${p.name}`}>
              <AlertTriangle className="h-3 w-3" /> Revisar
            </span>
          )}
        </div>
      </button>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] text-zinc-400">{p.name}</p>
          <p className={`text-[11px] font-medium ${p.selectedForEdit ? (p.warning ? "text-amber-400" : "text-emerald-400") : "text-zinc-500"}`}>
            {p.selectedForEdit ? (p.warning ? "Seleccionada · revisar" : "Seleccionada · 5★ + verde") : "No seleccionada"}
          </p>
          {p.selectedForEdit && p.warning && p.warningTypes?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1" data-testid={`warning-types-${p.name}`}>
              {p.warningTypes.map((t) => (
                <span key={t} className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                  {WARNING_LABELS[t] || t}
                </span>
              ))}
            </div>
          )}
        </div>
        {p.selectedForEdit ? (
          <button data-testid={`remove-${p.name}`} onClick={() => applyToggle(p.id)} title="Quitar de la selección"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-500/40 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/10"><X className="h-3 w-3" /> Quitar</button>
        ) : (
          <button data-testid={`add-${p.name}`} onClick={() => applyToggle(p.id)} title="Añadir a la selección"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-400 px-2 py-1 text-[11px] font-semibold text-zinc-950 hover:scale-[1.03]"><Plus className="h-3 w-3" /> Añadir</button>
        )}
      </div>
    </div>
  );

  return (
    <section className="animate-fade-up" data-testid="review-step">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-800 bg-[#141418] p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Revisión y selección final</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            La IA propone; tú decides. Las <span className="text-emerald-400">seleccionadas</span> reciben 5★ + etiqueta verde
            y son las que se exportan al XMP. Las descartadas se conservan por si quieres recuperarlas.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2" data-testid="review-tabs">
        <button data-testid="tab-selected" onClick={() => setTab("selected")}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${tab === "selected" ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"}`}>
          Seleccionadas ({selected.length})
        </button>
        <button data-testid="tab-unselected" onClick={() => setTab("unselected")}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${tab === "unselected" ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"}`}>
          No seleccionadas ({unselected.length})
        </button>
        <button data-testid="tab-warnings" onClick={() => setTab("warnings")}
          className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${tab === "warnings" ? "border-amber-400/50 bg-amber-400/10 text-amber-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"}`}>
          <AlertTriangle className="h-3.5 w-3.5" /> Con advertencia ({warnings.length})
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => <Card key={p.id} p={p} />)}
      </div>
      {list.length === 0 && (
        <p className="mt-6 text-sm text-zinc-500" data-testid="review-empty">
          {tab === "selected" ? "No hay fotos en la selección. Añade alguna desde 'No seleccionadas'."
            : tab === "warnings" ? "Ninguna selección tiene advertencias. ¡Todo limpio!"
            : "No hay fotos descartadas."}
        </p>
      )}

      <button data-testid="review-continue-btn" disabled={!selected.length}
        onClick={() => onContinue(photos)}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40">
        Continuar con {selected.length} seleccionadas <ArrowRight className="h-4 w-4" />
      </button>

      {viewer && (
        <PhotoViewer
          list={list}
          index={Math.max(0, list.findIndex((p) => p.id === viewer.id))}
          onClose={() => setViewer(null)}
          onNav={(d) => setViewer((v) => {
            const cur = list.findIndex((p) => p.id === v.id);
            const ni = Math.min(list.length - 1, Math.max(0, cur + d));
            return { ...v, id: list[ni]?.id ?? v.id };
          })}
          onToggle={(id) => {
            const next = applyToggle(id);
            // tras togglear, la foto sale de la lista actual: fijar el visor en la posición equivalente
            const newList = tab === "selected" ? next.filter((p) => p.selectedForEdit) : next.filter((p) => !p.selectedForEdit);
            if (!newList.length) { setViewer(null); return; }
            setViewer((v) => ({ ...v, id: newList[Math.min(newList.length - 1, Math.max(0, list.findIndex((p) => p.id === id)))].id }));
          }}
        />
      )}
    </section>
  );
}
