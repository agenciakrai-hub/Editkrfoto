import { useState } from "react";
import { ShieldCheck, ShieldAlert, ChevronDown, Check, Minus, X } from "lucide-react";

const Badge = ({ ok, warn, children, testid }) => {
  const cls = ok
    ? "border-emerald-400/40 bg-emerald-400/[0.08] text-emerald-300"
    : warn
      ? "border-amber-400/40 bg-amber-400/[0.08] text-amber-300"
      : "border-zinc-700 bg-zinc-800/40 text-zinc-400";
  const Icon = ok ? Check : warn ? X : Minus;
  return (
    <span data-testid={testid} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" /> {children}
    </span>
  );
};

function VerificationRow({ item }) {
  const [open, setOpen] = useState(false);
  const v = item.verify;
  const kind = item.kind === "dng" ? "DNG (incrustado)" : "Sidecar .xmp";

  return (
    <div data-testid={`verify-row-${item.name}`} className="rounded-lg border border-zinc-800 bg-[#101012] p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-zinc-200">{item.name}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-600">{kind}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge ok={v.hasBasics} testid={`verify-basics-${item.name}`}>
          Básicas IA {v.hasBasics ? `· ${v.activeCount} activas` : "ausentes"}
        </Badge>
        <Badge ok={v.hasLook} testid={`verify-look-${item.name}`}>
          Look preset {v.hasLook ? "presente" : "—"}
        </Badge>
        <Badge ok={!v.isPresetTemplate} warn={v.isPresetTemplate} testid={`verify-applied-${item.name}`}>
          {v.isPresetTemplate ? "Es preset-template ⚠" : "Ajustes aplicados"}
        </Badge>
        <Badge ok={v.ratingOk} testid={`verify-rating-${item.name}`}>5★ + Verde</Badge>
      </div>

      {open && v.hasBasics && (
        <div data-testid={`verify-detail-${item.name}`} className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {v.basics.map((b) => {
            const active = parseFloat(b.value) !== 0;
            return (
              <div key={b.key} className="rounded-md border border-zinc-800 bg-[#1c1c22] px-2 py-1.5">
                <span className="block text-[10px] text-zinc-500">{b.label}</span>
                <span className={`font-mono text-xs ${active ? "text-emerald-400" : "text-zinc-500"}`}>{b.value}</span>
              </div>
            );
          })}
          {v.whiteBalance && (
            <div className="rounded-md border border-zinc-800 bg-[#1c1c22] px-2 py-1.5">
              <span className="block text-[10px] text-zinc-500">Balance</span>
              <span className="font-mono text-xs text-zinc-300">{v.whiteBalance}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VerificationPanel({ report }) {
  if (!report?.length) return null;
  const okCount = report.filter((r) => r.verify.ok).length;
  const allOk = okCount === report.length;
  const Icon = allOk ? ShieldCheck : ShieldAlert;

  return (
    <section data-testid="verification-panel" className="animate-fade-up mt-6 rounded-xl border border-zinc-800 bg-[#141418] p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 ${allOk ? "bg-emerald-400/15 ring-emerald-400/40" : "bg-amber-400/15 ring-amber-400/40"}`}>
          <Icon className={`h-5 w-5 ${allOk ? "text-emerald-400" : "text-amber-400"}`} />
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold">Verificación de exportación</h3>
          <p data-testid="verification-summary" className="text-sm text-zinc-500">
            {okCount}/{report.length} archivos con básicas de la IA aplicadas y sin envoltura de preset (leído del propio archivo, sin Lightroom).
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {report.map((item) => <VerificationRow key={item.name} item={item} />)}
      </div>
    </section>
  );
}
