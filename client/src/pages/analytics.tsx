import { useQuery } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon,
  DollarSign,
  HelpCircle,
  Package,
  RotateCcw,
  Tag,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart as RechartsLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  AnalyticsScopeProvider,
  useAnalyticsScope,
  type DatePreset,
  type DateRange,
  type DisplayCurrency,
} from "@/components/analytics/analytics-scope-context";
import CustomerLoyaltyTab from "@/components/analytics/customer-loyalty-tab";
import ForecastingWidget from "@/components/analytics/forecasting-widget";
import InsightFeed from "@/components/analytics/insight-feed";
import OperationsTab from "@/components/analytics/operations-tab";
import ProductInventoryTab from "@/components/analytics/product-inventory-tab";
import SalesPerformanceTab from "@/components/analytics/sales-performance-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartSkeleton } from "@/components/ui/loading";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeSales } from "@/hooks/use-realtime-sales";
import { formatCurrency } from "@/lib/pos-utils";
import { cn } from "@/lib/utils";
import type { CurrencyCode, Money } from "@shared/lib/currency";
import type { LowStockAlert, Product } from "@shared/schema";

const SalesChart = lazy(() => import("@/components/analytics/sales-chart"));

interface DailySalesSummary {
  transactions: number;
  revenue: Money;
  refunds: Money;
  refundCount: number;
  netRevenue: Money;
}

interface OverviewResponse {
  total: Money;
  normalized?: {
    amount: number;
    currency: CurrencyCode;
  };
  transactions: number;
  refunds?: {
    total?: Money;
    normalized?: {
      amount: number;
      currency: CurrencyCode;
    };
    count?: number;
  };
  net?: {
    total?: Money;
    normalized?: {
      amount: number;
      currency: CurrencyCode;
    };
  };
}

interface PopularProductItem {
  product: Product;
  salesCount: number;
  price: Money;
  total: Money;
  normalized?: {
    price: Money;
    total: Money;
  };
}

interface ProfitLossSummaryTotals {
  revenue: Money;
  cogs?: Money;
  inventoryAdjustments?: Money;
  netCost?: Money;
  profit: Money;
  refunds?: Money;
  netRevenue?: Money;
  refundCount?: number;
  priceChangeCount?: number;
  priceChangeDelta?: Money;
  stockRemovalLoss?: Money;
  stockRemovalCount?: number;
  manufacturerRefunds?: Money;
  manufacturerRefundCount?: number;
}

interface ProfitLossSummary {
  currency: CurrencyCode;
  totals: ProfitLossSummaryTotals;
  normalized?: Omit<ProfitLossSummaryTotals, "refundCount" | "priceChangeCount" | "stockRemovalCount" | "manufacturerRefundCount">;
}

interface InventoryValueResponse {
  currency: CurrencyCode;
  total: Money;
  retail?: Money;
  normalized?: {
    total: Money;
    retail?: Money;
  };
  itemCount: number;
  valuationBasis?: 'cost' | 'retail';
}

interface InventoryItemsResponse {
  storeId: string;
  currency: CurrencyCode;
  totalValue: number;
  totalProducts: number;
  items: ProductInventoryItem[];
}

type ProductInventoryItem = React.ComponentProps<typeof ProductInventoryTab>["inventoryItems"][number];

interface CustomerInsightsResponse {
  totalCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
}

interface PriceHistoryTimelinePoint {
  occurredAt: string;
  kind: "price_change" | "inventory_revaluation";
  oldSalePrice: number | null;
  newSalePrice: number | null;
  oldCost: number | null;
  newCost: number | null;
  avgCostAfter?: number | null;
  revaluationDelta?: number | null;
  source?: string | null;
  userId?: string | null;
}

interface PriceHistoryItem {
  productId: string;
  product: {
    name: string;
    sku: string | null;
    barcode: string | null;
    salePrice: string | null;
    costPrice: string | null;
  } | null;
  timeline: PriceHistoryTimelinePoint[];
}

interface PriceHistoryResponse {
  currency: CurrencyCode;
  items: PriceHistoryItem[];
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  limit: number;
}

const makeMoney = (amount: number, currency: CurrencyCode = "USD"): Money => ({ amount, currency });

type DeltaInfo = {
  label: string;
  positive?: boolean;
  negative?: boolean;
};

type KpiCardConfig = {
  key: string;
  title: string;
  icon: LucideIcon;
  value: string;
  caption?: string;
  currencyBadge?: string;
  delta?: DeltaInfo;
};

function formatDateRangeLabel(start?: Date | null, end?: Date | null) {
  if (!start || !end) {
    return "Select date range";
  }
  const sameYear = start.getFullYear() === end.getFullYear();
  const baseFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  const endFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const startLabel = baseFormatter.format(start);
  const endLabel = sameYear ? baseFormatter.format(end) : endFormatter.format(end);
  return `${startLabel} – ${endLabel}`;
}

function ScopeControls() {
  const {
    stores,
    isLoadingStores,
    selectedStoreId,
    setSelectedStoreId,
    storeSelectionLocked,
    datePreset,
    setDatePreset,
    dateRange,
    setCustomDateRange,
    displayCurrency,
    setDisplayCurrency,
    availableCurrencies,
  } = useAnalyticsScope();
  const { user } = useAuth();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const role = user?.role ?? "admin";
  const hasMultipleStores = stores.length > 1;
  const activeStore = stores.find((store) => store.id === selectedStoreId) ?? null;
  const canSelectStore = (role === "admin" || hasMultipleStores) && !storeSelectionLocked;

  const presetOptions: { value: DatePreset; label: string }[] = [
    { value: "7", label: "Last 7 Days" },
    { value: "30", label: "Last 30 Days" },
    { value: "90", label: "Last 90 Days" },
    { value: "365", label: "Last Year" },
    { value: "custom", label: "Custom" },
  ];

  const currencyOptions = availableCurrencies.map((currency) => ({
    value: currency,
    label: currency === "native" ? "Store currency" : currency,
  }));

  const handlePresetChange = (value: DatePreset) => {
    setDatePreset(value);
    if (value !== "custom") {
      setIsCalendarOpen(false);
    } else {
      setIsCalendarOpen(true);
    }
  };

  const handleRangeSelect = (range: DateRange) => {
    setCustomDateRange(range);
    if (range.start && range.end) {
      setIsCalendarOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Store</span>
          {canSelectStore ? (
            <Select
              value={selectedStoreId ?? undefined}
              onValueChange={setSelectedStoreId}
              disabled={isLoadingStores || stores.length === 0}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder={isLoadingStores ? "Loading stores..." : "Select store"} />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-sm text-muted-foreground">
              {activeStore ? activeStore.name : "No store assigned"}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Date Range</span>
          <div className="flex items-center gap-2">
            <Select value={datePreset} onValueChange={(value) => handlePresetChange(value as DatePreset)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presetOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  <span className="text-sm font-normal">{formatDateRangeLabel(dateRange.start, dateRange.end)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  defaultMonth={dateRange.start ?? undefined}
                  selected={{ from: dateRange.start ?? undefined, to: dateRange.end ?? undefined }}
                  onSelect={(range) => handleRangeSelect({ start: range?.from ?? null, end: range?.to ?? null })}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Display Currency</span>
        <Select value={displayCurrency} onValueChange={(value) => setDisplayCurrency(value as DisplayCurrency)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencyOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function AnalyticsKpiBar({ cards }: { cards: KpiCardConfig[] }) {
  return (
    <div className="grid auto-rows-fr grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        const deltaClass = card.delta
          ? card.delta.positive
            ? "text-emerald-600"
            : card.delta.negative
              ? "text-red-600"
              : "text-muted-foreground"
          : "text-muted-foreground";

        return (
          <Card
            key={card.key}
            className="flex h-full flex-col border border-slate-200 bg-white/90 shadow-sm"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
              <div className="rounded-full bg-slate-100 p-2">
                <Icon className="h-4 w-4 text-slate-500" />
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <div className="space-y-2">
                <p className="text-3xl font-semibold leading-none tracking-tight">{card.value}</p>
                {card.currencyBadge ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[0.7rem] font-medium text-slate-600">
                    {card.currencyBadge}
                  </span>
                ) : null}
                {card.caption ? (
                  <p className="text-xs text-muted-foreground/90">{card.caption}</p>
                ) : null}
              </div>
              {card.delta ? (
                <div className={cn("mt-auto flex items-center justify-end gap-1 text-xs font-medium", deltaClass)}>
                  {card.delta.positive ? <TrendingUp className="h-3 w-3" /> : null}
                  {card.delta.negative ? <TrendingDown className="h-3 w-3" /> : null}
                  <span>{card.delta.label}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ensureRange(range: DateRange): { start: Date; end: Date } {
  if (range.start && range.end) {
    return { start: range.start, end: range.end };
  }
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return { start, end };
}

function computePreviousRange(range: { start: Date; end: Date }) {
  const duration = range.end.getTime() - range.start.getTime();
  if (duration <= 0) return null;
  const prevEnd = new Date(range.start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);
  return { start: prevStart, end: prevEnd };
}

function computeDelta(current: number, previous?: number | null): DeltaInfo | undefined {
  if (previous === undefined || previous === null) {
    return undefined;
  }
  if (previous === 0) {
    if (current === 0) {
      return { label: "0% vs prior" };
    }
    return {
      label: `${current > 0 ? "+" : ""}100% vs prior`,
      positive: current > 0,
      negative: current < 0,
    };
  }
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(change)) {
    return undefined;
  }
  return {
    label: `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs prior`,
    positive: change > 0,
    negative: change < 0,
  };
}

function parseNumericInput(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numericValue = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatDateTimeLabel(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function AnalyticsContent() {
  const { user } = useAuth();
  const {
    stores,
    selectedStoreId,
    dateRange,
    displayCurrency,
    resolvedCurrency,
  } = useAnalyticsScope();

  const storeId = selectedStoreId ?? "";
  const hasStore = Boolean(storeId);
  const effectiveRange = useMemo(() => ensureRange(dateRange), [dateRange]);
  const previousRange = useMemo(() => computePreviousRange(effectiveRange), [effectiveRange]);

  useRealtimeSales({ orgId: user?.orgId ?? null, storeId: hasStore ? storeId : null });

  const normalizeFlag = displayCurrency === "native" ? "false" : "true";
  const normalizeCurrency = displayCurrency !== "native";
  const rangeKey = `${effectiveRange.start.toISOString()}_${effectiveRange.end.toISOString()}`;

  const overviewQuery = useQuery<DailySalesSummary>({
    queryKey: [
      "/api/analytics/overview",
      storeId,
      rangeKey,
      displayCurrency,
      resolvedCurrency,
    ],
    enabled: hasStore,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("store_id", storeId);
      params.set("date_from", effectiveRange.start.toISOString());
      params.set("date_to", effectiveRange.end.toISOString());
      params.set("normalize_currency", normalizeFlag);
      if (displayCurrency !== "native") {
        params.set("target_currency", resolvedCurrency);
      }
      const res = await fetch(`/api/analytics/overview?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load overview");
      }
      const data: OverviewResponse = await res.json();
      const revenueMoney = data.normalized
        ? { amount: data.normalized.amount, currency: data.normalized.currency }
        : data.total;
      const refundMoney = data.refunds?.normalized
        ? { amount: data.refunds.normalized.amount, currency: data.refunds.normalized.currency }
        : data.refunds?.total ?? makeMoney(0, revenueMoney.currency);
      const netMoney = data.net?.normalized
        ? { amount: data.net.normalized.amount, currency: data.net.normalized.currency }
        : data.net?.total ?? makeMoney(revenueMoney.amount - refundMoney.amount, revenueMoney.currency);
      return {
        transactions: typeof data.transactions === "number" ? data.transactions : 0,
        revenue: revenueMoney,
        refunds: refundMoney,
        refundCount: data.refunds?.count ?? 0,
        netRevenue: netMoney,
      } satisfies DailySalesSummary;
    },
  });

  const previousOverviewQuery = useQuery<DailySalesSummary | null>({
    queryKey: [
      "/api/analytics/overview",
      storeId,
      "previous",
      rangeKey,
      displayCurrency,
      resolvedCurrency,
    ],
    enabled: hasStore && Boolean(previousRange),
    queryFn: async () => {
      if (!previousRange) return null;
      const params = new URLSearchParams();
      params.set("store_id", storeId);
      params.set("date_from", previousRange.start.toISOString());
      params.set("date_to", previousRange.end.toISOString());
      params.set("normalize_currency", normalizeFlag);
      if (displayCurrency !== "native") {
        params.set("target_currency", resolvedCurrency);
      }
      const res = await fetch(`/api/analytics/overview?${params.toString()}` , {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load previous overview");
      }
      const data: OverviewResponse = await res.json();
      const revenueMoney = data.normalized
        ? { amount: data.normalized.amount, currency: data.normalized.currency }
        : data.total;
      const refundMoney = data.refunds?.normalized
        ? { amount: data.refunds.normalized.amount, currency: data.refunds.normalized.currency }
        : data.refunds?.total ?? makeMoney(0, revenueMoney.currency);
      const netMoney = data.net?.normalized
        ? { amount: data.net.normalized.amount, currency: data.net.normalized.currency }
        : data.net?.total ?? makeMoney(revenueMoney.amount - refundMoney.amount, revenueMoney.currency);

      return {
        transactions: typeof data.transactions === "number" ? data.transactions : 0,
        revenue: revenueMoney,
        refunds: refundMoney,
        refundCount: data.refunds?.count ?? 0,
        netRevenue: netMoney,
      } satisfies DailySalesSummary;
    },
  });

  const popularProductsQuery = useQuery<{
    currency: CurrencyCode;
    items: PopularProductItem[];
  }>({
    queryKey: [
      "/api/stores",
      storeId,
      "analytics/popular-products",
      rangeKey,
      displayCurrency,
      resolvedCurrency,
    ],
    enabled: hasStore,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("normalize_currency", normalizeFlag);
      params.set("date_from", effectiveRange.start.toISOString());
      params.set("date_to", effectiveRange.end.toISOString());
      if (displayCurrency !== "native") {
        params.set("target_currency", resolvedCurrency);
      }
      const res = await fetch(`/api/stores/${storeId}/analytics/popular-products?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load popular products");
      }
      return res.json();
    },
  });

  const profitLossQuery = useQuery<ProfitLossSummary>({
    queryKey: [
      "/api/stores",
      storeId,
      "analytics/profit-loss",
      rangeKey,
      displayCurrency,
      resolvedCurrency,
    ],
    enabled: hasStore,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("startDate", effectiveRange.start.toISOString());
      params.set("endDate", effectiveRange.end.toISOString());
      params.set("normalize_currency", normalizeFlag);
      if (displayCurrency !== "native") {
        params.set("target_currency", resolvedCurrency);
      }
      const res = await fetch(`/api/stores/${storeId}/analytics/profit-loss?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load profit & loss summary");
      }
      return res.json();
    },
  });

  const inventoryValueQuery = useQuery<InventoryValueResponse>({
    queryKey: [
      "/api/stores",
      storeId,
      "analytics/inventory-value",
      displayCurrency,
      resolvedCurrency,
    ],
    enabled: hasStore,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("normalize_currency", normalizeFlag);
      if (displayCurrency !== "native") {
        params.set("target_currency", resolvedCurrency);
      }
      const res = await fetch(`/api/stores/${storeId}/analytics/inventory-value?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load inventory value");
      }
      return res.json();
    },
  });

  const inventoryItemsQuery = useQuery<InventoryItemsResponse>({
    queryKey: ["/api/stores", storeId, "inventory", rangeKey],
    enabled: hasStore,
    queryFn: async () => {
      const res = await fetch(`/api/stores/${storeId}/inventory`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load inventory items");
      }
      return res.json();
    },
  });

  const priceHistoryQuery = useQuery<PriceHistoryResponse>({
    queryKey: [
      "/api/stores",
      storeId,
      "analytics/price-history",
      rangeKey,
    ],
    enabled: hasStore,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("startDate", effectiveRange.start.toISOString());
      params.set("endDate", effectiveRange.end.toISOString());
      params.set("limit", "250");
      const res = await fetch(`/api/stores/${storeId}/analytics/price-history?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load price history");
      }
      return res.json();
    },
  });

  const customerInsightsQuery = useQuery<CustomerInsightsResponse>({
    queryKey: [
      "/api/stores",
      storeId,
      "analytics/customer-insights",
      rangeKey,
    ],
    enabled: hasStore,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("date_from", effectiveRange.start.toISOString());
      params.set("date_to", effectiveRange.end.toISOString());
      const res = await fetch(`/api/stores/${storeId}/analytics/customer-insights?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load customer insights");
      }
      return res.json();
    },
  });

  const previousCustomerInsightsQuery = useQuery<CustomerInsightsResponse | null>({
    queryKey: [
      "/api/stores",
      storeId,
      "analytics/customer-insights",
      "previous",
      rangeKey,
    ],
    enabled: hasStore && Boolean(previousRange),
    queryFn: async () => {
      if (!previousRange) return null;
      const params = new URLSearchParams();
      params.set("date_from", previousRange.start.toISOString());
      params.set("date_to", previousRange.end.toISOString());
      const res = await fetch(`/api/stores/${storeId}/analytics/customer-insights?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load previous customer insights");
      }
      return res.json();
    },
  });

  const alertsQuery = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", storeId, "alerts"],
    enabled: hasStore,
    queryFn: async () => {
      const res = await fetch(`/api/stores/${storeId}/alerts`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load alerts");
      }
      return res.json();
    },
  });

  const currentOverview = overviewQuery.data ?? {
    transactions: 0,
    revenue: makeMoney(0, resolvedCurrency),
    refunds: makeMoney(0, resolvedCurrency),
    refundCount: 0,
    netRevenue: makeMoney(0, resolvedCurrency),
  } satisfies DailySalesSummary;
  const previousOverview = previousOverviewQuery.data ?? null;

  const profitLossData = profitLossQuery.data ?? {
    currency: resolvedCurrency,
    totals: {
      revenue: makeMoney(0, resolvedCurrency),
      cogs: makeMoney(0, resolvedCurrency),
      inventoryAdjustments: makeMoney(0, resolvedCurrency),
      netCost: makeMoney(0, resolvedCurrency),
      profit: makeMoney(0, resolvedCurrency),
      refunds: makeMoney(0, resolvedCurrency),
      netRevenue: makeMoney(0, resolvedCurrency),
      refundCount: 0,
      priceChangeCount: 0,
      priceChangeDelta: makeMoney(0, resolvedCurrency),
      stockRemovalLoss: makeMoney(0, resolvedCurrency),
      stockRemovalCount: 0,
      manufacturerRefunds: makeMoney(0, resolvedCurrency),
      manufacturerRefundCount: 0,
    },
  } satisfies ProfitLossSummary;
  const displayRevenue = profitLossData.normalized?.revenue ?? profitLossData.totals.revenue;
  const displayCogs = profitLossData.normalized?.cogs ?? profitLossData.totals.cogs ?? makeMoney(0, resolvedCurrency);
  const displayInventoryAdj = profitLossData.normalized?.inventoryAdjustments ?? profitLossData.totals.inventoryAdjustments ?? makeMoney(0, resolvedCurrency);
  const displayNetCost = profitLossData.normalized?.netCost ?? profitLossData.totals.netCost ?? makeMoney(0, resolvedCurrency);
  const displayProfit = profitLossData.normalized?.profit ?? profitLossData.totals.profit;
  const displayRefunds = profitLossData.normalized?.refunds ?? profitLossData.totals.refunds ?? makeMoney(0, resolvedCurrency);
  const displayNetRevenue = profitLossData.normalized?.netRevenue ?? profitLossData.totals.netRevenue ?? makeMoney(displayRevenue.amount - displayRefunds.amount, displayRevenue.currency);
  const totalRefundCount = profitLossData.totals.refundCount ?? 0;
  const priceChangeCount = profitLossData.totals.priceChangeCount ?? 0;
  const priceChangeDeltaMoney = profitLossData.normalized?.priceChangeDelta ?? profitLossData.totals.priceChangeDelta ?? makeMoney(0, resolvedCurrency);
  const displayStockRemovalLoss = profitLossData.normalized?.stockRemovalLoss ?? profitLossData.totals.stockRemovalLoss ?? makeMoney(0, resolvedCurrency);
  const stockRemovalCount = profitLossData.totals.stockRemovalCount ?? 0;
  const displayManufacturerRefunds = profitLossData.normalized?.manufacturerRefunds ?? profitLossData.totals.manufacturerRefunds ?? makeMoney(0, resolvedCurrency);
  const manufacturerRefundCount = profitLossData.totals.manufacturerRefundCount ?? 0;
  const profitMargin = displayRevenue.amount > 0 ? (displayProfit.amount / displayRevenue.amount) * 100 : 0;
  const displayCost = displayNetCost;

  const inventoryData: InventoryValueResponse =
    inventoryValueQuery.data ?? {
      currency: resolvedCurrency,
      total: makeMoney(0, resolvedCurrency),
      itemCount: 0,
    } satisfies InventoryValueResponse;
  const inventoryMoney = inventoryData.normalized?.total ?? inventoryData.total;

  const inventoryItemsData = inventoryItemsQuery.data ?? {
    storeId,
    currency: resolvedCurrency,
    totalValue: 0,
    totalProducts: 0,
    items: [],
  } satisfies InventoryItemsResponse;

  const customerInsights = customerInsightsQuery.data ?? {
    totalCustomers: 0,
    newCustomers: 0,
    repeatCustomers: 0,
  } satisfies CustomerInsightsResponse;
  const previousCustomerInsights = previousCustomerInsightsQuery.data ?? null;

  const popularProducts = popularProductsQuery.data?.items ?? [];
  const alerts = alertsQuery.data ?? [];
  const priceHistoryCurrency = priceHistoryQuery.data?.currency ?? resolvedCurrency;
  const priceHistoryItems = useMemo(() => priceHistoryQuery.data?.items ?? [], [priceHistoryQuery.data]);
  const [selectedPriceProductId, setSelectedPriceProductId] = useState<string | null>(null);

  useEffect(() => {
    if (!priceHistoryItems.length) {
      if (selectedPriceProductId) {
        setSelectedPriceProductId(null);
      }
      return;
    }
    if (!selectedPriceProductId || !priceHistoryItems.some(item => item.productId === selectedPriceProductId)) {
      setSelectedPriceProductId(priceHistoryItems[0].productId);
    }
  }, [priceHistoryItems, selectedPriceProductId]);

  const selectedPriceHistory = useMemo(() => {
    if (!priceHistoryItems.length) return null;
    if (selectedPriceProductId) {
      return priceHistoryItems.find(item => item.productId === selectedPriceProductId) ?? priceHistoryItems[0];
    }
    return priceHistoryItems[0];
  }, [priceHistoryItems, selectedPriceProductId]);

  const priceTrendPoints = useMemo(() => {
    if (!selectedPriceHistory) return [];
    let runningSale = parseNumericInput(selectedPriceHistory.product?.salePrice ?? null);
    let runningCost = parseNumericInput(selectedPriceHistory.product?.costPrice ?? null);
    return selectedPriceHistory.timeline.map((entry) => {
      if (entry.kind === "price_change") {
        if (entry.newSalePrice !== null) runningSale = entry.newSalePrice;
        if (entry.newCost !== null) runningCost = entry.newCost;
      } else if (entry.kind === "inventory_revaluation") {
        if (entry.avgCostAfter !== null) runningCost = entry.avgCostAfter;
      }
      return {
        date: entry.occurredAt,
        salePrice: runningSale,
        avgCost: runningCost,
        kind: entry.kind,
      };
    });
  }, [selectedPriceHistory]);

  const priceHistoryEvents = useMemo(() => {
    if (!selectedPriceHistory) return [];
    return [...selectedPriceHistory.timeline].reverse().slice(0, 5);
  }, [selectedPriceHistory]);

  const latestPricePoint = priceTrendPoints.length > 0 ? priceTrendPoints[priceTrendPoints.length - 1] : null;

  const averageTransactionValue = currentOverview.transactions > 0
    ? makeMoney(currentOverview.revenue.amount / currentOverview.transactions, currentOverview.revenue.currency)
    : makeMoney(0, currentOverview.revenue.currency);
  const previousAverageTransactionValue = previousOverview
    ? previousOverview.transactions > 0
      ? makeMoney(previousOverview.revenue.amount / previousOverview.transactions, previousOverview.revenue.currency)
      : makeMoney(0, previousOverview.revenue.currency)
    : null;

  const renderSalesChart = () => (
    <Suspense fallback={<ChartSkeleton />}>
      <SalesChart className="w-full" />
    </Suspense>
  );

  const isAdmin = Boolean(user?.isAdmin);
  const isManager = user?.role === "manager";
  const canViewAi = isAdmin || isManager;
  const canViewOperations = isAdmin || isManager;
  const activeStore = stores.find((store) => store.id === storeId);

  // Fetch real staff performance data from the new endpoint
  const staffPerformanceQuery = useQuery<{
    currency: CurrencyCode;
    staff: Array<{
      userId: string;
      name: string;
      role: string;
      totalSales: number;
      totalRevenue: Money;
      avgTicket: Money;
      transactions: number;
      onShift: boolean;
    }>;
  }>({
    queryKey: [
      "/api/stores",
      storeId,
      "analytics/staff-performance",
      rangeKey,
    ],
    enabled: hasStore && canViewOperations,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("startDate", effectiveRange.start.toISOString());
      params.set("endDate", effectiveRange.end.toISOString());
      const res = await fetch(`/api/stores/${storeId}/analytics/staff-performance?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load staff performance");
      }
      return res.json();
    },
  });

  const staffPerformanceData = useMemo(() => {
    if (!canViewOperations || !hasStore) return [];
    // Use real staff data from the query
    if (staffPerformanceQuery.data?.staff && staffPerformanceQuery.data.staff.length > 0) {
      return staffPerformanceQuery.data.staff;
    }
    // Fallback to synthetic data if no real staff data available
    return [
      {
        userId: "cashier-aggregate",
        name: "Cashier Team",
        role: "cashier",
        totalSales: currentOverview.transactions,
        totalRevenue: {
          amount: displayRevenue.amount,
          currency: displayRevenue.currency,
        },
        avgTicket: averageTransactionValue,
        transactions: currentOverview.transactions,
        onShift: currentOverview.transactions > 0,
      },
    ];
  }, [
    canViewOperations,
    hasStore,
    staffPerformanceQuery.data,
    currentOverview.transactions,
    displayRevenue.amount,
    displayRevenue.currency,
    averageTransactionValue,
  ]);

  const storeContributionData = useMemo(() => {
    if (!canViewOperations || !hasStore) return [];
    return [
      {
        storeId: storeId,
        storeName: activeStore?.name ?? "Current store",
        revenue: displayRevenue,
        transactions: currentOverview.transactions,
        staffCount: staffPerformanceData.length || 1,
      },
    ];
  }, [
    canViewOperations,
    hasStore,
    storeId,
    activeStore?.name,
    displayRevenue,
    currentOverview.transactions,
    staffPerformanceData.length,
  ]);

  const alertsSummary = useMemo(() => {
    if (!canViewOperations) return null;
    return {
      total: alerts.length,
      lowStock: alerts.length,
      staffing: 0,
      incidents: 0,
    };
  }, [canViewOperations, alerts.length]);

  const kpiCards: KpiCardConfig[] = [
    {
      key: "revenue",
      title: "Revenue",
      icon: DollarSign,
      value: formatCurrency(currentOverview.revenue),
      currencyBadge: displayCurrency === "native" ? "Native" : resolvedCurrency,
      delta: computeDelta(currentOverview.revenue.amount, previousOverview?.revenue.amount),
      caption: `Net ${formatCurrency(displayNetRevenue)} • ${currentOverview.transactions.toLocaleString()} transactions`,
    },
    {
      key: "refunds",
      title: "Refunds",
      icon: RotateCcw,
      value: formatCurrency(displayRefunds),
      currencyBadge: displayCurrency === "native" ? "Native" : resolvedCurrency,
      caption: `${totalRefundCount.toLocaleString()} refund${totalRefundCount === 1 ? "" : "s"}`,
    },
    {
      key: "profit",
      title: "Net Profit",
      icon: TrendingUp,
      value: formatCurrency(displayProfit),
      currencyBadge: displayCurrency === "native" ? "Native" : resolvedCurrency,
      caption: `Margin ${profitMargin.toFixed(1)}%`,
    },
    {
      key: "inventory",
      title: "Inventory Value",
      icon: Package,
      value: formatCurrency(inventoryMoney),
      currencyBadge: inventoryMoney.currency,
      caption: `${inventoryData.itemCount.toLocaleString()} items (at cost)`,
    },
    {
      key: "customers",
      title: "Active Customers",
      icon: Users,
      value: customerInsights.totalCustomers.toLocaleString(),
      caption: `${customerInsights.newCustomers.toLocaleString()} new this period`,
    },
  ];

  // Additional loss/refund cards shown only if there are values
  const hasStockLosses = displayStockRemovalLoss.amount > 0 || stockRemovalCount > 0;
  const hasManufacturerRefunds = displayManufacturerRefunds.amount > 0 || manufacturerRefundCount > 0;

  if (hasStockLosses) {
    kpiCards.push({
      key: "stock-losses",
      title: "Inventory Losses",
      icon: TrendingDown,
      value: formatCurrency(displayStockRemovalLoss),
      currencyBadge: displayCurrency === "native" ? "Native" : resolvedCurrency,
      caption: `${stockRemovalCount} removal${stockRemovalCount === 1 ? "" : "s"} (expired, damaged, etc.)`,
      delta: { label: "Write-off", negative: true },
    });
  }

  if (hasManufacturerRefunds) {
    kpiCards.push({
      key: "manufacturer-refunds",
      title: "Manufacturer Refunds",
      icon: RotateCcw,
      value: formatCurrency(displayManufacturerRefunds),
      currencyBadge: displayCurrency === "native" ? "Native" : resolvedCurrency,
      caption: `${manufacturerRefundCount} reimbursement${manufacturerRefundCount === 1 ? "" : "s"} received`,
      delta: { label: "Recovered", positive: true },
    });
  }

  if (!hasStore) {
    return (
      <div className="space-y-6">
        <ScopeControls />
        <Card className="border border-dashed border-slate-200">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select a store to load analytics.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ScopeControls />
      <AnalyticsKpiBar cards={kpiCards} />
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sales-performance">Sales Performance</TabsTrigger>
          <TabsTrigger value="inventory">Inventory & Alerts</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <InsightFeed
            storeId={storeId}
            alerts={alerts}
            canViewAi={canViewAi}
          />

          <ForecastingWidget
            storeId={storeId}
            canViewAi={canViewAi}
          />

          {renderSalesChart()}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Popular Products</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {popularProducts.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                      <p>No sales data available for this period.</p>
                    </div>
                  ) : (
                    popularProducts.map((item, index) => (
                      <div key={item.product.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="flex h-8 w-8 items-center justify-center rounded-full">
                            {index + 1}
                          </Badge>
                          <div>
                            <p className="font-medium">{item.product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(item.normalized?.price ?? item.price)} each
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{item.salesCount} sold</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(item.normalized?.total ?? item.total)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Profit &amp; Loss Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Revenue</span>
                  <span className="font-semibold text-emerald-600">{formatCurrency(displayRevenue)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    COGS
                    <span title="Cost of Goods Sold - The direct cost of products sold during this period, calculated from inventory cost layers.">
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                    </span>
                  </span>
                  <span className="font-semibold text-red-500">{formatCurrency(displayCogs)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Inventory Adjustments</span>
                  <span className="font-semibold text-amber-600">{formatCurrency(displayInventoryAdj)}</span>
                </div>
                {displayStockRemovalLoss.amount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      Stock Losses
                      <span title="Value of stock removed due to damage, expiry, theft, etc.">
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                      </span>
                    </span>
                    <span className="font-semibold text-red-500">-{formatCurrency(displayStockRemovalLoss)}</span>
                  </div>
                )}
                {displayManufacturerRefunds.amount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      Manufacturer Refunds
                      <span title="Reimbursements received from manufacturers for returned/damaged stock">
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                      </span>
                    </span>
                    <span className="font-semibold text-emerald-600">+{formatCurrency(displayManufacturerRefunds)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Net Cost</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(displayNetCost)}</span>
                </div>
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Net Profit</span>
                    <span className={cn("text-lg font-semibold", displayProfit.amount >= 0 ? "text-emerald-600" : "text-red-600")}>{formatCurrency(displayProfit)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                    <span>Profit Margin</span>
                    <span>{profitMargin.toFixed(1)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Customer Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="text-center">
                  <p className="text-3xl font-semibold text-emerald-600">{customerInsights.newCustomers.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">New This Period</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-semibold text-purple-600">{customerInsights.repeatCustomers.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Repeat Customers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle>Price Change Summary</CardTitle>
                    <p className="text-sm text-muted-foreground">Across the selected period</p>
                  </div>
                  <Tag className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Changes</dt>
                      <dd className="text-2xl font-semibold">{priceChangeCount.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground flex items-center gap-1">
                        Net Cost Delta
                        <span title="Net Cost Delta = Sum of (New Cost - Old Cost) for all price changes. Positive means costs increased, negative means costs decreased.">
                          <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                        </span>
                      </dt>
                      <dd className={`text-2xl font-semibold ${priceChangeDeltaMoney.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {formatCurrency(priceChangeDeltaMoney)}
                      </dd>
                    </div>
                  </dl>
                  <dl className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground flex items-center gap-1">
                        COGS
                        <span title="Cost of Goods Sold">
                          <HelpCircle className="h-2.5 w-2.5 text-muted-foreground/60 cursor-help" />
                        </span>
                      </dt>
                      <dd className="font-semibold">{formatCurrency(displayCogs)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Inventory Adj.</dt>
                      <dd className="font-semibold">{formatCurrency(displayInventoryAdj)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Net Cost</dt>
                      <dd className="font-semibold">{formatCurrency(displayNetCost)}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    Latest snapshot: {latestPricePoint ? `${latestPricePoint.salePrice ?? "--"} sale / ${latestPricePoint.avgCost ?? "--"} cost price` : "No captured data"}
                  </p>
                </CardContent>
              </Card>

              <Card className="col-span-2">
                <CardHeader className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <CardTitle>Price vs Cost Trend</CardTitle>
                    {priceHistoryItems.length > 1 ? (
                      <Select value={selectedPriceProductId ?? undefined} onValueChange={setSelectedPriceProductId}>
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {priceHistoryItems.map((item) => (
                            <SelectItem key={item.productId} value={item.productId}>
                              {item.product?.name ?? "Unnamed SKU"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                  {selectedPriceHistory ? (
                    <p className="text-sm text-muted-foreground">
                      Tracking {selectedPriceHistory.product?.name ?? "current SKU"} in {priceHistoryCurrency}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="h-[320px]">
                  {priceHistoryQuery.isLoading ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading price history…</div>
                  ) : priceTrendPoints.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsLineChart data={priceTrendPoints} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} 
                          tick={{ fontSize: 11 }}
                          tickMargin={8}
                        />
                        <YAxis 
                          tickFormatter={(value) => `${Number(value).toFixed(0)}`}
                          tick={{ fontSize: 11 }}
                          tickCount={5}
                          width={50}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip
                          formatter={(value: any, name: string) => [
                            `${priceHistoryCurrency} ${Number(value ?? 0).toFixed(2)}`,
                            name,
                          ]}
                          labelFormatter={(value) => formatDateTimeLabel(value)}
                          contentStyle={{ borderRadius: '8px', padding: '8px 12px' }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="salePrice" name="Sale Price" stroke="#3B82F6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="avgCost" name="Cost Price" stroke="#10B981" strokeWidth={2} dot={false} />
                      </RechartsLineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      {selectedPriceHistory ? "Not enough price events to chart" : "No price history captured for this range."}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Price Events</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {priceHistoryEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recent price changes recorded.</p>
                  ) : (
                    <ul className="space-y-3">
                      {priceHistoryEvents.map((event, index) => (
                        <li key={`${event.occurredAt}-${index}`} className="rounded-md border border-slate-100 p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">{selectedPriceHistory?.product?.name ?? "Unknown Product"}</span>
                              <span className="ml-2 text-xs text-muted-foreground capitalize">({event.kind.replace("_", " ")})</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{formatDateTimeLabel(event.occurredAt)}</span>
                          </div>
                          {event.kind === "price_change" ? (
                            <p className="text-muted-foreground text-xs mt-1">
                              Sale: {event.oldSalePrice ?? "--"} → {event.newSalePrice ?? "--"} • Cost: {event.oldCost ?? "--"} → {event.newCost ?? "--"}
                            </p>
                          ) : (
                            <p className="text-muted-foreground text-xs mt-1">
                              Inventory revaluation Δ {priceHistoryCurrency} {event.revaluationDelta?.toFixed(2) ?? "0.00"}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            {priceHistoryItems.length === 0 && !priceHistoryQuery.isLoading ? (
              <div className="rounded-md border border-dashed border-slate-200 p-6 text-sm text-muted-foreground">
                No price change data within this time range. Update product costs/sale prices to start tracking trends.
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="sales-performance" className="space-y-6">
          <SalesPerformanceTab
            chart={renderSalesChart()}
            currentOverview={currentOverview}
            previousOverview={previousOverview}
            averageTransactionValue={averageTransactionValue}
            previousAverageTransactionValue={previousAverageTransactionValue}
            displayRevenue={displayRevenue}
            displayCost={displayCost}
            displayProfit={displayProfit}
            profitMargin={profitMargin}
            popularProducts={popularProducts}
            effectiveRange={effectiveRange}
            normalizeCurrency={normalizeCurrency}
          />
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <ProductInventoryTab
            inventoryMoney={inventoryMoney}
            inventoryNativeMoney={inventoryData.total}
            inventoryItems={inventoryItemsData.items}
            storeCurrency={inventoryItemsData.currency}
            alerts={alerts}
            displayCurrency={displayCurrency}
            resolvedCurrency={resolvedCurrency}
            isLoading={inventoryItemsQuery.isLoading}
            isError={Boolean(inventoryItemsQuery.error)}
            error={inventoryItemsQuery.error instanceof Error ? inventoryItemsQuery.error : new Error("Failed to load inventory")}
          />
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <CustomerLoyaltyTab
            insights={customerInsights}
            previousInsights={previousCustomerInsights}
            averageTransactionValue={averageTransactionValue}
            previousAverageTransactionValue={previousAverageTransactionValue}
            transactions={currentOverview.transactions}
            previousTransactions={previousOverview?.transactions ?? null}
            effectiveRange={effectiveRange}
          />
        </TabsContent>

        <TabsContent value="operations" className="space-y-6">
          <OperationsTab
            hasAccess={canViewOperations}
            staffPerformance={staffPerformanceData}
            storeContributions={storeContributionData}
            alertsSummary={alertsSummary}
            isLoading={false}
            isError={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const normalizedRole = user?.role?.toLowerCase();
  const managerStoreId = user?.storeId;
  const initialStoreId = normalizedRole === "manager" && managerStoreId ? managerStoreId : null;
  const lockedStoreId = normalizedRole === "manager" ? managerStoreId ?? null : null;

  return (
    <AnalyticsScopeProvider initialStoreId={initialStoreId} lockedStoreId={lockedStoreId}>
      <AnalyticsContent />
    </AnalyticsScopeProvider>
  );
}
