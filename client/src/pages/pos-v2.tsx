import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Menu,
  X,
  Maximize,
  Minimize,
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
  ScanLine,
  Plus,
  Minus,
  Trash2,
  Banknote,
  CreditCard,
  Smartphone,
  Check,
  Pause,
  Users,
  LogOut,
  Settings,
  ArrowRightLeft,
  Package,
  Tag,
  Gift,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useScannerContext } from "@/hooks/use-barcode-scanner";
import { useCart } from "@/hooks/use-cart";
import { useHeldTransactions } from "@/hooks/use-held-transactions";
import { usePromotions } from "@/hooks/use-promotions";
import { useRealtimeSales } from "@/hooks/use-realtime-sales";
import { useReceiptPrinter } from "@/hooks/use-receipt-printer";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
import {
  cacheCompletedSale,
  updateLocalInventory,
  searchProductsLocally,
  getProductByBarcodeLocally,
  getCatalogSyncMeta,
  setCatalogSyncMeta,
  clearProducts,
  putProducts,
  getCustomerByPhone,
  CATALOG_REFRESH_INTERVAL_MS,
  cacheSalesSnapshotForStore,
} from "@/lib/idb-catalog";
import type { CachedSale } from "@/lib/idb-catalog";
import {
  generateIdempotencyKey,
  validateSalePayload,
  enqueueOfflineSale,
  getOfflineQueueCount,
  processQueueNow,
} from "@/lib/offline-queue";
import { formatCurrency } from "@/lib/pos-utils";
import type { ReceiptPrintJob } from "@/lib/printer";
import { cn } from "@/lib/utils";
import type { CartItem, CartSummary, LoyaltySyncState } from "@/types/pos";
import type { Store } from "@shared/schema";

// Human-readable error messages
const ERROR_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: "Unable to connect to server. Your sale has been saved and will sync when connection is restored.",
  INVENTORY_INSUFFICIENT: "Some items have insufficient stock. Please check inventory.",
  PAYMENT_FAILED: "Payment processing failed. Please try again or use a different payment method.",
  SYNC_FAILED: "Sync failed. We'll keep trying automatically. You can continue making sales.",
  PRODUCT_NOT_FOUND: "Product not found. Try searching by name or check the barcode.",
  CUSTOMER_NOT_FOUND: "Customer not found in loyalty program.",
  DEFAULT: "Something went wrong. Please try again.",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as any).code || error.message;
    return ERROR_MESSAGES[code] || ERROR_MESSAGES.DEFAULT;
  }
  if (typeof error === "string") {
    return ERROR_MESSAGES[error] || error;
  }
  return ERROR_MESSAGES.DEFAULT;
}

export default function POSV2() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [catalogLastSync, setCatalogLastSync] = useState<number | null>(null);
  const [isCatalogRefreshing, setIsCatalogRefreshing] = useState(false);
  const [selectedStore, setSelectedStore] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Loyalty state
  const [customerPhone, setCustomerPhone] = useState("");
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<{ id: string; name?: string } | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [, setLoyaltySyncStatus] = useState<LoyaltySyncState>({ state: "idle" });

  // Bundle promotion prompt state
  const [bundlePrompt, setBundlePrompt] = useState<{
    productId: string;
    productName: string;
    promotionId: string;
    promotionName: string;
    freeQuantity: number;
    unitPrice: number;
    barcode: string;
  } | null>(null);
  // Track already handled bundle thresholds to avoid re-prompting
  const bundleHandledRef = useRef<Map<string, number>>(new Map());

  const containerRef = useRef<HTMLDivElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Hooks
  const {
    items,
    addItem,
    removeItem,
    clearCart,
    hydrateCart,
    summary,
    payment,
    updatePayment,
    setTaxRate,
    setTaxIncluded,
    setRedeemValue,
    redeemValue,
    redeemPoints,
    setRedeemPoints,
    updateQuantity,
    calculateChange,
  } = useCart();

  const { heldTransactions, holdTransaction, resumeTransaction, discardTransaction } = useHeldTransactions(selectedStore);

  // Promotions hook for applying discounts
  const { fetchPromotions } = usePromotions(selectedStore);

  const { printReceipt } = useReceiptPrinter();

  const { setOnScan } = useScannerContext();

  // Queries
  const { data: stores = [] } = useQuery<Store[]>({ queryKey: ["/api/stores"] });
  const activeStores = stores.filter(s => s.isActive !== false);

  const { data: loyaltySettings } = useQuery<{ earnRate: number; redeemValue: number }>({
    queryKey: ["/api/loyalty/settings"],
  });

  // Use raw stores for lookup if needed, but prefer activeStores for logic
  const currentStore = stores.find((s) => s.id === selectedStore) as any;
  const currency: "USD" | "NGN" = currentStore?.currency === "NGN" ? "NGN" : "USD";

  // Initialize store and sync inventory on mount
  useEffect(() => {
    if (activeStores.length > 0) {
      if (!selectedStore) {
        setSelectedStore(activeStores[0].id);
      } else {
        // Ensure selected store actually exists in the ACTIVE list (handle stale/inactive state)
        const exists = activeStores.some((s) => s.id === selectedStore);
        if (!exists) {
          console.warn(`Selected store ${selectedStore} not acceptable (missing or inactive). Resetting to ${activeStores[0].id}`);
          setSelectedStore(activeStores[0].id);
        }
      }
    }
  }, [stores, activeStores, selectedStore, setSelectedStore]); // Added dependencies for correctness


  // Catalog refresh function - fetches latest products and updates IndexedDB
  const refreshCatalog = useCallback(async (force = false) => {
    if (!selectedStore || isCatalogRefreshing) return;

    try {
      setIsCatalogRefreshing(true);

      // Check if refresh is needed (skip if recently synced, unless forced)
      if (!force) {
        const meta = await getCatalogSyncMeta(selectedStore);
        if (meta && Date.now() - meta.lastSyncAt < CATALOG_REFRESH_INTERVAL_MS) {
          setCatalogLastSync(meta.lastSyncAt);
          return;
        }
      }

      // Skip network request if offline - just use cached data
      if (!navigator.onLine) {
        const meta = await getCatalogSyncMeta(selectedStore);
        if (meta) setCatalogLastSync(meta.lastSyncAt);
        return;
      }

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`/api/stores/${selectedStore}/products?limit=1000`, {
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const products = await res.json();

        // Clear old products and insert fresh data to remove stale items
        await clearProducts();
        await putProducts(
          products.map((p: any) => ({
            id: p.id,
            name: p.name,
            barcode: p.barcode || "",
            price: String(p.salePrice || p.price || "0"),
          }))
        );

        // Update sync metadata
        const now = Date.now();
        await setCatalogSyncMeta({ storeId: selectedStore, lastSyncAt: now, productCount: products.length });
        setCatalogLastSync(now);
      }
    } catch (err) {
      console.warn("Failed to refresh catalog", err);
      // On failure, load last sync time from metadata so UI can show cached state
      try {
        const meta = await getCatalogSyncMeta(selectedStore);
        if (meta) setCatalogLastSync(meta.lastSyncAt);
      } catch {
        // Ignore
      }
    } finally {
      setIsCatalogRefreshing(false);
    }
  }, [selectedStore, isCatalogRefreshing]);

  // Rolling sales snapshot for offline returns/swaps - when online, cache
  // recent sales for this store so Returns/Swaps can look them up by receipt
  // ID even if they were made on another terminal.
  const syncRecentSalesSnapshot = useCallback(async (limitOverride: number = 1000) => {
    if (!selectedStore) return;
    if (!navigator.onLine) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`/api/pos/sales?storeId=${selectedStore}&limit=${limitOverride}`, {
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      if (!body || !Array.isArray(body.data)) return;

      const nowIso = new Date().toISOString();
      const snapshot: CachedSale[] = (body.data as any[]).map((sale) => ({
        id: String(sale.id),
        receiptNumber: String((sale as any).receiptNumber ?? sale.id),
        idempotencyKey: (sale as any).idempotencyKey ? String((sale as any).idempotencyKey) : undefined,
        storeId: String(sale.storeId),
        subtotal: Number(sale.subtotal || 0),
        discount: Number(sale.discount || 0),
        tax: Number(sale.tax || 0),
        total: Number(sale.total || 0),
        paymentMethod: String(sale.paymentMethod || "manual"),
        status: (sale as any).status === "RETURNED" ? "RETURNED" : "COMPLETED",
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
  }, [selectedStore]);

  const salesSnapshotRealtimeTimerRef = useRef<number | null>(null);
  const lastSalesSnapshotRealtimeAtRef = useRef(0);

  const scheduleRealtimeSalesSnapshotRefresh = useCallback(() => {
    if (!selectedStore) return;
    if (!navigator.onLine) return;

    const now = Date.now();
    const minIntervalMs = 1500;
    const elapsed = now - lastSalesSnapshotRealtimeAtRef.current;

    if (elapsed >= minIntervalMs) {
      lastSalesSnapshotRealtimeAtRef.current = now;
      void syncRecentSalesSnapshot(200);
      return;
    }

    if (salesSnapshotRealtimeTimerRef.current) return;
    salesSnapshotRealtimeTimerRef.current = window.setTimeout(() => {
      salesSnapshotRealtimeTimerRef.current = null;
      lastSalesSnapshotRealtimeAtRef.current = Date.now();
      void syncRecentSalesSnapshot(200);
    }, minIntervalMs - elapsed);
  }, [selectedStore, syncRecentSalesSnapshot]);

  useEffect(() => {
    return () => {
      if (salesSnapshotRealtimeTimerRef.current) {
        window.clearTimeout(salesSnapshotRealtimeTimerRef.current);
        salesSnapshotRealtimeTimerRef.current = null;
      }
    };
  }, [selectedStore]);

  useRealtimeSales({
    orgId: user?.orgId ?? null,
    storeId: selectedStore || null,
    enabled: Boolean(selectedStore) && isOnline,
    onSaleCreated: () => {
      scheduleRealtimeSalesSnapshotRefresh();
    },
  });

  useEffect(() => {
    if (!selectedStore || !isOnline) return;

    void syncRecentSalesSnapshot();

    const intervalId = setInterval(() => {
      if (!navigator.onLine) return;
      void syncRecentSalesSnapshot();
    }, 60 * 1000);

    const handleFocus = () => {
      if (!navigator.onLine) return;
      void syncRecentSalesSnapshot();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [selectedStore, isOnline, syncRecentSalesSnapshot]);

  // Sync inventory snapshot on login/mount and start background refresh interval
  useEffect(() => {
    if (!selectedStore) return;

    // Initial sync
    void refreshCatalog(true);

    // Background refresh interval (every 2 minutes when online)
    const intervalId = setInterval(() => {
      if (navigator.onLine) {
        void refreshCatalog();
      }
    }, 2 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [selectedStore, refreshCatalog]);

  // Apply loyalty settings
  useEffect(() => {
    if (loyaltySettings) {
      setRedeemValue(Math.max(0, loyaltySettings.redeemValue));
    }
  }, [loyaltySettings, setRedeemValue]);

  // Apply store tax rate
  useEffect(() => {
    if (currentStore?.taxRate) {
      const rate = typeof currentStore.taxRate === "string" ? parseFloat(currentStore.taxRate) : currentStore.taxRate;
      if (Number.isFinite(rate)) setTaxRate(rate);
    }
  }, [currentStore?.taxRate, setTaxRate]);

  // Apply store tax included setting
  useEffect(() => {
    setTaxIncluded(currentStore?.taxIncluded === true);
  }, [currentStore?.taxIncluded, setTaxIncluded]);

  // Sync handler (defined before useEffect that uses it)
  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      await processQueueNow();
      setQueuedCount(await getOfflineQueueCount());
      toast({ title: "Sync complete", description: "All pending sales have been synced." });
    } catch (err) {
      toast({ title: "Sync failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  }, [toast]);

  // Online/Offline handling
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      toast({ title: "Back online", description: "Syncing pending sales and refreshing catalog..." });
      // Sync pending sales
      await handleSyncNow();
      // Refresh catalog immediately when back online
      await refreshCatalog(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast({ title: "You're offline", description: "Sales will be saved and synced when connection returns." });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [toast, handleSyncNow, refreshCatalog]);

  // Load queued count
  useEffect(() => {
    const loadQueueCount = async () => {
      try {
        setQueuedCount(await getOfflineQueueCount());
      } catch {
        // Ignore
      }
    };
    void loadQueueCount();
    const interval = setInterval(loadQueueCount, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        void document.exitFullscreen?.();
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };

  // Barcode scanning with promotion integration
  const handleBarcodeSubmit = useCallback(
    async (barcode: string) => {
      if (!barcode || !barcode.trim()) return;
      try {
        const res = await fetch(`/api/products/barcode/${encodeURIComponent(barcode)}`, { credentials: "include" });
        if (res.ok) {
          const product = await res.json();
          const originalPrice = parseFloat(product.salePrice || product.price);

          // Check for active promotion
          let promoData = {};
          if (navigator.onLine && selectedStore) {
            try {
              const promos = await fetchPromotions([product.id]);
              const promo = promos[product.id];
              if (promo && promo.promotionType === 'percentage') {
                const discountPercent = Number(promo.customDiscountPercent || promo.discountPercent || promo.effectiveDiscount || 0);
                if (discountPercent > 0) {
                  const discountedPrice = originalPrice * (1 - discountPercent / 100);
                  promoData = {
                    price: Math.max(0, discountedPrice),
                    originalPrice,
                    promotionId: promo.id,
                    promotionName: promo.name,
                    promotionType: promo.promotionType,
                    discountPercent,
                  };
                }
              }
            } catch {
              // Failed to fetch promotion, continue without it
            }
          }

          addItem({
            id: product.id,
            name: product.name,
            barcode: product.barcode || "",
            price: (promoData as any).price ?? originalPrice,
            ...(promoData as any),
          });

          const promoInfo = (promoData as any).discountPercent
            ? ` (${(promoData as any).discountPercent}% off)`
            : '';
          toast({ title: "Added", description: `${product.name}${promoInfo}` });
        } else {
          // Try local cache (no promotions when offline)
          const local = await getProductByBarcodeLocally(barcode);
          if (local) {
            addItem({ id: local.id, name: local.name, barcode: local.barcode || "", price: parseFloat(local.price) });
            toast({ title: "Added (offline)", description: local.name });
          } else {
            toast({ title: "Not found", description: ERROR_MESSAGES.PRODUCT_NOT_FOUND, variant: "destructive" });
          }
        }
      } catch {
        // Offline fallback
        const local = await getProductByBarcodeLocally(barcode);
        if (local) {
          addItem({ id: local.id, name: local.name, barcode: local.barcode || "", price: parseFloat(local.price) });
          toast({ title: "Added (offline)", description: local.name });
        } else {
          toast({ title: "Not found", description: ERROR_MESSAGES.PRODUCT_NOT_FOUND, variant: "destructive" });
        }
      }
      setBarcodeInput("");
      barcodeInputRef.current?.focus();
    },
    [addItem, toast, selectedStore, fetchPromotions]
  );

  useEffect(() => {
    setOnScan(handleBarcodeSubmit);
    return () => setOnScan(undefined);
  }, [handleBarcodeSubmit, setOnScan]);

  // Product search
  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      // Local first (from IndexedDB cache)
      const local = await searchProductsLocally(query, 20);
      setSearchResults(local);

      // Only fetch remote if online
      if (selectedStore && navigator.onLine) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(
            `/api/stores/${selectedStore}/products?query=${encodeURIComponent(query)}&limit=20`,
            { credentials: "include", signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (res.ok) {
            const remote = await res.json();
            setSearchResults(remote);
          }
        } catch {
          // Network failed, keep local results
        }
      }
    } catch {
      // Keep local results
    } finally {
      setIsSearching(false);
    }
  }, [selectedStore]);

  const handleProductSelect = useCallback(async (product: any) => {
    const originalPrice = parseFloat(product.salePrice || product.price);
    let promoData = {};

    if (navigator.onLine && selectedStore) {
      try {
        const promos = await fetchPromotions([product.id]);
        const promo = promos[product.id];
        if (promo && promo.promotionType === 'percentage') {
          const discountPercent = Number(promo.customDiscountPercent || promo.discountPercent || promo.effectiveDiscount || 0);
          if (discountPercent > 0) {
            const discountedPrice = originalPrice * (1 - discountPercent / 100);
            promoData = {
              price: Math.max(0, discountedPrice),
              originalPrice,
              promotionId: promo.id,
              promotionName: promo.name,
              promotionType: promo.promotionType,
              discountPercent,
            };
          }
        }
      } catch {
        // Ignore promotion fetch errors
      }
    }

    addItem({
      id: product.id,
      name: product.name,
      barcode: product.barcode || "",
      price: (promoData as any).price ?? originalPrice,
      ...(promoData as any),
    });

    const promoInfo = (promoData as any).discountPercent
      ? ` (${(promoData as any).discountPercent}% off)`
      : '';
    toast({ title: "Added", description: `${product.name}${promoInfo}` });
    setIsSearchOpen(false);
    setSearchQuery("");
  }, [addItem, selectedStore, fetchPromotions, toast]);

  useEffect(() => {
    const timeout = setTimeout(() => handleSearch(searchQuery), 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, handleSearch]);

  // Loyalty lookup - uses currentPoints from customers table directly
  const handleLookupCustomer = async () => {
    if (!customerPhone || !customerPhone.trim()) return;
    setLoyaltyLoading(true);
    try {
      const res = await fetch(`/api/customers?phone=${encodeURIComponent(customerPhone)}&storeId=${selectedStore}`, {
        credentials: "include",
      });

      if (res.ok) {
        const customer = await res.json();
        if (customer?.id) {
          const points = Number(customer.currentPoints ?? 0);
          setLoyaltyCustomer({ id: customer.id, name: customer.name || customerPhone });
          setLoyaltyBalance(points);
          setLoyaltySyncStatus({ state: "online", updatedAt: Date.now() });
          toast({ title: "Customer found", description: `${customer.name} - ${points} points` });
          return;
        }
      }

      // Fallback: Check local cache for customer data
      try {
        const cached = await getCustomerByPhone(customerPhone);
        if (cached) {
          const points = Number(cached.loyaltyPoints ?? 0);
          setLoyaltyCustomer({ id: cached.id, name: cached.name || customerPhone });
          setLoyaltyBalance(points);
          setLoyaltySyncStatus({ state: "cached", updatedAt: Date.now(), message: "Using cached data" });
          toast({ title: "Customer found (cached)", description: `${cached.name || customerPhone} - ${points} points` });
          return;
        }
      } catch {
        // Cache lookup failed, continue
      }

      // Customer not found
      toast({ title: "Customer not found", description: "No loyalty account found for this phone number.", variant: "destructive" });
      setLoyaltySyncStatus({ state: "error", message: "Customer not found" });
    } catch (err) {
      toast({ title: "Lookup failed", description: getErrorMessage(err), variant: "destructive" });
      setLoyaltySyncStatus({ state: "error", message: getErrorMessage(err) });
    } finally {
      setLoyaltyLoading(false);
    }
  };

  const clearLoyalty = () => {
    setCustomerPhone("");
    setLoyaltyCustomer(null);
    setLoyaltyBalance(null);
    setRedeemPoints(0);
    setLoyaltySyncStatus({ state: "idle" });
  };

  // Bundle promotion handler - adds free items to cart
  const handleAddBundleFreeItems = useCallback(() => {
    if (!bundlePrompt) return;

    // Add free items with price=0 but originalPrice retained
    for (let i = 0; i < bundlePrompt.freeQuantity; i++) {
      addItem({
        id: bundlePrompt.productId,
        name: bundlePrompt.productName,
        barcode: bundlePrompt.barcode,
        price: 0, // Free item
        originalPrice: bundlePrompt.unitPrice,
        promotionId: bundlePrompt.promotionId,
        promotionName: bundlePrompt.promotionName,
        promotionType: 'bundle',
        discountPercent: 100,
        isFreeItem: true,
      });
    }

    // Update handled threshold
    const key = `${bundlePrompt.productId}_${bundlePrompt.promotionId}`;
    const currentHandled = bundleHandledRef.current.get(key) || 0;
    bundleHandledRef.current.set(key, currentHandled + bundlePrompt.freeQuantity);

    toast({
      title: "Free items added!",
      description: `${bundlePrompt.freeQuantity}x ${bundlePrompt.productName} added (FREE)`,
    });
    setBundlePrompt(null);
  }, [bundlePrompt, addItem, toast]);

  // Bundle promotion detection - checks cart for bundle eligibility
  useEffect(() => {
    const checkBundlePromotions = async () => {
      if (!navigator.onLine || !selectedStore) return;

      // Group items by productId (excluding free items)
      const productQuantities = new Map<string, { qty: number; item: typeof items[0] }>();
      for (const item of items) {
        if (item.isFreeItem) continue;
        const existing = productQuantities.get(item.productId);
        productQuantities.set(item.productId, {
          qty: (existing?.qty || 0) + (item.quantity || 0),
          item,
        });
      }

      // Check each product for bundle promotions
      const productIds = Array.from(productQuantities.keys());
      if (productIds.length === 0) return;

      try {
        const promos = await fetchPromotions(productIds);

        for (const [productId, { qty, item }] of productQuantities) {
          const promo = promos[productId];
          if (!promo || promo.promotionType !== 'bundle') continue;

          const buyQty = Number(promo.bundleBuyQuantity || 0);
          const getQty = Number(promo.bundleGetQuantity || 0);
          if (buyQty <= 0 || getQty <= 0) continue;

          // Calculate how many free items customer is entitled to
          const timesQualified = Math.floor(qty / buyQty);
          const totalFreeEntitled = timesQualified * getQty;

          // Check how many we've already handled
          const key = `${productId}_${promo.id}`;
          const alreadyHandled = bundleHandledRef.current.get(key) || 0;
          const newFreeItems = totalFreeEntitled - alreadyHandled;

          if (newFreeItems > 0 && !bundlePrompt) {
            // Show prompt for new free items
            setBundlePrompt({
              productId,
              productName: item.name,
              promotionId: promo.id,
              promotionName: promo.name,
              freeQuantity: newFreeItems,
              unitPrice: item.originalPrice || item.price,
              barcode: item.barcode,
            });
            break; // Only show one prompt at a time
          }
        }
      } catch {
        // Failed to check promotions, ignore
      }
    };

    // Debounce the check
    const timeout = setTimeout(checkBundlePromotions, 500);
    return () => clearTimeout(timeout);
  }, [items, selectedStore, fetchPromotions, bundlePrompt]);

  // Clear bundle tracking when cart is cleared
  useEffect(() => {
    if (items.length === 0) {
      bundleHandledRef.current.clear();
    }
  }, [items.length]);

  const maxRedeemablePoints = (() => {
    if (!loyaltyBalance || redeemValue <= 0) return 0;
    const subtotalLimit = Math.floor(summary.subtotal / redeemValue);
    return Math.min(loyaltyBalance, subtotalLimit);
  })();

  // Receipt builder
  const buildReceiptJob = useCallback(
    (saleData: any, cartItems: CartItem[], cartSummary: CartSummary, paymentMethod: string): ReceiptPrintJob => ({
      receiptNumber: saleData?.receiptNumber || saleData?.id || `POS-${Date.now()}`,
      storeName: currentStore?.name || "Store",
      storeAddress: currentStore?.address,
      cashier: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user?.username,
      timestamp: new Date().toISOString(),
      items: cartItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        total: item.total,
      })),
      totals: {
        subtotal: cartSummary.subtotal,
        discount: cartSummary.redeemDiscount,
        tax: cartSummary.tax,
        total: cartSummary.total,
        currency,
        paymentMethod,
        taxIncluded: cartSummary.taxIncluded,
      },
      footerNote: currentStore?.phone ? `Contact: ${currentStore.phone}` : undefined,
    }),
    [currentStore, currency, user]
  );

  const [isCompletingSale, setIsCompletingSale] = useState(false);

  const handleCompleteSale = async () => {
    if (items.length === 0) {
      toast({ title: "Cart empty", description: "Add items to cart first.", variant: "destructive" });
      return;
    }
    if (payment.method === "cash" && (!payment.amountReceived || payment.amountReceived < summary.total)) {
      toast({ title: "Insufficient payment", description: "Enter amount received.", variant: "destructive" });
      return;
    }
    if (payment.method === "digital" && !payment.walletReference?.trim()) {
      toast({ title: "Reference required", description: "Enter wallet reference.", variant: "destructive" });
      return;
    }
    if (isCompletingSale) return;

    setIsCompletingSale(true);
    try {
      // Check offline status FIRST before any network calls, using app-level online state.
      // If the UI shows Offline (isOnline === false), we ALWAYS treat the sale as offline.
      const snapshotOnline = navigator.onLine;
      console.log("[POS] saleMutation start", { navigatorOnline: snapshotOnline, isOnline });
      const isCurrentlyOffline = !isOnline;
      const idempotencyKey = generateIdempotencyKey();

      const payload = {
        storeId: selectedStore,
        subtotal: String(summary.subtotal),
        discount: String(summary.redeemDiscount),
        tax: String(summary.tax),
        total: String(summary.total),
        paymentMethod: payment.method,
        walletReference: payment.walletReference?.trim() || undefined,
        customerPhone: customerPhone || undefined,
        redeemPoints,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: String(item.price.toFixed(2)),
          lineDiscount: "0",
          lineTotal: String(item.total.toFixed(2)),
        })),
      };

      // Pre-validate payload before attempting network
      const validation = validateSalePayload(payload);
      if (!validation.valid) throw new Error(validation.errors[0]);

      // Helper to process sale offline
      const processOffline = async (reason: string) => {
        console.log("[POS] processOffline start", { reason });

        // Safely enqueue to offline queue with timeout so we never hang
        try {
          await Promise.race([
            enqueueOfflineSale({ url: "/api/pos/sales", payload, idempotencyKey }),
            new Promise<void>((resolve) => setTimeout(resolve, 2000)),
          ]);
          console.log("[POS] enqueueOfflineSale completed (or timed out)");
        } catch (err) {
          console.warn("[POS] enqueueOfflineSale failed", err);
        }

        // Safely refresh queued count
        try {
          const count = await Promise.race([
            getOfflineQueueCount(),
            new Promise<number>((resolve) => setTimeout(() => resolve(0), 1000)),
          ]);
          setQueuedCount(count);
        } catch (err) {
          console.warn("[POS] getOfflineQueueCount failed", err);
        }

        // Update local inventory optimistically (reduce quantities), but never block UI
        try {
          await Promise.race([
            (async () => {
              for (const item of payload.items) {
                await updateLocalInventory(selectedStore, item.productId, -item.quantity);
              }
            })(),
            new Promise<void>((resolve) => setTimeout(resolve, 2000)),
          ]);
        } catch (err) {
          console.warn("[POS] updateLocalInventory failed", err);
        }

        // Cache the sale locally for offline return/swap lookup, but with timeout
        const localId = `local_${Date.now()}_${idempotencyKey.slice(0, 8)}`;
        try {
          await Promise.race([
            cacheCompletedSale({
              id: localId,
              receiptNumber: localId,
              idempotencyKey,
              storeId: selectedStore,
              subtotal: summary.subtotal,
              discount: summary.redeemDiscount,
              tax: summary.tax,
              total: summary.total,
              paymentMethod: payment.method,
              items: payload.items.map((item, idx) => ({
                id: `${localId}_item_${idx}`,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: parseFloat(item.unitPrice),
                lineTotal: parseFloat(item.lineTotal),
                name: items[idx]?.name || null,
              })),
              occurredAt: new Date().toISOString(),
              isOffline: true,
              syncedAt: null,
            }),
            new Promise<void>((resolve) => setTimeout(resolve, 2000)),
          ]);
        } catch (err) {
          console.warn("[POS] cacheCompletedSale failed", err);
        }

        console.log("[POS] processOffline finished (non-blocking)");
        toast({ title: "Saved offline", description: reason });
        return { id: localId, offline: true, idempotencyKey };
      };

      let sale: any;

      // If already offline, skip network attempt entirely (no CSRF fetch needed)
      if (isCurrentlyOffline) {
        sale = await processOffline("Sale saved locally. Will sync when connection returns.");
      } else {
        // Only fetch CSRF token when online (with timeout protection)
        const csrfToken = await getCsrfToken().catch(() => null);

        // Try network with timeout to prevent hanging
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

          const res = await fetch("/api/pos/sales", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey,
              ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
            },
            body: JSON.stringify(payload),
            credentials: "include",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!res.ok) throw new Error(`${res.status}`);
          const saleResult = await res.json();

          // Cache the completed sale for offline return/swap lookup
          await cacheCompletedSale({
            id: saleResult.id,
            receiptNumber: saleResult.receiptNumber ?? saleResult.id,
            idempotencyKey,
            storeId: selectedStore,
            subtotal: summary.subtotal,
            discount: summary.redeemDiscount,
            tax: summary.tax,
            total: summary.total,
            paymentMethod: payment.method,
            items: payload.items.map((item, idx) => ({
              id: saleResult.items?.[idx]?.id || `${saleResult.id}_item_${idx}`,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: parseFloat(item.unitPrice),
              lineTotal: parseFloat(item.lineTotal),
              name: items[idx]?.name || null,
            })),
            occurredAt: saleResult.occurredAt || new Date().toISOString(),
            isOffline: false,
            syncedAt: new Date().toISOString(),
          });

          sale = saleResult;
        } catch (err) {
          // Network failed - process offline
          const isTimeout = err instanceof Error && err.name === "AbortError";
          const reason = isTimeout
            ? "Connection timed out. Sale saved locally."
            : "Network unavailable. Sale saved locally.";
          sale = await processOffline(reason);
        }
      }

      // Post-success handling (print, clear cart, refresh analytics)
      try {
        const job = buildReceiptJob(sale, items, summary, payment.method);
        try {
          await printReceipt(job);
        } catch (err) {
          console.warn("Print failed", err);
        }
        clearCart();
        clearLoyalty();
        toast({ title: "Sale complete", description: `Total: ${formatCurrency(summary.total, currency)}` });
        await queryClient.invalidateQueries({ queryKey: ["/api/stores", selectedStore, "analytics/daily-sales"] });
      } catch (err) {
        toast({ title: "Sale failed", description: getErrorMessage(err), variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Sale failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setIsCompletingSale(false);
    }
  };

  const handleHoldTransaction = () => {
    if (items.length === 0) return;
    holdTransaction({
      storeId: selectedStore,
      items,
      payment,
      loyalty: { customerPhone, loyaltyCustomer, loyaltyBalance, redeemPoints },
    });
    clearCart();
    clearLoyalty();
    toast({ title: "Transaction held", description: "Resume from menu." });
  };

  const handleResumeHeld = (id: string) => {
    const entry = resumeTransaction(id);
    if (!entry) return;
    hydrateCart(entry.items, entry.payment);
    setCustomerPhone(entry.loyalty.customerPhone);
    setLoyaltyCustomer(entry.loyalty.loyaltyCustomer);
    setLoyaltyBalance(entry.loyalty.loyaltyBalance);
    setRedeemPoints(entry.loyalty.redeemPoints);
    toast({ title: "Resumed" });
  };

  const handleVoidTransaction = () => {
    clearCart();
    clearLoyalty();
    toast({ title: "Voided" });
  };

  const changeDue = payment.method === "cash" && payment.amountReceived ? Math.max(0, payment.amountReceived - summary.total) : 0;
  const allQuantitiesValid = items.every(item => (item.quantity ?? 0) > 0);
  const canComplete =
    items.length > 0 &&
    allQuantitiesValid &&
    (payment.method === "card" ||
      (payment.method === "cash" && payment.amountReceived && payment.amountReceived >= summary.total) ||
      (payment.method === "digital" && !!payment.walletReference?.trim()));

  // Format last sync time for display
  const formatLastSync = (timestamp: number | null) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div ref={containerRef} className={cn("h-screen w-screen bg-slate-100 flex flex-col select-none", isFullscreen ? "overflow-hidden" : "overflow-auto")}>
      {/* Offline Banner */}
      {!isOnline && catalogLastSync && (
        <div className="bg-amber-500 text-white px-3 py-1.5 text-center text-sm flex items-center justify-center gap-2 flex-shrink-0">
          <WifiOff className="w-4 h-4" />
          <span>Working offline — catalog from {formatLastSync(catalogLastSync)}</span>
          {isCatalogRefreshing && <RefreshCw className="w-4 h-4 animate-spin" />}
        </div>
      )}

      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Menu Button */}
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="w-10 h-10">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0" container={containerRef.current}>
              <div className="flex flex-col h-full">
                <div className="p-4 border-b bg-primary text-white">
                  <h2 className="font-bold text-lg">ChainSync POS</h2>
                  <p className="text-sm opacity-80">{user?.firstName || user?.username || "Cashier"}</p>
                </div>
                <nav className="flex-1 p-2 space-y-1">
                  <Link href="/pos" onClick={() => setIsMenuOpen(false)}>
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary">
                      <ScanLine className="w-5 h-5" />
                      <span>Point of Sale</span>
                    </div>
                  </Link>
                  <Link href="/returns" onClick={() => setIsMenuOpen(false)}>
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-100">
                      <ArrowRightLeft className="w-5 h-5" />
                      <span>Returns & Swaps</span>
                    </div>
                  </Link>
                  <Link href="/settings" onClick={() => setIsMenuOpen(false)}>
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-100">
                      <Settings className="w-5 h-5" />
                      <span>Settings</span>
                    </div>
                  </Link>
                </nav>
                {/* Held Transactions */}
                {heldTransactions.length > 0 && (
                  <div className="p-3 border-t">
                    <p className="text-xs font-semibold text-slate-500 mb-2">HELD ({heldTransactions.length})</p>
                    <div className="space-y-1 max-h-32 overflow-auto">
                      {heldTransactions.map((h) => (
                        <div key={h.id} className="flex items-center justify-between text-sm bg-slate-50 rounded px-2 py-1">
                          <span>{new Date(h.createdAt).toLocaleTimeString()}</span>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => handleResumeHeld(h.id)}>
                              Resume
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => discardTransaction(h.id)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Sync Status */}
                <div className="p-3 border-t">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className={isOnline ? "text-green-600" : "text-amber-600"}>{isOnline ? "Online" : "Offline"}</span>
                    {queuedCount > 0 && <span className="text-amber-600">{queuedCount} pending</span>}
                  </div>
                  {catalogLastSync && (
                    <p className="text-xs text-slate-500 mb-2">
                      Catalog: {formatLastSync(catalogLastSync)}
                    </p>
                  )}
                  <div className="space-y-2">
                    {queuedCount > 0 && (
                      <Button size="sm" variant="outline" className="w-full" onClick={handleSyncNow} disabled={isSyncing}>
                        <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                        {isSyncing ? "Syncing..." : "Sync Sales"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => refreshCatalog(true)}
                      disabled={isCatalogRefreshing || !isOnline}
                    >
                      <Package className={cn("w-4 h-4 mr-2", isCatalogRefreshing && "animate-pulse")} />
                      {isCatalogRefreshing ? "Refreshing..." : "Refresh Catalog"}
                    </Button>
                  </div>
                </div>
                {/* Logout */}
                <div className="p-3 border-t">
                  <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={logout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Store Name */}
          <div className="flex flex-col">
            <span className="font-semibold text-slate-800 text-sm">{currentStore?.name || "Store"}</span>
            <span className="text-xs text-slate-500">{new Date().toLocaleDateString()}</span>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <div className={cn("flex items-center gap-1 text-xs", isOnline ? "text-green-600" : "text-amber-600")}>
            {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
          </div>

          {/* Pending Sync */}
          {queuedCount > 0 && (
            <Button size="sm" variant="ghost" className="text-amber-600 h-8" onClick={handleSyncNow} disabled={isSyncing}>
              <RefreshCw className={cn("w-4 h-4 mr-1", isSyncing && "animate-spin")} />
              {queuedCount}
            </Button>
          )}

          {/* Fullscreen Toggle */}
          <Button variant="ghost" size="icon" className="w-9 h-9" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className={cn("flex-1 flex flex-col lg:flex-row gap-3 p-3", isFullscreen ? "min-h-0 overflow-hidden" : "min-h-fit")}>
        {/* Left: Scan + Cart */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 lg:min-w-0">
          {/* Scan Bar */}
          <div className="bg-white rounded-lg shadow-sm p-3 flex gap-2 flex-shrink-0">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                ref={barcodeInputRef}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleBarcodeSubmit(barcodeInput);
                  }
                }}
                placeholder="Scan or enter barcode..."
                className="pl-10 h-12 text-lg font-mono"
                autoFocus
              />
            </div>
            <Button className="h-12 px-4" onClick={() => handleBarcodeSubmit(barcodeInput)} disabled={!barcodeInput.trim()}>
              <Plus className="w-5 h-5" />
            </Button>
            <Button variant="outline" className="h-12 px-4" onClick={() => setIsSearchOpen(true)}>
              <Search className="w-5 h-5" />
            </Button>
          </div>

          {/* Cart */}
          <div className="flex-1 bg-white rounded-lg shadow-sm flex flex-col min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="font-semibold text-slate-800">Cart ({summary.itemCount})</h3>
              {items.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-slate-500 h-8">
                  Clear
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                  <Package className="w-12 h-12 mb-2" />
                  <p>Cart is empty</p>
                  <p className="text-sm">Scan a product to begin</p>
                </div>
              ) : (
                <div className="divide-y">
                  {items.map((item) => (
                    <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-800 truncate">{item.name}</p>
                          {item.isFreeItem ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-500 text-white rounded text-xs font-medium">
                              <Gift className="w-3 h-3" />
                              FREE
                            </span>
                          ) : item.promotionId && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                              <Tag className="w-3 h-3" />
                              {item.discountPercent}% off
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          {item.isFreeItem ? (
                            <>
                              <span className="text-slate-400 line-through">{formatCurrency(item.originalPrice || 0, currency)}</span>
                              <span className="text-green-600 font-medium">FREE</span>
                            </>
                          ) : item.originalPrice && item.originalPrice !== item.price ? (
                            <>
                              <span className="text-slate-400 line-through">{formatCurrency(item.originalPrice, currency)}</span>
                              <span className="text-green-600 font-medium">{formatCurrency(item.price, currency)} each</span>
                            </>
                          ) : (
                            <span className="text-slate-500">{formatCurrency(item.price, currency)} each</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-8 h-8"
                          onClick={() => updateQuantity(item.id, Math.max(1, (item.quantity ?? 1) - 1))}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity ?? ""}
                          className="w-12 h-8 text-center font-medium px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") {
                              updateQuantity(item.id, undefined);
                            } else {
                              updateQuantity(item.id, Math.max(1, parseInt(val) || 1));
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-8 h-8"
                          onClick={() => updateQuantity(item.id, (item.quantity ?? 0) + 1)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="text-right min-w-[80px]">
                        <p className="font-semibold">{formatCurrency(item.total, currency)}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-red-500" onClick={() => removeItem(item.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Checkout Panel */}
        <div className="lg:w-96 flex flex-col gap-3 flex-shrink-0">
          {/* Loyalty */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-slate-600" />
              <span className="font-semibold text-slate-800">Loyalty</span>
              {loyaltyCustomer && (
                <span className="ml-auto text-sm text-green-600">{loyaltyBalance} pts</span>
              )}
            </div>
            {!loyaltyCustomer ? (
              <div className="flex gap-2">
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone number"
                  className="h-10"
                />
                <Button onClick={handleLookupCustomer} disabled={loyaltyLoading || !customerPhone.trim()} className="h-10">
                  {loyaltyLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Lookup"}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{loyaltyCustomer.name || customerPhone}</span>
                  <Button variant="ghost" size="sm" onClick={clearLoyalty} className="h-7 text-xs">
                    Clear
                  </Button>
                </div>
                {maxRedeemablePoints > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">Redeem:</span>
                    <Input
                      type="number"
                      min={0}
                      max={maxRedeemablePoints}
                      value={redeemPoints}
                      onChange={(e) => setRedeemPoints(Math.min(Number(e.target.value), maxRedeemablePoints))}
                      className="w-24 h-8"
                    />
                    <span className="text-xs text-slate-500">/ {maxRedeemablePoints}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h3 className="font-semibold text-slate-800 mb-3">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span>{formatCurrency(summary.subtotal, currency)}</span>
              </div>
              {summary.redeemDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Loyalty Discount</span>
                  <span>-{formatCurrency(summary.redeemDiscount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Tax ({(summary.taxRate * 100).toFixed(1)}%)</span>
                <span>{formatCurrency(summary.tax, currency)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(summary.total, currency)}</span>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h3 className="font-semibold text-slate-800 mb-3">Payment</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Button
                variant={payment.method === "cash" ? "default" : "outline"}
                className="h-14 flex-col gap-1"
                onClick={() => updatePayment({ method: "cash" })}
              >
                <Banknote className="w-5 h-5" />
                <span className="text-xs">Cash</span>
              </Button>
              <Button
                variant={payment.method === "card" ? "default" : "outline"}
                className="h-14 flex-col gap-1"
                onClick={() => updatePayment({ method: "card" })}
              >
                <CreditCard className="w-5 h-5" />
                <span className="text-xs">Card</span>
              </Button>
              <Button
                variant={payment.method === "digital" ? "default" : "outline"}
                className="h-14 flex-col gap-1"
                onClick={() => updatePayment({ method: "digital" })}
              >
                <Smartphone className="w-5 h-5" />
                <span className="text-xs">Digital</span>
              </Button>
            </div>

            {payment.method === "cash" && (
              <div className="space-y-2">
                <Input
                  type="number"
                  placeholder="Amount received"
                  className="h-12 text-lg text-right"
                  value={payment.amountReceived || ""}
                  onChange={(e) => calculateChange(parseFloat(e.target.value) || 0)}
                />
                {changeDue > 0 && (
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-sm text-green-700">Change Due</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(changeDue, currency)}</p>
                  </div>
                )}
              </div>
            )}

            {payment.method === "digital" && (
              <Input
                placeholder="Wallet reference"
                className="h-10"
                value={payment.walletReference || ""}
                onChange={(e) => updatePayment({ walletReference: e.target.value })}
              />
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button
              className="w-full h-14 text-lg font-semibold"
              onClick={handleCompleteSale}
              disabled={!canComplete || isCompletingSale}
            >
              <Check className="w-5 h-5 mr-2" />
              {isCompletingSale ? "Processing..." : `Complete Sale`}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" onClick={handleHoldTransaction} disabled={items.length === 0}>
                <Pause className="w-4 h-4 mr-2" />
                Hold
              </Button>
              <Button
                variant="outline"
                className="h-12 text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleVoidTransaction}
                disabled={items.length === 0}
              >
                <X className="w-4 h-4 mr-2" />
                Void
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col">
            <div className="p-4 border-b flex items-center gap-3">
              <Search className="w-5 h-5 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="border-0 focus-visible:ring-0 text-lg"
                autoFocus
              />
              <Button variant="ghost" size="icon" onClick={() => setIsSearchOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              {isSearching && (
                <div className="p-8 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Searching...
                </div>
              )}
              {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="p-8 text-center text-slate-500">No products found</div>
              )}
              <div className="divide-y">
                {searchResults.map((product: any) => (
                  <button
                    key={product.id}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between"
                    onClick={() => handleProductSelect(product)}
                  >
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-slate-500">{product.barcode || "No barcode"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(parseFloat(product.salePrice || product.price || "0"), currency)}</p>
                      <Plus className="w-4 h-4 text-slate-400 ml-auto" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bundle Promotion Prompt Dialog */}
      <Dialog open={!!bundlePrompt} onOpenChange={(open) => !open && setBundlePrompt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-green-600" />
              Bundle Promotion Available!
            </DialogTitle>
            <DialogDescription>
              Customer qualifies for free items with &quot;{bundlePrompt?.promotionName}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-lg font-semibold text-green-800">
                {bundlePrompt?.freeQuantity}x {bundlePrompt?.productName}
              </p>
              <p className="text-sm text-green-600 mt-1">FREE (valued at {formatCurrency((bundlePrompt?.unitPrice || 0) * (bundlePrompt?.freeQuantity || 0), currency)})</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBundlePrompt(null)}>
              Skip
            </Button>
            <Button onClick={handleAddBundleFreeItems} className="bg-green-600 hover:bg-green-700">
              <Gift className="mr-2 h-4 w-4" />
              Add Free Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
