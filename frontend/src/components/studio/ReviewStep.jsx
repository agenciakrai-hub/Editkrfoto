import { useMemo, useState } from "react";
import { ArrowRight, Check, Layers, Users, User, UserX, AlertTriangle, UserCheck, Filter } from "lucide-react";
import Thumbnail from "@/components/studio/Thumbnail";

export default function ReviewStep({ initialPhotos, people = [], onContinue }) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [filter, setFilter] = useState("all");
  const [names, setNames] = useState({}); // { clusterId: label }

  const toggle = (id) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, selectedForEdit: !p.selectedForEdit } : p)));
  };

  const selectedCount = photos.filter((p) => p.selectedForEdit).length;
  const hasFaces = photos.some((p) => p.facesAnalyzed);

  const counts = useMemo(() => ({
    all: photos.length,
    withpeople: photos.filter((p) => p.facesAnalyzed && p.faceCount > 0).length,
    group: photos.filter((p) => p.isGroup).length,
    nopeople: photos.filter((p) => p.noPeople).length,
  }), [photos]);

  const nameOf = (id, i) => names[id] || `Persona ${i + 1}`;

  const matches = (p) => {
    if (filter === "all") return true;
    if (filter === "withpeople") return p.facesAnalyzed && p.faceCount > 0;
    if (filter === "group") return p.isGroup;
    if (filter === "nopeople") return p.noPeople;
    if (filter.startsWith("person:")) return (p.people || []).includes(Number(filter.slice(7)));
    return true;
  };
  const visible = photos.filter(matches);

  const FilterChip = ({ id, label, count, icon: Icon }) => (
    <button data-testid={`filter-${id}`} onClick={() => setFilter(id)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        filter === id ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 bg-[#1c1c22] text-zinc-300 hover:border-zinc-600"
      }`}>
      {Icon && <Icon className="h-3.5 w-3.5" />} {label} <span className="text-zinc-600">{count}</span>
    </button>
  );

  return (
    <section className="animate-fade-up" data-testid="review-step">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-800 bg-[#141418] p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Revisa la selección</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Toca cualquier foto para incluirla o excluirla de la cola de edición IA. Las verdes van a edición.
            <span className="mt-1 block text-xs text-zinc-600">
              <span className="text-amber-400">⚠ Dudas</span> = la IA no tiene una ganadora clara (decides tú) ·
              <span className="text-emerald-400"> Cara distinta</span> = misma ráfaga pero las caras cambiaron (foto diferente).
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-300" data-testid="review-count">
          {selectedCount} en cola de edición
        </div>
      </div>

      {hasFaces && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-[#141418] p-4" data-testid="review-filters">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500"><Filter className="h-3.5 w-3.5" /> Filtrar:</span>
            <FilterChip id="all" label="Todas" count={counts.all} />
            <FilterChip id="withpeople" label="Con personas" count={counts.withpeople} icon={User} />
            <FilterChip id="group" label="Grupos" count={counts.group} icon={Users} />
            <FilterChip id="nopeople" label="Sin personas" count={counts.nopeople} icon={UserX} />
          </div>

          {people.length > 0 && (
            <div className="mt-4 border-t border-zinc-800 pt-4">
              <p className="text-xs text-zinc-500">Protagonistas detectados · toca para filtrar, escribe para etiquetar (novia, novio…)</p>
              <div className="mt-3 flex flex-wrap gap-3" data-testid="people-panel">
                {people.map((person, i) => {
                  const active = filter === `person:${person.id}`;
                  return (
                    <div key={person.id} data-testid={`person-${person.id}`}
                      className={`flex items-center gap-2 rounded-xl border p-2 transition-colors ${active ? "border-emerald-400/60 bg-emerald-400/10" : "border-zinc-800 bg-[#1c1c22]"}`}>
                      <button data-testid={`person-filter-${person.id}`} onClick={() => setFilter(active ? "all" : `person:${person.id}`)}
                        className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                        {person.thumb ? <img src={person.thumb} alt={nameOf(person.id, i)} className="h-full w-full object-cover" /> : <User className="m-auto mt-3 h-5 w-5 text-zinc-600" />}
                      </button>
                      <div className="min-w-0">
                        <input data-testid={`person-name-${person.id}`} value={names[person.id] ?? ""} placeholder={`Persona ${i + 1}`}
                          onChange={(e) => setNames((prev) => ({ ...prev, [person.id]: e.target.value }))}
                          className="w-28 rounded-md border border-zinc-700 bg-[#101012] px-2 py-1 text-xs text-zinc-100 outline-none focus:border-emerald-400/60" />
                        <p className="mt-0.5 text-[10px] text-zinc-500">{person.count} fotos</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {visible.map((p) => (
          <button key={p.id} data-testid={`photo-${p.name}`} onClick={() => toggle(p.id)}
            className={`group relative overflow-hidden rounded-lg border text-left transition-all duration-200
              ${p.selectedForEdit ? "border-emerald-400/70 ring-2 ring-emerald-400/40" : "border-zinc-800 hover:border-zinc-600"}`}>
            <div className="relative aspect-[4/3] w-full bg-zinc-900">
              <Thumbnail file={p.file} fallback={p.thumb} alt={p.name} className="aspect-[4/3] w-full" dimmed={!p.selectedForEdit} />
              {p.selectedForEdit && (
                <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400 text-zinc-950 shadow">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              )}
              <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 backdrop-blur">
                <Layers className="h-3 w-3" /> R{p.burstId}
              </span>
              {p.facesAnalyzed && (
                <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 backdrop-blur" data-testid={`faces-${p.name}`}>
                  {p.noPeople ? <UserX className="h-3 w-3 text-zinc-400" /> : p.isGroup ? <Users className="h-3 w-3 text-sky-300" /> : <User className="h-3 w-3 text-zinc-200" />}
                  {p.noPeople ? "Sin personas" : p.faceCount}
                </span>
              )}
              <div className="absolute left-2 bottom-2 flex flex-col gap-1">
                {p.doubt && (
                  <span className="flex w-fit items-center gap-1 rounded-md bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950 shadow" data-testid={`doubt-${p.name}`}>
                    <AlertTriangle className="h-3 w-3" /> Dudas
                  </span>
                )}
                {p.faceDistinct && (
                  <span className="flex w-fit items-center gap-1 rounded-md bg-emerald-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950 shadow" data-testid={`distinct-${p.name}`}>
                    <UserCheck className="h-3 w-3" /> Cara distinta
                  </span>
                )}
              </div>
            </div>
            <div className="px-2 py-1.5">
              <p className="truncate font-mono text-[11px] text-zinc-400">{p.name}</p>
              <p className="text-[10px] text-zinc-600">calidad {p.score}</p>
            </div>
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="mt-6 text-sm text-zinc-500" data-testid="review-empty-filter">Ninguna foto coincide con este filtro.</p>
      )}

      <button data-testid="review-continue-btn" disabled={!selectedCount}
        onClick={() => onContinue(photos)}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.02] disabled:opacity-40">
        Continuar a perfil de cámara <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
