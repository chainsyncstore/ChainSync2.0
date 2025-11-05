import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useNotifications } from "@/hooks/use-notifications";
import { useRealtimeSales } from "@/hooks/use-realtime-sales";
import { useToast } from "@/hooks/use-toast";
import { useLayout } from "@/hooks/use-layout";
import type { Store, LowStockAlert } from "@shared/schema";

export default function POS() {

  const [selectedStore, setSelectedStore] = useState<string>("");
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    items,
    summary,
    payment,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    updatePayment,
    calculateChange,
  } = useCart();

  const { notifications, addNotification, removeNotification } = useNotifications();

  const {
    isScanning,
    inputBuffer,
    isScannerActive,
    activateScanner,
    deactivateScanner,
    setOnScan,
  } = useScannerContext();

  const { setSidebarFooter } = useLayout();

  // Fetch stores
  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

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
  const [queuedCount, setQueuedCount] = useState(0);
  const [lastSync, setLastSync] = useState<{ attempted: number; synced: number } | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [escalations, setEscalations] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = async () => {
      const { getOfflineQueueCount, getEscalatedCount } = await import('@/lib/offline-queue');
      setQueuedCount(await getOfflineQueueCount());
      setEscalations(await getEscalatedCount(5));
    };
    void update();
    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETED') {
        setLastSync(event.data.data);
        void update();
      } else if (event.data?.type === 'SYNC_SALE_OK') {
        const sale = event.data?.data?.sale;
        const receipt = sale?.receiptNumber || sale?.id || 'sale';
        addNotification({
          type: 'success',
          title: 'Sale Synced',
          message: `Receipt #${receipt}`,
        });
        void update();
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMsg as any);
    const onOnline = async () => {
      setIsOnline(true);
      try {
        const { processQueueNow, getOfflineQueueCount, getEscalatedCount } = await import('@/lib/offline-queue');
        await processQueueNow();
        setQueuedCount(await getOfflineQueueCount());
        setEscalations(await getEscalatedCount(5));
        toast({ title: 'Back online', description: 'Sync started automatically.' });
      } catch (error) {
        console.error('Failed to process pending queue when coming online', error);
      }
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMsg as any);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [addNotification, toast]);

  const handleSyncNow = async () => {
    try {
      const { processQueueNow, getOfflineQueueCount, getEscalatedCount } = await import('@/lib/offline-queue');
      await processQueueNow();
      setQueuedCount(await getOfflineQueueCount());
      setEscalations(await getEscalatedCount(5));
      toast({ title: 'Sync requested', description: 'Background sync triggered.' });
    } catch (error) {
      console.error('Failed to trigger manual sync', error);
      toast({ title: 'Sync failed to start', description: 'Please try again later.', variant: 'destructive' });
    }
  };

  // POS sale mutation using /api/pos/sales with idempotency and offline fallback
  const createTransactionMutation = useMutation({
    mutationFn: async () => {
      const { generateIdempotencyKey, validateSalePayload, enqueueOfflineSale, getOfflineQueueCount } = await import('@/lib/offline-queue');
      const idempotencyKey = generateIdempotencyKey();
      const payload = {
        storeId: selectedStore,
        subtotal: String(Number(summary.subtotal.toFixed(2))),
        discount: String(0),
        tax: String(Number(summary.tax.toFixed(2))),
        total: String(Number(summary.total.toFixed(2))),
        paymentMethod: payment.method,
        items: items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: String(Number(it.price.toFixed(2))),
          lineDiscount: String(0),
          lineTotal: String(Number(it.total.toFixed(2))),
        })),
      };

      try {
        const res = await fetch('/api/pos/sales', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
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
        await enqueueOfflineSale({ url: '/api/pos/sales', payload, idempotencyKey });
        setQueuedCount(await getOfflineQueueCount());
        addNotification({
          type: 'info',
          title: 'Saved Offline',
          message: 'Sale saved locally and will sync when online.',
        });
        // Return a fake object to satisfy UI, with local id
        return { id: `local_${Date.now()}`, idempotencyKey, total: payload.total } as any;
      }
    },
    onSuccess: async () => {
      addNotification({
        type: "success",
        title: "Sale Completed",
        message: `Transaction completed successfully. Total: $${summary.total.toFixed(2)}`,
      });
      clearCart();
      await queryClient.invalidateQueries({ queryKey: ["/api/stores", selectedStore, "analytics/daily-sales"] });
      // Try to process queue immediately (harmless if none)
      const { processQueueNow, getOfflineQueueCount } = await import('@/lib/offline-queue');
      await processQueueNow();
      setQueuedCount(await getOfflineQueueCount());
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

    createTransactionMutation.mutate();
  };

  const handleHoldTransaction = () => {
    addNotification({
      type: "info",
      title: "Transaction Held",
      message: "Transaction has been saved for later.",
    });
    clearCart();
  };

  const handleVoidTransaction = () => {
    clearCart();
    addNotification({
      type: "warning",
      title: "Transaction Voided",
      message: "Transaction has been cancelled.",
    });
  };

  return (
    <>
      {/* Sync/Connectivity status */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {lastSync && (
            <span className="text-xs text-slate-600">Last sync: attempted {lastSync.attempted}, synced {lastSync.synced}</span>
          )}
          {lowStockCount > 0 && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-900 border border-amber-200">
              {lowStockCount} low stock alert{lowStockCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {queuedCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-amber-700">
              {queuedCount} pending sale{queuedCount > 1 ? 's' : ''}
            </span>
            <Button size="sm" variant="outline" onClick={handleSyncNow}>
              Sync now
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsSyncCenterOpen(true)}>
              View
            </Button>
          </div>
        )}
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
          />
          <CheckoutPanel
            summary={summary}
            payment={payment}
            onPaymentMethodChange={(method) => updatePayment({ method })}
            onAmountReceivedChange={handleAmountReceivedChange}
            onCompleteSale={handleCompleteSale}
            onHoldTransaction={handleHoldTransaction}
            onVoidTransaction={handleVoidTransaction}
            isProcessing={createTransactionMutation.isPending}
            currency={currency}
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
