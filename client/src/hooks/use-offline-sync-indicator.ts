import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
import {
  cleanupSyncedReturns,
  getCachedSale,
  getCachedSaleByIdempotencyKey,
  getOfflineReturns,
  markOfflineReturnSynced,
  updateCachedSale,
} from "@/lib/idb-catalog";
import { getEscalatedCount, getOfflineQueueCount, processQueueNow } from "@/lib/offline-queue";

interface UseOfflineSyncOptions {
  notifyQueueToast?: boolean;
  // eslint-disable-next-line no-unused-vars
  onSaleSynced?: (_payload: any) => void;
}

interface LastSyncMeta {
  attempted: number;
  synced: number;
}

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
      const pendingReturns = await getOfflineReturns();
      if (pendingReturns.length === 0) return;

      const csrfToken = await getCsrfToken().catch(() => null);
      let syncedCount = 0;

      const saleItemIdByProductCache = new Map<string, Map<string, string>>();

      const getSaleItemIdByProduct = async (saleId: string, storeId: string, productId: string) => {
        const cacheKey = `${saleId}:${storeId}`;
        let map = saleItemIdByProductCache.get(cacheKey);
        if (!map) {
          try {
            const res = await fetch(`/api/pos/sales/${saleId}?storeId=${storeId}`, {
              credentials: "include",
            });
            if (!res.ok) return null;
            const data = await res.json().catch(() => null);
            const items = (data as any)?.items;
            if (!Array.isArray(items)) return null;

            map = new Map<string, string>();
            for (const item of items as any[]) {
              if (!item) continue;
              const pid = typeof item.productId === "string" ? item.productId : null;
              const sid = typeof item.id === "string" ? item.id : null;
              if (pid && sid && !map.has(pid)) map.set(pid, sid);
            }
            saleItemIdByProductCache.set(cacheKey, map);
          } catch {
            return null;
          }
        }
        return map.get(productId) || null;
      };

      for (const returnRecord of pendingReturns) {
        try {
          // Get the cached sale to find the actual server sale ID
          let cachedSale = await getCachedSale(returnRecord.saleId);
          let actualSaleId = cachedSale?.serverId || cachedSale?.id || returnRecord.saleId;

          // If the cached sale is marked as offline and unsynced, try to look it up on the server
          // by idempotency key - it may have synced via service worker while we were away
          if (cachedSale?.isOffline && !cachedSale.syncedAt && cachedSale.idempotencyKey) {
            try {
              const lookupRes = await fetch(
                `/api/pos/sales/by-idempotency-key/${encodeURIComponent(cachedSale.idempotencyKey)}?storeId=${encodeURIComponent(returnRecord.storeId)}`,
                { credentials: "include" }
              );
              if (lookupRes.ok) {
                const serverSale = await lookupRes.json();
                if (serverSale?.id && isUuid(serverSale.id)) {
                  // Sale exists on server! Update cached record and use server ID
                  await updateCachedSale(cachedSale.id, {
                    isOffline: false,
                    syncedAt: new Date().toISOString(),
                    serverId: serverSale.id,
                  });
                  actualSaleId = serverSale.id;
                  console.log(`Resolved offline sale ${returnRecord.saleId} to server ID ${serverSale.id}`);
                }
              }
            } catch (lookupErr) {
              console.warn(`Failed to lookup sale by idempotency key for return ${returnRecord.id}`, lookupErr);
            }
          }

          // Re-check: Skip if the sale is still offline and unsynced after lookup attempt
          cachedSale = await getCachedSale(returnRecord.saleId);
          if (cachedSale?.isOffline && !cachedSale.syncedAt) {
            console.log(`Skipping return for unsynced offline sale: ${returnRecord.saleId}`);
            continue;
          }

          // Update actualSaleId after potential cache update
          actualSaleId = cachedSale?.serverId || cachedSale?.id || returnRecord.saleId;

          if (!isUuid(actualSaleId)) {
            console.log(`Skipping return for non-UUID sale id: ${actualSaleId}`);
            continue;
          }

          const idempotencyKey = returnRecord.idempotencyKey || returnRecord.id;

          const isSwap = returnRecord.type === 'SWAP';
          const url = isSwap ? '/api/pos/swaps' : '/api/pos/returns';

          let payload: any;

          if (!isSwap) {
            payload = {
              saleId: actualSaleId,
              storeId: returnRecord.storeId,
              reason: returnRecord.reason,
              items: returnRecord.items.map((item) => ({
                ...(isUuid(item.saleItemId) ? { saleItemId: item.saleItemId } : {}),
                productId: item.productId,
                quantity: item.quantity,
                restockAction: item.restockAction,
                refundType: item.refundType,
                refundAmount: String(item.refundAmount.toFixed(2)),
              })),
              offlineCreatedAt: returnRecord.createdAt,
              potentialLoss: returnRecord.potentialLoss,
            };
          } else {
            const original = returnRecord.items[0];
            const originalQuantity = Number(original?.quantity || 0);
            const originalUnitPrice = originalQuantity > 0 ? Number(original?.refundAmount || 0) / originalQuantity : 0;

            if (!original?.productId) {
              console.warn("Skipping swap sync; missing original product", { offlineId: returnRecord.id, saleId: actualSaleId });
              continue;
            }

            let originalSaleItemId = original?.saleItemId;
            if (!isUuid(originalSaleItemId)) {
              originalSaleItemId = await getSaleItemIdByProduct(actualSaleId, returnRecord.storeId, original.productId);
            }

            if (!isUuid(originalSaleItemId)) {
              console.warn("Skipping swap sync; could not resolve originalSaleItemId", {
                offlineId: returnRecord.id,
                saleId: actualSaleId,
                productId: original.productId,
              });
              continue;
            }

            const swapProducts = (
              returnRecord.swapData?.newProducts?.map((p) => ({
                productId: p.productId,
                quantity: p.quantity,
                unitPrice: p.unitPrice,
              })) ||
              returnRecord.swapProducts ||
              []
            ).filter((p) => p && p.productId && Number(p.quantity || 0) > 0);

            if (swapProducts.length === 0) {
              console.warn("Skipping swap sync; no newProducts", { offlineId: returnRecord.id, saleId: actualSaleId });
              continue;
            }

            payload = {
              saleId: actualSaleId,
              storeId: returnRecord.storeId,
              originalSaleItemId,
              originalProductId: original.productId,
              originalQuantity,
              originalUnitPrice,
              newProducts: swapProducts,
              restockAction: original?.restockAction || 'RESTOCK',
              paymentMethod: returnRecord.swapData?.paymentMethod || 'CASH',
              notes: returnRecord.reason || returnRecord.notes,
            };
          }

          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey,
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
        void syncOfflineReturns();
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

        // Now that sales may have been reconciled to server IDs, attempt to sync
        // any pending returns/swaps that were waiting on those IDs.
        void syncOfflineReturns();

        void refreshCounts();
      }
    };

    navigator.serviceWorker?.addEventListener("message", onMsg as any);

    const onOnline = async () => {
      try {
        // Sync offline sales
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
