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
    (async () => {
      const t = await extractThumb(file);
      if (!active) { if (t) URL.revokeObjectURL(t); return; }
      if (t) { created = t; setUrl(t); } else { setFailed(true); }
    })();
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [visible, file]);

  const src = url || (failed ? fallback : null);

  return (
    <div ref={ref} className={`relative bg-zinc-900 ${className || ""}`}>
      {src ? (
        <img src={src} alt={alt} className={`h-full w-full object-cover transition-all duration-300 ${dimmed ? "opacity-45 grayscale" : ""}`} />
      ) : failed ? (
        <div className="flex h-full w-full items-center justify-center text-zinc-700"><ImageOff className="h-6 w-6" /></div>
      ) : (
        <div className="h-full w-full animate-pulse bg-zinc-800/60" />
      )}
    </div>
  );
}
