import { useState } from "react";
import { ShieldCheck, ShieldAlert, ChevronDown, Check, Minus, X, AlertTriangle, RefreshCw, Eye, Cpu } from "lucide-react";
import BeforeAfterMini from "@/components/studio/BeforeAfterMini";

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
  const [preview, setPreview] = useState(false);
  const v = item.verify;
  const kind = item.kind === "dng" ? "DNG (incrustado)" : "Sidecar .xmp";
  const failed = !v.ok;

  return (
    <div data-testid={`verify-row-${item.name}`}
      className={`rounded-lg border p-3 ${failed ? "border-rose-500/50 bg-rose-500/[0.05]" : "border-zinc-800 bg-[#101012]"}`}>
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-zinc-200">{item.name}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-600">{kind}</p>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <button data-testid={`before-after-toggle-${item.name}`} onClick={() => setPreview((p) => !p)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800">
          <Eye className="h-3 w-3" /> {preview ? "Ocultar" : "Antes/Después"}
        </button>
      </div>

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

      {preview && <BeforeAfterMini file={item.file} basics={v.basics} />}

      {open && item.audit && (
        <div data-testid={`verify-audit-${item.name}`} className="mt-3 rounded-md border border-indigo-500/25 bg-indigo-500/[0.06] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
            <Cpu className="h-3.5 w-3.5" /> Auditoría del motor IA
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {[
              ["Exposición", item.audit.exposureClassification],
              ["Escena/Ambiente", item.audit.ambience],
              ["Sujeto (luma)", item.audit.subjectLuma ?? "—"],
              ["Medición", item.audit.meter ?? "—"],
              ["Peso caras", item.audit.faceWeight ?? 0],
              ["WB (fuente)", item.audit.wbSource],
              ["Confianza edición", item.audit.editingConfidence ?? "—"],
              ["Confianza WB", item.audit.whiteBalanceConfidence ?? "—"],
            ].map(([label, val]) => (
              <div key={label} className="rounded bg-[#16161c] px-2 py-1.5">
                <span className="block text-[10px] text-zinc-500">{label}</span>
                <span className="font-mono text-xs text-indigo-200">{String(val)}</span>
              </div>
            ))}
          </div>
          {item.audit.reasoningSummary && (
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{item.audit.reasoningSummary}</p>
          )}
        </div>
      )}

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

export default function VerificationPanel({ report, onRetry, retrying }) {
  if (!report?.length) return null;
  const failing = report.filter((r) => !r.verify.ok);
  const okCount = report.length - failing.length;
  const allOk = failing.length === 0;
  const Icon = allOk ? ShieldCheck : ShieldAlert;

  return (
    <section data-testid="verification-panel" className="animate-fade-up mt-6 rounded-xl border border-zinc-800 bg-[#141418] p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 ${allOk ? "bg-emerald-400/15 ring-emerald-400/40" : "bg-rose-500/15 ring-rose-500/40"}`}>
          <Icon className={`h-5 w-5 ${allOk ? "text-emerald-400" : "text-rose-400"}`} />
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold">Verificación de exportación</h3>
          <p data-testid="verification-summary" className="text-sm text-zinc-500">
            {okCount}/{report.length} archivos con básicas de la IA aplicadas y sin envoltura de preset (leído del propio archivo, sin Lightroom).
          </p>
        </div>
      </div>

      {!allOk && (
        <div data-testid="verification-alert" className="mt-4 flex flex-col gap-3 rounded-lg border border-rose-500/40 bg-rose-500/[0.08] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            <div className="text-sm">
              <p className="font-medium text-rose-200">{failing.length} archivo(s) salieron sin básicas de la IA o como preset-template.</p>
              <p className="mt-0.5 text-[13px] text-rose-300/80">
                Lightroom no aplicaría los ajustes en: <span className="font-mono">{failing.slice(0, 4).map((f) => f.name).join(", ")}{failing.length > 4 ? "…" : ""}</span>. Reintenta la exportación.
              </p>
            </div>
          </div>
          {onRetry && (
            <button data-testid="verification-retry-btn" onClick={onRetry} disabled={retrying}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} /> {retrying ? "Reintentando…" : "Reintentar exportación"}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-2">
        {report.map((item) => <VerificationRow key={item.name} item={item} />)}
      </div>
    </section>
  );
}
