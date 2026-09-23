import { useEffect, useMemo, useState } from "react";
import { extractThumb } from "@/lib/rawThumb";
import { X, RotateCcw, Eye, Check } from "lucide-react";

// Editor visual no destructivo: la IA fija los básicos, aquí los afinas con vista previa aproximada.
const SLIDERS = [
  { key: "exposure", label: "Exposición", min: -2, max: 2, step: 0.05, unit: "EV" },
  { key: "contrast", label: "Contraste", min: -100, max: 100, step: 1 },
  { key: "highlights", label: "Luces", min: -100, max: 100, step: 1 },
  { key: "shadows", label: "Sombras", min: -100, max: 100, step: 1 },
  { key: "whites", label: "Blancos", min: -100, max: 100, step: 1 },
  { key: "blacks", label: "Negros", min: -100, max: 100, step: 1 },
  { key: "temperature", label: "Temperatura", min: -100, max: 100, step: 1, wb: true },
  { key: "tint", label: "Tinte", min: -100, max: 100, step: 1, wb: true },
  { key: "clarity", label: "Claridad", min: -100, max: 100, step: 1 },
  { key: "vibrance", label: "Intensidad", min: -100, max: 100, step: 1 },
  { key: "saturation", label: "Saturación", min: -100, max: 100, step: 1 },
];

const num = (v) => (v == null ? 0 : v);

export default function PhotoEditor({ item, initial, cameraProfile, onSave, onClose }) {
  const [adj, setAdj] = useState(() => ({ ...initial }));
  const [url, setUrl] = useState(null);
  const [showBefore, setShowBefore] = useState(false);

  useEffect(() => {
    let active = true, created = null;
    extractThumb(item.file).then((t) => { if (!active) { if (t) URL.revokeObjectURL(t); return; } if (t) { created = t; setUrl(t); } });
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [item.file]);

  const filter = useMemo(() => {
    const ex = num(adj.exposure), co = num(adj.contrast), wh = num(adj.whites), sh = num(adj.shadows);
    const bl = num(adj.blacks), cl = num(adj.clarity), vib = num(adj.vibrance), sat = num(adj.saturation), hi = num(adj.highlights);
    const brightness = 1 + ex * 0.30 + wh * 0.0012 + sh * 0.0011 + hi * -0.0007;
    const contrast = 1 + co / 130 + cl * 0.0016 + bl * -0.0009;
    const saturate = 1 + (vib * 0.6 + sat) / 150;
    return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)})`;
  }, [adj]);

  const warmth = num(adj.temperature);
  const tintV = num(adj.tint);
  const overlay = useMemo(() => {
    const a = Math.min(0.30, Math.abs(warmth) / 100 * 0.30);
    const t = Math.min(0.20, Math.abs(tintV) / 100 * 0.20);
    const warmCol = warmth >= 0 ? `rgba(255,150,40,${a})` : `rgba(60,140,255,${a})`;
    const tintCol = tintV >= 0 ? `rgba(230,60,200,${t})` : `rgba(70,220,90,${t})`;
    return `linear-gradient(${warmCol},${warmCol}), linear-gradient(${tintCol},${tintCol})`;
  }, [warmth, tintV]);

  const set = (k, v) => setAdj((a) => ({ ...a, [k]: Number(v) }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" data-testid="photo-editor">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#141418] lg:flex-row">
        {/* Preview */}
        <div className="relative flex flex-1 items-center justify-center bg-black p-4">
          {url ? (
            <div className="relative max-h-[70vh]">
              <img src={url} alt={item.name} className="max-h-[70vh] w-auto rounded" style={showBefore ? {} : { filter }} />
              {!showBefore && <div className="pointer-events-none absolute inset-0 rounded mix-blend-soft-light" style={{ backgroundImage: overlay }} />}
            </div>
          ) : <div className="h-64 w-96 animate-pulse rounded bg-zinc-800" />}
          <button data-testid="editor-before-toggle" onMouseDown={() => setShowBefore(true)} onMouseUp={() => setShowBefore(false)} onMouseLeave={() => setShowBefore(false)}
            className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs text-zinc-200 backdrop-blur">
            <Eye className="h-3.5 w-3.5" /> Mantén para ver el original
          </button>
        </div>
        {/* Controls */}
        <div className="flex w-full flex-col border-t border-zinc-800 lg:w-80 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-zinc-800 p-4">
            <div>
              <p className="truncate font-mono text-xs text-zinc-400">{item.name}</p>
              <p className="text-[11px] text-zinc-600">La IA fijó los básicos · perfil: {cameraProfile}</p>
            </div>
            <button data-testid="editor-close" onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {SLIDERS.map((s) => (
              <div key={s.key} data-testid={`slider-${s.key}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{s.label}{s.wb ? " (BB)" : ""}</span>
                  <span className="font-mono text-zinc-300">{s.step < 1 ? num(adj[s.key]).toFixed(2) : Math.round(num(adj[s.key]))}{s.unit ? ` ${s.unit}` : ""}</span>
                </div>
                <input type="range" min={s.min} max={s.max} step={s.step} value={num(adj[s.key])}
                  onChange={(e) => set(s.key, e.target.value)} className="mt-1 w-full accent-emerald-400" />
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-zinc-800 p-4">
            <button data-testid="editor-reset" onClick={() => setAdj({ ...initial })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">
              <RotateCcw className="h-3.5 w-3.5" /> IA
            </button>
            <button data-testid="editor-save" onClick={() => onSave(adj)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:scale-[1.01]">
              <Check className="h-4 w-4" /> Guardar ajustes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
