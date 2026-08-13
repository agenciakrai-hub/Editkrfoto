import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import { Cloud, CheckCircle2, Download, ArrowLeft, Aperture } from "lucide-react";

export default function ProcessingPage() {
  const [params] = useSearchParams();
  const projectId = params.get("project");
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [job, setJob] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const loadJob = useCallback(async (jobId) => {
    try {
      const r = await api.get(`/cloud-jobs/${jobId}`);
      setJob(r.data);
      return r.data;
    } catch { return null; }
  }, []);

  useEffect(() => {
    if (!projectId) { navigate("/dashboard"); return; }
    let interval;
    (async () => {
      try {
        const pr = await api.get(`/projects/${projectId}`);
        setProject(pr.data);
        const jobId = pr.data.rawai_state?.cloudJobId;
        if (!jobId) { navigate(`/studio?project=${projectId}`); return; }
        const first = await loadJob(jobId);
        if (first && first.status !== "completed") {
          interval = setInterval(async () => {
            const j = await loadJob(jobId);
            if (j && j.status === "completed") clearInterval(interval);
          }, 1500);
        }
      } catch { navigate("/dashboard"); }
    })();
    return () => interval && clearInterval(interval);
  }, [projectId, navigate, loadJob]);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/cloud-jobs/${job.id}/download`, { responseType: "blob" });
      const disp = res.headers["content-disposition"] || "";
      const m = disp.match(/filename="?([^"]+)"?/);
      saveAs(res.data, m ? m[1] : "RAWAI_XMP.zip");
      toast.success("Paquete XMP descargado");
    } catch { toast.error("No se pudo descargar el ZIP"); }
    finally { setDownloading(false); }
  };

  if (!project || !job) {
    return <AppShell><div className="flex justify-center py-20"><Aperture className="h-8 w-8 animate-spin text-emerald-400" /></div></AppShell>;
  }

  const pct = job.total ? Math.round((job.processed / job.total) * 100) : 0;
  const done = job.status === "completed";

  return (
    <AppShell>
      <button data-testid="back-dashboard-btn" onClick={() => navigate("/dashboard")} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
        <ArrowLeft className="h-4 w-4" /> Volver
      </button>
      <p className="font-mono mt-4 text-xs uppercase tracking-widest text-zinc-500">Procesamiento en la nube</p>
      <h1 className="font-display mt-1 text-2xl font-semibold">{project.name}</h1>

      <div className="mt-8 max-w-2xl rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="cloud-job-panel">
        <div className="flex items-center gap-3">
          {done ? <CheckCircle2 className="h-6 w-6 text-emerald-400" /> : <Cloud className="h-6 w-6 animate-pulse text-emerald-400" />}
          <h2 className="font-display text-lg font-semibold">{done ? "Trabajo completado" : "Procesando en el servidor…"}</h2>
        </div>
        <p className="mt-1.5 text-sm text-zinc-500">
          {done ? "Tus sidecars XMP están listos para descargar." : "Puedes cerrar esta pestaña; el trabajo continúa en la nube."}
        </p>

        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 font-mono text-xs text-zinc-500" data-testid="cloud-progress">{job.processed} / {job.total} fotos · {pct}%</p>

        {done && (
          <button data-testid="cloud-download-btn" onClick={download} disabled={downloading}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-50">
            <Download className="h-4 w-4" /> {downloading ? "Generando ZIP…" : "Descargar XMP (ZIP)"}
          </button>
        )}
      </div>
    </AppShell>
  );
}
