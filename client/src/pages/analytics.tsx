import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package } from "lucide-react";
import { formatCurrency } from "@/lib/pos-utils";
import type { Store, LowStockAlert, Product } from "@shared/schema";

export default function Analytics() {
  const { user, logout } = useAuth();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [selectedStore, setSelectedStore] = useState<string>("");

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

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const profitMargin = profitLoss.revenue > 0 ? (profitLoss.profit / profitLoss.revenue) * 100 : 0;

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        userRole={userData.role}
        userName={userData.name}
        userInitials={userData.initials}
        selectedStore={selectedStore}
        stores={stores}
        onStoreChange={setSelectedStore}
        alertCount={alerts.length}
        onLogout={logout}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          title="Analytics Dashboard"
          subtitle="Track performance and insights across your stores"
          currentDateTime={currentDateTime}
          onLogout={() => {}}
        />
        
        <main className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
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
                  <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(profitLoss.revenue)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last 30 days
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Costs</CardTitle>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(profitLoss.cost)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cost of goods sold
                  </p>
                </CardContent>
              </Card>
            </div>

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

            {/* Performance Insights */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
