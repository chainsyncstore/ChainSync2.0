import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Undo2,
  Package,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useScannerContext } from "@/hooks/use-barcode-scanner";
import { useCart } from "@/hooks/use-cart";
import { useHeldTransactions } from "@/hooks/use-held-transactions";
import { useReceiptPrinter } from "@/hooks/use-receipt-printer";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
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
    setRedeemValue,
    redeemValue,
    redeemPoints,
    setRedeemPoints,
    updateQuantity,
    calculateChange,
  } = useCart();

  const { heldTransactions, holdTransaction, resumeTransaction, discardTransaction } = useHeldTransactions(selectedStore);

  const { printReceipt } = useReceiptPrinter();

  const { setOnScan } = useScannerContext();

  // Queries
  const { data: stores = [] } = useQuery<Store[]>({ queryKey: ["/api/stores"] });
  const { data: loyaltySettings } = useQuery<{ earnRate: number; redeemValue: number }>({
    queryKey: ["/api/loyalty/settings"],
  });

  const currentStore = stores.find((s) => s.id === selectedStore) as any;
  const currency: "USD" | "NGN" = currentStore?.currency === "NGN" ? "NGN" : "USD";

  // Initialize store and sync inventory on mount
  useEffect(() => {
    if (stores.length > 0 && !selectedStore) {
      setSelectedStore(stores[0].id);
    }
  }, [stores, selectedStore]);

  // Catalog refresh function - fetches latest products and updates IndexedDB
  const refreshCatalog = useCallback(async (force = false) => {
    if (!selectedStore || isCatalogRefreshing) return;
    
    try {
      setIsCatalogRefreshing(true);
      const { getCatalogSyncMeta, setCatalogSyncMeta, clearProducts, putProducts, CATALOG_REFRESH_INTERVAL_MS } = await import("@/lib/idb-catalog");
      
      // Check if refresh is needed (skip if recently synced, unless forced)
      if (!force) {
        const meta = await getCatalogSyncMeta(selectedStore);
        if (meta && Date.now() - meta.lastSyncAt < CATALOG_REFRESH_INTERVAL_MS) {
          setCatalogLastSync(meta.lastSyncAt);
          return;
        }
      }
      
      const res = await fetch(`/api/stores/${selectedStore}/products?limit=1000`, { credentials: "include" });
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
        const { getCatalogSyncMeta } = await import("@/lib/idb-catalog");
        const meta = await getCatalogSyncMeta(selectedStore);
        if (meta) setCatalogLastSync(meta.lastSyncAt);
      } catch {
        // Ignore
      }
    } finally {
      setIsCatalogRefreshing(false);
    }
  }, [selectedStore, isCatalogRefreshing]);

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

  // Sync handler (defined before useEffect that uses it)
  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      const { processQueueNow, getOfflineQueueCount } = await import("@/lib/offline-queue");
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
        const { getOfflineQueueCount } = await import("@/lib/offline-queue");
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

  // Barcode scanning
  const handleBarcodeSubmit = useCallback(
    async (barcode: string) => {
      if (!barcode || !barcode.trim()) return;
      try {
        const res = await fetch(`/api/products/barcode/${encodeURIComponent(barcode)}`, { credentials: "include" });
        if (res.ok) {
          const product = await res.json();
          addItem({ id: product.id, name: product.name, barcode: product.barcode || "", price: parseFloat(product.price) });
          toast({ title: "Added", description: product.name });
        } else {
          // Try local cache
          const { getProductByBarcodeLocally } = await import("@/lib/idb-catalog");
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
        const { getProductByBarcodeLocally } = await import("@/lib/idb-catalog");
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
    [addItem, toast]
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
      // Local first
      const { searchProductsLocally } = await import("@/lib/idb-catalog");
      const local = await searchProductsLocally(query, 20);
      setSearchResults(local);
      // Then remote
      const res = await fetch(`/api/products?query=${encodeURIComponent(query)}`, { credentials: "include" });
      if (res.ok) {
        const remote = await res.json();
        setSearchResults(remote);
      }
    } catch {
      // Keep local results
    } finally {
      setIsSearching(false);
    }
  }, []);

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
        const { getCustomerByPhone } = await import("@/lib/idb-catalog");
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
      },
      footerNote: currentStore?.phone ? `Contact: ${currentStore.phone}` : undefined,
    }),
    [currentStore, currency, user]
  );

  // Sale mutation
  const saleMutation = useMutation({
    mutationFn: async () => {
      const { generateIdempotencyKey, validateSalePayload, enqueueOfflineSale, getOfflineQueueCount } = await import(
        "@/lib/offline-queue"
      );
      const idempotencyKey = generateIdempotencyKey();
      const csrfToken = await getCsrfToken().catch(() => null);

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

      try {
        const res = await fetch("/api/pos/sales", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          },
          body: JSON.stringify(payload),
          credentials: "include",
        });
        if (!res.ok) throw new Error(`${res.status}`);
        return await res.json();
      } catch {
        // Offline fallback
        const v = validateSalePayload(payload);
        if (!v.valid) throw new Error(v.errors[0]);
        await enqueueOfflineSale({ url: "/api/pos/sales", payload, idempotencyKey });
        setQueuedCount(await getOfflineQueueCount());
        toast({ title: "Saved offline", description: "Sale will sync when connection returns." });
        return { id: `local_${Date.now()}`, offline: true };
      }
    },
    onSuccess: async (sale) => {
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
    },
    onError: (err) => {
      toast({ title: "Sale failed", description: getErrorMessage(err), variant: "destructive" });
    },
  });

  const handleCompleteSale = () => {
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
    saleMutation.mutate();
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
  const canComplete =
    items.length > 0 &&
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
                      <Undo2 className="w-5 h-5" />
                      <span>Returns</span>
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
                        <p className="font-medium text-slate-800 truncate">{item.name}</p>
                        <p className="text-sm text-slate-500">{formatCurrency(item.price, currency)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-8 h-8"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-8 h-8"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
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
              disabled={!canComplete || saleMutation.isPending}
            >
              <Check className="w-5 h-5 mr-2" />
              {saleMutation.isPending ? "Processing..." : `Complete Sale`}
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
                    onClick={() => {
                      addItem({
                        id: product.id,
                        name: product.name,
                        barcode: product.barcode || "",
                        price: parseFloat(product.salePrice || product.price || "0"),
                      });
                      toast({ title: "Added", description: product.name });
                      setIsSearchOpen(false);
                      setSearchQuery("");
                    }}
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
    </div>
  );
}
