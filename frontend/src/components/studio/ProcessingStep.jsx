import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";

export default function ProcessingStep({ count, onDone }) {
  const [done, setDone] = useState(0);

  useEffect(() => {
    let current = 0;
    const step = Math.max(1, Math.round(count / 24));
    const timer = setInterval(() => {
      current = Math.min(count, current + step);
      setDone(current);
      if (current >= count) {
        clearInterval(timer);
        setTimeout(() => onDone({ total: count, succeeded: count, failed: 0 }), 350);
      }
    }, 140);
    return () => clearInterval(timer);
  }, [count, onDone]);

  const pct = count ? Math.round((done / count) * 100) : 0;

  return (
    <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-8" data-testid="processing-step">
      <div className="flex items-center gap-3">
        <Cpu className="h-5 w-5 animate-pulse text-emerald-400" />
        <h2 className="font-display text-lg font-semibold">Procesamiento local en curso</h2>
      </div>
      <p className="mt-1.5 text-sm text-zinc-500">Aplicando corrección IA y generando los sidecars XMP para cada foto.</p>

      <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-emerald-400 transition-all duration-150" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 font-mono text-xs text-zinc-500" data-testid="processing-progress">
        {done} / {count} fotos · {pct}%
      </p>
    </section>
  );
}
