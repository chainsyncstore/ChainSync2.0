import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import ToastSystem from "@/components/notifications/toast-system";
import BarcodeScanner from "@/components/pos/barcode-scanner";
import CheckoutPanel from "@/components/pos/checkout-panel";
import ProductSearchModal from "@/components/pos/product-search-modal";
import ShoppingCart from "@/components/pos/shopping-cart";
import SyncCenter from "@/components/pos/sync-center";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useScannerContext } from "@/hooks/use-barcode-scanner";
import { useCart } from "@/hooks/use-cart";
import { useCatalogFreshness } from "@/hooks/use-catalog-freshness";
import { useHeldTransactions } from "@/hooks/use-held-transactions";
import { useLayout } from "@/hooks/use-layout";
import { useNotifications } from "@/hooks/use-notifications";
import { useOfflineSyncIndicator } from "@/hooks/use-offline-sync-indicator";
import { useRealtimeSales } from "@/hooks/use-realtime-sales";
import { useReceiptPrinter } from "@/hooks/use-receipt-printer";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
import type { ReceiptPrintJob } from "@/lib/printer";
import type { CartItem, CartSummary } from "@/types/pos";
import type { Store, LowStockAlert } from "@shared/schema";

export default function POS() {

  const [selectedStore, setSelectedStore] = useState<string>("");
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  const { notifications, addNotification, removeNotification } = useNotifications();

  const {
    isScanning,
    inputBuffer,
    isScannerActive,
    activateScanner,
    deactivateScanner,
    profiles: scannerProfiles,
    selectedProfile: activeScannerProfile,
    selectProfile: selectScannerProfile,
    refreshProfiles: refreshScannerProfiles,
    setOnScan,
  } = useScannerContext();

  const {
    profiles: printerProfiles,
    selectedProfile: activePrinterProfile,
    selectProfile: selectPrinterProfile,
    refreshProfiles: refreshPrinterProfiles,
    printReceipt,
    isPrinting: isPrinterBusy,
    lastError: printerError,
  } = useReceiptPrinter();

  const [lastReceiptJob, setLastReceiptJob] = useState<ReceiptPrintJob | null>(null);
  const {
    heldTransactions,
    holdTransaction,
    resumeTransaction,
    discardTransaction,
  } = useHeldTransactions(selectedStore);

  const { lastUpdatedAt: catalogUpdatedAt, isStale: isCatalogStale } = useCatalogFreshness(selectedStore);
  const catalogStatusText = (() => {
    if (!catalogUpdatedAt) return 'Catalog not cached yet';
    const diffMs = Date.now() - catalogUpdatedAt;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes <= 0) return 'Catalog synced moments ago';
    if (minutes < 60) return `Catalog synced ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `Catalog synced ${hours}h ago`;
  })();

  const { setSidebarFooter } = useLayout();

  // Fetch stores
  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  useEffect(() => {
    if (!stores || stores.length === 0) return;
    const persistStores = async () => {
      try {
        const { upsertStores } = await import("@/lib/idb-catalog");
        await upsertStores(
          stores.map((store) => ({
            id: store.id,
            name: store.name,
            currency: store.currency,
            taxRate: typeof store.taxRate === 'number' ? store.taxRate : Number(store.taxRate ?? 0),
            updatedAt: Date.now(),
          }))
        );
      } catch (error) {
        console.warn('Failed to cache store metadata locally', error);
      }
    };
    void persistStores();
  }, [stores]);

  const { data: loyaltySettings } = useQuery<{ earnRate: number; redeemValue: number }>({
    queryKey: ["/api/loyalty/settings"],
  });

  const [customerPhone, setCustomerPhone] = useState("");
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<{ id: string; name?: string | null } | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);
  const [loyaltySyncStatus, setLoyaltySyncStatus] = useState<{ state: 'idle' | 'online' | 'cached' | 'error'; updatedAt?: number; message?: string }>({ state: 'idle' });

  // Auto-select first store when stores are loaded
  useEffect(() => {
    if (stores.length > 0 && !selectedStore) {
      setSelectedStore(stores[0].id);
    }
  }, [stores, selectedStore]);

  // Fetch daily sales stats
  const { data: dailyStats = { transactions: 0, revenue: 0 } } = useQuery<{ transactions: number; revenue: number }>({
    queryKey: ["/api/stores", selectedStore, "analytics/daily-sales"],
  });

  // Fetch alerts count
  const { data: alerts = [] } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", selectedStore, "alerts"],
  });
  const lowStockCount = alerts.length;

  const currentStore = stores.find((s) => s.id === selectedStore) as any;
  const currency: 'USD' | 'NGN' = (currentStore?.currency === 'NGN' ? 'NGN' : 'USD');
  const storeTaxRate = currentStore?.taxRate;

  useEffect(() => {
    if (loyaltySettings) {
      setRedeemValue(Math.max(0, loyaltySettings.redeemValue));
    }
  }, [loyaltySettings, setRedeemValue]);

  useEffect(() => {
    const rawRate = storeTaxRate;
    if (rawRate === undefined || rawRate === null) {
      return;
    }
    const decimalRate = typeof rawRate === 'string' ? Number.parseFloat(rawRate) : Number(rawRate);
    if (Number.isFinite(decimalRate)) {
      setTaxRate(Math.max(0, decimalRate));
    }
  }, [storeTaxRate, setTaxRate]);

  useEffect(() => {
    setRedeemPoints(0);
    setCustomerPhone("");
    setLoyaltyCustomer(null);
    setLoyaltyBalance(null);
    setLoyaltyError(null);
  }, [selectedStore, setRedeemPoints]);

  useEffect(() => {
    if (loyaltyBalance !== null && redeemPoints > loyaltyBalance) {
      setRedeemPoints(loyaltyBalance);
    }
  }, [loyaltyBalance, redeemPoints, setRedeemPoints]);

  const maxRedeemablePoints = (() => {
    const balanceLimit = loyaltyBalance ?? Infinity;
    if (redeemValue <= 0) return balanceLimit === Infinity ? 0 : balanceLimit;
    const subtotalLimit = Math.floor(summary.subtotal / redeemValue);
    const effectiveBalance = Number.isFinite(balanceLimit) ? balanceLimit : subtotalLimit;
    if (!Number.isFinite(subtotalLimit)) return effectiveBalance;
    return Math.max(0, Math.min(balanceLimit, subtotalLimit));
  })();

  const handleRedeemPointsChange = (points: number) => {
    if (!Number.isFinite(points) || points < 0) {
      setRedeemPoints(0);
      return;
    }
    let next = Math.floor(points);
    if (loyaltyBalance !== null) {
      next = Math.min(next, loyaltyBalance);
    }
    if (redeemValue > 0) {
      next = Math.min(next, Math.floor(summary.subtotal / redeemValue));
    }
    setRedeemPoints(Math.max(0, next));
  };

  const handleClearLoyalty = useCallback(() => {
    setCustomerPhone("");
    setLoyaltyCustomer(null);
    setLoyaltyBalance(null);
    setLoyaltyError(null);
    setRedeemPoints(0);
    setLoyaltySyncStatus({ state: 'idle' });
  }, [setRedeemPoints]);

  const hydrateLoyaltyFromCache = useCallback(
    async (phone: string, options?: { reason?: string }) => {
      try {
        const { getCustomerByPhone } = await import("@/lib/idb-catalog");
        const cached = await getCustomerByPhone(phone);
        if (!cached) return false;
        const normalizedPoints = Number.isFinite(Number(cached.loyaltyPoints))
          ? Number(cached.loyaltyPoints)
          : 0;
        setLoyaltyCustomer({ id: cached.id, name: cached.name });
        setLoyaltyBalance(normalizedPoints);
        const nextRedeem = Math.max(0, Math.min(redeemPoints, normalizedPoints));
        setRedeemPoints(nextRedeem);
        setLoyaltyError(null);
        const message = options?.reason ?? "Using cached loyalty balance.";
        setLoyaltySyncStatus({ state: 'cached', updatedAt: Date.now(), message });
        if (options?.reason) {
          toast({ title: "Offline loyalty", description: options.reason });
        }
        return true;
      } catch (error) {
        console.warn("Failed to hydrate loyalty cache", error);
        setLoyaltySyncStatus({ state: 'error', updatedAt: Date.now(), message: 'Failed to read cached loyalty.' });
        return false;
      }
    },
    [redeemPoints, setRedeemPoints, toast]
  );

  const buildReceiptJob = useCallback((saleData: any, cartItems: CartItem[], cartSummary: CartSummary, paymentMethod: string): ReceiptPrintJob => {
    return {
      receiptNumber: saleData?.receiptNumber || saleData?.id || `POS-${Date.now()}`,
      storeName: currentStore?.name || "Store",
      storeAddress: currentStore?.address || undefined,
      cashier: saleData?.cashier || undefined,
      timestamp: saleData?.occurredAt || new Date().toISOString(),
      items: cartItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        total: item.total,
        sku: (item as any)?.sku,
      })),
      totals: {
        subtotal: cartSummary.subtotal,
        discount: cartSummary.redeemDiscount,
        tax: cartSummary.tax,
        total: cartSummary.total,
        currency,
        paymentMethod,
      },
      footerNote: currentStore?.phone ? `Contact us: ${currentStore.phone}` : undefined,
    };
  }, [currentStore?.address, currentStore?.name, currentStore?.phone, currency]);

  const handlePrintReceipt = useCallback(async (job?: ReceiptPrintJob) => {
    const target = job || lastReceiptJob;
    if (!target) {
      toast({ title: "No receipt", description: "Complete a sale first to print a receipt.", variant: "destructive" });
      return;
    }
    try {
      await printReceipt(target);
      toast({ title: "Receipt sent", description: `Queued for ${activePrinterProfile.label}` });
    } catch (error) {
      toast({ title: "Printer error", description: error instanceof Error ? error.message : "Failed to print receipt", variant: "destructive" });
    }
  }, [activePrinterProfile.label, lastReceiptJob, printReceipt, toast]);

  const handleLookupCustomer = useCallback(async () => {
    const phone = customerPhone.trim();
    if (!phone) {
      toast({ title: "Enter customer phone", variant: "destructive" });
      return;
    }
    if (!selectedStore) {
      toast({ title: "Select a store first", variant: "destructive" });
      return;
    }
    setLoyaltyLoading(true);
    setLoyaltyError(null);
    try {
      const res = await fetch(`/api/customers?phone=${encodeURIComponent(phone)}&storeId=${selectedStore}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(String(res.status));
      }
      const customer = await res.json();
      if (!customer?.id) {
        setLoyaltyCustomer(null);
        setLoyaltyBalance(0);
        setRedeemPoints(0);
        toast({ title: "Customer not found", description: "No matching customer for loyalty", variant: "destructive" });
        return;
      }
      setLoyaltyCustomer({ id: customer.id, name: customer.name });
      const loyaltyRes = await fetch(`/api/loyalty/${customer.id}`, { credentials: "include" });
      if (loyaltyRes.ok) {
        const loyaltyData = await loyaltyRes.json();
        const points = Number(loyaltyData?.points ?? 0);
        const normalizedPoints = Number.isFinite(points) ? points : 0;
        setLoyaltyBalance(normalizedPoints);
        const next = Math.max(0, Math.min(redeemPoints, normalizedPoints));
        setRedeemPoints(next);
        const fallback = await hydrateLoyaltyFromCache(phone, { reason: "Loaded cached loyalty balance." });
        if (!fallback) {
          setLoyaltyError("Unable to load loyalty details. Try again.");
          setLoyaltySyncStatus({ state: 'error', updatedAt: Date.now(), message: 'Failed to load loyalty details.' });
        }
      } else {
        setLoyaltyBalance(0);
      }
    } catch (error) {
      console.error("Failed to lookup customer", error);
      setLoyaltyError("Unable to load loyalty details. Try again.");
      setLoyaltySyncStatus({ state: 'error', updatedAt: Date.now(), message: 'Failed to load loyalty details.' });
    } finally {
      setLoyaltyLoading(false);
    }
  }, [customerPhone, redeemPoints, selectedStore, setRedeemPoints, toast, hydrateLoyaltyFromCache]);

  useEffect(() => {
    setSidebarFooter(
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Today&apos;s Stats</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Transactions</p>
            <p className="text-lg font-semibold text-slate-800">{dailyStats.transactions}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Revenue</p>
            <p className="text-lg font-semibold text-green-600">{currency === 'NGN' ? `₦${dailyStats.revenue.toLocaleString()}` : `$${dailyStats.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p>
          </div>
        </div>
      </div>
    );

    return () => {
      setSidebarFooter(null);
    };
  }, [dailyStats.revenue, dailyStats.transactions, currency, setSidebarFooter]);

  // Track offline sync state
  const { queuedCount, escalations, lastSync, handleSyncNow, refreshCounts } = useOfflineSyncIndicator({
    onSaleSynced: (data) => {
      const sale = data?.sale;
      const receipt = sale?.receiptNumber || sale?.id || 'sale';
      addNotification({
        type: 'success',
        title: 'Sale Synced',
        message: `Receipt #${receipt}`,
      });
    },
  });

  // POS sale mutation using /api/pos/sales with idempotency and offline fallback
  const createTransactionMutation = useMutation({
    mutationFn: async () => {
      const { generateIdempotencyKey, validateSalePayload, enqueueOfflineSale } = await import('@/lib/offline-queue');
      const idempotencyKey = generateIdempotencyKey();
      const csrfToken = await getCsrfToken().catch(() => null);

      const splitBreakdown = payment.split?.map((portion) => ({
        method: portion.method,
        amount: Number(portion.amount || 0).toFixed(2),
        reference: portion.reference?.trim() || undefined,
      })).filter((portion) => Number(portion.amount) > 0);

      const payload = {
        storeId: selectedStore,
        subtotal: String(summary.subtotal),
        discount: String(summary.redeemDiscount),
        tax: String(summary.tax),
        total: String(summary.total),
        paymentMethod: payment.method,
        walletReference: payment.walletReference?.trim() || undefined,
        paymentBreakdown: splitBreakdown && splitBreakdown.length ? splitBreakdown : undefined,
        customerPhone: customerPhone || undefined,
        redeemPoints: redeemPoints,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: String(Number(item.price.toFixed(2))),
          lineDiscount: String(0),
          lineTotal: String(Number(item.total.toFixed(2))),
        })),
      };

      try {
        const res = await fetch('/api/pos/sales', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          body: JSON.stringify(payload),
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`${res.status}`);
        return await res.json();
      } catch (err) {
        // Offline fallback: enqueue and trigger background sync
        const v = validateSalePayload(payload);
        if (!v.valid) {
          addNotification({ type: 'error', title: 'Cannot queue sale', message: v.errors.slice(0,3).join('; ') });
          throw err;
        }
        await enqueueOfflineSale({
          url: '/api/pos/sales',
          payload,
          idempotencyKey,
          headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        });
        await refreshCounts();
        addNotification({
          type: 'info',
          title: 'Sale queued offline',
          message: 'Transaction stored locally and will sync later.',
        });
        // Return a fake object to satisfy UI, with local id
        return { id: `local_${Date.now()}`, idempotencyKey, total: payload.total } as any;
      }
    },
    onSuccess: async (sale) => {
      addNotification({
        type: "success",
        title: "Sale Completed",
        message: `Transaction completed successfully.`,
      });

      const job = buildReceiptJob(sale, items, summary, payment.method);
      setLastReceiptJob(job);
      try {
        await handlePrintReceipt(job);
      } catch {
        // error already surfaced via toast
      }

      clearCart();
      handleClearLoyalty();
      await queryClient.invalidateQueries({ queryKey: ["/api/stores", selectedStore, "analytics/daily-sales"] });
      // Try to process queue immediately (harmless if none)
      const { processQueueNow } = await import('@/lib/offline-queue');
      await processQueueNow();
      await refreshCounts();
    },
    onError: (error) => {
      addNotification({
        type: "error",
        title: "Transaction Failed",
        message: "Failed to process the transaction. Please try again.",
      });
      console.error("Transaction error:", error);
    },
  });

  // Subscribe to realtime sales for POS store scope
  useRealtimeSales({ orgId: null, storeId: selectedStore || null });

  // Barcode scanning
  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    try {
      const response = await fetch(`/api/products/barcode/${barcode}`);
      if (response.ok) {
        const product = await response.json();
        addItem({
          id: product.id,
          name: product.name,
          barcode: product.barcode,
          price: parseFloat(product.price),
        });
        addNotification({
          type: "success",
          title: "Product Added",
          message: `${product.name} added to cart`,
        });
      } else {
        try {
          const mod = await import('@/lib/idb-catalog');
          const local = await mod.getProductByBarcodeLocally(barcode);
          if (local) {
            addItem({ id: local.id, name: local.name, barcode: local.barcode || '', price: parseFloat(local.price) });
            addNotification({ type: 'success', title: 'Product Added (offline)', message: `${local.name} added to cart` });
            return;
          }
        } catch (fallbackError) {
          console.warn('Failed to hydrate product from local catalog after network miss', fallbackError);
        }
        addNotification({
          type: "error",
          title: "Product Not Found",
          message: `No product found with barcode: ${barcode}`,
        });
      }
    } catch (error) {
      try {
        const mod = await import('@/lib/idb-catalog');
        const local = await mod.getProductByBarcodeLocally(barcode);
        if (local) {
          addItem({ id: local.id, name: local.name, barcode: local.barcode || '', price: parseFloat(local.price) });
          addNotification({ type: 'success', title: 'Product Added (offline)', message: `${local.name} added to cart` });
          return;
        }
      } catch (localFallbackError) {
        console.warn('Failed to retrieve barcode from local catalog after fetch error', localFallbackError);
      }
      addNotification({ type: 'error', title: 'Scan Error', message: 'Failed to scan product. Please try again.' });
      console.error("Barcode scan error:", error);
    }
  }, [addItem, addNotification]);

  useEffect(() => {
    setOnScan(handleBarcodeScanned);
    return () => setOnScan(undefined);
  }, [handleBarcodeScanned, setOnScan]);

  // Handle payment amount changes
  const handleAmountReceivedChange = (amount: number) => {
    calculateChange(amount);
  };

  const handleCompleteSale = () => {
    if (items.length === 0) {
      toast({
        title: "Cart Empty",
        description: "Please add items to cart before completing sale.",
        variant: "destructive",
      });
      return;
    }

    if (payment.method === "cash" && (!payment.amountReceived || payment.amountReceived < summary.total)) {
      toast({
        title: "Insufficient Payment",
        description: "Amount received must be at least the total amount.",
        variant: "destructive",
      });
      return;
    }

    if (payment.method === "digital") {
      if (!payment.walletReference || !payment.walletReference.trim()) {
        toast({
          title: "Wallet Reference Required",
          description: "Enter the mobile wallet reference before completing the sale.",
          variant: "destructive",
        });
        return;
      }
    }

    if (payment.method === "split") {
      if (!payment.split || payment.split.length === 0) {
        toast({
          title: "Split Payment Incomplete",
          description: "Add at least one payment portion to complete a split payment.",
          variant: "destructive",
        });
        return;
      }

      const splitSum = payment.split.reduce((sum, portion) => sum + (Number(portion.amount) || 0), 0);
      if (payment.split.some((portion) => !Number.isFinite(Number(portion.amount)) || Number(portion.amount) <= 0)) {
        toast({
          title: "Invalid Portion Amount",
          description: "Each payment portion must be greater than zero.",
          variant: "destructive",
        });
        return;
      }
      if (Math.abs(splitSum - summary.total) > 0.01) {
        toast({
          title: "Split Totals Mismatch",
          description: "Split payment portions must add up to the order total.",
          variant: "destructive",
        });
        return;
      }
    }

    createTransactionMutation.mutate();
  };

  const handleHoldTransaction = () => {
    if (items.length === 0) {
      toast({ title: "Nothing to hold", description: "Add items before holding.", variant: "destructive" });
      return;
    }
    const loyaltyState = {
      customerPhone,
      loyaltyCustomer,
      loyaltyBalance,
      redeemPoints,
    };
    holdTransaction({
      storeId: selectedStore || '',
      items,
      payment,
      loyalty: loyaltyState,
    });
    addNotification({
      type: "info",
      title: "Transaction Held",
      message: "You can resume it from the Held list.",
    });
    clearCart();
    handleClearLoyalty();
  };

  const handleResumeHeld = (heldId: string) => {
    const entry = resumeTransaction(heldId);
    if (!entry) {
      toast({ title: "Unable to resume", description: "Held transaction missing." , variant: "destructive" });
      return;
    }
    hydrateCart(entry.items, entry.payment);
    setCustomerPhone(entry.loyalty.customerPhone);
    setLoyaltyCustomer(entry.loyalty.loyaltyCustomer);
    setLoyaltyBalance(entry.loyalty.loyaltyBalance);
    setRedeemPoints(entry.loyalty.redeemPoints);
    toast({ title: "Transaction Resumed", description: `Held sale from ${new Date(entry.createdAt).toLocaleString()}` });
  };

  const handleVoidTransaction = () => {
    clearCart();
    addNotification({
      type: "warning",
      title: "Transaction Voided",
      message: "Transaction has been cancelled.",
    });
    handleClearLoyalty();
  };

  return (
    <>
      {/* Sync/Connectivity status */}
      <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {lastSync && (
            <span className="text-xs text-slate-600">Last sync: attempted {lastSync.attempted}, synced {lastSync.synced}</span>
          )}
          <span className={`text-xs ${isCatalogStale ? 'text-amber-700' : 'text-slate-500'}`}>
            {catalogStatusText}
          </span>
          {lowStockCount > 0 && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-900 border border-amber-200">
              {lowStockCount} low stock alert{lowStockCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-slate-600">
            <Printer className="w-3 h-3" />
            {printerError ? 'Printer issue' : `Printer: ${activePrinterProfile.label}`}
          </span>
          <Button size="sm" variant="outline" onClick={() => { void refreshPrinterProfiles(); }}>
            Refresh
          </Button>
          {queuedCount > 0 && (
            <>
              <span className="text-sm text-amber-700">
                {queuedCount} pending sale{queuedCount > 1 ? 's' : ''}
              </span>
              <Button size="sm" variant="outline" onClick={handleSyncNow}>
                Sync now
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsSyncCenterOpen(true)}>
                View
              </Button>
            </>
          )}
        </div>
      </div>
      {escalations > 0 && (
        <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          Some sales have failed to sync after multiple attempts. Please check connection or contact support.
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3 sm:gap-4 lg:gap-6 h-full">
        <div className="order-2 lg:order-1 flex flex-col gap-3 sm:gap-4 lg:gap-6 h-full">
          <ShoppingCart
            items={items}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            onClearCart={clearCart}
            currency={currency}
          />
        </div>

        <div className="order-1 lg:order-2 flex flex-col gap-3 sm:gap-4 lg:gap-6 h-full">
          <BarcodeScanner
            onScan={handleBarcodeScanned}
            onOpenSearch={() => setIsSearchModalOpen(true)}
            isLoading={createTransactionMutation.isPending}
            isScannerActive={isScannerActive}
            onActivateScanner={activateScanner}
            onDeactivateScanner={deactivateScanner}
            isScanning={isScanning}
            inputBuffer={inputBuffer}
            profiles={scannerProfiles}
            selectedProfile={activeScannerProfile}
            onSelectProfile={selectScannerProfile}
            onRefreshProfiles={refreshScannerProfiles}
          />
          <CheckoutPanel
            summary={summary}
            payment={payment}
            onPaymentMethodChange={(method) => updatePayment({ method })}
            onAmountReceivedChange={handleAmountReceivedChange}
            onUpdatePayment={(patch) => updatePayment(patch)}
            onCompleteSale={handleCompleteSale}
            onHoldTransaction={handleHoldTransaction}
            onVoidTransaction={handleVoidTransaction}
            isProcessing={createTransactionMutation.isPending}
            currency={currency}
            loyalty={{
              customerPhone,
              onCustomerPhoneChange: setCustomerPhone,
              onLookupCustomer: () => void handleLookupCustomer(),
              onClear: handleClearLoyalty,
              isLoading: loyaltyLoading,
              error: loyaltyError,
              loyaltyBalance,
              customerName: loyaltyCustomer?.name ?? null,
              redeemPoints,
              maxRedeemablePoints,
              onRedeemPointsChange: handleRedeemPointsChange,
              syncStatus: loyaltySyncStatus,
            }}
            printers={{
              profiles: printerProfiles,
              selectedId: activePrinterProfile.id,
              onSelect: selectPrinterProfile,
              onRefresh: refreshPrinterProfiles,
              onPrint: () => handlePrintReceipt(),
              isPrinting: isPrinterBusy,
              lastError: printerError,
            }}
            held={{
              entries: heldTransactions,
              onResume: handleResumeHeld,
              onDiscard: discardTransaction,
            }}
          />
        </div>
      </div>

      <ProductSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectProduct={(product) => {
          addItem({
            id: product.id,
            name: product.name,
            barcode: product.barcode || "",
            price: parseFloat(product.price),
          });
          addNotification({
            type: "success",
            title: "Product Added",
            message: `${product.name} added to cart`,
          });
        }}
      />

      <SyncCenter open={isSyncCenterOpen} onClose={() => setIsSyncCenterOpen(false)} />

      <ToastSystem
        notifications={notifications}
        onRemoveNotification={removeNotification}
      />
    </>
  );
}
