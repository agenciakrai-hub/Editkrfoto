import { useEffect, useRef, useState } from "react";
import { ArrowRight, RotateCcw, Check, Upload, Save, Trash2, User, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  PARAM_DEFS, PRECISION_MODES, STYLE_PRESETS, defaultParameterConfig, applyPreset,
  creativeParametersFromConfig, fullParametersFromConfig, pickCreative,
  CREATIVE_KEYS, AUTO_BASIC_PARAMS,
} from "@/lib/paramDefs";
import { parseXmp } from "@/lib/xmpParse";
import KrAutoNivelado from "@/components/studio/KrAutoNivelado";
import PhotographerStyles from "@/components/studio/PhotographerStyles";
import BeforeAfterPreview from "@/components/studio/BeforeAfterPreview";
import api from "@/lib/api";

const DEF_MAP = Object.fromEntries(PARAM_DEFS.map((p) => [p.key, p]));
const BASIC_DEFS = PARAM_DEFS.filter((p) => p.basic);
const CREATIVE_DEFS = PARAM_DEFS.filter((p) => !p.basic);

function autoLabel(key) {
  const p = DEF_MAP[key];
  if (!(key in AUTO_BASIC_PARAMS)) return "Auto";
  const v = AUTO_BASIC_PARAMS[key];
  if (key === "exposure") return `${v > 0 ? "+" : ""}${v.toFixed(2)} ${p.unit}`;
  return `${v > 0 ? "+" : ""}${v}`;
}

// Solo aplica claves CREATIVAS (presets/estilos no tocan lo básico).
function configFromCreative(params) {
  const cfg = defaultParameterConfig();
  for (const [key, value] of Object.entries(pickCreative(params))) {
    const d = DEF_MAP[key];
    if (!d) continue;
    cfg[key] = { enabled: true, value: Math.min(d.max, Math.max(d.min, Number(value))) };
  }
  return cfg;
}

export default function PresetParamsStep({ count, onContinue }) {
  const [config, setConfig] = useState(defaultParameterConfig());
  const [precision, setPrecision] = useState("balanced");
  const [presetName, setPresetName] = useState(null);
  const [presetXmpText, setPresetXmpText] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { api.get("/style-profiles").then((r) => setProfiles(r.data)).catch(() => {}); }, []);

  const pickPreset = (preset) => { setConfig(applyPreset(defaultParameterConfig(), preset)); setPresetName(preset.name); setPresetXmpText(null); };
  const setVal = (key, value) => setConfig((c) => ({ ...c, [key]: { ...c[key], value: Number(value) } }));
  const setEnabled = (key, enabled) => setConfig((c) => ({ ...c, [key]: { ...c[key], enabled } }));

  const onXmpUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const { config: parsed } = parseXmp(text);
    const creative = {};
    for (const k of CREATIVE_KEYS) if (parsed[k]?.enabled) creative[k] = parsed[k].value;
    setConfig(configFromCreative(creative)); // para la vista previa; el look completo va en presetXmpText
    setPresetName(file.name.replace(/\.xmp$/i, ""));
    setPresetXmpText(text); // se conserva el preset COMPLETO (curvas, HSL, textura…) y solo la IA cambia los básicos por foto
    toast.success("Preset .xmp cargado", { description: "Se conserva el look completo; la IA solo ajusta la luz básica por foto" });
  };

  const applyProfile = (p) => {
    setConfig(configFromCreative(p.parameters));
    setPrecision(p.precision_mode || "balanced");
    setPresetName(p.name);
    setPresetXmpText(null);
    toast.success(`Perfil "${p.name}" aplicado`);
  };

  const saveProfile = async () => {
    const name = saveName.trim();
    if (!name) return;
    const params = creativeParametersFromConfig(config);
    if (!Object.keys(params).length) { toast.error("Activa algún ajuste creativo para guardar"); return; }
    try {
      const res = await api.post("/style-profiles", { name, parameters: params, precision_mode: precision });
      setProfiles((prev) => [res.data, ...prev]);
      setShowSave(false); setSaveName(""); setPresetName(name);
      toast.success("Perfil de estilo guardado");
    } catch { toast.error("No se pudo guardar el perfil"); }
  };

  const deleteProfile = async (id, e) => {
    e.stopPropagation();
    await api.delete(`/style-profiles/${id}`);
    setProfiles((prev) => prev.filter((x) => x.id !== id));
    toast.success("Perfil eliminado");
  };

  return (
    <div className="space-y-5">
      <KrAutoNivelado />

      <PhotographerStyles activeName={presetName} onUseStyle={(prof) => {
        setPresetName(prof.name);
        setPresetXmpText(null);
        if (prof.precision_mode) setPrecision(prof.precision_mode);
        const creative = pickCreative(prof.suggested_parameters || {});
        if (Object.keys(creative).length) {
          setConfig(configFromCreative(creative));
          toast.success(`Estilo "${prof.name}" aplicado`, { description: `${Object.keys(creative).length} ajustes creativos desde la galería` });
        } else {
          toast.success(`Estilo de referencia "${prof.name}" seleccionado`);
        }
      }} />

      <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="presets-step">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Presets y correcciones IA</h2>
            <p className="mt-1 text-sm text-zinc-500">Edición IA — {count} fotos en cola</p>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".xmp" hidden onChange={onXmpUpload} data-testid="xmp-upload-input" />
            <button data-testid="upload-xmp-btn" onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
              <Upload className="h-3.5 w-3.5" /> Subir .xmp
            </button>
            <button data-testid="reset-params-btn" onClick={() => { setConfig(defaultParameterConfig()); setPresetName(null); setPresetXmpText(null); }}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
              <RotateCcw className="h-3.5 w-3.5" /> Restablecer
            </button>
          </div>
        </div>

        {/* Ajustes básicos: automáticos por IA (no editables, no afectados por preset/estilo) */}
        <div className="mt-6 rounded-lg border border-zinc-800 bg-[#101012] p-4" data-testid="basic-auto-panel">
          <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-zinc-500">
            <Lock className="h-3.5 w-3.5 text-emerald-400" /> Ajustes básicos — automático por IA
          </p>
          <p className="mt-1 text-[11px] text-zinc-600">Luz, tono y balance de blancos se nivelan automáticamente por foto. Los presets y estilos no los modifican.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BASIC_DEFS.map((p) => (
              <div key={p.key} data-testid={`basic-${p.key}`} className="rounded-md border border-zinc-800 bg-[#1c1c22] px-2.5 py-1.5">
                <span className="block text-[10px] text-zinc-500">{p.label}</span>
                <span className="font-mono text-xs text-emerald-400">{autoLabel(p.key)}</span>
              </div>
            ))}
          </div>
        </div>

        {profiles.length > 0 && (
          <>
            <p className="mt-6 font-mono text-xs uppercase tracking-wider text-zinc-500">Mis perfiles</p>
            <div className="mt-2 flex flex-wrap gap-2" data-testid="my-profiles">
              {profiles.map((p) => (
                <div key={p.id} data-testid={`my-profile-${p.name}`} onClick={() => applyProfile(p)}
                  className={`group flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all
                    ${presetName === p.name ? "border-emerald-400/70 bg-emerald-400/[0.08] text-emerald-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"}`}>
                  <User className="h-3.5 w-3.5" /> {p.name}
                  <button data-testid={`delete-profile-${p.name}`} onClick={(e) => deleteProfile(p.id, e)} className="ml-1 text-zinc-600 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-6 font-mono text-xs uppercase tracking-wider text-zinc-500">Perfil de estilo (capa creativa)</p>
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
            <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-zinc-500"><Sparkles className="h-3.5 w-3.5 text-emerald-400" /> Ajustes creativos (preset / estilo)</p>
            <p className="mt-1 max-w-md text-xs text-zinc-600">La capa artística sobre la base automática. Ajústala manualmente si quieres.</p>
          </div>
          {showSave ? (
            <div className="flex items-center gap-2">
              <input data-testid="save-profile-input" autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Nombre del perfil"
                className="rounded-md border border-zinc-700 bg-[#101012] px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-400/60" />
              <button data-testid="confirm-save-profile-btn" onClick={saveProfile} className="rounded-md bg-emerald-400 px-2.5 py-1.5 text-xs font-semibold text-zinc-950">Guardar</button>
            </div>
          ) : (
            <button data-testid="save-profile-btn" onClick={() => setShowSave(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
              <Save className="h-3.5 w-3.5" /> Guardar como perfil
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {CREATIVE_DEFS.map((p) => {
            const on = config[p.key].enabled;
            return (
              <div key={p.key} data-testid={`param-${p.key}`}>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input type="checkbox" data-testid={`param-toggle-${p.key}`} checked={on}
                      onChange={(e) => setEnabled(p.key, e.target.checked)} className="h-3.5 w-3.5 accent-emerald-400" />
                    {p.label}
                  </label>
                  <span className={`font-mono text-xs ${on ? "text-emerald-400" : "text-zinc-600"}`}>
                    {config[p.key].value}{p.unit ? ` ${p.unit}` : ""}
                  </span>
                </div>
                <input type="range" data-testid={`param-slider-${p.key}`} className="rawai-slider mt-2 w-full"
                  min={p.min} max={p.max} step={p.step} value={config[p.key].value}
                  disabled={!on} onChange={(e) => setVal(p.key, e.target.value)} style={{ opacity: on ? 1 : 0.4 }} />
              </div>
            );
          })}
        </div>

        {!presetName && <p className="mt-6 text-xs text-amber-400/90">Selecciona un perfil de estilo, sube un .xmp o carga un perfil guardado para continuar.</p>}

        <div className="mt-6"><BeforeAfterPreview params={fullParametersFromConfig(config)} /></div>

        <button data-testid="presets-continue-btn" disabled={!presetName}
          onClick={() => onContinue({ config, precisionMode: precision, presetName, presetXmpText })}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100">
          Continuar <ArrowRight className="h-4 w-4" />
        </button>
      </section>
    </div>
  );
}
