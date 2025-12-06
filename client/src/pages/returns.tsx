import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2, RefreshCcw, Search, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import SyncCenter from "@/components/pos/sync-center";
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
    quantity: number;
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

interface SwapState {
  saleReference: string;
  saleData: SaleLookupResponse | null;
  selectedItem: SaleItemResponse | null;
  newProduct: ProductSearchResult | null;
  newQuantity: number;
  restockAction: RestockAction;
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
    newProduct: null,
    newQuantity: 1,
    restockAction: "RESTOCK",
    notes: "",
  });
  const [fetchingSwapSale, setFetchingSwapSale] = useState(false);
  const [swapProductSearch, setSwapProductSearch] = useState("");
  const [swapSearchResults, setSwapSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [swapBarcodeInput, setSwapBarcodeInput] = useState("");

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
  }, [selectedStore]);

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
    try {
      const res = await fetch(`/api/pos/sales/${saleReference.trim()}?storeId=${selectedStore}`, {
        credentials: "include",
      });
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
      initializeDraft(payload);
      setReason("");
    } catch (error) {
      console.error("Failed to fetch sale", error);
      setSaleData(null);
      setDraft({});
      toast({ title: "Sale not found", description: "Check the sale ID and try again.", variant: "destructive" });
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

  // Calculate tax rate from the sale (tax / subtotal)
  const taxRate = useMemo(() => {
    if (!saleData) return 0;
    const subtotal = saleData.sale.subtotal || 0;
    return subtotal > 0 ? saleData.sale.tax / subtotal : 0;
  }, [saleData]);

  const computeRefundForItem = (item: SaleItemResponse) => {
    const draftEntry = draft[item.id];
    if (!draftEntry) return 0;
    const unitValue = computeUnitRefund(item);
    const quantity = Math.min(Math.max(draftEntry.quantity, 0), item.quantity);
    if (draftEntry.refundType === "NONE") return 0;
    if (draftEntry.refundType === "FULL") {
      return unitValue * quantity;
    }
    const requested = Number.parseFloat(draftEntry.refundAmount || "0");
    if (!Number.isFinite(requested) || requested < 0) return 0;
    return Math.min(requested, unitValue * quantity);
  };

  // Calculate proportional tax refund for an item
  const computeTaxRefundForItem = (item: SaleItemResponse) => {
    const productRefund = computeRefundForItem(item);
    return productRefund * taxRate;
  };

  const totalProductRefund = saleData
    ? saleData.items.reduce((sum, item) => sum + computeRefundForItem(item), 0)
    : 0;

  const totalTaxRefund = saleData
    ? saleData.items.reduce((sum, item) => sum + computeTaxRefundForItem(item), 0)
    : 0;

  const totalRefund = totalProductRefund + totalTaxRefund;

  const processReturnMutation = useMutation({
    mutationFn: async () => {
      if (!saleData) throw new Error("No sale selected");
      const itemsPayload = saleData.items
        .map((item) => ({ draftEntry: draft[item.id], item }))
        .filter(({ draftEntry }) => Boolean(draftEntry))
        .map(({ draftEntry, item }) => ({ draftEntry: draftEntry!, item }))
        .filter(({ draftEntry, item }) => draftEntry.quantity > 0 && draftEntry.quantity <= item.quantity)
        .map(({ draftEntry, item }) => ({
          saleItemId: item.id,
          productId: item.productId,
          quantity: Math.min(Math.max(draftEntry.quantity, 0), item.quantity),
          restockAction: draftEntry.restockAction,
          refundType: draftEntry.refundType,
          refundAmount:
            draftEntry.refundType === "PARTIAL"
              ? String(
                  Math.min(Number.parseFloat(draftEntry.refundAmount || "0") || 0, computeUnitRefund(item) * draftEntry.quantity).toFixed(2)
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

      const csrfToken = await getCsrfToken().catch(() => null);
      const res = await fetch("/api/pos/returns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`Return failed with status ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Return processed", description: "Inventory and refunds updated." });
      setSaleReference("");
      setSaleData(null);
      setDraft({});
      setReason("");
    },
    onError: (error) => {
      console.error("Return submission failed", error);
      toast({ title: "Return failed", description: "Please verify inputs and try again.", variant: "destructive" });
    },
  });

  const canSubmit = Boolean(
    saleData &&
      saleData.items.some((item) => {
        const entry = draft[item.id];
        return entry && entry.quantity > 0;
      }) &&
      !processReturnMutation.isPending
  );

  const lockedStore = useMemo(() => stores.find((store) => store.id === lockedStoreId) || null, [lockedStoreId, stores]);

  // Get current store for tax rate
  const currentStore = useMemo(() => stores.find((s) => s.id === selectedStore), [stores, selectedStore]);
  const storeTaxRate = useMemo(() => {
    const rate = Number((currentStore as any)?.taxRate || 0);
    return rate / 100; // Convert percentage to decimal
  }, [currentStore]);

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
    try {
      const res = await fetch(`/api/pos/sales/${swapState.saleReference.trim()}?storeId=${selectedStore}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || String(res.status));
      }
      const payload = (await res.json()) as SaleLookupResponse;
      setSwapState((prev) => ({
        ...prev,
        saleData: payload,
        selectedItem: null,
        newProduct: null,
        newQuantity: 1,
      }));
    } catch (error) {
      console.error("Failed to fetch sale for swap", error);
      toast({ title: "Sale not found", description: "Check the sale ID and try again.", variant: "destructive" });
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
      }
    } catch (err) {
      console.error("Product search failed", err);
    } finally {
      setIsSearchingProducts(false);
    }
  }, [selectedStore]);

  const handleSwapBarcodeSubmit = useCallback(async (barcode: string) => {
    if (!barcode || !barcode.trim()) return;
    setIsSearchingProducts(true);
    try {
      const res = await fetch(`/api/products/barcode/${encodeURIComponent(barcode)}`, { credentials: "include" });
      if (res.ok) {
        const product = await res.json();
        const newProduct: ProductSearchResult = {
          id: product.id,
          name: product.name,
          sku: product.sku || null,
          barcode: product.barcode || null,
          salePrice: Number(product.salePrice || product.price || 0),
          quantity: product.quantity,
        };
        setSwapState((prev) => ({
          ...prev,
          newProduct,
          newQuantity: 1,
        }));
        setSwapProductSearch("");
        setSwapSearchResults([]);
        toast({ title: "Product found", description: newProduct.name });
      } else {
        toast({ title: "Product not found", description: "Check the barcode and try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Barcode lookup failed", variant: "destructive" });
    } finally {
      setIsSearchingProducts(false);
      setSwapBarcodeInput("");
    }
  }, [toast]);

  // Search products with debounce
  useEffect(() => {
    const timeout = setTimeout(() => handleSearchProducts(swapProductSearch), 300);
    return () => clearTimeout(timeout);
  }, [swapProductSearch, handleSearchProducts]);

  // Calculate swap amounts
  const swapCalculations = useMemo(() => {
    if (!swapState.selectedItem || !swapState.newProduct) {
      return { originalTotal: 0, newTotal: 0, priceDifference: 0, taxDifference: 0, totalDifference: 0 };
    }
    
    const originalUnitPrice = swapState.selectedItem.unitPrice;
    const originalQuantity = swapState.selectedItem.quantityRemaining || 1;
    const originalTotal = originalUnitPrice * Math.min(swapState.newQuantity, originalQuantity);
    
    const newTotal = swapState.newProduct.salePrice * swapState.newQuantity;
    const priceDifference = newTotal - originalTotal;
    
    // Tax only on the difference
    const taxDifference = priceDifference * storeTaxRate;
    const totalDifference = priceDifference + taxDifference;
    
    return { originalTotal, newTotal, priceDifference, taxDifference, totalDifference };
  }, [swapState.selectedItem, swapState.newProduct, swapState.newQuantity, storeTaxRate]);

  const processSwapMutation = useMutation({
    mutationFn: async () => {
      if (!swapState.saleData || !swapState.selectedItem || !swapState.newProduct) {
        throw new Error("Missing swap data");
      }

      const payload = {
        saleId: swapState.saleData.sale.id,
        storeId: selectedStore,
        originalSaleItemId: swapState.selectedItem.id,
        originalProductId: swapState.selectedItem.productId,
        originalQuantity: Math.min(swapState.newQuantity, swapState.selectedItem.quantityRemaining || 1),
        originalUnitPrice: swapState.selectedItem.unitPrice,
        newProductId: swapState.newProduct.id,
        newQuantity: swapState.newQuantity,
        newUnitPrice: swapState.newProduct.salePrice,
        restockAction: swapState.restockAction,
        notes: swapState.notes.trim() || undefined,
      };

      const csrfToken = await getCsrfToken().catch(() => null);
      const res = await fetch("/api/pos/swaps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Swap failed with status ${res.status}`);
      }
      return res.json();
    },
    onSuccess: async (data) => {
      const diff = data.swap?.totalDifference || 0;
      const currency = (currentStore as any)?.currency || "USD";
      const description = diff > 0 
        ? `Customer charged ${formatCurrency(diff, currency)}`
        : diff < 0 
        ? `Customer refunded ${formatCurrency(Math.abs(diff), currency)}`
        : "Even swap - no payment required";
      
      // Build and print swap receipt
      const swapReceipt: ReceiptPrintJob = {
        receiptNumber: data.swap?.receiptNumber || `SWAP-${Date.now()}`,
        storeName: currentStore?.name || "Store",
        storeAddress: (currentStore as any)?.address,
        cashier: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user?.username,
        timestamp: new Date().toISOString(),
        items: [
          {
            name: `RETURN: ${swapState.selectedItem?.name || "Original Product"}`,
            quantity: swapState.newQuantity,
            unitPrice: -(swapState.selectedItem?.unitPrice || 0),
            total: -swapCalculations.originalTotal,
          },
          {
            name: `NEW: ${swapState.newProduct?.name || "New Product"}`,
            quantity: swapState.newQuantity,
            unitPrice: swapState.newProduct?.salePrice || 0,
            total: swapCalculations.newTotal,
          },
        ],
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
        newProduct: null,
        newQuantity: 1,
        restockAction: "RESTOCK",
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
    swapState.newProduct &&
    swapState.newQuantity > 0 &&
    !processSwapMutation.isPending
  );

  const resetSwapModal = () => {
    setSwapState({
      saleReference: "",
      saleData: null,
      selectedItem: null,
      newProduct: null,
      newQuantity: 1,
      restockAction: "RESTOCK",
      notes: "",
    });
    setSwapProductSearch("");
    setSwapSearchResults([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase text-slate-500">Sync status</p>
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
          <Button size="sm" variant="outline" onClick={handleSyncNow}>
            Sync now
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsSyncCenterOpen(true)}>
            Open Sync Center
          </Button>
        </div>
      </div>
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

      {saleData && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Sale summary</CardTitle>
              <CardDescription>
                Processed {formatDateTime(new Date(saleData.sale.occurredAt))} · Status
                <Badge variant="secondary" className="ml-2 uppercase">
                  {saleData.sale.status}
                </Badge>
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Subtotal</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(saleData.sale.subtotal, saleData.sale.currency as any)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Discount</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(saleData.sale.discount, saleData.sale.currency as any)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Tax</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(saleData.sale.tax, saleData.sale.currency as any)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(saleData.sale.total, saleData.sale.currency as any)}
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
                  {saleData.items.map((item) => {
                    const entry = draft[item.id];
                    if (!entry) return null;
                    const maxQty = item.quantityRemaining ?? item.quantity;
                    const alreadyReturned = item.quantityReturned ?? 0;
                    const isFullyReturned = maxQty <= 0;
                    return (
                      <TableRow key={item.id} data-testid={`return-row-${item.id}`} className={isFullyReturned ? "opacity-50" : ""}>
                        <TableCell>
                          <div className="font-medium text-slate-800">{item.name || 'Product'}</div>
                          <div className="text-xs text-slate-500">SKU: {item.sku || '–'}</div>
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
                            <>
                              <Input
                                type="number"
                                min={0}
                                max={maxQty}
                                value={entry.quantity}
                                data-testid={`return-qty-${item.id}`}
                                onChange={(event) => {
                                  const nextQty = Math.max(0, Math.min(Number(event.target.value) || 0, maxQty));
                                  handleDraftChange(item.id, (current) => ({
                                    ...current,
                                    quantity: nextQty,
                                  }));
                                }}
                              />
                              <div className="text-xs text-slate-500 mt-1">Max {maxQty}</div>
                            </>
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
                                const baseAmount = (computeUnitRefund(item) * current.quantity).toFixed(2);
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
                          {entry.refundType === 'PARTIAL' ? (
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
                                  + {formatCurrency(computeTaxRefundForItem(item), saleData.sale.currency as any)} tax
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <div className="text-sm font-medium text-slate-800">
                                {formatCurrency(computeRefundForItem(item), saleData.sale.currency as any)}
                              </div>
                              {taxRate > 0 && computeRefundForItem(item) > 0 && (
                                <div className="text-xs text-amber-600">
                                  + {formatCurrency(computeTaxRefundForItem(item), saleData.sale.currency as any)} tax
                                </div>
                              )}
                            </div>
                          )}
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
                        {formatCurrency(totalProductRefund, saleData.sale.currency as any)}
                      </p>
                    </div>
                    <div className="text-slate-400">+</div>
                    <div>
                      <p className="text-xs uppercase text-amber-600">Tax refund</p>
                      <p className="text-lg font-medium text-amber-600">
                        {formatCurrency(totalTaxRefund, saleData.sale.currency as any)}
                      </p>
                    </div>
                    <div className="text-slate-400">=</div>
                    <div>
                      <p className="text-xs uppercase text-slate-500">Total refund</p>
                      <p className="text-2xl font-semibold text-slate-900">
                        {formatCurrency(totalRefund, saleData.sale.currency as any)}
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  className="min-w-[180px]"
                  disabled={!canSubmit}
                  onClick={() => processReturnMutation.mutate()}
                >
                  {processReturnMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Process return
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
                        newQuantity: Math.min(1, item.quantityRemaining ?? item.quantity),
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
                  {swapSearchResults.length > 0 && !swapState.newProduct && (
                    <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                      {swapSearchResults.map((product) => (
                        <div
                          key={product.id}
                          className="p-2 hover:bg-slate-50 cursor-pointer"
                          onClick={() => {
                            setSwapState((prev) => ({ ...prev, newProduct: product, newQuantity: 1 }));
                            setSwapProductSearch("");
                            setSwapSearchResults([]);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-sm">{product.name}</div>
                              <div className="text-xs text-slate-500">
                                {product.sku && `SKU: ${product.sku}`} 
                                {product.quantity !== undefined && ` • ${product.quantity} in stock`}
                              </div>
                            </div>
                            <div className="font-medium text-sm">
                              {formatCurrency(product.salePrice, (currentStore as any)?.currency || "USD")}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Selected New Product */}
                  {swapState.newProduct && (
                    <div className="p-3 border border-green-200 bg-green-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-green-800">{swapState.newProduct.name}</div>
                          <div className="text-sm text-green-600">
                            {swapState.newProduct.sku && `SKU: ${swapState.newProduct.sku}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-green-800">
                            {formatCurrency(swapState.newProduct.salePrice, (currentStore as any)?.currency || "USD")}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600 hover:text-red-600"
                            onClick={() => setSwapState((prev) => ({ ...prev, newProduct: null }))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Configure Swap */}
            {swapState.newProduct && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">4</div>
                  <h3 className="font-medium">Configure swap</h3>
                </div>
                <div className="ml-8 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Quantity to swap</Label>
                      <Input
                        type="number"
                        min={1}
                        max={swapState.selectedItem?.quantityRemaining ?? 1}
                        value={swapState.newQuantity}
                        onChange={(e) => setSwapState((prev) => ({
                          ...prev,
                          newQuantity: Math.max(1, Math.min(Number(e.target.value) || 1, prev.selectedItem?.quantityRemaining ?? 1)),
                        }))}
                      />
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
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsSwapModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => processSwapMutation.mutate()}
                disabled={!canSubmitSwap}
              >
                {processSwapMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Process Swap
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SyncCenter open={isSyncCenterOpen} onClose={() => setIsSyncCenterOpen(false)} />
    </div>
  );
}

