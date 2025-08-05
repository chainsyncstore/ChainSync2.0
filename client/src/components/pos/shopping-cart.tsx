import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/pos-utils";
import { Minus, Plus, Trash2, Package } from "lucide-react";
import type { CartItem } from "@/types/pos";

interface ShoppingCartProps {
  items: CartItem[];
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearCart: () => void;
}

export default function ShoppingCart({
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}: ShoppingCartProps) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Shopping Cart</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <Package className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium">Cart is empty</p>
            <p className="text-sm">Scan a product to get started</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col">
      <div className="p-4 sm:p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Shopping Cart</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearCart}
            className="text-slate-500 hover:text-slate-700 min-h-[36px] px-3"
          >
            Clear All
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        {items.map((item) => (
          <div key={item.id} className="border-b border-slate-100 p-3 sm:p-4 hover:bg-slate-50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
              <div className="flex items-center space-x-3 sm:space-x-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Package className="text-slate-400 w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 text-sm sm:text-base truncate">{item.name}</p>
                  <p className="text-xs sm:text-sm text-slate-500">SKU: {item.barcode}</p>
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end space-x-3 sm:space-x-4">
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-8 h-8 sm:w-8 sm:h-8 p-0 min-h-[32px]"
                    onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                  >
                    <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                  <span className="w-8 text-center font-medium text-sm sm:text-base">{item.quantity}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-8 h-8 sm:w-8 sm:h-8 p-0 min-h-[32px]"
                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                  >
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                </div>
                <div className="text-right">
                  <p className="font-medium text-slate-800 text-sm sm:text-base">{formatCurrency(item.total)}</p>
                  <p className="text-xs sm:text-sm text-slate-500">{formatCurrency(item.price)} each</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-8 h-8 sm:w-8 sm:h-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 min-h-[32px]"
                  onClick={() => onRemoveItem(item.id)}
                >
                  <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
