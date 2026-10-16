// Serialized requests and bounded, visible recovery; no automatic provider switch.
let queue = Promise.resolve();
let nextAt = 0;
export function selectionError(err) {
  return String(err?.response?.data?.detail || err?.response?.data?.error || err?.message || "La comparación no pudo completarse");
}
export function waitSelection(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Selección pausada"));
    const stop = () => { clearTimeout(timer); reject(new Error("Selección pausada")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", stop); resolve(); }, ms);
    signal?.addEventListener("abort", stop, {once:true});
  });
}
export function requestSelection(fn, {signal, onWait} = {}) {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      await waitSelection(Math.max(0, nextAt - Date.now()), signal);
      try { nextAt = Date.now() + 6000; return await fn(); }
      catch (err) {
        if (signal?.aborted) throw err;
        const status = err?.response?.status;
        const msg = selectionError(err);
        const recoverable = status === 429 || [500,502,503].includes(status);
        if (!recoverable || /quota|credit|billing|insufficient|cuota|saldo/i.test(msg) || attempt >= 3) throw err;
        const retryHeader = Number(err?.response?.headers?.["retry-after"]);
        const delay = Math.min(240000, Math.max(Number.isFinite(retryHeader) ? retryHeader * 1000 : 0, status === 429 ? 60000 * 2**attempt : 5000 * (attempt + 1)));
        nextAt = Date.now() + delay;
        onWait?.({retry:attempt+1, retryAt:nextAt, message: "Proveedor ocupado. Reintento automático"});
      }
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
