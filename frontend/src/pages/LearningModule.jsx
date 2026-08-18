import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import { parseXmp } from "@/lib/xmpParse";
import { PARAM_DEFS } from "@/lib/paramDefs";
import { Brain, Upload, Loader2, Save, Trash2, Star, FileText, X, Sparkles } from "lucide-react";

const DEF = Object.fromEntries(PARAM_DEFS.map((p) => [p.key, p]));
const BASIC_KEYS = ["exposure", "contrast", "highlights", "shadows", "whites", "blacks", "temperature", "tint"];
const CREATIVE_KEYS = ["clarity", "vibrance", "saturation"];
const ALL_KEYS = [...BASIC_KEYS, ...CREATIVE_KEYS];

function fmt(key, v) {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  if (key === "exposure") return `${sign}${Number(v).toFixed(2)} EV`;
  if (key === "temperature") return `${Math.round(v)} K`;
  return `${sign}${Math.round(v)}`;
}

function TendencyGrid({ keys, values, testid }) {
  const present = keys.filter((k) => values && values[k] != null);
  if (!present.length) return <p className="text-xs text-zinc-600">Sin datos en estas correcciones.</p>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid={testid}>
      {present.map((k) => (
        <div key={k} data-testid={`tendency-${k}`} className="rounded-md border border-zinc-800 bg-[#1c1c22] px-2.5 py-1.5">
          <span className="block text-[10px] text-zinc-500">{DEF[k]?.label || k}</span>
          <span className="font-mono text-xs text-emerald-400">{fmt(k, values[k])}</span>
        </div>
      ))}
    </div>
  );
}

export default function LearningModule() {
  const [samples, setSamples] = useState([]); // [{ name, values }]
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [profiles, setProfiles] = useState([]);
  const fileRef = useRef(null);

  const loadProfiles = () => api.get("/learning/profiles").then((r) => setProfiles(r.data)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial (solo al montar)
  useEffect(() => { loadProfiles(); }, []);

  const runAnalysis = async (allSamples) => {
    if (!allSamples.length) { setAnalysis(null); return; }
    setAnalyzing(true);
    try {
      const res = await api.post("/learning/analyze", { samples: allSamples.map((s) => s.values) });
      setAnalysis(res.data);
    } catch { toast.error("No se pudo analizar las correcciones"); }
    finally { setAnalyzing(false); }
  };

  const onUpload = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    if (!list.length) return;
    const added = [];
    for (const file of list) {
      try {
        const text = await file.text();
        const { config, found } = parseXmp(text);
        if (!found) continue;
        const values = {};
        for (const p of PARAM_DEFS) if (config[p.key]?.enabled) values[p.key] = config[p.key].value;
        if (Object.keys(values).length) added.push({ name: file.name, values });
      } catch { /* archivo ilegible: se ignora */
        if (process.env.NODE_ENV === "development") console.debug("XMP ilegible, se ignora:", file.name);
      }
    }
    if (!added.length) { toast.error("Ningún .xmp válido con ajustes de revelado"); return; }
    const next = [...samples, ...added];
    setSamples(next);
    toast.success(`${added.length} XMP añadidos`, { description: `${next.length} correcciones en total` });
    runAnalysis(next);
  };

  const removeSample = (name) => {
    const next = samples.filter((s) => s.name !== name);
    setSamples(next);
    runAnalysis(next);
  };

  const clearAll = () => { setSamples([]); setAnalysis(null); };

  const saveProfile = async () => {
    const name = saveName.trim();
    if (!name) { toast.error("Pon un nombre al perfil"); return; }
    if (!samples.length) return;
    try {
      const res = await api.post("/learning/profiles", { name, samples: samples.map((s) => s.values) });
      setProfiles((prev) => [res.data, ...prev.map((p) => ({ ...p, active: res.data.active ? false : p.active }))]);
      setSaveName("");
      toast.success("Perfil personal guardado", { description: `${name} aprendido de ${samples.length} correcciones` });
    } catch (err) { toast.error(err?.response?.data?.detail || "No se pudo guardar"); }
  };

  const activate = async (id) => {
    try {
      await api.patch(`/learning/profiles/${id}/activate`);
      setProfiles((prev) => prev.map((p) => ({ ...p, active: p.id === id })));
      toast.success("Perfil activado");
    } catch { toast.error("No se pudo activar"); }
  };

  const removeProfile = async (id) => {
    await api.delete(`/learning/profiles/${id}`);
    setProfiles((prev) => prev.filter((x) => x.id !== id));
    toast.success("Perfil eliminado");
  };

  return (
    <AppShell>
      <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Aprendizaje</p>
      <h1 className="font-display mt-1 flex items-center gap-2 text-2xl font-semibold">
        <Brain className="h-6 w-6 text-emerald-400" /> Aprende de mis correcciones
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500">
        Sube tus propios XMP ya editados a mano. El sistema analiza tus tendencias (luz, tono, color y capa creativa)
        y crea un <span className="text-zinc-300">perfil personal</span> con tu firma de revelado. Tus RAW no se tocan.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="learning-upload-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Tus correcciones</h2>
            <p className="mt-1 text-sm text-zinc-500">{samples.length} XMP cargados</p>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".xmp" multiple hidden onChange={onUpload} data-testid="learning-file-input" />
            <button data-testid="learning-upload-btn" onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02]">
              <Upload className="h-4 w-4" /> Subir .xmp
            </button>
            {samples.length > 0 && (
              <button data-testid="learning-clear-btn" onClick={clearAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
                Limpiar
              </button>
            )}
          </div>
        </div>

        {samples.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" data-testid="learning-sample-list">
            {samples.map((s) => (
              <span key={s.name} data-testid={`sample-${s.name}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-[#1c1c22] px-3 py-1 text-xs text-zinc-300">
                <FileText className="h-3 w-3 text-zinc-500" /> {s.name}
                <button data-testid={`remove-sample-${s.name}`} onClick={() => removeSample(s.name)} className="text-zinc-600 hover:text-rose-400"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}

        {samples.length === 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-zinc-800 bg-[#101012] p-8 text-center" data-testid="learning-empty">
            <Upload className="mx-auto h-8 w-8 text-zinc-700" />
            <p className="mt-3 text-sm text-zinc-400">Arrastra o selecciona los .xmp de fotos que ya editaste tú</p>
            <p className="mt-1 text-xs text-zinc-600">Cuantas más correcciones, mejor aprenderá tu estilo.</p>
          </div>
        )}
      </div>

      {analyzing && (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500" data-testid="learning-analyzing">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> Analizando tendencias…
        </div>
      )}

      {analysis && !analyzing && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="learning-analysis">
          <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-zinc-500">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" /> Tu firma de revelado
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-300" data-testid="learning-summary">{analysis.summary}</p>

          <p className="mt-5 font-mono text-xs uppercase tracking-wider text-zinc-500">Ajustes básicos (media)</p>
          <div className="mt-2"><TendencyGrid keys={BASIC_KEYS} values={analysis.basic} testid="learning-basic-grid" /></div>

          <p className="mt-5 font-mono text-xs uppercase tracking-wider text-zinc-500">Capa creativa (media)</p>
          <div className="mt-2"><TendencyGrid keys={CREATIVE_KEYS} values={analysis.creative} testid="learning-creative-grid" /></div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <input data-testid="learning-name-input" value={saveName} onChange={(e) => setSaveName(e.target.value)}
              placeholder="Nombre del perfil, ej. Mi estilo boda"
              className="flex-1 min-w-[220px] rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60" />
            <button data-testid="learning-save-btn" onClick={saveProfile} disabled={!saveName.trim() || !samples.length}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100">
              <Save className="h-4 w-4" /> Guardar perfil personal
            </button>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="font-display text-lg font-semibold">Mis perfiles personales ({profiles.length})</h2>
        {profiles.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600" data-testid="no-personal-profiles">Aún no has guardado ningún perfil personal.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => (
              <div key={p.id} data-testid={`personal-profile-${p.id}`}
                className={`rounded-xl border p-4 transition-all ${p.active ? "border-emerald-400/70 ring-2 ring-emerald-400/30 bg-emerald-400/[0.05]" : "border-zinc-800 bg-[#141418]"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{p.samples} correcciones aprendidas</p>
                  </div>
                  <button data-testid={`delete-personal-${p.id}`} onClick={() => removeProfile(p.id)} className="text-zinc-600 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ALL_KEYS.filter((k) => (p.basic?.[k] ?? p.creative?.[k]) != null).slice(0, 6).map((k) => (
                    <span key={k} className="rounded-md bg-zinc-800/60 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                      {DEF[k]?.label || k} {fmt(k, p.basic?.[k] ?? p.creative?.[k])}
                    </span>
                  ))}
                </div>
                <div className="mt-4">
                  {p.active ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400"><Star className="h-3.5 w-3.5 fill-emerald-400" /> Perfil activo</span>
                  ) : (
                    <button data-testid={`activate-personal-${p.id}`} onClick={() => activate(p.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
                      <Star className="h-3.5 w-3.5" /> Activar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
