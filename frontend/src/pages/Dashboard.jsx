import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import { Plus, Folder, Trash2, ArrowRight, X, Aperture, Search, Pencil, Users, CalendarDays, Images } from "lucide-react";

const STATUS = {
  created: { label: "Nuevo", cls: "text-zinc-400 bg-zinc-800/60" },
  processing: { label: "En proceso", cls: "text-amber-300 bg-amber-400/10" },
  completed: { label: "Completado", cls: "text-emerald-300 bg-emerald-400/10" },
};

const fmtDate = (d) => {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
};

const EMPTY = { name: "", client_name: "", event_date: "" };

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const navigate = useNavigate();

  const load = () => api.get("/projects").then((r) => setProjects(r.data)).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial (solo al montar)
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (p, e) => {
    e.stopPropagation();
    setEditId(p.id);
    setForm({ name: p.name || "", client_name: p.client_name || "", event_date: p.event_date || "" });
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        const res = await api.put(`/projects/${editId}`, form);
        setProjects((prev) => prev.map((x) => (x.id === editId ? res.data : x)));
        toast.success("Proyecto actualizado");
        setShowForm(false);
      } else {
        const res = await api.post("/projects", form);
        toast.success("Proyecto creado");
        navigate(`/project/${res.data.id}`);
      }
    } catch {
      toast.error(editId ? "No se pudo actualizar" : "No se pudo crear el proyecto");
    } finally { setSaving(false); }
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    await api.delete(`/projects/${id}`);
    setProjects((p) => p.filter((x) => x.id !== id));
    toast.success("Proyecto eliminado");
  };

  const totals = useMemo(() => ({
    projects: projects.length,
    photos: projects.reduce((a, p) => a + (p.total_images || 0), 0),
    processed: projects.reduce((a, p) => a + (p.processed_images || 0), 0),
    completed: projects.filter((p) => p.status === "completed").length,
  }), [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = projects.filter((p) =>
      !q || [p.name, p.client_name].filter(Boolean).some((s) => s.toLowerCase().includes(q)));
    list = [...list];
    if (sort === "name") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    else if (sort === "event") list.sort((a, b) => (b.event_date || "").localeCompare(a.event_date || ""));
    else list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return list;
  }, [projects, query, sort]);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Tus reportajes</h1>
          <p className="mt-1 text-sm text-zinc-500">Crea un proyecto de boda y procesa sus RAW con IA.</p>
        </div>
        <button data-testid="new-project-btn" onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02]">
          <Plus className="h-4 w-4" /> Nuevo proyecto
        </button>
      </div>

      {!loading && projects.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-4" data-testid="dashboard-stats">
          {[
            { icon: Folder, label: "Reportajes", value: totals.projects },
            { icon: Images, label: "Fotografías", value: totals.photos },
            { icon: Aperture, label: "Procesadas", value: totals.processed, accent: "text-emerald-400" },
            { icon: CalendarDays, label: "Completados", value: totals.completed, accent: "text-emerald-400" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-[#141418] p-4">
              <s.icon className="h-5 w-5 text-zinc-500" />
              <div>
                <p className={`font-display text-xl font-bold ${s.accent || "text-zinc-100"}`}>{s.value}</p>
                <p className="text-xs text-zinc-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-1 min-w-[200px] items-center gap-2 rounded-lg border border-zinc-700 bg-[#101012] px-3">
            <Search className="h-4 w-4 text-zinc-500" />
            <input data-testid="project-search-input" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o cliente…"
              className="flex-1 bg-transparent py-2 text-sm text-zinc-100 outline-none" />
          </div>
          <select data-testid="project-sort-select" value={sort} onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-emerald-400/60">
            <option value="recent">Más recientes</option>
            <option value="event">Fecha del evento</option>
            <option value="name">Nombre (A-Z)</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="mt-16 flex justify-center"><Aperture className="h-8 w-8 animate-spin text-emerald-400" /></div>
      ) : projects.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-zinc-800 bg-[#141418] p-16 text-center" data-testid="empty-state">
          <Folder className="mx-auto h-10 w-10 text-zinc-700" />
          <p className="mt-4 text-sm font-medium text-zinc-300">Aún no tienes proyectos</p>
          <p className="mt-1 text-xs text-zinc-600">Crea tu primer reportaje para empezar.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-800 bg-[#141418] p-12 text-center" data-testid="no-results">
          <Search className="mx-auto h-8 w-8 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-400">Sin resultados para “{query}”.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => {
            const st = STATUS[p.status] || STATUS.created;
            const pct = p.total_images ? Math.round((p.processed_images / p.total_images) * 100) : (p.status === "completed" ? 100 : 0);
            return (
              <div key={p.id} data-testid={`project-card-${p.id}`} onClick={() => navigate(`/project/${p.id}`)}
                className="group cursor-pointer rounded-xl border border-zinc-800 bg-[#141418] p-5 transition-all duration-200 hover:border-zinc-600 hover:shadow-lg">
                <div className="flex items-start justify-between">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                  <div className="flex items-center gap-1">
                    <button data-testid={`edit-project-${p.id}`} onClick={(e) => openEdit(p, e)}
                      className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-200">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button data-testid={`delete-project-${p.id}`} onClick={(e) => remove(p.id, e)}
                      className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-rose-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <h3 className="font-display mt-3 text-lg font-semibold text-zinc-100">{p.name}</h3>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                  {p.client_name && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {p.client_name}</span>}
                  {fmtDate(p.event_date) && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {fmtDate(p.event_date)}</span>}
                </div>
                <p className="mt-2 text-sm text-zinc-500">{p.total_images} fotografías{pct ? ` · ${pct}%` : ""}</p>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
                  Abrir proyecto <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" data-testid="create-modal">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#1c1c22] p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{editId ? "Editar proyecto" : "Nuevo proyecto"}</h2>
              <button data-testid="close-modal-btn" onClick={() => setShowForm(false)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-400">Nombre del reportaje *</label>
                <input data-testid="project-name-input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Boda Ana & Luis" className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400">Clientes</label>
                <input data-testid="project-client-input" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  placeholder="Ana & Luis" className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400">Fecha del evento</label>
                <input data-testid="project-date-input" type="date" value={form.event_date || ""} onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60" />
              </div>
              <button data-testid="submit-project-btn" type="submit" disabled={saving || !form.name.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.01] disabled:opacity-40">
                {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear y abrir estudio"} <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
