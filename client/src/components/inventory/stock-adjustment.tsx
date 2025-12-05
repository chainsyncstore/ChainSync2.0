import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Package, Plus, Minus, Edit, AlertTriangle, History, Save, Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const adjustmentSchema = z.object({
  adjustmentType: z.enum(["add", "remove", "set"], {
    errorMap: () => ({ message: "Invalid adjustment type" })
  }),
  quantity: z.number()
    .positive("Quantity must be greater than 0")
    .max(999999999, "Quantity cannot exceed 999,999,999"),
  reason: z.string()
    .min(1, "Reason is required")
    .max(255, "Reason must be less than 255 characters"),
  notes: z.string()
    .max(1000, "Notes must be less than 1000 characters")
    .optional(),
  cost: z.number()
    .min(0, "Cost cannot be negative")
    .max(999999.99, "Cost cannot exceed 999,999.99")
    .optional(),
});

type AdjustmentFormData = z.infer<typeof adjustmentSchema>;

interface StockAdjustmentProps {
  inventory: any;
  product: any;
  onSuccess?: () => void;
}

const ADJUSTMENT_REASONS = [
  "Stock Count",
  "Damaged Goods",
  "Expired Items",
  "Theft/Loss",
  "Return to Supplier",
  "Transfer In",
  "Transfer Out",
  "Promotional Stock",
  "Seasonal Adjustment",
  "Quality Control",
  "Other"
];

export default function StockAdjustment({ inventory, product, onSuccess }: StockAdjustmentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdjustmentFormData>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      adjustmentType: "add",
      quantity: 0,
      reason: "",
      notes: "",
      cost: 0,
    },
  });

  const watchedValues = watch();
  const currentStock = inventory?.quantity || 0;

  const adjustmentMutation = useMutation({
    mutationFn: async (data: AdjustmentFormData) => {
      let newQuantity = currentStock;
      
      switch (data.adjustmentType) {
        case "add":
          newQuantity = currentStock + data.quantity;
          break;
        case "remove":
          newQuantity = Math.max(0, currentStock - data.quantity);
          break;
        case "set":
          newQuantity = data.quantity;
          break;
      }

      const response = await apiRequest("PUT", `/api/stores/${inventory.storeId}/inventory/${product.id}`, {
        quantity: newQuantity,
        adjustmentData: {
          type: data.adjustmentType,
          quantity: data.quantity,
          reason: data.reason,
          notes: data.notes,
          cost: data.cost,
          previousStock: currentStock,
          newStock: newQuantity,
          adjustedBy: "current-user", // In real app, get from auth
          adjustedAt: new Date().toISOString(),
        },
      });
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Stock Updated",
        description: "Inventory has been successfully updated",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", inventory.storeId, "inventory"] });
      setIsOpen(false);
      reset();
      onSuccess?.();
    },
    onError: (error) => {
      console.error('Inventory adjustment failed', error);
      toast({
        title: "Error",
        description: "Failed to update inventory",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AdjustmentFormData) => {
    adjustmentMutation.mutate(data);
  };

  const calculateNewStock = () => {
    if (!watchedValues.quantity) return currentStock;
    
    switch (watchedValues.adjustmentType) {
      case "add":
        return currentStock + watchedValues.quantity;
      case "remove":
        return Math.max(0, currentStock - watchedValues.quantity);
      case "set":
        return watchedValues.quantity;
      default:
        return currentStock;
    }
  };

  const getStockStatus = (quantity: number) => {
    if (quantity === 0) return { status: "out", color: "destructive", text: "Out of Stock" };
    if (quantity <= (inventory?.minStockLevel || 10)) return { status: "low", color: "secondary", text: "Low Stock" };
    return { status: "good", color: "default", text: "In Stock" };
  };

  const newStock = calculateNewStock();
  const stockStatus = getStockStatus(newStock);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Edit className="w-4 h-4 mr-2" />
            Adjust Stock
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Stock Level</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Product Info */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center space-x-3">
                  <Package className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-gray-600">{product.barcode}</p>
                    <p className="text-sm text-gray-600">
                      Current Stock: <span className="font-medium">{currentStock}</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Adjustment Type */}
            <div>
              <Label htmlFor="adjustmentType">Adjustment Type</Label>
              <Select 
                value={watchedValues.adjustmentType} 
                onValueChange={(value) => setValue("adjustmentType", value as "add" | "remove" | "set")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">
                    <div className="flex items-center space-x-2">
                      <Plus className="w-4 h-4 text-green-600" />
                      <span>Add Stock</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="remove">
                    <div className="flex items-center space-x-2">
                      <Minus className="w-4 h-4 text-red-600" />
                      <span>Remove Stock</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="set">
                    <div className="flex items-center space-x-2">
                      <Edit className="w-4 h-4 text-blue-600" />
                      <span>Set Stock Level</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div>
              <Label htmlFor="quantity">
                {watchedValues.adjustmentType === "add" ? "Quantity to Add" :
                 watchedValues.adjustmentType === "remove" ? "Quantity to Remove" :
                 "New Stock Level"}
              </Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                min="0"
                {...register("quantity", { valueAsNumber: true })}
                placeholder="0"
              />
              {errors.quantity && (
                <p className="text-sm text-red-600 mt-1">{errors.quantity.message}</p>
              )}
            </div>

            {/* Cost (optional) */}
            <div>
              <Label htmlFor="cost">Cost per Unit (Optional)</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                min="0"
                {...register("cost", { valueAsNumber: true })}
                placeholder="0.00"
              />
            </div>

            {/* Reason */}
            <div>
              <Label htmlFor="reason">Reason *</Label>
              <Select value={watchedValues.reason} onValueChange={(value) => setValue("reason", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.reason && (
                <p className="text-sm text-red-600 mt-1">{errors.reason.message}</p>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                {...register("notes")}
                placeholder="Additional details about this adjustment"
                rows={3}
              />
            </div>

            {/* Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Stock Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Current Stock:</span>
                  <span className="font-medium">{currentStock}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Adjustment:</span>
                  <span className={`font-medium ${
                    watchedValues.adjustmentType === "add" ? "text-green-600" :
                    watchedValues.adjustmentType === "remove" ? "text-red-600" : "text-blue-600"
                  }`}>
                    {watchedValues.adjustmentType === "add" ? "+" :
                     watchedValues.adjustmentType === "remove" ? "-" : ""}
                    {watchedValues.quantity || 0}
                  </span>
                </div>
                <div className="border-t pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">New Stock Level:</span>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{newStock}</span>
                      <Badge variant={stockStatus.color as any}>
                        {stockStatus.text}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                {newStock <= (inventory?.minStockLevel || 10) && newStock > 0 && (
                  <div className="flex items-center space-x-2 p-2 bg-yellow-50 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm text-yellow-800">Stock level is below minimum threshold</span>
                  </div>
                )}
                
                {newStock === 0 && (
                  <div className="flex items-center space-x-2 p-2 bg-red-50 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-sm text-red-800">Product will be out of stock</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
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
                Update Stock
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            <History className="w-4 h-4 mr-2" />
            History
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stock Adjustment History</DialogTitle>
          </DialogHeader>
          <StockHistoryContent
            productId={product.id}
            storeId={inventory.storeId}
            productName={product.name}
            currentStock={currentStock}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

interface StockHistoryContentProps {
  productId: string;
  storeId: string;
  productName: string;
  currentStock: number;
}

interface StockMovement {
  id: string;
  quantityBefore: number;
  quantityAfter: number;
  delta: number;
  actionType: string;
  source: string | null;
  notes: string | null;
  userName: string | null;
  occurredAt: string | null;
  timestamp: string | null;
}

function StockHistoryContent({ productId, storeId, productName, currentStock }: StockHistoryContentProps) {
  const { data, isLoading, error } = useQuery<{ data: StockMovement[]; meta: { count: number } }>({
    queryKey: ["/api/inventory", productId, storeId, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/${productId}/${storeId}/history?limit=50`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  const formatSource = (source: string | null, actionType: string): string => {
    if (!source) return actionType || "Unknown";
    const sourceMap: Record<string, string> = {
      pos_sale: "POS Sale",
      pos_void: "POS Void",
      pos_return: "Return",
      csv_import: "CSV Import",
      manual: "Manual Adjustment",
      adjustment: "Stock Adjustment",
      removal: "Stock Removal",
    };
    return sourceMap[source] || source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getMovementColor = (delta: number): string => {
    if (delta > 0) return "text-green-600";
    if (delta < 0) return "text-red-600";
    return "text-gray-600";
  };

  const formatDelta = (delta: number): string => {
    if (delta > 0) return `+${delta} units`;
    if (delta < 0) return `${delta} units`;
    return "No change";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
        <Package className="w-6 h-6 text-blue-600" />
        <div>
          <p className="font-medium">{productName}</p>
          <p className="text-sm text-gray-600">Current Stock: {currentStock}</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading history...</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          Failed to load stock history. Please try again.
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="p-4 text-center text-gray-500">
          No stock movements recorded for this product.
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="space-y-2">
          {data.data.map((movement) => {
            const timestamp = movement.timestamp || movement.occurredAt;
            const timeAgo = timestamp
              ? formatDistanceToNow(new Date(timestamp), { addSuffix: true })
              : "Unknown time";

            return (
              <div
                key={movement.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
              >
                <div className="space-y-0.5">
                  <p className={`font-medium ${getMovementColor(movement.delta)}`}>
                    {formatDelta(movement.delta)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formatSource(movement.source, movement.actionType)}
                    {movement.userName && ` - ${movement.userName}`}
                  </p>
                  {movement.notes && (
                    <p className="text-xs text-gray-500 truncate max-w-[300px]">
                      {movement.notes}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">{timeAgo}</p>
                </div>
                <Badge variant="outline">
                  {movement.quantityBefore} → {movement.quantityAfter}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}