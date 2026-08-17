import { Globe, Loader2, Trash2, Check, AlertTriangle, Palette, Scissors, Download } from "lucide-react";

export function StatusPill({ status }) {
  if (status === "ready") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300"><Check className="h-3 w-3" /> Listo</span>;
  if (status === "failed") return <span className="inline-flex items-center gap-1 rounded-full bg-rose-400/10 px-2 py-0.5 text-[10px] font-medium text-rose-300"><AlertTriangle className="h-3 w-3" /> Error</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300"><Loader2 className="h-3 w-3 animate-spin" /> Analizando</span>;
}

// Tarjeta de un estilo de fotógrafo (extraída de PhotographerStyles para reducir complejidad).
export default function StyleCard({ p, active, onUse, onDelete, onExport }) {
  const clickable = p.status === "ready";
  return (
    <div data-testid={`style-card-${p.id}`}
      onClick={() => clickable && onUse?.(p)}
      className={`rounded-xl border p-4 transition-all duration-200 ${clickable ? "cursor-pointer" : ""}
        ${active ? "border-emerald-400/70 ring-2 ring-emerald-400/30 bg-emerald-400/[0.05]" : "border-zinc-800 bg-[#1c1c22] hover:border-zinc-600"}`}>
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
          {p.representative_image
            ? <img src={p.representative_image} alt={p.name} className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center text-zinc-700"><Globe className="h-5 w-5" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
            <button data-testid={`delete-style-${p.id}`} onClick={(e) => onDelete(p.id, e)} className="text-zinc-600 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StatusPill status={p.status} />
            {p.status === "ready" && p.confidence != null && (
              <span className="font-mono text-[10px] text-zinc-500">{Math.round(p.confidence)}% confianza · {p.images_analyzed} img</span>
            )}
          </div>
        </div>
      </div>

      {p.status === "ready" && (
        <>
          {p.gallery_images?.length > 1 && (
            <div className="mt-3 flex gap-1.5 overflow-x-auto" data-testid={`style-gallery-${p.id}`}>
              {p.gallery_images.slice(0, 8).map((src, idx) => (
                <img key={src} src={src} alt={`ref ${idx + 1}`} className="h-12 w-12 shrink-0 rounded-md object-cover ring-1 ring-zinc-800" />
              ))}
            </div>
          )}
          {p.description && <p className="mt-3 text-xs leading-5 text-zinc-400">{p.description}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-[#101012] p-2.5">
              <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500"><Palette className="h-3 w-3 text-emerald-400" /> Color</p>
              <p className="mt-1 text-[11px] leading-4 text-zinc-400">{p.color_profile?.summary || `${p.color_profile?.contrast || "-"} · ${p.color_profile?.saturation || "-"} · piel ${p.color_profile?.skin_tone || "-"}`}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-[#101012] p-2.5">
              <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500"><Scissors className="h-3 w-3 text-emerald-400" /> Edición</p>
              <p className="mt-1 text-[11px] leading-4 text-zinc-400">{p.edit_profile?.summary || `${p.edit_profile?.crop_style || "-"} · consistencia ${p.edit_profile?.consistency || "-"}`}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            {active
              ? <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400"><Check className="h-3.5 w-3.5" /> Estilo de referencia seleccionado</p>
              : <p className="text-[11px] text-zinc-600">Toca para usar como estilo de referencia</p>}
            <button data-testid={`export-style-${p.id}`} onClick={(e) => onExport(p, e)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800">
              <Download className="h-3 w-3" /> Exportar .xmp
            </button>
          </div>
        </>
      )}
      {p.status === "failed" && <p className="mt-3 text-xs text-rose-400">{p.error_message || "No se pudo analizar la galería."}</p>}
    </div>
  );
}
