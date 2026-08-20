import { useState } from "react";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { toast } from "sonner";
import { CheckCircle2, Download, RotateCcw, FileArchive, Images } from "lucide-react";
import api from "@/lib/api";
import { embedXmpInDng, readXmpFromDng } from "@/lib/dngXmp";
import { verifyXmp } from "@/lib/xmp/verifyXmp";
import VerificationPanel from "@/components/studio/VerificationPanel";

const baseName = (n) => n.replace(/\.[^.]+$/, "");
const isDng = (n) => /\.dng$/i.test(n);

export default function ReportStep({ report, projectId, payload, files = [], onRestart }) {
  const [downloading, setDownloading] = useState(false);
  const [verification, setVerification] = useState(null);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await api.post(`/projects/${projectId}/generate-xmp`, payload, { responseType: "blob" });
      // El backend devuelve sidecars .xmp (básicas IA + preset + 5★/verde, con aislamiento).
      // Para DNG, Lightroom IGNORA el sidecar → hay que incrustar el XMP DENTRO del .dng.
      const fileMap = {};
      for (const f of files) if (f && f.file) fileMap[f.name] = f.file;
      const inZip = await JSZip.loadAsync(res.data);
      const xmpByBase = {};
      await Promise.all(Object.keys(inZip.files).map(async (name) => {
        if (name.toLowerCase().endsWith(".xmp")) xmpByBase[baseName(name)] = await inZip.files[name].async("string");
      }));

      const out = new JSZip();
      const verifyReport = [];
      let embedded = 0, sidecars = 0;
      for (const base of Object.keys(xmpByBase)) {
        const xmp = xmpByBase[base];
        const dngName = Object.keys(fileMap).find((fn) => isDng(fn) && baseName(fn) === base);
        if (dngName) {
          try {
            const bytes = new Uint8Array(await fileMap[dngName].arrayBuffer());
            const emb = embedXmpInDng(bytes, xmp);
            if (emb.ok) {
              out.file(dngName, emb.bytes);
              // VERIFICA leyendo el XMP DE VUELTA del propio .dng generado (no del sidecar del backend).
              verifyReport.push({ name: dngName, kind: "dng", verify: verifyXmp(readXmpFromDng(emb.bytes)) });
              embedded++;
              continue;
            }
          } catch { /* respaldo: sidecar */ }
        }
        out.file(`${base}.xmp`, xmp);
        verifyReport.push({ name: `${base}.xmp`, kind: "sidecar", verify: verifyXmp(xmp) });
        sidecars++;
      }
      const blob = await out.generateAsync({ type: "blob", compression: "DEFLATE" });
      saveAs(blob, "RAWAI_XMP.zip");
      setVerification(verifyReport);
      toast.success("Paquete descargado", { description: `${embedded} DNG con ajustes incrustados · ${sidecars} sidecar .xmp` });
    } catch {
      toast.error("No se pudo generar el ZIP");
    } finally {
      setDownloading(false);
    }
  };

  const stats = [
    { icon: CheckCircle2, label: "XMP generados", value: report.succeeded, accent: true },
    { icon: Images, label: "Fotos procesadas", value: report.total },
    { icon: FileArchive, label: "Errores", value: report.failed },
  ];

  return (
    <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-6" data-testid="report-step">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/40">
          <CheckCircle2 className="h-6 w-6 text-emerald-400" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">¡Edición IA completada!</h2>
          <p className="text-sm text-zinc-500">Tus sidecars XMP están listos para importar en Lightroom / Camera Raw.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} data-testid={`report-stat-${s.label}`} className="rounded-xl border border-zinc-800 bg-[#1c1c22] p-4">
            <s.icon className={`h-5 w-5 ${s.accent ? "text-emerald-400" : "text-zinc-400"}`} />
            <p className={`mt-3 font-display text-2xl font-bold ${s.accent ? "text-emerald-400" : "text-zinc-100"}`}>{s.value}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button data-testid="download-zip-btn" onClick={download} disabled={downloading}
          className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-50">
          <Download className="h-4 w-4" /> {downloading ? "Generando ZIP…" : "Descargar XMP (ZIP)"}
        </button>
        <button data-testid="restart-btn" onClick={onRestart}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
          <RotateCcw className="h-4 w-4" /> Nuevo reportaje
        </button>
      </div>

      <VerificationPanel report={verification} />
    </section>
  );
}
