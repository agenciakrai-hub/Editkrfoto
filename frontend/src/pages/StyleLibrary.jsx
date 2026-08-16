import AppShell from "@/components/AppShell";
import PhotographerStyles from "@/components/studio/PhotographerStyles";
import { Globe } from "lucide-react";

export default function StyleLibrary() {
  return (
    <AppShell>
      <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Biblioteca</p>
      <h1 className="font-display mt-1 flex items-center gap-2 text-2xl font-semibold">
        <Globe className="h-6 w-6 text-emerald-400" /> Estilos de fotógrafo
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500">
        Tu hub central de estilos. Crea, analiza y gestiona los estilos de color y edición extraídos de galerías
        públicas. Después podrás usarlos como referencia dentro de cualquier proyecto, en el paso de presets.
      </p>

      <div className="mt-6" data-testid="style-library">
        <PhotographerStyles />
      </div>
    </AppShell>
  );
}
