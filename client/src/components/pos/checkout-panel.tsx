import { CheckCircle, Pause, X, CreditCard, Banknote } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/pos-utils";
import type { CartSummary, PaymentData } from "@/types/pos";

/* eslint-disable no-unused-vars -- prop names document the external API */
interface CheckoutPanelProps {
  summary: CartSummary;
  payment: PaymentData;
  dailyStats: { transactions: number; revenue: number };
  onPaymentMethodChange(method: "cash" | "card"): void;
  onAmountReceivedChange(amount: number): void;
  onCompleteSale(): void;
  onHoldTransaction(): void;
  onVoidTransaction(): void;
  isProcessing?: boolean;
  currency?: 'USD' | 'NGN';
}
/* eslint-enable no-unused-vars */

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
  currency = 'USD',
}: CheckoutPanelProps) {
  const [amountReceived, setAmountReceived] = useState("");
  const [amountError, setAmountError] = useState("");
  const [queuedCount, setQueuedCount] = useState(0);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const load = async () => {
      try {
        const { getOfflineQueueCount } = await import("@/lib/offline-queue");
        setQueuedCount(await getOfflineQueueCount());
      } catch (err) {
        console.error('Failed to load offline queue count', err);
      }
    };
    void load();
    const onOnline = async () => {
      try {
        setIsOnline(true);
        const { processQueueNow, getOfflineQueueCount } = await import("@/lib/offline-queue");
        await processQueueNow();
        setQueuedCount(await getOfflineQueueCount());
      } catch (err) {
        console.error('Failed to process offline queue on reconnect', err);
      }
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const handleAmountChange = (value: string) => {
    setAmountReceived(value);
    setAmountError("");

    // Validate amount
    const amount = parseFloat(value);
    if (value && (isNaN(amount) || amount < 0)) {
      setAmountError("Please enter a valid amount");
      onAmountReceivedChange(0);
      return;
    }

    if (amount > 999999.99) {
      setAmountError("Amount cannot exceed 999,999.99");
      onAmountReceivedChange(0);
      return;
    }

    onAmountReceivedChange(amount || 0);
  };

  const changeDue = payment.amountReceived ? Math.max(0, payment.amountReceived - summary.total) : 0;
  const canCompleteSale = summary.itemCount > 0 && (payment.method === "card" || (payment.amountReceived && payment.amountReceived >= summary.total));

  return (
    <div className="flex flex-col space-y-4 sm:space-y-6">
      {/* Lightweight status row */}
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${isOnline ? 'text-green-700' : 'text-amber-700'}`}>{isOnline ? 'Online' : 'Offline'}</span>
        {queuedCount > 0 && (
          <button
            className="text-blue-600 hover:underline"
            onClick={async () => {
              try {
                const { processQueueNow, getOfflineQueueCount } = await import("@/lib/offline-queue");
                await processQueueNow();
                setQueuedCount(await getOfflineQueueCount());
              } catch (err) {
                console.error('Failed to sync pending sales', err);
              }
            }}
          >
            Sync pending ({queuedCount})
          </button>
        )}
      </div>
      {/* Order Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Order Summary</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-600">Items</span>
            <span className="font-medium">{summary.itemCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-medium">{formatCurrency(summary.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Tax (8.5%)</span>
            <span className="font-medium">{formatCurrency(summary.tax, currency)}</span>
          </div>
          <div className="border-t border-slate-200 pt-3">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-slate-800">Total</span>
              <span className="text-xl sm:text-2xl font-bold text-primary">{formatCurrency(summary.total, currency)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Payment Method</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Button
            variant={payment.method === "cash" ? "default" : "outline"}
            className="p-3 sm:p-4 h-auto flex-col min-h-[60px] sm:min-h-[80px]"
            onClick={() => onPaymentMethodChange("cash")}
          >
            <Banknote className="w-5 h-5 sm:w-6 sm:h-6 mb-1 sm:mb-2" />
            <span className="text-sm sm:text-base">Cash</span>
          </Button>
          <Button
            variant={payment.method === "card" ? "default" : "outline"}
            className="p-3 sm:p-4 h-auto flex-col min-h-[60px] sm:min-h-[80px]"
            onClick={() => onPaymentMethodChange("card")}
          >
            <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 mb-1 sm:mb-2" />
            <span className="text-sm sm:text-base">Card</span>
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
                className={`text-lg font-mono text-right h-12 sm:h-10 ${amountError ? "border-red-500" : ""}`}
              />
              {amountError && (
                <p className="text-red-500 text-sm mt-1">{amountError}</p>
              )}
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Change Due</span>
              <span className="text-lg sm:text-xl font-bold text-green-600">{formatCurrency(changeDue, currency)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Checkout Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="space-y-3">
          <Button
            className="w-full py-3 sm:py-4 text-base sm:text-lg font-semibold min-h-[48px] sm:min-h-[52px]"
            onClick={onCompleteSale}
            disabled={!canCompleteSale || isProcessing}
          >
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Complete Sale
          </Button>
          <Button
            variant="outline"
            className="w-full py-3 font-medium min-h-[44px]"
            onClick={onHoldTransaction}
            disabled={summary.itemCount === 0 || isProcessing}
          >
            <Pause className="w-4 h-4 mr-2" />
            Hold Transaction
          </Button>
          <Button
            variant="outline"
            className="w-full py-3 font-medium border-red-300 text-red-600 hover:bg-red-50 min-h-[44px]"
            onClick={onVoidTransaction}
            disabled={summary.itemCount === 0 || isProcessing}
          >
            <X className="w-4 h-4 mr-2" />
            Void Sale
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Today&rsquo;s Stats</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-600">Transactions</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-800">{dailyStats.transactions}</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-primary w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-600">Revenue</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600">{formatCurrency(dailyStats.revenue, currency)}</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Banknote className="text-green-600 w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
