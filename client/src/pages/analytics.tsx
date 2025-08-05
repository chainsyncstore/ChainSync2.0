import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import SalesChart from "@/components/analytics/sales-chart";
import DemandForecast from "@/components/analytics/demand-forecast";
import AiInsights from "@/components/analytics/ai-insights";
import ForecastChat from "@/components/ai/forecast-chat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, Users, BarChart3, PieChart, Download, Calendar, Brain, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/pos-utils";
import type { Store, LowStockAlert, Product } from "@shared/schema";

export default function Analytics() {
  const { user, logout } = useAuth();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState("30");

  const userData = {
    role: user?.role || "manager",
    name: `${user?.firstName || "User"} ${user?.lastName || ""}`.trim(),
    initials: `${user?.firstName?.[0] || "U"}${user?.lastName?.[0] || ""}`,
  };

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
    queryKey: ["/api/stores", selectedStore, "analytics/daily-sales"],
  });

  const { data: popularProducts = [] } = useQuery<Array<{ product: Product; salesCount: number }>>({
    queryKey: ["/api/stores", selectedStore, "analytics/popular-products"],
  });

  const { data: profitLoss = { revenue: 0, cost: 0, profit: 0 } } = useQuery<{ revenue: number; cost: number; profit: number }>({
    queryKey: ["/api/stores", selectedStore, "analytics/profit-loss"],
    queryFn: () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30); // Last 30 days
      
      return fetch(`/api/stores/${selectedStore}/analytics/profit-loss?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`)
        .then(res => res.json());
    },
  });

  const { data: alerts = [] } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", selectedStore, "alerts"],
  });

  const { data: inventoryValue = { totalValue: 0, itemCount: 0 } } = useQuery<{ totalValue: number; itemCount: number }>({
    queryKey: ["/api/stores", selectedStore, "analytics/inventory-value"],
  });

  const { data: customerInsights = { totalCustomers: 0, newCustomers: 0, repeatCustomers: 0 } } = useQuery<{
    totalCustomers: number;
    newCustomers: number;
    repeatCustomers: number;
  }>({
    queryKey: ["/api/stores", selectedStore, "analytics/customer-insights"],
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const profitMargin = profitLoss.revenue > 0 ? (profitLoss.profit / profitLoss.revenue) * 100 : 0;

  const handleExportReport = (type: string) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(selectedPeriod));
    const endDate = new Date();
    
    const url = `/api/stores/${selectedStore}/reports/${type}?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&format=csv`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar
        title="Analytics Dashboard"
        subtitle="Track performance and insights across your stores"
        currentDateTime={currentDateTime}
        onLogout={logout}
        userRole={userData.role}
        userName={userData.name}
        userInitials={userData.initials}
        selectedStore={selectedStore}
        stores={stores}
        onStoreChange={setSelectedStore}
        alertCount={alerts.length}
      />
      
      <main className="p-4 md:p-6">
        <div className="space-y-6">
          {/* Period Selector and Export Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-40">
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
            
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={() => handleExportReport("sales")}>
                <Download className="w-4 h-4 mr-2" />
                Export Sales
              </Button>
              <Button variant="outline" onClick={() => handleExportReport("inventory")}>
                <Download className="w-4 h-4 mr-2" />
                Export Inventory
              </Button>
              <Button variant="outline" onClick={() => handleExportReport("customers")}>
                <Download className="w-4 h-4 mr-2" />
                Export Customers
              </Button>
            </div>
          </div>

          {/* Key Performance Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
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
              <TabsTrigger value="ai-forecast">AI Forecasting</TabsTrigger>
              <TabsTrigger value="ai-insights">AI Insights</TabsTrigger>
              <TabsTrigger value="ai-chat">AI Assistant</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Sales Chart */}
              <SalesChart storeId={selectedStore} className="w-full" />

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

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button variant="outline" className="h-20 flex-col space-y-2">
                  <BarChart3 className="w-6 h-6" />
                  <span className="text-sm">Detailed Reports</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col space-y-2">
                  <PieChart className="w-6 h-6" />
                  <span className="text-sm">Category Analysis</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col space-y-2">
                  <Users className="w-6 h-6" />
                  <span className="text-sm">Customer Analysis</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col space-y-2">
                  <Calendar className="w-6 h-6" />
                  <span className="text-sm">Schedule Reports</span>
                </Button>
              </div>
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="sales" className="space-y-6">
              <SalesChart storeId={selectedStore} className="w-full" />
            </TabsContent>

            <TabsContent value="ai-forecast" className="space-y-6">
              <DemandForecast storeId={selectedStore} />
            </TabsContent>

            <TabsContent value="ai-insights" className="space-y-6">
              <AiInsights storeId={selectedStore} />
            </TabsContent>

            <TabsContent value="ai-chat" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ForecastChat storeId={selectedStore} />
                <Card>
                  <CardHeader>
                    <CardTitle>AI Assistant Tips</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <h4 className="font-semibold text-blue-800">Demand Forecasting</h4>
                        <p className="text-sm text-blue-700">Ask: "What's the demand forecast for next month?"</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg">
                        <h4 className="font-semibold text-green-800">Inventory Management</h4>
                        <p className="text-sm text-green-700">Ask: "Show me low stock alerts"</p>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-lg">
                        <h4 className="font-semibold text-purple-800">Sales Trends</h4>
                        <p className="text-sm text-purple-700">Ask: "What are the current sales trends?"</p>
                      </div>
                      <div className="p-3 bg-orange-50 rounded-lg">
                        <h4 className="font-semibold text-orange-800">Reorder Recommendations</h4>
                        <p className="text-sm text-orange-700">Ask: "When should I reorder electronics?"</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
