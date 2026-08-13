import { useEffect, useState } from "react";
import { analyzeFolder, burstCount } from "@/lib/rawSelection";
import { Sparkles, ArrowRight, Layers, CheckCircle2, Images } from "lucide-react";

export default function SelectionStep({ files, onContinue }) {
  const [progress, setProgress] = useState(0);
  const [photos, setPhotos] = useState(null);

  useEffect(() => {
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(100, p + Math.random() * 18 + 8);
      setProgress(Math.round(p));
      if (p >= 100) {
        clearInterval(timer);
        setPhotos(analyzeFolder(files));
      }
    }, 220);
    return () => clearInterval(timer);
  }, [files]);

  if (!photos) {
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

  const bursts = burstCount(photos);
  const best = photos.filter((p) => p.selectedForEdit).length;
  const stats = [
    { icon: Images, label: "Fotos totales", value: photos.length },
    { icon: Layers, label: "Ráfagas detectadas", value: bursts },
    { icon: CheckCircle2, label: "Mejores tomas (verde)", value: best, accent: true },
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

      <button data-testid="selection-continue-btn" onClick={() => onContinue(photos)}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02]">
        Revisar selección <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
