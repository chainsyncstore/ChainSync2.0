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

type SyncCapableRegistration = ServiceWorkerRegistration & {
  sync?: {
    register?: unknown;
  };
};

function generateRandomString(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (error) {
    console.warn('Falling back to Math.random for id generation', error);
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function generateIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  } catch (error) {
    console.warn('Falling back to manual idempotency key generation', error);
  }
  return `idemp_${Date.now()}_${generateRandomString()}`;
}

export function validateSalePayload(payload: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Missing payload'] };
  }
  if (!payload.storeId || typeof payload.storeId !== 'string') errors.push('Invalid storeId');
  if (!Array.isArray(payload.items) || payload.items.length === 0) errors.push('No items');
  (payload.items || []).forEach((it: any, idx: number) => {
    if (!it.productId) errors.push(`Item ${idx + 1}: missing productId`);
    if (!(Number.isFinite(Number(it.quantity)) && Number(it.quantity) > 0)) errors.push(`Item ${idx + 1}: invalid quantity`);
    const unitPriceNum = Number(it.unitPrice);
    if (!(Number.isFinite(unitPriceNum) && unitPriceNum >= 0)) errors.push(`Item ${idx + 1}: invalid unitPrice`);
    const lineTotalNum = Number(it.lineTotal);
    if (!(Number.isFinite(lineTotalNum) && lineTotalNum >= 0)) errors.push(`Item ${idx + 1}: invalid lineTotal`);
  });
  return { valid: errors.length === 0, errors };
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
      const regWithSync = reg as SyncCapableRegistration;
      const registerBackgroundSync = regWithSync.sync?.register;
      if (typeof registerBackgroundSync === 'function') {
        await registerBackgroundSync.call(regWithSync.sync, 'background-sync');
      }
      // Also ping SW to try immediate sync
      reg.active?.postMessage({ type: 'TRY_SYNC' });
    }
  } catch (error) {
    console.warn('Service worker sync registration failed', error);
  }

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
      const regWithSync = reg as SyncCapableRegistration;
      const registerBackgroundSync = regWithSync.sync?.register;
      if (typeof registerBackgroundSync === 'function') {
        await registerBackgroundSync.call(regWithSync.sync, 'background-sync');
      }
    }
  } catch (error) {
    console.warn('Manual queue processing failed to notify service worker', error);
  }
}

export async function listQueuedSales(): Promise<OfflineSaleRecord[]> {
  const db = await openDb();
  if (!db) {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as OfflineSaleRecord[]) : [];
  }
  return await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

export async function deleteQueuedSale(id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    const raw = localStorage.getItem(STORE);
    const arr = raw ? (JSON.parse(raw) as OfflineSaleRecord[]) : [];
    const next = arr.filter((r) => r.id !== id);
    localStorage.setItem(STORE, JSON.stringify(next));
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function expediteQueuedSale(id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    const raw = localStorage.getItem(STORE);
    const arr = raw ? (JSON.parse(raw) as OfflineSaleRecord[]) : [];
    const idx = arr.findIndex((r) => r.id === id);
    if (idx >= 0) {
      arr[idx].nextAttemptAt = Date.now();
      localStorage.setItem(STORE, JSON.stringify(arr));
    }
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const rec = getReq.result as OfflineSaleRecord | undefined;
      if (rec) {
        rec.nextAttemptAt = Date.now();
        store.put(rec);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getQueuedSale(id: string): Promise<OfflineSaleRecord | null> {
  const db = await openDb();
  if (!db) {
    const raw = localStorage.getItem(STORE);
    const arr = raw ? (JSON.parse(raw) as OfflineSaleRecord[]) : [];
    return arr.find((r) => r.id === id) || null;
  }
  return await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export async function getEscalatedCount(threshold: number = 5): Promise<number> {
  const db = await openDb();
  if (!db) {
    const raw = localStorage.getItem(STORE);
    const arr = raw ? (JSON.parse(raw) as OfflineSaleRecord[]) : [];
    return arr.filter((r) => (r.attempts || 0) >= threshold).length;
  }
  return await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const s = tx.objectStore(STORE);
    const cursorReq = s.openCursor();
    let count = 0;
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result as IDBCursorWithValue | null;
      if (!cur) return resolve(count);
      const row = cur.value as OfflineSaleRecord;
      if ((row.attempts || 0) >= threshold) count++;
      cur.continue();
    };
    cursorReq.onerror = () => resolve(count);
  });
}

export async function updateQueuedSalePayload(id: string, newPayload: any): Promise<void> {
  const db = await openDb();
  if (!db) {
    const raw = localStorage.getItem(STORE);
    const arr = raw ? (JSON.parse(raw) as OfflineSaleRecord[]) : [];
    const idx = arr.findIndex((r) => r.id === id);
    if (idx >= 0) {
      arr[idx].payload = newPayload;
      arr[idx].attempts = 0;
      arr[idx].nextAttemptAt = Date.now();
      localStorage.setItem(STORE, JSON.stringify(arr));
    }
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const rec = getReq.result as OfflineSaleRecord | undefined;
      if (rec) {
        rec.payload = newPayload;
        rec.attempts = 0;
        rec.nextAttemptAt = Date.now();
        store.put(rec);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export type { OfflineSaleRecord };


