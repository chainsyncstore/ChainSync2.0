import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, TrendingUp, Users, Package, DollarSign, Trash2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
import { formatCurrency } from "@/lib/pos-utils";
import type { Store, LowStockAlert } from "@shared/schema";

type StorePerformance = Store & {
  dailyRevenue: number;
  dailyTransactions: number;
  monthlyRevenue: number;
  staff: number;
  lowStockItems: number;
  profitMargin: number;
  status: string;
};

export default function MultiStore() {
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreAddress, setNewStoreAddress] = useState("");
  const [newStoreCurrency, setNewStoreCurrency] = useState<'NGN' | 'USD'>("NGN");
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);
  const [newStoreTaxRate, setNewStoreTaxRate] = useState("8.5");
  const [taxRateEdits, setTaxRateEdits] = useState<Record<string, string>>({});
  const [savingTaxRateId, setSavingTaxRateId] = useState<string | null>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  useEffect(() => {
    setTaxRateEdits({});
  }, [stores]);

  // Auto-select first store when stores are loaded
  useEffect(() => {
    if (stores.length === 0) {
      if (selectedStore) {
        setSelectedStore("");
      }
      return;
    }

    const stillExists = stores.some((store) => store.id === selectedStore);
    if (!selectedStore || !stillExists) {
      setSelectedStore(stores[0].id);
    }
  }, [stores, selectedStore]);

  const { data: alerts = [] } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", selectedStore, "alerts"],
    enabled: Boolean(selectedStore),
  });
  const selectedStoreLowStock = alerts.length;

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
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setNewStoreName("");
      setNewStoreAddress("");
      setNewStoreTaxRate("8.5");
      toast({ title: "Store created", description: `Currency: ${newStoreCurrency}` });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
    } catch (error) {
      console.error("Failed to create store", error);
      toast({ title: "Failed to create store", variant: "destructive" });
    }
  }, [newStoreAddress, newStoreCurrency, newStoreName, newStoreTaxRate, queryClient, toast]);

  const deleteStore = useCallback(async (store: Store) => {
    if (store.id.startsWith("placeholder-")) {
      return;
    }

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
      if (selectedStore === store.id) {
        setSelectedStore("");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
    } catch (error) {
      console.error("Failed to delete store", error);
      toast({ title: "Failed to delete store", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setDeletingStoreId(null);
    }
  }, [queryClient, selectedStore, toast]);

  const mockMetrics = useMemo(() => ([
    {
      dailyRevenue: 2847,
      dailyTransactions: 127,
      monthlyRevenue: 45230,
      staff: 8,
      lowStockItems: 3,
      profitMargin: 23.5,
    },
    {
      dailyRevenue: 3156,
      dailyTransactions: 143,
      monthlyRevenue: 52340,
      staff: 12,
      lowStockItems: 1,
      profitMargin: 26.8,
    },
    {
      dailyRevenue: 4231,
      dailyTransactions: 189,
      monthlyRevenue: 68450,
      staff: 15,
      lowStockItems: 5,
      profitMargin: 28.2,
    },
  ]), []);

  const storePerformance = useMemo<StorePerformance[]>(() => {
    if (stores.length === 0) {
      const now = new Date();
      return mockMetrics.map((metrics, index) => ({
        id: `placeholder-${index}`,
        orgId: "", 
        name: index === 0 ? "Main Street Store" : index === 1 ? "Downtown Branch" : "Mall Location",
        ownerId: "",
        address: "",
        phone: "",
        email: "",
        currency: "USD",
        taxRate: "0.0850",
        isActive: true,
        createdAt: now,
        updatedAt: now,
        status: "active",
        loyaltyEarnRateOverride: null,
        loyaltyRedeemValueOverride: null,
        ...metrics,
      }));
    }

    return stores.map((store, index) => {
      const metrics = mockMetrics[index % mockMetrics.length];
      return {
        ...store,
        status: store.isActive ? "active" : "inactive",
        ...metrics,
      } as StorePerformance;
    });
  }, [stores, mockMetrics]);

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

  const totalMetrics = storePerformance.reduce(
    (acc, store) => ({
      revenue: acc.revenue + store.dailyRevenue,
      transactions: acc.transactions + store.dailyTransactions,
      monthlyRevenue: acc.monthlyRevenue + store.monthlyRevenue,
      staff: acc.staff + store.staff,
      lowStockItems: acc.lowStockItems + store.lowStockItems,
    }),
    { revenue: 0, transactions: 0, monthlyRevenue: 0, staff: 0, lowStockItems: 0 }
  );

  const averageProfitMargin = storePerformance.length > 0
    ? storePerformance.reduce((acc, store) => acc + store.profitMargin, 0) / storePerformance.length
    : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Add Store</CardTitle>
          {selectedStore && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Selected store:</span>
              <Badge variant={selectedStoreLowStock > 0 ? "destructive" : "secondary"}>
                {selectedStoreLowStock > 0
                  ? `${selectedStoreLowStock} low stock alert${selectedStoreLowStock > 1 ? 's' : ''}`
                  : 'No low stock alerts'}
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <Label htmlFor="new-store-name">Store Name</Label>
            <Input id="new-store-name" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="new-store-address">Address</Label>
            <Input id="new-store-address" value={newStoreAddress} onChange={(e) => setNewStoreAddress(e.target.value)} />
          </div>
          <div>
            <Label>Currency</Label>
            <Select value={newStoreCurrency} onValueChange={(v) => setNewStoreCurrency(v as 'NGN' | 'USD')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NGN">NGN (₦)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="new-store-tax-rate">Tax Rate (%)</Label>
            <Input
              id="new-store-tax-rate"
              type="number"
              step="0.01"
              min="0"
              value={newStoreTaxRate}
              onChange={(e) => setNewStoreTaxRate(e.target.value)}
              placeholder="e.g. 8.50"
            />
            <p className="text-xs text-muted-foreground mt-1">Displayed as a percentage — stored as a decimal.</p>
          </div>
          <div className="flex items-end">
            <Button onClick={createStore} className="w-full">Create Store</Button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-6">
        {/* Chain Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{storePerformance.length}</div>
              <p className="text-xs text-muted-foreground">
                {storePerformance.filter(s => s.status === "active").length} active
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Daily Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(totalMetrics.revenue)}
              </div>
              <p className="text-xs text-muted-foreground">
                {totalMetrics.transactions} transactions
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(totalMetrics.monthlyRevenue)}
              </div>
              <p className="text-xs text-muted-foreground">
                {averageProfitMargin.toFixed(1)}% avg margin
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMetrics.staff}</div>
              <p className="text-xs text-muted-foreground">
                Across all locations
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="performance" className="space-y-6">
          <TabsList>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
            <TabsTrigger value="alerts">Chain Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-6">
            {/* Store Performance Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {storePerformance.map((store) => {
                const baseStore = stores.find((s) => s.id === store.id);
                const isPlaceholder = store.id.startsWith('placeholder-');
                const effectiveTaxRate = Number(baseStore?.taxRate ?? store.taxRate ?? 0);
                const defaultPercent = Number.isFinite(effectiveTaxRate) ? (effectiveTaxRate * 100).toFixed(2) : "0.00";
                const taxInputValue = taxRateEdits[store.id] ?? defaultPercent;

                return (
                  <Card key={store.id} className="relative">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{store.name}</CardTitle>
                        <Badge variant="default" className="bg-green-100 text-green-700">
                          {store.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Daily Revenue</p>
                        <p className="text-xl font-bold text-green-600">
                          {formatCurrency(store.dailyRevenue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Transactions</p>
                        <p className="text-xl font-bold">{store.dailyTransactions}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Monthly Revenue</p>
                        <p className="text-lg font-semibold">
                          {formatCurrency(store.monthlyRevenue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Profit Margin</p>
                        <p className="text-lg font-semibold text-blue-600">
                          {store.profitMargin}%
                        </p>
                      </div>
                    </div>
                    
                    <div className="border-t pt-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Staff: {store.staff}</span>
                        {store.lowStockItems > 0 && (
                          <span className="text-yellow-600 flex items-center">
                            <Package className="w-3 h-3 mr-1" />
                            {store.lowStockItems} low stock
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4">
                      <Label htmlFor={`store-tax-${store.id}`}>Tax Rate (%)</Label>
                      <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                        <Input
                          id={`store-tax-${store.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={taxInputValue}
                          onChange={(e) => setTaxRateEdits((prev) => ({ ...prev, [store.id]: e.target.value }))}
                          disabled={isPlaceholder || savingTaxRateId === store.id}
                          className="sm:max-w-[160px]"
                        />
                        <Button
                          onClick={() => baseStore && handleSaveTaxRate(baseStore, taxInputValue)}
                          disabled={isPlaceholder || savingTaxRateId === store.id || !baseStore}
                        >
                          {savingTaxRateId === store.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Save Tax Rate'
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Currently {defaultPercent}% ({Number(effectiveTaxRate).toFixed(4)} as decimal).</p>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        disabled={store.id.startsWith('placeholder-')}
                        onClick={() => {
                          if (store.id.startsWith('placeholder-')) return;
                          navigate(`/stores/${store.id}/staff`);
                        }}
                      >
                        Manage Staffs
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={store.id.startsWith('placeholder-') || deletingStoreId === store.id}
                        onClick={() => deleteStore(store)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {deletingStoreId === store.id ? 'Deleting…' : 'Delete Store'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="comparison" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Store Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 font-medium">Store</th>
                        <th className="text-right p-4 font-medium">Daily Revenue</th>
                        <th className="text-right p-4 font-medium">Monthly Revenue</th>
                        <th className="text-right p-4 font-medium">Transactions</th>
                        <th className="text-right p-4 font-medium">Avg Order</th>
                        <th className="text-right p-4 font-medium">Profit Margin</th>
                        <th className="text-center p-4 font-medium">Performance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {storePerformance
                        .sort((a, b) => b.dailyRevenue - a.dailyRevenue)
                        .map((store, index) => {
                          const avgOrder = store.dailyRevenue / store.dailyTransactions;
                          const performance = index === 0 ? "excellent" : 
                                           index === 1 ? "good" : "average";
                          
                          return (
                            <tr key={store.id} className="border-b hover:bg-gray-50">
                              <td className="p-4">
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">{store.name}</span>
                                  {index === 0 && (
                                    <Badge variant="default" className="bg-yellow-100 text-yellow-700 text-xs">
                                      Top Performer
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 text-right font-medium">
                                {formatCurrency(store.dailyRevenue)}
                              </td>
                              <td className="p-4 text-right">
                                {formatCurrency(store.monthlyRevenue)}
                              </td>
                              <td className="p-4 text-right">{store.dailyTransactions}</td>
                              <td className="p-4 text-right">{formatCurrency(avgOrder)}</td>
                              <td className="p-4 text-right text-blue-600 font-medium">
                                {store.profitMargin}%
                              </td>
                              <td className="p-4 text-center">
                                <Badge 
                                  variant={performance === "excellent" ? "default" : 
                                          performance === "good" ? "secondary" : "outline"}
                                  className={performance === "excellent" ? "bg-green-100 text-green-700" : 
                                            performance === "good" ? "bg-blue-100 text-blue-700" : ""}
                                >
                                  {performance}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Chain-wide Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {totalMetrics.lowStockItems === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No chain-wide alerts</p>
                      <p className="text-sm">All stores are operating normally</p>
                    </div>
                  ) : (
                    storePerformance
                      .filter(store => store.lowStockItems > 0)
                      .map((store) => (
                        <div key={store.id} className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-yellow-900">{store.name}</p>
                              <p className="text-sm text-yellow-700">
                                {store.lowStockItems} items need restocking
                              </p>
                            </div>
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                              Low Stock
                            </Badge>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
