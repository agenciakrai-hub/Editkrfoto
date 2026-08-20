import { useEffect, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import { Plug, Copy, Send, Loader2, Download } from "lucide-react";
import api from "@/lib/api";

const baseName = (n) => n.replace(/\.[^.]+$/, "");

// Conexión PROPIA con Lightroom vía plugin (independiente de terceros).
// La web envía los XMP a mi backend; el plugin de Lightroom los descarga y aplica.
export default function LightroomPlugin({ projectId, payload, files = [] }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/lr/token").then((r) => setToken(r.data.token)).catch(() => {});
  }, []);

  const copyToken = () => {
    navigator.clipboard?.writeText(token);
    toast.success("Token copiado");
  };

  const push = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/projects/${projectId}/generate-xmp`, payload, { responseType: "blob" });
      const inZip = await JSZip.loadAsync(res.data);
      const xmpByBase = {};
      await Promise.all(Object.keys(inZip.files).map(async (name) => {
        if (name.toLowerCase().endsWith(".xmp")) xmpByBase[baseName(name)] = await inZip.files[name].async("string");
      }));
      const nameByBase = {};
      for (const f of files) if (f && f.name) nameByBase[baseName(f.name)] = f.name;
      const photos = Object.entries(xmpByBase).map(([base, xmp]) => ({
        filename: nameByBase[base] || base, xmp_content: xmp,
      }));
      if (!photos.length) { toast.error("No hay XMP para enviar"); setBusy(false); return; }
      const r = await api.post("/lr/push", { photos });
      toast.success(`${r.data.written} fotos enviadas a Lightroom`, {
        description: "En Lightroom: selecciona las fotos y usa el plugin RAW AI Studio › Sincronizar.",
      });
    } catch {
      toast.error("No se pudieron enviar los XMP");
    } finally { setBusy(false); }
  };

  const pluginUrl = `${process.env.REACT_APP_BACKEND_URL}/api/lr/plugin-download`;

  return (
    <section data-testid="lr-plugin-panel" className="animate-fade-up mt-6 rounded-xl border border-sky-500/25 bg-sky-500/[0.04] p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-400/15 ring-1 ring-sky-400/40">
          <Plug className="h-5 w-5 text-sky-400" />
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold">Enviar a Lightroom (plugin propio)</h3>
          <p className="text-sm text-zinc-500">Sin descargar ZIP: envía los XMP y el plugin los aplica al catálogo.</p>
        </div>
      </div>

      <button data-testid="lr-push-btn" onClick={push} disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {busy ? "Enviando…" : "Enviar a Lightroom"}
      </button>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-[#101012] p-3 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Instalación del plugin (una vez)</p>
        <div className="flex items-center gap-2">
          <a data-testid="lr-plugin-download" href={pluginUrl}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800">
            <Download className="h-3.5 w-3.5" /> Descargar plugin + instalador
          </a>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Descomprime el ZIP y ejecuta <span className="font-mono text-zinc-300">Instalar-Windows.bat</span> o <span className="font-mono text-zinc-300">Instalar-Mac.command</span>. El plugin se copia solo a Lightroom; al reiniciarlo estará cargado.
        </p>
        <p className="mt-3 text-xs text-zinc-500">Pega este token en el plugin (RAW AI Studio › Configurar):</p>
        <div className="mt-1 flex items-center gap-2">
          <code data-testid="lr-token" className="flex-1 truncate rounded bg-[#1c1c22] px-2 py-1.5 font-mono text-xs text-sky-200">{token || "…"}</code>
          <button data-testid="lr-token-copy" onClick={copyToken} className="rounded-md border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
