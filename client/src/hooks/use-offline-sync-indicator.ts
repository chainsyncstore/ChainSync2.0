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
      await refreshCounts();
      toast({ title: "Sync requested", description: "Background sync triggered." });
    } catch (error) {
      console.error("Failed to trigger manual sync", error);
      toast({ title: "Sync failed", description: "Unable to start sync right now.", variant: "destructive" });
    }
  }, [refreshCounts, toast]);

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
      } else if (type === "SYNC_SALE_OK") {
        options.onSaleSynced?.(event.data?.data);
        void refreshCounts();
      }
    };

    navigator.serviceWorker?.addEventListener("message", onMsg as any);

    const onOnline = async () => {
      try {
        const { processQueueNow } = await import("@/lib/offline-queue");
        await processQueueNow();
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
  }, [options, refreshCounts, toast]);

  return {
    queuedCount,
    escalations,
    lastSync,
    refreshCounts,
    handleSyncNow,
  };
}
