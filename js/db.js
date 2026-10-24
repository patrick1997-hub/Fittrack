// Lokale Datenbank (IndexedDB). Alle Daten bleiben auf dem Gerät.
const DB_NAME = 'fittrack';
const VERSION = 1;
export const STORES = ['exercises', 'plans', 'sessions', 'foods', 'logs', 'weights', 'settings'];

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const db = {
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)).then(() => value),
  del: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),
};

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export async function getSetting(key, fallback = null) {
  const row = await db.get('settings', key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  return db.put('settings', { key, value });
}

export async function exportAll() {
  const data = { app: 'fittrack', version: VERSION, exportedAt: new Date().toISOString() };
  for (const name of STORES) {
    data[name] = await db.all(name);
  }
  // Der API-Schlüssel gehört nicht in ein Backup, das man weitergibt.
  data.settings = data.settings.filter((row) => row.key !== 'apiKey');
  return data;
}

export async function importAll(data) {
  if (!data || data.app !== 'fittrack') throw new Error('Keine FitTrack-Sicherung');
  const apiKey = await getSetting('apiKey');
  for (const name of STORES) {
    if (!Array.isArray(data[name])) continue;
    await db.clear(name);
    for (const row of data[name]) await db.put(name, row);
  }
  if (apiKey) await setSetting('apiKey', apiKey);
}
