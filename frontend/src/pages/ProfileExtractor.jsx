import { useEffect, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import { Link2, Loader2, Save, Trash2, Search, CheckCircle2, AlertTriangle } from "lucide-react";

const COMPAT = {
  yes: { label: "Compatible LR", cls: "text-emerald-300 bg-emerald-400/10" },
  documented: { label: "Documentado", cls: "text-amber-300 bg-amber-400/10" },
  unknown: { label: "Sin determinar", cls: "text-zinc-400 bg-zinc-800/60" },
};

export default function ProfileExtractor() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState([]);

  const loadSaved = () => api.get("/profile-extractor/profiles").then((r) => setSaved(r.data)).catch(() => {});
  useEffect(() => { loadSaved(); }, []);

  const analyze = async () => {
    if (!url.trim()) return;
    setLoading(true); setResult(null);
    try {
      const res = await api.post("/profile-extractor/analyze", { url: url.trim() });
      setResult(res.data);
      if (!res.data.found) toast.info("No se encontraron perfiles en esa URL");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo analizar la URL");
    } finally { setLoading(false); }
  };

  const save = async () => {
    const news = (result?.profiles || []).filter((p) => p.status === "new");
    if (!news.length) return;
    try {
      const res = await api.post("/profile-extractor/save", { profiles: news });
      toast.success(`${res.data.saved} perfiles guardados`);
      loadSaved();
      setResult((r) => ({ ...r, profiles: r.profiles.map((p) => (p.status === "new" ? { ...p, status: "existing" } : p)) }));
    } catch { toast.error("No se pudieron guardar los perfiles"); }
  };

  const remove = async (id) => {
    await api.delete(`/profile-extractor/profiles/${id}`);
    setSaved((s) => s.filter((x) => x.id !== id));
    toast.success("Perfil eliminado");
  };

  const Row = ({ p, i }) => (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_0.7fr_0.9fr] gap-2 px-3 py-2 text-xs" data-testid={`extract-row-${i}`}>
      <span className="truncate text-zinc-200">{p.display_name || p.name}</span>
      <span className="truncate text-zinc-400">{p.manufacturer || "—"}</span>
      <span className="truncate text-zinc-400">{p.camera_model || "—"}</span>
      <span className="font-mono uppercase text-zinc-500">{p.format || "—"}</span>
      <span className={p.status === "new" ? "text-emerald-400" : "text-zinc-500"}>{p.status === "new" ? "Nuevo" : "Existente"}</span>
    </div>
  );

  return (
    <AppShell>
      <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Perfiles</p>
      <h1 className="font-display mt-1 text-2xl font-semibold">Extraer perfiles desde URL</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500">
        Introduce una URL (archivo de perfil o página con enlaces) y extrae automáticamente los perfiles de cámara
        (.xmp / .dcp / .lrtemplate) para tu catálogo. No modifica recetas ni Lightroom: solo construye el repositorio.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-800 bg-[#141418] p-5">
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-zinc-700 bg-[#101012] px-3">
            <Link2 className="h-4 w-4 text-zinc-500" />
            <input data-testid="extract-url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/perfil.xmp o página con perfiles"
              className="flex-1 bg-transparent py-2.5 text-sm text-zinc-100 outline-none" onKeyDown={(e) => e.key === "Enter" && analyze()} />
          </div>
          <button data-testid="extract-analyze-btn" onClick={analyze} disabled={loading || !url.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Analizar URL
          </button>
        </div>

        {result && (
          <div className="mt-5" data-testid="extract-result">
            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
              <span className="truncate">URL: <span className="text-zinc-300">{result.url}</span></span>
              <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> {result.found} encontrados</span>
              <span>{result.new} nuevos</span>
              <span>{result.existing} existentes</span>
            </div>
            {result.errors?.map((e, i) => (
              <p key={i} className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-400"><AlertTriangle className="h-3.5 w-3.5" /> {e}</p>
            ))}
            {result.found > 0 && (
              <div className="mt-3 overflow-hidden rounded-lg border border-zinc-800">
                <div className="grid grid-cols-[1.4fr_1fr_1fr_0.7fr_0.9fr] gap-2 border-b border-zinc-800 bg-[#1c1c22] px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  <span>Perfil</span><span>Fabricante</span><span>Cámara</span><span>Formato</span><span>Estado</span>
                </div>
                {result.profiles.map((p, i) => <Row key={`${p.download_url}-${i}`} p={p} i={i} />)}
              </div>
            )}
            {result.new > 0 && (
              <button data-testid="extract-save-btn" onClick={save}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300">
                <Save className="h-4 w-4" /> Guardar perfiles nuevos ({result.new})
              </button>
            )}
          </div>
        )}
      </div>

      <h2 className="font-display mt-8 text-lg font-semibold">Catálogo de perfiles ({saved.length})</h2>
      {saved.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">Aún no has guardado perfiles.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((p) => {
            const c = COMPAT[p.compatible] || COMPAT.unknown;
            return (
              <div key={p.id} data-testid={`saved-profile-${p.id}`} className="rounded-xl border border-zinc-800 bg-[#141418] p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium text-zinc-100">{p.display_name || p.name}</p>
                  <button data-testid={`delete-extracted-${p.id}`} onClick={() => remove(p.id)} className="text-zinc-600 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">{[p.manufacturer, p.camera_model].filter(Boolean).join(" · ") || "Sin cámara asociada"}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-md bg-zinc-800/60 px-2 py-0.5 font-mono text-[10px] uppercase text-zinc-400">{p.format || p.profile_type}</span>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${c.cls}`}>{c.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
