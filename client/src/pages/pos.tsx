import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import BarcodeScanner from "@/components/pos/barcode-scanner";
import ShoppingCart from "@/components/pos/shopping-cart";
import CheckoutPanel from "@/components/pos/checkout-panel";
import ProductSearchModal from "@/components/pos/product-search-modal";
import ToastSystem from "@/components/notifications/toast-system";
import { useCart } from "@/hooks/use-cart";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useNotifications } from "@/hooks/use-notifications";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Store, LowStockAlert } from "@shared/schema";

export default function POS() {
  const { user } = useAuth();
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
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

  // Transaction mutations
  const createTransactionMutation = useMutation({
    mutationFn: async () => {
      const transactionResponse = await apiRequest("POST", "/api/transactions", {
        storeId: selectedStore,
        cashierId: "user123", // In real app, get from auth
        subtotal: summary.subtotal,
        taxAmount: summary.tax,
        total: summary.total,
        paymentMethod: payment.method,
        amountReceived: payment.amountReceived,
        changeDue: payment.changeDue,
      });
      
      const transaction = await transactionResponse.json();
      
      // Add items to transaction
      for (const item of items) {
        await apiRequest("POST", `/api/transactions/${transaction.id}/items`, {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.total,
          storeId: selectedStore,
        });
      }
      
      // Complete the transaction
      await apiRequest("PUT", `/api/transactions/${transaction.id}/complete`);
      
      return transaction;
    },
    onSuccess: () => {
      addNotification({
        type: "success",
        title: "Sale Completed",
        message: `Transaction completed successfully. Total: $${summary.total.toFixed(2)}`,
      });
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["/api/stores", selectedStore, "analytics/daily-sales"] });
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
        addNotification({
          type: "error",
          title: "Product Not Found",
          message: `No product found with barcode: ${barcode}`,
        });
      }
    } catch (error) {
      addNotification({
        type: "error",
        title: "Scan Error",
        message: "Failed to scan product. Please try again.",
      });
      console.error("Barcode scan error:", error);
    }
  };

  useBarcodeScanner(handleBarcodeScanned);

  // Update date/time every minute
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 lg:gap-6 h-full">
        <div className="lg:col-span-8 flex flex-col space-y-3 sm:space-y-4 lg:space-y-6">
          <BarcodeScanner
            onScan={handleBarcodeScanned}
            onOpenSearch={() => setIsSearchModalOpen(true)}
            isLoading={createTransactionMutation.isPending}
          />
          
          <ShoppingCart
            items={items}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            onClearCart={clearCart}
          />
        </div>

        <div className="lg:col-span-4">
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

      <ToastSystem
        notifications={notifications}
        onRemoveNotification={removeNotification}
      />
    </>
  );
}
