import { useEffect, useState } from "react";

interface CatalogFreshnessState {
  lastUpdatedAt: number | null;
  isStale: boolean;
  loading: boolean;
}

const STALE_THRESHOLD_MS = 1000 * 60 * 60; // 1 hour

export function useCatalogFreshness(storeId?: string | null): CatalogFreshnessState {
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storeId) {
      setLastUpdatedAt(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { getStore } = await import("@/lib/idb-catalog");
        const record = await getStore(storeId);
        if (!cancelled) {
          setLastUpdatedAt(record?.updatedAt ?? null);
        }
      } catch (error) {
        console.warn("Failed to read catalog freshness", error);
        if (!cancelled) {
          setLastUpdatedAt(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [storeId]);

  const isStale = lastUpdatedAt ? Date.now() - lastUpdatedAt > STALE_THRESHOLD_MS : true;

  return { lastUpdatedAt, isStale, loading };
}
