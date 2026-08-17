import { useEffect, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { Globe, Sparkles, Loader2, ArrowLeftRight } from "lucide-react";
import { buildStyleXmp } from "@/lib/xmp/buildXmp";
import StyleComparePanel from "@/components/studio/StyleComparePanel";
import StyleCard from "@/components/studio/StyleCard";
import api from "@/lib/api";

export default function PhotographerStyles({ onUseStyle, activeName }) {
  const [profiles, setProfiles] = useState([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [cmp, setCmp] = useState(["", ""]);
  const pollers = useRef({});

  const readyProfiles = profiles.filter((p) => p.status === "ready");

  const exportXmp = (p, e) => {
    e.stopPropagation();
    const xmp = buildStyleXmp(p.name, p.suggested_parameters || {});
    const safe = (p.name || "estilo").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "estilo";
    saveAs(new Blob([xmp], { type: "application/rdf+xml" }), `${safe}.xmp`);
    toast.success("Perfil exportado", { description: `${safe}.xmp listo para Lightroom` });
  };

  const refresh = () => api.get("/photographer-styles").then((r) => {
    setProfiles(r.data);
    r.data.forEach((p) => { if (p.status === "analyzing") startPoll(p.id); });
  }).catch(() => {});

  useEffect(() => { refresh(); return () => Object.values(pollers.current).forEach(clearInterval); }, []); // eslint-disable-line

  const startPoll = (id) => {
    if (pollers.current[id]) return;
    let tries = 0;
    pollers.current[id] = setInterval(async () => {
      tries += 1;
      try {
        const r = await api.get(`/photographer-styles/${id}`);
        setProfiles((prev) => prev.map((x) => (x.id === id ? r.data : x)));
        if (r.data.status !== "analyzing" || tries > 40) { clearInterval(pollers.current[id]); delete pollers.current[id]; }
      } catch { clearInterval(pollers.current[id]); delete pollers.current[id]; }
    }, 3000);
  };

  const analyze = async () => {
    if (!name.trim() || !url.trim()) return;
    setCreating(true);
    try {
      const res = await api.post("/photographer-styles", { name: name.trim(), gallery_url: url.trim() });
      setProfiles((prev) => [res.data, ...prev]);
      startPoll(res.data.id);
      setName(""); setUrl("");
      toast.success("Analizando galería…", { description: "Puede tardar unos segundos" });
    } catch { toast.error("No se pudo iniciar el análisis"); }
    finally { setCreating(false); }
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    await api.delete(`/photographer-styles/${id}`);
    setProfiles((prev) => prev.filter((x) => x.id !== id));
    toast.success("Perfil eliminado");
  };

  return (
    <section className="animate-fade-up overflow-hidden rounded-xl border border-zinc-800 bg-[#141418]" data-testid="photographer-styles">
      <div className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-semibold">Estilos desde galería</h2>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
          Pega la URL de la galería pública de otro fotógrafo y la IA detectará su estilo de <span className="text-zinc-300">color</span> y <span className="text-zinc-300">edición</span> por separado, para inspirar tu revelado.
        </p>
      </div>

      <div className="p-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
          <input data-testid="style-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre, ej. Kiko Reyes - Editorial"
            className="rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60" />
          <input data-testid="style-url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://galeria-del-fotografo.com/boda"
            className="rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60" />
          <button data-testid="analyze-style-btn" onClick={analyze} disabled={creating || !name.trim() || !url.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Analizar
          </button>
        </div>

        {readyProfiles.length >= 2 && (
          <div className="mt-4">
            <button data-testid="compare-toggle-btn" onClick={() => { setCompareMode((v) => !v); setCmp([readyProfiles[0].id, readyProfiles[1].id]); }}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
              <ArrowLeftRight className="h-3.5 w-3.5" /> {compareMode ? "Cerrar comparación" : "Comparar estilos"}
            </button>
          </div>
        )}

        {compareMode && readyProfiles.length >= 2 && (
          <StyleComparePanel readyProfiles={readyProfiles} cmp={cmp} setCmp={setCmp} />
        )}

        {profiles.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => (
              <StyleCard key={p.id} p={p} active={activeName === p.name}
                onUse={onUseStyle} onDelete={remove} onExport={exportXmp} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
