import { AlertTriangle, Clock, Loader2, Package, TrendingDown } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, formatDate } from "@/lib/pos-utils";
import type { CurrencyCode, Money } from "@shared/lib/currency";
import type { LowStockAlert } from "@shared/schema";

export interface InventoryItem {
  id: string;
  productId: string;
  storeId: string;
  quantity: number;
  minStockLevel: number | null;
  maxStockLevel: number | null;
  lastRestocked: string | null;
  updatedAt: string | null;
  formattedPrice: number;
  storeCurrency: CurrencyCode;
  stockValue: number;
  product: {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    category: string | null;
    brand: string | null;
    price: number | null;
    cost: number | null;
  } | null;
}

interface ProductInventoryTabProps {
  inventoryMoney: Money;
  inventoryNativeMoney: Money;
  inventoryItems: InventoryItem[];
  storeCurrency: CurrencyCode;
  alerts: LowStockAlert[];
  displayCurrency: "native" | CurrencyCode;
  resolvedCurrency: CurrencyCode;
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
}

type AgingBucketKey = "fresh" | "recent" | "stale" | "aging" | "unknown";

interface AgingBucket {
  key: AgingBucketKey;
  label: string;
  min: number;
  max: number;
}

const AGING_BUCKETS: AgingBucket[] = [
  { key: "fresh", label: "0-30 days", min: 0, max: 30 },
  { key: "recent", label: "31-60 days", min: 31, max: 60 },
  { key: "stale", label: "61-90 days", min: 61, max: 90 },
  { key: "aging", label: "90+ days", min: 91, max: Infinity },
  { key: "unknown", label: "Unknown", min: -1, max: -1 },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const toMoney = (amount: number, currency: CurrencyCode): Money => ({ amount, currency });

function computeDaysSince(dateString: string | null | undefined): number | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

export default function ProductInventoryTab({
  inventoryMoney,
  inventoryNativeMoney,
  inventoryItems,
  storeCurrency,
  alerts,
  displayCurrency,
  resolvedCurrency,
  isLoading,
  isError,
  error,
}: ProductInventoryTabProps) {
  const currencyBadge = displayCurrency === "native" ? "Native" : resolvedCurrency;

  const totals = useMemo(() => {
    const totalSkus = inventoryItems.length;
    let totalValueRaw = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let overstockCount = 0;

    for (const item of inventoryItems) {
      const quantity = Number(item.quantity ?? 0);
      const minLevel = Number(item.minStockLevel ?? 0);
      const maxLevel = item.maxStockLevel == null ? undefined : Number(item.maxStockLevel);
      const stockValue = Number(item.stockValue ?? 0);
      totalValueRaw += stockValue;
      if (quantity <= minLevel) {
        lowStockCount += 1;
      }
      if (quantity === 0) {
        outOfStockCount += 1;
      }
      if (maxLevel != null && quantity > maxLevel) {
        overstockCount += 1;
      }
    }

    return {
      totalSkus,
      totalValueRaw,
      lowStockCount,
      outOfStockCount,
      overstockCount,
    };
  }, [inventoryItems]);

  const agingBuckets = useMemo(() => {
    const bucketMap: Record<AgingBucketKey, { count: number; totalValueRaw: number }> = {
      fresh: { count: 0, totalValueRaw: 0 },
      recent: { count: 0, totalValueRaw: 0 },
      stale: { count: 0, totalValueRaw: 0 },
      aging: { count: 0, totalValueRaw: 0 },
      unknown: { count: 0, totalValueRaw: 0 },
    };

    for (const item of inventoryItems) {
      const days = computeDaysSince(item.lastRestocked ?? item.updatedAt);
      const stockValue = Number(item.stockValue ?? 0);
      const bucket = AGING_BUCKETS.find((candidate) => {
        if (candidate.key === "unknown") {
          return days == null;
        }
        if (days == null) {
          return false;
        }
        return days >= candidate.min && days <= candidate.max;
      }) ?? AGING_BUCKETS[AGING_BUCKETS.length - 1];

      bucketMap[bucket.key].count += 1;
      bucketMap[bucket.key].totalValueRaw += stockValue;
    }

    const scale = totals.totalValueRaw > 0 ? inventoryMoney.amount / totals.totalValueRaw : 1;

    return AGING_BUCKETS.map((bucket) => {
      const entry = bucketMap[bucket.key];
      const percent = totals.totalValueRaw > 0 ? (entry.totalValueRaw / totals.totalValueRaw) * 100 : 0;
      const normalizedAmount = entry.totalValueRaw * scale;

      return {
        key: bucket.key,
        label: bucket.label,
        count: entry.count,
        percent,
        valueDisplay: formatCurrency(toMoney(normalizedAmount, inventoryMoney.currency)),
        nativeDisplay: formatCurrency(toMoney(entry.totalValueRaw, storeCurrency)),
      };
    });
  }, [inventoryItems, totals.totalValueRaw, inventoryMoney.amount, inventoryMoney.currency, storeCurrency]);

  const topAgedItems = useMemo(() => {
    const itemsWithAge = inventoryItems
      .map((item) => {
        const days = computeDaysSince(item.lastRestocked ?? item.updatedAt);
        return {
          item,
          days: days ?? -1,
          stockValue: Number(item.stockValue ?? 0),
        };
      })
      .filter((entry) => entry.days >= 0)
      .sort((a, b) => b.days - a.days)
      .slice(0, 5);

    const scale = totals.totalValueRaw > 0 ? inventoryMoney.amount / totals.totalValueRaw : 1;

    return itemsWithAge.map((entry) => {
      const normalizedValue = entry.stockValue * scale;
      return {
        ...entry,
        normalizedValue,
      };
    });
  }, [inventoryItems, totals.totalValueRaw, inventoryMoney.amount]);

  const lowStockItems = useMemo(() => {
    return inventoryItems
      .filter((item) => Number(item.quantity ?? 0) <= Number(item.minStockLevel ?? 0))
      .sort((a, b) => {
        const aDelta = Number(a.quantity ?? 0) - Number(a.minStockLevel ?? 0);
        const bDelta = Number(b.quantity ?? 0) - Number(b.minStockLevel ?? 0);
        return aDelta - bDelta;
      })
      .slice(0, 5);
  }, [inventoryItems]);

  const outOfStockItems = useMemo(
    () => inventoryItems.filter((item) => Number(item.quantity ?? 0) === 0).slice(0, 5),
    [inventoryItems],
  );

  const alertMap = useMemo(() => {
    const map = new Map<string, LowStockAlert>();
    for (const alert of alerts) {
      if (alert.productId) {
        map.set(alert.productId, alert);
      }
    }
    return map;
  }, [alerts]);

  if (isLoading) {
    return (
      <Card className="border border-slate-200">
        <CardContent className="flex h-40 items-center justify-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading inventory analytics…
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Unable to load product & inventory analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-destructive">
          {error?.message ?? "An unexpected error occurred."}
        </CardContent>
      </Card>
    );
  }

  if (inventoryItems.length === 0) {
    return (
      <Card className="border border-dashed border-slate-200">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No inventory records found for this store.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border border-slate-200">
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total SKUs</CardTitle>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{totals.totalSkus.toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground">Tracked products in this store</p>
          </CardHeader>
        </Card>

        <Card className="border border-slate-200">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Inventory Value</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {currencyBadge}
              </Badge>
            </div>
            <div className="text-2xl font-semibold">{formatCurrency(inventoryMoney)}</div>
            {inventoryMoney.currency !== inventoryNativeMoney.currency ? (
              <p className="text-xs text-muted-foreground">
                Native: {formatCurrency(inventoryNativeMoney)}
              </p>
            ) : null}
          </CardHeader>
        </Card>

        <Card className="border border-slate-200">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingDown className="h-4 w-4 text-amber-500" />
              Low Stock Items
            </div>
            <div className="text-2xl font-semibold text-amber-600">{totals.lowStockCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">At or below minimum stock level</p>
          </CardHeader>
        </Card>

        <Card className="border border-slate-200">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Out of Stock
            </div>
            <div className="text-2xl font-semibold text-red-600">{totals.outOfStockCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Currently unavailable items</p>
          </CardHeader>
        </Card>
      </div>

      <Card className="border border-slate-200">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Inventory Aging</CardTitle>
            <p className="text-sm text-muted-foreground">
              Based on last restock date for each item
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            Value shown in {inventoryMoney.currency}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {agingBuckets.map((bucket) => (
            <div key={bucket.key} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{bucket.label}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {bucket.count.toLocaleString()} items • {bucket.valueDisplay}
                  {inventoryMoney.currency !== storeCurrency ? (
                    <span className="ml-1 text-[0.7rem] text-muted-foreground/70">
                      ({bucket.nativeDisplay})
                    </span>
                  ) : null}
                </div>
              </div>
              <Progress value={bucket.percent} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border border-slate-200">
          <CardHeader>
            <CardTitle>Oldest Inventory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {topAgedItems.length === 0 ? (
              <p className="text-muted-foreground">No historical restock data available yet.</p>
            ) : (
              topAgedItems.map(({ item, days, normalizedValue }) => {
                const productName = item.product?.name ?? "Unnamed product";
                const lastRestocked = item.lastRestocked ?? item.updatedAt;
                return (
                  <div key={item.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {days} days since restock{lastRestocked ? ` • ${formatDate(new Date(lastRestocked))}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {formatCurrency(toMoney(normalizedValue, inventoryMoney.currency))}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>On-hand: {item.quantity ?? 0}</span>
                      <span>
                        Min: {item.minStockLevel ?? 0}
                        {item.maxStockLevel != null ? ` • Max: ${item.maxStockLevel}` : ""}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="border border-slate-200">
          <CardHeader>
            <CardTitle>Stockout Watchlist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                Low stock
              </div>
              {lowStockItems.length === 0 ? (
                <p className="text-muted-foreground">All items are above their minimum stock levels.</p>
              ) : (
                lowStockItems.map((item) => {
                  const alert = alertMap.get(item.productId);
                  return (
                    <div key={item.id} className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-amber-800">{item.product?.name ?? "Unnamed product"}</p>
                          <p className="text-xs text-amber-700">
                            On-hand {item.quantity ?? 0} / Min {item.minStockLevel ?? 0}
                          </p>
                        </div>
                        {alert ? (
                          <Badge variant="outline" className="border-amber-300 text-[0.7rem] text-amber-700">
                            Alert #{alert.id?.toString().slice(-4)}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                Out of stock
              </div>
              {outOfStockItems.length === 0 ? (
                <p className="text-muted-foreground">No products are completely out of stock.</p>
              ) : (
                outOfStockItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-red-200 bg-red-50/60 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-red-800">{item.product?.name ?? "Unnamed product"}</p>
                        <p className="text-xs text-red-700">Out of stock • Min {item.minStockLevel ?? 0}</p>
                      </div>
                      <Badge variant="outline" className="border-red-300 text-[0.7rem] text-red-700">
                        Restock required
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
