import { useState } from "react";
import { ArrowRight, RotateCcw, Check } from "lucide-react";
import { PARAM_DEFS, PRECISION_MODES, STYLE_PRESETS, defaultParameterConfig, applyPreset } from "@/lib/paramDefs";

export default function PresetParamsStep({ count, onContinue }) {
  const [config, setConfig] = useState(defaultParameterConfig());
  const [precision, setPrecision] = useState("balanced");
  const [presetName, setPresetName] = useState(null);

  const pickPreset = (preset) => {
    setConfig(applyPreset(defaultParameterConfig(), preset));
    setPresetName(preset.name);
  };

  const setVal = (key, value) => setConfig((c) => ({ ...c, [key]: { ...c[key], value: Number(value) } }));
  const setEnabled = (key, enabled) => setConfig((c) => ({ ...c, [key]: { ...c[key], enabled } }));

  return (
    <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="presets-step">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Presets y correcciones IA</h2>
          <p className="mt-1 text-sm text-zinc-500">Edición IA — {count} fotos en cola</p>
        </div>
        <button data-testid="reset-params-btn" onClick={() => { setConfig(defaultParameterConfig()); setPresetName(null); }}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
          <RotateCcw className="h-3.5 w-3.5" /> Restablecer
        </button>
      </div>

      <p className="mt-6 font-mono text-xs uppercase tracking-wider text-zinc-500">Perfil de estilo</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STYLE_PRESETS.map((preset) => (
          <button key={preset.name} data-testid={`preset-${preset.name}`} onClick={() => pickPreset(preset)}
            className={`relative rounded-xl border p-4 text-left transition-all duration-200
              ${presetName === preset.name ? "border-emerald-400/70 bg-emerald-400/[0.06] ring-2 ring-emerald-400/30" : "border-zinc-800 bg-[#1c1c22] hover:border-zinc-600"}`}>
            {presetName === preset.name && <Check className="absolute right-3 top-3 h-4 w-4 text-emerald-400" />}
            <p className="text-sm font-medium text-zinc-100">{preset.name}</p>
            <p className="mt-1 text-xs text-zinc-500">{preset.desc}</p>
          </button>
        ))}
      </div>

      <p className="mt-8 font-mono text-xs uppercase tracking-wider text-zinc-500">Modo de precisión</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {PRECISION_MODES.map((m) => (
          <button key={m.key} data-testid={`precision-${m.key}`} onClick={() => setPrecision(m.key)}
            className={`rounded-lg border p-3 text-left transition-all duration-200
              ${precision === m.key ? "border-emerald-400/70 bg-emerald-400/[0.06]" : "border-zinc-800 bg-[#1c1c22] hover:border-zinc-600"}`}>
            <p className="text-sm font-medium text-zinc-100">{m.label}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">{m.desc}</p>
          </button>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Preferencias de corrección</p>
          <p className="mt-1 max-w-md text-xs text-zinc-600">Activa solo lo que quieras forzar sobre la corrección base de la IA.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {PARAM_DEFS.map((p) => {
          const on = config[p.key].enabled;
          return (
            <div key={p.key} data-testid={`param-${p.key}`}>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" data-testid={`param-toggle-${p.key}`} checked={on}
                    onChange={(e) => setEnabled(p.key, e.target.checked)}
                    className="h-3.5 w-3.5 accent-emerald-400" />
                  {p.label}
                </label>
                <span className={`font-mono text-xs ${on ? "text-emerald-400" : "text-zinc-600"}`}>
                  {config[p.key].value}{p.unit ? ` ${p.unit}` : ""}
                </span>
              </div>
              <input type="range" data-testid={`param-slider-${p.key}`} className="rawai-slider mt-2 w-full"
                min={p.min} max={p.max} step={p.step} value={config[p.key].value}
                disabled={!on} onChange={(e) => setVal(p.key, e.target.value)}
                style={{ opacity: on ? 1 : 0.4 }} />
            </div>
          );
        })}
      </div>

      {!presetName && <p className="mt-6 text-xs text-amber-400/90">Selecciona un perfil de estilo para continuar.</p>}

      <button data-testid="presets-continue-btn" disabled={!presetName}
        onClick={() => onContinue({ config, precisionMode: precision, presetName })}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100">
        Generar XMP <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
