// Adaptador local-first del SDK de entidades que usaba EditFlow Pro (Base44).
// Implementa la MISMA superficie de API (base44.entities.X.{list,get,create,update,
// delete,filter,bulkCreate,bulkUpdate,deleteMany}) pero persiste en IndexedDB del
// navegador: el módulo Álbum guarda el catálogo de fotos y los lienzos en el equipo
// (coherente con las previews, que ya son device-local). Sin backend, sin cuentas:
// los álbumes son portables mediante el archivo .editflowalbum (⌘+S).
const DB_NAME = "rawai-album-entities";
const STORE = "records";
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const os = d.createObjectStore(STORE, { keyPath: "id" });
          os.createIndex("_entity", "_entity", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const os = t.objectStore(STORE);
    let out;
    const r = fn(os);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const nowIso = () => new Date().toISOString();
const genId = (entity) => `${entity.toLowerCase()}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function sortBy(list, order) {
  if (!order) return list;
  const desc = order.startsWith("-");
  const key = desc ? order.slice(1) : order;
  return [...list].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return desc ? 1 : -1;
    if (bv == null) return desc ? -1 : 1;
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
}

function matches(rec, query) {
  if (!query) return true;
  return Object.entries(query).every(([k, v]) => rec[k] === v);
}

async function allOf(entity) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, "readonly");
    const idx = t.objectStore(STORE).index("_entity");
    const req = idx.getAll(IDBKeyRange.only(entity));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

class Entity {
  constructor(name) { this.name = name; }

  async list(order = "-updated_date", limit = 1000) {
    const all = await allOf(this.name);
    return sortBy(all, order).slice(0, limit);
  }

  async get(id) {
    const rec = await run("readonly", (os) => os.get(id));
    if (!rec) throw new Error("Registro no encontrado");
    return rec;
  }

  async filter(query = {}, order = null, limit = 5000) {
    const all = await allOf(this.name);
    const filtered = all.filter((r) => matches(r, query));
    return sortBy(filtered, order).slice(0, limit);
  }

  async create(data = {}) {
    const rec = { ...data, id: data.id || genId(this.name), _entity: this.name, created_date: nowIso(), updated_date: nowIso() };
    await run("readwrite", (os) => os.put(rec));
    return rec;
  }

  async bulkCreate(list = []) {
    const recs = list.map((data) => ({ ...data, id: data.id || genId(this.name), _entity: this.name, created_date: nowIso(), updated_date: nowIso() }));
    await run("readwrite", (os) => { recs.forEach((r) => os.put(r)); return null; });
    return recs;
  }

  async update(id, patch = {}) {
    const cur = await run("readonly", (os) => os.get(id));
    if (!cur) throw new Error("Registro no encontrado");
    const next = { ...cur, ...patch, id, _entity: this.name, updated_date: nowIso() };
    await run("readwrite", (os) => os.put(next));
    return next;
  }

  async bulkUpdate(list = []) {
    const d = await db();
    const out = [];
    await new Promise((resolve, reject) => {
      const t = d.transaction(STORE, "readwrite");
      const os = t.objectStore(STORE);
      list.forEach((item) => {
        const { id, ...patch } = item;
        const g = os.get(id);
        g.onsuccess = () => {
          const cur = g.result;
          if (cur) { const next = { ...cur, ...patch, id, _entity: this.name, updated_date: nowIso() }; os.put(next); out.push(next); }
        };
      });
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    return out;
  }

  async delete(id) {
    await run("readwrite", (os) => os.delete(id));
    return { ok: true };
  }

  async deleteMany(query = {}) {
    const all = await allOf(this.name);
    const ids = all.filter((r) => matches(r, query)).map((r) => r.id);
    await run("readwrite", (os) => { ids.forEach((id) => os.delete(id)); return null; });
    return { ok: true, deleted: ids.length };
  }
}

const cache = new Map();
const entities = new Proxy({}, {
  get(_t, name) {
    if (!cache.has(name)) cache.set(name, new Entity(String(name)));
    return cache.get(name);
  },
});

// Las funciones de servidor de Base44 (p. ej. "album-engine" de la Selección IA)
// no existen aquí. La maquetación es 100% determinista y local; la mejora visual
// por IA es opcional y su ausencia se gestiona con try/catch en el store.
const functions = {
  async invoke() { throw new Error("Función de servidor no disponible en modo local."); },
};

export const base44 = { entities, functions };
export default base44;
