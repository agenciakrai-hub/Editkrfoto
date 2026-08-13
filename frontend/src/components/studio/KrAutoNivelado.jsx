import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { FolderUp, Package, Loader2, Gauge, ShieldCheck, ArrowRight } from "lucide-react";
import { levelXmp, LEVEL_RULES } from "@/lib/xmp/krAutoLevel";

const XMP_RE = /\.xmp$/i;

function fmtElapsed(s) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

const RULE_DISPLAY = LEVEL_RULES.map((r) => ({
  label: r.label,
  value: r.dec > 0 ? (r.delta > 0 ? `+${r.delta.toFixed(2)}` : r.delta.toFixed(2)) : (r.delta > 0 ? `+${r.delta}` : `${r.delta}`),
}));

export default function KrAutoNivelado() {
  const [files, setFiles] = useState(null);
  const [preview, setPreview] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const onFolder = async (fileList) => {
    const xmps = Array.from(fileList || []).filter((f) => XMP_RE.test(f.name));
    setFiles(xmps); setProgress(0); setDone(0); setError(null); setFinished(null); setPreview(null);
    if (!xmps.length) { toast.error("No se encontraron archivos .xmp en la carpeta"); return; }
    try {
      const text = await xmps[0].text();
      setPreview({ name: xmps[0].name, changes: levelXmp(text).changes });
    } catch { /* preview opcional */ }
  };

  const run = async () => {
    if (!files?.length) return;
    setRunning(true); setError(null); setProgress(0); setDone(0); setElapsed(0); setFinished(null);
    try {
      const zip = new JSZip();
      const total = files.length;
      for (let i = 0; i < total; i++) {
        const text = await files[i].text();
        const { text: leveled } = levelXmp(text);
        zip.file(files[i].name, leveled); // conserva el nombre original
        setDone(i + 1);
        setProgress(Math.round(((i + 1) / total) * 100));
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      saveAs(blob, "KR_AUTO_NIVELADO.zip");
      setFinished(total);
      toast.success("Nivelado completado", { description: `${total} XMP en KR_AUTO_NIVELADO.zip` });
    } catch (e) {
      setError(e.message || "Error al nivelar los XMP");
      toast.error("Fallo el nivelado");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="animate-fade-up overflow-hidden rounded-xl border border-emerald-500/30 bg-[#141418] shadow-lg" data-testid="kr-auto-nivelado">
      <div className="border-b border-zinc-800 bg-gradient-to-r from-emerald-400/[0.07] to-transparent px-6 py-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-semibold">KR Auto Nivelado</h2>
          <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Herramienta principal</span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
          Sube un reportaje entero de sidecars y recibe los XMP con la base técnica de luz nivelada,
          listos para aplicar tus propios presets encima. No es el Auto de Lightroom: no analiza píxeles
          ni toca el estilo artístico. Solo asienta exposición, luces, sombras, blancos y negros con reglas fijas.
        </p>
      </div>

      <div className="p-6">
        <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Reglas de nivelado (base técnica)</p>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {RULE_DISPLAY.map((r) => (
            <li key={r.label} className="rounded-lg border border-zinc-800 bg-[#1c1c22] px-3 py-2">
              <span className="block text-[11px] text-zinc-500">{r.label}</span>
              <span className="font-mono text-sm text-emerald-400">{r.value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-600">No toca balance de blancos, curvas, HSL, calibración ni máscaras.</p>

        <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple hidden
          onChange={(e) => onFolder(e.target.files)} data-testid="kr-folder-input" />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button data-testid="kr-pick-folder-btn" onClick={() => inputRef.current?.click()} disabled={running}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-[#1c1c22] px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:opacity-50">
            <FolderUp className="h-4 w-4" /> Seleccionar carpeta
          </button>
          {files && (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400" data-testid="kr-file-count">
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> {files.length} XMP detectados
            </span>
          )}
        </div>

        {preview && (
          <div className="mt-5 rounded-lg border border-zinc-800 bg-[#101012] p-4" data-testid="kr-preview">
            <p className="text-xs text-zinc-500">Vista previa del nivelado — <span className="font-mono text-zinc-400">{preview.name}</span></p>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
              {preview.changes.map((c) => (
                <div key={c.attr} className="text-center">
                  <p className="text-[11px] text-zinc-500">{c.label}</p>
                  <p className="mt-1 font-mono text-xs">
                    <span className="text-zinc-500">{c.original}</span>
                    <ArrowRight className="mx-1 inline h-3 w-3 text-zinc-600" />
                    <span className="text-emerald-400">{c.leveled}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <button data-testid="kr-run-btn" disabled={!files?.length || running} onClick={run}
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100">
          {running
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Nivelando… {progress}%</>
            : <><Package className="h-4 w-4" /> Generar KR_AUTO_NIVELADO.zip</>}
        </button>

        {running && (
          <div className="mt-4 max-w-md">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 font-mono text-xs text-zinc-500" data-testid="kr-progress">{done} / {files.length} · {fmtElapsed(elapsed)}</p>
          </div>
        )}
        {finished && <p className="mt-3 text-xs text-emerald-400" data-testid="kr-finished">{finished} XMP nivelados y empaquetados en KR_AUTO_NIVELADO.zip.</p>}
        {error && <p className="mt-3 text-sm text-rose-400" data-testid="kr-error">{error}</p>}
      </div>
    </section>
  );
}
