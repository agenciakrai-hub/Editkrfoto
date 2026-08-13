import { useMemo, useState } from "react";
import { Eye } from "lucide-react";

const PREVIEW_IMG = "https://images.unsplash.com/photo-1519741497674-611481863552?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// Traduce los parámetros de revelado a una cadena de filtros CSS (simulación visual aproximada).
export function cssFilterFromParams(p = {}) {
  let brightness = 1, contrast = 1, saturate = 1, sepia = 0, hue = 0;
  if ("exposure" in p) brightness *= 1 + clamp(p.exposure, -5, 5) * 0.16;
  if ("whites" in p) brightness *= 1 + p.whites / 400;
  if ("blacks" in p) brightness *= 1 + p.blacks / 600;
  if ("highlights" in p) brightness *= 1 + p.highlights / 900;
  if ("shadows" in p) brightness *= 1 + p.shadows / 900;
  if ("contrast" in p) contrast *= 1 + p.contrast / 180;
  if ("clarity" in p) contrast *= 1 + p.clarity / 320;
  let sat = 0;
  if ("vibrance" in p) sat += p.vibrance;
  if ("saturation" in p) sat += p.saturation;
  saturate = clamp(1 + sat / 160, 0, 3);
  if ("temperature" in p) { const d = (p.temperature - 5500) / 6500; sepia = clamp(Math.abs(d) * 0.5, 0, 0.6); hue += -d * 12; }
  if ("tint" in p) hue += (p.tint / 150) * 10;
  return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)}) sepia(${sepia.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg)`;
}

export default function BeforeAfterPreview({ params, image }) {
  const [pos, setPos] = useState(50);
  const filter = useMemo(() => cssFilterFromParams(params), [params]);
  const img = image || PREVIEW_IMG;
  const hasEdits = params && Object.keys(params).length > 0;

  return (
    <div className="rounded-lg border border-zinc-800 bg-[#101012] p-4" data-testid="before-after-preview">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-emerald-400" />
        <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Antes / Después (simulación)</p>
      </div>
      <div className="relative mt-3 aspect-[3/2] w-full select-none overflow-hidden rounded-lg">
        <img src={img} alt="antes" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <img src={img} alt="después" className="absolute inset-0 h-full w-full max-w-none object-cover"
            style={{ width: "100vw", filter, WebkitFilter: filter }} draggable={false} />
        </div>
        {/* etiquetas */}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-emerald-300 backdrop-blur">Después</span>
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-zinc-300 backdrop-blur">Antes</span>
        {/* divisor */}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/80 shadow" style={{ left: `${pos}%` }} />
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))}
        className="rawai-slider mt-3 w-full" data-testid="before-after-slider" aria-label="Comparar antes y después" />
      {!hasEdits && <p className="mt-2 text-[11px] text-zinc-600">Activa parámetros o aplica un estilo para ver el efecto.</p>}
    </div>
  );
}
