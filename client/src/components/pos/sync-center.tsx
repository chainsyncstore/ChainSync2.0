import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCachedSale, getOfflineReturns, type CachedSale, type OfflineReturnRecord } from "@/lib/idb-catalog";
import type { OfflineSaleRecord } from "@/lib/offline-queue";

interface SyncCenterProps {
  open: boolean;
  onClose: () => void;
  storeId?: string;
  onSyncNow: () => Promise<void>;
}

export default function SyncCenter({ open, onClose, storeId, onSyncNow }: SyncCenterProps) {
  const [saleQueue, setSaleQueue] = useState<OfflineSaleRecord[]>([]);
  const [returnQueue, setReturnQueue] = useState<OfflineReturnRecord[]>([]);
  const [swapQueue, setSwapQueue] = useState<OfflineReturnRecord[]>([]);
  const [cachedSales, setCachedSales] = useState<Record<string, CachedSale | null>>({});
  const [activeTab, setActiveTab] = useState<'sales' | 'returns' | 'swaps'>('sales');
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<{ total: number; last24h: number } | null>(null);
  const [editing, setEditing] = useState<OfflineSaleRecord | null>(null);
  const [editJson, setEditJson] = useState<string>("");
  const [editErrors, setEditErrors] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const { listQueuedSales } = await import("@/lib/offline-queue");
      const [sales, offlineReturns] = await Promise.all([
        listQueuedSales(),
        getOfflineReturns(storeId),
      ]);

      const filteredSales = storeId
        ? sales.filter((record) => record?.payload?.storeId === storeId)
        : sales;

      setSaleQueue(filteredSales);
      setReturnQueue(offlineReturns.filter((record) => record.type === 'RETURN'));
      setSwapQueue(offlineReturns.filter((record) => record.type === 'SWAP'));

      const uniqueSaleIds = Array.from(
        new Set(offlineReturns.map((record) => record.saleId).filter(Boolean))
      );
      const nextCachedSales: Record<string, CachedSale | null> = {};
      await Promise.all(
        uniqueSaleIds.map(async (saleId) => {
          nextCachedSales[saleId] = await getCachedSale(saleId);
        })
      );
      setCachedSales(nextCachedSales);
    } catch (refreshError) {
      console.error('Failed to refresh queued items', refreshError);
    }
  }, [storeId]);

  useEffect(() => {
    if (open) void refresh();
    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_SALE_OK') void refresh();
      if (event.data?.type === 'SYNC_COMPLETED') void refresh();
    };
    navigator.serviceWorker?.addEventListener('message', onMsg as any);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg as any);
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const hydrateCachedHealth = async () => {
      try {
        const { getLatestSyncHealth } = await import("@/lib/sync-health");
        const latest = await getLatestSyncHealth();
        if (!cancelled && latest?.sales) {
          setHealth(latest.sales);
        }
      } catch (error) {
        console.warn('Failed to hydrate cached sync health', error);
      }
    };
    void hydrateCachedHealth();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fetchHealth = async () => {
      try {
        const r = await fetch('/api/pos/sync/health', { credentials: 'include' });
        if (r.ok) {
          const j = await r.json();
          const sales = j?.sales || null;
          setHealth(sales);
          try {
            const { saveSyncHealthSnapshot } = await import("@/lib/sync-health");
            await saveSyncHealthSnapshot({ capturedAt: Date.now(), sales });
          } catch (persistError) {
            console.warn('Failed to persist sync health snapshot', persistError);
          }
        }
      } catch (healthError) {
        console.warn('Failed to load sync health status', healthError);
      }
    };
    void fetchHealth();
  }, [open]);

  const renderCountdown = (item: OfflineSaleRecord) => {
    if (!item.nextAttemptAt) return 'Retry pending';
    const diff = item.nextAttemptAt - Date.now();
    if (diff <= 0) return 'Retrying now';
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
    return `${seconds}s`;
  };

  const summarizeParts = (parts: string[], max = 3) => {
    if (parts.length <= max) return parts.join(", ");
    return `${parts.slice(0, max).join(", ")} +${parts.length - max} more`;
  };

  const getItemName = (sale: CachedSale | null | undefined, productId: string) => {
    const match = sale?.items?.find((it) => it.productId === productId);
    return match?.name || productId;
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Sync Center</CardTitle>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-slate-600">
              {activeTab === 'sales'
                ? `Queued sales: ${saleQueue.length}`
                : activeTab === 'returns'
                  ? `Queued returns: ${returnQueue.length}`
                  : `Queued swaps: ${swapQueue.length}`}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { void refresh(); }}>Refresh</Button>
              <Button
                size="sm"
                onClick={async () => {
                  setLoading(true);
                  try {
                    await onSyncNow();
                    await refresh();
                  } catch (syncError) {
                    console.error('Manual sync failed', syncError);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? 'Syncing...' : 'Sync now'}
              </Button>
            </div>
          </div>
          <div className="mb-4 flex gap-2">
            <Button
              size="sm"
              variant={activeTab === 'sales' ? 'default' : 'outline'}
              onClick={() => setActiveTab('sales')}
            >
              Sales ({saleQueue.length})
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'returns' ? 'default' : 'outline'}
              onClick={() => {
                setActiveTab('returns');
                setEditing(null);
              }}
            >
              Returns ({returnQueue.length})
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'swaps' ? 'default' : 'outline'}
              onClick={() => {
                setActiveTab('swaps');
                setEditing(null);
              }}
            >
              Swaps ({swapQueue.length})
            </Button>
          </div>
          {activeTab === 'sales' && health && (
            <div className="text-xs text-slate-500 mb-2">Sales (24h): {health.last24h} • Total: {health.total}</div>
          )}
          <div className="space-y-2 max-h-96 overflow-auto">
            {activeTab === 'sales' && (
              <>
                {saleQueue.map((it) => {
                  const payload = it.payload as any;
                  const items = Array.isArray(payload?.items) ? payload.items : [];
                  const itemLines = items.length;
                  const itemCount = items.reduce((sum: number, row: any) => sum + Number(row?.quantity || 0), 0);
                  const total = payload?.total != null ? String(payload.total) : '—';
                  const paymentMethod = payload?.paymentMethod ? String(payload.paymentMethod) : '—';
                  const createdAt = new Date(it.createdAt).toLocaleString();

                  return (
                    <div key={it.id} className={`border rounded p-2 text-sm flex items-center justify-between ${it.attempts >= 5 ? 'border-red-300 bg-red-50' : ''}`}>
                      <div>
                        <div className="font-medium">Queued sale</div>
                        <div className="text-xs text-slate-600">
                          {itemLines} line{itemLines === 1 ? '' : 's'} • {itemCount} item{itemCount === 1 ? '' : 's'} • Total: {total} • Payment: {paymentMethod}
                        </div>
                        <div className="text-xs text-slate-500">Queued: {createdAt}</div>
                        <div className="text-xs text-slate-500">
                          Attempts: {it.attempts} {it.lastError ? <span className="text-amber-700">({it.lastError})</span> : null}
                        </div>
                        {it.nextAttemptAt ? (
                          <div className="text-xs text-slate-500">Next retry: {new Date(it.nextAttemptAt).toLocaleString()} ({renderCountdown(it)})</div>
                        ) : null}
                        {it.attempts >= 5 && (
                          <div className="text-xs text-red-700">Queued sale is stuck. Verify inventory/payment then retry.</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(JSON.stringify(it.payload, null, 2));
                            alert('Queued payload copied to clipboard');
                          } catch (clipboardError) {
                            console.error('Failed to copy payload to clipboard', clipboardError);
                          }
                        }}>Export JSON</Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditing(it); setEditJson(JSON.stringify(it.payload, null, 2)); setEditErrors([]);} }>Edit</Button>
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            const { expediteQueuedSale, processQueueNow } = await import("@/lib/offline-queue");
                            await expediteQueuedSale(it.id);
                            await processQueueNow();
                            await refresh();
                          } catch (retryError) {
                            console.error('Failed to retry queued sale', retryError);
                          }
                        }}>Retry now</Button>
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            const { deleteQueuedSale } = await import("@/lib/offline-queue");
                            await deleteQueuedSale(it.id);
                            await refresh();
                          } catch (deleteError) {
                            console.error('Failed to remove queued sale', deleteError);
                          }
                        }}>Remove</Button>
                      </div>
                    </div>
                  );
                })}
                {saleQueue.length === 0 && (
                  <div className="text-center text-slate-500 py-8 text-sm">No queued sales</div>
                )}
              </>
            )}

            {activeTab === 'returns' && (
              <>
                {returnQueue.map((record) => {
                  const sale = cachedSales[record.saleId];
                  const receipt = sale?.receiptNumber || sale?.id || record.saleId;
                  const itemSummary = summarizeParts(
                    record.items.map((it) => `${getItemName(sale, it.productId)} x${it.quantity}`)
                  );
                  const refundTotal = record.items.reduce((sum, it) => sum + Number(it.refundAmount || 0), 0);
                  return (
                    <div key={record.id} className="border rounded p-2 text-sm flex items-center justify-between">
                      <div>
                        <div className="font-medium">Queued return</div>
                        <div className="text-xs text-slate-600">Receipt: {receipt}</div>
                        <div className="text-xs text-slate-600">Items: {itemSummary}</div>
                        <div className="text-xs text-slate-600">Refund: {refundTotal.toFixed(2)}</div>
                        <div className="text-xs text-slate-500">Queued: {new Date(record.createdAt).toLocaleString()}</div>
                        {record.reason ? <div className="text-xs text-slate-500">Reason: {record.reason}</div> : null}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
                            alert('Queued return copied to clipboard');
                          } catch (clipboardError) {
                            console.error('Failed to copy record to clipboard', clipboardError);
                          }
                        }}>Export</Button>
                      </div>
                    </div>
                  );
                })}
                {returnQueue.length === 0 && (
                  <div className="text-center text-slate-500 py-8 text-sm">No queued returns</div>
                )}
              </>
            )}

            {activeTab === 'swaps' && (
              <>
                {swapQueue.map((record) => {
                  const sale = cachedSales[record.saleId];
                  const receipt = sale?.receiptNumber || sale?.id || record.saleId;
                  const original = record.items[0];
                  const originalLabel = original
                    ? `${getItemName(sale, original.productId)} x${original.quantity}`
                    : '—';
                  const newProducts: any[] = (record.swapData?.newProducts || record.swapProducts || []) as any[];
                  const newSummary = summarizeParts(
                    newProducts.map((p) => {
                      const name = typeof p?.name === 'string' && p.name.trim() ? p.name : p?.productId;
                      return `${name} x${Number(p?.quantity || 0)}`;
                    })
                  );
                  const diff = typeof record.swapData?.totalDifference === 'number' ? record.swapData.totalDifference : null;
                  const diffLabel = diff == null ? null : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`;
                  return (
                    <div key={record.id} className="border rounded p-2 text-sm flex items-center justify-between">
                      <div>
                        <div className="font-medium">Queued swap</div>
                        <div className="text-xs text-slate-600">Receipt: {receipt}</div>
                        <div className="text-xs text-slate-600">Swap: {originalLabel} → {newSummary || '—'}</div>
                        {diffLabel ? <div className="text-xs text-slate-600">Difference: {diffLabel}</div> : null}
                        <div className="text-xs text-slate-500">Queued: {new Date(record.createdAt).toLocaleString()}</div>
                        {record.reason ? <div className="text-xs text-slate-500">Notes: {record.reason}</div> : null}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
                            alert('Queued swap copied to clipboard');
                          } catch (clipboardError) {
                            console.error('Failed to copy record to clipboard', clipboardError);
                          }
                        }}>Export</Button>
                      </div>
                    </div>
                  );
                })}
                {swapQueue.length === 0 && (
                  <div className="text-center text-slate-500 py-8 text-sm">No queued swaps</div>
                )}
              </>
            )}
          </div>
          {activeTab === 'sales' && editing && (
            <div className="mt-4 border rounded p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Edit Queued Sale</div>
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Close</Button>
              </div>
              <textarea className="w-full h-40 font-mono text-xs p-2 border rounded" value={editJson} onChange={(e) => setEditJson(e.target.value)} />
              {editErrors.length > 0 && (
                <div className="text-red-700 text-xs mt-2">{editErrors.join('; ')}</div>
              )}
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={async () => {
                  try {
                    const parsed = JSON.parse(editJson);
                    const { validateSalePayload, updateQueuedSalePayload, processQueueNow } = await import("@/lib/offline-queue");
                    const v = validateSalePayload(parsed);
                    if (!v.valid) { setEditErrors(v.errors); return; }
                    await updateQueuedSalePayload(editing!.id, parsed);
                    await processQueueNow();
                    await refresh();
                    setEditing(null);
                  } catch (validationError) {
                    console.error('Failed to save edited queued sale', validationError);
                    setEditErrors(['Invalid JSON']);
                  }
                }}>Save & Retry</Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


