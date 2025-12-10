import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, Banknote, CreditCard, Loader2, Minus, Plus, RefreshCcw, Search, Smartphone, Trash2, Undo2, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import SyncCenter from "@/components/pos/sync-center";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useOfflineSyncIndicator } from "@/hooks/use-offline-sync-indicator";
import { useReceiptPrinter } from "@/hooks/use-receipt-printer";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
import type { CachedSale, CachedSaleItem, OfflineReturnRecord } from "@/lib/idb-catalog";
import { formatCurrency, formatDateTime } from "@/lib/pos-utils";
import type { ReceiptPrintJob } from "@/lib/printer";
import type { Store } from "@shared/schema";

type RestockAction = "RESTOCK" | "DISCARD";
type RefundType = "NONE" | "FULL" | "PARTIAL";

interface SaleItemResponse {
  id: string;
  productId: string;
  quantity: number;
  quantityReturned: number;
  quantityRemaining: number;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
  name: string | null;
  sku: string | null;
  barcode: string | null;
}

interface SaleLookupResponse {
  sale: {
    id: string;
    storeId: string;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    occurredAt: string;
    status: string;
    currency: string;
  };
  items: SaleItemResponse[];
}

interface ReturnDraftState {
  [saleItemId: string]: {
    quantity: number | undefined;
    restockAction: RestockAction;
    refundType: RefundType;
    refundAmount: string;
  };
}

/* eslint-disable no-unused-vars */
type DraftEntryUpdater = (entry: ReturnDraftState[string]) => ReturnDraftState[string];
/* eslint-enable no-unused-vars */

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  salePrice: number;
  quantity?: number;
}

type PaymentMethod = "CASH" | "CARD" | "DIGITAL";

interface NewSwapProduct {
  product: ProductSearchResult;
  quantity: number | undefined;
}

interface SwapState {
  saleReference: string;
  saleData: SaleLookupResponse | null;
  selectedItem: SaleItemResponse | null;
  newProducts: NewSwapProduct[]; // Array of new products with quantities
  swapQuantity: number | undefined; // Quantity of original item to swap
  restockAction: RestockAction;
  paymentMethod: PaymentMethod;
  notes: string;
}

export default function ReturnsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { printReceipt } = useReceiptPrinter();
  const lockedStoreId = user?.role === "cashier" ? user.storeId ?? null : null;
  const [selectedStore, setSelectedStore] = useState<string>(lockedStoreId ?? "");
  const [saleReference, setSaleReference] = useState("");
  const [saleData, setSaleData] = useState<SaleLookupResponse | null>(null);
  const [fetchingSale, setFetchingSale] = useState(false);
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState<ReturnDraftState>({});
  const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"returns" | "swaps">("returns");

  // Swap modal state
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [swapState, setSwapState] = useState<SwapState>({
    saleReference: "",
    saleData: null,
    selectedItem: null,
    newProducts: [],
    swapQuantity: 1,
    restockAction: "RESTOCK",
    paymentMethod: "CASH",
    notes: "",
  });
  const [fetchingSwapSale, setFetchingSwapSale] = useState(false);
  const [swapProductSearch, setSwapProductSearch] = useState("");
  const [swapSearchResults, setSwapSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [swapBarcodeInput, setSwapBarcodeInput] = useState("");

  // Offline handling state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [cachedSaleData, setCachedSaleData] = useState<CachedSale | null>(null);
  const [showOfflineWarning, setShowOfflineWarning] = useState(false);
  const [pendingOfflineAction, setPendingOfflineAction] = useState<"return" | "swap" | null>(null);
  const [offlineReturnCount, setOfflineReturnCount] = useState(0);

  const { data: stores = [], isLoading: loadingStores } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  const { queuedCount, escalations, lastSync, handleSyncNow } = useOfflineSyncIndicator();

  useEffect(() => {
    if (lockedStoreId && selectedStore !== lockedStoreId) {
      setSelectedStore(lockedStoreId);
      return;
    }
    if (!lockedStoreId && !selectedStore && stores.length > 0) {
      setSelectedStore(stores[0].id);
    }
  }, [lockedStoreId, selectedStore, stores]);

  useEffect(() => {
    setSaleData(null);
    setDraft({});
    setCachedSaleData(null);
    setIsOfflineMode(false);
  }, [selectedStore]);

  // Rolling sales snapshot: when online, periodically cache recent sales for this store
  useEffect(() => {
    if (!selectedStore || !isOnline) return;

    let cancelled = false;

    const syncRecentSalesSnapshot = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(`/api/pos/sales?storeId=${selectedStore}&limit=200`, {
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok || cancelled) return;
        const body = await res.json().catch(() => null);
        if (!body || !Array.isArray(body.data) || cancelled) return;

        const { cacheSalesSnapshotForStore } = await import("@/lib/idb-catalog");
        const nowIso = new Date().toISOString();

        const snapshot: CachedSale[] = (body.data as any[]).map((sale) => ({
          id: String(sale.id),
          storeId: String(sale.storeId),
          subtotal: Number(sale.subtotal || 0),
          discount: Number(sale.discount || 0),
          tax: Number(sale.tax || 0),
          total: Number(sale.total || 0),
          paymentMethod: String(sale.paymentMethod || "manual"),
          items: (sale.items || []).map((item: any) => ({
            id: String(item.id),
            productId: String(item.productId),
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
            lineTotal: Number(item.lineTotal || 0),
            name: item.name || null,
            quantityReturned: undefined,
          })),
          occurredAt: String(sale.occurredAt || nowIso),
          isOffline: false,
          syncedAt: nowIso,
          serverId: String(sale.id),
        }));

        await cacheSalesSnapshotForStore(selectedStore, snapshot);
      } catch (err) {
        console.warn("Failed to refresh sales snapshot for offline returns", err);
      }
    };

    void syncRecentSalesSnapshot();

    const interval = setInterval(() => {
      void syncRecentSalesSnapshot();
    }, 5 * 60 * 1000); // every 5 minutes

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedStore, isOnline]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({ title: "Back online", description: "Returns will sync to server." });
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast({ title: "You're offline", description: "Returns will be saved locally and synced later.", variant: "destructive" });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [toast]);

  // Track offline return count
  useEffect(() => {
    const loadOfflineCount = async () => {
      try {
        const { getOfflineReturns } = await import("@/lib/idb-catalog");
        const returns = await getOfflineReturns(selectedStore);
        setOfflineReturnCount(returns.length);
      } catch {
        // Ignore
      }
    };
    void loadOfflineCount();
    const interval = setInterval(loadOfflineCount, 10000);
    return () => clearInterval(interval);
  }, [selectedStore]);

  // Helper to initialize draft from cached sale
  const initializeDraftFromCached = (sale: CachedSale) => {
    const next: ReturnDraftState = {};
    sale.items.forEach((item) => {
      const remainingQty = item.quantity - (item.quantityReturned || 0);
      const unitValue = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
      const remainingValue = unitValue * remainingQty;
      next[item.id] = {
        quantity: remainingQty,
        restockAction: "RESTOCK",
        refundType: remainingQty > 0 ? "FULL" : "NONE",
        refundAmount: remainingValue.toFixed(2),
      };
    });
    setDraft(next);
  };

  const initializeDraft = (response: SaleLookupResponse) => {
    const next: ReturnDraftState = {};
    response.items.forEach((item) => {
      // Use remaining quantity (after prior returns) not original quantity
      const remainingQty = item.quantityRemaining ?? item.quantity;
      const unitValue = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
      const remainingValue = unitValue * remainingQty;
      next[item.id] = {
        quantity: remainingQty,
        restockAction: "RESTOCK",
        refundType: remainingQty > 0 ? "FULL" : "NONE",
        refundAmount: remainingValue.toFixed(2),
      };
    });
    setDraft(next);
  };

  const handleLookupSale = async () => {
    if (!selectedStore) {
      toast({ title: "Select a store", variant: "destructive" });
      return;
    }
    if (!saleReference.trim()) {
      toast({ title: "Enter sale ID or receipt", variant: "destructive" });
      return;
    }
    setFetchingSale(true);
    setIsOfflineMode(false);
    setCachedSaleData(null);

    // Helper to try local cache lookup
    const tryLocalCache = async (): Promise<CachedSale | null> => {
      try {
        const { getCachedSale, getSalesForStore } = await import("@/lib/idb-catalog");
        // Try direct ID match first
        let cached = await getCachedSale(saleReference.trim());
        if (cached && cached.storeId === selectedStore) return cached;
        
        // Try searching all cached sales for this store
        const allSales = await getSalesForStore(selectedStore);
        cached = allSales.find(s => 
          s.id === saleReference.trim() || 
          s.idempotencyKey === saleReference.trim() ||
          s.serverId === saleReference.trim()
        ) || null;
        return cached;
      } catch {
        return null;
      }
    };

    // If offline, try local cache only
    if (!navigator.onLine) {
      const cached = await tryLocalCache();
      if (cached) {
        // Check if fully returned locally
        const allReturned = cached.items.every(item => (item.quantityReturned || 0) >= item.quantity);
        if (allReturned) {
          toast({ 
            title: "Sale already fully returned", 
            description: "All items from this sale have already been returned.", 
            variant: "destructive" 
          });
          setSaleData(null);
          setDraft({});
          setFetchingSale(false);
          return;
        }
        
        setCachedSaleData(cached);
        setIsOfflineMode(true);
        initializeDraftFromCached(cached);
        setReason("");
        toast({ 
          title: "Using cached sale data", 
          description: "You're offline. Return will be queued for sync.", 
        });
      } else {
        toast({ 
          title: "Sale not found in cache", 
          description: "This sale isn't cached locally. Try again when online.", 
          variant: "destructive" 
        });
        setSaleData(null);
        setDraft({});
      }
      setFetchingSale(false);
      return;
    }

    // Online: try network with timeout, with intelligent cache fallback
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`/api/pos/sales/${saleReference.trim()}?storeId=${selectedStore}`, {
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 409) {
          toast({ 
            title: "Sale already fully returned", 
            description: errorData.message || "All items from this sale have already been returned.", 
            variant: "destructive" 
          });
          setSaleData(null);
          setDraft({});
          setFetchingSale(false);
          return;
        }
        throw new Error(errorData.message || String(res.status));
      }
      const payload = (await res.json()) as SaleLookupResponse;
      setSaleData(payload);
      setCachedSaleData(null);
      setIsOfflineMode(false);
      initializeDraft(payload);
      setReason("");
    } catch (error) {
      console.error("Failed to fetch sale", error);
      
      // Try local cache as fallback
      const cached = await tryLocalCache();

      // If we're online and the cached sale has already been synced, attempt a
      // second lookup using its serverId so the UI reflects live status.
      if (navigator.onLine && cached && !cached.isOffline && cached.serverId) {
        try {
          const controller2 = new AbortController();
          const timeoutId2 = setTimeout(() => controller2.abort(), 10000);

          const res2 = await fetch(`/api/pos/sales/${cached.serverId}?storeId=${selectedStore}`, {
            credentials: "include",
            signal: controller2.signal,
          });
          clearTimeout(timeoutId2);

          if (res2.ok) {
            const payload = (await res2.json()) as SaleLookupResponse;
            setSaleData(payload);
            setCachedSaleData(null);
            setIsOfflineMode(false);
            initializeDraft(payload);
            setReason("");
            setFetchingSale(false);
            return;
          }
        } catch (secondaryError) {
          console.warn("Secondary sale lookup by serverId failed; falling back to cached data", secondaryError);
        }
      }

      if (cached) {
        setCachedSaleData(cached);
        setIsOfflineMode(true);
        initializeDraftFromCached(cached);
        setReason("");
        toast({ 
          title: "Network unavailable", 
          description: "Using cached sale data. Return will be queued for sync.", 
        });
      } else {
        setSaleData(null);
        setDraft({});
        toast({ title: "Sale not found", description: "Check the sale ID and try again.", variant: "destructive" });
      }
    } finally {
      setFetchingSale(false);
    }
  };

  const handleDraftChange = (saleItemId: string, updater: DraftEntryUpdater) => {
    setDraft((prev) => {
      const current = prev[saleItemId];
      if (!current) return prev;
      return {
        ...prev,
        [saleItemId]: updater(current),
      };
    });
  };

  const computeUnitRefund = (item: SaleItemResponse) => {
    if (!item.quantity) return item.lineTotal;
    return item.lineTotal / item.quantity;
  };

  // Calculate tax rate from the sale (tax / subtotal) - works for both online and cached sales
  const taxRate = useMemo(() => {
    if (isOfflineMode && cachedSaleData) {
      const subtotal = cachedSaleData.subtotal || 0;
      return subtotal > 0 ? cachedSaleData.tax / subtotal : 0;
    }
    if (!saleData) return 0;
    const subtotal = saleData.sale.subtotal || 0;
    return subtotal > 0 ? saleData.sale.tax / subtotal : 0;
  }, [saleData, cachedSaleData, isOfflineMode]);

  const computeRefundForItem = (item: SaleItemResponse) => {
    const draftEntry = draft[item.id];
    if (!draftEntry) return 0;
    const unitValue = computeUnitRefund(item);
    const entryQty = draftEntry.quantity ?? 0;
    const quantity = Math.min(Math.max(entryQty, 0), item.quantity);
    if (draftEntry.refundType === "NONE") return 0;
    if (draftEntry.refundType === "FULL") {
      return unitValue * quantity;
    }
    const requested = Number.parseFloat(draftEntry.refundAmount || "0");
    if (!Number.isFinite(requested) || requested < 0) return 0;
    return Math.min(requested, unitValue * quantity);
  };

  // Compute refund for cached item (offline mode)
  const computeRefundForCachedItem = (item: CachedSaleItem) => {
    const draftEntry = draft[item.id];
    if (!draftEntry) return 0;
    const remainingQty = item.quantity - (item.quantityReturned || 0);
    const unitValue = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
    const entryQty = draftEntry.quantity ?? 0;
    const quantity = Math.min(Math.max(entryQty, 0), remainingQty);
    if (draftEntry.refundType === "NONE") return 0;
    if (draftEntry.refundType === "FULL") {
      return unitValue * quantity;
    }
    const requested = Number.parseFloat(draftEntry.refundAmount || "0");
    if (!Number.isFinite(requested) || requested < 0) return 0;
    return Math.min(requested, unitValue * quantity);
  };

  const totalProductRefund = isOfflineMode && cachedSaleData
    ? cachedSaleData.items.reduce((sum, item) => sum + computeRefundForCachedItem(item), 0)
    : saleData
    ? saleData.items.reduce((sum, item) => sum + computeRefundForItem(item), 0)
    : 0;

  const totalTaxRefund = totalProductRefund * taxRate;

  const totalRefund = totalProductRefund + totalTaxRefund;

  // Process offline return - queues for later sync
  const processOfflineReturn = async () => {
    if (!cachedSaleData) throw new Error("No cached sale data");
    
    const { enqueueOfflineReturn, markItemsReturned, updateLocalInventory, getOfflineReturns } = await import("@/lib/idb-catalog");
    
    const itemsPayload = cachedSaleData.items
      .map((item) => ({ draftEntry: draft[item.id], item }))
      .filter(({ draftEntry }) => Boolean(draftEntry))
      .map(({ draftEntry, item }) => ({ draftEntry: draftEntry!, item }))
      .filter(({ draftEntry, item }) => {
        const remainingQty = item.quantity - (item.quantityReturned || 0);
        return (draftEntry.quantity ?? 0) > 0 && (draftEntry.quantity ?? 0) <= remainingQty;
      })
      .map(({ draftEntry, item }) => {
        const remainingQty = item.quantity - (item.quantityReturned || 0);
        const unitValue = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
        const returnQty = Math.min(Math.max(draftEntry.quantity ?? 0, 0), remainingQty);
        return {
          saleItemId: item.id,
          productId: item.productId,
          quantity: returnQty,
          restockAction: draftEntry.restockAction as "RESTOCK" | "DISCARD",
          refundType: draftEntry.refundType as "NONE" | "FULL" | "PARTIAL",
          refundAmount: draftEntry.refundType === "PARTIAL"
            ? Math.min(Number.parseFloat(draftEntry.refundAmount || "0") || 0, unitValue * returnQty)
            : draftEntry.refundType === "FULL" ? unitValue * returnQty : 0,
        };
      });

    if (!itemsPayload.length) {
      throw new Error("No items selected for return");
    }

    // Calculate potential loss (total refund amount - could be duplicate)
    const potentialLoss = itemsPayload.reduce((sum, item) => sum + item.refundAmount, 0);

    const offlineReturn: OfflineReturnRecord = {
      id: `offline_return_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      saleId: cachedSaleData.id,
      storeId: cachedSaleData.storeId,
      type: "RETURN",
      items: itemsPayload,
      reason: reason.trim() || undefined,
      notes: `Processed offline. Original sale: ${cachedSaleData.isOffline ? "also offline" : "synced"}`,
      createdAt: new Date().toISOString(),
      potentialLoss,
      syncedAt: null,
    };

    // Queue the offline return
    await enqueueOfflineReturn(offlineReturn);

    // Update local tracking: mark items as returned in cached sale
    await markItemsReturned(cachedSaleData.id, itemsPayload.map(i => ({ saleItemId: i.saleItemId, quantity: i.quantity })));

    // Update local inventory optimistically (add back for restocked items)
    for (const item of itemsPayload) {
      if (item.restockAction === "RESTOCK") {
        await updateLocalInventory(cachedSaleData.storeId, item.productId, item.quantity);
      }
    }

    // Update offline return count
    const returns = await getOfflineReturns(selectedStore);
    setOfflineReturnCount(returns.length);

    return { offline: true, id: offlineReturn.id, potentialLoss };
  };

  const processReturnMutation = useMutation({
    mutationFn: async () => {
      // Offline mode - queue return for later sync
      if (isOfflineMode && cachedSaleData) {
        return processOfflineReturn();
      }

      // Online mode - regular API call
      if (!saleData) throw new Error("No sale selected");
      const itemsPayload = saleData.items
        .map((item) => ({ draftEntry: draft[item.id], item }))
        .filter(({ draftEntry }) => Boolean(draftEntry))
        .map(({ draftEntry, item }) => ({ draftEntry: draftEntry!, item }))
        .filter(({ draftEntry, item }) => (draftEntry.quantity ?? 0) > 0 && (draftEntry.quantity ?? 0) <= item.quantity)
        .map(({ draftEntry, item }) => ({
          saleItemId: item.id,
          productId: item.productId,
          quantity: Math.min(Math.max(draftEntry.quantity ?? 0, 0), item.quantity),
          restockAction: draftEntry.restockAction,
          refundType: draftEntry.refundType,
          refundAmount:
            draftEntry.refundType === "PARTIAL"
              ? String(
                  Math.min(
                    Number.parseFloat(draftEntry.refundAmount || "0") || 0,
                    computeUnitRefund(item) * (draftEntry.quantity ?? 0)
                  ).toFixed(2)
                )
              : String(computeRefundForItem(item).toFixed(2)),
        }));

      if (!itemsPayload.length) {
        throw new Error("No items selected for return");
      }

      const payload = {
        saleId: saleData.sale.id,
        storeId: saleData.sale.storeId,
        reason: reason.trim() || undefined,
        items: itemsPayload,
      };

      // Try network with timeout, fallback to offline queue
      try {
        const csrfToken = await getCsrfToken().catch(() => null);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch("/api/pos/returns", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          },
          credentials: "include",
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Return failed with status ${res.status}`);
        }
        return res.json();
      } catch (err) {
        // Network failed - if we have cached data, offer to process offline
        if (cachedSaleData || saleData) {
          // Convert saleData to cached format if needed
          if (!cachedSaleData && saleData) {
            const tempCached: CachedSale = {
              id: saleData.sale.id,
              storeId: saleData.sale.storeId,
              subtotal: saleData.sale.subtotal,
              discount: saleData.sale.discount,
              tax: saleData.sale.tax,
              total: saleData.sale.total,
              paymentMethod: "unknown",
              items: saleData.items.map(item => ({
                id: item.id,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineTotal: item.lineTotal,
                name: item.name,
                quantityReturned: item.quantityReturned,
              })),
              occurredAt: saleData.sale.occurredAt,
              isOffline: false,
              syncedAt: null,
            };
            setCachedSaleData(tempCached);
            setIsOfflineMode(true);
          }
          throw new Error("NETWORK_FAILED");
        }
        throw err;
      }
    },
    onSuccess: (result) => {
      if (result?.offline) {
        toast({ 
          title: "Return queued offline", 
          description: `Will sync when back online. Potential duplicate risk: ${formatCurrency(result.potentialLoss, (currentStore as any)?.currency || "USD")}`,
        });
      } else {
        toast({ title: "Return processed", description: "Inventory and refunds updated." });
      }
      setSaleReference("");
      setSaleData(null);
      setCachedSaleData(null);
      setIsOfflineMode(false);
      setDraft({});
      setReason("");
    },
    onError: (error) => {
      console.error("Return submission failed", error);
      toast({ title: "Return failed", description: "Please verify inputs and try again.", variant: "destructive" });
    },
  });

  // canSubmit works for both online (saleData) and offline (cachedSaleData) modes
  const canSubmit = Boolean(
    (saleData || (isOfflineMode && cachedSaleData)) &&
      ((isOfflineMode && cachedSaleData
        ? cachedSaleData.items.some((item) => {
            const entry = draft[item.id];
            const remainingQty = item.quantity - (item.quantityReturned || 0);
            return entry && (entry.quantity ?? 0) > 0 && (entry.quantity ?? 0) <= remainingQty;
          })
        : saleData?.items.some((item) => {
            const entry = draft[item.id];
            return entry && entry.quantity > 0;
          }))) &&
      !processReturnMutation.isPending
  );

  // Handler to initiate return with offline warning if needed
  const handleProcessReturn = () => {
    if (isOfflineMode) {
      setPendingOfflineAction("return");
      setShowOfflineWarning(true);
    } else {
      processReturnMutation.mutate();
    }
  };

  // Confirm offline action (after warning acknowledged)
  const confirmOfflineAction = () => {
    setShowOfflineWarning(false);
    if (pendingOfflineAction === "return") {
      processReturnMutation.mutate();
    } else if (pendingOfflineAction === "swap") {
      processSwapMutation.mutate();
    }
    setPendingOfflineAction(null);
  };

  const lockedStore = useMemo(() => stores.find((store) => store.id === lockedStoreId) || null, [lockedStoreId, stores]);

  // Get current store for tax rate
  const currentStore = useMemo(() => stores.find((s) => s.id === selectedStore), [stores, selectedStore]);
  const storeTaxRate = useMemo(() => {
    const rate = Number((currentStore as any)?.taxRate || 0);
    return rate / 100; // Convert percentage to decimal
  }, [currentStore]);

  // Swap offline mode state
  const [isSwapOfflineMode, setIsSwapOfflineMode] = useState(false);
  const [cachedSwapSale, setCachedSwapSale] = useState<CachedSale | null>(null);

  // Swap modal functions
  const handleSwapLookupSale = async () => {
    if (!selectedStore) {
      toast({ title: "Select a store", variant: "destructive" });
      return;
    }
    if (!swapState.saleReference.trim()) {
      toast({ title: "Enter sale ID or receipt", variant: "destructive" });
      return;
    }
    setFetchingSwapSale(true);
    setIsSwapOfflineMode(false);
    setCachedSwapSale(null);
    
    // Helper to convert cached sale to SaleLookupResponse format
    const cachedToSaleData = (cached: CachedSale): SaleLookupResponse => ({
      sale: {
        id: cached.serverId || cached.id,
        storeId: cached.storeId,
        subtotal: cached.subtotal,
        discount: cached.discount,
        tax: cached.tax,
        total: cached.total,
        occurredAt: cached.occurredAt,
        status: cached.isOffline ? "PENDING_SYNC" : "COMPLETED",
        currency: (currentStore as any)?.currency || "USD",
      },
      items: cached.items.map(item => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        quantityReturned: item.quantityReturned || 0,
        quantityRemaining: item.quantity - (item.quantityReturned || 0),
        unitPrice: item.unitPrice,
        lineDiscount: 0,
        lineTotal: item.lineTotal,
        name: item.name || null,
        sku: null,
        barcode: null,
      })),
    });
    
    // Helper to try local cache
    const tryLocalCache = async (): Promise<CachedSale | null> => {
      try {
        const { getCachedSale, getSalesForStore } = await import("@/lib/idb-catalog");
        let cached = await getCachedSale(swapState.saleReference.trim());
        if (cached && cached.storeId === selectedStore) return cached;
        
        const allSales = await getSalesForStore(selectedStore);
        cached = allSales.find(s => 
          s.id === swapState.saleReference.trim() || 
          s.idempotencyKey === swapState.saleReference.trim() ||
          s.serverId === swapState.saleReference.trim()
        ) || null;
        return cached;
      } catch {
        return null;
      }
    };
    
    // If offline, try local cache
    if (!navigator.onLine) {
      const cached = await tryLocalCache();
      if (cached) {
        setCachedSwapSale(cached);
        setIsSwapOfflineMode(true);
        setSwapState((prev) => ({
          ...prev,
          saleData: cachedToSaleData(cached),
          selectedItem: null,
          swapQuantity: 1,
        }));
        toast({ title: "Using cached sale data", description: "You're offline. Swap will be queued for sync." });
      } else {
        toast({ title: "Sale not found in cache", description: "Try again when online.", variant: "destructive" });
      }
      setFetchingSwapSale(false);
      return;
    }
    
    // Online: try network with timeout, with intelligent cache fallback
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch(`/api/pos/sales/${swapState.saleReference.trim()}?storeId=${selectedStore}`, {
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || String(res.status));
      }
      const payload = (await res.json()) as SaleLookupResponse;
      setCachedSwapSale(null);
      setIsSwapOfflineMode(false);
      setSwapState((prev) => ({
        ...prev,
        saleData: payload,
        selectedItem: null,
        newProduct: null,
        swapQuantity: 1,
        newProductQuantity: 1,
      }));
    } catch (error) {
      console.error("Failed to fetch sale for swap", error);
      
      // Try local cache as fallback
      const cached = await tryLocalCache();

      // If we're online and the cached sale has already been synced, attempt a
      // second lookup using its serverId so the swap flow reflects live status.
      if (navigator.onLine && cached && !cached.isOffline && cached.serverId) {
        try {
          const controller2 = new AbortController();
          const timeoutId2 = setTimeout(() => controller2.abort(), 10000);

          const res2 = await fetch(`/api/pos/sales/${cached.serverId}?storeId=${selectedStore}`, {
            credentials: "include",
            signal: controller2.signal,
          });
          clearTimeout(timeoutId2);

          if (res2.ok) {
            const payload = (await res2.json()) as SaleLookupResponse;
            setCachedSwapSale(null);
            setIsSwapOfflineMode(false);
            setSwapState((prev) => ({
              ...prev,
              saleData: payload,
              selectedItem: null,
              newProduct: null,
              swapQuantity: 1,
              newProductQuantity: 1,
            }));
            setFetchingSwapSale(false);
            return;
          }
        } catch (secondaryError) {
          console.warn("Secondary swap lookup by serverId failed; falling back to cached data", secondaryError);
        }
      }

      if (cached) {
        setCachedSwapSale(cached);
        setIsSwapOfflineMode(true);
        setSwapState((prev) => ({
          ...prev,
          saleData: cachedToSaleData(cached),
          selectedItem: null,
          swapQuantity: 1,
        }));
        toast({ title: "Network unavailable", description: "Using cached sale data." });
      } else {
        toast({ title: "Sale not found", description: "Check the sale ID and try again.", variant: "destructive" });
      }
    } finally {
      setFetchingSwapSale(false);
    }
  };

  const handleSearchProducts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSwapSearchResults([]);
      return;
    }
    setIsSearchingProducts(true);
    try {
      // Try online first, fallback to local cache
      if (navigator.onLine) {
        const res = await fetch(
          `/api/stores/${selectedStore}/products?query=${encodeURIComponent(query)}&limit=10`,
          { credentials: "include" }
        );
        if (res.ok) {
          const products = await res.json();
          setSwapSearchResults(products.map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku || null,
            barcode: p.barcode || null,
            salePrice: Number(p.salePrice || p.price || 0),
            quantity: p.quantity,
          })));
          return;
        }
      }
      
      // Offline or network failed - use local cache
      const { searchProductsLocally, getInventoryForStore } = await import("@/lib/idb-catalog");
      const products = await searchProductsLocally(query, 10);
      const inventory = await getInventoryForStore(selectedStore);
      const inventoryMap = new Map(inventory.map(i => [i.productId, i.quantity]));
      
      setSwapSearchResults(products.map(p => ({
        id: p.id,
        name: p.name,
        sku: null, // ProductRow doesn't have sku
        barcode: p.barcode || null,
        salePrice: Number(p.price || 0),
        quantity: inventoryMap.get(p.id) ?? 0,
      })));
    } catch (err) {
      console.error("Product search failed", err);
    } finally {
      setIsSearchingProducts(false);
    }
  }, [selectedStore]);

  const handleSwapBarcodeSubmit = useCallback(async (barcode: string) => {
    if (!barcode || !barcode.trim()) return;
    setIsSearchingProducts(true);
    
    const addProduct = (newProduct: ProductSearchResult) => {
      setSwapState((prev) => {
        const existingIdx = prev.newProducts.findIndex(p => p.product.id === newProduct.id);
        if (existingIdx >= 0) {
          const updated = [...prev.newProducts];
          updated[existingIdx] = { ...updated[existingIdx], quantity: (updated[existingIdx].quantity ?? 0) + 1 };
          return { ...prev, newProducts: updated };
        }
        return { ...prev, newProducts: [...prev.newProducts, { product: newProduct, quantity: 1 }] };
      });
      setSwapProductSearch("");
      setSwapSearchResults([]);
      toast({ title: "Product added", description: newProduct.name });
    };
    
    try {
      // Try online first
      if (navigator.onLine) {
        const res = await fetch(`/api/products/barcode/${encodeURIComponent(barcode)}`, { credentials: "include" });
        if (res.ok) {
          const product = await res.json();
          addProduct({
            id: product.id,
            name: product.name,
            sku: product.sku || null,
            barcode: product.barcode || null,
            salePrice: Number(product.salePrice || product.price || 0),
            quantity: product.quantity,
          });
          return;
        }
      }
      
      // Offline or network failed - use local cache
      const { getProductByBarcodeLocally, getInventoryForStore } = await import("@/lib/idb-catalog");
      const product = await getProductByBarcodeLocally(barcode.trim());
      if (product) {
        const inventory = await getInventoryForStore(selectedStore);
        const invRecord = inventory.find(i => i.productId === product.id);
        addProduct({
          id: product.id,
          name: product.name,
          sku: null, // ProductRow doesn't have sku
          barcode: product.barcode || null,
          salePrice: Number(product.price || 0),
          quantity: invRecord?.quantity ?? 0,
        });
      } else {
        toast({ title: "Product not found", description: "Check the barcode and try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Barcode lookup failed", variant: "destructive" });
    } finally {
      setIsSearchingProducts(false);
      setSwapBarcodeInput("");
    }
  }, [toast, selectedStore]);

  // Search products with debounce
  useEffect(() => {
    const timeout = setTimeout(() => handleSearchProducts(swapProductSearch), 300);
    return () => clearTimeout(timeout);
  }, [swapProductSearch, handleSearchProducts]);

  // Calculate swap amounts - use original sale's tax rate for accuracy
  const swapCalculations = useMemo(() => {
    if (!swapState.selectedItem || swapState.newProducts.length === 0) {
      return { originalTotal: 0, newTotal: 0, priceDifference: 0, taxDifference: 0, totalDifference: 0 };
    }
    
    const originalUnitPrice = swapState.selectedItem.unitPrice;
    const maxSwapQty = swapState.selectedItem.quantityRemaining || 1;
    const actualSwapQty = Math.min(swapState.swapQuantity ?? 0, maxSwapQty);
    const originalTotal = originalUnitPrice * actualSwapQty;
    
    // Sum all new products' totals (treat undefined as 0)
    const newTotal = swapState.newProducts.reduce((sum, item) => sum + (item.product.salePrice * (item.quantity ?? 0)), 0);
    const priceDifference = newTotal - originalTotal;
    
    // Calculate tax rate from original sale (not store) for accuracy
    const saleTaxRate = swapState.saleData?.sale 
      ? (Number(swapState.saleData.sale.tax || 0) / Number(swapState.saleData.sale.subtotal || 1))
      : storeTaxRate;
    const taxDifference = priceDifference * saleTaxRate;
    const totalDifference = priceDifference + taxDifference;
    
    return { originalTotal, newTotal, priceDifference, taxDifference, totalDifference };
  }, [swapState.selectedItem, swapState.newProducts, swapState.swapQuantity, swapState.saleData, storeTaxRate]);

  // Process offline swap - queues for later sync
  const processOfflineSwap = async () => {
    if (!swapState.saleData || !swapState.selectedItem || swapState.newProducts.length === 0) {
      throw new Error("Missing swap data");
    }
    
    const { enqueueOfflineReturn, markItemsReturned, updateLocalInventory, getOfflineReturns } = await import("@/lib/idb-catalog");
    
    const originalQty = Math.min(swapState.swapQuantity ?? 0, swapState.selectedItem.quantityRemaining || 1);
    
    // Calculate potential loss (refund value if it's a negative swap)
    const potentialLoss = swapCalculations.totalDifference < 0 ? Math.abs(swapCalculations.totalDifference) : 0;
    
    const offlineSwap: OfflineReturnRecord = {
      id: `offline_swap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      saleId: cachedSwapSale?.id || swapState.saleData.sale.id,
      storeId: selectedStore,
      type: "SWAP",
      items: [{
        saleItemId: swapState.selectedItem.id,
        productId: swapState.selectedItem.productId,
        quantity: originalQty,
        restockAction: swapState.restockAction as "RESTOCK" | "DISCARD",
        refundType: "FULL",
        refundAmount: swapCalculations.originalTotal,
      }],
      reason: swapState.notes.trim() || undefined,
      notes: `Offline swap. New products: ${swapState.newProducts.map(p => `${p.product.name} x${p.quantity}`).join(", ")}`,
      createdAt: new Date().toISOString(),
      potentialLoss,
      syncedAt: null,
      // Store swap-specific data in notes for server processing
      swapData: {
        newProducts: swapState.newProducts.map(item => ({
          productId: item.product.id,
          quantity: item.quantity ?? 0,
          unitPrice: item.product.salePrice,
          name: item.product.name,
        })),
        paymentMethod: swapState.paymentMethod,
        totalDifference: swapCalculations.totalDifference,
      },
    };
    
    // Queue the offline swap
    await enqueueOfflineReturn(offlineSwap);
    
    // Update local tracking
    if (cachedSwapSale) {
      await markItemsReturned(cachedSwapSale.id, [{ saleItemId: swapState.selectedItem.id, quantity: originalQty }]);
    }
    
    // Update local inventory optimistically
    // Add back original product if restocking
    if (swapState.restockAction === "RESTOCK") {
      await updateLocalInventory(selectedStore, swapState.selectedItem.productId, originalQty);
    }
    // Subtract new products from inventory
    for (const item of swapState.newProducts) {
      await updateLocalInventory(selectedStore, item.product.id, -(item.quantity ?? 0));
    }
    
    // Update offline return count
    const returns = await getOfflineReturns(selectedStore);
    setOfflineReturnCount(returns.length);
    
    return { offline: true, id: offlineSwap.id, potentialLoss, totalDifference: swapCalculations.totalDifference };
  };

  const processSwapMutation = useMutation({
    mutationFn: async () => {
      // Offline mode - queue swap for later sync
      if (isSwapOfflineMode || !navigator.onLine) {
        return processOfflineSwap();
      }
      
      if (!swapState.saleData || !swapState.selectedItem || swapState.newProducts.length === 0) {
        throw new Error("Missing swap data");
      }

      const payload = {
        saleId: swapState.saleData.sale.id,
        storeId: selectedStore,
        originalSaleItemId: swapState.selectedItem.id,
        originalProductId: swapState.selectedItem.productId,
        originalQuantity: Math.min(swapState.swapQuantity ?? 0, swapState.selectedItem.quantityRemaining || 1),
        originalUnitPrice: swapState.selectedItem.unitPrice,
        newProducts: swapState.newProducts.map(item => ({
          productId: item.product.id,
          quantity: item.quantity ?? 0,
          unitPrice: item.product.salePrice,
        })),
        restockAction: swapState.restockAction,
        paymentMethod: swapState.paymentMethod,
        notes: swapState.notes.trim() || undefined,
      };

      // Try network with timeout
      try {
        const csrfToken = await getCsrfToken().catch(() => null);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const res = await fetch("/api/pos/swaps", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          },
          credentials: "include",
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Swap failed with status ${res.status}`);
        }
        return res.json();
      } catch (err) {
        // Network failed - try offline processing
        if ((err as Error).name === "AbortError" || !navigator.onLine) {
          setIsSwapOfflineMode(true);
          return processOfflineSwap();
        }
        throw err;
      }
    },
    onSuccess: async (data) => {
      const currency = (currentStore as any)?.currency || "USD";
      
      // Handle offline result
      if (data?.offline) {
        const diff = data.totalDifference || 0;
        toast({ 
          title: "Swap queued offline", 
          description: `Will sync when back online. ${diff < 0 ? `Potential refund: ${formatCurrency(Math.abs(diff), currency)}` : ""}`,
        });
        // Reset state
        setSwapState({
          saleReference: "",
          saleData: null,
          selectedItem: null,
          newProducts: [],
          swapQuantity: 1,
          restockAction: "RESTOCK",
          paymentMethod: "CASH",
          notes: "",
        });
        setSwapProductSearch("");
        setSwapSearchResults([]);
        setIsSwapModalOpen(false);
        setIsSwapOfflineMode(false);
        setCachedSwapSale(null);
        return;
      }
      
      const diff = data.swap?.totalDifference || 0;
      const description = diff > 0 
        ? `Customer charged ${formatCurrency(diff, currency)}`
        : diff < 0 
        ? `Customer refunded ${formatCurrency(Math.abs(diff), currency)}`
        : "Even swap - no payment required";
      
      // Build and print swap receipt
      const receiptItems = [
        {
          name: `RETURN: ${swapState.selectedItem?.name || "Original Product"}`,
          quantity: swapState.swapQuantity ?? 0,
          unitPrice: -(swapState.selectedItem?.unitPrice || 0),
          total: -swapCalculations.originalTotal,
        },
        ...swapState.newProducts.map(item => ({
          name: `NEW: ${item.product.name}`,
          quantity: item.quantity ?? 0,
          unitPrice: item.product.salePrice,
          total: item.product.salePrice * (item.quantity ?? 0),
        })),
      ];
      const swapReceipt: ReceiptPrintJob = {
        receiptNumber: data.swap?.receiptNumber || `SWAP-${Date.now()}`,
        storeName: currentStore?.name || "Store",
        storeAddress: (currentStore as any)?.address,
        cashier: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user?.username,
        timestamp: new Date().toISOString(),
        items: receiptItems,
        totals: {
          subtotal: swapCalculations.priceDifference,
          discount: 0,
          tax: swapCalculations.taxDifference,
          total: swapCalculations.totalDifference,
          currency,
          paymentMethod: diff > 0 ? "CHARGE" : diff < 0 ? "REFUND" : "EVEN",
        },
        footerNote: `Product Swap - ${swapState.restockAction === "RESTOCK" ? "Item Restocked" : "Item Discarded"}`,
      };

      try {
        await printReceipt(swapReceipt);
      } catch (err) {
        console.error("Failed to print swap receipt", err);
        toast({
          title: "Receipt print failed",
          description: "Swap was successful but receipt could not be printed.",
          variant: "destructive",
        });
      }
      
      toast({ 
        title: "Swap processed successfully", 
        description,
      });
      
      // Reset swap state
      setSwapState({
        saleReference: "",
        saleData: null,
        selectedItem: null,
        newProducts: [],
        swapQuantity: 1,
        restockAction: "RESTOCK",
        paymentMethod: "CASH",
        notes: "",
      });
      setSwapProductSearch("");
      setSwapSearchResults([]);
      setIsSwapModalOpen(false);
    },
    onError: (error) => {
      console.error("Swap failed", error);
      toast({ 
        title: "Swap failed", 
        description: error instanceof Error ? error.message : "Please verify inputs and try again.", 
        variant: "destructive" 
      });
    },
  });

  const canSubmitSwap = Boolean(
    swapState.saleData &&
    swapState.selectedItem &&
    swapState.newProducts.length > 0 &&
    swapState.newProducts.every(p => (p.quantity ?? 0) > 0) &&
    (swapState.swapQuantity ?? 0) > 0 &&
    !processSwapMutation.isPending
  );

  const resetSwapModal = () => {
    setSwapState({
      saleReference: "",
      saleData: null,
      selectedItem: null,
      newProducts: [],
      swapQuantity: 1,
      restockAction: "RESTOCK",
      paymentMethod: "CASH",
      notes: "",
    });
    setSwapProductSearch("");
    setSwapSearchResults([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase text-slate-500 flex items-center gap-2">
            Sync status
            {!isOnline && (
              <span className="inline-flex items-center gap-1 text-red-600">
                <WifiOff className="h-3 w-3" />
                Offline
              </span>
            )}
          </p>
          <p className="text-sm text-slate-700">
            {lastSync ? (
              <>
                Last sync attempted {lastSync.attempted} • synced {lastSync.synced}
              </>
            ) : (
              "No sync stats yet"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={queuedCount > 0 ? "secondary" : "outline"} className={queuedCount > 0 ? "bg-amber-100 text-amber-900 border-amber-200" : "text-slate-600"}>
            {queuedCount > 0 ? `${queuedCount} pending sale${queuedCount > 1 ? "s" : ""}` : "Queue clear"}
          </Badge>
          {offlineReturnCount > 0 && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-900 border-orange-200">
              {offlineReturnCount} pending return{offlineReturnCount > 1 ? "s" : ""}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={handleSyncNow} disabled={!isOnline}>
            Sync now
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsSyncCenterOpen(true)}>
            Open Sync Center
          </Button>
        </div>
      </div>
      {!isOnline && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 flex items-center gap-2">
          <WifiOff className="h-4 w-4" />
          You are offline. Returns and swaps will be queued locally and synced when you reconnect.
        </div>
      )}
      {escalations > 0 && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Some queued sales have retried multiple times. Check connection or contact support if this persists.
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "returns" | "swaps")} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="returns" className="flex items-center gap-2">
            <Undo2 className="h-4 w-4" />
            Returns
          </TabsTrigger>
          <TabsTrigger value="swaps" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Product Swaps
          </TabsTrigger>
        </TabsList>

        <TabsContent value="returns" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Product Returns</CardTitle>
              <CardDescription>Look up a sale and capture the return details for audit + inventory sync.</CardDescription>
            </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="store">Store</Label>
              {lockedStoreId ? (
                <Input
                  id="store"
                  value={lockedStore?.name || "Current store"}
                  readOnly
                  disabled
                  className="bg-slate-100"
                />
              ) : (
                <Select value={selectedStore} onValueChange={setSelectedStore} disabled={loadingStores}>
                  <SelectTrigger id="store">
                    <SelectValue placeholder={loadingStores ? "Loading stores" : "Select store"} />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="sale">Sale / Receipt ID</Label>
              <div className="flex gap-2">
                <Input
                  id="sale"
                  placeholder="e.g. sale UUID"
                  value={saleReference}
                  onChange={(event) => setSaleReference(event.target.value)}
                />
                <Button onClick={handleLookupSale} disabled={fetchingSale || !selectedStore}>
                  {fetchingSale ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Fetch
                </Button>
              </div>
            </div>
          </div>
          {saleData ? (
            <div className="text-sm text-slate-600">
              Showing sale <span className="font-semibold text-slate-800">{saleData.sale.id}</span>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Use the receipt or sale ID to load details.</div>
          )}
        </CardContent>
      </Card>

      {/* Sale Summary - works for both online (saleData) and offline (cachedSaleData) */}
      {(saleData || (isOfflineMode && cachedSaleData)) && (
        <>
          {isOfflineMode && cachedSaleData && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 flex items-center gap-2">
              <WifiOff className="h-4 w-4" />
              <span>
                <strong>Offline Mode:</strong> Using cached sale data. 
                {cachedSaleData.isOffline && " This sale was also created offline and may not be synced yet."}
              </span>
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Sale summary</CardTitle>
              <CardDescription>
                {isOfflineMode && cachedSaleData ? (
                  <>
                    Processed {formatDateTime(new Date(cachedSaleData.occurredAt))} · 
                    <Badge variant="secondary" className="ml-2 uppercase">
                      {cachedSaleData.isOffline ? "PENDING SYNC" : "CACHED"}
                    </Badge>
                  </>
                ) : saleData ? (
                  <>
                    Processed {formatDateTime(new Date(saleData.sale.occurredAt))} · Status
                    <Badge variant="secondary" className="ml-2 uppercase">
                      {saleData.sale.status}
                    </Badge>
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Subtotal</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(
                    isOfflineMode && cachedSaleData ? cachedSaleData.subtotal : saleData?.sale.subtotal || 0,
                    (isOfflineMode && cachedSaleData ? (currentStore as any)?.currency : saleData?.sale.currency) || "USD"
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Discount</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(
                    isOfflineMode && cachedSaleData ? cachedSaleData.discount : saleData?.sale.discount || 0,
                    (isOfflineMode && cachedSaleData ? (currentStore as any)?.currency : saleData?.sale.currency) || "USD"
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Tax</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(
                    isOfflineMode && cachedSaleData ? cachedSaleData.tax : saleData?.sale.tax || 0,
                    (isOfflineMode && cachedSaleData ? (currentStore as any)?.currency : saleData?.sale.currency) || "USD"
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(
                    isOfflineMode && cachedSaleData ? cachedSaleData.total : saleData?.sale.total || 0,
                    (isOfflineMode && cachedSaleData ? (currentStore as any)?.currency : saleData?.sale.currency) || "USD"
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription>Adjust quantities, restock actions, and refund types per line.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-[120px]">Qty to return</TableHead>
                    <TableHead>Restock</TableHead>
                    <TableHead>Refund</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Render items from either online saleData or offline cachedSaleData */}
                  {(isOfflineMode && cachedSaleData ? cachedSaleData.items : saleData?.items || []).map((item) => {
                    const entry = draft[item.id];
                    if (!entry) return null;
                    // Handle both online and offline item structures
                    const maxQty = isOfflineMode && cachedSaleData 
                      ? item.quantity - ((item as CachedSaleItem).quantityReturned || 0)
                      : (item as SaleItemResponse).quantityRemaining ?? item.quantity;
                    const alreadyReturned = isOfflineMode && cachedSaleData 
                      ? ((item as CachedSaleItem).quantityReturned || 0)
                      : ((item as SaleItemResponse).quantityReturned ?? 0);
                    const isFullyReturned = maxQty <= 0;
                    return (
                      <TableRow key={item.id} data-testid={`return-row-${item.id}`} className={isFullyReturned ? "opacity-50" : ""}>
                        <TableCell>
                          <div className="font-medium text-slate-800">{item.name || 'Product'}</div>
                          <div className="text-xs text-slate-500">
                            {isOfflineMode ? `ID: ${item.productId.slice(0, 8)}...` : `SKU: ${(item as SaleItemResponse).sku || '–'}`}
                          </div>
                          {alreadyReturned > 0 && (
                            <div className="text-xs text-amber-600 mt-1">
                              {alreadyReturned} of {item.quantity} already returned
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {isFullyReturned ? (
                            <div className="text-sm text-slate-500">Fully returned</div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    handleDraftChange(item.id, (current) => ({
                                      ...current,
                                      quantity: Math.max(0, (current.quantity ?? 1) - 1),
                                    }));
                                  }}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <Input
                                  type="number"
                                  min={0}
                                  max={maxQty}
                                  value={entry.quantity ?? ""}
                                  data-testid={`return-qty-${item.id}`}
                                  className="w-14 h-8 text-center font-medium px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  onChange={(event) => {
                                    const val = event.target.value;
                                    if (val === "") {
                                      handleDraftChange(item.id, (current) => ({
                                        ...current,
                                        quantity: undefined,
                                      }));
                                    } else {
                                      const nextQty = Math.max(0, Math.min(Number(val) || 0, maxQty));
                                      handleDraftChange(item.id, (current) => ({
                                        ...current,
                                        quantity: nextQty,
                                      }));
                                    }
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    handleDraftChange(item.id, (current) => ({
                                      ...current,
                                      quantity: Math.min(maxQty, (current.quantity ?? 0) + 1),
                                    }));
                                  }}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="text-xs text-slate-500">Max {maxQty}</div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={entry.restockAction}
                            onValueChange={(value: RestockAction) =>
                              handleDraftChange(item.id, (current) => ({ ...current, restockAction: value }))
                            }
                          >
                            <SelectTrigger data-testid={`restock-trigger-${item.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="RESTOCK">Restock</SelectItem>
                              <SelectItem value="DISCARD">Discard</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={entry.refundType}
                            onValueChange={(value: RefundType) =>
                              handleDraftChange(item.id, (current) => {
                                // Compute unit refund based on available data
                                const unitValue = item.quantity > 0 ? (item.lineTotal / item.quantity) : 0;
                                const baseAmount = (unitValue * (current.quantity ?? 0)).toFixed(2);
                                if (value === 'FULL') {
                                  return { ...current, refundType: value, refundAmount: baseAmount };
                                }
                                if (value === 'NONE') {
                                  return { ...current, refundType: value, refundAmount: '0.00' };
                                }
                                return { ...current, refundType: value };
                              })
                            }
                          >
                            <SelectTrigger data-testid={`refund-trigger-${item.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="FULL">Full</SelectItem>
                              <SelectItem value="PARTIAL">Partial</SelectItem>
                              <SelectItem value="NONE">No refund</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            // Compute refund inline to work with both item types
                            const unitValue = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
                            const entryQty = entry.quantity ?? 0;
                            const refundAmount = entry.refundType === "NONE" ? 0 
                              : entry.refundType === "FULL" ? unitValue * entryQty
                              : Math.min(Number.parseFloat(entry.refundAmount || "0") || 0, unitValue * entryQty);
                            const taxRefundAmount = refundAmount * taxRate;
                            const currency = (isOfflineMode ? (currentStore as any)?.currency : saleData?.sale.currency) || "USD";
                            
                            return entry.refundType === 'PARTIAL' ? (
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={entry.refundAmount}
                                  data-testid={`refund-amount-${item.id}`}
                                  onChange={(event) =>
                                    handleDraftChange(item.id, (current) => ({
                                      ...current,
                                      refundAmount: event.target.value,
                                    }))
                                  }
                                />
                                {taxRate > 0 && (
                                  <div className="text-xs text-amber-600">
                                    + {formatCurrency(taxRefundAmount, currency)} tax
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <div className="text-sm font-medium text-slate-800">
                                  {formatCurrency(refundAmount, currency)}
                                </div>
                                {taxRate > 0 && refundAmount > 0 && (
                                  <div className="text-xs text-amber-600">
                                    + {formatCurrency(taxRefundAmount, currency)} tax
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Finalize return</CardTitle>
              <CardDescription>Confirm refund amounts and capture any notes for the audit log.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reason">Reason / notes</Label>
                <Textarea
                  id="reason"
                  placeholder="Describe why the items were returned"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs uppercase text-slate-500">Product refund</p>
                      <p className="text-lg font-medium text-slate-700">
                        {formatCurrency(totalProductRefund, (isOfflineMode ? (currentStore as any)?.currency : saleData?.sale.currency) || "USD")}
                      </p>
                    </div>
                    <div className="text-slate-400">+</div>
                    <div>
                      <p className="text-xs uppercase text-amber-600">Tax refund</p>
                      <p className="text-lg font-medium text-amber-600">
                        {formatCurrency(totalTaxRefund, (isOfflineMode ? (currentStore as any)?.currency : saleData?.sale.currency) || "USD")}
                      </p>
                    </div>
                    <div className="text-slate-400">=</div>
                    <div>
                      <p className="text-xs uppercase text-slate-500">Total refund</p>
                      <p className="text-2xl font-semibold text-slate-900">
                        {formatCurrency(totalRefund, (isOfflineMode ? (currentStore as any)?.currency : saleData?.sale.currency) || "USD")}
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  className="min-w-[180px]"
                  disabled={!canSubmit}
                  onClick={handleProcessReturn}
                >
                  {processReturnMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : isOfflineMode ? (
                    <WifiOff className="mr-2 h-4 w-4" />
                  ) : null}
                  {isOfflineMode ? "Queue return offline" : "Process return"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
          )}
        </TabsContent>

        <TabsContent value="swaps" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Product Swaps</CardTitle>
              <CardDescription>
                Exchange a purchased product for a different product. Customer pays/receives the difference.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-slate-600 mb-2">
                    Process a product swap when a customer wants to exchange their purchase for a different item.
                    The price difference (including tax on the difference) will be calculated automatically.
                  </p>
                  <ul className="text-sm text-slate-500 list-disc list-inside space-y-1">
                    <li>Customer pays extra if new product costs more</li>
                    <li>Customer receives refund if new product costs less</li>
                    <li>Even swap if prices are equal (no payment needed)</li>
                  </ul>
                </div>
                <Button
                  onClick={() => {
                    resetSwapModal();
                    setIsSwapModalOpen(true);
                  }}
                  className="min-w-[180px]"
                >
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Start Swap
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Swap Modal */}
      <Dialog open={isSwapModalOpen} onOpenChange={(open) => {
        if (!open) resetSwapModal();
        setIsSwapModalOpen(open);
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Process Product Swap
            </DialogTitle>
            <DialogDescription>
              Enter the receipt ID, select the product to swap, and choose the replacement product.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Step 1: Lookup Sale */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">1</div>
                <h3 className="font-medium">Look up original sale</h3>
              </div>
              <div className="flex gap-2 ml-8">
                <Input
                  placeholder="Enter receipt/sale ID"
                  value={swapState.saleReference}
                  onChange={(e) => setSwapState((prev) => ({ ...prev, saleReference: e.target.value }))}
                />
                <Button onClick={handleSwapLookupSale} disabled={fetchingSwapSale || !selectedStore}>
                  {fetchingSwapSale ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Fetch
                </Button>
              </div>
              {swapState.saleData && (
                <div className="ml-8 text-sm text-green-600">
                  ✓ Sale found - {formatDateTime(new Date(swapState.saleData.sale.occurredAt))}
                </div>
              )}
            </div>

            {/* Step 2: Select Item to Swap */}
            {swapState.saleData && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">2</div>
                  <h3 className="font-medium">Select item to swap</h3>
                </div>
                <div className="ml-8 space-y-2">
                  {swapState.saleData.items.filter(item => (item.quantityRemaining ?? item.quantity) > 0).map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        swapState.selectedItem?.id === item.id
                          ? "border-primary bg-primary/5"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => setSwapState((prev) => ({
                        ...prev,
                        selectedItem: item,
                        swapQuantity: Math.min(1, item.quantityRemaining ?? item.quantity),
                      }))}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{item.name || "Product"}</div>
                          <div className="text-sm text-slate-500">SKU: {item.sku || "–"}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">
                            {formatCurrency(item.unitPrice, swapState.saleData!.sale.currency as any)}
                          </div>
                          <div className="text-sm text-slate-500">
                            {item.quantityRemaining ?? item.quantity} available
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Select New Product */}
            {swapState.selectedItem && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">3</div>
                  <h3 className="font-medium">Select replacement product</h3>
                </div>
                <div className="ml-8 space-y-3">
                  {/* Barcode Input */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Scan barcode..."
                      value={swapBarcodeInput}
                      onChange={(e) => setSwapBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && swapBarcodeInput.trim()) {
                          void handleSwapBarcodeSubmit(swapBarcodeInput.trim());
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      onClick={() => void handleSwapBarcodeSubmit(swapBarcodeInput.trim())}
                      disabled={!swapBarcodeInput.trim() || isSearchingProducts}
                    >
                      Scan
                    </Button>
                  </div>
                  
                  {/* Product Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search products by name..."
                      className="pl-10"
                      value={swapProductSearch}
                      onChange={(e) => setSwapProductSearch(e.target.value)}
                    />
                    {isSearchingProducts && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
                    )}
                  </div>

                  {/* Search Results */}
                  {swapSearchResults.length > 0 && (
                    <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                      {swapSearchResults.map((product) => {
                        const alreadyAdded = swapState.newProducts.some(p => p.product.id === product.id);
                        return (
                          <div
                            key={product.id}
                            className={`p-2 cursor-pointer ${alreadyAdded ? "bg-green-50" : "hover:bg-slate-50"}`}
                            onClick={() => {
                              if (alreadyAdded) {
                                // Increment quantity
                                setSwapState((prev) => ({
                                  ...prev,
                                  newProducts: prev.newProducts.map(p => 
                                    p.product.id === product.id 
                                      ? { ...p, quantity: (p.quantity ?? 0) + 1 }
                                      : p
                                  ),
                                }));
                              } else {
                                // Add new product
                                setSwapState((prev) => ({
                                  ...prev,
                                  newProducts: [...prev.newProducts, { product, quantity: 1 }],
                                }));
                              }
                              setSwapProductSearch("");
                              setSwapSearchResults([]);
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Plus className="h-4 w-4 text-slate-400" />
                                <div>
                                  <div className="font-medium text-sm">{product.name}</div>
                                  <div className="text-xs text-slate-500">
                                    {product.sku && `SKU: ${product.sku}`} 
                                    {product.quantity !== undefined && ` • ${product.quantity} in stock`}
                                  </div>
                                </div>
                              </div>
                              <div className="font-medium text-sm">
                                {formatCurrency(product.salePrice, (currentStore as any)?.currency || "USD")}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Selected New Products List */}
                  {swapState.newProducts.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm text-slate-600">Products to swap to ({swapState.newProducts.length})</Label>
                      <div className="border rounded-lg divide-y">
                        {swapState.newProducts.map((item, idx) => (
                          <div key={item.product.id} className="p-3 bg-green-50">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-green-800 truncate">{item.product.name}</div>
                                <div className="text-xs text-green-600">
                                  {formatCurrency(item.product.salePrice, (currentStore as any)?.currency || "USD")} each
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    const newQty = Math.max(1, (item.quantity ?? 1) - 1);
                                    setSwapState((prev) => ({
                                      ...prev,
                                      newProducts: prev.newProducts.map((p, i) => 
                                        i === idx ? { ...p, quantity: newQty } : p
                                      ),
                                    }));
                                  }}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <Input
                                  type="number"
                                  min={1}
                                  max={item.product.quantity ?? 99}
                                  value={item.quantity ?? ""}
                                  className="w-12 h-8 text-center font-medium px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "") {
                                      setSwapState((prev) => ({
                                        ...prev,
                                        newProducts: prev.newProducts.map((p, i) => 
                                          i === idx ? { ...p, quantity: undefined } : p
                                        ),
                                      }));
                                    } else {
                                      const qty = Math.max(1, Math.min(Number(val) || 1, item.product.quantity ?? 99));
                                      setSwapState((prev) => ({
                                        ...prev,
                                        newProducts: prev.newProducts.map((p, i) => 
                                          i === idx ? { ...p, quantity: qty } : p
                                        ),
                                      }));
                                    }
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    const maxQty = item.product.quantity ?? 99;
                                    const newQty = Math.min(maxQty, (item.quantity ?? 0) + 1);
                                    setSwapState((prev) => ({
                                      ...prev,
                                      newProducts: prev.newProducts.map((p, i) => 
                                        i === idx ? { ...p, quantity: newQty } : p
                                      ),
                                    }));
                                  }}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                                <div className="text-sm font-medium text-green-800 w-20 text-right">
                                  {formatCurrency(item.product.salePrice * (item.quantity ?? 0), (currentStore as any)?.currency || "USD")}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setSwapState((prev) => ({
                                    ...prev,
                                    newProducts: prev.newProducts.filter((_, i) => i !== idx),
                                  }))}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Configure Swap */}
            {swapState.newProducts.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">4</div>
                  <h3 className="font-medium">Configure swap</h3>
                </div>
                <div className="ml-8 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Quantity to swap (original item)</Label>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10"
                          onClick={() => setSwapState((prev) => ({
                            ...prev,
                            swapQuantity: Math.max(1, (prev.swapQuantity ?? 1) - 1),
                          }))}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          max={swapState.selectedItem?.quantityRemaining ?? 1}
                          value={swapState.swapQuantity ?? ""}
                          className="flex-1 h-10 text-center font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") {
                              setSwapState((prev) => ({ ...prev, swapQuantity: undefined }));
                            } else {
                              const max = swapState.selectedItem?.quantityRemaining ?? 1;
                              setSwapState((prev) => ({
                                ...prev,
                                swapQuantity: Math.max(1, Math.min(Number(val) || 1, max)),
                              }));
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10"
                          onClick={() => {
                            const max = swapState.selectedItem?.quantityRemaining ?? 1;
                            setSwapState((prev) => ({
                              ...prev,
                              swapQuantity: Math.min(max, (prev.swapQuantity ?? 0) + 1),
                            }));
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="text-xs text-slate-500">
                        Max: {swapState.selectedItem?.quantityRemaining ?? 1}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Returned item action</Label>
                      <Select
                        value={swapState.restockAction}
                        onValueChange={(value: RestockAction) => setSwapState((prev) => ({ ...prev, restockAction: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RESTOCK">Restock (item is sellable)</SelectItem>
                          <SelectItem value="DISCARD">Discard (item is damaged/unsellable)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Payment method</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant={swapState.paymentMethod === "CASH" ? "default" : "outline"}
                        className="h-14 flex-col gap-1"
                        onClick={() => setSwapState((prev) => ({ ...prev, paymentMethod: "CASH" }))}
                      >
                        <Banknote className="w-5 h-5" />
                        <span className="text-xs">Cash</span>
                      </Button>
                      <Button
                        type="button"
                        variant={swapState.paymentMethod === "CARD" ? "default" : "outline"}
                        className="h-14 flex-col gap-1"
                        onClick={() => setSwapState((prev) => ({ ...prev, paymentMethod: "CARD" }))}
                      >
                        <CreditCard className="w-5 h-5" />
                        <span className="text-xs">Card</span>
                      </Button>
                      <Button
                        type="button"
                        variant={swapState.paymentMethod === "DIGITAL" ? "default" : "outline"}
                        className="h-14 flex-col gap-1"
                        onClick={() => setSwapState((prev) => ({ ...prev, paymentMethod: "DIGITAL" }))}
                      >
                        <Smartphone className="w-5 h-5" />
                        <span className="text-xs">Digital</span>
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea
                      placeholder="Reason for swap, customer feedback, etc."
                      value={swapState.notes}
                      onChange={(e) => setSwapState((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>

                  {/* Price Calculation Summary */}
                  <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Original product value:</span>
                      <span className="font-medium">
                        {formatCurrency(swapCalculations.originalTotal, (currentStore as any)?.currency || "USD")}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>New product value:</span>
                      <span className="font-medium">
                        {formatCurrency(swapCalculations.newTotal, (currentStore as any)?.currency || "USD")}
                      </span>
                    </div>
                    <div className="border-t pt-2">
                      <div className="flex justify-between text-sm">
                        <span>Price difference:</span>
                        <span className={`font-medium ${swapCalculations.priceDifference >= 0 ? "text-slate-800" : "text-green-600"}`}>
                          {swapCalculations.priceDifference >= 0 ? "+" : ""}
                          {formatCurrency(swapCalculations.priceDifference, (currentStore as any)?.currency || "USD")}
                        </span>
                      </div>
                      {swapCalculations.taxDifference !== 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-600">Tax on difference:</span>
                          <span className={`font-medium ${swapCalculations.taxDifference >= 0 ? "text-amber-600" : "text-green-600"}`}>
                            {swapCalculations.taxDifference >= 0 ? "+" : ""}
                            {formatCurrency(swapCalculations.taxDifference, (currentStore as any)?.currency || "USD")}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="border-t pt-2">
                      <div className="flex justify-between">
                        <span className="font-medium">
                          {swapCalculations.totalDifference > 0 
                            ? "Customer pays:" 
                            : swapCalculations.totalDifference < 0 
                            ? "Refund to customer:" 
                            : "Even swap:"}
                        </span>
                        <span className={`text-lg font-bold ${
                          swapCalculations.totalDifference > 0 
                            ? "text-blue-600" 
                            : swapCalculations.totalDifference < 0 
                            ? "text-green-600" 
                            : "text-slate-600"
                        }`}>
                          {formatCurrency(Math.abs(swapCalculations.totalDifference), (currentStore as any)?.currency || "USD")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit */}
            <div className="flex flex-col gap-2 pt-4 border-t">
              {(isSwapOfflineMode || !isOnline) && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 flex items-center gap-2">
                  <WifiOff className="h-4 w-4" />
                  <span>
                    <strong>Offline Mode:</strong> Using cached inventory. Swap will be queued and synced when online.
                    {swapCalculations.totalDifference < 0 && " Customer refund may be at risk of duplication."}
                  </span>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsSwapModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (isSwapOfflineMode || !isOnline) {
                      setPendingOfflineAction("swap");
                      setShowOfflineWarning(true);
                    } else {
                      processSwapMutation.mutate();
                    }
                  }}
                  disabled={!canSubmitSwap}
                >
                  {processSwapMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {(isSwapOfflineMode || !isOnline) && <WifiOff className="mr-2 h-4 w-4" />}
                  {(isSwapOfflineMode || !isOnline) ? "Queue Swap Offline" : "Process Swap"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SyncCenter open={isSyncCenterOpen} onClose={() => setIsSyncCenterOpen(false)} />

      {/* Offline Warning Dialog */}
      <AlertDialog open={showOfflineWarning} onOpenChange={setShowOfflineWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Processing {pendingOfflineAction === "swap" ? "Swap" : "Return"} Offline
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You are about to process this {pendingOfflineAction === "swap" ? "swap" : "return"} while offline. 
                This will be queued and synced when you are back online.
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-semibold">⚠️ Duplicate Risk Warning</p>
                <p className="mt-1">
                  If the customer attempts to process this same {pendingOfflineAction === "swap" ? "swap" : "return"} again 
                  at another location or when online, it may result in a duplicate refund. 
                  The potential loss of <strong>{formatCurrency(totalRefund, (currentStore as any)?.currency || "USD")}</strong> will 
                  be logged for reconciliation.
                </p>
              </div>
              <p className="text-sm text-slate-600">
                Make sure to clearly mark the receipt and inform the customer that this was processed offline.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingOfflineAction(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmOfflineAction} className="bg-amber-600 hover:bg-amber-700">
              I Understand, Process Offline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

