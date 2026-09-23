import { useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { Wand2, FolderUp, Loader2, Download, RotateCcw } from "lucide-react";
import { isRaw } from "@/lib/rawSelection";
import { analyzeFile, mapLimit } from "@/lib/imageAnalysis";
import { PRECISION_PROFILES } from "@/lib/rawaistudio/exposureEngine";
import { computeAiBasics, NEUTRAL_AI_BASICS } from "@/lib/rawaistudio/basicEngine";
import { buildStyleXmp } from "@/lib/xmp/buildXmp";
import { embedXmpInDng } from "@/lib/dngXmp";
import LightroomPlugin from "@/components/studio/LightroomPlugin";
import PhotoEditor from "@/components/studio/PhotoEditor";
import Thumbnail from "@/components/studio/Thumbnail";
import { Pencil } from "lucide-react";

const isDng = (name) => /\.dng$/i.test(name || "");

const SCENE_LABEL = {
  high_key: "Clave alta", low_key: "Clave baja", backlit: "Contraluz", flash: "Flash", normal: "Normal",
};

export default function AutoBasic() {
  const inputRef = useRef(null);
  const [items, setItems] = useState([]); // [{ name, photometrics }]
  const [folderName, setFolderName] = useState(null);
  const [mode, setMode] = useState("balanced");
  const [profile, setProfile] = useState("Adobe Standard");
  const [phase, setPhase] = useState("idle"); // idle | analyzing | ready | zipping
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [edits, setEdits] = useState({});      // name → básicos editados a mano
  const [editing, setEditing] = useState(null); // item en edición

  const reset = () => { setItems([]); setFolderName(null); setPhase("idle"); setProgress({ done: 0, total: 0 }); setEdits({}); };

  const onPick = async (e) => {
    const all = Array.from(e.target.files || []);
    e.target.value = "";
    const raws = all.filter((f) => isRaw(f.name));
    if (!raws.length) { toast.error("No hay RAW/JPG en esa carpeta"); return; }
    setFolderName(raws[0].webkitRelativePath?.split("/")[0] || "Carpeta");
    setPhase("analyzing");
    setProgress({ done: 0, total: raws.length });
    const results = await mapLimit(raws, 4, async (file) => {
      const m = await analyzeFile(file);
      return { name: file.name, file, photometrics: m?.photometrics || null, color: m?.color || null };
    }, (done) => setProgress((p) => ({ ...p, done })));
    setItems(results);
    setPhase("ready");
    toast.success(`${results.length} fotos analizadas`, { description: "Listo para exportar los XMP" });
  };

  const exportZip = async () => {
    if (!items.length) return;
    setPhase("zipping");
    try {
      const zip = new JSZip();
      let embedded = 0, sidecars = 0;
      for (const it of items) {
        const basic = basicFor(it);
        const xmp = buildStyleXmp(it.name, basic, profile || "Adobe Standard");
        if (isDng(it.name) && it.file) {
          // DNG: Lightroom ignora el sidecar → escribimos el XMP DENTRO del .dng
          try {
            const bytes = new Uint8Array(await it.file.arrayBuffer());
            const res = embedXmpInDng(bytes, xmp);
            if (res.ok) { zip.file(it.name, res.bytes); embedded++; continue; }
          } catch (err) { /* si falla, caemos al sidecar como respaldo */
            if (process.env.NODE_ENV === "development") console.warn("Fallo al embeber XMP en DNG, se usa sidecar:", it.name, err);
          }
        }
        zip.file(it.name.replace(/\.[^.]+$/, "") + ".xmp", xmp);
        sidecars++;
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const safe = (folderName || "RAWAI").replace(/\s+/g, "_");
      saveAs(blob, `RAWAI_${safe}_XMP.zip`);
      toast.success("ZIP descargado", { description: `${embedded} DNG con ajustes dentro · ${sidecars} sidecar .xmp` });
    } catch {
      toast.error("No se pudo generar el ZIP");
    } finally {
      setPhase("ready");
    }
  };

  const busy = phase === "analyzing";
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  // Construye los básicos de una foto: edición manual si existe, si no lo que calculó la IA.
  const basicFor = (it) => edits[it.name]
    ? edits[it.name]
    : (it.photometrics
      ? computeAiBasics({ photometrics: it.photometrics, color: it.color }, { mode, deadzone: "prudent", wbStrength: 0.5 }).aiBasicAdjustments
      : NEUTRAL_AI_BASICS);

  // Para "Enviar a Lightroom": genera los XMP (sidecar) por nombre de archivo original.
  const buildPhotosForSync = () => items.map((it) => ({
    filename: it.name,
    xmp_content: buildStyleXmp(it.name, basicFor(it), profile || "Adobe Standard"),
  }));

  const sceneCounts = items.reduce((acc, it) => {
    const s = it.photometrics?.scene;
    if (s) acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const sceneEntries = Object.entries(sceneCounts).sort((a, b) => b[1] - a[1]);

  return (
    <AppShell>
      <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Herramienta rápida</p>
      <h1 className="font-display mt-1 flex items-center gap-2 text-2xl font-semibold">
        <Wand2 className="h-6 w-6 text-emerald-400" /> Auto básicos → XMP
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500">
        El motor de IA analiza <span className="text-zinc-300">todas</span> las fotos de la carpeta y ajusta los
        <span className="text-zinc-300"> parámetros básicos</span> (exposición, contraste, luces, sombras, blancos y negros)
        de cada una. Después exportas el ZIP con los .xmp listos para Lightroom. Sin ráfagas, sin presets: solo básicos.
        Todo local, tus RAW no se modifican.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-800 bg-[#141418] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={onPick} data-testid="autobasic-folder-input" />
          <button data-testid="autobasic-pick-folder-btn" onClick={() => inputRef.current?.click()} disabled={busy || phase === "zipping"}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40">
            <FolderUp className="h-4 w-4" /> Elegir carpeta
          </button>

          <div className="flex items-center gap-1.5" data-testid="autobasic-mode-switch">
            {Object.values(PRECISION_PROFILES).map((p) => (
              <button key={p.key} data-testid={`autobasic-mode-${p.key}`} onClick={() => setMode(p.key)} disabled={busy}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                  mode === p.key ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"
                }`}>
                {p.label} <span className="text-zinc-600">±{p.expMax}EV</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="text-xs text-zinc-500">Perfil de cámara</label>
          <input data-testid="autobasic-profile-input" value={profile} onChange={(e) => setProfile(e.target.value)} disabled={busy}
            className="w-56 rounded-lg border border-zinc-700 bg-[#101012] px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-400/60 disabled:opacity-40" />
        </div>

        {folderName && (
          <p className="mt-3 text-xs text-zinc-500" data-testid="autobasic-folder-name">
            {folderName} · {phase === "analyzing" ? `${progress.total} fotos` : `${items.length} fotos analizadas`}
          </p>
        )}

        {busy && (
          <div className="mt-3" data-testid="autobasic-progress">
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-emerald-400 transition-all duration-200" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 flex items-center gap-2 font-mono text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" /> Analizando {progress.done}/{progress.total} ({pct}%)
            </p>
          </div>
        )}

        {phase === "ready" && items.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-3 border-t border-zinc-800 pt-5" data-testid="autobasic-ready">
            <button data-testid="autobasic-export-btn" onClick={exportZip}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02]">
              <Download className="h-4 w-4" /> Exportar ZIP con {items.length} XMP
            </button>
            <button data-testid="autobasic-reset-btn" onClick={reset}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
              <RotateCcw className="h-4 w-4" /> Otra carpeta
            </button>
          </div>
        )}

        {phase === "zipping" && (
          <p className="mt-5 flex items-center gap-2 border-t border-zinc-800 pt-5 text-sm text-zinc-400" data-testid="autobasic-zipping">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> Generando ZIP…
          </p>
        )}
      </div>

      {phase === "ready" && items.length > 0 && (
        <>
          {sceneEntries.length > 0 && (
            <div className="mt-6 rounded-xl border border-zinc-800 bg-[#141418] p-5" data-testid="autobasic-scene-summary">
              <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Contextos de escena detectados</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sceneEntries.map(([s, n]) => (
                  <span key={s} data-testid={`scene-${s}`} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-[#1c1c22] px-3 py-1 text-xs text-zinc-300">
                    {SCENE_LABEL[s] || s} <span className="font-mono text-emerald-400">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-6 rounded-xl border border-zinc-800 bg-[#141418] p-5" data-testid="autobasic-grid">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Fotos ({items.length}) · pulsa Editar para afinar</p>
              {Object.keys(edits).length > 0 && <span className="text-xs text-emerald-400">{Object.keys(edits).length} editadas</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {items.slice(0, 60).map((it) => (
                <div key={it.name} data-testid={`grid-item-${it.name}`} className="group relative overflow-hidden rounded-lg border border-zinc-800">
                  <div className="relative aspect-[3/2] w-full">
                    <Thumbnail file={it.file} alt={it.name} className="aspect-[3/2] w-full" />
                    {edits[it.name] && <span className="absolute left-1.5 top-1.5 rounded bg-emerald-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950">Editada</span>}
                    <button data-testid={`edit-photo-${it.name}`} onClick={() => setEditing(it)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950"><Pencil className="h-3.5 w-3.5" /> Editar</span>
                    </button>
                  </div>
                  <p className="truncate px-2 py-1 font-mono text-[10px] text-zinc-500">{it.name}</p>
                </div>
              ))}
            </div>
            {items.length > 60 && <p className="mt-2 text-xs text-zinc-600">Mostrando 60 de {items.length}. La exportación incluye todas.</p>}
          </div>
          <LightroomPlugin
            getPhotos={buildPhotosForSync}
            title="Enviar a Lightroom (sincroniza solo)"
            subtitle="Envía los básicos de esta carpeta al plugin; en Lightroom selecciona las fotos y sincroniza." />
        </>
      )}

      {editing && (
        <PhotoEditor item={editing} initial={basicFor(editing)} cameraProfile={profile || "Adobe Standard"}
          onSave={(adj) => { setEdits((e) => ({ ...e, [editing.name]: adj })); setEditing(null); toast.success(`Ajustes guardados: ${editing.name}`); }}
          onClose={() => setEditing(null)} />
      )}

      {phase === "idle" && (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 bg-[#141418] p-12 text-center" data-testid="autobasic-empty">
          <Wand2 className="mx-auto h-9 w-9 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-400">Elige una carpeta y la IA ajustará los básicos de cada foto</p>
          <p className="mt-1 text-xs text-zinc-600">Elige el modo de precisión antes de exportar · nada sale de tu equipo.</p>
        </div>
      )}
    </AppShell>
  );
}
