import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScanLine, AlertTriangle, CheckCircle, Package, Layers } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBarcodeInput } from "@/hooks/use-barcode-input";
import { getCsrfToken } from "@/lib/csrf";
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

const DEFAULT_FORM: ProductFormData = {
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
};

export default function ProductInput({ selectedStore }: ProductInputProps) {
  const [activeTab, setActiveTab] = useState<"existing" | "new">("existing");
  const [existingSearch, setExistingSearch] = useState({ barcode: "", sku: "", name: "" });
  const [existingQuantity, setExistingQuantity] = useState("1");
  const [newProductForm, setNewProductForm] = useState<ProductFormData>(DEFAULT_FORM);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [barcodeTarget, setBarcodeTarget] = useState<"existing" | "new">("existing");
  const queryClient = useQueryClient();

  const { data: productByBarcode } = useQuery<Product | null>({
    queryKey: ["/api/products", "barcode", existingSearch.barcode],
    enabled: Boolean(existingSearch.barcode),
    queryFn: async () => {
      if (!existingSearch.barcode) return null;
      try {
        const res = await fetch(`/api/products/barcode/${existingSearch.barcode}`);
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
  });

  const { data: productBySku } = useQuery<Product | null>({
    queryKey: ["/api/products", "sku", existingSearch.sku],
    enabled: Boolean(existingSearch.sku) && !existingSearch.barcode,
    queryFn: async () => {
      if (!existingSearch.sku) return null;
      try {
        const res = await fetch(`/api/products/sku/${existingSearch.sku}`);
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
  });

  const { data: productByName } = useQuery<Product | null>({
    queryKey: ["/api/products", "name", existingSearch.name],
    enabled: Boolean(existingSearch.name) && !existingSearch.barcode && !existingSearch.sku && existingSearch.name.length > 2,
    queryFn: async () => {
      if (!existingSearch.name) return null;
      try {
        const res = await fetch(`/api/products/search?name=${encodeURIComponent(existingSearch.name)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.[0] ?? null;
      } catch {
        return null;
      }
    },
  });

  const existingProduct = useMemo(() => {
    if (productByBarcode) return productByBarcode;
    if (productBySku) return productBySku;
    if (productByName) return productByName;
    return null;
  }, [productByBarcode, productBySku, productByName]);

  const { data: currentInventory } = useQuery<Inventory | null>({
    queryKey: ["/api/inventory", existingProduct?.id, selectedStore],
    enabled: Boolean(existingProduct?.id && selectedStore),
    queryFn: async () => {
      if (!existingProduct?.id || !selectedStore) return null;
      try {
        const res = await fetch(`/api/inventory/${existingProduct.id}/${selectedStore}`);
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
  });

  const adjustInventoryMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`/api/inventory/${productId}/${selectedStore}/adjust`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ quantity, reason: "single_product_import" }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Failed to adjust inventory");
      }
      return result;
    },
    onSuccess: () => {
      setSuccessMessage("Stock updated successfully.");
      setExistingQuantity("1");
      void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to adjust inventory");
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (payload: ProductFormData) => {
      const csrfToken = await getCsrfToken();
      const productPayload = {
        name: payload.name,
        sku: payload.sku,
        barcode: payload.barcode,
        description: payload.description,
        price: parseFloat(payload.price),
        cost: payload.cost ? parseFloat(payload.cost) : undefined,
        category: payload.category,
        brand: payload.brand,
      };

      const productRes = await fetch("/api/products", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(productPayload),
      });

      const product = await productRes.json();
      if (!productRes.ok) {
        throw new Error(product?.error || "Failed to create product");
      }

      const inventoryRes = await fetch("/api/inventory", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          productId: product.id,
          storeId: selectedStore,
          quantity: parseInt(payload.quantity, 10),
          minStockLevel: parseInt(payload.minStockLevel, 10),
          maxStockLevel: parseInt(payload.maxStockLevel, 10) || undefined,
        }),
      });

      const inventoryResult = await inventoryRes.json();
      if (!inventoryRes.ok) {
        throw new Error(inventoryResult?.error || "Failed to seed inventory");
      }

      return { product, inventory: inventoryResult };
    },
    onSuccess: () => {
      setSuccessMessage("New product added successfully.");
      setNewProductForm(DEFAULT_FORM);
      void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add product");
    },
  });

  const handleExistingSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!selectedStore) {
      setErrorMessage("Please select a store before adding stock.");
      return;
    }

    if (!existingProduct) {
      setErrorMessage("No product matched your search.");
      return;
    }

    const qty = parseInt(existingQuantity, 10);
    if (Number.isNaN(qty) || qty <= 0) {
      setErrorMessage("Quantity must be at least 1.");
      return;
    }

    adjustInventoryMutation.mutate({ productId: existingProduct.id, quantity: qty });
  };

  const handleNewProductSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!selectedStore) {
      setErrorMessage("Please select a store before adding a new product.");
      return;
    }

    if (!newProductForm.name || !newProductForm.sku || !newProductForm.barcode || !newProductForm.price || !newProductForm.quantity) {
      setErrorMessage("Please complete all required fields.");
      return;
    }

    createProductMutation.mutate(newProductForm);
  };

  const handleBarcodeDetected = useCallback((code: string) => {
    if (!code) return;
    if (barcodeTarget === "new") {
      setNewProductForm((prev) => ({ ...prev, barcode: code }));
    } else {
      setExistingSearch((prev) => ({ ...prev, barcode: code }));
    }
  }, [barcodeTarget]);

  const scannerStatus = useBarcodeInput({ onScan: handleBarcodeDetected, autoActivate: true });

  useEffect(() => {
    setSuccessMessage(null);
    setErrorMessage(null);
    setBarcodeTarget(activeTab === "new" ? "new" : "existing");
  }, [activeTab]);

  const resetExistingSearch = () => {
    setExistingSearch({ barcode: "", sku: "", name: "" });
    setExistingQuantity("1");
  };

  const resetNewProductForm = () => {
    setNewProductForm(DEFAULT_FORM);
  };

  const scannerIndicator = (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {scannerStatus.isScannerActive ? (
        <Badge variant="secondary" className="flex items-center gap-1">
          <ScanLine className="w-3 h-3" /> Scanner active
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">Scanner idle</Badge>
      )}
      {scannerStatus.isScanning && scannerStatus.inputBuffer && (
        <span className="font-mono text-muted-foreground">{scannerStatus.inputBuffer}</span>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {successMessage && (
        <Alert className="border-green-200 text-green-900">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Single Product Import</CardTitle>
          <p className="text-sm text-muted-foreground">Use your barcode scanner or manual inputs to add products individually.</p>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "existing" | "new")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="existing" className="flex items-center gap-2">
                <Layers className="w-4 h-4" /> Existing product
              </TabsTrigger>
              <TabsTrigger value="new" className="flex items-center gap-2">
                <Package className="w-4 h-4" /> New product
              </TabsTrigger>
            </TabsList>

            <TabsContent value="existing" className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Find product</h3>
                  <p className="text-sm text-muted-foreground">Scan a barcode or search by SKU/name to load a product.</p>
                </div>
                {scannerIndicator}
              </div>

              <form onSubmit={handleExistingSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="existing-barcode">Barcode</Label>
                    <Input
                      id="existing-barcode"
                      className="font-mono"
                      value={existingSearch.barcode}
                      onChange={(e) => setExistingSearch((prev) => ({ ...prev, barcode: e.target.value }))}
                      onFocus={() => setBarcodeTarget("existing")}
                      placeholder="Scan or type barcode"
                    />
                  </div>
                  <div>
                    <Label htmlFor="existing-sku">SKU</Label>
                    <Input
                      id="existing-sku"
                      className="font-mono"
                      value={existingSearch.sku}
                      onChange={(e) => setExistingSearch((prev) => ({ ...prev, sku: e.target.value }))}
                      placeholder="Enter SKU"
                    />
                  </div>
                  <div>
                    <Label htmlFor="existing-name">Product name</Label>
                    <Input
                      id="existing-name"
                      value={existingSearch.name}
                      onChange={(e) => setExistingSearch((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Search by name"
                    />
                  </div>
                </div>

                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{existingProduct ? `Found: ${existingProduct.name}` : "No product selected"}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={resetExistingSearch}>Clear</Button>
                </div>

                {existingProduct ? (
                  <div className="rounded-lg border p-4 bg-muted/40">
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Product</p>
                        <p className="font-semibold">{existingProduct.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">SKU</p>
                        <p className="font-mono">{existingProduct.sku || "—"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Barcode</p>
                        <p className="font-mono">{existingProduct.barcode || "—"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Current stock</p>
                        <p className="font-semibold">{currentInventory?.quantity ?? "n/a"}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription>Scan or search to select a product before adding stock.</AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="existing-quantity">Quantity to add</Label>
                    <Input
                      id="existing-quantity"
                      type="number"
                      min="1"
                      value={existingQuantity}
                      onChange={(e) => setExistingQuantity(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={!existingProduct || adjustInventoryMutation.isPending || !selectedStore}
                  >
                    {adjustInventoryMutation.isPending ? "Updating..." : "Add to inventory"}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="new" className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">New product details</h3>
                  <p className="text-sm text-muted-foreground">Fill out every field before saving. Barcode scans will auto-fill the barcode field.</p>
                </div>
                {scannerIndicator}
              </div>

              <form onSubmit={handleNewProductSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="new-name">Product name *</Label>
                    <Input
                      id="new-name"
                      value={newProductForm.name}
                      onChange={(e) => setNewProductForm((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-sku">SKU *</Label>
                    <Input
                      id="new-sku"
                      className="font-mono"
                      value={newProductForm.sku}
                      onChange={(e) => setNewProductForm((prev) => ({ ...prev, sku: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-barcode">Barcode *</Label>
                    <Input
                      id="new-barcode"
                      className="font-mono"
                      value={newProductForm.barcode}
                      onChange={(e) => setNewProductForm((prev) => ({ ...prev, barcode: e.target.value }))}
                      onFocus={() => setBarcodeTarget("new")}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="new-price">Price *</Label>
                    <Input
                      id="new-price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={newProductForm.price}
                      onChange={(e) => setNewProductForm((prev) => ({ ...prev, price: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-cost">Cost *</Label>
                    <Input
                      id="new-cost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={newProductForm.cost}
                      onChange={(e) => setNewProductForm((prev) => ({ ...prev, cost: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="new-category">Category *</Label>
                    <Select
                      value={newProductForm.category}
                      onValueChange={(value) => setNewProductForm((prev) => ({ ...prev, category: value }))}
                    >
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
                    <Label htmlFor="new-brand">Brand *</Label>
                    <Input
                      id="new-brand"
                      value={newProductForm.brand}
                      onChange={(e) => setNewProductForm((prev) => ({ ...prev, brand: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="new-description">Description *</Label>
                  <Textarea
                    id="new-description"
                    rows={3}
                    value={newProductForm.description}
                    onChange={(e) => setNewProductForm((prev) => ({ ...prev, description: e.target.value }))}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="new-quantity">Opening stock *</Label>
                    <Input
                      id="new-quantity"
                      type="number"
                      min="1"
                      value={newProductForm.quantity}
                      onChange={(e) => setNewProductForm((prev) => ({ ...prev, quantity: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-min">Min stock level *</Label>
                    <Input
                      id="new-min"
                      type="number"
                      min="0"
                      value={newProductForm.minStockLevel}
                      onChange={(e) => setNewProductForm((prev) => ({ ...prev, minStockLevel: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-max">Max stock level *</Label>
                    <Input
                      id="new-max"
                      type="number"
                      min="0"
                      value={newProductForm.maxStockLevel}
                      onChange={(e) => setNewProductForm((prev) => ({ ...prev, maxStockLevel: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={resetNewProductForm}>
                    Reset form
                  </Button>
                  <Button type="submit" disabled={createProductMutation.isPending || !selectedStore}>
                    {createProductMutation.isPending ? "Saving..." : "Create product"}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}