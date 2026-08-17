// Panel de comparación de dos estilos de fotógrafo (extraído de PhotographerStyles para reducir complejidad).
export default function StyleComparePanel({ readyProfiles, cmp, setCmp }) {
  const a = readyProfiles.find((p) => p.id === cmp[0]) || readyProfiles[0];
  const b = readyProfiles.find((p) => p.id === cmp[1]) || readyProfiles[1];
  const rows = [
    ["Balance de blancos", a.color_profile?.white_balance_tendency, b.color_profile?.white_balance_tendency],
    ["Contraste", a.color_profile?.contrast, b.color_profile?.contrast],
    ["Saturación", a.color_profile?.saturation, b.color_profile?.saturation],
    ["Tono de piel", a.color_profile?.skin_tone, b.color_profile?.skin_tone],
    ["Rango tonal", a.color_profile?.tonal_range, b.color_profile?.tonal_range],
    ["Recorte", a.edit_profile?.crop_style, b.edit_profile?.crop_style],
    ["Luz / sombra", a.edit_profile?.light_shadow_treatment, b.edit_profile?.light_shadow_treatment],
    ["Nitidez", a.edit_profile?.sharpening_look, b.edit_profile?.sharpening_look],
    ["Consistencia", a.edit_profile?.consistency, b.edit_profile?.consistency],
    ["Confianza", a.confidence != null ? `${Math.round(a.confidence)}%` : "-", b.confidence != null ? `${Math.round(b.confidence)}%` : "-"],
  ];
  const Sel = ({ i }) => (
    <select data-testid={`compare-select-${i}`} value={cmp[i]} onChange={(e) => setCmp((c) => (i === 0 ? [e.target.value, c[1]] : [c[0], e.target.value]))}
      className="w-full rounded-md border border-zinc-700 bg-[#101012] px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-400/60">
      {readyProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
  return (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-[#101012] p-4" data-testid="compare-panel">
      <div className="grid grid-cols-2 gap-3">
        {[a, b].map((p, i) => (
          <div key={`${p.id}-${i}`}>
            <Sel i={i} />
            <img src={p.representative_image} alt={p.name} className="mt-2 aspect-[3/2] w-full rounded-lg object-cover" />
          </div>
        ))}
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-zinc-800">
        {rows.map(([label, va, vb], idx) => (
          <div key={label} className={`grid grid-cols-[1fr_1.4fr_1.4fr] gap-2 px-3 py-2 text-[11px] ${idx % 2 ? "bg-[#141418]" : "bg-[#1c1c22]"}`}>
            <span className="text-zinc-500">{label}</span>
            <span className="text-zinc-300">{va || "—"}</span>
            <span className="text-zinc-300">{vb || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
