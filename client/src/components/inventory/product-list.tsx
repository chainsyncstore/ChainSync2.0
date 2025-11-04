import { Package, Search, Plus, Edit, Trash2, BarChart3 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/pos-utils";

interface Product {
  id: string;
  name: string;
  barcode: string;
  price: string;
  cost?: string;
  category?: string;
  brand?: string;
  isActive: boolean;
}

interface InventoryItem {
  id: string;
  productId: string;
  quantity: number;
  minStockLevel: number;
  maxStockLevel: number;
  product: Product;
}

/* eslint-disable no-unused-vars -- callback parameter names document the external API */
interface ProductListProps {
  inventory: InventoryItem[];
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onUpdateStock: (productId: string, quantity: number) => void;
  onAddProduct: () => void;
}
/* eslint-enable no-unused-vars */

export default function ProductList({
  inventory,
  onEditProduct,
  onDeleteProduct,
  onUpdateStock,
  onAddProduct,
}: ProductListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");

  // Get unique categories
  const categories = Array.from(
    new Set(
      inventory
        .map(item => item.product.category)
        .filter((category): category is string => typeof category === 'string')
    )
  );

  // Filter and sort inventory
  const filteredInventory = inventory
    .filter(item => {
      const matchesSearch = 
        item.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.product.barcode.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = 
        categoryFilter === "all" || item.product.category === categoryFilter;
      
      const matchesStock = 
        stockFilter === "all" ||
        (stockFilter === "low" && item.quantity <= item.minStockLevel) ||
        (stockFilter === "out" && item.quantity === 0) ||
        (stockFilter === "normal" && item.quantity > item.minStockLevel);
      
      return matchesSearch && matchesCategory && matchesStock;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.product.name.localeCompare(b.product.name);
        case "stock":
          return b.quantity - a.quantity;
        case "price":
          return parseFloat(b.product.price) - parseFloat(a.product.price);
        default:
          return 0;
      }
    });

  const getStockStatus = (item: InventoryItem) => {
    if (item.quantity === 0) return { status: "out", color: "destructive" as const };
    if (item.quantity <= item.minStockLevel) return { status: "low", color: "secondary" as const };
    return { status: "normal", color: "default" as const };
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Product Inventory</CardTitle>
          <Button onClick={onAddProduct}>
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products by name or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(category => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stockFilter} onValueChange={setStockFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Stock" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock</SelectItem>
              <SelectItem value="normal">In Stock</SelectItem>
              <SelectItem value="low">Low Stock</SelectItem>
              <SelectItem value="out">Out of Stock</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="stock">Stock Level</SelectItem>
              <SelectItem value="price">Price</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Product Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4 font-medium">Product</th>
                <th className="text-left p-4 font-medium">SKU</th>
                <th className="text-right p-4 font-medium">Price</th>
                <th className="text-right p-4 font-medium">Stock</th>
                <th className="text-right p-4 font-medium">Min/Max</th>
                <th className="text-center p-4 font-medium">Status</th>
                <th className="text-center p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium">No products found</p>
                    <p className="text-sm">Try adjusting your search or filters</p>
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => {
                  const stockStatus = getStockStatus(item);
                  
                  return (
                    <tr key={item.id} className="border-t hover:bg-gray-50">
                      <td className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <Package className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="font-medium">{item.product.name}</p>
                            {item.product.brand && (
                              <p className="text-sm text-gray-500">{item.product.brand}</p>
                            )}
                            {item.product.category && (
                              <Badge variant="outline" className="text-xs mt-1">
                                {item.product.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-sm">{item.product.barcode}</td>
                      <td className="p-4 text-right font-medium">
                        {formatCurrency(parseFloat(item.product.price))}
                        {item.product.cost && (
                          <p className="text-sm text-gray-500">
                            Cost: {formatCurrency(parseFloat(item.product.cost))}
                          </p>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <span className="font-medium">{item.quantity}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => {
                              const newQuantity = prompt(
                                `Current stock: ${item.quantity}\nEnter new quantity:`,
                                item.quantity.toString()
                              );
                              if (newQuantity && !isNaN(parseInt(newQuantity))) {
                                onUpdateStock(item.productId, parseInt(newQuantity));
                              }
                            }}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="p-4 text-right text-sm text-gray-500">
                        {item.minStockLevel} / {item.maxStockLevel}
                      </td>
                      <td className="p-4 text-center">
                        <Badge variant={stockStatus.color}>
                          {stockStatus.status === "out" && "Out of Stock"}
                          {stockStatus.status === "low" && "Low Stock"}
                          {stockStatus.status === "normal" && "In Stock"}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onEditProduct(item.product)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => onDeleteProduct(item.productId)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <BarChart3 className="w-4 h-4" />
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

        {/* Summary */}
        {filteredInventory.length > 0 && (
          <div className="flex justify-between items-center text-sm text-gray-600 pt-4 border-t">
            <span>Showing {filteredInventory.length} products</span>
            <span>
              Total value: {formatCurrency(
                filteredInventory.reduce(
                  (sum, item) => sum + (item.quantity * parseFloat(item.product.price)),
                  0
                )
              )}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
