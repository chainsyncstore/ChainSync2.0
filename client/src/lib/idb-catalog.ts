// IndexedDB catalog for offline product/inventory/customer data
type ProductRow = { id: string; name: string; barcode?: string; price: string };
type InventoryRow = { storeId: string; productId: string; quantity: number };
type CustomerRow = { id: string; phone: string; name?: string; loyaltyPoints?: number; updatedAt?: number };
type StoreRow = { id: string; name?: string; currency?: string; taxRate?: number; updatedAt: number };
type CatalogSyncMeta = { storeId: string; lastSyncAt: number; productCount: number };

// Cached sale item for offline return/swap lookup
export type CachedSaleItem = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  name: string | null;
  quantityReturned?: number; // track partial returns offline
};

// Cached sale for offline return/swap lookup
export type CachedSale = {
  id: string;
  receiptNumber?: string;
  idempotencyKey?: string;
  storeId: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  status?: 'COMPLETED' | 'RETURNED' | 'PENDING_SYNC';
  items: CachedSaleItem[];
  occurredAt: string;
  isOffline: boolean; // true if created while offline (not yet synced)
  syncedAt: string | null; // when this sale was synced to server
  serverId?: string; // actual server ID after sync (if different from local ID)
};

// Offline return/swap record for queueing
export type OfflineReturnRecord = {
  id: string;
  idempotencyKey?: string;
  saleId: string; // the cached sale ID
  storeId: string;
  type: 'RETURN' | 'SWAP';
  items: Array<{
    saleItemId: string;
    productId: string;
    quantity: number;
    restockAction: 'RESTOCK' | 'DISCARD';
    refundType: 'NONE' | 'FULL' | 'PARTIAL';
    refundAmount: number;
  }>;
  swapProducts?: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
  swapData?: {
    newProducts: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      name: string;
    }>;
    paymentMethod: string;
    totalDifference: number;
  };
  reason?: string;
  notes?: string;
  createdAt: string;
  potentialLoss: number; // estimated loss if duplicate
  syncedAt: string | null;
};

// Refresh interval in milliseconds (2 minutes)
export const CATALOG_REFRESH_INTERVAL_MS = 2 * 60 * 1000;

// Maximum number of sales to cache per store (rolling window)
const MAX_CACHED_SALES_PER_STORE = 10000;

const DB_NAME = 'chainsync_catalog';
const VERSION = 4; // Bumped for new 'sales' and 'offlineReturns' stores

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
      if (!db.objectStoreNames.contains('stores')) {
        db.createObjectStore('stores', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'storeId' });
      }
      // New stores for offline sales/returns caching (v4)
      if (!db.objectStoreNames.contains('sales')) {
        const s = db.createObjectStore('sales', { keyPath: 'id' });
        s.createIndex('storeId', 'storeId', { unique: false });
        s.createIndex('occurredAt', 'occurredAt', { unique: false });
        s.createIndex('idempotencyKey', 'idempotencyKey', { unique: false });
      }
      if (!db.objectStoreNames.contains('offlineReturns')) {
        const s = db.createObjectStore('offlineReturns', { keyPath: 'id' });
        s.createIndex('storeId', 'storeId', { unique: false });
        s.createIndex('saleId', 'saleId', { unique: false });
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

export async function putInventory(rows: InventoryRow[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('inventory','readwrite');
    const s = tx.objectStore('inventory');
    rows.forEach((r) => s.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getInventoryForStore(storeId: string): Promise<InventoryRow[]> {
  const db = await openDb();
  if (!db) return [];
  return await new Promise((resolve) => {
    const tx = db.transaction('inventory','readonly');
    const idx = tx.objectStore('inventory').index('storeId');
    const req = idx.getAll(IDBKeyRange.only(storeId));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

export async function putCustomers(rows: CustomerRow[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('customers','readwrite');
    const s = tx.objectStore('customers');
    rows.forEach((r) => s.put({ ...r, updatedAt: r.updatedAt ?? Date.now() }));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getCustomerByPhone(phone: string): Promise<CustomerRow | null> {
  const db = await openDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    const tx = db.transaction('customers','readonly');
    const idx = tx.objectStore('customers').index('phone');
    const req = idx.get(phone);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export async function upsertCustomerLoyaltySnapshot(row: { id: string; phone: string; name?: string; loyaltyPoints: number; updatedAt?: number }): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('customers','readwrite');
    const store = tx.objectStore('customers');
    store.put({ ...row, updatedAt: row.updatedAt ?? Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function upsertStores(rows: StoreRow[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('stores','readwrite');
    const s = tx.objectStore('stores');
    rows.forEach((r) => s.put({ ...r, updatedAt: r.updatedAt ?? Date.now() }));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getStore(storeId: string): Promise<StoreRow | null> {
  const db = await openDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    const tx = db.transaction('stores','readonly');
    const req = tx.objectStore('stores').get(storeId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export async function listStores(): Promise<StoreRow[]> {
  const db = await openDb();
  if (!db) return [];
  return await new Promise((resolve) => {
    const tx = db.transaction('stores','readonly');
    const req = tx.objectStore('stores').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

// Catalog sync metadata helpers
export async function getCatalogSyncMeta(storeId: string): Promise<CatalogSyncMeta | null> {
  const db = await openDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    const tx = db.transaction('syncMeta', 'readonly');
    const req = tx.objectStore('syncMeta').get(storeId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export async function setCatalogSyncMeta(meta: CatalogSyncMeta): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('syncMeta', 'readwrite');
    tx.objectStore('syncMeta').put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// Clear all products (used before full refresh to remove stale items)
export async function clearProducts(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('products', 'readwrite');
    tx.objectStore('products').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// Clear inventory for a specific store
export async function clearInventoryForStore(storeId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('inventory', 'readwrite');
    const store = tx.objectStore('inventory');
    const idx = store.index('storeId');
    const cursorReq = idx.openCursor(IDBKeyRange.only(storeId));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ========== Sale Caching for Offline Returns/Swaps ==========

// Cache a completed sale for offline return/swap lookup
export async function cacheCompletedSale(sale: CachedSale): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('sales', 'readwrite');
    tx.objectStore('sales').put(sale);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  // Prune old sales to stay within limit
  await pruneOldSales(sale.storeId);
}

// Cache a batch of sales for a store (used for rolling snapshots)
export async function cacheSalesSnapshotForStore(storeId: string, sales: CachedSale[]): Promise<void> {
  if (!sales.length) return;
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction('sales', 'readwrite');
    const store = tx.objectStore('sales');
    for (const sale of sales) {
      store.put(sale);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });

  // Enforce rolling window per store
  await pruneOldSales(storeId);
}

// Prune oldest sales beyond the max limit per store
async function pruneOldSales(storeId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  
  const allSales = await getSalesForStore(storeId);
  if (allSales.length <= MAX_CACHED_SALES_PER_STORE) return;
  
  // Sort by occurredAt descending (newest first)
  allSales.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  
  // Get IDs to delete (oldest beyond limit)
  const toDelete = allSales.slice(MAX_CACHED_SALES_PER_STORE).map(s => s.id);
  
  if (toDelete.length === 0) return;
  
  await new Promise<void>((resolve) => {
    const tx = db.transaction('sales', 'readwrite');
    const store = tx.objectStore('sales');
    for (const id of toDelete) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// Get all cached sales for a store
export async function getSalesForStore(storeId: string): Promise<CachedSale[]> {
  const db = await openDb();
  if (!db) return [];
  return await new Promise((resolve) => {
    const tx = db.transaction('sales', 'readonly');
    const idx = tx.objectStore('sales').index('storeId');
    const req = idx.getAll(IDBKeyRange.only(storeId));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

// Get a cached sale by ID (for return/swap lookup)
export async function getCachedSale(saleId: string): Promise<CachedSale | null> {
  const db = await openDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    const tx = db.transaction('sales', 'readonly');
    const req = tx.objectStore('sales').get(saleId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

// Get a cached sale by idempotency key (for reconciliation after sync)
export async function getCachedSaleByIdempotencyKey(key: string): Promise<CachedSale | null> {
  const db = await openDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    const tx = db.transaction('sales', 'readonly');
    const idx = tx.objectStore('sales').index('idempotencyKey');
    const req = idx.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

// Update a cached sale (e.g., after sync to set serverId)
export async function updateCachedSale(saleId: string, updates: Partial<CachedSale>): Promise<void> {
  const existing = await getCachedSale(saleId);
  if (!existing) return;
  
  const db = await openDb();
  if (!db) return;
  
  const updated = { ...existing, ...updates };
  await new Promise<void>((resolve) => {
    const tx = db.transaction('sales', 'readwrite');
    tx.objectStore('sales').put(updated);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// Mark items as returned (for partial returns tracking)
export async function markItemsReturned(saleId: string, returnedItems: Array<{ saleItemId: string; quantity: number }>): Promise<void> {
  const sale = await getCachedSale(saleId);
  if (!sale) return;
  
  const updatedItems = sale.items.map(item => {
    const returned = returnedItems.find(r => r.saleItemId === item.id);
    if (returned) {
      return {
        ...item,
        quantityReturned: (item.quantityReturned || 0) + returned.quantity,
      };
    }
    return item;
  });

  const isFullyReturned = updatedItems.every((item) => (item.quantityReturned || 0) >= item.quantity);

  await updateCachedSale(saleId, {
    items: updatedItems,
    ...(isFullyReturned ? { status: 'RETURNED' as const } : null),
  });
}

// Update local inventory quantity (for optimistic offline updates)
export async function updateLocalInventory(storeId: string, productId: string, quantityDelta: number): Promise<void> {
  const db = await openDb();
  if (!db) return;
  
  await new Promise<void>((resolve) => {
    const tx = db.transaction('inventory', 'readwrite');
    const store = tx.objectStore('inventory');
    const key = [storeId, productId];
    const getReq = store.get(key);
    
    getReq.onsuccess = () => {
      const existing = getReq.result as InventoryRow | undefined;
      if (existing) {
        existing.quantity = Math.max(0, existing.quantity + quantityDelta);
        store.put(existing);
      }
    };
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ========== Offline Returns Queue ==========

// Queue an offline return for later sync
export async function enqueueOfflineReturn(record: OfflineReturnRecord): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('offlineReturns', 'readwrite');
    tx.objectStore('offlineReturns').put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// Get all pending offline returns
export async function getOfflineReturns(storeId?: string): Promise<OfflineReturnRecord[]> {
  const db = await openDb();
  if (!db) return [];
  return await new Promise((resolve) => {
    const tx = db.transaction('offlineReturns', 'readonly');
    if (storeId) {
      const idx = tx.objectStore('offlineReturns').index('storeId');
      const req = idx.getAll(IDBKeyRange.only(storeId));
      req.onsuccess = () => resolve((req.result || []).filter(r => !r.syncedAt));
      req.onerror = () => resolve([]);
    } else {
      const req = tx.objectStore('offlineReturns').getAll();
      req.onsuccess = () => resolve((req.result || []).filter(r => !r.syncedAt));
      req.onerror = () => resolve([]);
    }
  });
}

// Get offline return by ID
export async function getOfflineReturn(id: string): Promise<OfflineReturnRecord | null> {
  const db = await openDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    const tx = db.transaction('offlineReturns', 'readonly');
    const req = tx.objectStore('offlineReturns').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

// Mark offline return as synced
export async function markOfflineReturnSynced(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  
  const existing = await getOfflineReturn(id);
  if (!existing) return;
  
  await new Promise<void>((resolve) => {
    const tx = db.transaction('offlineReturns', 'readwrite');
    tx.objectStore('offlineReturns').put({ ...existing, syncedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// Delete synced offline returns (cleanup)
export async function cleanupSyncedReturns(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  
  await new Promise<void>((resolve) => {
    const tx = db.transaction('offlineReturns', 'readwrite');
    const store = tx.objectStore('offlineReturns');
    const cursorReq = store.openCursor();
    
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const record = cursor.value as OfflineReturnRecord;
        if (record.syncedAt) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// Check if a sale has pending offline returns (to warn about duplicate risk)
export async function hasPendingOfflineReturns(saleId: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return await new Promise((resolve) => {
    const tx = db.transaction('offlineReturns', 'readonly');
    const idx = tx.objectStore('offlineReturns').index('saleId');
    const req = idx.getAll(IDBKeyRange.only(saleId));
    req.onsuccess = () => {
      const records = req.result || [];
      resolve(records.some(r => !r.syncedAt));
    };
    req.onerror = () => resolve(false);
  });
}

export type { ProductRow, InventoryRow, CustomerRow, StoreRow, CatalogSyncMeta };
