import { useEffect, useState } from "react";
import { listQueuedSales, deleteQueuedSale, processQueueNow, type OfflineSaleRecord } from "@/lib/offline-queue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SyncCenterProps {
  open: boolean;
  onClose: () => void;
}

export default function SyncCenter({ open, onClose }: SyncCenterProps) {
  const [items, setItems] = useState<OfflineSaleRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setItems(await listQueuedSales());
  };

  useEffect(() => {
    if (open) refresh();
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
          <div className="space-y-2 max-h-96 overflow-auto">
            {items.map((it) => (
              <div key={it.id} className="border rounded p-2 text-sm flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs">{it.id}</div>
                  <div>Attempts: {it.attempts} {it.lastError ? <span className="text-amber-700">({it.lastError})</span> : null}</div>
                </div>
                <div className="flex gap-2">
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


