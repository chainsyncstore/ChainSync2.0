const DB_NAME = "chainsync_sync_health";
const STORE_NAME = "health";
const DB_VERSION = 1;

export interface SyncHealthSnapshot {
  id?: number;
  capturedAt: number;
  sales: {
    total: number;
    last24h: number;
  } | null;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        store.createIndex("capturedAt", "capturedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function saveSyncHealthSnapshot(snapshot: Omit<SyncHealthSnapshot, "id">) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ ...snapshot });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getLatestSyncHealth(): Promise<SyncHealthSnapshot | null> {
  const db = await openDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("capturedAt");
    const req = index.openCursor(null, "prev");
    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null;
      resolve(cursor ? (cursor.value as SyncHealthSnapshot) : null);
    };
    req.onerror = () => resolve(null);
  });
}
