import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import { Plus, Folder, Trash2, ArrowRight, Calendar, ImageIcon, X, Aperture } from "lucide-react";

const STATUS = {
  created: { label: "Nuevo", cls: "text-zinc-400 bg-zinc-800/60" },
  processing: { label: "En proceso", cls: "text-amber-300 bg-amber-400/10" },
  completed: { label: "Completado", cls: "text-emerald-300 bg-emerald-400/10" },
};

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", client_name: "", event_date: "" });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = () => api.get("/projects").then((r) => setProjects(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const res = await api.post("/projects", form);
      toast.success("Proyecto creado");
      navigate(`/studio?project=${res.data.id}`);
    } catch {
      toast.error("No se pudo crear el proyecto");
      setCreating(false);
    }
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    await api.delete(`/projects/${id}`);
    setProjects((p) => p.filter((x) => x.id !== id));
    toast.success("Proyecto eliminado");
  };

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Tus reportajes</h1>
          <p className="mt-1 text-sm text-zinc-500">Crea un proyecto de boda y procesa sus RAW con IA.</p>
        </div>
        <button data-testid="new-project-btn" onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02]">
          <Plus className="h-4 w-4" /> Nuevo proyecto
        </button>
      </div>

      {loading ? (
        <div className="mt-16 flex justify-center"><Aperture className="h-8 w-8 animate-spin text-emerald-400" /></div>
      ) : projects.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-zinc-800 bg-[#141418] p-16 text-center" data-testid="empty-state">
          <Folder className="mx-auto h-10 w-10 text-zinc-700" />
          <p className="mt-4 text-sm font-medium text-zinc-300">Aún no tienes proyectos</p>
          <p className="mt-1 text-xs text-zinc-600">Crea tu primer reportaje para empezar.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const st = STATUS[p.status] || STATUS.created;
            return (
              <div key={p.id} data-testid={`project-card-${p.id}`} onClick={() => navigate(`/studio?project=${p.id}`)}
                className="group cursor-pointer rounded-xl border border-zinc-800 bg-[#141418] p-5 transition-all duration-200 hover:border-zinc-600 hover:shadow-lg">
                <div className="flex items-start justify-between">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                  <button data-testid={`delete-project-${p.id}`} onClick={(e) => remove(p.id, e)}
                    className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-rose-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <h3 className="font-display mt-3 text-lg font-semibold text-zinc-100">{p.name}</h3>
                {p.client_name && <p className="text-sm text-zinc-500">{p.client_name}</p>}
                <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                  {p.event_date && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{p.event_date}</span>}
                  <span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{p.processed_images}/{p.total_images}</span>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
                  Abrir estudio <ArrowRight className="h-4 w-4" />
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
              <h2 className="font-display text-lg font-semibold">Nuevo proyecto</h2>
              <button data-testid="close-modal-btn" onClick={() => setShowForm(false)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={create} className="mt-5 space-y-4">
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
                <input data-testid="project-date-input" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60" />
              </div>
              <button data-testid="submit-project-btn" type="submit" disabled={creating || !form.name.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.01] disabled:opacity-40">
                {creating ? "Creando…" : "Crear y abrir estudio"} <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
