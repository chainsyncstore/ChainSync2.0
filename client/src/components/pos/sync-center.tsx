import { useEffect, useState } from "react";
import { listQueuedSales, deleteQueuedSale, expediteQueuedSale, processQueueNow, type OfflineSaleRecord } from "@/lib/offline-queue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SyncCenterProps {
  open: boolean;
  onClose: () => void;
}

export default function SyncCenter({ open, onClose }: SyncCenterProps) {
  const [items, setItems] = useState<OfflineSaleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<{ total: number; last24h: number } | null>(null);

  const refresh = async () => {
    setItems(await listQueuedSales());
  };

  useEffect(() => {
    if (open) refresh();
    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_SALE_OK') refresh();
      if (event.data?.type === 'SYNC_COMPLETED') refresh();
    };
    navigator.serviceWorker?.addEventListener('message', onMsg as any);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg as any);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const r = await fetch('/api/pos/sync/health', { credentials: 'include' });
        if (r.ok) {
          const j = await r.json();
          setHealth(j?.sales || null);
        }
      } catch {}
    })();
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
              <Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>
              <Button size="sm" onClick={async () => { setLoading(true); await processQueueNow(); await refresh(); setLoading(false); }} disabled={loading}>{loading ? 'Syncing...' : 'Sync now'}</Button>
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
                  <Button size="sm" variant="outline" onClick={async () => { await expediteQueuedSale(it.id); await processQueueNow(); await refresh(); }}>Retry now</Button>
                  <Button size="sm" variant="outline" onClick={async () => { await deleteQueuedSale(it.id); await refresh(); }}>Remove</Button>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <div className="text-center text-slate-500 py-8 text-sm">No queued sales</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


