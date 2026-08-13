import { useState } from "react";
import { ArrowRight, Camera } from "lucide-react";

const PROFILES = [
  { name: "Adobe Standard", desc: "Perfil neutro recomendado por defecto." },
  { name: "Camera Neutral", desc: "Colores planos, máximo margen de edición." },
  { name: "Camera Portrait", desc: "Tonos de piel suaves para retratos." },
  { name: "Camera Vivid", desc: "Colores intensos y contrastados." },
];

export default function CameraProfileStep({ count, value, onContinue }) {
  const [choice, setChoice] = useState(value?.profile || "Adobe Standard");

  return (
    <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="profile-step">
      <div className="flex items-center gap-2.5">
        <Camera className="h-5 w-5 text-emerald-400" />
        <h2 className="font-display text-lg font-semibold">Perfil de cámara</h2>
      </div>
      <p className="mt-1.5 text-sm text-zinc-500">
        Se aplicará a las {count} fotos en cola. Es el punto de partida de color antes de la corrección IA.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {PROFILES.map((p) => (
          <button key={p.name} data-testid={`profile-${p.name}`} onClick={() => setChoice(p.name)}
            className={`rounded-xl border p-4 text-left transition-all duration-200
              ${choice === p.name ? "border-emerald-400/70 bg-emerald-400/[0.06] ring-2 ring-emerald-400/30" : "border-zinc-800 bg-[#1c1c22] hover:border-zinc-600"}`}>
            <p className="text-sm font-medium text-zinc-100">{p.name}</p>
            <p className="mt-1 text-xs text-zinc-500">{p.desc}</p>
          </button>
        ))}
      </div>

      <button data-testid="profile-continue-btn" onClick={() => onContinue({ profile: choice })}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02]">
        Continuar <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
