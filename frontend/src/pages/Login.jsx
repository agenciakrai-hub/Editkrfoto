import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Aperture, Sparkles, FolderCheck, FileArchive, ArrowRight } from "lucide-react";

const HERO = "https://images.unsplash.com/photo-1519741196428-6a2175fa2557?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/dashboard");
  }, [user, loading, navigate]);

  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const features = [
    { icon: Sparkles, title: "Selección IA", desc: "Agrupa ráfagas y marca las mejores tomas en verde." },
    { icon: FolderCheck, title: "Revisión rápida", desc: "Confirma o descarta con un clic, sin tocar los RAW." },
    { icon: FileArchive, title: "XMP en ZIP", desc: "Genera sidecars reales listos para Lightroom." },
  ];

  return (
    <div className="grid min-h-screen grid-cols-1 bg-[#101012] lg:grid-cols-2">
      <div className="flex flex-col justify-center px-8 py-16 sm:px-16 lg:px-20">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10 ring-1 ring-emerald-400/30">
            <Aperture className="h-5 w-5 text-emerald-400" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">RAW AI Studio</span>
        </div>

        <h1 className="font-display mt-12 text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
          Selección y edición <span className="text-emerald-400">IA</span> de bodas
        </h1>
        <p className="mt-5 max-w-md text-sm leading-7 text-zinc-400">
          Del proyecto al ZIP final sin salir de la app: importa la carpeta, deja que la IA
          agrupe ráfagas y marque las mejores tomas, revisa y descarga los XMP. Los RAW nunca se modifican.
        </p>

        <button
          data-testid="google-login-btn"
          onClick={handleLogin}
          className="mt-10 inline-flex w-fit items-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition-transform duration-200 hover:scale-[1.02] active:scale-95"
        >
          <img alt="Google" className="h-5 w-5" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" />
          Continuar con Google
          <ArrowRight className="h-4 w-4" />
        </button>

        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} data-testid={`feature-${f.title}`} className="rounded-xl border border-zinc-800 bg-[#141418] p-4">
              <f.icon className="h-5 w-5 text-emerald-400" />
              <p className="mt-3 text-sm font-medium text-zinc-100">{f.title}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative hidden lg:block">
        <img src={HERO} alt="Boda" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#101012] via-[#101012]/30 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
          <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">Estudio profesional</p>
          <p className="mt-2 text-sm text-zinc-200">Procesa miles de RAW por boda con precisión de darkroom y ergonomía moderna.</p>
        </div>
      </div>
    </div>
  );
}
