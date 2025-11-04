import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OfflineSaleRecord } from "@/lib/offline-queue";

interface SyncCenterProps {
  open: boolean;
  onClose: () => void;
}

export default function SyncCenter({ open, onClose }: SyncCenterProps) {
  const [items, setItems] = useState<OfflineSaleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<{ total: number; last24h: number } | null>(null);
  const [editing, setEditing] = useState<OfflineSaleRecord | null>(null);
  const [editJson, setEditJson] = useState<string>("");
  const [editErrors, setEditErrors] = useState<string[]>([]);

  const refresh = async () => {
    try {
      const { listQueuedSales } = await import("@/lib/offline-queue");
      setItems(await listQueuedSales());
    } catch (refreshError) {
      console.error('Failed to refresh queued sales', refreshError);
    }
  };

  useEffect(() => {
    if (open) void refresh();
    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_SALE_OK') void refresh();
      if (event.data?.type === 'SYNC_COMPLETED') void refresh();
    };
    navigator.serviceWorker?.addEventListener('message', onMsg as any);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg as any);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fetchHealth = async () => {
      try {
        const r = await fetch('/api/pos/sync/health', { credentials: 'include' });
        if (r.ok) {
          const j = await r.json();
          setHealth(j?.sales || null);
        }
      } catch (healthError) {
        console.warn('Failed to load sync health status', healthError);
      }
    };
    void fetchHealth();
  }, [open]);

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
            <div className="text-sm text-slate-600">Queued sales: {items.length}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { void refresh(); }}>Refresh</Button>
              <Button
                size="sm"
                onClick={async () => {
                  setLoading(true);
                  try {
                    const { processQueueNow } = await import("@/lib/offline-queue");
                    await processQueueNow();
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
          {health && (
            <div className="text-xs text-slate-500 mb-2">Sales (24h): {health.last24h} • Total: {health.total}</div>
          )}
          <div className="space-y-2 max-h-96 overflow-auto">
            {items.map((it) => (
              <div key={it.id} className={`border rounded p-2 text-sm flex items-center justify-between ${it.attempts >= 5 ? 'border-red-300 bg-red-50' : ''}`}>
                <div>
                  <div className="font-mono text-xs">{it.id}</div>
                  <div>Attempts: {it.attempts} {it.lastError ? <span className="text-amber-700">({it.lastError})</span> : null}</div>
                  {it.nextAttemptAt ? (
                    <div className="text-xs text-slate-500">Next retry: {new Date(it.nextAttemptAt).toLocaleString()}</div>
                  ) : null}
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
            ))}
            {items.length === 0 && (
              <div className="text-center text-slate-500 py-8 text-sm">No queued sales</div>
            )}
          </div>
          {editing && (
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


