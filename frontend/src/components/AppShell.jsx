import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Aperture, LogOut } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const NAV = [
  { to: "/dashboard", label: "Proyectos", testId: "nav-dashboard-btn" },
  { to: "/auto-basic", label: "Auto XMP", testId: "nav-autobasic-btn" },
  { to: "/album", label: "Álbum", testId: "nav-album-btn" },
  { to: "/styles", label: "Estilos", testId: "nav-styles-btn" },
  { to: "/learning", label: "Aprendizaje", testId: "nav-learning-btn" },
  { to: "/engine-lab", label: "Motor", testId: "nav-engine-btn" },
  { to: "/validation", label: "Validación", testId: "nav-validation-btn" },
  { to: "/profiles", label: "Perfiles", testId: "nav-profiles-btn" },
  { to: "/ai-providers", label: "IA", testId: "nav-ai-btn" },
];

export default function AppShell({ children, wide = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="min-h-screen bg-[#101012] text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#101012]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <button data-testid="brand-home-btn" onClick={() => navigate("/dashboard")} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 ring-1 ring-emerald-400/30">
              <Aperture className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight">RAW AI Studio</span>
          </button>

          {user && (
            <div className="flex items-center gap-2">
            <nav className="hidden items-center gap-1 sm:flex">
              {NAV.map((n) => (
                <button key={n.to} data-testid={n.testId} onClick={() => navigate(n.to)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    location.pathname === n.to
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                      : "border-zinc-800 bg-[#141418] text-zinc-300 hover:border-zinc-700"
                  }`}>
                  {n.label}
                </button>
              ))}
            </nav>
            <div className="relative" ref={ref}>
              <button data-testid="user-menu-btn" onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-2.5 rounded-full border border-zinc-800 bg-[#141418] py-1 pl-1 pr-3 hover:border-zinc-700">
                {user.picture
                  ? <img src={user.picture} alt="" className="h-7 w-7 rounded-full object-cover" />
                  : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/20 text-xs font-semibold text-emerald-300">{user.name?.[0]?.toUpperCase()}</div>}
                <span className="hidden text-xs font-medium text-zinc-300 sm:block">{user.name}</span>
              </button>
              {open && (
                <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-800 bg-[#1c1c22] shadow-xl">
                  <div className="border-b border-zinc-800 px-4 py-3">
                    <p className="truncate text-sm font-medium text-zinc-100">{user.name}</p>
                    <p className="truncate text-xs text-zinc-500">{user.email}</p>
                  </div>
                  <div className="border-b border-zinc-800 py-1 sm:hidden">
                    {NAV.map((n) => (
                      <button key={n.to} data-testid={`menu-${n.testId}`}
                        onClick={() => { setOpen(false); navigate(n.to); }}
                        className={`flex w-full items-center px-4 py-2.5 text-sm hover:bg-zinc-800/60 ${
                          location.pathname === n.to ? "text-emerald-300" : "text-zinc-300"
                        }`}>
                        {n.label}
                      </button>
                    ))}
                  </div>
                  <button data-testid="logout-btn" onClick={logout}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800/60">
                    <LogOut className="h-4 w-4" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
            </div>
          )}
        </div>
      </header>
      <main className={wide ? "mx-auto max-w-[1750px] px-4 py-5" : "mx-auto max-w-6xl px-6 py-8"}>{children}</main>
    </div>
  );
}
