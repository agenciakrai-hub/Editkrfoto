import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { BookOpen, FolderUp, Loader2, FileDown, RotateCcw, Sparkles, Star, Layers } from "lucide-react";
import { isRaw } from "@/lib/rawSelection";
import { preparePhotos, thumbBase64FromFile } from "@/lib/album/albumImage";
import { planAlbum, DENSITY } from "@/lib/album/layoutEngine";
import { exportAlbumPdf } from "@/lib/album/albumPdf";
import api from "@/lib/api";

// Vista previa de un spread (página doble 2:1): dibuja los slots en coordenadas normalizadas.
function SpreadPreview({ spread }) {
  return (
    <div className="relative w-full overflow-hidden rounded-md bg-white shadow-inner" style={{ aspectRatio: "2 / 1" }}
      data-testid={`spread-${spread.index}`}>
      <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-zinc-200" />
      {spread.slots.map((s, i) => (
        <div key={i} className="absolute overflow-hidden"
          style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }}>
          <img src={s.photo.url} alt={s.photo.name} className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

export default function AlbumStudio() {
  const inputRef = useRef(null);
  const [photos, setPhotos] = useState([]);   // [{ name, file, url, aspect }]
  const [folderName, setFolderName] = useState(null);
  const [density, setDensity] = useState("balanced");
  const [cover, setCover] = useState(true);
  const [phase, setPhase] = useState("idle"); // idle | preparing | ready | ai | exporting
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [aiReason, setAiReason] = useState(null);

  const spreads = useMemo(() => (photos.length ? planAlbum(photos, { density, cover }) : []), [photos, density, cover]);

  const reset = () => {
    photos.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    setPhotos([]); setFolderName(null); setPhase("idle"); setProgress({ done: 0, total: 0 }); setAiReason(null);
  };

  const onPick = async (e) => {
    const all = Array.from(e.target.files || []);
    e.target.value = "";
    const raws = all.filter((f) => isRaw(f.name));
    if (!raws.length) { toast.error("No hay RAW/JPG en esa carpeta"); return; }
    setFolderName(raws[0].webkitRelativePath?.split("/")[0] || "Carpeta");
    setPhase("preparing");
    setProgress({ done: 0, total: raws.length });
    const prepared = await preparePhotos(raws, (done) => setProgress((p) => ({ ...p, done })));
    setPhotos(prepared);
    setPhase("ready");
    toast.success(`${prepared.length} fotos listas`, { description: "Ajusta la densidad o exporta el PDF" });
  };

  const orderWithAi = async () => {
    if (photos.length < 2) return;
    setPhase("ai");
    setAiReason(null);
    try {
      const sample = photos.slice(0, 24);
      const payload = [];
      for (const p of sample) {
        const b64 = await thumbBase64FromFile(p.file, 320);
        if (b64) payload.push({ filename: p.name, image_base64: b64 });
      }
      const { data } = await api.post("/ai/album-order", { photos: payload, context: folderName });
      const order = data.ordered_filenames || [];
      const byName = new Map(photos.map((p) => [p.name, p]));
      const seen = new Set();
      const reordered = [];
      for (const n of order) { const p = byName.get(n); if (p && !seen.has(n)) { reordered.push(p); seen.add(n); } }
      for (const p of photos) if (!seen.has(p.name)) reordered.push(p);
      setPhotos(reordered);
      setAiReason(data.reason || "Reordenado para narrar el día.");
      toast.success("Álbum reordenado con IA");
    } catch (err) {
      const msg = err?.response?.status === 402 ? "Necesitas acceso activo para usar la IA" : "La IA no pudo reordenar el álbum";
      toast.error(msg);
    } finally {
      setPhase("ready");
    }
  };

  const exportPdf = async () => {
    if (!spreads.length) return;
    setPhase("exporting");
    setProgress({ done: 0, total: spreads.length });
    try {
      await exportAlbumPdf(spreads, {
        filename: `Album_${(folderName || "RAWAI").replace(/\s+/g, "_")}`,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      toast.success("PDF del álbum descargado", { description: `${spreads.length} páginas dobles` });
    } catch {
      toast.error("No se pudo generar el PDF");
    } finally {
      setPhase("ready");
    }
  };

  const busy = phase === "preparing";
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <AppShell>
      <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Maquetación</p>
      <h1 className="font-display mt-1 flex items-center gap-2 text-2xl font-semibold">
        <BookOpen className="h-6 w-6 text-emerald-400" /> Álbum AI
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500">
        La IA reparte tus fotos en <span className="text-zinc-300">páginas dobles</span> con plantillas automáticas según
        orientación y densidad, y puede <span className="text-zinc-300">ordenar el día como una historia</span>
        (preparativos → ceremonia → pareja → fiesta). Exporta un <span className="text-zinc-300">PDF</span> listo para maquetar.
        Todo local: tus RAW no salen de tu equipo.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-800 bg-[#141418] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={onPick} data-testid="album-folder-input" />
          <button data-testid="album-pick-folder-btn" onClick={() => inputRef.current?.click()} disabled={busy || phase === "exporting"}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40">
            <FolderUp className="h-4 w-4" /> Elegir carpeta
          </button>

          <div className="flex items-center gap-1.5" data-testid="album-density-switch">
            <span className="mr-1 inline-flex items-center gap-1 text-xs text-zinc-500"><Layers className="h-3.5 w-3.5" /> Densidad</span>
            {Object.values(DENSITY).map((d) => (
              <button key={d.key} data-testid={`album-density-${d.key}`} onClick={() => setDensity(d.key)} disabled={busy}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                  density === d.key ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"
                }`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-400" data-testid="album-cover-toggle">
            <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} className="accent-emerald-400" />
            Portada (primera foto a página completa)
          </label>
        </div>

        {folderName && (
          <p className="mt-3 text-xs text-zinc-500" data-testid="album-folder-name">
            {folderName} · {phase === "preparing" ? `${progress.total} fotos` : `${photos.length} fotos · ${spreads.length} páginas dobles`}
          </p>
        )}

        {busy && (
          <div className="mt-3" data-testid="album-progress">
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-emerald-400 transition-all duration-200" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 flex items-center gap-2 font-mono text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" /> Preparando {progress.done}/{progress.total} ({pct}%)
            </p>
          </div>
        )}

        {phase !== "idle" && photos.length > 0 && phase !== "preparing" && (
          <div className="mt-5 flex flex-wrap gap-3 border-t border-zinc-800 pt-5" data-testid="album-actions">
            <button data-testid="album-ai-order-btn" onClick={orderWithAi} disabled={phase === "ai" || phase === "exporting"}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition-transform hover:scale-[1.02] disabled:opacity-40">
              {phase === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Ordenar con IA
            </button>
            <button data-testid="album-export-btn" onClick={exportPdf} disabled={phase === "ai" || phase === "exporting"}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40">
              {phase === "exporting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              {phase === "exporting" ? `Generando ${progress.done}/${progress.total}` : `Exportar PDF (${spreads.length} páginas)`}
            </button>
            <button data-testid="album-reset-btn" onClick={reset} disabled={phase === "exporting"}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">
              <RotateCcw className="h-4 w-4" /> Otra carpeta
            </button>
          </div>
        )}

        {aiReason && (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-200/90" data-testid="album-ai-reason">
            <Star className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {aiReason}
          </p>
        )}
      </div>

      {photos.length > 0 && phase !== "preparing" && (
        <div className="mt-6 space-y-6" data-testid="album-spreads">
          {spreads.map((s) => (
            <div key={s.index} className="rounded-xl border border-zinc-800 bg-[#141418] p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                  {s.kind === "cover" ? "Portada" : `Página doble ${cover ? s.index : s.index + 1}`}
                </span>
                <span className="rounded-full border border-zinc-700 bg-[#1c1c22] px-2 py-0.5 text-[10px] text-zinc-400">{s.slots.length} fotos</span>
              </div>
              <div className="mx-auto max-w-3xl">
                <SpreadPreview spread={s} />
              </div>
            </div>
          ))}
        </div>
      )}

      {phase === "idle" && (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 bg-[#141418] p-12 text-center" data-testid="album-empty">
          <BookOpen className="mx-auto h-9 w-9 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-400">Elige una carpeta con la selección final y la IA maquetará el álbum</p>
          <p className="mt-1 text-xs text-zinc-600">Plantillas automáticas · orden narrativo con IA · export a PDF · todo en tu equipo.</p>
        </div>
      )}
    </AppShell>
  );
}
