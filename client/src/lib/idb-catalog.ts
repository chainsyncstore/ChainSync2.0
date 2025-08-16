// IndexedDB catalog for offline product/inventory/customer data
type ProductRow = { id: string; name: string; barcode?: string; price: string };
type InventoryRow = { storeId: string; productId: string; quantity: number };
type CustomerRow = { id: string; phone: string; name?: string };

const DB_NAME = 'chainsync_catalog';
const VERSION = 1;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('products')) {
        const s = db.createObjectStore('products', { keyPath: 'id' });
        s.createIndex('name', 'name', { unique: false });
        s.createIndex('barcode', 'barcode', { unique: false });
      }
      if (!db.objectStoreNames.contains('inventory')) {
        const s = db.createObjectStore('inventory', { keyPath: ['storeId','productId'] });
        s.createIndex('storeId', 'storeId', { unique: false });
      }
      if (!db.objectStoreNames.contains('customers')) {
        const s = db.createObjectStore('customers', { keyPath: 'id' });
        s.createIndex('phone', 'phone', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function putProducts(rows: ProductRow[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('products','readwrite');
    const s = tx.objectStore('products');
    rows.forEach((r) => s.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function searchProductsLocally(q: string, max = 20): Promise<ProductRow[]> {
  const db = await openDb();
  if (!db) return [];
  const normalized = q.toLowerCase();
  return await new Promise((resolve) => {
    const tx = db.transaction('products','readonly');
    const s = tx.objectStore('products');
    const out: ProductRow[] = [];
    const cursorReq = s.openCursor();
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result as IDBCursorWithValue | null;
      if (!cur) return resolve(out);
      const row = cur.value as ProductRow;
      if (
        row.name?.toLowerCase().includes(normalized) ||
        (row.barcode && row.barcode.includes(q))
      ) {
        out.push(row);
        if (out.length >= max) return resolve(out);
      }
      cur.continue();
    };
    cursorReq.onerror = () => resolve(out);
  });
}

export async function getProductByBarcodeLocally(barcode: string): Promise<ProductRow | null> {
  const db = await openDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    const tx = db.transaction('products','readonly');
    const idx = tx.objectStore('products').index('barcode');
    const req = idx.get(barcode);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export type { ProductRow, InventoryRow, CustomerRow };


