import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Layers, CheckCircle2, Images } from "lucide-react";
import { SAMPLE_THUMBS } from "@/lib/rawSelection";
import { analyzeFile, groupAndSelect, mapLimit, autoBasicFromMetrics } from "@/lib/imageAnalysis";

export default function SelectionStep({ files, onContinue }) {
  const [progress, setProgress] = useState(0);
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
          basic: autoBasicFromMetrics(it.metrics),
          isBest: it.isBest,
          selectedForEdit: it.selectedForEdit,
        }));
        const bursts = new Set(photos.map((p) => p.burstId)).size;
        const selected = photos.filter((p) => p.selectedForEdit).length;
        setResult({ photos, total: photos.length, bursts, selected });
      } catch (e) {
        if (active) setError("No se pudo analizar la selección. Inténtalo de nuevo.");
      }
    })();
    return () => { active = false; };
  }, [files]);

  if (error) {
    return (
      <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-8" data-testid="selection-error">
        <p className="text-sm text-rose-400">{error}</p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-8" data-testid="selection-analyzing">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 animate-pulse text-emerald-400" />
          <h2 className="font-display text-lg font-semibold">Analizando con IA…</h2>
        </div>
        <p className="mt-1.5 text-sm text-zinc-500">Evaluando enfoque y exposición de cada toma y agrupando ráfagas por similitud visual.</p>
        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-emerald-400 transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 font-mono text-xs text-zinc-500">{progress}% · {Array.from(files).length} archivos</p>
      </section>
    );
  }

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

      <button data-testid="selection-continue-btn" onClick={() => onContinue(result.photos)}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02]">
        Revisar selección <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
