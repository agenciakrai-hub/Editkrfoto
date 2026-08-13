import { Cpu, Cloud, ArrowRight } from "lucide-react";

export default function ProcessingModeChoice({ count, onLocal, onCloud }) {
  const options = [
    { key: "local", icon: Cpu, title: "Procesamiento local", desc: "Rápido y en tu navegador. Ideal para tandas pequeñas o medianas.", action: onLocal, testid: "mode-local-btn" },
    { key: "cloud", icon: Cloud, title: "Procesamiento en la nube", desc: "Deja la cola trabajando en el servidor. Puedes cerrar el navegador y volver al reporte.", action: onCloud, testid: "mode-cloud-btn" },
  ];
  return (
    <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="mode-step">
      <h2 className="font-display text-lg font-semibold">¿Dónde procesamos?</h2>
      <p className="mt-1.5 text-sm text-zinc-500">{count} fotos en cola de edición IA. Elige el modo de generación de XMP.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {options.map((o) => (
          <button key={o.key} data-testid={o.testid} onClick={o.action}
            className="group flex flex-col items-start rounded-xl border border-zinc-800 bg-[#1c1c22] p-5 text-left transition-all duration-200 hover:border-emerald-400/50 hover:bg-emerald-400/[0.03]">
            <o.icon className="h-6 w-6 text-emerald-400" />
            <p className="mt-3 text-sm font-semibold text-zinc-100">{o.title}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{o.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
              Elegir <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
