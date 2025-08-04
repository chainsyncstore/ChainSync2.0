import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, AlertTriangle, Search } from "lucide-react";
import { formatCurrency } from "@/lib/pos-utils";
import type { Store, Inventory, Product, LowStockAlert } from "@shared/schema";

export default function Inventory() {
  const { user, logout } = useAuth();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

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

  const { data: inventory = [] } = useQuery<Inventory[]>({
    queryKey: ["/api/stores", selectedStore, "inventory"],
  });

  const { data: alerts = [] } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", selectedStore, "alerts"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const inventoryWithProducts = inventory.map((inv: any) => {
    const product = products.find((p: any) => p.id === inv.productId);
    return { ...inv, product };
  }).filter((item: any) => item.product);

  const filteredInventory = inventoryWithProducts.filter((item: any) =>
    item.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.product.barcode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const lowStockItems = filteredInventory.filter((item: any) => 
    item.quantity <= item.minStockLevel
  );

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
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          title="Inventory Management"
          subtitle="Monitor stock levels and manage inventory"
          currentDateTime={currentDateTime}
          onLogout={logout}
        />
        
        <main className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
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
                    {formatCurrency(
                      filteredInventory.reduce((sum: number, item: any) => 
                        sum + (item.quantity * parseFloat(item.product.price)), 0
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {filteredInventory.filter((item: any) => item.quantity === 0).length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search and Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Inventory Search</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex space-x-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by product name or barcode..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button variant="outline">
                    Export Inventory
                  </Button>
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
                        <th className="text-left p-4 font-medium">Product</th>
                        <th className="text-left p-4 font-medium">SKU</th>
                        <th className="text-right p-4 font-medium">Current Stock</th>
                        <th className="text-right p-4 font-medium">Min Level</th>
                        <th className="text-right p-4 font-medium">Max Level</th>
                        <th className="text-right p-4 font-medium">Value</th>
                        <th className="text-center p-4 font-medium">Status</th>
                        <th className="text-center p-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventory.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-8 text-gray-500">
                            <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No inventory items found</p>
                          </td>
                        </tr>
                      ) : (
                        filteredInventory.map((item: any) => {
                          const stockStatus = item.quantity === 0 ? "out" : 
                                            item.quantity <= item.minStockLevel ? "low" : "good";
                          
                          return (
                            <tr key={item.id} className="border-b hover:bg-gray-50">
                              <td className="p-4">
                                <div>
                                  <p className="font-medium">{item.product.name}</p>
                                  <p className="text-sm text-gray-500">{item.product.category}</p>
                                </div>
                              </td>
                              <td className="p-4 font-mono text-sm">{item.product.barcode}</td>
                              <td className="p-4 text-right font-medium">{item.quantity}</td>
                              <td className="p-4 text-right">{item.minStockLevel}</td>
                              <td className="p-4 text-right">{item.maxStockLevel}</td>
                              <td className="p-4 text-right">
                                {formatCurrency(item.quantity * parseFloat(item.product.price))}
                              </td>
                              <td className="p-4 text-center">
                                <Badge 
                                  variant={stockStatus === "out" ? "destructive" : 
                                          stockStatus === "low" ? "secondary" : "default"}
                                >
                                  {stockStatus === "out" ? "Out of Stock" :
                                   stockStatus === "low" ? "Low Stock" : "In Stock"}
                                </Badge>
                              </td>
                              <td className="p-4 text-center">
                                <Button size="sm" variant="outline">
                                  Adjust Stock
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
