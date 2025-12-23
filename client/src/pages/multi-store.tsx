import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Download, Globe2, Loader2, PercentCircle, RefreshCcw, Trash2, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
import { formatCurrency } from "@/lib/pos-utils";
import type { Money } from "@shared/lib/currency";
import type { Store, User } from "@shared/schema";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const parseTaxRate = (value: Store["taxRate"]) => {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatTaxPercent = (value: Store["taxRate"] | number) => {
  const decimal = typeof value === "number" ? value : parseTaxRate(value);
  return `${(decimal * 100).toFixed(2)}%`;
};

const startOfCurrentMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const endOfCurrentMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
};

const toDateInputValue = (date: Date) => date.toISOString().split("T")[0];

const toStartOfDayIso = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
};

const toEndOfDayIso = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy.toISOString();
};

type StoreComparisonRow = {
  storeId: string;
  storeName: string;
  currency: Money["currency"];
  transactions: number;
  revenue: Money;
  taxCollected: Money;
  refunds: Money;
  netRevenue: Money;
  averageOrder: Money;
};

export default function MultiStore() {
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreAddress, setNewStoreAddress] = useState("");
  const [newStoreCurrency, setNewStoreCurrency] = useState<'NGN' | 'USD'>("NGN");
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);
  const [newStoreTaxRate, setNewStoreTaxRate] = useState("8.5");
  const [newStoreTaxIncluded, setNewStoreTaxIncluded] = useState(false);
  const [taxRateEdits, setTaxRateEdits] = useState<Record<string, string>>({});
  const [savingTaxRateId, setSavingTaxRateId] = useState<string | null>(null);
  // eslint-disable-next-line no-unused-vars
  const [_taxIncludedEdits, setTaxIncludedEdits] = useState<Record<string, boolean>>({});
  const [savingTaxIncludedId, setSavingTaxIncludedId] = useState<string | null>(null);
  const [storeNameEdits, setStoreNameEdits] = useState<Record<string, string>>({});
  const [updatingNameId, setUpdatingNameId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [comparisonDates, setComparisonDates] = useState(() => {
    const start = startOfCurrentMonth();
    const end = endOfCurrentMonth();
    return {
      start: toDateInputValue(start),
      end: toDateInputValue(end),
    };
  });
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });
  const { data: staffResponse } = useQuery<{ users: User[] }>({
    queryKey: ["/api/admin/users"],
  });

  useEffect(() => {
    setTaxRateEdits({});
    setStoreNameEdits({});
  }, [stores]);

  const createStore = useCallback(async () => {
    if (!newStoreName.trim()) {
      toast({ title: "Store name required", variant: "destructive" });
      return;
    }
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          name: newStoreName.trim(),
          address: newStoreAddress.trim() || undefined,
          currency: newStoreCurrency,
          taxRate: Math.max(0, Number.parseFloat(newStoreTaxRate) / 100 || 0),
          taxIncluded: newStoreTaxIncluded,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setNewStoreName("");
      setNewStoreAddress("");
      setNewStoreTaxRate("8.5");
      setNewStoreTaxIncluded(false);
      toast({ title: "Store created", description: `Currency: ${newStoreCurrency}` });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
    } catch (error) {
      console.error("Failed to create store", error);
      toast({ title: "Failed to create store", variant: "destructive" });
    }
  }, [newStoreAddress, newStoreCurrency, newStoreName, newStoreTaxRate, newStoreTaxIncluded, queryClient, toast]);

  const deleteStore = useCallback(async (store: Store) => {
    const confirmed = window.confirm(`Delete ${store.name}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeletingStoreId(store.id);
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`/api/stores/${store.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error || payload?.message || "Failed to delete store";
        toast({ title: "Failed to delete store", description: message, variant: "destructive" });
        return;
      }

      toast({ title: "Store deleted", description: `${store.name} has been removed.` });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
    } catch (error) {
      console.error("Failed to delete store", error);
      toast({ title: "Failed to delete store", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setDeletingStoreId(null);
    }
  }, [queryClient, toast]);

  const sortedStores = useMemo(() => {
    return [...stores].sort((a, b) => a.name.localeCompare(b.name));
  }, [stores]);

  const activeStoreCount = useMemo(
    () => stores.filter((store) => store.isActive !== false).length,
    [stores]
  );

  const inactiveStoreCount = Math.max(stores.length - activeStoreCount, 0);

  const currencyBreakdown = useMemo(() => {
    return stores.reduce((acc, store) => {
      const currency = store.currency ?? "USD";
      acc[currency] = (acc[currency] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [stores]);

  const currencySummary = useMemo(() => {
    const entries = Object.entries(currencyBreakdown);
    if (entries.length === 0) {
      return "No stores yet";
    }
    return entries.map(([currency, count]) => `${currency} · ${count}`).join("  •  ");
  }, [currencyBreakdown]);

  const averageTaxPercent = useMemo(() => {
    if (stores.length === 0) return 0;
    const total = stores.reduce((sum, store) => sum + parseTaxRate(store.taxRate) * 100, 0);
    return total / stores.length;
  }, [stores]);

  const totalStaffCount = useMemo(() => {
    const staff = staffResponse?.users ?? [];
    return staff.filter((user) => user.isAdmin !== true).length;
  }, [staffResponse]);

  const parsedComparisonRange = useMemo(() => {
    if (!comparisonDates.start || !comparisonDates.end) {
      return null;
    }
    const startDate = new Date(comparisonDates.start);
    const endDate = new Date(comparisonDates.end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return null;
    }
    return { start: startDate, end: endDate };
  }, [comparisonDates]);

  const storeSummaries = useMemo(
    () => stores.map((store) => ({
      id: store.id,
      name: store.name,
      currency: (store.currency ?? "USD") as Money["currency"],
    })),
    [stores]
  );

  const comparisonQuery = useQuery<StoreComparisonRow[]>({
    queryKey: [
      "/api/analytics/overview",
      storeSummaries.map((store) => store.id),
      parsedComparisonRange?.start?.toISOString(),
      parsedComparisonRange?.end?.toISOString(),
    ],
    enabled: storeSummaries.length > 0 && Boolean(parsedComparisonRange),
    queryFn: async () => {
      if (!parsedComparisonRange) {
        return [];
      }
      const startIso = toStartOfDayIso(parsedComparisonRange.start);
      const endIso = toEndOfDayIso(parsedComparisonRange.end);

      const responses = await Promise.all(
        storeSummaries.map(async (store) => {
          const params = new URLSearchParams();
          params.set("store_id", store.id);
          params.set("date_from", startIso);
          params.set("date_to", endIso);
          params.set("normalize_currency", "false");

          const res = await fetch(`/api/analytics/overview?${params.toString()}`, {
            credentials: "include",
          });

          if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            throw new Error(detail?.error || detail?.message || "Failed to load comparison data");
          }

          const payload = await res.json();
          const revenue: Money = payload.total ?? { amount: 0, currency: store.currency };
          const taxCollected: Money = payload.taxCollected ?? { amount: 0, currency: revenue.currency };
          const refunds: Money = payload.refunds?.total ?? { amount: 0, currency: revenue.currency };
          const net: Money = payload.net?.total ?? { amount: revenue.amount - refunds.amount, currency: revenue.currency };
          const transactions: number = typeof payload.transactions === "number" ? payload.transactions : 0;
          const averageOrder: Money = transactions > 0
            ? { amount: revenue.amount / transactions, currency: revenue.currency }
            : { amount: 0, currency: revenue.currency };

          return {
            storeId: store.id,
            storeName: store.name,
            currency: revenue.currency,
            revenue,
            taxCollected,
            refunds,
            netRevenue: net,
            transactions,
            averageOrder,
          } satisfies StoreComparisonRow;
        })
      );

      return responses;
    },
  });

  const comparisonRows = useMemo(
    () => comparisonQuery.data ?? [],
    [comparisonQuery.data],
  );

  const aggregatedTotals = useMemo(() => {
    const totals = new Map<Money["currency"], { revenue: number; taxCollected: number; refunds: number; net: number; transactions: number }>();
    comparisonRows.forEach((row) => {
      const current = totals.get(row.currency) ?? { revenue: 0, taxCollected: 0, refunds: 0, net: 0, transactions: 0 };
      current.revenue += row.revenue.amount;
      current.taxCollected += row.taxCollected.amount;
      current.refunds += row.refunds.amount;
      current.net += row.netRevenue.amount;
      current.transactions += row.transactions;
      totals.set(row.currency, current);
    });
    return totals;
  }, [comparisonRows]);

  const totalStoresWithMetrics = comparisonRows.length;

  const handleSaveTaxRate = useCallback(async (store: Store, nextValue: string) => {
    const parsedPercent = Number.parseFloat(nextValue);
    if (!Number.isFinite(parsedPercent) || parsedPercent < 0) {
      toast({ title: "Invalid tax rate", description: "Enter a valid percentage", variant: "destructive" });
      return;
    }
    setSavingTaxRateId(store.id);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/stores/${store.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ taxRate: parsedPercent / 100 }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message = payload?.error || payload?.message || "Failed to update tax rate";
        toast({ title: "Failed to update", description: message, variant: "destructive" });
        return;
      }
      toast({ title: "Tax rate updated", description: `${store.name} now at ${parsedPercent.toFixed(2)}%` });
      setTaxRateEdits((prev) => {
        const next = { ...prev };
        delete next[store.id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
    } catch (error) {
      console.error("Failed to update tax rate", error);
      toast({ title: "Failed to update", description: "Network error", variant: "destructive" });
    } finally {
      setSavingTaxRateId(null);
    }
  }, [queryClient, toast]);

  const handleSaveStoreName = useCallback(async (store: Store, nextValue: string) => {
    const trimmed = nextValue.trim();
    if (!trimmed) {
      toast({ title: "Store name required", variant: "destructive" });
      return;
    }

    setUpdatingNameId(store.id);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/stores/${store.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message = payload?.error || payload?.message || "Failed to update store";
        toast({ title: "Failed to update store", description: message, variant: "destructive" });
        return;
      }

      toast({ title: "Store updated", description: `Name saved as "${trimmed}"` });
      setStoreNameEdits((prev) => {
        const next = { ...prev };
        delete next[store.id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
    } catch (error) {
      console.error("Failed to update store name", error);
      toast({ title: "Failed to update store", description: "Network error", variant: "destructive" });
    } finally {
      setUpdatingNameId(null);
    }
  }, [queryClient, toast]);

  const handleToggleTaxIncluded = useCallback(async (store: Store, newValue: boolean) => {
    setSavingTaxIncludedId(store.id);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/stores/${store.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ taxIncluded: newValue }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message = payload?.error || payload?.message || "Failed to update tax mode";
        toast({ title: "Failed to update", description: message, variant: "destructive" });
        return;
      }

      toast({
        title: "Tax mode updated",
        description: newValue
          ? `${store.name}: Tax now included in prices`
          : `${store.name}: Tax now added to prices`
      });
      setTaxIncludedEdits((prev) => {
        const next = { ...prev };
        delete next[store.id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
    } catch (error) {
      console.error("Failed to update tax mode", error);
      toast({ title: "Failed to update", description: "Network error", variant: "destructive" });
    } finally {
      setSavingTaxIncludedId(null);
    }
  }, [queryClient, toast]);

  const handleToggleStoreActive = useCallback(async (store: Store) => {
    const currentlyActive = store.isActive !== false;

    if (currentlyActive) {
      const confirmed = window.confirm(
        `Deactivate ${store.name}? This will disable store access for linked staff until reactivated.`
      );
      if (!confirmed) return;
    }

    const nextActive = !currentlyActive;
    setUpdatingStatusId(store.id);

    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/stores/${store.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ isActive: nextActive }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message = payload?.error || payload?.message || "Failed to update store status";
        toast({ title: "Failed to update status", description: message, variant: "destructive" });
        return;
      }

      toast({
        title: nextActive ? "Store activated" : "Store deactivated",
        description: nextActive
          ? `${store.name} is now active.`
          : `${store.name} is now inactive. Linked staff have been updated.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
    } catch (error) {
      console.error("Failed to toggle store status", error);
      toast({ title: "Failed to update status", description: "Network error", variant: "destructive" });
    } finally {
      setUpdatingStatusId(null);
    }
  }, [queryClient, toast]);

  const hasStores = stores.length > 0;

  const handleResetComparisonRange = useCallback(() => {
    const start = startOfCurrentMonth();
    const end = endOfCurrentMonth();
    setComparisonDates({ start: toDateInputValue(start), end: toDateInputValue(end) });
  }, []);

  const handleDownloadComparison = useCallback(() => {
    if (!comparisonRows.length) {
      toast({ title: "Nothing to download", description: "Add stores or adjust the date range.", variant: "destructive" });
      return;
    }

    const header = ["Store", "Transactions", "Revenue", "Tax Collected", "Refunds", "Net Revenue", "Average Order", "Currency"];
    const rows = comparisonRows.map((row) => [
      row.storeName,
      row.transactions.toString(),
      row.revenue.amount.toFixed(2),
      row.taxCollected.amount.toFixed(2),
      row.refunds.amount.toFixed(2),
      row.netRevenue.amount.toFixed(2),
      row.averageOrder.amount.toFixed(2),
      row.currency,
    ]);

    const csvContent = [header, ...rows]
      .map((cols) => cols.map((value) => `"${value.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const startLabel = comparisonDates.start ?? "unknown-start";
    const endLabel = comparisonDates.end ?? "unknown-end";
    link.href = url;
    link.setAttribute("download", `store-comparison_${startLabel}_${endLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [comparisonRows, comparisonDates, toast]);

  return (
    <div className="space-y-8">
      <Card className="border-muted/60 shadow-none">
        <CardHeader className="space-y-1">
          <CardTitle>Create a store</CardTitle>
          <CardDescription>Keep the essentials lightweight – you can refine details anytime.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="new-store-name">Store name</Label>
              <Input id="new-store-name" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-store-address">Address</Label>
              <Input id="new-store-address" value={newStoreAddress} onChange={(e) => setNewStoreAddress(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={newStoreCurrency} onValueChange={(v) => setNewStoreCurrency(v as 'NGN' | 'USD')}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NGN">NGN (₦)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-store-tax-rate">Tax rate (%)</Label>
              <Input
                id="new-store-tax-rate"
                type="number"
                step="0.01"
                min="0"
                value={newStoreTaxRate}
                onChange={(e) => setNewStoreTaxRate(e.target.value)}
                placeholder="e.g. 8.50"
              />
              <p className="text-xs text-muted-foreground">Displayed as a percentage · stored as a decimal.</p>
            </div>
            <div className="space-y-2">
              <Label>Tax mode</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="new-store-tax-mode"
                    checked={!newStoreTaxIncluded}
                    onChange={() => setNewStoreTaxIncluded(false)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Tax added to price</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="new-store-tax-mode"
                    checked={newStoreTaxIncluded}
                    onChange={() => setNewStoreTaxIncluded(true)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Tax included in price</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {newStoreTaxIncluded
                  ? "Sale prices already include tax. Tax will be back-calculated from the total."
                  : "Tax will be added on top of sale prices at checkout."
                }
              </p>
            </div>
            <div className="space-y-2 md:col-span-2 lg:col-span-3">
              <Button onClick={createStore} className="w-full md:w-auto">Create store</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="border-muted/60 shadow-none bg-muted/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total stores</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stores.length}</div>
            <p className="text-xs text-muted-foreground">{activeStoreCount} active</p>
          </CardContent>
        </Card>
        <Card className="border-muted/60 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active vs inactive</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{activeStoreCount}</div>
            <p className="text-xs text-muted-foreground">{inactiveStoreCount} inactive</p>
          </CardContent>
        </Card>
        <Card className="border-muted/60 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team size</CardTitle>
            <UserRound className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{totalStaffCount}</div>
            <p className="text-xs text-muted-foreground">Non-admin staff across all stores</p>
          </CardContent>
        </Card>
        <Card className="border-muted/60 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Currency mix</CardTitle>
            <Globe2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium text-muted-foreground">{currencySummary}</div>
          </CardContent>
        </Card>
        <Card className="border-muted/60 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average tax rate</CardTitle>
            <PercentCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{averageTaxPercent.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground">Across {stores.length || '—'} stores</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="performance" className="space-y-6">
        <TabsList className="w-fit">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="comparison">Comparison</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-6">
          {!hasStores ? (
            <Card className="border-dashed border-muted/80 shadow-none">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Add your first store to start tracking performance.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {sortedStores.map((store) => {
                const taxDecimal = parseTaxRate(store.taxRate);
                const defaultPercent = (taxDecimal * 100).toFixed(2);
                const taxInputValue = taxRateEdits[store.id] ?? defaultPercent;
                const isSavingTax = savingTaxRateId === store.id;
                const isDeleting = deletingStoreId === store.id;
                const nameInputValue = storeNameEdits[store.id] ?? store.name;
                const isSavingName = updatingNameId === store.id;
                const isTogglingStatus = updatingStatusId === store.id;
                const storeTaxIncluded = (store as any).taxIncluded ?? false;
                const isSavingTaxIncluded = savingTaxIncludedId === store.id;

                return (
                  <Card key={store.id} className="flex flex-col border-muted/60 shadow-none">
                    <CardHeader className="space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">{store.name}</CardTitle>
                          <p className="text-sm text-muted-foreground">{store.address || "No address provided"}</p>
                        </div>
                        <Badge
                          variant={store.isActive === false ? "secondary" : "default"}
                          className={store.isActive === false ? "" : "bg-emerald-100 text-emerald-700"}
                        >
                          {store.isActive === false ? "inactive" : "active"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <div>
                        <Label htmlFor={`store-name-${store.id}`}>Store name</Label>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Input
                            id={`store-name-${store.id}`}
                            value={nameInputValue}
                            onChange={(e) => setStoreNameEdits((prev) => ({ ...prev, [store.id]: e.target.value }))}
                            disabled={isSavingName}
                            className="sm:max-w-[220px]"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isSavingName || nameInputValue.trim() === store.name}
                            onClick={() => handleSaveStoreName(store, nameInputValue)}
                          >
                            {isSavingName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save name
                          </Button>
                        </div>
                      </div>

                      <dl className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <dt className="text-muted-foreground">Currency</dt>
                          <dd className="font-medium">{store.currency ?? "USD"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Tax rate</dt>
                          <dd className="font-medium">{formatTaxPercent(taxDecimal)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Created</dt>
                          <dd className="font-medium">
                            {store.createdAt ? dateFormatter.format(new Date(store.createdAt)) : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Updated</dt>
                          <dd className="font-medium">
                            {store.updatedAt ? dateFormatter.format(new Date(store.updatedAt)) : "—"}
                          </dd>
                        </div>
                      </dl>

                      <div>
                        <Label htmlFor={`store-tax-${store.id}`}>Tax rate (%)</Label>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Input
                            id={`store-tax-${store.id}`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={taxInputValue}
                            onChange={(e) => setTaxRateEdits((prev) => ({ ...prev, [store.id]: e.target.value }))}
                            disabled={isSavingTax}
                            className="sm:max-w-[160px]"
                          />
                          <Button type="button" onClick={() => handleSaveTaxRate(store, taxInputValue)} disabled={isSavingTax}>
                            {isSavingTax ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Save'
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Stored as {parseTaxRate(store.taxRate).toFixed(4)} in decimal form.
                        </p>
                      </div>

                      <div>
                        <Label>Tax mode</Label>
                        <div className="mt-2 flex flex-col gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`store-tax-mode-${store.id}`}
                              checked={!storeTaxIncluded}
                              onChange={() => handleToggleTaxIncluded(store, false)}
                              disabled={isSavingTaxIncluded}
                              className="h-4 w-4"
                            />
                            <span className="text-sm">Tax added to price</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`store-tax-mode-${store.id}`}
                              checked={storeTaxIncluded}
                              onChange={() => handleToggleTaxIncluded(store, true)}
                              disabled={isSavingTaxIncluded}
                              className="h-4 w-4"
                            />
                            <span className="text-sm">Tax included in price</span>
                            {isSavingTaxIncluded && <Loader2 className="h-3 w-3 animate-spin" />}
                          </label>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {storeTaxIncluded
                            ? "Prices already include tax. Tax is back-calculated."
                            : "Tax is added on top of prices at checkout."
                          }
                        </p>
                      </div>

                      <div className="mt-auto grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Button variant="outline" onClick={() => navigate(`/stores/${store.id}/staff`)}>
                          Manage staff
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isTogglingStatus}
                          onClick={() => handleToggleStoreActive(store)}
                        >
                          {isTogglingStatus ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {store.isActive === false ? 'Activate' : 'Deactivate'}
                        </Button>
                        <Button
                          variant="destructive"
                          disabled={isDeleting}
                          onClick={() => deleteStore(store)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {isDeleting ? 'Deleting…' : 'Delete store'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="comparison" className="space-y-6">
          <Card className="border-muted/60 shadow-none">
            <CardHeader>
              <CardTitle>Store comparison</CardTitle>
              <CardDescription>Analyze revenue and transaction performance for a specific date range.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!hasStores ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Once a store is added, it will appear here for quick comparison.
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="comparison-start">Start date</Label>
                        <Input
                          id="comparison-start"
                          type="date"
                          value={comparisonDates.start}
                          max={comparisonDates.end}
                          onChange={(event) => setComparisonDates((prev) => ({ ...prev, start: event.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="comparison-end">End date</Label>
                        <Input
                          id="comparison-end"
                          type="date"
                          value={comparisonDates.end}
                          min={comparisonDates.start}
                          onChange={(event) => setComparisonDates((prev) => ({ ...prev, end: event.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button variant="outline" onClick={handleResetComparisonRange} className="flex items-center gap-2">
                        <RefreshCcw className="h-4 w-4" />
                        Current month
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleDownloadComparison}
                        disabled={!comparisonRows.length || comparisonQuery.isLoading}
                        className="flex items-center gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download CSV
                      </Button>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Showing data from {comparisonDates.start || "—"} to {comparisonDates.end || "—"}
                  </p>

                  {comparisonQuery.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading analytics…
                    </div>
                  )}

                  {comparisonQuery.isError && (
                    <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                      Unable to load comparison data. Adjust the date range or try again.
                    </div>
                  )}

                  {!comparisonQuery.isLoading && !comparisonRows.length && (
                    <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-muted-foreground">
                      No sales data available for this period.
                    </div>
                  )}

                  {comparisonRows.length > 0 && (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from(aggregatedTotals.entries()).map(([currency, totals]) => (
                          <Card key={currency} className="border-muted/60 shadow-none">
                            <CardHeader className="space-y-1">
                              <CardTitle className="text-sm font-medium">Aggregate ({currency})</CardTitle>
                              <p className="text-xs text-muted-foreground">
                                Across {totalStoresWithMetrics} store{totalStoresWithMetrics === 1 ? "" : "s"}
                              </p>
                            </CardHeader>
                            <CardContent className="space-y-1 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Revenue</span>
                                <span className="font-medium">{formatCurrency({ amount: totals.revenue, currency })}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-amber-600">Tax Collected</span>
                                <span className="font-medium text-amber-600">{formatCurrency({ amount: totals.taxCollected, currency })}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Refunds</span>
                                <span className="font-medium">{formatCurrency({ amount: totals.refunds, currency })}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Net</span>
                                <span className="font-medium">{formatCurrency({ amount: totals.net, currency })}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Transactions</span>
                                <span className="font-medium">{totals.transactions.toLocaleString()}</span>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="p-3 font-medium">Store</th>
                              <th className="p-3 font-medium text-right">Transactions</th>
                              <th className="p-3 font-medium text-right">Revenue</th>
                              <th className="p-3 font-medium text-right text-amber-600">Tax Collected</th>
                              <th className="p-3 font-medium text-right">Refunds</th>
                              <th className="p-3 font-medium text-right">Net revenue</th>
                              <th className="p-3 font-medium text-right">Avg. order</th>
                              <th className="p-3 font-medium text-center">Currency</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comparisonRows.map((row) => (
                              <tr key={row.storeId} className="border-b last:border-0">
                                <td className="p-3 font-medium">{row.storeName}</td>
                                <td className="p-3 text-right">{row.transactions.toLocaleString()}</td>
                                <td className="p-3 text-right">{formatCurrency(row.revenue)}</td>
                                <td className="p-3 text-right text-amber-600">{formatCurrency(row.taxCollected)}</td>
                                <td className="p-3 text-right">{formatCurrency(row.refunds)}</td>
                                <td className="p-3 text-right">{formatCurrency(row.netRevenue)}</td>
                                <td className="p-3 text-right">{formatCurrency(row.averageOrder)}</td>
                                <td className="p-3 text-center">{row.currency}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
