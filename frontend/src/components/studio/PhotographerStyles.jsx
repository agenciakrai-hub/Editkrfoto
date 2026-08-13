import { useEffect, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { Globe, Sparkles, Loader2, Trash2, Check, AlertTriangle, Palette, Scissors, Download, ArrowLeftRight } from "lucide-react";
import { buildStyleXmp } from "@/lib/xmp/buildXmp";
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

        {compareMode && readyProfiles.length >= 2 && (() => {
          const a = readyProfiles.find((p) => p.id === cmp[0]) || readyProfiles[0];
          const b = readyProfiles.find((p) => p.id === cmp[1]) || readyProfiles[1];
          const rows = [
            ["Balance de blancos", a.color_profile?.white_balance_tendency, b.color_profile?.white_balance_tendency],
            ["Contraste", a.color_profile?.contrast, b.color_profile?.contrast],
            ["Saturación", a.color_profile?.saturation, b.color_profile?.saturation],
            ["Tono de piel", a.color_profile?.skin_tone, b.color_profile?.skin_tone],
            ["Rango tonal", a.color_profile?.tonal_range, b.color_profile?.tonal_range],
            ["Recorte", a.edit_profile?.crop_style, b.edit_profile?.crop_style],
            ["Luz / sombra", a.edit_profile?.light_shadow_treatment, b.edit_profile?.light_shadow_treatment],
            ["Nitidez", a.edit_profile?.sharpening_look, b.edit_profile?.sharpening_look],
            ["Consistencia", a.edit_profile?.consistency, b.edit_profile?.consistency],
            ["Confianza", a.confidence != null ? `${Math.round(a.confidence)}%` : "-", b.confidence != null ? `${Math.round(b.confidence)}%` : "-"],
          ];
          const Sel = ({ i }) => (
            <select data-testid={`compare-select-${i}`} value={cmp[i]} onChange={(e) => setCmp((c) => (i === 0 ? [e.target.value, c[1]] : [c[0], e.target.value]))}
              className="w-full rounded-md border border-zinc-700 bg-[#101012] px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-400/60">
              {readyProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          );
          return (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-[#101012] p-4" data-testid="compare-panel">
              <div className="grid grid-cols-2 gap-3">
                {[a, b].map((p, i) => (
                  <div key={i}>
                    <Sel i={i} />
                    <img src={p.representative_image} alt={p.name} className="mt-2 aspect-[3/2] w-full rounded-lg object-cover" />
                  </div>
                ))}
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-zinc-800">
                {rows.map(([label, va, vb], idx) => (
                  <div key={label} className={`grid grid-cols-[1fr_1.4fr_1.4fr] gap-2 px-3 py-2 text-[11px] ${idx % 2 ? "bg-[#141418]" : "bg-[#1c1c22]"}`}>
                    <span className="text-zinc-500">{label}</span>
                    <span className="text-zinc-300">{va || "—"}</span>
                    <span className="text-zinc-300">{vb || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {profiles.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => {
              const active = activeName === p.name;
              const clickable = p.status === "ready";
              return (
                <div key={p.id} data-testid={`style-card-${p.id}`}
                  onClick={() => clickable && onUseStyle?.(p)}
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
                      {p.gallery_images?.length > 1 && (
                        <div className="mt-3 flex gap-1.5 overflow-x-auto" data-testid={`style-gallery-${p.id}`}>
                          {p.gallery_images.slice(0, 8).map((src, idx) => (
                            <img key={idx} src={src} alt={`ref ${idx + 1}`} className="h-12 w-12 shrink-0 rounded-md object-cover ring-1 ring-zinc-800" />
                          ))}
                        </div>
                      )}
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
                      <div className="mt-3 flex items-center justify-between gap-2">
                        {active
                          ? <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400"><Check className="h-3.5 w-3.5" /> Estilo de referencia seleccionado</p>
                          : <p className="text-[11px] text-zinc-600">Toca para usar como estilo de referencia</p>}
                        <button data-testid={`export-style-${p.id}`} onClick={(e) => exportXmp(p, e)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800">
                          <Download className="h-3 w-3" /> Exportar .xmp
                        </button>
                      </div>
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
