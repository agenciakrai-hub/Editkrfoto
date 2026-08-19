import { useEffect, useRef, useState } from "react";
import { ArrowRight, Upload, Save, Trash2, Lock, Palette, Check, X } from "lucide-react";
import { toast } from "sonner";
import { PARAM_DEFS, PRECISION_MODES } from "@/lib/paramDefs";

const BASIC_DEFS = PARAM_DEFS; // los 13 los controla la IA
const LS_KEY = "krfoto.presets";
function loadPresets() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function savePresets(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* almacenamiento no disponible */ }
}

export default function PresetParamsStep({ count, onContinue, embedded = false, onChange }) {
  const [precision, setPrecision] = useState("balanced");
  const [presetName, setPresetName] = useState(null);
  const [presetXmpText, setPresetXmpText] = useState(null);
  const [saved, setSaved] = useState(loadPresets);
  const fileRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- notifica el estilo elegido al contenedor (modo embebido)
  useEffect(() => { if (embedded && onChange) onChange({ config: null, precisionMode: precision, presetName, presetXmpText }); }, [precision, presetName, presetXmpText, embedded]);

  const onXmpUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    setPresetName(file.name.replace(/\.xmp$/i, ""));
    setPresetXmpText(text);
    toast.success("Preset .xmp cargado", { description: "Se conserva su look de color; la IA solo ajusta las básicas por foto" });
  };

  const saveCurrent = () => {
    if (!presetXmpText || !presetName) return;
    if (saved.some((p) => p.name === presetName)) { toast.info("Ese preset ya está guardado"); return; }
    const next = [{ name: presetName, xmpText: presetXmpText }, ...saved];
    setSaved(next); savePresets(next);
    toast.success(`Preset "${presetName}" guardado`);
  };
  const pickSaved = (p) => { setPresetName(p.name); setPresetXmpText(p.xmpText); };
  const removeSaved = (name, e) => {
    e.stopPropagation();
    const next = saved.filter((p) => p.name !== name);
    setSaved(next); savePresets(next);
    if (presetName === name) { setPresetName(null); setPresetXmpText(null); }
  };
  const clearPreset = () => { setPresetName(null); setPresetXmpText(null); };

  return (
    <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="presets-step">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Correcciones IA + preset de color</h2>
          <p className="mt-1 text-sm text-zinc-500">{count} fotos en cola · cada módulo trabaja por separado y todo queda en el XMP (con las 5★ y el color de la selección)</p>
        </div>
      </div>

      {/* Módulo 1: básicos automáticos por IA (aceptación, no editable, no afectado por el preset) */}
      <div className="mt-6 rounded-lg border border-zinc-800 bg-[#101012] p-4" data-testid="basic-auto-panel">
        <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-zinc-500">
          <Lock className="h-3.5 w-3.5 text-emerald-400" /> Ajustes básicos — automático por IA
        </p>
        <p className="mt-1 text-[11px] text-zinc-600">La IA nivela estos 13 valores por foto (luz, tono, balance de blancos y presencia). El preset/estilo NO los modifica.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BASIC_DEFS.map((p) => (
            <div key={p.key} data-testid={`basic-${p.key}`} className="rounded-md border border-zinc-800 bg-[#1c1c22] px-2.5 py-1.5">
              <span className="block text-[10px] text-zinc-500">{p.label}</span>
              <span className="font-mono text-xs text-emerald-400">Auto</span>
            </div>
          ))}
        </div>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-zinc-600">Intensidad de la corrección</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {PRECISION_MODES.map((m) => (
            <button key={m.key} data-testid={`precision-${m.key}`} onClick={() => setPrecision(m.key)}
              className={`rounded-lg border p-2.5 text-left transition-all duration-200
                ${precision === m.key ? "border-emerald-400/70 bg-emerald-400/[0.06]" : "border-zinc-800 bg-[#1c1c22] hover:border-zinc-600"}`}>
              <p className="text-xs font-medium text-zinc-100">{m.label}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Módulo 2: preset / estilo de color (capa creativa) */}
      <div className="mt-5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-zinc-500">
          <Palette className="h-3.5 w-3.5 text-emerald-400" /> Preset / estilo de color (capa creativa)
        </p>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xmp" hidden onChange={onXmpUpload} data-testid="xmp-upload-input" />
          <button data-testid="upload-xmp-btn" onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
            <Upload className="h-3.5 w-3.5" /> Subir .xmp
          </button>
          <button data-testid="save-preset-btn" onClick={saveCurrent} disabled={!presetXmpText}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="preset-list">
        <button data-testid="preset-none" onClick={clearPreset}
          className={`rounded-xl border p-4 text-left transition-all ${!presetName ? "border-emerald-400/70 bg-emerald-400/[0.06] ring-2 ring-emerald-400/30" : "border-zinc-800 bg-[#1c1c22] hover:border-zinc-600"}`}>
          {!presetName && <Check className="float-right h-4 w-4 text-emerald-400" />}
          <p className="text-sm font-medium text-zinc-100">Sin preset</p>
          <p className="mt-1 text-xs text-zinc-500">Solo perfil de cámara + básicas de la IA.</p>
        </button>
        {saved.map((p) => (
          <button key={p.name} data-testid={`preset-${p.name}`} onClick={() => pickSaved(p)}
            className={`group relative rounded-xl border p-4 text-left transition-all ${presetName === p.name ? "border-emerald-400/70 bg-emerald-400/[0.06] ring-2 ring-emerald-400/30" : "border-zinc-800 bg-[#1c1c22] hover:border-zinc-600"}`}>
            {presetName === p.name && <Check className="float-right h-4 w-4 text-emerald-400" />}
            <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
            <p className="mt-1 text-xs text-zinc-500">Preset guardado (.xmp)</p>
            <span data-testid={`preset-remove-${p.name}`} onClick={(e) => removeSaved(p.name, e)}
              className="absolute right-2 top-2 rounded p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-rose-400 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </div>

      {presetName && presetXmpText && !saved.some((p) => p.name === presetName) && (
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-400" data-testid="preset-active">
          Activo: <span className="font-mono text-emerald-300">{presetName}</span>
          <button onClick={clearPreset} className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-200"><X className="h-3 w-3" /> quitar</button>
        </p>
      )}

      <button data-testid="presets-continue-btn"
        onClick={() => onContinue({ config: null, precisionMode: precision, presetName, presetXmpText })}
        className={`mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] ${embedded ? "hidden" : ""}`}>
        Continuar <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
