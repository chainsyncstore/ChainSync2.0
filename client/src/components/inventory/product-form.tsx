import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Barcode, Camera, Save, X, Plus, Image as ImageIcon } from "lucide-react";

const productSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  barcode: z.string().optional(),
  description: z.string().optional(),
  price: z.string().min(1, "Price is required").regex(/^\d+(\.\d{1,2})?$/, "Invalid price format"),
  cost: z.string().optional().refine((val) => !val || /^\d+(\.\d{1,2})?$/.test(val), "Invalid cost format"),
  category: z.string().min(1, "Category is required"),
  brand: z.string().optional(),
  isActive: z.boolean().default(true),
  sku: z.string().optional(),
  weight: z.string().optional(),
  dimensions: z.string().optional(),
  tags: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormProps {
  product?: any;
  onSuccess?: () => void;
  mode?: "create" | "edit";
}

const CATEGORIES = [
  "Electronics", "Clothing", "Food & Beverages", "Home & Garden", 
  "Sports & Outdoors", "Books", "Toys & Games", "Health & Beauty",
  "Automotive", "Office Supplies", "Jewelry", "Pet Supplies"
];

const BRANDS = [
  "Apple", "Samsung", "Nike", "Adidas", "Coca-Cola", "Pepsi", 
  "Nestle", "Unilever", "Procter & Gamble", "Johnson & Johnson"
];

export default function ProductForm({ product, onSuccess, mode = "create" }: ProductFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGeneratingBarcode, setIsGeneratingBarcode] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name || "",
      barcode: product?.barcode || "",
      description: product?.description || "",
      price: product?.price || "",
      cost: product?.cost || "",
      category: product?.category || "",
      brand: product?.brand || "",
      isActive: product?.isActive ?? true,
      sku: product?.sku || "",
      weight: product?.weight || "",
      dimensions: product?.dimensions || "",
      tags: product?.tags || "",
    },
  });

  const watchedValues = watch();

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const response = await apiRequest("POST", "/api/products", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Product created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsOpen(false);
      reset();
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create product",
        variant: "destructive",
      });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const response = await apiRequest("PUT", `/api/products/${product.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Product updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsOpen(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update product",
        variant: "destructive",
      });
    },
  });

  const generateBarcode = () => {
    setIsGeneratingBarcode(true);
    // Generate a unique barcode (EAN-13 format)
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const barcode = `123${timestamp}${random}`;
    
    setTimeout(() => {
      setValue("barcode", barcode);
      setIsGeneratingBarcode(false);
      toast({
        title: "Barcode Generated",
        description: `Generated barcode: ${barcode}`,
      });
    }, 1000);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = (data: ProductFormData) => {
    if (mode === "create") {
      createProductMutation.mutate(data);
    } else {
      updateProductMutation.mutate(data);
    }
  };

  const handleOpen = () => {
    if (product) {
      reset({
        name: product.name,
        barcode: product.barcode,
        description: product.description,
        price: product.price,
        cost: product.cost,
        category: product.category,
        brand: product.brand,
        isActive: product.isActive,
        sku: product.sku,
        weight: product.weight,
        dimensions: product.dimensions,
        tags: product.tags,
      });
    }
    setIsOpen(true);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button onClick={handleOpen} variant={mode === "create" ? "default" : "outline"}>
          {mode === "create" ? (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Edit
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add New Product" : "Edit Product"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    {...register("name")}
                    placeholder="Enter product name"
                  />
                  {errors.name && (
                    <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    {...register("sku")}
                    placeholder="Stock Keeping Unit"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  {...register("description")}
                  placeholder="Product description"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <div>
                   <Label htmlFor="category">Category *</Label>
                   <Select value={watchedValues.category || undefined} onValueChange={(value) => setValue("category", value)}>
                     <SelectTrigger>
                       <SelectValue placeholder="Select category" />
                     </SelectTrigger>
                     <SelectContent>
                       {CATEGORIES.map((category) => (
                         <SelectItem key={category} value={category}>
                           {category}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                   {errors.category && (
                     <p className="text-sm text-red-600 mt-1">{errors.category.message}</p>
                   )}
                 </div>
                 
                 <div>
                   <Label htmlFor="brand">Brand</Label>
                   <Select value={watchedValues.brand || undefined} onValueChange={(value) => setValue("brand", value)}>
                     <SelectTrigger>
                       <SelectValue placeholder="Select brand" />
                     </SelectTrigger>
                     <SelectContent>
                       {BRANDS.map((brand) => (
                         <SelectItem key={brand} value={brand}>
                           {brand}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Selling Price *</Label>
                  <Input
                    id="price"
                    {...register("price")}
                    placeholder="0.00"
                    type="number"
                    step="0.01"
                    min="0"
                  />
                  {errors.price && (
                    <p className="text-sm text-red-600 mt-1">{errors.price.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="cost">Cost Price</Label>
                  <Input
                    id="cost"
                    {...register("cost")}
                    placeholder="0.00"
                    type="number"
                    step="0.01"
                    min="0"
                  />
                  {errors.cost && (
                    <p className="text-sm text-red-600 mt-1">{errors.cost.message}</p>
                  )}
                </div>
              </div>

              {watchedValues.price && watchedValues.cost && (
                <div className="flex space-x-4">
                  <Badge variant="outline">
                    Profit: ${(parseFloat(watchedValues.price) - parseFloat(watchedValues.cost)).toFixed(2)}
                  </Badge>
                  <Badge variant="outline">
                    Margin: {((parseFloat(watchedValues.price) - parseFloat(watchedValues.cost)) / parseFloat(watchedValues.price) * 100).toFixed(1)}%
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Barcode */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Barcode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex space-x-2">
                <div className="flex-1">
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input
                    id="barcode"
                    {...register("barcode")}
                    placeholder="Enter or generate barcode"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateBarcode}
                  disabled={isGeneratingBarcode}
                  className="mt-6"
                >
                  {isGeneratingBarcode ? (
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Barcode className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {watchedValues.barcode && (
                <div className="text-center p-4 border rounded-lg bg-gray-50">
                  <p className="font-mono text-lg">{watchedValues.barcode}</p>
                  <p className="text-sm text-gray-600 mt-1">Scan this barcode to add to cart</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Additional Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="weight">Weight (g)</Label>
                  <Input
                    id="weight"
                    {...register("weight")}
                    placeholder="0"
                    type="number"
                    min="0"
                  />
                </div>
                
                <div>
                  <Label htmlFor="dimensions">Dimensions (LxWxH cm)</Label>
                  <Input
                    id="dimensions"
                    {...register("dimensions")}
                    placeholder="10x5x2"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  {...register("tags")}
                  placeholder="tag1, tag2, tag3"
                />
                <p className="text-sm text-gray-600 mt-1">Separate tags with commas</p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={watchedValues.isActive}
                  onCheckedChange={(checked) => setValue("isActive", checked)}
                />
                <Label htmlFor="isActive">Active Product</Label>
              </div>
            </CardContent>
          </Card>

          {/* Product Image */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Product Image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                  )}
                </div>
                <div>
                  <Label htmlFor="image" className="cursor-pointer">
                    <Button type="button" variant="outline" asChild>
                      <span>
                        <Camera className="w-4 h-4 mr-2" />
                        Upload Image
                      </span>
                    </Button>
                  </Label>
                  <input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {mode === "create" ? "Create Product" : "Update Product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
} 