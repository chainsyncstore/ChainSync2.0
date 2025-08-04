import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/pos-utils";
import { CheckCircle, Pause, X, CreditCard, Banknote } from "lucide-react";
import type { CartSummary, PaymentData } from "@/types/pos";

interface CheckoutPanelProps {
  summary: CartSummary;
  payment: PaymentData;
  dailyStats: { transactions: number; revenue: number };
  onPaymentMethodChange: (method: "cash" | "card") => void;
  onAmountReceivedChange: (amount: number) => void;
  onCompleteSale: () => void;
  onHoldTransaction: () => void;
  onVoidTransaction: () => void;
  isProcessing?: boolean;
}

export default function CheckoutPanel({
  summary,
  payment,
  dailyStats,
  onPaymentMethodChange,
  onAmountReceivedChange,
  onCompleteSale,
  onHoldTransaction,
  onVoidTransaction,
  isProcessing,
}: CheckoutPanelProps) {
  const [amountReceived, setAmountReceived] = useState("");

  const handleAmountChange = (value: string) => {
    setAmountReceived(value);
    const amount = parseFloat(value) || 0;
    onAmountReceivedChange(amount);
  };

  const changeDue = payment.amountReceived ? Math.max(0, payment.amountReceived - summary.total) : 0;
  const canCompleteSale = summary.itemCount > 0 && (payment.method === "card" || (payment.amountReceived && payment.amountReceived >= summary.total));

  return (
    <div className="col-span-4 flex flex-col space-y-6">
      {/* Order Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Order Summary</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-600">Items</span>
            <span className="font-medium">{summary.itemCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-medium">{formatCurrency(summary.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Tax (8.5%)</span>
            <span className="font-medium">{formatCurrency(summary.tax)}</span>
          </div>
          <div className="border-t border-slate-200 pt-3">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-slate-800">Total</span>
              <span className="text-2xl font-bold text-primary">{formatCurrency(summary.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Payment Method</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Button
            variant={payment.method === "cash" ? "default" : "outline"}
            className="p-4 h-auto flex-col"
            onClick={() => onPaymentMethodChange("cash")}
          >
            <Banknote className="w-6 h-6 mb-2" />
            Cash
          </Button>
          <Button
            variant={payment.method === "card" ? "default" : "outline"}
            className="p-4 h-auto flex-col"
            onClick={() => onPaymentMethodChange("card")}
          >
            <CreditCard className="w-6 h-6 mb-2" />
            Card
          </Button>
        </div>
        
        {/* Cash Payment Input */}
        {payment.method === "cash" && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="amount-received" className="block text-sm font-medium text-slate-700 mb-2">
                Amount Received
              </Label>
              <Input
                id="amount-received"
                type="number"
                value={amountReceived}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.00"
                step="0.01"
                className="text-lg font-mono text-right"
              />
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Change Due</span>
              <span className="text-xl font-bold text-green-600">{formatCurrency(changeDue)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Checkout Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="space-y-3">
          <Button
            className="w-full py-4 text-lg font-semibold"
            onClick={onCompleteSale}
            disabled={!canCompleteSale || isProcessing}
          >
            <CheckCircle className="w-5 h-5 mr-2" />
            Complete Sale
          </Button>
          <Button
            variant="outline"
            className="w-full py-3 font-medium"
            onClick={onHoldTransaction}
            disabled={summary.itemCount === 0 || isProcessing}
          >
            <Pause className="w-4 h-4 mr-2" />
            Hold Transaction
          </Button>
          <Button
            variant="outline"
            className="w-full py-3 font-medium border-red-300 text-red-600 hover:bg-red-50"
            onClick={onVoidTransaction}
            disabled={summary.itemCount === 0 || isProcessing}
          >
            <X className="w-4 h-4 mr-2" />
            Void Sale
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Today's Stats</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-600">Transactions</p>
              <p className="text-2xl font-bold text-slate-800">{dailyStats.transactions}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-primary w-6 h-6" />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-600">Revenue</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(dailyStats.revenue)}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Banknote className="text-green-600 w-6 h-6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
