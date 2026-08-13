import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import Stepper from "@/components/studio/Stepper";
import FolderSelectStep from "@/components/studio/FolderSelectStep";
import SelectionStep from "@/components/studio/SelectionStep";
import ReviewStep from "@/components/studio/ReviewStep";
import CameraProfileStep from "@/components/studio/CameraProfileStep";
import PresetParamsStep from "@/components/studio/PresetParamsStep";
import ProcessingModeChoice from "@/components/studio/ProcessingModeChoice";
import ProcessingStep from "@/components/studio/ProcessingStep";
import ReportStep from "@/components/studio/ReportStep";
import { creativeParametersFromConfig, AUTO_BASIC_PARAMS } from "@/lib/paramDefs";
import { analyzeFolder } from "@/lib/rawSelection";
import api from "@/lib/api";

const STEP_INDEX = { folder: 0, selection: 1, review: 2, profile: 3, presets: 4, mode: 5, processing: 5, report: 5 };

export default function Studio() {
  const [params] = useSearchParams();
  const projectId = params.get("project");
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [step, setStep] = useState("folder");
  const [files, setFiles] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [sendPhotos, setSendPhotos] = useState([]);
  const [profileChoice, setProfileChoice] = useState({ profile: "Adobe Standard" });
  const [presetInfo, setPresetInfo] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!projectId) { navigate("/dashboard"); return; }
    api.get(`/projects/${projectId}`).then((r) => {
      // Si ya hay un trabajo en la nube en curso o terminado, el estado oficial vive en Procesamiento.
      if (r.data.rawai_state?.cloudJobId) { navigate(`/processing?project=${projectId}`); return; }
      setProject(r.data);
    }).catch(() => navigate("/dashboard"));
  }, [projectId, navigate]);

  const persist = async (patch) => {
    try { await api.patch(`/projects/${projectId}/state`, patch); }
    catch (err) { console.warn("No se pudo guardar el checkpoint de estado", err); }
  };

  const buildPayload = () => ({
    photos: sendPhotos.map((p) => ({ filename: p.name, basic: p.basic || AUTO_BASIC_PARAMS })),
    creative_params: presetInfo.presetXmpText ? {} : creativeParametersFromConfig(presetInfo.config),
    preset_xmp: presetInfo.presetXmpText || null,
    camera_profile: profileChoice.profile,
    precision_mode: presetInfo.precisionMode,
    preset_name: presetInfo.presetName,
  });

  const xmpPayload = useMemo(() => presetInfo && buildPayload(), [sendPhotos, presetInfo, profileChoice]); // eslint-disable-line

  if (!project) {
    return <AppShell><p className="text-sm text-zinc-500" data-testid="studio-loading">Cargando proyecto…</p></AppShell>;
  }

  return (
    <AppShell>
      <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">RAW AI Studio</p>
      <h1 className="font-display mt-1 text-2xl font-semibold">{project.name}</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500">
        Del proyecto al ZIP final: importa la carpeta, deja que la IA agrupe ráfagas y marque las mejores
        tomas, revisa, aplica correcciones y descarga los XMP. Los RAW nunca se modifican.
      </p>

      <div className="mt-6"><Stepper current={STEP_INDEX[step]} /></div>

      <div className={`mt-8 ${step === "review" ? "" : "max-w-3xl"}`}>
        {step === "folder" && (
          <FolderSelectStep onContinue={async (f, folderName) => {
            setFiles(f);
            await api.put(`/projects/${projectId}`, { raw_folder_path: folderName, total_images: f.length, status: "processing" });
            setProject((p) => ({ ...p, raw_folder_path: folderName, total_images: f.length }));
            // Reanudar selección: si el proyecto ya tenía una selección guardada por nombre de archivo,
            // la restauramos sobre la carpeta recién elegida en lugar de volver a analizar con IA.
            const st = project.rawai_state || {};
            const saved = (st.editQueueFilenames?.length ? st.editQueueFilenames : st.selectionFilenames) || [];
            if (saved.length) {
              const set = new Set(saved);
              const all = analyzeFolder(f);
              all.forEach((p) => { p.selectedForEdit = set.has(p.name); });
              setPhotos(all);
              setSendPhotos(all.filter((p) => p.selectedForEdit));
              toast.success("Selección restaurada", { description: `${set.size} fotos recuperadas del proyecto` });
              setStep("review");
            } else {
              setStep("selection");
            }
          }} />
        )}

        {step === "selection" && (
          <SelectionStep files={files} onContinue={async (p) => {
            setPhotos(p);
            await persist({ selectionCompleted: true, totalPhotos: p.length, selectionFilenames: p.filter((x) => x.selectedForEdit).map((x) => x.name) });
            setStep("review");
          }} />
        )}

        {step === "review" && (
          <ReviewStep initialPhotos={photos} onContinue={async (all) => {
            setPhotos(all);
            const queue = all.filter((x) => x.selectedForEdit);
            setSendPhotos(queue);
            await persist({ reviewCompleted: true, editQueueFilenames: queue.map((q) => q.name) });
            setStep("profile");
          }} />
        )}

        {step === "profile" && (
          <CameraProfileStep count={sendPhotos.length} value={profileChoice} onContinue={async (choice) => {
            setProfileChoice(choice);
            await persist({ profileChoice: choice, profileCompleted: true });
            setStep("presets");
          }} />
        )}

        {step === "presets" && (
          <PresetParamsStep count={sendPhotos.length} onContinue={async (info) => {
            setPresetInfo(info);
            await persist({ presetName: info.presetName, precisionMode: info.precisionMode, presetCompleted: true });
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
            await api.put(`/projects/${projectId}`, { status: "completed", processed_images: r.succeeded });
            toast.success("Procesamiento completado", { description: `${r.succeeded} fotos listas` });
            setStep("report");
          }} />
        )}

        {step === "report" && result && (
          <ReportStep report={result} projectId={projectId} payload={xmpPayload}
            onRestart={() => navigate("/dashboard")} />
        )}
      </div>
    </AppShell>
  );
}
