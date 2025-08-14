import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Package, Search, Plus } from "lucide-react";
import { LoadingSpinner, ListSkeleton } from "@/components/ui/loading";
import type { Product } from "@shared/schema";

interface ProductSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
}

export default function ProductSearchModal({ isOpen, onClose, onSelectProduct }: ProductSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (searchQuery.length > 2) {
      setIsLoading(true);
      // Simulate API call
      setTimeout(() => {
        const now = new Date();
        setProducts([
          {
            id: "1",
            name: "Sample Product 1",
            sku: null,
            barcode: "123456789",
            description: null,
            price: "9.99",
            cost: null,
            category: "Electronics",
            brand: "Sample Brand",
            isActive: true,
            createdAt: now,
            updatedAt: now
          } as Product,
          {
            id: "2", 
            name: "Sample Product 2",
            sku: null,
            barcode: "987654321",
            description: null,
            price: "19.99",
            cost: null,
            category: "Clothing",
            brand: "Sample Brand",
            isActive: true,
            createdAt: now,
            updatedAt: now
          } as Product
        ]);
        setIsLoading(false);
      }, 1000);
    } else {
      setProducts([]);
    }
  }, [searchQuery]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-w-[95vw] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Search className="w-5 h-5" />
            <span>Search Products</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
              autoFocus
            />
          </div>

          <div className="max-h-96 overflow-auto space-y-2">
            {isLoading && (
              <div className="text-center py-8 text-slate-500">
                <LoadingSpinner size="default" className="mx-auto mb-2" />
                <p>Searching...</p>
              </div>
            )}

            {!isLoading && searchQuery.length > 2 && products.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                <Package className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p>No products found</p>
                <p className="text-sm">Try adjusting your search terms</p>
              </div>
            )}

            {products.map((product: Product) => (
              <div
                key={product.id}
                className="flex items-center justify-between p-3 sm:p-4 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 text-sm sm:text-base truncate">{product.name}</p>
                    <p className="text-xs sm:text-sm text-slate-500">SKU: {product.barcode}</p>
                    {product.category && (
                      <p className="text-xs text-slate-400">{product.category}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-slate-800 text-sm sm:text-base">
                    ${product.price}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => onSelectProduct(product)}
                    className="min-h-[32px] px-2 sm:px-3"
                  >
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
