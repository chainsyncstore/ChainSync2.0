import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import BarcodeScanner from "@/components/pos/barcode-scanner";
import ShoppingCart from "@/components/pos/shopping-cart";
import CheckoutPanel from "@/components/pos/checkout-panel";
import ProductSearchModal from "@/components/pos/product-search-modal";
import SyncCenter from "@/components/pos/sync-center";
import ToastSystem from "@/components/notifications/toast-system";
import { useScannerContext } from "@/hooks/use-barcode-scanner";
import { useCart } from "@/hooks/use-cart";
import { useNotifications } from "@/hooks/use-notifications";
import { apiRequest } from "@/lib/queryClient";
import { enqueueOfflineSale, generateIdempotencyKey, getOfflineQueueCount, processQueueNow } from "@/lib/offline-queue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { Store, LowStockAlert } from "@shared/schema";
import { useRealtimeSales } from "@/hooks/use-realtime-sales";

export default function POS() {
  const { user } = useAuth();
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

  const userData = {
    role: user?.role || "cashier",
    name: `${user?.firstName || "User"} ${user?.lastName || ""}`.trim(),
    initials: `${user?.firstName?.[0] || "U"}${user?.lastName?.[0] || ""}`,
  };

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

  // Track offline sync state
  const [queuedCount, setQueuedCount] = useState(0);
  const [lastSync, setLastSync] = useState<{ attempted: number; synced: number } | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = async () => setQueuedCount(await getOfflineQueueCount());
    update();
    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETED') {
        setLastSync(event.data.data);
        update();
      } else if (event.data?.type === 'SYNC_SALE_OK') {
        const sale = event.data?.data?.sale;
        const receipt = sale?.receiptNumber || sale?.id || 'sale';
        addNotification({
          type: 'success',
          title: 'Sale Synced',
          message: `Receipt #${receipt}`,
        });
        update();
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMsg as any);
    const onOnline = async () => {
      setIsOnline(true);
      try {
        await processQueueNow();
        setQueuedCount(await getOfflineQueueCount());
        toast({ title: 'Back online', description: 'Sync started automatically.' });
      } catch {}
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMsg as any);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const handleSyncNow = async () => {
    try {
      await processQueueNow();
      setQueuedCount(await getOfflineQueueCount());
      toast({ title: 'Sync requested', description: 'Background sync triggered.' });
    } catch (e) {
      toast({ title: 'Sync failed to start', description: 'Please try again later.', variant: 'destructive' });
    }
  };

  // POS sale mutation using /api/pos/sales with idempotency and offline fallback
  const createTransactionMutation = useMutation({
    mutationFn: async () => {
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
      queryClient.invalidateQueries({ queryKey: ["/api/stores", selectedStore, "analytics/daily-sales"] });
      // Try to process queue immediately (harmless if none)
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
  const handleBarcodeScanned = async (barcode: string) => {
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
        // fallback: try local catalog
        try {
          const mod = await import('@/lib/idb-catalog');
          const local = await mod.getProductByBarcodeLocally(barcode);
          if (local) {
            addItem({ id: local.id, name: local.name, barcode: local.barcode || '', price: parseFloat(local.price) });
            addNotification({ type: 'success', title: 'Product Added (offline)', message: `${local.name} added to cart` });
            return;
          }
        } catch {}
        addNotification({
          type: "error",
          title: "Product Not Found",
          message: `No product found with barcode: ${barcode}`,
        });
      }
    } catch (error) {
      // offline fallback
      try {
        const mod = await import('@/lib/idb-catalog');
        const local = await mod.getProductByBarcodeLocally(barcode);
        if (local) {
          addItem({ id: local.id, name: local.name, barcode: local.barcode || '', price: parseFloat(local.price) });
          addNotification({ type: 'success', title: 'Product Added (offline)', message: `${local.name} added to cart` });
          return;
        }
      } catch {}
      addNotification({ type: 'error', title: 'Scan Error', message: 'Failed to scan product. Please try again.' });
      console.error("Barcode scan error:", error);
    }
  };

  // Set the scan callback in the global context
  useEffect(() => {
    setOnScan(handleBarcodeScanned);
    return () => setOnScan(undefined as unknown as (barcode: string) => void);
  }, [setOnScan]);

  // Update date/time every minute
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

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
          <Badge variant={isOnline ? 'outline' : 'secondary'} className={isOnline ? 'text-green-700 border-green-300' : 'bg-amber-100 text-amber-800'}>
            {isOnline ? 'Online' : 'Offline'}
          </Badge>
          {lastSync && (
            <span className="text-xs text-slate-600">Last sync: attempted {lastSync.attempted}, synced {lastSync.synced}</span>
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
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 sm:gap-4 lg:gap-6 h-full">
        <div className="xl:col-span-8 flex flex-col space-y-3 sm:space-y-4 lg:space-y-6">
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
          
          <ShoppingCart
            items={items}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            onClearCart={clearCart}
          />
        </div>

        <div className="xl:col-span-4">
          <CheckoutPanel
            summary={summary}
            payment={payment}
            dailyStats={dailyStats}
            onPaymentMethodChange={(method) => updatePayment({ method })}
            onAmountReceivedChange={handleAmountReceivedChange}
            onCompleteSale={handleCompleteSale}
            onHoldTransaction={handleHoldTransaction}
            onVoidTransaction={handleVoidTransaction}
            isProcessing={createTransactionMutation.isPending}
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
