import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Globe, Sparkles, Loader2, Trash2, Check, AlertTriangle, Palette, Scissors } from "lucide-react";
import api from "@/lib/api";

function StatusPill({ status }) {
  if (status === "ready") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300"><Check className="h-3 w-3" /> Listo</span>;
  if (status === "failed") return <span className="inline-flex items-center gap-1 rounded-full bg-rose-400/10 px-2 py-0.5 text-[10px] font-medium text-rose-300"><AlertTriangle className="h-3 w-3" /> Error</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300"><Loader2 className="h-3 w-3 animate-spin" /> Analizando</span>;
}

export default function PhotographerStyles({ onUseStyle, activeName }) {
  const [profiles, setProfiles] = useState([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const pollers = useRef({});

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

        {profiles.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => {
              const active = activeName === p.name;
              const clickable = p.status === "ready";
              return (
                <div key={p.id} data-testid={`style-card-${p.id}`}
                  onClick={() => clickable && onUseStyle?.(p.name)}
                  className={`rounded-xl border p-4 transition-all duration-200 ${clickable ? "cursor-pointer" : ""}
                    ${active ? "border-emerald-400/70 ring-2 ring-emerald-400/30 bg-emerald-400/[0.05]" : "border-zinc-800 bg-[#1c1c22] hover:border-zinc-600"}`}>
                  <div className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                      {p.representative_image
                        ? <img src={p.representative_image} alt={p.name} className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full items-center justify-center text-zinc-700"><Globe className="h-5 w-5" /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
                        <button data-testid={`delete-style-${p.id}`} onClick={(e) => remove(p.id, e)} className="text-zinc-600 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <StatusPill status={p.status} />
                        {p.status === "ready" && p.confidence != null && (
                          <span className="font-mono text-[10px] text-zinc-500">{Math.round(p.confidence)}% confianza · {p.images_analyzed} img</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {p.status === "ready" && (
                    <>
                      {p.description && <p className="mt-3 text-xs leading-5 text-zinc-400">{p.description}</p>}
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-zinc-800 bg-[#101012] p-2.5">
                          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500"><Palette className="h-3 w-3 text-emerald-400" /> Color</p>
                          <p className="mt-1 text-[11px] leading-4 text-zinc-400">{p.color_profile?.summary || `${p.color_profile?.contrast || "-"} · ${p.color_profile?.saturation || "-"} · piel ${p.color_profile?.skin_tone || "-"}`}</p>
                        </div>
                        <div className="rounded-lg border border-zinc-800 bg-[#101012] p-2.5">
                          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500"><Scissors className="h-3 w-3 text-emerald-400" /> Edición</p>
                          <p className="mt-1 text-[11px] leading-4 text-zinc-400">{p.edit_profile?.summary || `${p.edit_profile?.crop_style || "-"} · consistencia ${p.edit_profile?.consistency || "-"}`}</p>
                        </div>
                      </div>
                      {active
                        ? <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-400"><Check className="h-3.5 w-3.5" /> Estilo de referencia seleccionado</p>
                        : <p className="mt-3 text-[11px] text-zinc-600">Toca para usar como estilo de referencia</p>}
                    </>
                  )}
                  {p.status === "failed" && <p className="mt-3 text-xs text-rose-400">{p.error_message || "No se pudo analizar la galería."}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
