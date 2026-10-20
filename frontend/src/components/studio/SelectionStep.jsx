import { useEffect, useState } from "react";
import { ArrowRight, Layers, CheckCircle2, Images, ScanFace, Users, User, AlertTriangle } from "lucide-react";
import { cachePhoto, readPhoto } from "@/lib/workspaceCache";
import { thumbBase64 } from "@/lib/rawThumb";
import { analyzeFile, groupAndSelect, mapLimit } from "@/lib/imageAnalysis";
import { applyReviewFlags } from "@/lib/selectionLogic";
import { readCaptureMetaFromFile } from "@/lib/captureMeta";
import { applyFaceLayer } from "@/lib/faceEngine";
import SelectionProgress from "@/components/studio/SelectionProgress";

const DEFAULT_BASIC = { exposure: 0.1, contrast: 0, highlights: -15, shadows: 15, whites: 5, blacks: -5 };

export default function SelectionStep({ files, cacheKey, onCheckpoint, onContinue }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("analyzing"); // analyzing | faces
  const [faceProgress, setFaceProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const arr = Array.from(files);
        // Analiza el contenido real (nitidez + exposición + hash visual) de cada RAW.
        const previews=new Map();
        const metas=new Map();
        const metrics=await mapLimit(arr,3,async f=>{
          if(!active) throw new Error('Análisis pausado');
          metas.set(f,await readCaptureMetaFromFile(f)); // hora de captura + cámara (agrupado)
          const identity={name:f.name,size:f.size,lastModified:f.lastModified,relativePath:f.webkitRelativePath || f.name};
          const cached=await readPhoto(cacheKey,identity);
          if(cached?.metrics && cached?.preview){previews.set(f,cached.preview);return cached.metrics;}
          const metric=await analyzeFile(f);const preview=await thumbBase64(f,800);
          await cachePhoto(cacheKey,identity,preview,metric);previews.set(f,preview);return metric;
        },(done)=>{
          if (active) setProgress(Math.round((done / arr.length) * 100));
        });
        if (!active) return;
        const items = arr.map((f, i) => ({ name: f.name, size: f.size, file: f, metrics: metrics[i],
          relativePath: f.webkitRelativePath || f.name, meta: metas.get(f) }));
        const analyzed = groupAndSelect(items);
        const photos = analyzed.map((it, i) => ({
          id: `${it.burstId}-${i}-${it.name}`,
          name: it.name,
          size: it.size,
          burstId: it.burstId,
          seq: it.seq,
          groupUncertain: !!it.groupUncertain,
          captureTime: it.meta?.captureTime ?? null,
          camera: it.meta?.camera ?? null,
          score: it.score,
          thumb:previews.get(it.file) ? 'data:image/jpeg;base64,'+previews.get(it.file) : null,
          relativePath:it.file.webkitRelativePath || it.name,lastModified:it.file.lastModified,
          file: it.file,
          basic: it.metrics?.basic || DEFAULT_BASIC,
          photometrics: it.metrics?.photometrics || null,
          color: it.metrics?.color || null,
          isBest: it.isBest,
          selectedForEdit: it.selectedForEdit,
        }));

        // Capa de caras (extra): solo sobre ráfagas y seleccionadas. Afina ráfagas + notas de dudas.
        setPhase("faces");
        const { stats: faceStats, people } = await applyFaceLayer(photos, (d, t) => {
          if (active) setFaceProgress(t ? Math.round((d / t) * 100) : 100);
        });
        if (!active) return;
        applyReviewFlags(photos, { available: faceStats?.available !== false, reason: faceStats?.reason });

        const bursts = new Set(photos.map((p) => p.burstId)).size;
        const selected = photos.filter((p) => p.selectedForEdit).length;
        await onCheckpoint?.(photos,people);
        if(!active) return;
        setResult({ photos, total: photos.length, bursts, selected, faceStats, people, uncertain: photos.filter((p) => p.groupUncertain).length });
      } catch (e) {
        if (active) setError("No se pudo completar o guardar el análisis: "+e.message+". El progreso ya guardado se conserva.");
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reanaliza solo cuando cambian los archivos
  }, [files]);

  if (error) {
    return (
      <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-8" data-testid="selection-error">
        <p className="text-sm text-rose-400">{error}</p>
      </section>
    );
  }

  if (!result) {
    return <SelectionProgress phase={phase} progress={progress} faceProgress={faceProgress} fileCount={Array.from(files).length} />;
  }

  const fs = result.faceStats;
  const stats = [
    { icon: Images, label: "Fotos totales", value: result.total },
    { icon: Layers, label: "Secuencias detectadas", value: result.bursts },
    { icon: CheckCircle2, label: "Seleccionadas (verde)", value: result.selected, accent: true },
  ];

  return (
    <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="selection-result">
      <h2 className="font-display text-lg font-semibold">Análisis local completado</h2>
      <p className="mt-1.5 text-sm text-zinc-500">
        El análisis local agrupó las secuencias por hora de captura, cámara y carpeta (el parecido visual es una señal de apoyo) y propone las tomas más nítidas y mejor expuestas.
        En «Revisar selección» → «Por ráfaga» puedes comparar todas las candidatas con el modelo de IA configurado y guardar una sola ganadora por ráfaga.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} data-testid={`stat-${s.label}`} className="rounded-xl border border-zinc-800 bg-[#1c1c22] p-4">
            <s.icon className={`h-5 w-5 ${s.accent ? "text-emerald-400" : "text-zinc-400"}`} />
            <p className={`mt-3 font-display text-2xl font-bold ${s.accent ? "text-emerald-400" : "text-zinc-100"}`}>{s.value}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>

      {result.uncertain > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 text-xs text-amber-200" data-testid="grouping-uncertain">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.uncertain} fotos sin hora de captura legible se agruparon solo por parecido visual, de forma conservadora. Revísalas en «Con advertencia».
        </p>
      )}

      {fs && fs.available === false && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 text-xs text-amber-200" data-testid="face-unavailable">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Análisis facial no disponible: {fs.reason}. La propuesta se basa solo en nitidez y exposición; revisa ojos y expresiones manualmente (puedes recargar para reintentar).
        </p>
      )}

      {fs && fs.available !== false && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-[#1c1c22] p-4" data-testid="face-stats">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800/70 px-2.5 py-1 text-xs text-zinc-300">
            <ScanFace className="h-3.5 w-3.5 text-emerald-400" /> {fs.analyzed} analizadas con caras
          </span>
          {fs.failed > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-400/10 px-2.5 py-1 text-xs text-amber-300" data-testid="face-failed">
              <AlertTriangle className="h-3.5 w-3.5" /> {fs.failed} sin análisis facial (revisar)
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800/70 px-2.5 py-1 text-xs text-zinc-300">
            <Users className="h-3.5 w-3.5 text-sky-400" /> {fs.groupPhotos} de grupo
          </span>
          {fs.people > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800/70 px-2.5 py-1 text-xs text-zinc-300" data-testid="face-people">
              <User className="h-3.5 w-3.5 text-violet-400" /> {fs.people} personas
            </span>
          )}
          {fs.rescued > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300" data-testid="face-rescued">
              <CheckCircle2 className="h-3.5 w-3.5" /> {fs.rescued} rescatadas (cara distinta)
            </span>
          )}
          {fs.doubts > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-400/10 px-2.5 py-1 text-xs text-amber-300" data-testid="face-doubts">
              <AlertTriangle className="h-3.5 w-3.5" /> {fs.doubts} con advertencia (revisar)
            </span>
          )}
        </div>
      )}

      <button data-testid="selection-continue-btn" onClick={() => onContinue(result.photos, result.people || [])}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02]">
        Revisar selección <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
