import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, AlertTriangle, Search, Filter, Edit, Eye, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/pos-utils";
import type { Store, Inventory as InventoryEntry, Product, LowStockAlert } from "@shared/schema";

type InventoryWithProduct = InventoryEntry & {
  product: Product | null;
  formattedPrice: number;
  storeCurrency: string;
};

type InventoryApiResponse = {
  currency: string;
  totalValue: number;
  totalProducts: number;
  items: InventoryWithProduct[];
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
type StockStatus = {
  status: "out" | "low" | "over" | "good";
  color: BadgeVariant;
  text: string;
};

export default function Inventory() {
  const { user } = useAuth();
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isBulkActionsOpen, setIsBulkActionsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryWithProduct | null>(null);
  const [editQuantity, setEditQuantity] = useState<string>("");
  const [editMinStock, setEditMinStock] = useState<string>("");
  const [editMaxStock, setEditMaxStock] = useState<string>("");
  const [deleteNotes, setDeleteNotes] = useState<string>("");
  const [isDeleteMode, setIsDeleteMode] = useState(false);

  const userRole = (user?.role ?? (user?.isAdmin ? "admin" : undefined))?.toString().toLowerCase();
  const isAdmin = userRole === "admin";
  const isManager = userRole === "manager";
  const managerStoreId = isManager ? (user?.storeId ?? "") : "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
    enabled: isAdmin,
  });

  // Auto-select store for admins when list loads
  useEffect(() => {
    if (isAdmin && stores.length > 0 && !selectedStore) {
      setSelectedStore(stores[0].id);
    }
  }, [isAdmin, stores, selectedStore]);

  // Force manager to assigned store
  useEffect(() => {
    if (isManager && managerStoreId && selectedStore !== managerStoreId) {
      setSelectedStore(managerStoreId);
    }
  }, [isManager, managerStoreId, selectedStore]);

  const storeId = selectedStore?.trim() || "";

  const { data: inventoryData } = useQuery<InventoryApiResponse>({
    queryKey: ["/api/stores", storeId, "inventory"],
    enabled: Boolean(storeId),
  });

  const { data: alerts = [] } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", storeId, "alerts"],
    enabled: Boolean(storeId),
  });

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["/api/products/categories"],
  });

  const { data: brands = [] } = useQuery<string[]>({
    queryKey: ["/api/products/brands"],
  });

  const inventoryItems = useMemo<InventoryWithProduct[]>(
    () => inventoryData?.items ?? [],
    [inventoryData]
  );

  const currency = useMemo(
    () => inventoryData?.currency ?? inventoryItems[0]?.storeCurrency ?? "USD",
    [inventoryData, inventoryItems]
  );

  const filteredInventory = useMemo<InventoryWithProduct[]>(() => {
    return inventoryItems.filter((item) => {
      const name = item.product?.name?.toLowerCase() ?? "";
      const barcode = item.product?.barcode?.toLowerCase() ?? "";
      const query = searchQuery.toLowerCase();
      const matchesSearch = name.includes(query) || barcode.includes(query);
      const matchesCategory = selectedCategory === "all" || !selectedCategory || item.product?.category === selectedCategory;
      const matchesBrand = selectedBrand === "all" || !selectedBrand || item.product?.brand === selectedBrand;

      let matchesStock = true;
      switch (stockFilter) {
        case "low":
          matchesStock = item.quantity <= (item.minStockLevel ?? 0);
          break;
        case "out":
          matchesStock = item.quantity === 0;
          break;
        case "overstocked":
          matchesStock = item.quantity > (item.maxStockLevel ?? Number.MAX_SAFE_INTEGER);
          break;
        default:
          matchesStock = true;
      }

      return matchesSearch && matchesCategory && matchesBrand && matchesStock;
    });
  }, [inventoryItems, searchQuery, selectedCategory, selectedBrand, stockFilter]);

  const lowStockItems = useMemo(
    () => filteredInventory.filter((item) => item.quantity <= (item.minStockLevel ?? 0)),
    [filteredInventory],
  );

  const outOfStockItems = useMemo(
    () => filteredInventory.filter((item) => item.quantity === 0),
    [filteredInventory],
  );

  const overstockedItems = useMemo(
    () => filteredInventory.filter((item) => item.quantity > (item.maxStockLevel ?? Number.MAX_SAFE_INTEGER)),
    [filteredInventory],
  );

  const totalStockValue = useMemo(
    () => filteredInventory.reduce((sum, item) => {
      const unitPrice = item.product?.price ? parseFloat(String(item.product.price)) : item.formattedPrice ?? 0;
      return sum + item.quantity * unitPrice;
    }, 0),
    [filteredInventory],
  );

  const canEditInventory = useMemo(
    () => (isAdmin && Boolean(storeId)) || (isManager && storeId === managerStoreId && Boolean(storeId)),
    [isAdmin, isManager, storeId, managerStoreId],
  );

  const resetEditState = () => {
    setEditingItem(null);
    setEditQuantity("");
    setEditMinStock("");
    setEditMaxStock("");
    setDeleteNotes("");
    setIsDeleteMode(false);
  };

  const openEditModal = (item: InventoryWithProduct) => {
    setEditingItem(item);
    setEditQuantity(String(item.quantity ?? ""));
    setEditMinStock(item.minStockLevel != null ? String(item.minStockLevel) : "");
    setEditMaxStock(item.maxStockLevel != null ? String(item.maxStockLevel) : "");
    setDeleteNotes("");
    setIsDeleteMode(false);
  };

  const updateInventoryMutation = useMutation({
    mutationFn: async (payload: { productId: string; storeId: string; quantity: number; minStockLevel: number; maxStockLevel?: number | null }) => {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to update inventory" }));
        throw new Error(error.error ?? "Failed to update inventory");
      }

      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "inventory"] });
      toast({
        title: "Inventory updated",
        description: "The inventory item was successfully updated.",
      });
      resetEditState();
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteInventoryMutation = useMutation({
    mutationFn: async (payload: { productId: string; storeId: string; reason?: string }) => {
      const response = await fetch(`/api/inventory/${payload.productId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ storeId: payload.storeId, reason: payload.reason ?? undefined }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to delete inventory" }));
        throw new Error(error.error ?? "Failed to delete inventory");
      }

      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "inventory"] });
      toast({
        title: "Inventory removed",
        description: "The inventory item was removed from the store.",
      });
      resetEditState();
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingItem) return;

    if (!canEditInventory || !storeId) {
      toast({ title: "Store not selected", description: "Select a store you are allowed to manage before editing inventory.", variant: "destructive" });
      return;
    }

    const quantity = Number(editQuantity);
    const minStock = Number(editMinStock || 0);
    const maxStock = editMaxStock ? Number(editMaxStock) : undefined;

    if (Number.isNaN(quantity) || quantity < 0) {
      toast({ title: "Invalid quantity", description: "Quantity must be a non-negative number.", variant: "destructive" });
      return;
    }

    if (Number.isNaN(minStock) || minStock < 0) {
      toast({ title: "Invalid minimum stock", description: "Minimum stock must be zero or higher.", variant: "destructive" });
      return;
    }

    if (maxStock != null && (Number.isNaN(maxStock) || maxStock < minStock)) {
      toast({ title: "Invalid maximum stock", description: "Maximum stock must be higher than minimum stock.", variant: "destructive" });
      return;
    }

    void updateInventoryMutation.mutateAsync({
      productId: editingItem.productId,
      storeId,
      quantity,
      minStockLevel: minStock,
      maxStockLevel: maxStock,
    });
  };

  const handleDeleteInventory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingItem) return;
    if (!deleteNotes.trim()) {
      toast({ title: "Reason required", description: "Provide a short reason for deleting this inventory record.", variant: "destructive" });
      return;
    }

    if (!canEditInventory || !storeId) {
      toast({ title: "Store not selected", description: "Select a store you are allowed to manage before deleting inventory.", variant: "destructive" });
      return;
    }

    void deleteInventoryMutation.mutateAsync({
      productId: editingItem.productId,
      storeId,
      reason: deleteNotes.trim(),
    });
  };

  const inventoryActionDisabled = !canEditInventory;

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
    if (item.quantity <= (item.minStockLevel ?? 0)) return { status: "low", color: "secondary", text: "Low Stock" };
    if (item.quantity > (item.maxStockLevel ?? Number.MAX_SAFE_INTEGER)) return { status: "over", color: "outline", text: "Overstocked" };
    return { status: "good", color: "default", text: "In Stock" };
  };

  const shouldShowStoreSelector = isAdmin;
  const hasSelectedStore = Boolean(storeId);

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            {isManager ? (
              <p className="text-sm text-slate-600">Inventory for your assigned store</p>
            ) : null}
          </div>
          {shouldShowStoreSelector ? (
            <div className="w-full sm:w-64">
              <Select
                value={selectedStore || undefined}
                onValueChange={setSelectedStore}
                disabled={stores.length === 0}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select a store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {shouldShowStoreSelector && !hasSelectedStore ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-600">
              Select a store to view inventory details.
            </CardContent>
          </Card>
        ) : null}

        {hasSelectedStore ? (
          <div>
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
                    {formatCurrency(totalStockValue, currency as "USD" | "NGN")}
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
                              <td colSpan={9} className="p-6 text-center text-slate-500">
                                No inventory items match your filters.
                              </td>
                            </tr>
                          ) : (
                            filteredInventory.map((item: InventoryWithProduct) => (
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
                                      <p className="font-medium text-slate-800 text-sm sm:text-base">{item.product?.name ?? "Unknown Product"}</p>
                                      <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">{item.product?.barcode ?? ""}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3 sm:p-4 hidden sm:table-cell">
                                  <span className="text-sm text-slate-600">{item.product?.barcode ?? ""}</span>
                                </td>
                                <td className="p-3 sm:p-4 text-right">
                                  <span className="font-medium text-slate-800">{item.quantity}</span>
                                </td>
                                <td className="p-3 sm:p-4 text-right hidden lg:table-cell">
                                  <span className="text-sm text-slate-600">{item.minStockLevel ?? "-"}</span>
                                </td>
                                <td className="p-3 sm:p-4 text-right hidden lg:table-cell">
                                  <span className="text-sm text-slate-600">{item.maxStockLevel ?? "-"}</span>
                                </td>
                                <td className="p-3 sm:p-4 text-right hidden md:table-cell">
                                  <span className="font-medium text-slate-800">
                                    {formatCurrency(
                                      item.quantity * (item.product?.price ? parseFloat(String(item.product.price)) : item.formattedPrice ?? 0),
                                      currency as "USD" | "NGN"
                                    )}
                                  </span>
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
                                    <Button size="sm" variant="ghost" className="w-8 h-8 p-0 min-h-[32px]" disabled>
                                      <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="w-8 h-8 p-0 min-h-[32px]"
                                      disabled={inventoryActionDisabled}
                                      onClick={() => openEditModal(item)}
                                    >
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
        ) : null}
      </div>

      <Dialog open={Boolean(editingItem)} onOpenChange={(open) => {
        if (!open) {
          resetEditState();
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isDeleteMode ? "Delete Inventory Item" : "Edit Inventory"}</DialogTitle>
            <DialogDescription>
              {isDeleteMode
                ? "Deleting this inventory record removes stock tracking for the product in this store."
                : `Update stock levels for ${editingItem?.product?.name ?? "the selected product"}.`}
            </DialogDescription>
          </DialogHeader>

          {!isDeleteMode ? (
            <form className="space-y-4" onSubmit={handleSubmitEdit}>
              <div>
                <Label htmlFor="quantity">Quantity on hand</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={0}
                  value={editQuantity}
                  onChange={(event) => setEditQuantity(event.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="min-stock">Minimum stock level</Label>
                  <Input
                    id="min-stock"
                    type="number"
                    min={0}
                    value={editMinStock}
                    onChange={(event) => setEditMinStock(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="max-stock">Maximum stock level</Label>
                  <Input
                    id="max-stock"
                    type="number"
                    min={0}
                    value={editMaxStock}
                    onChange={(event) => setEditMaxStock(event.target.value)}
                  />
                </div>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsDeleteMode(true)} className="text-red-600 hover:text-red-700">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete inventory record
                </Button>
                <div className="flex w-full sm:w-auto gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={resetEditState}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateInventoryMutation.isPending || deleteInventoryMutation.isPending}
                  >
                    {updateInventoryMutation.isPending ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleDeleteInventory}>
              <div>
                <Label htmlFor="delete-notes">Reason for deletion</Label>
                <Textarea
                  id="delete-notes"
                  placeholder="Explain why this inventory record is being removed."
                  value={deleteNotes}
                  onChange={(event) => setDeleteNotes(event.target.value)}
                  required
                />
              </div>

              <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsDeleteMode(false)}>
                  Back to edit
                </Button>
                <div className="flex w-full sm:w-auto gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={resetEditState}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={deleteInventoryMutation.isPending || updateInventoryMutation.isPending}
                  >
                    {deleteInventoryMutation.isPending ? "Deleting..." : "Confirm delete"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
