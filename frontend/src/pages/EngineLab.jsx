import { useRef, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { FlaskConical, FolderUp, Loader2, Zap } from "lucide-react";
import { isRaw } from "@/lib/rawSelection";
import { extractThumb } from "@/lib/rawThumb";
import { analyzeFileForLab, mapLimit } from "@/lib/imageAnalysis";
import { computeBasic, PRECISION_PROFILES } from "@/lib/rawaistudio/exposureEngine";

const SAMPLE_MAX = 24;
const PARAMS = [
  ["exposure", "Exp", " EV"],
  ["contrast", "Contr", ""],
  ["highlights", "Luces", ""],
  ["shadows", "Somb", ""],
  ["whites", "Bl", ""],
  ["blacks", "Ng", ""],
];
const SCENE_LABEL = {
  high_key: "Clave alta", low_key: "Clave baja", backlit: "Contraluz", flash: "Flash", normal: "Normal",
};

function fmt(key, v) {
  if (v == null) return "—";
  const s = v > 0 ? "+" : "";
  return key === "exposure" ? `${s}${Number(v).toFixed(2)}` : `${s}${Math.round(v)}`;
}

function Cell({ pkey, oldV, newV }) {
  const diff = Math.abs((newV ?? 0) - (oldV ?? 0)) > (pkey === "exposure" ? 0.03 : 1);
  return (
    <div className="rounded-md border border-zinc-800 bg-[#101012] px-2 py-1.5 text-center" data-testid={`cell-${pkey}`}>
      <span className="block text-[9px] uppercase tracking-wide text-zinc-600">{PARAMS.find((p) => p[0] === pkey)[1]}</span>
      <span className="block font-mono text-[11px] text-zinc-500">{fmt(pkey, oldV)}</span>
      <span className={`block font-mono text-xs font-semibold ${diff ? "text-emerald-400" : "text-zinc-400"}`}>{fmt(pkey, newV)}</span>
    </div>
  );
}

export default function EngineLab() {
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]); // [{ name, thumb, photometrics, oldBasic }]
  const [mode, setMode] = useState("balanced");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [folderName, setFolderName] = useState(null);
  const [full, setFull] = useState(false);

  const sampleEven = (arr, max) => {
    if (arr.length <= max) return arr;
    const step = arr.length / max;
    return Array.from({ length: max }, (_, i) => arr[Math.floor(i * step)]);
  };

  const onPick = async (e) => {
    const all = Array.from(e.target.files || []);
    e.target.value = "";
    const raws = all.filter((f) => isRaw(f.name));
    if (!raws.length) { toast.error("No hay RAW/JPG en esa carpeta"); return; }
    setFolderName(raws[0].webkitRelativePath?.split("/")[0] || "Carpeta");
    const sample = full ? raws : sampleEven(raws, SAMPLE_MAX);
    setBusy(true); setRows([]); setProgress({ done: 0, total: sample.length });
    try {
      const results = await mapLimit(sample, 4, async (file) => {
        const [analysis, thumb] = await Promise.all([
          analyzeFileForLab(file, "balanced"),
          extractThumb(file),
        ]);
        return analysis ? { name: file.name, thumb, photometrics: analysis.photometrics, oldBasic: analysis.oldBasic } : null;
      }, (done) => setProgress((p) => ({ ...p, done })));
      const ok = results.filter(Boolean);
      setRows(ok);
      if (!ok.length) toast.error("No se pudo extraer la vista previa de estas fotos");
      else toast.success(`${ok.length} fotos analizadas`, { description: "Compara motor actual vs v2" });
    } finally { setBusy(false); }
  };

  return (
    <AppShell>
      <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Laboratorio · beta</p>
      <h1 className="font-display mt-1 flex items-center gap-2 text-2xl font-semibold">
        <FlaskConical className="h-6 w-6 text-emerald-400" /> Motor de ajustes básicos v2
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500">
        Compara el motor actual con el nuevo motor de <span className="text-zinc-300">dos capas</span> (fotometría ponderada
        al sujeto + contexto de escena, 100% local y sin coste). Cada tarjeta muestra el valor <span className="text-zinc-500">antiguo</span> (arriba)
        y el <span className="text-emerald-400">nuevo</span> (abajo). Los presets/estilos nunca tocan estos básicos.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-800 bg-[#141418] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={onPick} data-testid="lab-folder-input" />
          <button data-testid="lab-pick-folder-btn" onClick={() => inputRef.current?.click()} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40">
            <FolderUp className="h-4 w-4" /> Elegir carpeta ({full ? "todas" : `muestra ${SAMPLE_MAX}`})
          </button>

          <label data-testid="lab-full-toggle" className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} disabled={busy}
              className="h-3.5 w-3.5 accent-emerald-400" />
            Analizar todas (puede tardar más)
          </label>

          <div className="flex items-center gap-1.5" data-testid="lab-mode-switch">
            {Object.values(PRECISION_PROFILES).map((p) => (
              <button key={p.key} data-testid={`lab-mode-${p.key}`} onClick={() => setMode(p.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === p.key ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"
                }`}>
                {p.label} <span className="text-zinc-600">±{p.expMax}EV</span>
              </button>
            ))}
          </div>
        </div>

        {folderName && <p className="mt-3 text-xs text-zinc-500">{folderName} · muestra de {rows.length || progress.total} fotos</p>}
        {busy && (
          <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400" data-testid="lab-progress">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> Analizando {progress.done}/{progress.total}…
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="lab-results">
          {rows.map((r) => {
            const newBasic = computeBasic(r.photometrics, mode);
            return (
              <div key={r.name} data-testid={`lab-card-${r.name}`} className="overflow-hidden rounded-xl border border-zinc-800 bg-[#141418]">
                <div className="flex items-center gap-3 border-b border-zinc-800 p-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                    {r.thumb ? <img src={r.thumb} alt={r.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-zinc-700"><Zap className="h-5 w-5" /></div>}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-zinc-200">{r.name}</p>
                    <span className="mt-1 inline-block rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] font-medium text-emerald-300" data-testid={`lab-scene-${r.name}`}>
                      {SCENE_LABEL[r.photometrics.scene]}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-1.5 p-3">
                  {PARAMS.map(([k]) => <Cell key={k} pkey={k} oldV={r.oldBasic[k]} newV={newBasic[k]} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rows.length === 0 && !busy && (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 bg-[#141418] p-12 text-center" data-testid="lab-empty">
          <FlaskConical className="mx-auto h-9 w-9 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-400">Elige una carpeta de RAW para comparar los dos motores</p>
          <p className="mt-1 text-xs text-zinc-600">Nada sale de tu equipo · los RAW no se modifican.</p>
        </div>
      )}
    </AppShell>
  );
}
