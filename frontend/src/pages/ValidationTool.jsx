import { useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import Thumbnail from "@/components/studio/Thumbnail";
import {
  ClipboardCheck, FolderUp, Loader2, Download, RotateCcw, CheckCircle2,
  AlertTriangle, XCircle, ChevronDown, ChevronRight, ScanFace,
} from "lucide-react";
import { isRaw } from "@/lib/rawSelection";
import { analyzeFile, groupAndSelect, mapLimit } from "@/lib/imageAnalysis";
import { applyFaceLayer } from "@/lib/faceEngine";
import { buildValidationReport } from "@/lib/validationReport";
import { WARNING_LABELS } from "@/lib/burstDecision";

const EYE_LABEL = { open: "abiertos", closed: "cerrados", partial: "parpadeo", unknown: "incierto", absent: "ausente" };
const STATE_STYLE = {
  SELECTED: "bg-emerald-400/15 text-emerald-300 border-emerald-400/40",
  SELECTED_WARNING: "bg-amber-400/15 text-amber-300 border-amber-400/40",
  NOT_SELECTED: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

function Stat({ label, value, accent, testId }) {
  return (
    <div data-testid={testId} className="rounded-xl border border-zinc-800 bg-[#1c1c22] p-4">
      <p className={`font-display text-2xl font-bold ${accent || "text-zinc-100"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function SubjectRow({ s }) {
  const bad = s.eyeState === "closed" || s.eyeState === "partial" || !s.faceDetected;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${bad ? "bg-amber-400/10 text-amber-300" : "bg-zinc-800 text-zinc-300"}`}>
      #{s.subjectId + 1} {s.relativePosition}{s.isMain ? "·principal" : ""} · ojos {EYE_LABEL[s.eyeState] || s.eyeState}
      {s.faceDetected ? ` · nit ${s.faceSharpness} · vis ${s.visibility}` : ""}
    </span>
  );
}

function PhotoDetail({ p }) {
  return (
    <div data-testid={`val-photo-${p.filename}`} className={`rounded-lg border p-3 ${p.selected ? (p.warning ? "border-amber-400/30 bg-amber-400/[0.03]" : "border-emerald-400/30 bg-emerald-400/[0.03]") : "border-zinc-800 bg-[#141418]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="truncate font-mono text-[11px] text-zinc-300">{p.filename}</p>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATE_STYLE[p.state]}`}>{p.state.replace("_", " + ")}</span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">{p.reason}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-400">
        <span>conf {p.selectionConfidence}</span>
        <span>téc {p.technicalScore}</span>
        {p.faceScore != null && <span>cara {p.faceScore}</span>}
        <span>ojos {p.eyesScore}</span>
        <span>nit {p.sharpnessScore}</span>
        <span>exp {p.exposureScore}</span>
        <span>caras {p.faceCount}</span>
      </div>
      {p.warningTypes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.warningTypes.map((w) => <span key={w} className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-300">{WARNING_LABELS[w] || w}</span>)}
        </div>
      )}
      {p.subjects.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">{p.subjects.map((s) => <SubjectRow key={s.subjectId} s={s} />)}</div>
      )}
    </div>
  );
}

function SequenceCard({ seq, selectedFile }) {
  const [open, setOpen] = useState(false);
  const stateBadge = seq.selectedCount === 0 ? "NO_SEL" : (seq.hasWarning ? "SELECTED_WARNING" : "SELECTED");
  return (
    <div data-testid={`val-seq-${seq.sequenceId}`} className="overflow-hidden rounded-xl border border-zinc-800 bg-[#141418]">
      <button data-testid={`val-seq-toggle-${seq.sequenceId}`} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />}
        <div className="h-12 w-16 shrink-0 overflow-hidden rounded bg-zinc-900">
          {selectedFile ? <Thumbnail file={selectedFile} alt={seq.selectedPhoto} className="h-12 w-16" /> : <div className="flex h-full items-center justify-center text-zinc-700"><ScanFace className="h-4 w-4" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-200">Secuencia {seq.sequenceId} · {seq.count} fotos</p>
          <p className="truncate font-mono text-[11px] text-zinc-500">→ {seq.selectedPhoto || "—"} · conf {seq.selectionConfidence ?? "—"}</p>
        </div>
        {seq.selectedCount === 0 ? (
          <span className="rounded border border-rose-500/50 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300">SIN SELECCIÓN</span>
        ) : (
          <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${STATE_STYLE[stateBadge === "NO_SEL" ? "NOT_SELECTED" : stateBadge]}`}>
            {seq.hasWarning ? "WARNING" : "OK"}{seq.selectedCount > 1 ? ` ×${seq.selectedCount}` : ""}
          </span>
        )}
      </button>
      {seq.hasWarning && seq.warnings.length > 0 && !open && (
        <div className="flex flex-wrap gap-1 px-3 pb-3">
          {seq.warnings.map((w) => <span key={w} className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-300">{WARNING_LABELS[w] || w}</span>)}
        </div>
      )}
      {open && <div className="grid gap-2 border-t border-zinc-800 p-3">{seq.photos.map((p) => <PhotoDetail key={p.filename} p={p} />)}</div>}
    </div>
  );
}

export default function ValidationTool() {
  const inputRef = useRef(null);
  const [phase, setPhase] = useState("idle"); // idle | analyzing | faces | ready
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [faceProgress, setFaceProgress] = useState(0);
  const [report, setReport] = useState(null);
  const [fileMap, setFileMap] = useState({}); // filename -> File (para thumbnails)
  const [filter, setFilter] = useState("all"); // all | selected | warning | lowconf | <WARNING_TYPE>
  const [confThreshold, setConfThreshold] = useState(70); // umbral de selectionConfidence (0-100)
  const [folderName, setFolderName] = useState(null);

  const reset = () => { setReport(null); setPhase("idle"); setFilter("all"); setFolderName(null); setProgress({ done: 0, total: 0 }); setFaceProgress(0); };

  const onPick = async (e) => {
    const all = Array.from(e.target.files || []);
    e.target.value = "";
    const raws = all.filter((f) => isRaw(f.name));
    if (!raws.length) { toast.error("No hay RAW/JPG en esa carpeta"); return; }
    setFolderName(raws[0].webkitRelativePath?.split("/")[0] || "Carpeta");
    setFileMap(Object.fromEntries(raws.map((f) => [f.name, f])));
    setPhase("analyzing");
    setProgress({ done: 0, total: raws.length });
    try {
      const metrics = await mapLimit(raws, 3, (f) => analyzeFile(f), (done) => setProgress((p) => ({ ...p, done })));
      const items = raws.map((f, i) => ({ name: f.name, size: f.size, file: f, metrics: metrics[i] }));
      const analyzed = groupAndSelect(items);
      const photos = analyzed.map((it, i) => ({
        id: `${it.burstId}-${i}-${it.name}`, name: it.name, burstId: it.burstId, score: it.score,
        file: it.file, photometrics: it.metrics?.photometrics || null, color: it.metrics?.color || null,
        isBest: it.isBest, selectedForEdit: it.selectedForEdit, analyzedOk: !!it.metrics,
      }));
      setPhase("faces");
      await applyFaceLayer(photos, (d, t) => setFaceProgress(t ? Math.round((d / t) * 100) : 100));
      setReport(buildValidationReport(photos));
      setPhase("ready");
      toast.success("Análisis de selección completado");
    } catch (err) {
      if (process.env.NODE_ENV === "development") console.error("Validación falló", err);
      toast.error("No se pudo analizar la sesión");
      setPhase("idle");
    }
  };

  const exportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    saveAs(blob, `validacion_fase1_${(folderName || "sesion").replace(/\s+/g, "_")}.json`);
  };

  const exportCsv = () => {
    if (!report) return;
    const cols = ["secuencia", "archivo", "estado", "seleccionada", "confianza", "tecnico", "cara", "ojos", "nitidez", "exposicion", "num_caras", "warnings", "motivo"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [cols.join(",")];
    for (const seq of report.sequences) {
      for (const p of seq.photos) {
        rows.push([
          seq.sequenceId, p.filename, p.state, p.selected ? "si" : "no",
          p.selectionConfidence, p.technicalScore, p.faceScore ?? "", p.eyesScore,
          p.sharpnessScore, p.exposureScore, p.faceCount,
          (p.warningTypes || []).map((w) => WARNING_LABELS[w] || w).join("; "), p.reason,
        ].map(esc).join(","));
      }
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    saveAs(blob, `validacion_fase1_${(folderName || "sesion").replace(/\s+/g, "_")}.csv`);
    toast.success("CSV exportado");
  };

  const s = report?.summary;
  const filteredSeqs = useMemo(() => {
    if (!report) return [];
    if (filter === "all") return report.sequences;
    if (filter === "selected") return report.sequences.filter((q) => q.selectedCount > 0);
    if (filter === "warning") return report.sequences.filter((q) => q.hasWarning);
    if (filter === "lowconf") return report.sequences.filter((q) => q.selectionConfidence != null && q.selectionConfidence < confThreshold);
    return report.sequences.filter((q) => q.warnings.includes(filter));
  }, [report, filter, confThreshold]);

  // Agrupación por tipo de warning, ordenada por frecuencia (para ver qué problema domina).
  const warningGroups = useMemo(() => {
    if (!s) return [];
    return Object.entries(s.warningBreakdown).sort((a, b) => b[1] - a[1]);
  }, [s]);
  const maxWarn = warningGroups.length ? warningGroups[0][1] : 0;
  const lowConfCount = useMemo(
    () => (report ? report.sequences.filter((q) => q.selectionConfidence != null && q.selectionConfidence < confThreshold).length : 0),
    [report, confThreshold]
  );

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <AppShell>
      <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Diagnóstico</p>
      <h1 className="font-display mt-1 flex items-center gap-2 text-2xl font-semibold">
        <ClipboardCheck className="h-6 w-6 text-emerald-400" /> Validación del motor de selección
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500">
        Corre la <span className="text-zinc-300">Fase 1 real</span> sobre una carpeta y muestra el desglose por secuencia
        (seleccionada, warnings, confidence, sujetos y ojos). Solo observa: no modifica el motor. Los RAW no se tocan.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-800 bg-[#141418] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={onPick} data-testid="validation-folder-input" />
          <button data-testid="validation-pick-folder-btn" onClick={() => inputRef.current?.click()} disabled={phase === "analyzing" || phase === "faces"}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40">
            <FolderUp className="h-4 w-4" /> Elegir sesión
          </button>
          {report && (
            <>
              <button data-testid="validation-export-btn" onClick={exportJson}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:scale-[1.02]">
                <Download className="h-4 w-4" /> Exportar JSON
              </button>
              <button data-testid="validation-export-csv-btn" onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
                <Download className="h-4 w-4" /> Exportar CSV
              </button>
              <button data-testid="validation-reset-btn" onClick={reset}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
                <RotateCcw className="h-4 w-4" /> Otra sesión
              </button>
            </>
          )}
          {folderName && <span className="font-mono text-xs text-zinc-500" data-testid="validation-folder-name">{folderName}</span>}
        </div>

        {(phase === "analyzing" || phase === "faces") && (
          <div className="mt-4" data-testid="validation-progress">
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${phase === "analyzing" ? pct : faceProgress}%` }} />
            </div>
            <p className="mt-2 flex items-center gap-2 font-mono text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              {phase === "analyzing" ? `Analizando ${progress.done}/${progress.total} (${pct}%)` : `Detectando caras y decidiendo… (${faceProgress}%)`}
            </p>
          </div>
        )}
      </div>

      {s && (
        <>
          <div className={`mt-6 flex items-center gap-3 rounded-xl border p-4 ${s.rulePass ? "border-emerald-400/40 bg-emerald-400/[0.06]" : "border-rose-500/50 bg-rose-500/[0.08]"}`} data-testid="validation-rule-banner">
            {s.rulePass ? <CheckCircle2 className="h-6 w-6 text-emerald-400" /> : <XCircle className="h-6 w-6 text-rose-400" />}
            <div>
              <p className={`font-display text-lg font-semibold ${s.rulePass ? "text-emerald-300" : "text-rose-300"}`}>
                {s.rulePass ? "Regla fundamental CUMPLIDA" : `ERROR — ${s.sequencesWithoutSelection} secuencia(s) sin selección`}
              </p>
              <p className="text-xs text-zinc-400">
                {s.rulePass
                  ? "Cada secuencia procesable tiene al menos una fotografía seleccionada."
                  : `Secuencias afectadas: ${s.sequencesWithoutSelectionIds.join(", ")}`}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat testId="stat-processable" label="Secuencias procesables" value={s.processableSequences} />
            <Stat testId="stat-selected" label="Con selección" value={s.sequencesWithSelection} accent="text-emerald-400" />
            <Stat testId="stat-clean" label="SELECTED" value={s.selectedClean} accent="text-emerald-400" />
            <Stat testId="stat-warning" label="SELECTED + WARNING" value={s.selectedWarning} accent="text-amber-400" />
            <Stat testId="stat-nosel" label="Sin selección" value={s.sequencesWithoutSelection} accent={s.sequencesWithoutSelection ? "text-rose-400" : "text-zinc-100"} />
            <Stat testId="stat-nonproc" label="No procesables" value={s.nonProcessableSequences} />
          </div>

          {warningGroups.length > 0 && (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-[#141418] p-4" data-testid="validation-warning-groups">
              <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Warnings por categoría (seleccionadas)</p>
              <div className="mt-3 grid gap-2">
                {warningGroups.map(([w, n]) => (
                  <button key={w} data-testid={`warngroup-${w}`} onClick={() => setFilter(w)}
                    className="group flex items-center gap-3 text-left">
                    <span className="w-40 shrink-0 truncate text-xs text-zinc-300">{WARNING_LABELS[w] || w}</span>
                    <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-amber-400/70 transition-all group-hover:bg-amber-400" style={{ width: `${maxWarn ? Math.round((n / maxWarn) * 100) : 0}%` }} />
                    </span>
                    <span className="w-8 shrink-0 text-right font-mono text-xs text-amber-300">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="validation-filters">
            {[["all", `Todas (${report.sequences.length})`], ["selected", "Con selección"], ["warning", `Con warning (${s.selectedWarning})`]].map(([k, label]) => (
              <button key={k} data-testid={`filter-${k}`} onClick={() => setFilter(k)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${filter === k ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"}`}>
                {label}
              </button>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-[#1c1c22] px-3 py-1 text-xs" data-testid="filter-lowconf-group">
              <button data-testid="filter-lowconf" onClick={() => setFilter("lowconf")}
                className={`font-medium ${filter === "lowconf" ? "text-sky-300" : "text-zinc-300 hover:text-zinc-100"}`}>
                Confianza &lt;
              </button>
              <input data-testid="filter-conf-threshold" type="number" min={0} max={100} step={5} value={confThreshold}
                onChange={(e) => { setConfThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0))); setFilter("lowconf"); }}
                className="w-14 rounded border border-zinc-700 bg-[#101012] px-1.5 py-0.5 text-center font-mono text-xs text-zinc-100 outline-none focus:border-sky-400/60" />
              <span className="font-mono text-[11px] text-sky-300">({lowConfCount})</span>
            </span>
            {Object.entries(s.warningBreakdown).map(([w, n]) => (
              <button key={w} data-testid={`filter-${w}`} onClick={() => setFilter(w)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${filter === w ? "border-amber-400/50 bg-amber-400/10 text-amber-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"}`}>
                <AlertTriangle className="h-3 w-3" /> {WARNING_LABELS[w] || w} ({n})
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-2" data-testid="validation-sequences">
            {filteredSeqs.map((seq) => <SequenceCard key={seq.sequenceId} seq={seq} selectedFile={fileMap[seq.selectedPhoto]} />)}
          </div>
        </>
      )}

      {phase === "idle" && !report && (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 bg-[#141418] p-12 text-center" data-testid="validation-empty">
          <ClipboardCheck className="mx-auto h-9 w-9 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-400">Elige una sesión RAW y verás el desglose de decisiones del motor de selección.</p>
          <p className="mt-1 text-xs text-zinc-600">Todo local · exporta el informe en JSON para analizar los casos problemáticos.</p>
        </div>
      )}
    </AppShell>
  );
}
