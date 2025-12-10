import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface UseOfflineSyncOptions {
  notifyQueueToast?: boolean;
  // eslint-disable-next-line no-unused-vars
  onSaleSynced?: (_payload: any) => void;
}

interface LastSyncMeta {
  attempted: number;
  synced: number;
}

export function useOfflineSyncIndicator(options: UseOfflineSyncOptions = {}) {
  const { toast } = useToast();
  const [queuedCount, setQueuedCount] = useState(0);
  const [escalations, setEscalations] = useState(0);
  const [lastSync, setLastSync] = useState<LastSyncMeta | null>(null);
  const prevQueueRef = useRef(0);
  const notifyQueueToast = options.notifyQueueToast ?? true;

  // Helper to sync offline returns (shared between online handler and manual Sync Now)
  const syncOfflineReturns = useCallback(async () => {
    try {
      const { getOfflineReturns, markOfflineReturnSynced, cleanupSyncedReturns, getCachedSale } = await import("@/lib/idb-catalog");
      const { getCsrfToken } = await import("@/lib/csrf");

      const pendingReturns = await getOfflineReturns();
      if (pendingReturns.length === 0) return;

      const csrfToken = await getCsrfToken().catch(() => null);
      let syncedCount = 0;

      for (const returnRecord of pendingReturns) {
        try {
          // Get the cached sale to find the actual server sale ID
          const cachedSale = await getCachedSale(returnRecord.saleId);
          const actualSaleId = cachedSale?.serverId || cachedSale?.id || returnRecord.saleId;

          // Skip if the sale was created offline and not yet synced
          if (cachedSale?.isOffline && !cachedSale.syncedAt) {
            console.log(`Skipping return for unsynced offline sale: ${returnRecord.saleId}`);
            continue;
          }

          const payload = {
            saleId: actualSaleId,
            storeId: returnRecord.storeId,
            reason: returnRecord.reason,
            items: returnRecord.items.map((item) => ({
              saleItemId: item.saleItemId,
              productId: item.productId,
              quantity: item.quantity,
              restockAction: item.restockAction,
              refundType: item.refundType,
              refundAmount: String(item.refundAmount.toFixed(2)),
            })),
            offlineCreatedAt: returnRecord.createdAt,
            potentialLoss: returnRecord.potentialLoss,
          };

          const res = await fetch("/api/pos/returns", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
            },
            credentials: "include",
            body: JSON.stringify(payload),
          });

          if (res.ok || res.status === 409) {
            // Success or already processed (duplicate)
            await markOfflineReturnSynced(returnRecord.id);
            syncedCount++;
          }
        } catch (err) {
          console.error(`Failed to sync offline return ${returnRecord.id}:`, err);
        }
      }

      if (syncedCount > 0) {
        await cleanupSyncedReturns();
        toast({
          title: "Offline returns synced",
          description: `${syncedCount} return${syncedCount > 1 ? "s" : ""} synchronized.`,
        });
      }
    } catch (err) {
      console.error("Failed to sync offline returns:", err);
    }
  }, [toast]);

  const refreshCounts = useCallback(async () => {
    try {
      const { getOfflineQueueCount, getEscalatedCount } = await import("@/lib/offline-queue");
      const [count, escalated] = await Promise.all([
        getOfflineQueueCount(),
        getEscalatedCount(5),
      ]);
      if (notifyQueueToast) {
        const prev = prevQueueRef.current;
        if (prev === 0 && count > 0) {
          toast({ title: "Offline queue active", description: `${count} sale${count > 1 ? "s" : ""} pending sync.` });
        } else if (prev > 0 && count === 0) {
          toast({ title: "Offline queue cleared", description: "All pending sales have synced." });
        }
      }
      prevQueueRef.current = count;
      setQueuedCount(count);
      setEscalations(escalated);
    } catch (error) {
      console.warn("Failed to refresh offline queue counts", error);
    }
  }, [notifyQueueToast, toast]);

  const handleSyncNow = useCallback(async () => {
    try {
      const { processQueueNow } = await import("@/lib/offline-queue");
      await processQueueNow();
      // Also attempt to sync any queued offline returns immediately
      await syncOfflineReturns();
      await refreshCounts();
      toast({ title: "Sync requested", description: "Background sync triggered." });
    } catch (error) {
      console.error("Failed to trigger manual sync", error);
      toast({ title: "Sync failed", description: "Unable to start sync right now.", variant: "destructive" });
    }
  }, [refreshCounts, syncOfflineReturns, toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let mounted = true;
    void refreshCounts();

    const onMsg = (event: MessageEvent) => {
      const type = event.data?.type;
      if (!type) return;

      if (type === "SYNC_COMPLETED") {
        if (event.data?.data) {
          setLastSync(event.data.data as LastSyncMeta);
        }
        void refreshCounts();
        return;
      }

      if (type === "SYNC_SALE_OK") {
        const payload = event.data?.data;
        options.onSaleSynced?.(payload);

        // When an offline sale is successfully synced by the service worker,
        // update any matching CachedSale so returns/swaps know it is online.
        if (payload?.idempotencyKey) {
          void (async () => {
            try {
              const { getCachedSaleByIdempotencyKey, updateCachedSale } = await import("@/lib/idb-catalog");
              const cached = await getCachedSaleByIdempotencyKey(payload.idempotencyKey as string);
              if (!cached) return;

              await updateCachedSale(cached.id, {
                isOffline: false,
                syncedAt: new Date().toISOString(),
                serverId: (payload.sale as any)?.id || cached.serverId,
              });
            } catch (err) {
              console.warn("Failed to update cached sale after sync", err);
            }
          })();
        }

        void refreshCounts();
      }
    };

    navigator.serviceWorker?.addEventListener("message", onMsg as any);

    const onOnline = async () => {
      try {
        // Sync offline sales
        const { processQueueNow } = await import("@/lib/offline-queue");
        await processQueueNow();

        // Sync offline returns
        await syncOfflineReturns();

        toast({ title: "Back online", description: "Sync started automatically." });
      } catch (error) {
        console.error("Failed processing queue after reconnect", error);
      } finally {
        if (mounted) void refreshCounts();
      }
    };

    window.addEventListener("online", onOnline);

    return () => {
      mounted = false;
      navigator.serviceWorker?.removeEventListener("message", onMsg as any);
      window.removeEventListener("online", onOnline);
    };
  }, [options, refreshCounts, syncOfflineReturns, toast]);

  return {
    queuedCount,
    escalations,
    lastSync,
    refreshCounts,
    handleSyncNow,
  };
}
