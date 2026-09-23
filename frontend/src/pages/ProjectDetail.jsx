import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import { ArrowLeft, Plus, FolderOpen, Trash2, Pencil, X, ArrowRight, Aperture, Images, CheckCircle2, Loader2 } from "lucide-react";

const STATUS = {
  created: { label: "Sin empezar", cls: "text-zinc-400 bg-zinc-800/60" },
  processing: { label: "En proceso", cls: "text-amber-300 bg-amber-400/10" },
  completed: { label: "Completada", cls: "text-emerald-300 bg-emerald-400/10" },
};

// Etapas típicas de una boda para crear carpetas rápido.
const QUICK = ["Preparativos", "Ceremonia", "Sesión de pareja", "Banquete", "Fiesta"];

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [p, f] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/folders`),
      ]);
      setProject(p.data);
      setFolders(f.data);
    } catch {
      toast.error("No se pudo cargar el proyecto");
      navigate("/dashboard");
    } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [projectId]);

  const openCreate = () => { setEditId(null); setName(""); setShowForm(true); };
  const openEdit = (f, e) => { e.stopPropagation(); setEditId(f.id); setName(f.name); setShowForm(true); };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        const res = await api.put(`/folders/${editId}`, { name: name.trim() });
        setFolders((prev) => prev.map((x) => (x.id === editId ? res.data : x)));
        toast.success("Carpeta actualizada");
      } else {
        const res = await api.post(`/projects/${projectId}/folders`, { name: name.trim() });
        setFolders((prev) => [...prev, res.data]);
        toast.success("Carpeta creada");
      }
      setShowForm(false);
    } catch (err) {
      toast.error(err?.response?.status === 402 ? "Tu prueba ha terminado" : "No se pudo guardar la carpeta");
    } finally { setSaving(false); }
  };

  const quickAdd = async (n) => {
    try {
      const res = await api.post(`/projects/${projectId}/folders`, { name: n });
      setFolders((prev) => [...prev, res.data]);
    } catch (err) {
      toast.error(err?.response?.status === 402 ? "Tu prueba ha terminado" : "No se pudo crear la carpeta");
    }
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    await api.delete(`/folders/${id}`);
    setFolders((prev) => prev.filter((x) => x.id !== id));
    toast.success("Carpeta eliminada");
  };

  const open = (f) => navigate(`/studio?project=${projectId}&folder=${f.id}`);

  const existing = useMemo(() => new Set(folders.map((f) => f.name.toLowerCase())), [folders]);
  const quickLeft = QUICK.filter((q) => !existing.has(q.toLowerCase()));

  if (loading) {
    return <AppShell><div className="mt-16 flex justify-center"><Aperture className="h-8 w-8 animate-spin text-emerald-400" /></div></AppShell>;
  }

  return (
    <AppShell>
      <button data-testid="back-to-dashboard" onClick={() => navigate("/dashboard")}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
        <ArrowLeft className="h-4 w-4" /> Proyectos
      </button>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Proyecto</p>
          <h1 className="font-display mt-1 text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Organiza el reportaje en carpetas (p. ej. Ceremonia, Banquete). Cada carpeta tiene su propio culling, edición y XMP.
          </p>
        </div>
        <button data-testid="new-folder-btn" onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02]">
          <Plus className="h-4 w-4" /> Nueva carpeta
        </button>
      </div>

      {quickLeft.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2" data-testid="quick-add-row">
          <span className="text-xs text-zinc-500">Añadir rápido:</span>
          {quickLeft.map((q) => (
            <button key={q} data-testid={`quick-add-${q}`} onClick={() => quickAdd(q)}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-[#1c1c22] px-3 py-1 text-xs text-zinc-300 hover:border-emerald-400/50 hover:text-emerald-300">
              <Plus className="h-3 w-3" /> {q}
            </button>
          ))}
        </div>
      )}

      {folders.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-800 bg-[#141418] p-16 text-center" data-testid="folders-empty">
          <FolderOpen className="mx-auto h-10 w-10 text-zinc-700" />
          <p className="mt-4 text-sm font-medium text-zinc-300">Este proyecto aún no tiene carpetas</p>
          <p className="mt-1 text-xs text-zinc-600">Crea una carpeta o usa los accesos rápidos de arriba para empezar.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f) => {
            const st = STATUS[f.status] || STATUS.created;
            const pct = f.total_images ? Math.round((f.processed_images / f.total_images) * 100) : (f.status === "completed" ? 100 : 0);
            return (
              <div key={f.id} data-testid={`folder-card-${f.id}`} onClick={() => open(f)}
                className="group cursor-pointer rounded-xl border border-zinc-800 bg-[#141418] p-5 transition-all duration-200 hover:border-zinc-600 hover:shadow-lg">
                <div className="flex items-start justify-between">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                  <div className="flex items-center gap-1">
                    <button data-testid={`edit-folder-${f.id}`} onClick={(e) => openEdit(f, e)} className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-200"><Pencil className="h-4 w-4" /></button>
                    <button data-testid={`delete-folder-${f.id}`} onClick={(e) => remove(f.id, e)} className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-emerald-400" />
                  <h3 className="font-display text-lg font-semibold text-zinc-100">{f.name}</h3>
                </div>
                <p className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
                  {f.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : f.status === "processing" ? <Loader2 className="h-4 w-4 text-amber-400" /> : <Images className="h-4 w-4" />}
                  {f.total_images ? `${f.total_images} fotografías${pct ? ` · ${pct}%` : ""}` : "Vacía"}
                </p>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
                  Abrir en el estudio <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" data-testid="folder-modal">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#1c1c22] p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{editId ? "Editar carpeta" : "Nueva carpeta"}</h2>
              <button data-testid="close-folder-modal" onClick={() => setShowForm(false)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-400">Nombre de la carpeta *</label>
                <input data-testid="folder-name-input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Ceremonia" className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60" />
              </div>
              <button data-testid="submit-folder-btn" type="submit" disabled={saving || !name.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.01] disabled:opacity-40">
                {saving ? "Guardando…" : editId ? "Guardar" : "Crear carpeta"} <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
