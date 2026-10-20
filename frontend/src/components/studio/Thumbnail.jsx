import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { extractThumb } from "@/lib/rawThumb";

// Miniatura perezosa: extrae la vista previa incrustada del RAW solo cuando entra en pantalla.
export default function Thumbnail({ file, fallback, alt, className, dimmed }) {
  const ref = useRef(null);
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let created = null;
    setUrl(null);
    setFailed(false);
    (async () => {
      try {
        const t = await extractThumb(file);
        if (!active) { if (t) URL.revokeObjectURL(t); return; }
        if (t) { created = t; setUrl(t); } else if (!fallback) { setFailed(true); }
      } catch {
        if (active && !fallback) setFailed(true);
      }
    })();
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [visible, file, fallback]);

  const src = failed ? null : url || fallback || null;

  return (
    <div ref={ref} className={`relative bg-zinc-900 ${className || ""}`}>
      {src ? (
        <img src={src} alt={alt} onError={() => setFailed(true)} className={`h-full w-full object-cover transition-all duration-300 ${dimmed ? "opacity-45 grayscale" : ""}`} />
      ) : failed || !file ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-zinc-400" data-testid="thumbnail-unavailable">
          <ImageOff className="h-6 w-6" />
          <span className="text-xs">Vista previa no disponible</span>
        </div>
      ) : (
        <div className="h-full w-full animate-pulse bg-zinc-800/60" />
      )}
    </div>
  );
}
