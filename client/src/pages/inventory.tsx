import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import StockAdjustment from "@/components/inventory/stock-adjustment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Package, AlertTriangle, Search, Filter, Edit, Trash2, Eye } from "lucide-react";
import { formatCurrency } from "@/lib/pos-utils";
import type { Store, Inventory, Product, LowStockAlert } from "@shared/schema";

export default function Inventory() {
  const { user, logout } = useAuth();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isBulkActionsOpen, setIsBulkActionsOpen] = useState(false);

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

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["/api/products/categories"],
  });

  const { data: brands = [] } = useQuery<string[]>({
    queryKey: ["/api/products/brands"],
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

  // Apply filters
  let filteredInventory = inventoryWithProducts.filter((item: any) => {
    const matchesSearch = item.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.product.barcode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || !selectedCategory || item.product.category === selectedCategory;
    const matchesBrand = selectedBrand === "all" || !selectedBrand || item.product.brand === selectedBrand;
    
    let matchesStock = true;
    switch (stockFilter) {
      case "low":
        matchesStock = item.quantity <= item.minStockLevel;
        break;
      case "out":
        matchesStock = item.quantity === 0;
        break;
      case "overstocked":
        matchesStock = item.quantity > item.maxStockLevel;
        break;
    }
    
    return matchesSearch && matchesCategory && matchesBrand && matchesStock;
  });

  const lowStockItems = filteredInventory.filter((item: any) => 
    item.quantity <= item.minStockLevel
  );

  const outOfStockItems = filteredInventory.filter((item: any) => 
    item.quantity === 0
  );

  const overstockedItems = filteredInventory.filter((item: any) => 
    item.quantity > item.maxStockLevel
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(filteredInventory.map((item: any) => item.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    if (checked) {
      setSelectedItems(prev => [...prev, itemId]);
    } else {
      setSelectedItems(prev => prev.filter(id => id !== itemId));
    }
  };

  const handleBulkUpdate = () => {
    // In real app, this would open a bulk update modal
    console.log("Bulk updating selected items:", selectedItems);
    setIsBulkActionsOpen(false);
  };

  const getStockStatus = (item: any) => {
    if (item.quantity === 0) return { status: "out", color: "destructive", text: "Out of Stock" };
    if (item.quantity <= item.minStockLevel) return { status: "low", color: "secondary", text: "Low Stock" };
    if (item.quantity > item.maxStockLevel) return { status: "over", color: "outline", text: "Overstocked" };
    return { status: "good", color: "default", text: "In Stock" };
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar
        title="Inventory Management"
        subtitle="Monitor stock levels and manage inventory"
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
                <div className="text-2xl font-bold text-red-600">{outOfStockItems.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Actions Bar */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Inventory Management</CardTitle>
                <div className="flex items-center space-x-2">
                  {selectedItems.length > 0 && (
                    <Dialog open={isBulkActionsOpen} onOpenChange={setIsBulkActionsOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline">
                          Bulk Actions ({selectedItems.length})
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Bulk Actions</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <Button onClick={handleBulkUpdate} variant="outline" className="w-full">
                            <Edit className="w-4 h-4 mr-2" />
                            Update Selected
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <Select value={selectedCategory || undefined} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                      <th className="text-left p-4 font-medium">
                        <Checkbox 
                          checked={selectedItems.length === filteredInventory.length && filteredInventory.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
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
                        <td colSpan={9} className="text-center py-8 text-gray-500">
                          <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                          <p>No inventory items found</p>
                        </td>
                      </tr>
                    ) : (
                      filteredInventory.map((item: any) => {
                        const stockStatus = getStockStatus(item);
                        
                        return (
                          <tr key={item.id} className="border-b hover:bg-gray-50">
                            <td className="p-4">
                              <Checkbox 
                                checked={selectedItems.includes(item.id)}
                                onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                              />
                            </td>
                            <td className="p-4">
                              <div>
                                <p className="font-medium">{item.product.name}</p>
                                <p className="text-sm text-gray-500">{item.product.category}</p>
                                {item.product.brand && (
                                  <p className="text-xs text-gray-400">{item.product.brand}</p>
                                )}
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
                              <Badge variant={stockStatus.color as any}>
                                {stockStatus.text}
                              </Badge>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center space-x-1">
                                <StockAdjustment 
                                  inventory={item} 
                                  product={item.product}
                                />
                                <Button size="sm" variant="ghost">
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-600">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
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
  );
}
