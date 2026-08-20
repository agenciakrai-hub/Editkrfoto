import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Aperture } from "lucide-react";

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    const sessionId = params.get("session_id");
    if (!sessionId) { navigate("/"); return; }

    (async () => {
      try {
        const res = await api.post("/auth/session", {}, { headers: { "X-Session-ID": sessionId } });
        setUser(res.data.user);
        window.history.replaceState(null, "", "/dashboard");
        navigate("/dashboard", { state: { user: res.data.user } });
      } catch (err) {
        if (err?.response?.status === 403) {
          toast.error("Acceso restringido", { description: "Esta cuenta no está autorizada para usar RAW AI Studio." });
        }
        navigate("/");
      }
    })();
  }, [location.hash, navigate, setUser]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#101012]" data-testid="auth-callback">
      <Aperture className="h-10 w-10 animate-spin text-emerald-400" />
      <p className="text-sm text-zinc-400">Iniciando sesión en RAW AI Studio…</p>
    </div>
  );
}
