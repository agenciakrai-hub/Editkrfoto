import { useEffect, useState } from "react";
import { ArrowRight, Camera, Plus, X, Info } from "lucide-react";

// Perfiles de cámara de Adobe Lightroom / Camera Raw.
// `name` = valor EXACTO que se escribe en crs:CameraProfile del XMP (nombre interno de Adobe).
// `label` = etiqueta en español (como se ve en Lightroom en español).
const ADOBE_PROFILES = [
  { name: "Adobe Color", label: "Adobe Color", desc: "Predeterminado de Lightroom. Color equilibrado." },
  { name: "Adobe Standard", label: "Adobe Estándar", desc: "Neutro clásico, buen margen de edición." },
  { name: "Adobe Portrait", label: "Adobe Retrato", desc: "Tonos de piel suaves para retratos." },
  { name: "Adobe Landscape", label: "Adobe Paisaje", desc: "Verdes y azules más vivos." },
  { name: "Adobe Vivid", label: "Adobe Vivos", desc: "Colores intensos y contrastados." },
  { name: "Adobe Neutral", label: "Adobe Neutro", desc: "Contraste bajo, máximo detalle." },
  { name: "Adaptive Color", label: "Adaptable Color", desc: "Perfil adaptativo por escena (IA de Adobe)." },
  { name: "Adobe Monochrome", label: "Adobe Monocromo", desc: "Blanco y negro base de Adobe." },
  { name: "Adaptive Monochrome", label: "Adaptable B&N", desc: "B/N adaptativo por escena." },
];

const LS_KEY = "krfoto.customProfiles";
function loadCustom() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveCustom(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* almacenamiento no disponible */ }
}

export default function CameraProfileStep({ count, value, onContinue, embedded = false, onChange }) {
  const [choice, setChoice] = useState(value?.profile || "Adobe Color");
  const [custom, setCustom] = useState(loadCustom);
  const [newName, setNewName] = useState("");

  // eslint-disable-next-line react-hooks/exhaustive-deps -- notifica el perfil elegido al contenedor (modo embebido)
  useEffect(() => { if (embedded && onChange) onChange({ profile: choice }); }, [choice, embedded]);

  const addCustom = () => {
    const n = newName.trim();
    if (!n) return;
    const all = [...ADOBE_PROFILES.map((p) => p.name), ...custom.map((c) => c.name)];
    if (all.some((x) => x.toLowerCase() === n.toLowerCase())) { setNewName(""); setChoice(n); return; }
    const next = [...custom, { name: n }];
    setCustom(next); saveCustom(next); setNewName(""); setChoice(n);
  };
  const removeCustom = (name) => {
    const next = custom.filter((c) => c.name !== name);
    setCustom(next); saveCustom(next);
    if (choice === name) setChoice("Adobe Color");
  };

  const Card = ({ name, label, desc, onRemove }) => (
    <button data-testid={`profile-${name}`} onClick={() => setChoice(name)}
      className={`group relative rounded-xl border p-4 text-left transition-all duration-200
        ${choice === name ? "border-emerald-400/70 bg-emerald-400/[0.06] ring-2 ring-emerald-400/30" : "border-zinc-800 bg-[#1c1c22] hover:border-zinc-600"}`}>
      <p className="text-sm font-medium text-zinc-100">{label || name}</p>
      <p className="mt-1 text-xs text-zinc-500">{desc || "Perfil personalizado. Debe existir en tu Lightroom con este nombre exacto."}</p>
      {onRemove && (
        <span data-testid={`profile-remove-${name}`} onClick={(e) => { e.stopPropagation(); onRemove(name); }}
          className="absolute right-2 top-2 rounded p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-200 group-hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );

  return (
    <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="profile-step">
      <div className="flex items-center gap-2.5">
        <Camera className="h-5 w-5 text-emerald-400" />
        <h2 className="font-display text-lg font-semibold">Perfil de cámara</h2>
      </div>
      <p className="mt-1.5 text-sm text-zinc-500">
        Se aplicará a las {count} fotos en cola. Es el punto de partida de color (crs:CameraProfile) antes de la corrección IA.
      </p>

      <p className="mt-4 font-mono text-xs uppercase tracking-wider text-zinc-500">Perfiles de Adobe</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADOBE_PROFILES.map((p) => <Card key={p.name} {...p} />)}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Mis perfiles</p>
        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600"><Info className="h-3 w-3" /> Deben existir en tu Lightroom con el mismo nombre</span>
      </div>
      {custom.length > 0 && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {custom.map((c) => <Card key={c.name} name={c.name} label={c.name} onRemove={removeCustom} />)}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <input data-testid="profile-custom-input" value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
          placeholder="Nombre exacto del perfil (p. ej. VSCO 01, mi_perfil.dcp)"
          className="flex-1 rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400/60" />
        <button data-testid="profile-add-btn" onClick={addCustom} disabled={!newName.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">
          <Plus className="h-4 w-4" /> Añadir
        </button>
      </div>

      <button data-testid="profile-continue-btn" onClick={() => onContinue({ profile: choice })}
        className={`mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] ${embedded ? "hidden" : ""}`}>
        Continuar con «{choice}» <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
