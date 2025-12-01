import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, AlertTriangle, Search, Filter, Edit, Eye, Trash2, Download, History as HistoryIcon } from "lucide-react";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
import { formatCurrency } from "@/lib/pos-utils";
import type { Store, Inventory as InventoryEntry, Product } from "@shared/schema";

type InventoryWithProduct = InventoryEntry & {
  product: Product | null;
  formattedPrice: number;
  storeCurrency: string;
};

type InventoryApiResponse = {
  currency: string;
  totalValue: number;
  totalProducts: number;
  items: InventoryWithProduct[];
};

type StockMovementEntry = {
  id: string;

  storeId: string;
  productId: string;
  quantityBefore: number;
  quantityAfter: number;
  delta: number;
  actionType: string;
  source?: string | null;
  referenceId?: string | null;
  userId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt: string;
  productName?: string | null;
  productSku?: string | null;
  productBarcode?: string | null;
};

type StockMovementApiResponse = {
  data: StockMovementEntry[];
  meta?: {
    limit?: number;
    offset?: number;
    count?: number;
  };
};

type OrganizationInventorySummary = {
  totals: {
    totalProducts: number;
    lowStockCount: number;
    outOfStockCount: number;
    overstockCount: number;
    currencyTotals: Array<{ currency: string; totalValue: number }>;
  };
  stores: Array<{
    storeId: string;
    storeName: string;
    currency: string;
    totalProducts: number;
    lowStockCount: number;
    outOfStockCount: number;
    overstockCount: number;
    totalValue: number;
  }>;
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
type StockStatus = {
  status: "out" | "low" | "over" | "good";
  color: BadgeVariant;
  text: string;
};

const ALL_STORES_ID = "ALL";
const ALL_STORES_OPTION = { id: ALL_STORES_ID, name: "All stores" } as const;

const MOVEMENT_ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All actions" },
  { value: "create", label: "Initial stock" },
  { value: "update", label: "Manual updates" },
  { value: "adjustment", label: "Adjustments" },
  { value: "import", label: "Imports" },
  { value: "delete", label: "Deletions" },
];

const formatFlexibleCurrency = (value: number, currencyCode?: string) => {
  if (!currencyCode) {
    return formatCurrency(value, "USD");
  }

  if (currencyCode === "USD" || currencyCode === "NGN") {
    return formatCurrency(value, currencyCode as "USD" | "NGN");
  }

  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(value);
  } catch {
    return `${currencyCode} ${value.toLocaleString()}`;
  }
};

const createEmptyOrgTotals = (): OrganizationInventorySummary["totals"] => ({
  totalProducts: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
  overstockCount: 0,
  currencyTotals: [],
});

const deriveTotalsFromStores = (stores: OrganizationInventorySummary["stores"] | undefined): OrganizationInventorySummary["totals"] => {
  if (!stores?.length) {
    return createEmptyOrgTotals();
  }

  const currencyTotals = new Map<string, number>();
  const totals: OrganizationInventorySummary["totals"] = createEmptyOrgTotals();

  for (const store of stores) {
    totals.totalProducts += store.totalProducts ?? 0;
    totals.lowStockCount += store.lowStockCount ?? 0;
    totals.outOfStockCount += store.outOfStockCount ?? 0;
    totals.overstockCount += store.overstockCount ?? 0;
    currencyTotals.set(store.currency, (currencyTotals.get(store.currency) ?? 0) + (store.totalValue ?? 0));
  }

  totals.currencyTotals = Array.from(currencyTotals.entries()).map(([currency, totalValue]) => ({ currency, totalValue }));
  return totals;
};

const hasMeaningfulTotals = (totals: OrganizationInventorySummary["totals"] | undefined) => {
  if (!totals) return false;
  const hasCounts = Boolean(totals.totalProducts || totals.lowStockCount || totals.outOfStockCount || totals.overstockCount);
  const hasCurrencyValue = totals.currencyTotals?.some(({ totalValue }) => totalValue > 0);
  return hasCounts || hasCurrencyValue;
};

export default function Inventory() {
  const { user } = useAuth();
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [editingItem, setEditingItem] = useState<InventoryWithProduct | null>(null);
  const [editQuantity, setEditQuantity] = useState<string>("");
  const [editMinStock, setEditMinStock] = useState<string>("");
  const [editMaxStock, setEditMaxStock] = useState<string>("");
  const [deleteNotes, setDeleteNotes] = useState<string>("");
  const [editCostPrice, setEditCostPrice] = useState<string>("");
  const [editSalePrice, setEditSalePrice] = useState<string>("");
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [historyFilters, setHistoryFilters] = useState<{ actionType: string; startDate: string; endDate: string }>({
    actionType: "all",
    startDate: "",
    endDate: "",
  });
  const [historyProduct, setHistoryProduct] = useState<InventoryWithProduct | null>(null);
  const [selectedOrgCurrency, setSelectedOrgCurrency] = useState<string | null>(null);

  const userRole = (user?.role ?? (user?.isAdmin ? "admin" : undefined))?.toString().toLowerCase();
  const isAdmin = userRole === "admin";
  const isManager = userRole === "manager";
  const managerStoreId = isManager ? (user?.storeId ?? "") : "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const orgId = useMemo(() => {
    const authUser = user as any;
    const derivedOrgId =
      authUser?.orgId ??
      authUser?.org_id ??
      authUser?.organizationId ??
      authUser?.organization_id ??
      authUser?.org?.id ??
      authUser?.organization?.id;
    return derivedOrgId ? String(derivedOrgId) : "";
  }, [user]);

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
    enabled: isAdmin,
  });

  // Track admin's last selected store
  const adminStoreStorageKey = useMemo(() => (isAdmin ? `inventory-selected-store-${orgId || "global"}` : null), [isAdmin, orgId]);

  // Auto-select scope for admins when page loads
  useEffect(() => {
    if (!isAdmin) return;
    if (selectedStore) return;

    const stored = adminStoreStorageKey && typeof window !== "undefined" ? window.localStorage.getItem(adminStoreStorageKey) : null;
    if (stored) {
      setSelectedStore(stored);
      return;
    }

    if (stores.length > 0) {
      setSelectedStore(stores[0]?.id ?? "");
    } else {
      setSelectedStore(ALL_STORES_ID);
    }
  }, [adminStoreStorageKey, isAdmin, selectedStore, stores]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!selectedStore) return;
    if (!adminStoreStorageKey || typeof window === "undefined") return;
    window.localStorage.setItem(adminStoreStorageKey, selectedStore);
  }, [adminStoreStorageKey, isAdmin, selectedStore]);

  // Force manager to assigned store
  useEffect(() => {
    if (isManager && managerStoreId && selectedStore !== managerStoreId) {
      setSelectedStore(managerStoreId);
    }
  }, [isManager, managerStoreId, selectedStore]);

  const isAllStoresView = isAdmin && selectedStore === ALL_STORES_ID;
  const storeId = isAllStoresView ? "" : selectedStore?.trim() || "";

  const adminStoreOptions = useMemo(() => {
    if (!isAdmin) return stores;
    return stores.length > 0 ? [ALL_STORES_OPTION, ...stores] : [ALL_STORES_OPTION];
  }, [isAdmin, stores]);

  const orgCurrencyStorageKey = useMemo(() => (orgId ? `inventory-org-currency-${orgId}` : null), [orgId]);

  const { data: inventoryData } = useQuery<InventoryApiResponse>({
    queryKey: ["/api/stores", storeId, "inventory"],
    enabled: Boolean(storeId),
  });

  const { data: orgInventorySummary } = useQuery<OrganizationInventorySummary | undefined>({
    queryKey: ["/api/orgs", orgId || null, "inventory"],
    enabled: isAllStoresView && Boolean(orgId),
    queryFn: async () => {
      try {
        const response = await fetch(`/api/orgs/${orgId}/inventory`);
        if (!response.ok) {
          if (response.status === 404) {
            return undefined;
          }
          throw new Error("Failed to load organization inventory");
        }
        return (await response.json()) as OrganizationInventorySummary;
      } catch (error) {
        console.error("Failed to fetch organization inventory summary", error);
        return undefined;
      }
    },
  });

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["/api/products/categories"],
  });

  const { data: brands = [] } = useQuery<string[]>({
    queryKey: ["/api/products/brands"],
  });

  const shouldFetchHistory = Boolean(storeId) && !isAllStoresView;
  const historyQueryKey = useMemo(
    () => ["/api/stores", storeId, "stock-movements", historyFilters],
    [storeId, historyFilters],
  );

  const { data: stockMovementsResponse, isLoading: isHistoryLoading } = useQuery<StockMovementApiResponse>({
    queryKey: historyQueryKey,
    enabled: shouldFetchHistory,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (historyFilters.actionType !== "all") params.set("actionType", historyFilters.actionType);
      if (historyFilters.startDate) params.set("startDate", historyFilters.startDate);
      if (historyFilters.endDate) params.set("endDate", historyFilters.endDate);
      const query = params.toString();
      const response = await fetch(`/api/stores/${storeId}/stock-movements${query ? `?${query}` : ""}`);
      if (!response.ok) {
        throw new Error("Failed to load stock history");
      }
      return (await response.json()) as StockMovementApiResponse;
    },
  });

  const selectedHistoryStoreId = historyProduct?.storeId || storeId;
  const { data: productHistoryResponse, isLoading: isProductHistoryLoading } = useQuery<StockMovementApiResponse>({
    queryKey: ["/api/inventory", historyProduct?.productId, selectedHistoryStoreId, "history"],
    enabled: Boolean(historyProduct && selectedHistoryStoreId),
    queryFn: async () => {
      const response = await fetch(`/api/inventory/${historyProduct?.productId}/${selectedHistoryStoreId}/history?limit=200`);
      if (!response.ok) {
        throw new Error("Failed to load product history");
      }
      return (await response.json()) as StockMovementApiResponse;
    },
  });

  const inventoryItems = useMemo<InventoryWithProduct[]>(
    () => (isAllStoresView ? [] : inventoryData?.items ?? []),
    [inventoryData, isAllStoresView],
  );

  const currency = useMemo(
    () => {
      if (isAllStoresView) {
        return orgInventorySummary?.totals.currencyTotals?.[0]?.currency ?? "USD";
      }
      return inventoryData?.currency ?? inventoryItems[0]?.storeCurrency ?? "USD";
    },
    [inventoryData, inventoryItems, isAllStoresView, orgInventorySummary],
  );

  const filteredInventory = useMemo<InventoryWithProduct[]>(() => {
    if (isAllStoresView) return [];
    return inventoryItems.filter((item) => {
      const name = item.product?.name?.toLowerCase() ?? "";
      const barcode = item.product?.barcode?.toLowerCase() ?? "";
      const query = searchQuery.toLowerCase();
      const matchesSearch = name.includes(query) || barcode.includes(query);
      const matchesCategory = selectedCategory === "all" || !selectedCategory || item.product?.category === selectedCategory;
      const matchesBrand = selectedBrand === "all" || !selectedBrand || item.product?.brand === selectedBrand;

      let matchesStock = true;
      switch (stockFilter) {
        case "low":
          matchesStock = item.quantity <= (item.minStockLevel ?? 0);
          break;
        case "out":
          matchesStock = item.quantity === 0;
          break;
        case "overstocked":
          matchesStock = item.quantity > (item.maxStockLevel ?? Number.MAX_SAFE_INTEGER);
          break;
        default:
          matchesStock = true;
      }

      return matchesSearch && matchesCategory && matchesBrand && matchesStock;
    });
  }, [inventoryItems, isAllStoresView, searchQuery, selectedCategory, selectedBrand, stockFilter]);

  const lowStockItems = useMemo(
    () => (isAllStoresView ? [] : filteredInventory.filter((item) => item.quantity <= (item.minStockLevel ?? 0))),
    [filteredInventory, isAllStoresView],
  );

  const outOfStockItems = useMemo(
    () => (isAllStoresView ? [] : filteredInventory.filter((item) => item.quantity === 0)),
    [filteredInventory, isAllStoresView],
  );

  const overstockedItems = useMemo(
    () => (isAllStoresView ? [] : filteredInventory.filter((item) => item.quantity > (item.maxStockLevel ?? Number.MAX_SAFE_INTEGER))),
    [filteredInventory, isAllStoresView],
  );

  const totalStockValue = useMemo(
    () => filteredInventory.reduce((sum, item) => {
      const unitPrice = item.product?.price ? parseFloat(String(item.product.price)) : item.formattedPrice ?? 0;
      return sum + item.quantity * unitPrice;
    }, 0),
    [filteredInventory],
  );

  const aggregatedTotals = useMemo<OrganizationInventorySummary["totals"] | null>(() => {
    if (!isAllStoresView) return null;

    if (hasMeaningfulTotals(orgInventorySummary?.totals)) {
      return orgInventorySummary!.totals;
    }

    if (orgInventorySummary?.stores?.length) {
      return deriveTotalsFromStores(orgInventorySummary.stores);
    }

    return createEmptyOrgTotals();
  }, [isAllStoresView, orgInventorySummary]);

  const aggregatedCurrencyDisplay = useMemo<Array<{ currency: string; display: string }>>(() => {
    if (isAllStoresView) {
      const totals = aggregatedTotals?.currencyTotals ?? [];
      if (!totals.length) {
        return [{ currency: "USD", display: formatCurrency(0, "USD") }];
      }

      return totals.map(({ currency: code, totalValue }) => ({
        currency: code,
        display: formatFlexibleCurrency(totalValue, code),
      }));
    }
    return [{ currency: currency, display: formatFlexibleCurrency(totalStockValue, currency) }];
  }, [aggregatedTotals, currency, isAllStoresView, totalStockValue]);

  useEffect(() => {
    if (!isAllStoresView || !orgId) return;
    if (orgInventorySummary) {
      console.info("[Inventory] Loaded organization summary", {
        orgId,
        totals: orgInventorySummary.totals,
        storeCount: orgInventorySummary.stores?.length ?? 0,
      });
    } else if (orgInventorySummary === undefined) {
      console.warn("[Inventory] Organization summary unavailable", { orgId });
    }
  }, [isAllStoresView, orgId, orgInventorySummary]);

  useEffect(() => {
    if (!isAllStoresView) {
      setSelectedOrgCurrency(null);
      return;
    }

    const availableCurrencies = aggregatedCurrencyDisplay.map((entry) => entry.currency);
    if (!availableCurrencies.length) {
      setSelectedOrgCurrency(null);
      return;
    }

    setSelectedOrgCurrency((previous) => {
      if (previous && availableCurrencies.includes(previous)) {
        return previous;
      }

      if (orgCurrencyStorageKey && typeof window !== "undefined") {
        const stored = window.localStorage.getItem(orgCurrencyStorageKey);
        if (stored && availableCurrencies.includes(stored)) {
          return stored;
        }
      }

      return availableCurrencies[0];
    });
  }, [aggregatedCurrencyDisplay, isAllStoresView, orgCurrencyStorageKey]);

  useEffect(() => {
    if (!orgCurrencyStorageKey || !selectedOrgCurrency || typeof window === "undefined") return;
    window.localStorage.setItem(orgCurrencyStorageKey, selectedOrgCurrency);
  }, [orgCurrencyStorageKey, selectedOrgCurrency]);

  const selectedCurrencyEntry = useMemo(() => {
    if (!aggregatedCurrencyDisplay.length) return null;
    if (!selectedOrgCurrency) return aggregatedCurrencyDisplay[0];
    return aggregatedCurrencyDisplay.find((entry) => entry.currency === selectedOrgCurrency) ?? aggregatedCurrencyDisplay[0];
  }, [aggregatedCurrencyDisplay, selectedOrgCurrency]);

  const hasMultipleOrgCurrencies = aggregatedCurrencyDisplay.length > 1;

  const canEditInventory = useMemo(
    () => isManager && storeId === managerStoreId && Boolean(storeId),
    [isManager, managerStoreId, storeId],
  );

  const resetEditState = () => {
    setEditingItem(null);
    setEditQuantity("");
    setEditMinStock("");
    setEditMaxStock("");
    setDeleteNotes("");
    setIsDeleteMode(false);
    setEditCostPrice("");
    setEditSalePrice("");
  };

  const openEditModal = (item: InventoryWithProduct) => {
    setEditingItem(item);
    setEditQuantity(String(item.quantity ?? ""));
    setEditMinStock(item.minStockLevel != null ? String(item.minStockLevel) : "");
    setEditMaxStock(item.maxStockLevel != null ? String(item.maxStockLevel) : "");
    setDeleteNotes("");
    setIsDeleteMode(false);
    const costValue = item.product?.costPrice ?? item.product?.cost ?? "";
    const saleValue = item.product?.salePrice ?? item.product?.price ?? "";
    setEditCostPrice(costValue ? String(costValue) : "");
    setEditSalePrice(saleValue ? String(saleValue) : "");
  };

  const updateInventoryMutation = useMutation({
    mutationFn: async (payload: { productId: string; storeId: string; quantity: number; minStockLevel: number; maxStockLevel?: number | null; costPrice?: number; salePrice?: number }) => {
      const csrfToken = await getCsrfToken();
      const response = await fetch("/api/inventory", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to update inventory" }));
        throw new Error(error.error ?? "Failed to update inventory");
      }

      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "inventory"] });
      toast({
        title: "Inventory updated",
        description: "The inventory item was successfully updated.",
      });
      resetEditState();
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteInventoryMutation = useMutation({
    mutationFn: async (payload: { productId: string; storeId: string; reason?: string }) => {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`/api/inventory/${payload.productId}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ storeId: payload.storeId, reason: payload.reason ?? undefined }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to delete inventory" }));
        throw new Error(error.error ?? "Failed to delete inventory");
      }

      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "inventory"] });
      toast({
        title: "Inventory removed",
        description: "The inventory item was removed from the store.",
      });
      resetEditState();
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingItem) return;

    if (!canEditInventory || !storeId) {
      toast({ title: "Store not selected", description: "Select a store you are allowed to manage before editing inventory.", variant: "destructive" });
      return;
    }

    const quantity = Number(editQuantity);
    const minStock = Number(editMinStock || 0);
    const maxStock = editMaxStock ? Number(editMaxStock) : undefined;
    const costPriceValue = editCostPrice !== "" ? Number(editCostPrice) : undefined;
    const salePriceValue = editSalePrice !== "" ? Number(editSalePrice) : undefined;

    if (Number.isNaN(quantity) || quantity < 0) {
      toast({ title: "Invalid quantity", description: "Quantity must be a non-negative number.", variant: "destructive" });
      return;
    }

    if (Number.isNaN(minStock) || minStock < 0) {
      toast({ title: "Invalid minimum stock", description: "Minimum stock must be zero or higher.", variant: "destructive" });
      return;
    }

    if (maxStock != null && (Number.isNaN(maxStock) || maxStock < minStock)) {
      toast({ title: "Invalid maximum stock", description: "Maximum stock must be higher than minimum stock.", variant: "destructive" });
      return;
    }

    if (costPriceValue != null && (Number.isNaN(costPriceValue) || costPriceValue < 0)) {
      toast({ title: "Invalid cost", description: "Cost price must be zero or higher.", variant: "destructive" });
      return;
    }

    if (salePriceValue != null && (Number.isNaN(salePriceValue) || salePriceValue < 0)) {
      toast({ title: "Invalid selling price", description: "Selling price must be zero or higher.", variant: "destructive" });
      return;
    }

    void updateInventoryMutation.mutateAsync({
      productId: editingItem.productId,
      storeId,
      quantity,
      minStockLevel: minStock,
      maxStockLevel: maxStock,
      costPrice: costPriceValue,
      salePrice: salePriceValue,
    });
  };

  const handleDeleteInventory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingItem) return;
    if (!deleteNotes.trim()) {
      toast({ title: "Reason required", description: "Provide a short reason for deleting this inventory record.", variant: "destructive" });
      return;
    }

    if (!canEditInventory || !storeId) {
      toast({ title: "Store not selected", description: "Select a store you are allowed to manage before deleting inventory.", variant: "destructive" });
      return;
    }

    void deleteInventoryMutation.mutateAsync({
      productId: editingItem.productId,
      storeId,
      reason: deleteNotes.trim(),
    });
  };

  const inventoryActionDisabled = !canEditInventory;

  const stockMovements = stockMovementsResponse?.data ?? [];

  const resetHistoryFilters = () => {
    setHistoryFilters({ actionType: "all", startDate: "", endDate: "" });
  };

  const handleExportHistory = () => {
    if (!stockMovements.length) {
      toast({ title: "No history to export", description: "Adjust filters or perform inventory updates to generate history." });
      return;
    }
    const header = ["Date", "Product", "Action", "Source", "Δ Qty", "Before → After", "Notes"];
    const rows = stockMovements.map((movement) => [
      new Date(movement.occurredAt).toLocaleString(),
      movement.productName ?? movement.productSku ?? movement.productId,
      movement.actionType,
      movement.source ?? "-",
      movement.delta,
      movement.quantityBefore,
      movement.quantityAfter,
      movement.notes ?? "",
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `stock-history-${storeId}-${Date.now()}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatMovementLabel = (movement: StockMovementEntry) => {
    switch (movement.actionType) {
      case "create":
        return "Initial stock";
      case "update":
        return "Manual update";
      case "adjustment":
        return movement.delta >= 0 ? "Stock added" : "Stock removed";
      case "import":
        return "Import";
      case "delete":
        return "Deleted";
      default:
        return movement.actionType;
    }
  };

  const productHistoryMovements = productHistoryResponse?.data ?? [];

  const getStockStatus = (item: InventoryWithProduct): StockStatus => {
    if (item.quantity === 0) return { status: "out", color: "destructive", text: "Out of Stock" };
    if (item.quantity <= (item.minStockLevel ?? 0)) return { status: "low", color: "secondary", text: "Low Stock" };
    if (item.quantity > (item.maxStockLevel ?? Number.MAX_SAFE_INTEGER)) return { status: "over", color: "outline", text: "Overstocked" };
    return { status: "good", color: "default", text: "In Stock" };
  };

  const shouldShowStoreSelector = isAdmin;
  const hasSelectedStore = Boolean(storeId);

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            {isManager ? (
              <p className="text-sm text-slate-600">Inventory for your assigned store</p>
            ) : null}
          </div>
          {shouldShowStoreSelector ? (
            <div className="w-full sm:w-64">
              <Select
                value={selectedStore || undefined}
                onValueChange={setSelectedStore}
                disabled={adminStoreOptions.length === 0}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select a store" />
                </SelectTrigger>
                <SelectContent>
                  {adminStoreOptions.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {shouldShowStoreSelector && !hasSelectedStore && !isAllStoresView ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-600">
              Select a store to view inventory details.
            </CardContent>
          </Card>
        ) : null}

        {isAllStoresView ? (
          <div className="space-y-6">
            <Card className="border-0 shadow-none bg-muted/30">
              <CardHeader className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>All stores summary</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Aggregated snapshot across every store. Pick a specific store to inspect detailed stock levels.
                    </p>
                  </div>
                  {hasMultipleOrgCurrencies && selectedCurrencyEntry && (
                    <div className="w-full sm:w-56">
                      <Label className="text-xs uppercase tracking-wide text-slate-500">Currency focus</Label>
                      <Select value={selectedOrgCurrency ?? undefined} onValueChange={setSelectedOrgCurrency}>
                        <SelectTrigger className="h-9 mt-1">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {aggregatedCurrencyDisplay.map((entry) => (
                            <SelectItem key={entry.currency} value={entry.currency}>
                              {entry.currency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <SummaryMetricCard title="Total Products" value={aggregatedTotals?.totalProducts ?? 0} />
                  <SummaryMetricCard title="Low Stock Items" value={aggregatedTotals?.lowStockCount ?? 0} valueClassName="text-yellow-600" />
                  <SummaryMetricCard title="Out of Stock" value={aggregatedTotals?.outOfStockCount ?? 0} valueClassName="text-red-600" />
                  <SummaryMetricCard title="Overstocked" value={aggregatedTotals?.overstockCount ?? 0} valueClassName="text-blue-600" />
                  <Card className="border border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
                      {hasMultipleOrgCurrencies ? (
                        <p className="text-xs text-muted-foreground">Showing {selectedCurrencyEntry?.currency}</p>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <p className="text-2xl font-semibold text-slate-800">
                        {selectedCurrencyEntry?.display}
                        <span className="text-xs text-slate-500 ml-2">{selectedCurrencyEntry?.currency}</span>
                      </p>
                      {hasMultipleOrgCurrencies ? (
                        <p className="text-xs text-muted-foreground">
                          Switch currencies above to view totals in another denomination.
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {orgInventorySummary?.stores?.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>Store snapshots</CardTitle>
                  <CardDescription>High-level totals for each store in your organization.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="py-2 pr-4 font-medium">Store</th>
                          <th className="py-2 pr-4 font-medium">Currency</th>
                          <th className="py-2 pr-4 font-medium">Products</th>
                          <th className="py-2 pr-4 font-medium">Low Stock</th>
                          <th className="py-2 pr-4 font-medium">Out of Stock</th>
                          <th className="py-2 pr-4 font-medium">Overstocked</th>
                          <th className="py-2 pr-4 font-medium text-right">Inventory Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orgInventorySummary.stores.map((storeSummary) => (
                          <tr key={storeSummary.storeId} className="border-b last:border-0">
                            <td className="py-3 pr-4 font-medium text-slate-800">{storeSummary.storeName}</td>
                            <td className="py-3 pr-4 text-slate-600">{storeSummary.currency}</td>
                            <td className="py-3 pr-4">{storeSummary.totalProducts}</td>
                            <td className="py-3 pr-4 text-yellow-700">{storeSummary.lowStockCount}</td>
                            <td className="py-3 pr-4 text-red-600">{storeSummary.outOfStockCount}</td>
                            <td className="py-3 pr-4 text-blue-600">{storeSummary.overstockCount}</td>
                            <td className="py-3 pr-4 text-right font-semibold">{formatFlexibleCurrency(storeSummary.totalValue, storeSummary.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent className="py-8 text-center text-slate-600">
                Choose an individual store to review detailed stock levels.
              </CardContent>
            </Card>
          </div>
        ) : hasSelectedStore ? (
          <div>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{filteredInventory.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{lowStockItems.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatFlexibleCurrency(totalStockValue, currency)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{outOfStockItems.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Overstocked Items</CardTitle>
                  <Package className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{overstockedItems.length}</div>
                </CardContent>
              </Card>
            </div>

            {/* Filters & Stock Levels */}
            <Card>
              <CardHeader>
                <CardTitle>Manage Stock Levels</CardTitle>
                <CardDescription>Filter and review inventory for this store.</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Filter className="w-5 h-5" />
                      <span>Filters</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search products..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 h-10"
                        />
                      </div>

                      <Select value={selectedCategory || undefined} onValueChange={setSelectedCategory}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {categories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={selectedBrand || undefined} onValueChange={setSelectedBrand}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="All Brands" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Brands</SelectItem>
                          {brands.map((brand) => (
                            <SelectItem key={brand} value={brand}>
                              {brand}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={stockFilter} onValueChange={setStockFilter}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Stock Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Stock</SelectItem>
                          <SelectItem value="low">Low Stock</SelectItem>
                          <SelectItem value="out">Out of Stock</SelectItem>
                          <SelectItem value="overstocked">Overstocked</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Inventory Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Stock Levels</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 sm:p-4 font-medium">Product</th>
                            <th className="text-left p-3 sm:p-4 font-medium hidden sm:table-cell">SKU</th>
                            <th className="text-right p-3 sm:p-4 font-medium">Current Stock</th>
                            <th className="text-right p-3 sm:p-4 font-medium hidden lg:table-cell">Min Level</th>
                            <th className="text-right p-3 sm:p-4 font-medium hidden lg:table-cell">Max Level</th>
                            <th className="text-right p-3 sm:p-4 font-medium hidden md:table-cell">Value</th>
                            <th className="text-center p-3 sm:p-4 font-medium">Status</th>
                            <th className="text-center p-3 sm:p-4 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredInventory.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="p-6 text-center text-slate-500">
                                No inventory items match your filters.
                              </td>
                            </tr>
                          ) : (
                            filteredInventory.map((item: InventoryWithProduct) => (
                              <tr key={item.id} className="border-b hover:bg-slate-50">
                                <td className="p-3 sm:p-4">
                                  <div className="flex items-center space-x-3">
                                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                                      <Package className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                                    </div>
                                    <div>
                                      <p className="font-medium text-slate-800 text-sm sm:text-base">{item.product?.name ?? "Unknown Product"}</p>
                                      <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">{item.product?.barcode ?? ""}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3 sm:p-4 hidden sm:table-cell">
                                  <span className="text-sm text-slate-600">{item.product?.sku ?? ""}</span>
                                </td>
                                <td className="p-3 sm:p-4 text-right">
                                  <span className="font-medium text-slate-800">{item.quantity}</span>
                                </td>
                                <td className="p-3 sm:p-4 text-right hidden lg:table-cell">
                                  <span className="text-sm text-slate-600">{item.minStockLevel ?? "-"}</span>
                                </td>
                                <td className="p-3 sm:p-4 text-right hidden lg:table-cell">
                                  <span className="text-sm text-slate-600">{item.maxStockLevel ?? "-"}</span>
                                </td>
                                <td className="p-3 sm:p-4 text-right hidden md:table-cell">
                                  <span className="font-medium text-slate-800">
                                    {formatFlexibleCurrency(
                                      item.quantity * (item.product?.price ? parseFloat(String(item.product.price)) : item.formattedPrice ?? 0),
                                      currency,
                                    )}
                                  </span>
                                </td>
                                <td className="p-3 sm:p-4 text-center">
                                  {(() => {
                                    const status = getStockStatus(item);
                                    return (
                                      <Badge variant={status.color} className="capitalize">
                                        {status.text}
                                      </Badge>
                                    );
                                  })()}
                                </td>
                                <td className="p-3 sm:p-4 text-center">
                                  <div className="flex items-center justify-center space-x-1 sm:space-x-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="w-8 h-8 p-0 min-h-[32px]"
                                      onClick={() => setHistoryProduct(item)}
                                      disabled={!hasSelectedStore}
                                    >
                                      <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="w-8 h-8 p-0 min-h-[32px]"
                                      disabled={inventoryActionDisabled}
                                      onClick={() => openEditModal(item)}
                                    >
                                      <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            {/* Stock History */}
            {shouldFetchHistory ? (
              <Card>
                <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <HistoryIcon className="h-5 w-5" /> Recent Stock History
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">Filter and review the latest inventory movements for this store.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Select
                      value={historyFilters.actionType}
                      onValueChange={(value) => setHistoryFilters((prev) => ({ ...prev, actionType: value }))}
                    >
                      <SelectTrigger className="w-40 h-9">
                        <SelectValue placeholder="Action" />
                      </SelectTrigger>
                      <SelectContent>
                        {MOVEMENT_ACTION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={historyFilters.startDate}
                      onChange={(event) => setHistoryFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                      className="w-36 h-9"
                    />
                    <Input
                      type="date"
                      value={historyFilters.endDate}
                      onChange={(event) => setHistoryFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                      className="w-36 h-9"
                    />
                    <Button variant="ghost" onClick={resetHistoryFilters} className="h-9">
                      Clear filters
                    </Button>
                    <Button variant="outline" onClick={handleExportHistory} className="h-9">
                      <Download className="h-4 w-4 mr-2" /> Export CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isHistoryLoading ? (
                    <p className="text-sm text-muted-foreground">Loading stock history...</p>
                  ) : stockMovements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No stock history found for the selected filters.</p>
                  ) : (
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left border-b">
                            <th className="p-3 whitespace-nowrap">Date</th>
                            <th className="p-3 whitespace-nowrap">Product</th>
                            <th className="p-3 whitespace-nowrap">Action</th>
                            <th className="p-3 whitespace-nowrap">Source</th>
                            <th className="p-3 whitespace-nowrap text-right">Δ Qty</th>
                            <th className="p-3 whitespace-nowrap text-right">Before → After</th>
                            <th className="p-3 whitespace-nowrap">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockMovements.map((movement) => (
                            <tr key={movement.id} className="border-b hover:bg-slate-50">
                              <td className="p-3 whitespace-nowrap">{new Date(movement.occurredAt).toLocaleString()}</td>
                              <td className="p-3">
                                <div className="font-medium text-slate-800">{movement.productName ?? movement.productSku ?? movement.productId}</div>
                                <div className="text-xs text-muted-foreground">{movement.productSku ?? movement.productBarcode ?? ""}</div>
                              </td>
                              <td className="p-3 whitespace-nowrap">{formatMovementLabel(movement)}</td>
                              <td className="p-3 whitespace-nowrap text-muted-foreground">{movement.source ?? "-"}</td>
                              <td className={`p-3 text-right font-semibold ${movement.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {movement.delta > 0 ? "+" : ""}
                                {movement.delta}
                              </td>
                              <td className="p-3 text-right whitespace-nowrap">
                                {movement.quantityBefore} → {movement.quantityAfter}
                              </td>
                              <td className="p-3 text-muted-foreground max-w-xs">
                                {movement.notes || "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog open={Boolean(editingItem)} onOpenChange={(open) => {
        if (!open) {
          resetEditState();
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isDeleteMode ? "Delete Inventory Item" : "Edit Inventory"}</DialogTitle>
            <DialogDescription>
              {isDeleteMode
                ? "Deleting this inventory record removes stock tracking for the product in this store."
                : `Update stock levels for ${editingItem?.product?.name ?? "the selected product"}.`}
            </DialogDescription>
          </DialogHeader>

          {!isDeleteMode ? (
            <form className="space-y-4" onSubmit={handleSubmitEdit}>
              <div>
                <Label htmlFor="quantity">Quantity on hand</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={0}
                  value={editQuantity}
                  onChange={(event) => setEditQuantity(event.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="min-stock">Minimum stock level</Label>
                  <Input
                    id="min-stock"
                    type="number"
                    min={0}
                    value={editMinStock}
                    onChange={(event) => setEditMinStock(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="max-stock">Maximum stock level</Label>
                  <Input
                    id="max-stock"
                    type="number"
                    min={0}
                    value={editMaxStock}
                    onChange={(event) => setEditMaxStock(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cost-price">Cost price (per unit)</Label>
                  <Input
                    id="cost-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editCostPrice}
                    onChange={(event) => setEditCostPrice(event.target.value)}
                    placeholder="Leave blank to keep current cost"
                  />
                </div>
                <div>
                  <Label htmlFor="sale-price">Selling price</Label>
                  <Input
                    id="sale-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editSalePrice}
                    onChange={(event) => setEditSalePrice(event.target.value)}
                    placeholder="Leave blank to keep current price"
                  />
                </div>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsDeleteMode(true)} className="text-red-600 hover:text-red-700">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete inventory record
                </Button>
                <div className="flex w-full sm:w-auto gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={resetEditState}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateInventoryMutation.isPending || deleteInventoryMutation.isPending}
                  >
                    {updateInventoryMutation.isPending ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleDeleteInventory}>
              <div>
                <Label htmlFor="delete-notes">Reason for deletion</Label>
                <Textarea
                  id="delete-notes"
                  placeholder="Explain why this inventory record is being removed."
                  value={deleteNotes}
                  onChange={(event) => setDeleteNotes(event.target.value)}
                  required
                />
              </div>

              <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsDeleteMode(false)}>
                  Back to edit
                </Button>
                <div className="flex w-full sm:w-auto gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={resetEditState}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={deleteInventoryMutation.isPending || updateInventoryMutation.isPending}
                  >
                    {deleteInventoryMutation.isPending ? "Deleting..." : "Confirm delete"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyProduct)} onOpenChange={(open) => {
        if (!open) {
          setHistoryProduct(null);
        }
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Stock history for {historyProduct?.product?.name ?? "selected product"}</DialogTitle>
            <DialogDescription>
              Recent movements showing how this product&rsquo;s stock changed over time.
            </DialogDescription>
          </DialogHeader>
          {isProductHistoryLoading ? (
            <p className="text-sm text-muted-foreground">Loading history...</p>
          ) : productHistoryMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock movements found for this product.</p>
          ) : (
            <div className="space-y-4 max-h-[420px] overflow-auto">
              {productHistoryMovements.map((movement) => (
                <div key={movement.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{new Date(movement.occurredAt).toLocaleString()}</span>
                    <span>{movement.source ?? "manual"}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-800">{formatMovementLabel(movement)}</p>
                      <p className="text-sm text-muted-foreground">{movement.notes || "No additional notes"}</p>
                    </div>
                    <div className={`font-semibold ${movement.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {movement.delta > 0 ? "+" : ""}{movement.delta}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Stock {movement.quantityBefore} → {movement.quantityAfter}
                  </p>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryProduct(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
interface SummaryMetricCardProps {
  title: string;
  value: number | string;
  valueClassName?: string;
}
function SummaryMetricCard({ title, value, valueClassName }: SummaryMetricCardProps) {
  const display = typeof value === "number" ? value.toLocaleString() : value;
  const className = ["text-2xl font-bold", valueClassName].filter(Boolean).join(" ");
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={className}>{display}</div>
      </CardContent>
    </Card>
  );
}