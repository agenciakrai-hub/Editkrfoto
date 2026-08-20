import { useState } from "react";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { toast } from "sonner";
import { CheckCircle2, Download, RotateCcw, FileArchive, Images } from "lucide-react";
import api from "@/lib/api";
import { embedXmpInDng, readXmpFromDng } from "@/lib/dngXmp";
import { verifyXmp } from "@/lib/xmp/verifyXmp";
import VerificationPanel from "@/components/studio/VerificationPanel";
import LightroomPlugin from "@/components/studio/LightroomPlugin";

const baseName = (n) => n.replace(/\.[^.]+$/, "");
const isDng = (n) => /\.dng$/i.test(n);

export default function ReportStep({ report, projectId, payload, files = [], audit = {}, onRestart }) {
  const [downloading, setDownloading] = useState(false);
  const [verification, setVerification] = useState(null);

  const download = () => runExport(true);
  const downloadXmpOnly = () => runExport(false);

  // Genera y descarga el resultado en VARIOS ZIP troceados por tamaño, para no agotar la memoria
  // del navegador con selecciones grandes de DNG. embed=false → solo sidecars .xmp (muy ligero).
  const runExport = async (embed) => {
    const BUDGET = 300 * 1024 * 1024; // ~300 MB por ZIP
    setDownloading(true);
    try {
      const res = await api.post(`/projects/${projectId}/generate-xmp`, payload, { responseType: "blob" });
      const fileMap = {};
      for (const f of files) if (f && f.file) fileMap[f.name] = f.file;
      const inZip = await JSZip.loadAsync(res.data);
      const xmpByBase = {};
      await Promise.all(Object.keys(inZip.files).map(async (name) => {
        if (name.toLowerCase().endsWith(".xmp")) xmpByBase[baseName(name)] = await inZip.files[name].async("string");
      }));

      const verifyReport = [];
      let embedded = 0, sidecars = 0, part = 0;
      let zip = new JSZip(), bytesInZip = 0, filesInZip = 0;
      const flush = async () => {
        if (!filesInZip) return;
        part += 1;
        const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
        saveAs(blob, `RAWAI_XMP_parte${part}.zip`);
        zip = new JSZip(); bytesInZip = 0; filesInZip = 0;
        await new Promise((r) => setTimeout(r, 400)); // deja que el navegador procese la descarga y libere memoria
      };

      for (const base of Object.keys(xmpByBase)) {
        const xmp = xmpByBase[base];
        const dngName = embed ? Object.keys(fileMap).find((fn) => isDng(fn) && baseName(fn) === base) : null;
        let added = false;
        if (dngName) {
          try {
            const bytes = new Uint8Array(await fileMap[dngName].arrayBuffer());
            const emb = embedXmpInDng(bytes, xmp);
            if (emb.ok) {
              zip.file(dngName, emb.bytes);
              bytesInZip += emb.bytes.length; filesInZip += 1;
              verifyReport.push({ name: dngName, kind: "dng", file: fileMap[dngName], audit: audit[dngName] || null, verify: verifyXmp(readXmpFromDng(emb.bytes)) });
              embedded += 1; added = true;
            }
          } catch { /* respaldo: sidecar */ }
        }
        if (!added) {
          zip.file(`${base}.xmp`, xmp);
          bytesInZip += xmp.length * 2; filesInZip += 1;
          const srcFile = Object.keys(fileMap).find((fn) => baseName(fn) === base);
          verifyReport.push({ name: `${base}.xmp`, kind: "sidecar", file: srcFile ? fileMap[srcFile] : null, audit: srcFile ? (audit[srcFile] || null) : null, verify: verifyXmp(xmp) });
          sidecars += 1;
        }
        if (bytesInZip >= BUDGET) await flush();
      }
      await flush();
      setVerification(verifyReport);
      toast.success(part > 1 ? `Descargados ${part} ZIP (divididos por tamaño)` : "Paquete descargado",
        { description: `${embedded} DNG incrustados · ${sidecars} sidecar .xmp` });
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
          <Download className="h-4 w-4" /> {downloading ? "Generando ZIP…" : "Descargar DNG + XMP (ZIP)"}
        </button>
        <button data-testid="download-xmp-only-btn" onClick={downloadXmpOnly} disabled={downloading}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 transition-transform hover:scale-[1.02] hover:bg-zinc-800 disabled:opacity-50">
          <FileArchive className="h-4 w-4" /> Solo XMP (ligero)
        </button>
        <button data-testid="restart-btn" onClick={onRestart}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
          <RotateCcw className="h-4 w-4" /> Nuevo reportaje
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Con muchas fotos, la descarga se divide automáticamente en varios ZIP (por tamaño) para no agotar la memoria del navegador.
        Si tu navegador pide permiso para “descargar varios archivos”, acéptalo. <b>Solo XMP</b> descarga los sidecars sin incrustar en el DNG (muy ligero).
      </p>

      <LightroomPlugin projectId={projectId} payload={payload} />

      <VerificationPanel report={verification} onRetry={download} retrying={downloading} />
    </section>
  );
}
