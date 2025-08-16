// Offline sales queue using IndexedDB with localStorage fallback
// Provides enqueue, stats, and a manual drain trigger via Service Worker background sync

type OfflineSaleRecord = {
  id: string;
  idempotencyKey: string;
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  payload: any;
  createdAt: number;
  attempts: number;
  nextAttemptAt?: number;
  lastError?: string | null;
};

const DB_NAME = 'chainsync_offline';
const STORE = 'offline_sales';

function generateRandomString(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function generateIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  } catch {}
  return `idemp_${Date.now()}_${generateRandomString()}`;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('nextAttemptAt', 'nextAttemptAt', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function idbAdd(record: OfflineSaleRecord): Promise<void> {
  const db = await openDb();
  if (!db) {
    // Fallback to localStorage array
    const raw = localStorage.getItem(STORE);
    const arr = raw ? JSON.parse(raw) as OfflineSaleRecord[] : [];
    arr.push(record);
    localStorage.setItem(STORE, JSON.stringify(arr));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function enqueueOfflineSale(params: { url: string; payload: any; idempotencyKey: string; headers?: Record<string, string> }): Promise<{ localId: string; idempotencyKey: string; }> {
  const localId = `local_${Date.now()}_${generateRandomString()}`;
  const record: OfflineSaleRecord = {
    id: localId,
    idempotencyKey: params.idempotencyKey,
    url: params.url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': params.idempotencyKey, ...(params.headers || {}) },
    payload: params.payload,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: Date.now(),
    lastError: null,
  };
  await idbAdd(record);

  // Ask SW to register a background sync if supported
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if ('sync' in reg) await reg.sync.register('background-sync');
      // Also ping SW to try immediate sync
      reg.active?.postMessage({ type: 'TRY_SYNC' });
    }
  } catch {}

  return { localId, idempotencyKey: params.idempotencyKey };
}

export async function getOfflineQueueCount(): Promise<number> {
  const db = await openDb();
  if (!db) {
    const raw = localStorage.getItem(STORE);
    const arr = raw ? JSON.parse(raw) as OfflineSaleRecord[] : [];
    return arr.length;
  }
  return await new Promise<number>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => resolve(0);
  });
}

export async function processQueueNow(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: 'TRY_SYNC' });
      if ('sync' in reg) await reg.sync.register('background-sync');
    }
  } catch {}
}


