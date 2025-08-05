import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, ScanLine, Search, AlertTriangle, CheckCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Product, Inventory } from "@shared/schema";

interface ProductInputProps {
  selectedStore: string;
}

interface ProductFormData {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  price: string;
  cost: string;
  category: string;
  brand: string;
  quantity: string;
  minStockLevel: string;
  maxStockLevel: string;
}

export default function ProductInput({ selectedStore }: ProductInputProps) {
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    sku: "",
    barcode: "",
    description: "",
    price: "",
    cost: "",
    category: "",
    brand: "",
    quantity: "",
    minStockLevel: "10",
    maxStockLevel: "100",
  });
  const [existingProduct, setExistingProduct] = useState<Product | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const queryClient = useQueryClient();

  // Check if product exists by barcode
  const { data: existingProductData } = useQuery<Product | null>({
    queryKey: ["/api/products", "barcode", formData.barcode],
    enabled: !!formData.barcode && formData.barcode.length > 0,
    queryFn: async () => {
      if (!formData.barcode) return null;
      try {
        const response = await fetch(`/api/products/barcode/${formData.barcode}`);
        if (response.ok) {
          return response.json();
        }
        return null;
      } catch {
        return null;
      }
    },
  });

  // Check if product exists by name
  const { data: existingProductByName } = useQuery<Product | null>({
    queryKey: ["/api/products", "name", formData.name],
    enabled: !!formData.name && formData.name.length > 2 && !formData.barcode && !formData.sku,
    queryFn: async () => {
      if (!formData.name) return null;
      try {
        const response = await fetch(`/api/products/search?name=${encodeURIComponent(formData.name)}`);
        if (response.ok) {
          const products = await response.json();
          return products.length > 0 ? products[0] : null;
        }
        return null;
      } catch {
        return null;
      }
    },
  });

  // Check if product exists by SKU
  const { data: existingProductBySku } = useQuery<Product | null>({
    queryKey: ["/api/products", "sku", formData.sku],
    enabled: !!formData.sku && formData.sku.length > 0,
    queryFn: async () => {
      if (!formData.sku) return null;
      try {
        const response = await fetch(`/api/products/sku/${formData.sku}`);
        if (response.ok) {
          return response.json();
        }
        return null;
      } catch {
        return null;
      }
    },
  });

  // Get current inventory for existing product
  const { data: currentInventory } = useQuery<Inventory | null>({
    queryKey: ["/api/inventory", existingProduct?.id, selectedStore],
    enabled: !!existingProduct?.id && !!selectedStore,
    queryFn: async () => {
      try {
        const response = await fetch(`/api/inventory/${existingProduct?.id}/${selectedStore}`);
        if (response.ok) {
          return response.json();
        }
        return null;
      } catch {
        return null;
      }
    },
  });

  // Add/Update product mutation
  const addProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const productData = {
        name: data.name,
        sku: data.sku || undefined,
        barcode: data.barcode || undefined,
        description: data.description,
        price: parseFloat(data.price),
        cost: data.cost ? parseFloat(data.cost) : undefined,
        category: data.category,
        brand: data.brand,
      };

      const inventoryData = {
        productId: "", // Will be set after product creation
        storeId: selectedStore,
        quantity: parseInt(data.quantity),
        minStockLevel: parseInt(data.minStockLevel),
        maxStockLevel: parseInt(data.maxStockLevel),
      };

      if (existingProduct) {
        // Update existing product inventory
        const response = await fetch(`/api/inventory/${existingProduct.id}/${selectedStore}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: currentInventory ? currentInventory.quantity + parseInt(data.quantity) : parseInt(data.quantity),
            minStockLevel: parseInt(data.minStockLevel),
            maxStockLevel: parseInt(data.maxStockLevel),
          }),
        });
        return response.json();
      } else {
        // Create new product and inventory
        const productResponse = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productData),
        });
        const newProduct = await productResponse.json();
        
        inventoryData.productId = newProduct.id;
        const inventoryResponse = await fetch("/api/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inventoryData),
        });
        return inventoryResponse.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      resetForm();
    },
  });

  const handleBarcodeScan = (barcode: string) => {
    setFormData(prev => ({ ...prev, barcode }));
    setExistingProduct(null);
  };

  const handleNameSearch = (name: string) => {
    setFormData(prev => ({ ...prev, name }));
    setExistingProduct(null);
  };

  const handleSkuSearch = (sku: string) => {
    setFormData(prev => ({ ...prev, sku }));
    setExistingProduct(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.price || !formData.quantity) {
      return;
    }
    addProductMutation.mutate(formData);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      sku: "",
      barcode: "",
      description: "",
      price: "",
      cost: "",
      category: "",
      brand: "",
      quantity: "",
      minStockLevel: "10",
      maxStockLevel: "100",
    });
    setExistingProduct(null);
  };

  // Update existing product when barcode, SKU, or name search results change
  if (existingProductData && !existingProduct) {
    setExistingProduct(existingProductData);
  }
  if (existingProductBySku && !existingProduct && !formData.barcode) {
    setExistingProduct(existingProductBySku);
  }
  if (existingProductByName && !existingProduct && !formData.barcode && !formData.sku) {
    setExistingProduct(existingProductByName);
  }

  return (
    <div className="space-y-6">
      {/* Barcode Scanner Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5" />
            Scan Barcode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="barcode-input">Barcode</Label>
              <Input
                id="barcode-input"
                type="text"
                value={formData.barcode}
                onChange={(e) => handleBarcodeScan(e.target.value)}
                placeholder="Scan or enter barcode..."
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor="sku-input">SKU</Label>
              <Input
                id="sku-input"
                type="text"
                value={formData.sku}
                onChange={(e) => handleSkuSearch(e.target.value)}
                placeholder="Search by SKU..."
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor="name-input">Product Name</Label>
              <Input
                id="name-input"
                type="text"
                value={formData.name}
                onChange={(e) => handleNameSearch(e.target.value)}
                placeholder="Search by product name..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing Product Alert */}
      {existingProduct && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Product already exists:</strong> {existingProduct.name}
            {currentInventory && (
              <span className="block text-sm text-muted-foreground mt-1">
                Current stock: {currentInventory.quantity} units
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Product Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            {existingProduct ? "Add Stock to Existing Product" : "Add New Product"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter product name"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                  placeholder="Enter SKU"
                />
              </div>
              
              <div>
                <Label htmlFor="barcode">Barcode</Label>
                <Input
                  id="barcode"
                  value={formData.barcode}
                  onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                  placeholder="Enter barcode"
                />
              </div>
              
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price">Price *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="0.00"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="cost">Cost</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cost}
                  onChange={(e) => setFormData(prev => ({ ...prev, cost: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="electronics">Electronics</SelectItem>
                    <SelectItem value="clothing">Clothing</SelectItem>
                    <SelectItem value="food">Food & Beverages</SelectItem>
                    <SelectItem value="home">Home & Garden</SelectItem>
                    <SelectItem value="sports">Sports & Outdoors</SelectItem>
                    <SelectItem value="books">Books & Media</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => setFormData(prev => ({ ...prev, brand: e.target.value }))}
                  placeholder="Enter brand name"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter product description"
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity to Add *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                  placeholder="0"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="minStock">Min Stock Level</Label>
                <Input
                  id="minStock"
                  type="number"
                  min="0"
                  value={formData.minStockLevel}
                  onChange={(e) => setFormData(prev => ({ ...prev, minStockLevel: e.target.value }))}
                  placeholder="10"
                />
              </div>
              
              <div>
                <Label htmlFor="maxStock">Max Stock Level</Label>
                <Input
                  id="maxStock"
                  type="number"
                  min="0"
                  value={formData.maxStockLevel}
                  onChange={(e) => setFormData(prev => ({ ...prev, maxStockLevel: e.target.value }))}
                  placeholder="100"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-4">
              <Button type="button" variant="outline" onClick={resetForm}>
                Reset Form
              </Button>
              <Button 
                type="submit" 
                disabled={addProductMutation.isPending || !formData.name || !formData.price || !formData.quantity}
              >
                {addProductMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    {existingProduct ? "Add Stock" : "Add Product"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Success Message */}
      {addProductMutation.isSuccess && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            {existingProduct 
              ? `Successfully added ${formData.quantity} units to ${existingProduct.name}`
              : "Product added successfully!"
            }
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
} 