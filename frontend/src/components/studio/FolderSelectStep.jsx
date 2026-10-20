import { useRef, useState } from "react";
import { FolderUp, ArrowRight, ShieldCheck } from "lucide-react";
import { isRaw } from "@/lib/rawSelection";
import { filesFromDirectory } from "@/lib/workspaceCache";

export default function FolderSelectStep({ onContinue }) {
  const inputRef = useRef(null);
  const [picked, setPicked] = useState(null);

  const handlePick = (e) => {
    const all = Array.from(e.target.files || []);
    const raws = all.filter((f) => isRaw(f.name));
    if (!raws.length) return;
    const folderName = raws[0].webkitRelativePath?.split("/")[0] || "Carpeta RAW";
    setPicked({ files: raws, folderName, handle: null });
  };

  const handlePickDirectory = async () => {
    if (typeof window.showDirectoryPicker === "function") {
      try {
        const handle = await window.showDirectoryPicker({ mode: "read" });
        const files = (await filesFromDirectory(handle)).filter((file) => isRaw(file.name));
        if (files.length) setPicked({ files, folderName: handle.name || "Carpeta RAW", handle });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    inputRef.current?.click();
  };

  return (
    <section className="animate-fade-up rounded-xl border border-zinc-800 bg-[#141418] p-6">
      <h2 className="font-display text-lg font-semibold">Importa la carpeta de RAW</h2>
      <p className="mt-1.5 max-w-lg text-sm text-zinc-500">
        Selecciona la carpeta completa del reportaje. La IA leerá los nombres y metadatos para
        agrupar ráfagas. Los archivos RAW originales nunca se modifican.
      </p>

      <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple hidden
        onChange={handlePick} data-testid="folder-input" />

      <button data-testid="pick-folder-btn" onClick={handlePickDirectory}
        className="mt-6 flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-700 bg-[#101012] py-12 transition-colors hover:border-emerald-400/50 hover:bg-emerald-400/[0.03]">
        <FolderUp className="h-8 w-8 text-emerald-400" />
        <span className="text-sm font-medium text-zinc-200">Elegir carpeta de RAW</span>
        <span className="text-xs text-zinc-600">CR2 · CR3 · NEF · ARW · DNG · RAF · ORF · RW2 · JPG</span>
      </button>

      {picked && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-zinc-800 bg-[#1c1c22] px-4 py-3" data-testid="folder-summary">
          <div>
            <p className="text-sm font-medium text-zinc-100">{picked.folderName}</p>
            <p className="text-xs text-zinc-500">{picked.files.length} archivos RAW detectados</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
        </div>
      )}

      <button data-testid="folder-continue-btn" disabled={!picked}
        onClick={() => onContinue(picked.files, picked.folderName, picked.handle)}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100">
        Analizar con IA <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
