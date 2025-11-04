import { useQuery } from "@tanstack/react-query";
import { Calendar, DollarSign, Package, TrendingUp, Users, Zap } from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartSkeleton } from "@/components/ui/loading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRealtimeSales } from "@/hooks/use-realtime-sales";
import { formatCurrency } from "@/lib/pos-utils";
import type { Store, LowStockAlert, Product } from "@shared/schema";

const SalesChart = lazy(() => import("@/components/analytics/sales-chart"));

export default function Analytics() {
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState("30");

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  // Auto-select first store when stores are loaded
  useEffect(() => {
    if (stores.length > 0 && !selectedStore) {
      setSelectedStore(stores[0].id);
    }
  }, [stores, selectedStore]);

  const { data: dailySales = { transactions: 0, revenue: 0 } } = useQuery<{ transactions: number; revenue: number }>({
    queryKey: ["/api/analytics/overview", selectedStore, selectedPeriod],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStore) params.set('store_id', selectedStore);
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - parseInt(selectedPeriod));
      params.set('date_from', start.toISOString());
      params.set('date_to', end.toISOString());
      const r = await fetch(`/api/analytics/overview?${params.toString()}`);
      const j = await r.json();
      return { transactions: j.transactions || 0, revenue: parseFloat(j.gross || '0') };
    },
  });
  // Subscribe to realtime sales for current scope
  useRealtimeSales({ orgId: null, storeId: selectedStore || null });

  const storeId = selectedStore?.trim() || "";

  const { data: popularProducts = [] } = useQuery<Array<{ product: Product; salesCount: number }>>({
    queryKey: ["/api/stores", storeId, "analytics/popular-products"],
    enabled: Boolean(storeId),
  });

  const { data: profitLoss = { revenue: 0, cost: 0, profit: 0 } } = useQuery<{ revenue: number; cost: number; profit: number }>({
    queryKey: ["/api/stores", storeId, "analytics/profit-loss"],
    enabled: Boolean(storeId),
    queryFn: () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      return fetch(`/api/stores/${storeId}/analytics/profit-loss?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`, {
        credentials: "include",
      }).then(res => res.json());
    },
  });

  const { data: alerts = [] } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", storeId, "alerts"],
    enabled: Boolean(storeId),
  });

  const { data: inventoryValue = { totalValue: 0, itemCount: 0 } } = useQuery<{ totalValue: number; itemCount: number }>({
    queryKey: ["/api/stores", storeId, "analytics/inventory-value"],
    enabled: Boolean(storeId),
  });

  const { data: customerInsights = { totalCustomers: 0, newCustomers: 0, repeatCustomers: 0 } } = useQuery<{
    totalCustomers: number;
    newCustomers: number;
    repeatCustomers: number;
  }>({
    queryKey: ["/api/stores", storeId, "analytics/customer-insights"],
    enabled: Boolean(storeId),
  });

  const profitMargin = profitLoss.revenue > 0 ? (profitLoss.profit / profitLoss.revenue) * 100 : 0;

  return (
    <div className="space-y-6">

        <div className="space-y-6">
          {/* Period Selector and Export Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-full sm:w-40 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="90">Last 90 Days</SelectItem>
                  <SelectItem value="365">Last Year</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-gray-600">Analytics Period</span>
            </div>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <Button variant="outline" size="sm" className="min-h-[36px]" onClick={() => {
                const params = new URLSearchParams();
                params.set('interval', 'day');
                params.set('date_from', new Date(Date.now() - parseInt(selectedPeriod) * 24 * 60 * 60 * 1000).toISOString());
                params.set('date_to', new Date().toISOString());
                if (selectedStore) params.set('store_id', selectedStore);
                window.open(`/api/analytics/export.pdf?${params.toString()}`, '_blank');
              }}>
                <Calendar className="w-4 h-4 mr-2" />
                Export Report
              </Button>
              <Button variant="outline" size="sm" className="min-h-[36px]">
                <Zap className="w-4 h-4 mr-2" />
                Generate Insights
              </Button>
            </div>
          </div>

          {/* Key Performance Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today&apos;s Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(dailySales.revenue)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dailySales.transactions} transactions
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(profitLoss.profit)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {profitMargin.toFixed(1)}% margin
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(inventoryValue.totalValue)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {inventoryValue.itemCount} items
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {customerInsights.totalCustomers}
                </div>
                <p className="text-xs text-muted-foreground">
                  {customerInsights.newCustomers} new this month
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Analytics Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="sales">Sales Analytics</TabsTrigger>
              
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Sales Chart */}
              <Suspense fallback={<ChartSkeleton />}>
                <SalesChart storeId={selectedStore} className="w-full" />
              </Suspense>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Popular Products */}
            <Card>
              <CardHeader>
                <CardTitle>Popular Products</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {popularProducts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No sales data available</p>
                    </div>
                  ) : (
                    popularProducts.map((item: any, index: number) => (
                      <div key={item.product.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center">
                            {index + 1}
                          </Badge>
                          <div>
                            <p className="font-medium">{item.product.name}</p>
                            <p className="text-sm text-gray-500">
                              {formatCurrency(parseFloat(item.product.price))} each
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{item.salesCount} sold</p>
                          <p className="text-sm text-gray-500">
                            {formatCurrency(item.salesCount * parseFloat(item.product.price))}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Profit/Loss Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Profit & Loss Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Revenue</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(profitLoss.revenue)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Costs</span>
                    <span className="font-medium text-red-600">
                      {formatCurrency(profitLoss.cost)}
                    </span>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Net Profit</span>
                      <span className={`text-lg font-bold ${profitLoss.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(profitLoss.profit)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-gray-600">Profit Margin</span>
                      <span className={`text-sm font-medium ${profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {profitMargin.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Customer Insights */}
          <Card>
            <CardHeader>
              <CardTitle>Customer Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">
                    {customerInsights.totalCustomers}
                  </div>
                  <p className="text-sm text-gray-600">Total Customers</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">
                    {customerInsights.newCustomers}
                  </div>
                  <p className="text-sm text-gray-600">New This Month</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600 mb-2">
                    {customerInsights.repeatCustomers}
                  </div>
                  <p className="text-sm text-gray-600">Repeat Customers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Insights */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">
                    {formatCurrency(dailySales.revenue / Math.max(dailySales.transactions, 1))}
                  </div>
                  <p className="text-sm text-gray-600">Average Transaction Value</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600 mb-2">
                    {popularProducts.length > 0 ? popularProducts[0]?.salesCount || 0 : 0}
                  </div>
                  <p className="text-sm text-gray-600">Top Product Sales</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600 mb-2">
                    {alerts.length}
                  </div>
                  <p className="text-sm text-gray-600">Active Alerts</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">
                    {formatCurrency(inventoryValue.totalValue)}
                  </div>
                  <p className="text-sm text-gray-600">Inventory Value</p>
                </div>
              </div>
            </CardContent>
          </Card>


            </TabsContent>

            <TabsContent value="sales" className="space-y-6">
              <Suspense fallback={<ChartSkeleton />}>
                <SalesChart storeId={selectedStore} className="w-full" />
              </Suspense>
            </TabsContent>

            
          </Tabs>
        </div>
      </div>
    );
}
