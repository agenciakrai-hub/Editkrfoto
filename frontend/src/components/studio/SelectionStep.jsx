import { useEffect, useState } from "react";
import { ArrowRight, Layers, CheckCircle2, Images, ScanFace, Users, User, AlertTriangle } from "lucide-react";
import { SAMPLE_THUMBS } from "@/lib/rawSelection";
import { analyzeFile, groupAndSelect, mapLimit } from "@/lib/imageAnalysis";
import { applyFaceLayer } from "@/lib/faceEngine";
import SelectionProgress from "@/components/studio/SelectionProgress";

const DEFAULT_BASIC = { exposure: 0.1, contrast: 0, highlights: -15, shadows: 15, whites: 5, blacks: -5 };

export default function SelectionStep({ files, onContinue }) {
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
        const metrics = await mapLimit(arr, 3, (f) => analyzeFile(f), (done) => {
          if (active) setProgress(Math.round((done / arr.length) * 100));
        });
        if (!active) return;
        const items = arr.map((f, i) => ({ name: f.name, size: f.size, file: f, metrics: metrics[i] }));
        const analyzed = groupAndSelect(items);
        const photos = analyzed.map((it, i) => ({
          id: `${it.burstId}-${i}-${it.name}`,
          name: it.name,
          size: it.size,
          burstId: it.burstId,
          score: it.score,
          thumb: SAMPLE_THUMBS[i % SAMPLE_THUMBS.length],
          file: it.file,
          basic: it.metrics?.basic || DEFAULT_BASIC,
          photometrics: it.metrics?.photometrics || null,
          isBest: it.isBest,
          selectedForEdit: it.selectedForEdit,
        }));

        // Capa de caras (extra): solo sobre ráfagas y seleccionadas. Afina ráfagas + notas de dudas.
        setPhase("faces");
        const { stats: faceStats, people } = await applyFaceLayer(photos, (d, t) => {
          if (active) setFaceProgress(t ? Math.round((d / t) * 100) : 100);
        });
        if (!active) return;

        const bursts = new Set(photos.map((p) => p.burstId)).size;
        const selected = photos.filter((p) => p.selectedForEdit).length;
        setResult({ photos, total: photos.length, bursts, selected, faceStats, people });
      } catch (e) {
        if (active) setError("No se pudo analizar la selección. Inténtalo de nuevo.");
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
      <h2 className="font-display text-lg font-semibold">Selección IA completada</h2>
      <p className="mt-1.5 text-sm text-zinc-500">
        La IA agrupó las secuencias por similitud y eligió la toma más nítida y mejor expuesta de cada una.
        Cuando el resultado es ambiguo, marca más de una para que tú decidas en la revisión.
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

      {fs && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-[#1c1c22] p-4" data-testid="face-stats">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800/70 px-2.5 py-1 text-xs text-zinc-300">
            <ScanFace className="h-3.5 w-3.5 text-emerald-400" /> {fs.analyzed} analizadas con caras
          </span>
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
              <AlertTriangle className="h-3.5 w-3.5" /> {fs.doubts} con dudas para decidir
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
