import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import Stepper from "@/components/studio/Stepper";
import FolderSelectStep from "@/components/studio/FolderSelectStep";
import SelectionStep from "@/components/studio/SelectionStep";
import ReviewStep from "@/components/studio/ReviewStep";
import ProfilePresetStep from "@/components/studio/ProfilePresetStep";
import ProcessingModeChoice from "@/components/studio/ProcessingModeChoice";
import ProcessingStep from "@/components/studio/ProcessingStep";
import ReportStep from "@/components/studio/ReportStep";
import { computeAiBasics } from "@/lib/rawaistudio/basicEngine";
import { analyzeFile, mapLimit } from "@/lib/imageAnalysis";
import { analyzeFolder } from "@/lib/rawSelection";
import api from "@/lib/api";

const STEP_INDEX = { folder: 0, selection: 1, review: 2, style: 3, mode: 4, processing: 4, report: 4 };

export default function Studio() {
  const [params] = useSearchParams();
  const projectId = params.get("project");
  const folderId = params.get("folder");
  const stateUrl = folderId ? `/folders/${folderId}` : `/projects/${projectId}`;
  const navigate = useNavigate();

  const [project, setProject] = useState(null);   // entidad de trabajo (carpeta si hay folder, si no el proyecto)
  const [projectName, setProjectName] = useState("");
  const [step, setStep] = useState("folder");
  const [files, setFiles] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [people, setPeople] = useState([]);
  const [sendPhotos, setSendPhotos] = useState([]);
  const [profileChoice, setProfileChoice] = useState({ profile: "Adobe Color" });
  const [presetInfo, setPresetInfo] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!projectId) { navigate("/dashboard"); return; }
    const loadEntity = async () => {
      try {
        if (folderId) {
          const [f, p] = await Promise.all([api.get(`/folders/${folderId}`), api.get(`/projects/${projectId}`)]);
          setProjectName(p.data.name);
          if (f.data.rawai_state?.cloudJobId) { navigate(`/processing?project=${projectId}&folder=${folderId}`); return; }
          setProject(f.data);
        } else {
          const r = await api.get(`/projects/${projectId}`);
          setProjectName(r.data.name);
          if (r.data.rawai_state?.cloudJobId) { navigate(`/processing?project=${projectId}`); return; }
          setProject(r.data);
        }
      } catch { navigate("/dashboard"); }
    };
    loadEntity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, folderId, navigate]);

  const saveQueue = useRef(Promise.resolve());
  const persist = (patch) => {
    const pending = saveQueue.current.catch(() => {}).then(() => api.patch(`${stateUrl}/state`, patch));
    saveQueue.current = pending;
    return pending;
  };
  // finalSelection = fuente de verdad. Guarda estado + origen (ai/manual) + rating/label por foto.
  const persistFinal = (all) => persist({
    finalSelection: all.map((p) => ({
      filename: p.name,
      relativePath: p.file?.webkitRelativePath || p.relativePath || p.name,
      size: p.size || p.file?.size || 0,
      lastModified: p.file?.lastModified || p.lastModified || 0,
      burstId: p.burstId,
      selectionComparison: p.selectionComparison || null,
      selected: !!p.selectedForEdit,
      source: p.source || "ai",
      rating: p.selectedForEdit ? 5 : 0,
      label: p.selectedForEdit ? "Green" : "",
    })),
    editQueueFilenames: all.filter((p) => p.selectedForEdit).map((p) => p.name),
    reviewCompleted: true,
  });

  // Garantiza que la cola de edición tenga fotometría/color para que la IA calcule los básicos.
  // Necesario al REANUDAR una selección guardada (analyzeFolder no analiza píxeles).
  const ensureMetrics = async (queue) => {
    const missing = queue.filter((p) => !p.photometrics && p.file);
    if (!missing.length) return;
    let done = 0;
    const t = toast.loading(`Analizando ${missing.length} fotos para los ajustes IA…`, { description: "0%" });
    // timeout por archivo: un RAW corrupto no debe colgar toda la transición.
    const withTimeout = (promise, ms) => Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
    await mapLimit(missing, 5, async (p) => {
      try {
        const m = await withTimeout(analyzeFile(p.file), 20000);
        if (m) { p.photometrics = m.photometrics; p.color = m.color; }
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.warn("No se pudo analizar para básicos IA:", p.name, err);
      } finally {
        done += 1;
        toast.loading(`Analizando ${missing.length} fotos para los ajustes IA…`, { id: t, description: `${Math.round((done / missing.length) * 100)}%` });
      }
    });
    toast.dismiss(t);
    if (queue.some(p => !p.photometrics)) throw new Error("Hay fotos sin análisis válido. Revisa sus originales antes de editar.");
  };

  const buildPayload = () => {
    const mode = presetInfo.precisionMode || "balanced";
    return {
      // MOTOR IA: los 13 básicos por foto (exposición/tono + WB + presencia + color),
      // calculados individualmente desde la fotometría y el color. "No tocar" = 0 / As Shot.
      photos: sendPhotos.map((p) => ({
        filename: p.name,
        ai_basics: computeAiBasics(
          { photometrics: p.photometrics, color: p.color, faces: p.faces },
          { mode, deadzone: "prudent", wbStrength: 0.5, subjectDetected: (p.faceCount || 0) > 0 }
        ).aiBasicAdjustments,
      })),
      // El preset/estilo NUNCA aporta básicos: capa creativa vacía por diseño.
      creative_params: {},
      preset_xmp: presetInfo.presetXmpText || null,
      camera_profile: profileChoice.profile,
      precision_mode: mode,
      preset_name: presetInfo.presetName,
    };
  };

  const xmpPayload = useMemo(() => presetInfo && buildPayload(), [sendPhotos, presetInfo, profileChoice]); // eslint-disable-line

  // Auditoría del motor por foto (observabilidad). Solo se calcula en el paso de REPORTE
  // para no bloquear las transiciones con selecciones grandes (p. ej. 500+ fotos).
  const auditByFile = useMemo(() => {
    if (step !== "report") return {};
    const mode = presetInfo?.precisionMode || "balanced";
    const m = {};
    for (const p of sendPhotos) {
      const r = computeAiBasics(
        { photometrics: p.photometrics, color: p.color, faces: p.faces },
        { mode, deadzone: "prudent", wbStrength: 0.5, subjectDetected: (p.faceCount || 0) > 0 }
      );
      m[p.name] = {
        subjectLuma: r.subjectLuma, faceWeight: r.faceWeight, meter: r.meter,
        ambience: r.ambience, wbSource: r.wbSource, skinDetected: r.skinDetected,
        exposureClassification: r.exposureClassification,
        editingConfidence: r.editingConfidence, whiteBalanceConfidence: r.whiteBalanceConfidence,
        reasoningSummary: r.reasoningSummary,
      };
    }
    return m;
  }, [sendPhotos, presetInfo, step]);

  if (!project) {
    return <AppShell><p className="text-sm text-zinc-500" data-testid="studio-loading">Cargando proyecto…</p></AppShell>;
  }

  return (
    <AppShell>
      <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">RAW AI Studio{projectName ? ` · ${projectName}` : ""}</p>
      <h1 className="font-display mt-1 text-2xl font-semibold">{project.name}</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500">
        Del proyecto al ZIP final: importa la carpeta, deja que la IA agrupe ráfagas y marque las mejores
        tomas, revisa, aplica correcciones y descarga los XMP. Los RAW nunca se modifican.
      </p>

      <div className="mt-6"><Stepper current={STEP_INDEX[step]} /></div>

      <div className={`mt-8 ${step === "review" || step === "style" ? "" : "max-w-3xl"}`}>
        {step === "folder" && (
          <FolderSelectStep onContinue={async (f, folderName) => {
            setFiles(f);
            await api.put(`${stateUrl}`, { raw_folder_path: folderName, total_images: f.length, status: "processing" });
            setProject((p) => ({ ...p, raw_folder_path: folderName, total_images: f.length }));
            // Reanudar selección: si el proyecto ya tenía una selección guardada por nombre de archivo,
            // la restauramos sobre la carpeta recién elegida en lugar de volver a analizar con IA.
            const st = project.rawai_state || {};
            const finalSel = st.finalSelection || [];
            const savedNames = (st.editQueueFilenames?.length ? st.editQueueFilenames : st.selectionFilenames) || [];
            if (finalSel.length || savedNames.length) {
              const all = analyzeFolder(f);
              if (finalSel.length) {
                // Restaurar decisiones finales (manual prevalece) sin re-ejecutar la IA.
                const identity = p => JSON.stringify([p.relativePath || p.file?.webkitRelativePath || p.filename || p.name, p.size || 0, p.lastModified || p.file?.lastModified || 0]);
                const byIdentity = new Map(finalSel.filter(x => x.size).map(x => [identity(x),x]));
                const legacy = new Map(finalSel.filter(x => !x.size).map(x => [x.filename,x]));
                all.forEach((p) => {
                  const s = byIdentity.get(identity(p)) || legacy.get(p.name);
                  const sameFile = s && (!s.size || (s.size === p.size && s.relativePath === (p.file?.webkitRelativePath || p.name) && s.lastModified === p.file?.lastModified));
                  if (sameFile) {
                    p.selectedForEdit = !!s.selected; p.source = s.source || "ai";
                    if (s.burstId != null) p.burstId = s.burstId;
                    p.selectionComparison = s.selectionComparison || null;
                  } else { p.selectedForEdit = false; p.source = "ai"; }
                });
              } else {
                const set = new Set(savedNames);
                all.forEach((p) => { p.selectedForEdit = set.has(p.name); p.source = "ai"; });
              }
              setPhotos(all);
              setSendPhotos(all.filter((p) => p.selectedForEdit));
              toast.success("Selección final restaurada", { description: `${all.filter((p) => p.selectedForEdit).length} fotos en la selección` });
              setStep("review");
            } else {
              setStep("selection");
            }
          }} />
        )}

        {step === "selection" && (
          <SelectionStep files={files} onContinue={async (p, ppl) => {
            p.forEach((x) => { x.source = "ai"; }); // propuesta inicial de la IA
            setPhotos(p);
            setPeople(ppl || []);
            await persist({ selectionCompleted: true, totalPhotos: p.length });
            await persistFinal(p);
            setStep("review");
          }} />
        )}

        {step === "review" && (
          <ReviewStep initialPhotos={photos} people={people}
            onChange={async (all) => { await persistFinal(all); setPhotos(all); }}
            onContinue={async (all) => {
              setPhotos(all);
              const queue = all.filter((x) => x.selectedForEdit);
              try { await ensureMetrics(queue); }
              catch (err) { toast.error(err.message); return; }
              setSendPhotos([...queue]);
              await persistFinal(all);
              setStep("style");
            }} />
        )}

        {step === "style" && (
          <ProfilePresetStep count={sendPhotos.length} profileValue={profileChoice} presetValue={presetInfo}
            onContinue={async ({ profileChoice: choice, presetInfo: info }) => {
              setProfileChoice(choice);
              setPresetInfo(info);
              await persist({
                profileChoice: choice, profileCompleted: true,
                presetName: info.presetName, precisionMode: info.precisionMode, presetCompleted: true,
              });
              setStep("mode");
            }} />
        )}

        {step === "mode" && (
          <ProcessingModeChoice count={sendPhotos.length}
            onLocal={() => setStep("processing")}
            onCloud={async () => {
              try {
                await api.post(`/projects/${projectId}/cloud-jobs`, buildPayload());
                toast.success("Trabajo enviado a la nube");
                navigate(`/processing?project=${projectId}`);
              } catch { toast.error("No se pudo crear el trabajo en la nube"); }
            }} />
        )}

        {step === "processing" && (
          <ProcessingStep count={sendPhotos.length} onDone={async (r) => {
            setResult(r);
            await api.put(`${stateUrl}`, { status: "completed", processed_images: r.succeeded });
            toast.success("Procesamiento completado", { description: `${r.succeeded} fotos listas` });
            setStep("report");
          }} />
        )}

        {step === "report" && result && (
          <ReportStep report={result} projectId={projectId} payload={xmpPayload} files={sendPhotos}
            audit={auditByFile} onRestart={() => navigate(folderId ? `/project/${projectId}` : "/dashboard")} />
        )}
      </div>
    </AppShell>
  );
}
