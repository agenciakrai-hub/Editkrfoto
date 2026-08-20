import { useEffect, useRef, useState } from "react";
import { extractThumb } from "@/lib/rawThumb";
import { cssFilterFromBasics } from "@/lib/xmp/previewFilter";

// Previsualización Antes/Después (aproximada, con filtros CSS) de una foto exportada.
// Carga la miniatura real de forma perezosa cuando se abre; libera el object URL al desmontar.
export default function BeforeAfterMini({ file, basics }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);
  const urlRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const u = file ? await extractThumb(file) : null;
        if (!active) { if (u) URL.revokeObjectURL(u); return; }
        if (u) { urlRef.current = u; setUrl(u); } else setErr(true);
      } catch { if (active) setErr(true); }
    })();
    return () => { active = false; if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, [file]);

  const filter = cssFilterFromBasics(basics);

  if (err || !file) {
    return <p data-testid="before-after-error" className="mt-2 text-[11px] text-zinc-600">Vista previa no disponible para este archivo.</p>;
  }
  if (!url) {
    return <p data-testid="before-after-loading" className="mt-2 text-[11px] text-zinc-500">Generando vista previa…</p>;
  }

  return (
    <div data-testid="before-after" className="mt-3 grid grid-cols-2 gap-2">
      {[
        { key: "antes", label: "Antes (original)", f: "none" },
        { key: "despues", label: "Después (IA + preset)", f: filter },
      ].map((s) => (
        <figure key={s.key} data-testid={`before-after-${s.key}`} className="overflow-hidden rounded-md border border-zinc-800 bg-black">
          <img src={url} alt={s.label} loading="lazy" style={{ filter: s.f }}
            className="h-28 w-full object-cover" />
          <figcaption className={`px-2 py-1 text-[10px] ${s.key === "despues" ? "text-emerald-400" : "text-zinc-500"}`}>{s.label}</figcaption>
        </figure>
      ))}
      <p className="col-span-2 text-[10px] text-zinc-600">Aproximación visual orientativa (no es el revelado real del RAW).</p>
    </div>
  );
}
