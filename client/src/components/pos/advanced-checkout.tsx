import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  CreditCard, 
  DollarSign, 
  Percent, 
  Users, 
  Gift, 
  ArrowLeft, 
  ArrowRight,
  Receipt,
  QrCode,
  Smartphone,
  Wallet,
  CheckCircle,
  AlertTriangle,
  Calculator
} from "lucide-react";
import { formatCurrency } from "@/lib/pos-utils";

interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
  barcode: string;
}

interface CheckoutSummary {
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  discountType: "percentage" | "fixed" | "loyalty";
  discountValue: number;
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: any;
  type: "cash" | "card" | "digital";
}

interface AdvancedCheckoutProps {
  items: CartItem[];
  summary: CheckoutSummary;
  onComplete: (transaction: any) => void;
  onCancel: () => void;
  storeId: string;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "cash", name: "Cash", icon: DollarSign, type: "cash" },
  { id: "card", name: "Credit/Debit Card", icon: CreditCard, type: "card" },
  { id: "mobile", name: "Mobile Payment", icon: Smartphone, type: "digital" },
  { id: "wallet", name: "Digital Wallet", icon: Wallet, type: "digital" },
  { id: "qr", name: "QR Code", icon: QrCode, type: "digital" },
];

const DISCOUNT_TYPES = [
  { value: "percentage", label: "Percentage", icon: Percent },
  { value: "fixed", label: "Fixed Amount", icon: DollarSign },
  { value: "loyalty", label: "Loyalty Points", icon: Gift },
];

export default function AdvancedCheckout({ 
  items, 
  summary, 
  onComplete, 
  onCancel, 
  storeId 
}: AdvancedCheckoutProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("");
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    email: "",
    phone: "",
    loyaltyNumber: "",
  });
  const [discountInfo, setDiscountInfo] = useState({
    type: "percentage" as "percentage" | "fixed" | "loyalty",
    value: 0,
    reason: "",
  });
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const changeDue = amountReceived - summary.total;

  const completeTransactionMutation = useMutation({
    mutationFn: async () => {
      const transactionData = {
        storeId,
        // cashierId is determined server-side from session; omit here for security
        subtotal: summary.subtotal,
        taxAmount: summary.tax,
        total: summary.total,
        paymentMethod: selectedPaymentMethod,
        amountReceived,
        changeDue,
        customerInfo,
        discountInfo,
        items: items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.total,
        })),
      };

      const response = await apiRequest("POST", "/api/transactions", transactionData);
      return response.json();
    },
    onSuccess: (transaction) => {
      toast({
        title: "Transaction Complete",
        description: `Receipt #${transaction.receiptNumber}`,
      });
      onComplete(transaction);
    },
    onError: (error) => {
      toast({
        title: "Transaction Failed",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handlePaymentMethodSelect = (methodId: string) => {
    setSelectedPaymentMethod(methodId);
    if (methodId === "cash") {
      setAmountReceived(summary.total);
    }
  };

  const handleDiscountApply = () => {
    // Calculate new totals with discount
    let newDiscount = 0;
    let newSubtotal = summary.subtotal;
    let newTax = summary.tax;
    let newTotal = summary.total;

    switch (discountInfo.type) {
      case "percentage":
        newDiscount = (summary.subtotal * discountInfo.value) / 100;
        break;
      case "fixed":
        newDiscount = Math.min(discountInfo.value, summary.subtotal);
        break;
      case "loyalty":
        // Convert loyalty points to discount (e.g., 100 points = $1)
        newDiscount = (discountInfo.value / 100);
        break;
    }

    newSubtotal = summary.subtotal - newDiscount;
    newTax = (newSubtotal * 0.085); // 8.5% tax rate
    newTotal = newSubtotal + newTax;

    // Update summary (in real app, this would be passed as a callback)
    console.log("New totals:", { newSubtotal, newTax, newTotal, newDiscount });
    setIsDiscountModalOpen(false);
  };

  const handleCustomerSearch = async (loyaltyNumber: string) => {
    try {
      const response = await apiRequest("GET", `/api/loyalty/customers/search?loyaltyNumber=${loyaltyNumber}`);
      const customer = await response.json();
      if (customer) {
        setCustomerInfo({
          name: `${customer.firstName} ${customer.lastName}`,
          email: customer.email || "",
          phone: customer.phone || "",
          loyaltyNumber: customer.loyaltyNumber,
        });
        toast({
          title: "Customer Found",
          description: `Welcome back, ${customer.firstName}!`,
        });
      }
    } catch (error) {
      toast({
        title: "Customer Not Found",
        description: "Please check the loyalty number",
        variant: "destructive",
      });
    }
  };

  const handleCompleteTransaction = () => {
    if (!selectedPaymentMethod) {
      toast({
        title: "Payment Method Required",
        description: "Please select a payment method",
        variant: "destructive",
      });
      return;
    }

    if (selectedPaymentMethod === "cash" && amountReceived < summary.total) {
      toast({
        title: "Insufficient Payment",
        description: "Amount received must be at least the total amount",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    completeTransactionMutation.mutate();
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Customer Information</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsCustomerModalOpen(true)}
        >
          <Users className="w-4 h-4 mr-2" />
          {customerInfo.name ? "Edit Customer" : "Add Customer"}
        </Button>
      </div>

      {customerInfo.name ? (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center space-x-3">
              <Users className="w-6 h-6 text-blue-600" />
              <div>
                <p className="font-medium">{customerInfo.name}</p>
                {customerInfo.email && <p className="text-sm text-gray-600">{customerInfo.email}</p>}
                {customerInfo.phone && <p className="text-sm text-gray-600">{customerInfo.phone}</p>}
                {customerInfo.loyaltyNumber && (
                  <Badge variant="outline" className="mt-1">
                    Loyalty: {customerInfo.loyaltyNumber}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No customer selected</p>
              <p className="text-sm">Optional: Add customer for loyalty points</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Cart
        </Button>
        <Button onClick={() => setCurrentStep(2)}>
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Discounts & Promotions</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsDiscountModalOpen(true)}
        >
          <Percent className="w-4 h-4 mr-2" />
          Apply Discount
        </Button>
      </div>

      {discountInfo.value > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Percent className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium">
                    {discountInfo.type === "percentage" && `${discountInfo.value}% Discount`}
                    {discountInfo.type === "fixed" && `${formatCurrency(discountInfo.value)} Discount`}
                    {discountInfo.type === "loyalty" && `${discountInfo.value} Points Redeemed`}
                  </p>
                  {discountInfo.reason && <p className="text-sm text-gray-600">{discountInfo.reason}</p>}
                </div>
              </div>
              <Badge variant="outline" className="text-green-600">
                -{formatCurrency(discountInfo.value)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="text-center text-gray-500">
              <Gift className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No discounts applied</p>
              <p className="text-sm">Click to add promotional discounts</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setCurrentStep(1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button onClick={() => setCurrentStep(3)}>
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Payment Method</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {PAYMENT_METHODS.map((method) => {
          const Icon = method.icon;
          return (
            <Button
              key={method.id}
              variant={selectedPaymentMethod === method.id ? "default" : "outline"}
              className="h-20 flex-col space-y-2"
              onClick={() => handlePaymentMethodSelect(method.id)}
            >
              <Icon className="w-6 h-6" />
              <span className="text-sm">{method.name}</span>
            </Button>
          );
        })}
      </div>

      {selectedPaymentMethod === "cash" && (
        <div className="space-y-2">
          <Label htmlFor="amountReceived">Amount Received</Label>
          <Input
            id="amountReceived"
            type="number"
            step="0.01"
            min={summary.total}
            value={amountReceived}
            onChange={(e) => setAmountReceived(parseFloat(e.target.value) || 0)}
            placeholder="0.00"
          />
          {changeDue > 0 && (
            <p className="text-sm text-green-600">
              Change Due: {formatCurrency(changeDue)}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setCurrentStep(2)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={() => setCurrentStep(4)}
          disabled={!selectedPaymentMethod}
        >
          Review & Complete
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Review Transaction</h3>
      
      {/* Order Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span>{item.name} x{item.quantity}</span>
              <span>{formatCurrency(item.total)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(summary.subtotal)}</span>
          </div>
          {discountInfo.value > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>-{formatCurrency(discountInfo.value)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{formatCurrency(summary.tax)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold text-lg">
            <span>Total</span>
            <span>{formatCurrency(summary.total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Payment Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span>Payment Method</span>
            <span className="capitalize">{selectedPaymentMethod}</span>
          </div>
          {selectedPaymentMethod === "cash" && (
            <>
              <div className="flex justify-between">
                <span>Amount Received</span>
                <span>{formatCurrency(amountReceived)}</span>
              </div>
              {changeDue > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Change Due</span>
                  <span>{formatCurrency(changeDue)}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setCurrentStep(3)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={handleCompleteTransaction}
          disabled={isProcessing}
          className="bg-green-600 hover:bg-green-700"
        >
          {isProcessing ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
          ) : (
            <CheckCircle className="w-4 h-4 mr-2" />
          )}
          Complete Transaction
        </Button>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Progress Indicator */}
      <div className="flex items-center justify-between mb-6">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step <= currentStep 
                ? "bg-blue-600 text-white" 
                : "bg-gray-200 text-gray-600"
            }`}>
              {step}
            </div>
            {step < 4 && (
              <div className={`w-12 h-1 mx-2 ${
                step < currentStep ? "bg-blue-600" : "bg-gray-200"
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </CardContent>
      </Card>

      {/* Discount Modal */}
      <Dialog open={isDiscountModalOpen} onOpenChange={setIsDiscountModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Discount</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Discount Type</Label>
              <Select 
                value={discountInfo.type} 
                onValueChange={(value) => setDiscountInfo(prev => ({ ...prev, type: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCOUNT_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center space-x-2">
                          <Icon className="w-4 h-4" />
                          <span>{type.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>
                {discountInfo.type === "percentage" ? "Percentage" :
                 discountInfo.type === "fixed" ? "Amount" : "Points"}
              </Label>
              <Input
                type="number"
                step={discountInfo.type === "percentage" ? "1" : "0.01"}
                min="0"
                value={discountInfo.value}
                onChange={(e) => setDiscountInfo(prev => ({ 
                  ...prev, 
                  value: parseFloat(e.target.value) || 0 
                }))}
                placeholder="0"
              />
            </div>

            <div>
              <Label>Reason (Optional)</Label>
              <Input
                value={discountInfo.reason}
                onChange={(e) => setDiscountInfo(prev => ({ 
                  ...prev, 
                  reason: e.target.value 
                }))}
                placeholder="e.g., Staff discount, Promotional offer"
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsDiscountModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleDiscountApply}>
                Apply Discount
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Modal */}
      <Dialog open={isCustomerModalOpen} onOpenChange={setIsCustomerModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customer Information</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Loyalty Number</Label>
              <div className="flex space-x-2">
                <Input
                  value={customerInfo.loyaltyNumber}
                  onChange={(e) => setCustomerInfo(prev => ({ 
                    ...prev, 
                    loyaltyNumber: e.target.value 
                  }))}
                  placeholder="Enter loyalty number"
                />
                <Button 
                  variant="outline"
                  onClick={() => handleCustomerSearch(customerInfo.loyaltyNumber)}
                >
                  Search
                </Button>
              </div>
            </div>

            <div>
              <Label>Name</Label>
              <Input
                value={customerInfo.name}
                onChange={(e) => setCustomerInfo(prev => ({ 
                  ...prev, 
                  name: e.target.value 
                }))}
                placeholder="Customer name"
              />
            </div>

            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={customerInfo.email}
                onChange={(e) => setCustomerInfo(prev => ({ 
                  ...prev, 
                  email: e.target.value 
                }))}
                placeholder="customer@example.com"
              />
            </div>

            <div>
              <Label>Phone</Label>
              <Input
                value={customerInfo.phone}
                onChange={(e) => setCustomerInfo(prev => ({ 
                  ...prev, 
                  phone: e.target.value 
                }))}
                placeholder="Phone number"
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsCustomerModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsCustomerModalOpen(false)}>
                Save Customer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 