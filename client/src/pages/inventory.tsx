import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, AlertTriangle, Search, Filter, Edit, Eye, Download, History as HistoryIcon, MinusCircle, DollarSign, Layers, TrendingDown, TrendingUp, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/notice";
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
  avgCost?: number | null;
  totalCostValue?: number | null;
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

// Cost layer and margin analysis types
type CostLayerInfo = {
  id: string;
  quantityRemaining: number;
  unitCost: number;
  source?: string | null;
  createdAt: string | null;
};

type CostLayerSummary = {
  layers: CostLayerInfo[];
  totalQuantity: number;
  weightedAverageCost: number;
  oldestLayerCost: number | null;
  newestLayerCost: number | null;
};

type MarginAnalysis = {
  proposedSalePrice: number;
  costLayers: Array<{
    quantity: number;
    unitCost: number;
    margin: number;
    marginPercent: number;
    wouldLoseMoney: boolean;
  }>;
  totalQuantity: number;
  weightedAverageCost: number;
  overallMargin: number;
  overallMarginPercent: number;
  recommendedMinPrice: number;
  layersAtLoss: number;
  quantityAtLoss: number;
};

type StockRemovalReason = "expired" | "damaged" | "low_sales" | "returned_to_manufacturer" | "theft" | "other";
type RefundType = "none" | "partial" | "full";

type RemoveStockPayload = {
  productId: string;
  storeId: string;
  quantity: number;
  reason: StockRemovalReason;
  refundType: RefundType;
  refundAmount?: number;
  notes?: string;
};

type DropProductPayload = {
  productId: string;
  storeId: string;
  reason: StockRemovalReason;
  refundType: RefundType;
  refundAmount?: number;
  notes?: string;
};

const STOCK_REMOVAL_REASONS: Array<{ value: StockRemovalReason; label: string }> = [
  { value: "expired", label: "Expired" },
  { value: "damaged", label: "Damaged" },
  { value: "low_sales", label: "Low sales / Removing from shelves" },
  { value: "returned_to_manufacturer", label: "Returned to manufacturer" },
  { value: "theft", label: "Theft / Loss" },
  { value: "other", label: "Other" },
];

const REFUND_TYPES: Array<{ value: RefundType; label: string; description: string }> = [
  { value: "none", label: "No refund", description: "Store absorbs the full cost (write-off)" },
  { value: "partial", label: "Partial refund", description: "Partial reimbursement from manufacturer" },
  { value: "full", label: "Full refund", description: "Full reimbursement from manufacturer" },
];

const MOVEMENT_ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All actions" },
  { value: "create", label: "Initial stock" },
  { value: "update", label: "Manual updates" },
  { value: "adjustment", label: "Adjustments" },
  { value: "import", label: "Imports" },
  { value: "delete", label: "Deletions" },
];

const parseMaybeNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeStockMovementResponse = (payload: unknown): StockMovementApiResponse => {
  if (Array.isArray(payload)) {
    return { data: payload };
  }

  if (payload && Array.isArray((payload as StockMovementApiResponse).data)) {
    return payload as StockMovementApiResponse;
  }

  return { data: [] };
};

const getInventoryQuantity = (item: InventoryWithProduct): number => {
  return parseMaybeNumber(item.quantity) ?? 0;
};

export const getInventoryUnitCost = (item: InventoryWithProduct): number => {
  // Prefer avgCost from server (derived from FIFO cost layers when available)
  const avgCost = parseMaybeNumber(item.avgCost);
  if (avgCost !== null && avgCost > 0) {
    return avgCost;
  }

  // Fallback: derive from totalCostValue / quantity
  const quantity = getInventoryQuantity(item);
  const totalCost = parseMaybeNumber(item.totalCostValue);
  if (totalCost !== null && quantity > 0) {
    return totalCost / quantity;
  }

  const fallbackCost =
    parseMaybeNumber((item.product as any)?.costPrice) ?? parseMaybeNumber((item.product as any)?.cost);
  return fallbackCost ?? 0;
};

export const getInventoryTotalCost = (item: InventoryWithProduct): number => {
  const totalCost = parseMaybeNumber(item.totalCostValue);
  if (totalCost !== null) {
    return totalCost;
  }
  return getInventoryUnitCost(item) * getInventoryQuantity(item);
};

const getStockStatus = (item: InventoryWithProduct): StockStatus => {
  const quantity = getInventoryQuantity(item);
  if (quantity === 0) {
    return { status: "out", color: "destructive", text: "Out of Stock" };
  }

  const minStock = parseMaybeNumber(item.minStockLevel) ?? 0;
  if (quantity <= minStock) {
    return { status: "low", color: "secondary", text: "Low Stock" };
  }

  const maxStock = parseMaybeNumber(item.maxStockLevel);
  if (typeof maxStock === "number" && quantity > maxStock) {
    return { status: "over", color: "outline", text: "Overstocked" };
  }

  return { status: "good", color: "default", text: "In Stock" };
};

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
  const [quantityToAdd, setQuantityToAdd] = useState<string>("");
  const [editMinStock, setEditMinStock] = useState<string>("");
  const [editMaxStock, setEditMaxStock] = useState<string>("");
  const [editCostPrice, setEditCostPrice] = useState<string>("");
  const [editSalePrice, setEditSalePrice] = useState<string>("");
  // Default history filters to last 7 days
  const [historyFilters, setHistoryFilters] = useState<{ actionType: string; startDate: string; endDate: string }>(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      actionType: "all",
      startDate: sevenDaysAgo.toISOString().split("T")[0],
      endDate: now.toISOString().split("T")[0],
    };
  });
  const [historyProduct, setHistoryProduct] = useState<InventoryWithProduct | null>(null);
  const [selectedOrgCurrency, setSelectedOrgCurrency] = useState<string | null>(null);

  // Stock removal modal state
  const [isRemovalMode, setIsRemovalMode] = useState(false);
  const [removalQuantity, setRemovalQuantity] = useState<string>("");
  const [removalReason, setRemovalReason] = useState<StockRemovalReason>("expired");
  const [refundType, setRefundType] = useState<RefundType>("none");
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [removalNotes, setRemovalNotes] = useState<string>("");

  // Margin warning state
  const [showMarginWarning, setShowMarginWarning] = useState(false);
  const [marginAnalysis, setMarginAnalysis] = useState<MarginAnalysis | null>(null);
  const [instantMarginWarning, setInstantMarginWarning] = useState<{ belowCost: boolean; avgCost: number } | null>(null);

  const [confirmAction, setConfirmAction] = useState<"remove" | "drop" | null>(null);
  const [pendingRemovalPayload, setPendingRemovalPayload] = useState<RemoveStockPayload | null>(null);
  const [pendingDropPayload, setPendingDropPayload] = useState<DropProductPayload | null>(null);

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
      const payload = await response.json();
      return normalizeStockMovementResponse(payload);
    },
  });

  const selectedHistoryStoreId = historyProduct?.storeId || storeId;
  const { data: productHistoryResponse, isLoading: isProductHistoryLoading } = useQuery<StockMovementApiResponse>({
    queryKey: ["/api/inventory", historyProduct?.productId, selectedHistoryStoreId, "history"],
    enabled: Boolean(historyProduct && selectedHistoryStoreId),
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      const query = params.toString();
      const response = await fetch(
        `/api/inventory/${historyProduct?.productId}/${selectedHistoryStoreId}/history${query ? `?${query}` : ""}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load product history");
      }
      const payload = await response.json();
      return normalizeStockMovementResponse(payload);
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
    () =>
      filteredInventory.filter((item) => {
        const maxStock = parseMaybeNumber(item.maxStockLevel);
        if (typeof maxStock !== "number") {
          return false;
        }
        return getInventoryQuantity(item) > maxStock;
      }),
    [filteredInventory],
  );

  // Calculate total inventory value at COST (not sale price) for accurate financial reporting
  const totalStockValue = useMemo(
    () => filteredInventory.reduce((sum, item) => sum + getInventoryTotalCost(item), 0),
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
    setQuantityToAdd("");
    setEditMinStock("");
    setEditMaxStock("");
    setIsRemovalMode(false);
    setEditCostPrice("");
    setEditSalePrice("");
    setRemovalQuantity("");
    setRemovalReason("expired");
    setRefundType("none");
    setRefundAmount("");
    setRemovalNotes("");
    setShowMarginWarning(false);
    setMarginAnalysis(null);
    setInstantMarginWarning(null);
  };

  // Fetch cost layers when editing an item
  const { data: costLayerData } = useQuery<CostLayerSummary>({
    queryKey: ["/api/inventory", editingItem?.productId, storeId, "cost-layers"],
    enabled: Boolean(editingItem && storeId),
    queryFn: async () => {
      const response = await fetch(`/api/inventory/${editingItem?.productId}/${storeId}/cost-layers`);
      if (!response.ok) {
        throw new Error("Failed to load cost layers");
      }
      return response.json();
    },
  });

  // Debounced margin check for better performance
  const marginCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get effective cost for instant margin checks (from cost layers or inventory avgCost)
  const getEffectiveCost = useCallback((): number => {
    // Prefer cost layer data if available
    if (costLayerData && costLayerData.weightedAverageCost > 0) {
      return costLayerData.weightedAverageCost;
    }
    // Fallback to inventory item avgCost
    if (editingItem) {
      return getInventoryUnitCost(editingItem);
    }
    return 0;
  }, [costLayerData, editingItem]);

  const checkMargin = useCallback((proposedPrice: number) => {
    // Clear any pending check
    if (marginCheckTimeoutRef.current) {
      clearTimeout(marginCheckTimeoutRef.current);
    }

    if (!editingItem || !storeId || proposedPrice <= 0) {
      setShowMarginWarning(false);
      setMarginAnalysis(null);
      setInstantMarginWarning(null);
      return;
    }

    // INSTANT client-side check using available cost data (no API call needed)
    const effectiveCost = getEffectiveCost();
    if (effectiveCost > 0 && proposedPrice < effectiveCost) {
      setInstantMarginWarning({ belowCost: true, avgCost: effectiveCost });
    } else {
      setInstantMarginWarning(null);
    }

    // Debounced API call for detailed layer analysis (reduced to 150ms for faster response)
    marginCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const csrfToken = await getCsrfToken();
        const response = await fetch(`/api/inventory/${editingItem.productId}/${storeId}/analyze-margin`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({ proposedSalePrice: proposedPrice }),
        });

        if (response.ok) {
          const analysis = await response.json() as MarginAnalysis;
          setMarginAnalysis(analysis);
          setShowMarginWarning(analysis.layersAtLoss > 0);
          // Clear instant warning if API provides more accurate data
          if (analysis.layersAtLoss === 0) {
            setInstantMarginWarning(null);
          }
        }
      } catch (error) {
        console.error("Failed to analyze margin", error);
      }
    }, 150); // Reduced debounce for faster response
  }, [editingItem, storeId, getEffectiveCost]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (marginCheckTimeoutRef.current) {
        clearTimeout(marginCheckTimeoutRef.current);
      }
    };
  }, []);

  const openEditModal = (item: InventoryWithProduct) => {
    setEditingItem(item);
    setQuantityToAdd(""); // Start with empty - user enters quantity to add
    setEditMinStock(item.minStockLevel != null ? String(item.minStockLevel) : "");
    setEditMaxStock(item.maxStockLevel != null ? String(item.maxStockLevel) : "");
    setIsRemovalMode(false);
    const costValue = item.product?.costPrice ?? item.product?.cost ?? "";
    const saleValue = item.product?.salePrice ?? item.product?.price ?? "";
    setEditCostPrice(costValue ? String(costValue) : "");
    setEditSalePrice(saleValue ? String(saleValue) : "");
    setShowMarginWarning(false);
    setMarginAnalysis(null);
    setInstantMarginWarning(null);
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
      // Invalidate inventory and related queries for real-time updates
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "stock-movements"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
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

  const removeStockMutation = useMutation({
    mutationFn: async (payload: {
      productId: string;
      storeId: string;
      quantity: number;
      reason: StockRemovalReason;
      refundType: RefundType;
      refundAmount?: number;
      notes?: string;
    }) => {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`/api/inventory/${payload.productId}/${payload.storeId}/remove`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          quantity: payload.quantity,
          reason: payload.reason,
          refundType: payload.refundType,
          refundAmount: payload.refundAmount,
          notes: payload.notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to remove stock" }));
        throw new Error(error.error ?? "Failed to remove stock");
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate inventory and stock movements for real-time updates
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "stock-movements"] });
      const lossText = data.lossAmount > 0 ? ` Loss recorded: ${formatFlexibleCurrency(data.lossAmount, currency)}.` : "";
      const refundText = data.refundAmount > 0 ? ` Refund: ${formatFlexibleCurrency(data.refundAmount, currency)}.` : "";
      toast({
        title: "Stock removed",
        description: `Successfully removed stock.${lossText}${refundText}`,
      });
      resetEditState();
    },
    onError: (error: Error) => {
      toast({
        title: "Removal failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const dropProductMutation = useMutation({
    mutationFn: async (payload: {
      productId: string;
      storeId: string;
      reason: StockRemovalReason;
      refundType: RefundType;
      refundAmount?: number;
      notes?: string;
    }) => {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`/api/inventory/${payload.productId}/${payload.storeId}/drop`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          reason: payload.reason,
          refundType: payload.refundType,
          refundAmount: payload.refundAmount,
          notes: payload.notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to drop product" }));
        throw new Error(error.error ?? "Failed to drop product");
      }

      return response.json();
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "stock-movements"] });
      toast({
        title: "Product dropped",
        description:
          data.removedQuantity > 0
            ? `All ${data.removedQuantity} units were removed and the product was deactivated.`
            : "Product was deactivated and will no longer be tracked.",
      });
      resetEditState();
    },
    onError: (error: Error) => {
      toast({
        title: "Drop failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRemoveStock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingItem) return;

    if (!canEditInventory || !storeId) {
      toast({ title: "Store not selected", description: "Select a store you are allowed to manage.", variant: "destructive" });
      return;
    }

    const qty = Number(removalQuantity);
    if (Number.isNaN(qty) || qty < 1) {
      toast({ title: "Invalid quantity", description: "Quantity must be at least 1.", variant: "destructive" });
      return;
    }

    if (qty > (editingItem.quantity || 0)) {
      toast({ title: "Invalid quantity", description: `Cannot remove more than available stock (${editingItem.quantity}).`, variant: "destructive" });
      return;
    }

    const refundVal = refundAmount !== "" ? Number(refundAmount) : undefined;
    if (refundType === "partial" && (refundVal === undefined || Number.isNaN(refundVal) || refundVal < 0)) {
      toast({ title: "Invalid refund amount", description: "Provide a valid refund amount for partial refund.", variant: "destructive" });
      return;
    }

    setPendingRemovalPayload({
      productId: editingItem.productId,
      storeId,
      quantity: qty,
      reason: removalReason,
      refundType,
      refundAmount: refundVal,
      notes: removalNotes || undefined,
    });
    setConfirmAction("remove");
  };

  const initiateDropProduct = () => {
    if (!editingItem) return;
    if (!canEditInventory || !storeId) {
      toast({ title: "Store not selected", description: "Select a store you are allowed to manage.", variant: "destructive" });
      return;
    }

    const refundVal = refundAmount !== "" ? Number(refundAmount) : undefined;
    if (refundType === "partial" && (refundVal === undefined || Number.isNaN(refundVal) || refundVal < 0)) {
      toast({ title: "Invalid refund amount", description: "Provide a valid refund amount for partial refund.", variant: "destructive" });
      return;
    }

    setPendingDropPayload({
      productId: editingItem.productId,
      storeId,
      reason: removalReason,
      refundType,
      refundAmount: refundVal,
      notes: removalNotes || undefined,
    });
    setConfirmAction("drop");
  };

  const handleConfirmInventoryAction = async () => {
    if (confirmAction === "remove" && pendingRemovalPayload) {
      try {
        await removeStockMutation.mutateAsync(pendingRemovalPayload);
      } finally {
        setPendingRemovalPayload(null);
        setConfirmAction(null);
      }
      return;
    }

    if (confirmAction === "drop" && pendingDropPayload) {
      try {
        await dropProductMutation.mutateAsync(pendingDropPayload);
      } finally {
        setPendingDropPayload(null);
        setConfirmAction(null);
      }
    }
  };

  const isConfirming = confirmAction === "remove"
    ? removeStockMutation.isPending
    : confirmAction === "drop"
      ? dropProductMutation.isPending
      : false;

  // Quantity to add logic - only positive values allowed for adding stock
  const originalQuantity = editingItem?.quantity ?? 0;
  const addedQuantity = Math.max(0, Number(quantityToAdd) || 0);
  const newQuantity = originalQuantity + addedQuantity;
  const isQuantityIncreasing = addedQuantity > 0;

  const handleSubmitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingItem) return;

    if (!canEditInventory || !storeId) {
      toast({ title: "Store not selected", description: "Select a store you are allowed to manage before editing inventory.", variant: "destructive" });
      return;
    }

    const minStock = Number(editMinStock || 0);
    const maxStock = editMaxStock ? Number(editMaxStock) : undefined;
    const costPriceValue = editCostPrice !== "" ? Number(editCostPrice) : undefined;
    const salePriceValue = editSalePrice !== "" ? Number(editSalePrice) : undefined;

    if (Number.isNaN(newQuantity) || newQuantity < 0) {
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
      quantity: newQuantity,
      minStockLevel: minStock,
      maxStockLevel: maxStock,
      costPrice: costPriceValue,
      salePrice: salePriceValue,
    });
  };

  const inventoryActionDisabled = !canEditInventory;

  const stockMovements = stockMovementsResponse?.data ?? [];

  const resetHistoryFilters = () => {
    // Reset to default last 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    setHistoryFilters({
      actionType: "all",
      startDate: sevenDaysAgo.toISOString().split("T")[0],
      endDate: now.toISOString().split("T")[0],
    });
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

            {/* AI Demand Forecasting Widget */}
            {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
              <Card className="border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50 to-white">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-purple-700">
                    <Sparkles className="h-5 w-5" />
                    Demand Forecast & Restocking Insights
                  </CardTitle>
                  <CardDescription>AI-powered recommendations based on your inventory levels</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {outOfStockItems.length > 0 && (
                      <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <span className="font-medium text-red-700">Critical: Restock Now</span>
                        </div>
                        <p className="text-sm text-red-600 mb-2">{outOfStockItems.length} out of stock</p>
                        <ul className="text-xs text-red-700 space-y-1 max-h-20 overflow-y-auto">
                          {outOfStockItems.slice(0, 3).map((item) => (
                            <li key={item.productId} className="flex items-center gap-1">
                              <TrendingDown className="h-3 w-3" />
                              {item.product?.name || 'Unknown'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {lowStockItems.filter(i => i.quantity > 0).length > 0 && (
                      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingDown className="h-4 w-4 text-yellow-600" />
                          <span className="font-medium text-yellow-700">Low Stock Alert</span>
                        </div>
                        <p className="text-sm text-yellow-600 mb-2">{lowStockItems.filter(i => i.quantity > 0).length} running low</p>
                        <ul className="text-xs text-yellow-700 space-y-1 max-h-20 overflow-y-auto">
                          {lowStockItems.filter(i => i.quantity > 0).slice(0, 3).map((item) => (
                            <li key={item.productId} className="flex items-center justify-between">
                              <span className="truncate">{item.product?.name || 'Unknown'}</span>
                              <Badge variant="outline" className="text-xs ml-1">{item.quantity}</Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="h-4 w-4 text-purple-600" />
                        <span className="font-medium text-purple-700">Restocking Tips</span>
                      </div>
                      <ul className="text-xs text-purple-700 space-y-2">
                        <li>• Prioritize out-of-stock items</li>
                        <li>• Order before weekend rush</li>
                        <li>• Promote overstocked items</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

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
                            <th className="text-right p-3 sm:p-4 font-medium">Avg. Cost</th>
                            <th className="text-right p-3 sm:p-4 font-medium">Selling Price</th>
                            <th className="text-right p-3 sm:p-4 font-medium hidden lg:table-cell">Min Level</th>
                            <th className="text-right p-3 sm:p-4 font-medium hidden lg:table-cell">Max Level</th>
                            <th className="text-right p-3 sm:p-4 font-medium hidden md:table-cell">Stock Value</th>
                            <th className="text-center p-3 sm:p-4 font-medium">Status</th>
                            <th className="text-center p-3 sm:p-4 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredInventory.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="p-6 text-center text-slate-500">
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
                                <td className="p-3 sm:p-4 text-right">
                                  <span className="text-sm text-slate-600">
                                    {(() => {
                                      const unitCost = getInventoryUnitCost(item);
                                      return unitCost > 0
                                        ? formatFlexibleCurrency(unitCost, currency)
                                        : "-";
                                    })()}
                                  </span>
                                </td>
                                <td className="p-3 sm:p-4 text-right">
                                  <span className="text-sm text-slate-600">
                                    {(() => {
                                      const productAny = item.product as Record<string, unknown> | null;
                                      const salePrice = productAny?.salePrice ?? productAny?.price ?? null;
                                      return salePrice ? formatFlexibleCurrency(parseFloat(String(salePrice)), currency) : "-";
                                    })()}
                                  </span>
                                </td>
                                <td className="p-3 sm:p-4 text-right hidden lg:table-cell">
                                  <span className="text-sm text-slate-600">{item.minStockLevel ?? "-"}</span>
                                </td>
                                <td className="p-3 sm:p-4 text-right hidden lg:table-cell">
                                  <span className="text-sm text-slate-600">{item.maxStockLevel ?? "-"}</span>
                                </td>
                                <td className="p-3 sm:p-4 text-right hidden md:table-cell">
                                  <span className="font-medium text-slate-800">
                                    {formatFlexibleCurrency(getInventoryTotalCost(item), currency)}
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
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isRemovalMode ? "Remove Stock" : "Edit Inventory"}
            </DialogTitle>
            <DialogDescription>
              {isRemovalMode
                ? `Remove stock for ${editingItem?.product?.name ?? "the selected product"} with loss/refund tracking.`
                : `Update stock levels for ${editingItem?.product?.name ?? "the selected product"}.`}
            </DialogDescription>
          </DialogHeader>

          {/* Cost Layer Summary - shown in edit mode */}
          {!isRemovalMode && (
            <div className="bg-slate-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Layers className="w-4 h-4" />
                  Cost Layers (FIFO)
                </div>
                {costLayerData?.layers.some(l => l.source === 'legacy_inventory' || l.source === 'product_cost_fallback') && (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                    Derived from inventory
                  </Badge>
                )}
              </div>
              {costLayerData && costLayerData.totalQuantity > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="font-medium">Total Units:</span> {costLayerData.totalQuantity}
                      {editingItem && costLayerData.totalQuantity !== getInventoryQuantity(editingItem) && (
                        <span className="text-amber-600 ml-1">(stock: {getInventoryQuantity(editingItem)})</span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">Avg Cost:</span> {formatFlexibleCurrency(costLayerData.weightedAverageCost, currency)}
                    </div>
                  </div>
                  {costLayerData.layers.length > 0 && (
                    <div className="text-xs text-slate-500 space-y-1 max-h-24 overflow-auto">
                      {costLayerData.layers.slice(0, 5).map((layer, idx) => (
                        <div key={layer.id} className="flex justify-between items-center">
                          <span className="flex items-center gap-1">
                            Layer {idx + 1}: {layer.quantityRemaining} units
                            {layer.source && !['initial_inventory', 'csv_import', 'manual'].includes(layer.source) && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">{layer.source}</Badge>
                            )}
                          </span>
                          <span className="font-medium">{formatFlexibleCurrency(layer.unitCost, currency)}/unit</span>
                        </div>
                      ))}
                      {costLayerData.layers.length > 5 && (
                        <div className="text-slate-400">...and {costLayerData.layers.length - 5} more layers</div>
                      )}
                    </div>
                  )}
                </>
              ) : editingItem && getInventoryUnitCost(editingItem) > 0 ? (
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>
                    <span className="font-medium">Stock:</span> {getInventoryQuantity(editingItem)} units
                  </div>
                  <div>
                    <span className="font-medium">Avg Cost:</span> {formatFlexibleCurrency(getInventoryUnitCost(editingItem), currency)}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">No cost information available for this product.</p>
              )}
              {/* Current Selling Price */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-700">Selling Price:</span>
                  <span className="font-semibold text-slate-800">
                    {editingItem?.product?.salePrice || editingItem?.product?.price
                      ? formatFlexibleCurrency(Number(editingItem.product.salePrice || editingItem.product.price), currency)
                      : "Not set"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Edit Mode */}
          {!isRemovalMode ? (
            <form className="space-y-4" onSubmit={handleSubmitEdit}>
              <div className="space-y-3">
                <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-md">
                  <div>
                    <p className="text-xs text-slate-500">Current stock</p>
                    <p className="text-lg font-semibold">{originalQuantity} units</p>
                  </div>
                  {addedQuantity > 0 && (
                    <>
                      <span className="text-slate-400">→</span>
                      <div>
                        <p className="text-xs text-green-600">New total</p>
                        <p className="text-lg font-semibold text-green-600">{newQuantity} units</p>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <Label htmlFor="quantity-to-add">Quantity to add</Label>
                  <Input
                    id="quantity-to-add"
                    type="number"
                    min={0}
                    value={quantityToAdd}
                    onChange={(event) => setQuantityToAdd(event.target.value)}
                    placeholder="Enter units to add (0 to skip)"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    To reduce stock, use the &ldquo;Remove Stock&rdquo; button below for tracked removals.
                  </p>
                </div>
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
                  <Label htmlFor="cost-price" className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Cost price (per unit)
                  </Label>
                  <Input
                    id="cost-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editCostPrice}
                    onChange={(event) => setEditCostPrice(event.target.value)}
                    placeholder={isQuantityIncreasing ? "Cost for new units" : "Leave blank (no new units)"}
                    disabled={!isQuantityIncreasing && editCostPrice === ""}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    (only affects new imports)
                  </p>
                </div>
                <div>
                  <Label htmlFor="sale-price">Selling price</Label>
                  <Input
                    id="sale-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editSalePrice}
                    onChange={(event) => {
                      setEditSalePrice(event.target.value);
                      const price = Number(event.target.value);
                      if (price > 0) {
                        void checkMargin(price);
                      } else {
                        setShowMarginWarning(false);
                        setMarginAnalysis(null);
                      }
                    }}
                    placeholder="Leave blank to keep current price"
                  />
                </div>
              </div>

              {/* Instant Margin Warning - shows immediately when price is below cost */}
              {instantMarginWarning?.belowCost && !showMarginWarning && (
                <Alert variant="destructive" className="bg-red-50 border-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>Price Below Cost!</strong> The selling price ({formatFlexibleCurrency(Number(editSalePrice), currency)}) is below your average cost ({formatFlexibleCurrency(instantMarginWarning.avgCost, currency)}).
                    <br />
                    <span className="text-xs">You will lose money on every sale at this price.</span>
                    <div className="mt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditSalePrice(String((instantMarginWarning.avgCost * 1.1).toFixed(2)))}
                        className="text-xs border-red-300 text-red-700 hover:bg-red-100"
                      >
                        Set to cost + 10% ({formatFlexibleCurrency(instantMarginWarning.avgCost * 1.1, currency)})
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Detailed Margin Warning - shows after API analysis */}
              {showMarginWarning && marginAnalysis && (
                <Alert variant="destructive" className="bg-amber-50 border-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    <strong>Margin Warning:</strong> At {formatFlexibleCurrency(marginAnalysis.proposedSalePrice, currency)}, 
                    you would lose money on <strong>{marginAnalysis.quantityAtLoss} units</strong> ({marginAnalysis.layersAtLoss} cost layers).
                    <br />
                    <span className="text-xs">
                      Recommended minimum: <strong>{formatFlexibleCurrency(marginAnalysis.recommendedMinPrice, currency)}</strong> | 
                      Overall margin: {marginAnalysis.overallMarginPercent.toFixed(1)}%
                    </span>
                    <div className="mt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditSalePrice(String(marginAnalysis.recommendedMinPrice.toFixed(2)))}
                        className="text-xs"
                      >
                        Use recommended price
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsRemovalMode(true)} className="text-amber-600 hover:text-amber-700">
                  <MinusCircle className="w-4 h-4 mr-2" /> Remove stock
                </Button>
                <div className="flex w-full sm:w-auto gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={resetEditState}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateInventoryMutation.isPending}
                  >
                    {updateInventoryMutation.isPending ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          ) : isRemovalMode ? (
            /* Stock Removal Mode */
            <form className="space-y-4" onSubmit={handleRemoveStock}>
              <div>
                <Label htmlFor="removal-quantity">Quantity to remove</Label>
                <Input
                  id="removal-quantity"
                  type="number"
                  min={1}
                  max={editingItem?.quantity || 1}
                  value={removalQuantity}
                  onChange={(event) => setRemovalQuantity(event.target.value)}
                  placeholder={`Max: ${editingItem?.quantity ?? 0}`}
                  required
                />
                <p className="text-xs text-slate-500 mt-1">
                  Available: {editingItem?.quantity ?? 0} units
                </p>
              </div>

              <div>
                <Label htmlFor="removal-reason">Reason for removal</Label>
                <Select value={removalReason} onValueChange={(v) => setRemovalReason(v as StockRemovalReason)}>
                  <SelectTrigger id="removal-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STOCK_REMOVAL_REASONS.map((reason) => (
                      <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="refund-type">Refund / Reimbursement</Label>
                <Select value={refundType} onValueChange={(v) => setRefundType(v as RefundType)}>
                  <SelectTrigger id="refund-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFUND_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div>
                          <span>{type.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">({type.description})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {refundType === "partial" && (
                <div>
                  <Label htmlFor="refund-amount">Total refund amount</Label>
                  <Input
                    id="refund-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.target.value)}
                    placeholder="Enter refund amount from manufacturer"
                    required
                  />
                </div>
              )}

              <div>
                <Label htmlFor="removal-notes">Notes (optional)</Label>
                <Textarea
                  id="removal-notes"
                  placeholder="Additional details about this removal..."
                  value={removalNotes}
                  onChange={(event) => setRemovalNotes(event.target.value)}
                />
              </div>

              <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsRemovalMode(false)}>
                  Back to edit
                </Button>
                <div className="flex w-full sm:w-auto gap-2 flex-col sm:flex-row justify-end">
                  <Button type="button" variant="outline" onClick={resetEditState}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-200 text-red-700 hover:text-red-800"
                    onClick={initiateDropProduct}
                    disabled={dropProductMutation.isPending || removeStockMutation.isPending || updateInventoryMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Drop / Delete product
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={removeStockMutation.isPending || updateInventoryMutation.isPending}
                  >
                    {removeStockMutation.isPending ? "Removing..." : "Confirm removal"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmAction)} onOpenChange={(open) => {
        if (!open && !isConfirming) {
          setConfirmAction(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "drop" ? "Drop product and delete stock?" : "Confirm stock removal?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone and any recorded losses or refunds will be saved for reporting.
              {" "}
              {confirmAction === "drop"
                ? "All remaining stock will be removed (if any) and the product will be marked inactive."
                : "Proceed only if you have verified the quantities and notes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConfirming}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmInventoryAction()} disabled={isConfirming}>
              {isConfirming
                ? "Processing..."
                : confirmAction === "drop"
                  ? "Yes, drop product"
                  : "Yes, remove stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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