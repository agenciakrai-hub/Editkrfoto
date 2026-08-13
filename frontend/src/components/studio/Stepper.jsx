import { Check, Folder, Sparkles, Eye, Camera, SlidersHorizontal, FileArchive } from "lucide-react";

export const STUDIO_STEPS = [
  { label: "Carpeta RAW", icon: Folder },
  { label: "Selección IA", icon: Sparkles },
  { label: "Revisión", icon: Eye },
  { label: "Perfil", icon: Camera },
  { label: "Presets IA", icon: SlidersHorizontal },
  { label: "XMP", icon: FileArchive },
];

export default function Stepper({ current }) {
  return (
    <div className="flex items-center overflow-x-auto pb-1" data-testid="studio-stepper">
      {STUDIO_STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = s.icon;
        return (
          <div key={s.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5" data-testid={`step-${i}`}>
              <div className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200
                ${active ? "border-emerald-400/70 bg-emerald-400/10 text-emerald-300 ring-4 ring-emerald-400/10"
                  : done ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                  : "border-zinc-800 bg-[#141418] text-zinc-600"}`}>
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`whitespace-nowrap text-[11px] font-medium ${active ? "text-zinc-200" : done ? "text-zinc-400" : "text-zinc-600"}`}>
                {s.label}
              </span>
            </div>
            {i < STUDIO_STEPS.length - 1 && (
              <div className={`mx-2 h-px w-8 sm:w-12 ${done ? "bg-emerald-500/40" : "bg-zinc-800"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
