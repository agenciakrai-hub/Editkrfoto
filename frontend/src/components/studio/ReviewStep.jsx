import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Star, Plus, X, Sparkles, Hand, AlertTriangle, Layers, Check, Eye, Wand2, Loader2 } from "lucide-react";
import Thumbnail from "@/components/studio/Thumbnail";
import PhotoViewer from "@/components/studio/PhotoViewer";
import { WARNING_LABELS } from "@/lib/burstDecision";
import { thumbBase64 } from "@/lib/rawThumb";
import api from "@/lib/api";
import { applyComparison, compareWholeBurst, completedComparison } from "@/lib/burstComparison";
import { requestSelection, selectionError } from "@/lib/selectionRequest";

function Stars() {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />)}
    </span>
  );
}

export default function ReviewStep({ initialPhotos, people = [], onChange, onContinue }) {
  const [photos, setPhotos] = useState(initialPhotos);
  const photosRef = useRef(initialPhotos);
  const controllerRef = useRef(null);
  const busyRef = useRef(false);
  const [aiProgress, setAiProgress] = useState(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const savePhotos = async (next) => {
    const previous = photosRef.current;
    photosRef.current = next;
    setPhotos(next);
    try { await onChange?.(next); }
    catch (err) {
      if (photosRef.current === next) { photosRef.current = previous; setPhotos(previous); }
      throw err;
    }
  };
  const [tab, setTab] = useState("selected"); // selected | unselected
  const [viewer, setViewer] = useState(null); // { index }

  const selected = useMemo(() => photos.filter((p) => p.selectedForEdit), [photos]);
  const unselected = useMemo(() => photos.filter((p) => !p.selectedForEdit), [photos]);
  const warnings = useMemo(() => photos.filter((p) => p.selectedForEdit && p.warning), [photos]);
  const list = tab === "selected" ? selected : (tab === "warnings" ? warnings : unselected);

  // Ráfagas: agrupa por secuencia (burstId) y deja solo las que tienen >1 toma para comparar.
  const bursts = useMemo(() => {
    const groups = new Map();
    for (const p of photos) {
      const k = p.burstId ?? p.name;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    return Array.from(groups.entries())
      .filter(([, g]) => g.length > 1)
      .map(([k, g]) => ({
        id: k,
        photos: [...g].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })),
      }))
      .sort((a, b) => Number(a.id) - Number(b.id));
  }, [photos]);

  const pendingBursts = bursts.filter(b => !b.photos.some(p => p.source === "manual") && !completedComparison(b.photos));
  const applyToggle = async (id) => {
    if (busyRef.current) return;
    const next = photosRef.current.map(p => p.id === id ? {...p, selectedForEdit: !p.selectedForEdit, source: "manual", selectionComparison: null} : p);
    try { await savePhotos(next); } catch { toast.error("No se pudo guardar la decisión. Inténtalo de nuevo."); }
  };
  const chooseExclusive = async (photo, source = "manual") => {
    if (busyRef.current) return;
    const bk = photo.burstId ?? photo.name;
    const next = photosRef.current.map(p => (p.burstId ?? p.name) === bk ? {...p, selectedForEdit:p.id === photo.id, isBest:p.id === photo.id, source, selectionComparison:null} : p);
    try { await savePhotos(next); } catch { toast.error("No se pudo guardar la decisión"); }
  };
  const [aiBusy, setAiBusy] = useState(null);
  const [aiReason, setAiReason] = useState({});
  const compareBurst = async (b, signal) => {
    const alive = () => { if (signal.aborted) throw new Error("Selección pausada"); };
    const result = await compareWholeBurst(b.photos, async batch => {
      const candidates = [];
      for (const p of batch) {
        alive();
        const img = await thumbBase64(p.file || p.previewFile, 800);
        if (!img) throw new Error("Falta una vista previa: vuelve a elegir la carpeta original");
        await new Promise((resolve, reject) => {
          const image = new Image();
          const timer = setTimeout(() => reject(new Error("No se pudo decodificar la vista previa")), 10000);
          image.onload = () => { clearTimeout(timer); image.width > 10 && image.height > 10 ? resolve() : reject(new Error("Vista previa demasiado pequeña")); };
          image.onerror = () => { clearTimeout(timer); reject(new Error("Vista previa no válida")); };
          image.src = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
        });
        candidates.push({filename: `candidate_${candidates.length + 1}`, image_base64: img});
      }
      const response = await requestSelection(() => api.post("/ai/select-burst", {candidates, context:"reportaje de boda"}, {signal, timeout:105000}), {
        signal, onWait: wait => setAiProgress(p => ({...p, waiting: `${wait.message}. ${new Date(wait.retryAt).toLocaleTimeString()}`}))
      });
      setAiProgress(p => ({...p, waiting:null}));
      return {winnerId:batch[candidates.findIndex(c => c.filename === response.data.best_filename)]?.id, reason:response.data.reason};
    }, alive);
    alive();
    await savePhotos(applyComparison(photosRef.current, b.photos, result));
    setAiReason(m => ({...m, [b.id]:{filename:result.winner.name, reason:result.comparison.reason}}));
  };
  const runComparisons = async (targets, all) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setAiBusy(all ? "all" : targets[0]?.id);
    setAiProgress({done:0,total:targets.length});
    let done = 0;
    const execute = async () => {
      for (const b of targets) {
        if (controller.signal.aborted) throw new Error("Selección pausada");
        await compareBurst(b, controller.signal);
        done++;
        setAiProgress({done,total:targets.length});
      }
    };
    try {
      if (navigator.locks) await navigator.locks.request("editflow:selection", {ifAvailable:true}, async lock => {
        if (!lock) throw new Error("Ya hay una selección activa en otra pestaña");
        await execute();
      }); else await execute();
      toast.success(`${done} ráfagas comparadas y guardadas`);
    } catch (err) {
      toast.error(`${selectionError(err)}. ${done} ráfagas guardadas; puedes continuar las pendientes.`);
    } finally {
      setAiBusy(null);
      busyRef.current = false;
      controllerRef.current = null;
      setAiProgress(null);
    }
  };
  const refineBurst = b => runComparisons([b], false);
  const refineAll = () => runComparisons(pendingBursts, true);
  const openViewer = (photo) => {
    setViewer({ id: photo.id });
  };

  const Card = ({ p }) => (
    <div data-testid={`review-card-${p.name}`}
      className={`group overflow-hidden rounded-xl border transition-all ${p.selectedForEdit ? "border-emerald-400/60 bg-emerald-400/[0.04]" : "border-zinc-800 bg-[#141418]"}`}>
      <button data-testid={`open-viewer-${p.name}`} onClick={() => openViewer(p)} className="block w-full">
        <div className="relative aspect-[3/2] w-full bg-zinc-900">
          <Thumbnail file={p.file} fallback={p.thumb} alt={p.name} className="aspect-[3/2] w-full" dimmed={!p.selectedForEdit} />
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300 backdrop-blur">
            {p.source === "manual" ? <><Hand className="h-3 w-3" /> Manual</> : <><Sparkles className="h-3 w-3 text-emerald-400" /> {p.selectionComparison ? "IA comparativa" : "Análisis local"}</>}
          </span>
          {p.selectedForEdit && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-emerald-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950" data-testid={`stars-${p.name}`}>
              <Stars /> <span className="h-2.5 w-2.5 rounded-full bg-emerald-700" title="Verde" />
            </span>
          )}
          {p.selectedForEdit && p.warning && (
            <span className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950" data-testid={`warning-${p.name}`}>
              <AlertTriangle className="h-3 w-3" /> Revisar
            </span>
          )}
        </div>
      </button>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] text-zinc-400">{p.name}</p>
          <p className={`text-[11px] font-medium ${p.selectedForEdit ? (p.warning ? "text-amber-400" : "text-emerald-400") : "text-zinc-500"}`}>
            {p.selectedForEdit ? (p.warning ? "Seleccionada · revisar" : "Seleccionada · 5★ + verde") : "No seleccionada"}
          </p>
          {p.selectedForEdit && p.warning && p.warningTypes?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1" data-testid={`warning-types-${p.name}`}>
              {p.warningTypes.map((t) => (
                <span key={t} className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                  {WARNING_LABELS[t] || t}
                </span>
              ))}
            </div>
          )}
          {p.selectedForEdit && p.reviewNotes?.length > 0 && (
            <p className="mt-1 text-[10px] leading-snug text-amber-200/80" data-testid={`review-note-${p.name}`}>{p.reviewNotes.join(" ")}</p>
          )}
        </div>
        {p.selectedForEdit ? (
          <button data-testid={`remove-${p.name}`} disabled={!!aiBusy} onClick={() => applyToggle(p.id)} title="Quitar de la selección"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-500/40 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/10"><X className="h-3 w-3" /> Quitar</button>
        ) : (
          <button data-testid={`add-${p.name}`} disabled={!!aiBusy} onClick={() => applyToggle(p.id)} title="Añadir a la selección"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-400 px-2 py-1 text-[11px] font-semibold text-zinc-950 hover:scale-[1.03]"><Plus className="h-3 w-3" /> Añadir</button>
        )}
      </div>
    </div>
  );

  return (
    <section className="animate-fade-up" data-testid="review-step">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-800 bg-[#141418] p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Revisión y selección final</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            La IA propone; tú decides. Las <span className="text-emerald-400">seleccionadas</span> reciben 5★ + etiqueta verde
            y son las que se exportan al XMP. Las descartadas se conservan por si quieres recuperarlas.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2" data-testid="review-tabs">
        <button data-testid="tab-selected" onClick={() => setTab("selected")}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${tab === "selected" ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"}`}>
          Seleccionadas ({selected.length})
        </button>
        <button data-testid="tab-unselected" onClick={() => setTab("unselected")}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${tab === "unselected" ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"}`}>
          No seleccionadas ({unselected.length})
        </button>
        <button data-testid="tab-warnings" onClick={() => setTab("warnings")}
          className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${tab === "warnings" ? "border-amber-400/50 bg-amber-400/10 text-amber-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"}`}>
          <AlertTriangle className="h-3.5 w-3.5" /> Con advertencia ({warnings.length})
        </button>
        {bursts.length > 0 && (
          <button data-testid="tab-bursts" onClick={() => setTab("bursts")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${tab === "bursts" ? "border-sky-400/50 bg-sky-400/10 text-sky-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"}`}>
            <Layers className="h-3.5 w-3.5" /> Por ráfaga ({bursts.length})
          </button>
        )}
      </div>

      {tab === "bursts" ? (
        <div className="mt-4 space-y-4" data-testid="bursts-view">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-500">
              Compara las tomas de cada secuencia y elige la definitiva con un clic, o deja que la IA la elija por ti.
            </p>
            <button data-testid="ai-refine-all-btn" onClick={refineAll} disabled={!!aiBusy || !pendingBursts.length}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-sky-500 px-4 py-1.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50">
              {aiBusy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {pendingBursts.length === bursts.length ? "Comparar ráfagas con IA" : `Continuar pendientes (${pendingBursts.length})`}
            </button>
          </div>
          {aiBusy && <div role="status" className="rounded-lg border border-sky-400/30 p-3 text-sm">
            {aiProgress?.done || 0} / {aiProgress?.total || 0} ráfagas guardadas. {aiProgress?.waiting || "Comparando todas las candidatas; una ganadora por ráfaga."}
            <button className="ml-3 underline" onClick={() => controllerRef.current?.abort()}>Pausar</button>
          </div>}
          {bursts.map((b, bi) => (
            <div key={b.id} data-testid={`burst-${b.id}`} className="rounded-xl border border-zinc-800 bg-[#141418] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                  Secuencia {bi + 1} · {b.photos.length} tomas
                </p>
                <button data-testid={`ai-refine-${b.id}`} onClick={() => refineBurst(b)} disabled={!!aiBusy}
                  className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-200 hover:bg-violet-400/20 disabled:opacity-50">
                  {aiBusy === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Elegir con IA
                </button>
              </div>
              {aiReason[b.id] && (
                <p className="mb-3 flex items-start gap-2 rounded-lg border border-violet-400/20 bg-violet-400/5 px-3 py-2 text-xs text-violet-200" data-testid={`ai-reason-${b.id}`}>
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span><b>{aiReason[b.id].filename}</b> — {aiReason[b.id].reason}</span>
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {b.photos.map((p) => (
                  <button key={p.id} data-testid={`burst-pick-${p.name}`} disabled={!!aiBusy} onClick={() => chooseExclusive(p)}
                    className={`group overflow-hidden rounded-lg border text-left transition-all ${p.selectedForEdit ? "border-emerald-400 ring-1 ring-emerald-400/50" : "border-zinc-800 hover:border-zinc-600"}`}>
                    <div className="relative aspect-[3/2] w-full">
                      <Thumbnail file={p.file} fallback={p.thumb} alt={p.name} className="aspect-[3/2] w-full" dimmed={!p.selectedForEdit} />
                      {p.selectedForEdit ? (
                        <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950" data-testid={`burst-chosen-${p.name}`}>
                          <Check className="h-3 w-3" /> Elegida
                        </span>
                      ) : (
                        <span className="absolute right-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                          Elegir esta
                        </span>
                      )}
                      {p.warning && (
                        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
                          <AlertTriangle className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                      <span className="truncate font-mono text-[10px] text-zinc-400">{p.name}</span>
                      {p.audit && (
                        <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-zinc-500">
                          <span className="inline-flex items-center gap-0.5" title="Nitidez de cara">
                            <Sparkles className="h-2.5 w-2.5 text-sky-400" />{p.audit.sharpnessScore ?? "–"}
                          </span>
                          <span className="inline-flex items-center gap-0.5" title="Ojos">
                            <Eye className="h-2.5 w-2.5 text-emerald-400" />{p.audit.eyesScore ?? "–"}
                          </span>
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => <Card key={p.id} p={p} />)}
      </div>
      {list.length === 0 && (
        <p className="mt-6 text-sm text-zinc-500" data-testid="review-empty">
          {tab === "selected" ? "No hay fotos en la selección. Añade alguna desde 'No seleccionadas'."
            : tab === "warnings" ? "Ninguna selección tiene advertencias. ¡Todo limpio!"
            : "No hay fotos descartadas."}
        </p>
      )}
        </>
      )}

      <button data-testid="review-continue-btn" disabled={!selected.length || !!aiBusy} onClick={() => onContinue(photos)}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40">
        Continuar con {selected.length} seleccionadas <ArrowRight className="h-4 w-4" />
      </button>

      {viewer && (
        <PhotoViewer
          list={list}
          index={Math.max(0, list.findIndex((p) => p.id === viewer.id))}
          onClose={() => setViewer(null)}
          onNav={(d) => setViewer((v) => {
            const cur = list.findIndex((p) => p.id === v.id);
            const ni = Math.min(list.length - 1, Math.max(0, cur + d));
            return { ...v, id: list[ni]?.id ?? v.id };
          })}
          onToggle={(id) => {
            const next = applyToggle(id);
            // tras togglear, la foto sale de la lista actual: fijar el visor en la posición equivalente
            const newList = tab === "selected" ? next.filter((p) => p.selectedForEdit) : next.filter((p) => !p.selectedForEdit);
            if (!newList.length) { setViewer(null); return; }
            setViewer((v) => ({ ...v, id: newList[Math.min(newList.length - 1, Math.max(0, list.findIndex((p) => p.id === id)))].id }));
          }}
        />
      )}
    </section>
  );
}
