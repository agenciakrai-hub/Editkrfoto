import { useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import { Link2, FolderInput, Loader2 } from "lucide-react";
import api from "@/lib/api";

const baseName = (n) => n.replace(/\.[^.]+$/, "");
const joinPath = (a, b) => a.replace(/[\/\\]+$/, "") + "/" + String(b).replace(/^[\/\\]+/, "");
// webkitRelativePath = "Carpeta/sub/foto.cr3" → quita el primer segmento (nombre de la carpeta raíz).
const relInside = (p) => {
  const parts = String(p).split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : p;
};

const LS = "rawai_lr_agent";
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };

// Sincroniza los XMP directamente con el agente local del plugin de Lightroom (Base44),
// sin descargar ZIP. Envía { photos: [{ path, xmp_content, rating, label, selectedByAI }] }.
export default function LightroomSync({ projectId, payload, files = [] }) {
  const saved = load();
  const [baseFolder, setBaseFolder] = useState(saved.baseFolder || "");
  const [agentUrl, setAgentUrl] = useState(saved.agentUrl || "http://localhost:7457");
  const [token, setToken] = useState(saved.token || "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const persist = (patch) => {
    const next = { baseFolder, agentUrl, token, ...patch };
    localStorage.setItem(LS, JSON.stringify(next));
  };

  const sync = async () => {
    if (!baseFolder.trim()) { toast.error("Indica la carpeta base en el disco del fotógrafo"); return; }
    setBusy(true); setResult(null);
    try {
      // 1) Genera los XMP (mismo motor que la descarga: básicas IA + perfil + preset + 5★/Verde).
      const res = await api.post(`/projects/${projectId}/generate-xmp`, payload, { responseType: "blob" });
      const inZip = await JSZip.loadAsync(res.data);
      const xmpByBase = {};
      await Promise.all(Object.keys(inZip.files).map(async (name) => {
        if (name.toLowerCase().endsWith(".xmp")) xmpByBase[baseName(name)] = await inZip.files[name].async("string");
      }));
      // 2) Construye las rutas absolutas uniendo la carpeta base con la ruta relativa de cada foto.
      const fileByBase = {};
      for (const f of files) if (f && f.name) fileByBase[baseName(f.name)] = f;
      const photos = Object.entries(xmpByBase).map(([base, xmp]) => {
        const f = fileByBase[base];
        const rel = (f?.file?.webkitRelativePath && relInside(f.file.webkitRelativePath)) || f?.name || base;
        return { path: joinPath(baseFolder.trim(), rel), xmp_content: xmp, selectedByAI: true, rating: 5, label: "Verde" };
      });
      if (!photos.length) { toast.error("No hay XMP para sincronizar"); setBusy(false); return; }
      // 3) Envía al agente local del plugin.
      const headers = { "Content-Type": "application/json" };
      if (token.trim()) headers["X-Agent-Token"] = token.trim();
      const r = await fetch(`${agentUrl.replace(/\/+$/, "")}/lr-direct/apply-xmp`, {
        method: "POST", headers, body: JSON.stringify({ photos }),
      });
      if (!r.ok) throw new Error(`Agente respondió ${r.status}`);
      const data = await r.json();
      setResult(data);
      persist({});
      toast.success(`Sincronizadas ${data.written ?? photos.length} fotos con Lightroom`,
        { description: `Fallidas: ${data.failed ?? 0}. Pulsa "Sincronizar" en el plugin de Lightroom.` });
    } catch (e) {
      const msg = String(e?.message || e);
      toast.error("No se pudo conectar con el agente de Lightroom", {
        description: `${msg}. Revisa: (1) el agente está abierto en ${agentUrl}, (2) permite CORS desde esta web, (3) usa Chrome (permite http://localhost).`,
      });
    } finally { setBusy(false); }
  };

  const inputCls = "w-full rounded-md border border-zinc-700 bg-[#101012] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none";

  return (
    <section data-testid="lr-sync-panel" className="animate-fade-up mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/40">
          <Link2 className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold">Sincronizar con Lightroom (sin descargar)</h3>
          <p className="text-sm text-zinc-500">Envía los XMP directamente a tu agente local; el plugin los aplica al catálogo.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-xs text-zinc-400">
          Carpeta base de los RAW en tu disco <span className="text-zinc-600">(ej. /Users/fotografo/Boda)</span>
          <input data-testid="lr-base-folder" className={inputCls + " mt-1"} value={baseFolder}
            onChange={(e) => { setBaseFolder(e.target.value); persist({ baseFolder: e.target.value }); }}
            placeholder="/Users/fotografo/Boda" />
        </label>
        <label className="text-xs text-zinc-400">
          URL del agente
          <input data-testid="lr-agent-url" className={inputCls + " mt-1"} value={agentUrl}
            onChange={(e) => { setAgentUrl(e.target.value); persist({ agentUrl: e.target.value }); }} />
        </label>
        <label className="text-xs text-zinc-400">
          Token del agente <span className="text-zinc-600">(opcional)</span>
          <input data-testid="lr-agent-token" className={inputCls + " mt-1"} value={token}
            onChange={(e) => { setToken(e.target.value); persist({ token: e.target.value }); }} placeholder="—" />
        </label>
      </div>

      <button data-testid="lr-sync-btn" onClick={sync} disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />}
        {busy ? "Sincronizando…" : "Sincronizar con Lightroom"}
      </button>

      {result && (
        <p data-testid="lr-sync-result" className="mt-3 text-sm text-emerald-300">
          ✓ Escritas {result.written ?? "?"} · Fallidas {result.failed ?? 0}. Ahora pulsa <b>Sincronizar</b> en el plugin de Lightroom.
        </p>
      )}
    </section>
  );
}
