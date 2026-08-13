import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Layers, CheckCircle2, Images } from "lucide-react";
import { SAMPLE_THUMBS } from "@/lib/rawSelection";
import api from "@/lib/api";

export default function SelectionStep({ files, onContinue }) {
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(95, p + Math.random() * 12 + 5);
      setProgress(Math.round(p));
    }, 220);

    (async () => {
      try {
        const meta = Array.from(files).map((f) => ({ name: f.name, size: f.size, last_modified: f.lastModified }));
        const res = await api.post("/selection/analyze", { files: meta });
        if (!active) return;
        const byName = new Map(Array.from(files).map((f) => [f.name, f]));
        const photos = res.data.photos.map((p, i) => ({
          id: `${p.burst_id}-${i}-${p.name}`,
          name: p.name,
          size: p.size,
          burstId: p.burst_id,
          score: p.score,
          thumb: SAMPLE_THUMBS[i % SAMPLE_THUMBS.length],
          file: byName.get(p.name),
          isBest: p.is_best,
          selectedForEdit: p.selected_for_edit,
        }));
        clearInterval(timer);
        setProgress(100);
        setResult({ photos, total: res.data.total, bursts: res.data.bursts, selected: res.data.selected });
      } catch (e) {
        if (active) setError("No se pudo analizar la selección. Inténtalo de nuevo.");
        clearInterval(timer);
      }
    })();

    return () => { active = false; clearInterval(timer); };
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
        <p className="mt-1.5 text-sm text-zinc-500">Agrupando ráfagas y evaluando nitidez, ojos y composición.</p>
        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-emerald-400 transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 font-mono text-xs text-zinc-500">{progress}% · {files.length} archivos</p>
      </section>
    );
  }

  const stats = [
    { icon: Images, label: "Fotos totales", value: result.total },
    { icon: Layers, label: "Ráfagas detectadas", value: result.bursts },
    { icon: CheckCircle2, label: "Mejores tomas (verde)", value: result.selected, accent: true },
  ];

  return (
    <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="selection-result">
      <h2 className="font-display text-lg font-semibold">Selección IA completada</h2>
      <p className="mt-1.5 text-sm text-zinc-500">
        La IA agrupó las ráfagas y marcó en verde la mejor toma de cada una. Podrás ajustar la selección en el siguiente paso.
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
