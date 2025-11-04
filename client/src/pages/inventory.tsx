import { useQuery } from "@tanstack/react-query";
import { Package, AlertTriangle, Search, Filter, Edit, Eye } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/pos-utils";
import type { Store, Inventory as InventoryEntry, Product, LowStockAlert } from "@shared/schema";

type InventoryWithProduct = InventoryEntry & { product: Product };
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
type StockStatus = {
  status: "out" | "low" | "over" | "good";
  color: BadgeVariant;
  text: string;
};

export default function Inventory() {
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isBulkActionsOpen, setIsBulkActionsOpen] = useState(false);

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  // Auto-select first store when stores are loaded
  useEffect(() => {
    if (stores.length > 0 && !selectedStore) {
      setSelectedStore(stores[0].id);
    }
  }, [stores, selectedStore]);

  const storeId = selectedStore?.trim() || "";

  const { data: inventory = [] } = useQuery<InventoryEntry[]>({
    queryKey: ["/api/stores", storeId, "inventory"],
    enabled: Boolean(storeId),
  });

  const { data: alerts = [] } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", storeId, "alerts"],
    enabled: Boolean(storeId),
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
  const inventoryWithProducts = useMemo<InventoryWithProduct[]>(() => (
    inventory
      .map((inv) => {
        const product = products.find((p: Product) => p.id === inv.productId);
        return product ? { ...inv, product } : null;
      })
      .filter((item): item is InventoryWithProduct => Boolean(item))
  ), [inventory, products]);

  const filteredInventory = useMemo<InventoryWithProduct[]>(() => {
    return inventoryWithProducts.filter((item) => {
      const matchesSearch = item.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.product.barcode?.toLowerCase().includes(searchQuery.toLowerCase());
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
        default:
          matchesStock = true;
      }

      return matchesSearch && matchesCategory && matchesBrand && matchesStock;
    });
  }, [inventoryWithProducts, searchQuery, selectedCategory, selectedBrand, stockFilter]);

  const lowStockItems = useMemo(
    () => filteredInventory.filter((item) => item.quantity <= item.minStockLevel),
    [filteredInventory],
  );

  const outOfStockItems = useMemo(
    () => filteredInventory.filter((item) => item.quantity === 0),
    [filteredInventory],
  );

  const overstockedItems = useMemo(
    () => filteredInventory.filter((item) => item.quantity > item.maxStockLevel),
    [filteredInventory],
  );

  const totalStockValue = useMemo(
    () => filteredInventory.reduce((sum, item) => sum + item.quantity * parseFloat(item.product.price), 0),
    [filteredInventory],
  );

  const handleSelectAll = (checked: boolean | "indeterminate") => {
    if (checked) {
      setSelectedItems(filteredInventory.map((item) => item.id));
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

  const getStockStatus = (item: InventoryWithProduct): StockStatus => {
    if (item.quantity === 0) return { status: "out", color: "destructive", text: "Out of Stock" };
    if (item.quantity <= item.minStockLevel) return { status: "low", color: "secondary", text: "Low Stock" };
    if (item.quantity > item.maxStockLevel) return { status: "over", color: "outline", text: "Overstocked" };
    return { status: "good", color: "default", text: "In Stock" };
  };

  return (
    <div className="space-y-6">
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
                  {formatCurrency(totalStockValue)}
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

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overstocked Items</CardTitle>
                <Package className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{overstockedItems.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{alerts.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Actions Bar */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
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
              {/* Filters */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Filter className="w-5 h-5" />
                    <span>Filters</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search products..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                    
                    <Select value={selectedCategory || undefined} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="h-10">
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
                      <SelectTrigger className="h-10">
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
                      <SelectTrigger className="h-10">
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
                          <th className="text-left p-3 sm:p-4 font-medium">
                            <Checkbox 
                              checked={selectedItems.length === filteredInventory.length && filteredInventory.length > 0}
                              onCheckedChange={handleSelectAll}
                            />
                          </th>
                          <th className="text-left p-3 sm:p-4 font-medium">Product</th>
                          <th className="text-left p-3 sm:p-4 font-medium hidden sm:table-cell">SKU</th>
                          <th className="text-right p-3 sm:p-4 font-medium">Current Stock</th>
                          <th className="text-right p-3 sm:p-4 font-medium hidden lg:table-cell">Min Level</th>
                          <th className="text-right p-3 sm:p-4 font-medium hidden lg:table-cell">Max Level</th>
                          <th className="text-right p-3 sm:p-4 font-medium hidden md:table-cell">Value</th>
                          <th className="text-center p-3 sm:p-4 font-medium">Status</th>
                          <th className="text-center p-3 sm:p-4 font-medium">Actions</th>
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
                          filteredInventory.map((item: any) => (
                            <tr key={item.id} className="border-b hover:bg-slate-50">
                              <td className="p-3 sm:p-4">
                                <Checkbox 
                                  checked={selectedItems.includes(item.id)}
                                  onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                                />
                              </td>
                              <td className="p-3 sm:p-4">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                                    <Package className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-800 text-sm sm:text-base">{item.product.name}</p>
                                    <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">{item.product.barcode}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 sm:p-4 hidden sm:table-cell">
                                <span className="text-sm text-slate-600">{item.product.barcode}</span>
                              </td>
                              <td className="p-3 sm:p-4 text-right">
                                <span className="font-medium text-slate-800">{item.quantity}</span>
                              </td>
                              <td className="p-3 sm:p-4 text-right hidden lg:table-cell">
                                <span className="text-sm text-slate-600">{item.minStockLevel}</span>
                              </td>
                              <td className="p-3 sm:p-4 text-right hidden lg:table-cell">
                                <span className="text-sm text-slate-600">{item.maxStockLevel}</span>
                              </td>
                              <td className="p-3 sm:p-4 text-right hidden md:table-cell">
                                <span className="font-medium text-slate-800">{formatCurrency(item.quantity * parseFloat(item.product.price))}</span>
                              </td>
                              <td className="p-3 sm:p-4 text-center">
                                {(() => {
                                  const status = getStockStatus(item);
                                  return (
                                    <Badge variant={status.color} className="capitalize">
                                      {status.text}
                                    </Badge>
                                  );
                                })()}
                              </td>
                              <td className="p-3 sm:p-4 text-center">
                                <div className="flex items-center justify-center space-x-1 sm:space-x-2">
                                  <Button size="sm" variant="ghost" className="w-8 h-8 p-0 min-h-[32px]">
                                    <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="w-8 h-8 p-0 min-h-[32px]">
                                    <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </div>
      </div>
    );
}
