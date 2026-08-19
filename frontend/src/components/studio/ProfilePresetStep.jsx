import { useState } from "react";
import { ArrowRight, Wand2 } from "lucide-react";
import CameraProfileStep from "@/components/studio/CameraProfileStep";
import PresetParamsStep from "@/components/studio/PresetParamsStep";

// Paso combinado: Perfil de cámara + correcciones básicas IA (automáticas) + preset/estilo de color.
// Todo en una sola página. El preset es OPCIONAL: sin él se aplica perfil + básicas de la IA.
export default function ProfilePresetStep({ count, profileValue, presetValue, onContinue }) {
  const [profile, setProfile] = useState(profileValue || { profile: "Adobe Color" });
  const [preset, setPreset] = useState(presetValue || { config: null, precisionMode: "balanced", presetName: null, presetXmpText: null });

  return (
    <div className="space-y-5" data-testid="profile-preset-step">
      <CameraProfileStep count={count} value={profile} embedded onChange={setProfile} />

      <div className="flex items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.04] p-4" data-testid="pipeline-explainer">
        <Wand2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        <div className="text-sm text-zinc-300">
          <p className="font-medium text-zinc-100">Flujo de revelado</p>
          <p className="mt-0.5 text-[13px] leading-6 text-zinc-400">
            <span className="text-emerald-300">1.</span> Perfil elegido: <span className="font-mono text-zinc-200">{profile.profile}</span>
            <span className="mx-1 text-zinc-600">→</span>
            <span className="text-emerald-300">2.</span> la IA aplica las 13 básicas por foto (exposición, luces, sombras, WB…)
            <span className="mx-1 text-zinc-600">→</span>
            <span className="text-emerald-300">3.</span> se añade el preset/estilo de color encima {preset.presetName ? <span className="font-mono text-zinc-200">({preset.presetName})</span> : "(opcional)"}.
          </p>
        </div>
      </div>

      <PresetParamsStep count={count} embedded onChange={setPreset} />

      <button data-testid="profile-preset-continue-btn"
        onClick={() => onContinue({ profileChoice: profile, presetInfo: preset })}
        className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02]">
        Continuar a XMP <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
