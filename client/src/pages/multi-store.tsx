import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, TrendingUp, Users, Package, DollarSign, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/pos-utils";
import type { Store, LowStockAlert } from "@shared/schema";

export default function MultiStore() {
  const [selectedStore, setSelectedStore] = useState<string>("");

  const userData = {
    role: "admin",
    name: "John Doe",
    initials: "JD",
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

  const { data: alerts = [] } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", selectedStore, "alerts"],
  });



  // Mock data for multi-store analytics
  const storePerformance = [
    {
      id: "store1",
      name: "Main Street Store",
      status: "active",
      dailyRevenue: 2847,
      dailyTransactions: 127,
      monthlyRevenue: 45230,
      staff: 8,
      lowStockItems: 3,
      profitMargin: 23.5,
    },
    {
      id: "store2",
      name: "Downtown Branch",
      status: "active",
      dailyRevenue: 3156,
      dailyTransactions: 143,
      monthlyRevenue: 52340,
      staff: 12,
      lowStockItems: 1,
      profitMargin: 26.8,
    },
    {
      id: "store3",
      name: "Mall Location",
      status: "active",
      dailyRevenue: 4231,
      dailyTransactions: 189,
      monthlyRevenue: 68450,
      staff: 15,
      lowStockItems: 5,
      profitMargin: 28.2,
    },
  ];

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

  const averageProfitMargin = storePerformance.reduce((acc, store) => acc + store.profitMargin, 0) / storePerformance.length;

  return (
    <div className="space-y-6">
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
                  {storePerformance.map((store) => (
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
                        
                        <Button className="w-full mt-4" variant="outline">
                          View Details
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
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
