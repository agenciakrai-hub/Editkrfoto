import { useEffect, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import { Cpu, Plus, Check, RefreshCw, Trash2, Sparkles, Shield, Loader2 } from "lucide-react";

const TASKS = [
  { key: "seleccion", label: "Selección IA" },
  { key: "ajustes", label: "Ajustes IA" },
  { key: "album", label: "Álbum IA" },
];

export default function AIProviders() {
  const [builtin, setBuiltin] = useState(null);
  const [providers, setProviders] = useState([]);
  const [config, setConfig] = useState({ seleccion: "emergent", ajustes: "emergent", album: "emergent" });
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [form, setForm] = useState({ endpoint: "", api_key: "", name: "" });
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try {
      const [p, c] = await Promise.all([api.get("/ai/providers"), api.get("/ai/config")]);
      setBuiltin(p.data.builtin);
      setProviders(p.data.providers);
      setConfig(c.data);
    } catch (err) {
      if (err?.response?.status === 403) setDenied(true);
      else toast.error("No se pudieron cargar los proveedores");
    } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const setActive = async (task, value) => {
    const next = { ...config, [task]: value };
    setConfig(next);
    try { await api.put("/ai/config", { [task]: value }); toast.success("Proveedor activo actualizado"); }
    catch { toast.error("No se pudo guardar"); load(); }
  };

  const addProvider = async (e) => {
    e.preventDefault();
    if (!form.endpoint.trim() || !form.api_key.trim()) return;
    setAdding(true);
    try {
      const r = await api.post("/ai/providers", form);
      toast.success(`Proveedor añadido: ${r.data.total_models} modelos`);
      setForm({ endpoint: "", api_key: "", name: "" });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No se pudo añadir el proveedor");
    } finally { setAdding(false); }
  };

  const toggleModel = async (prov, task, model) => {
    const field = `${task}_models`;
    const cur = new Set(prov[field] || []);
    cur.has(model) ? cur.delete(model) : cur.add(model);
    const patch = { seleccion_models: prov.seleccion_models, ajustes_models: prov.ajustes_models, album_models: prov.album_models, [field]: [...cur] };
    setProviders((prev) => prev.map((x) => (x.id === prov.id ? { ...x, [field]: [...cur] } : x)));
    try { await api.put(`/ai/providers/${prov.id}/models`, patch); } catch { toast.error("No se pudo guardar"); load(); }
  };

  const retest = async (id) => { const r = await api.post(`/ai/providers/${id}/retest`); toast[r.data.ok ? "success" : "error"](r.data.ok ? "Conexión OK" : `Falló: ${r.data.reason}`); load(); };
  const del = async (id) => { await api.delete(`/ai/providers/${id}`); toast.success("Proveedor eliminado"); load(); };

  if (loading) return <AppShell><div className="mt-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div></AppShell>;
  if (denied) return <AppShell><div className="mt-16 text-center" data-testid="ai-denied"><Shield className="mx-auto h-10 w-10 text-zinc-700" /><p className="mt-3 text-sm text-zinc-400">Solo el administrador puede gestionar los proveedores de IA.</p></div></AppShell>;

  const ActiveRadios = ({ value }) => (
    <div className="mt-3 flex flex-wrap gap-2">
      {TASKS.map((t) => {
        const on = config[t.key] === value;
        return (
          <button key={t.key} data-testid={`set-active-${value}-${t.key}`} onClick={() => setActive(t.key, value)}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
            {on && <Check className="h-3 w-3" />} {t.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/40"><Cpu className="h-5 w-5 text-emerald-400" /></div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Proveedores de IA</h1>
          <p className="text-sm text-zinc-500">Elige qué IA usa cada herramienta. Emergent es gratis; puedes añadir proveedores de pago.</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-5" data-testid="builtin-provider">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            <h3 className="font-display text-lg font-semibold">{builtin?.name}</h3>
          </div>
          <span className="rounded-md bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Incluida</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">{builtin?.note}</p>
        <p className="mt-2 text-xs text-zinc-600">Modelos: {(builtin?.available_models || []).join(" · ")}</p>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-zinc-500">Usar para:</p>
        <ActiveRadios value="emergent" />
      </div>

      <form onSubmit={addProvider} className="mt-6 rounded-xl border border-zinc-800 bg-[#141418] p-5" data-testid="add-provider-form">
        <h3 className="font-display text-base font-semibold">Añadir proveedor de pago</h3>
        <p className="mt-1 text-xs text-zinc-500">Compatible con OpenAI (OpenRouter, Gemini, Qwen, NVIDIA…). Endpoint + API key.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <input data-testid="provider-endpoint-input" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
            placeholder="https://openrouter.ai/api/v1" className="rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60" />
          <input data-testid="provider-key-input" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            placeholder="API key" type="password" className="rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60" />
          <button data-testid="add-provider-btn" type="submit" disabled={adding}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Añadir
          </button>
        </div>
      </form>

      {providers.map((p) => (
        <div key={p.id} data-testid={`provider-${p.id}`} className="mt-4 rounded-xl border border-zinc-800 bg-[#141418] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold">{p.name}</h3>
              <p className="text-xs text-zinc-600">{p.endpoint} · {p.masked_key} · {p.available_models.length} modelos {p.last_ok ? "· ✓" : `· ✗ ${p.last_reason}`}</p>
            </div>
            <div className="flex gap-1">
              <button data-testid={`retest-${p.id}`} onClick={() => retest(p.id)} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><RefreshCw className="h-4 w-4" /></button>
              <button data-testid={`delete-provider-${p.id}`} onClick={() => del(p.id)} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Usar para:</p>
          <ActiveRadios value={`custom:${p.id}`} />
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-zinc-500">Asignar modelos por herramienta ({p.available_models.length})</summary>
            <div className="mt-2 space-y-2">
              {TASKS.map((t) => (
                <div key={t.key} className="text-xs">
                  <span className="text-zinc-500">{t.label}:</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {p.available_models.slice(0, 40).map((m) => {
                      const on = (p[`${t.key}_models`] || []).includes(m);
                      return (
                        <button key={m} onClick={() => toggleModel(p, t.key, m)}
                          className={`rounded-md border px-2 py-0.5 text-[10px] ${on ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>{m}</button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      ))}
    </AppShell>
  );
}
