import { CheckCircle, Pause, X, CreditCard, Banknote, Users, Search, Printer, RefreshCcw, Smartphone, Split } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/pos-utils";
import type { CartSummary, LoyaltySyncState, PaymentData, PaymentPortion } from "@/types/pos";

/* eslint-disable no-unused-vars -- prop names document the external API */
interface CheckoutPanelProps {
  summary: CartSummary;
  payment: PaymentData;
  onPaymentMethodChange(method: "cash" | "card" | "digital" | "split"): void;
  onAmountReceivedChange(amount: number): void;
  onUpdatePayment?(data: Partial<PaymentData>): void;
  onCompleteSale(): void;
  onHoldTransaction(): void;
  onVoidTransaction(): void;
  isProcessing?: boolean;
  currency?: 'USD' | 'NGN';
  loyalty: {
    customerPhone: string;
    onCustomerPhoneChange(phone: string): void;
    onLookupCustomer(): void;
    onClear(): void;
    isLoading: boolean;
    error: string | null;
    loyaltyBalance: number | null;
    customerName?: string | null;
    redeemPoints: number;
    maxRedeemablePoints: number;
    onRedeemPointsChange(points: number): void;
    syncStatus: LoyaltySyncState;
  };
  printers?: {
    profiles: { id: string; label: string }[];
    selectedId?: string;
    onSelect?: (profileId: string) => void;
    onRefresh?: () => Promise<void>;
    onPrint?: () => Promise<void>;
    isPrinting?: boolean;
    lastError?: string | null;
  };
  held?: {
    entries: { id: string; createdAt: string }[];
    onResume(id: string): void;
    onDiscard(id: string): void;
  };
}
/* eslint-enable no-unused-vars */

export default function CheckoutPanel({
  summary,
  payment,
  onPaymentMethodChange,
  onAmountReceivedChange,
  onUpdatePayment,
  onCompleteSale,
  onHoldTransaction,
  onVoidTransaction,
  isProcessing,
  currency = 'USD',
  loyalty,
  printers,
  held,
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

  const changeDue = payment.method === "cash" && payment.amountReceived ? Math.max(0, payment.amountReceived - summary.total) : 0;
  const splitPortions = payment.split ?? [];
  const splitTotal = splitPortions.reduce((sum, portion) => sum + (Number(portion.amount) || 0), 0);
  const splitBalanced = Math.abs(splitTotal - summary.total) < 0.01 && splitPortions.length > 0;
  const canCompleteSale = summary.itemCount > 0 && (
    payment.method === "card" ||
    (payment.method === "cash" && payment.amountReceived && payment.amountReceived >= summary.total) ||
    (payment.method === "digital" && Boolean(payment.walletReference)) ||
    (payment.method === "split" && splitBalanced)
  );

  const handleSplitChange = (index: number, patch: Partial<PaymentPortion>) => {
    const next = splitPortions.map((portion, idx) => (idx === index ? { ...portion, ...patch } : portion)) as PaymentPortion[];
    onUpdatePayment?.({ split: next });
  };

  const handleAddSplitPortion = () => {
    const next = [...splitPortions, { method: "card" as PaymentPortion['method'], amount: 0 }] as PaymentPortion[];
    onUpdatePayment?.({ split: next });
  };

  const handleRemoveSplitPortion = (index: number) => {
    const next = splitPortions.filter((_, idx) => idx !== index) as PaymentPortion[];
    onUpdatePayment?.({ split: next });
  };

  const handleWalletReferenceChange = (value: string) => {
    onUpdatePayment?.({ walletReference: value });
  };

  const loyaltyStatusMeta: Record<LoyaltySyncState['state'], { label: string; className: string }> = {
    idle: { label: 'Idle', className: 'bg-slate-100 text-slate-600' },
    online: { label: 'Live', className: 'bg-emerald-100 text-emerald-700' },
    cached: { label: 'Cached', className: 'bg-amber-100 text-amber-700' },
    error: { label: 'Check', className: 'bg-red-100 text-red-700' },
  };
  const loyaltyStatus = loyaltyStatusMeta[loyalty.syncStatus.state];

  return (
    <div className="flex flex-col space-y-4 sm:space-y-5">
      {/* Lightweight status row */}
      <div className="flex items-center justify-between text-xs text-slate-600">
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Order Summary</h3>
          <span className="text-sm text-slate-500">{summary.itemCount} item{summary.itemCount === 1 ? "" : "s"}</span>
        </div>
        <div className="space-y-2 text-sm sm:text-base">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="font-medium">{formatCurrency(summary.subtotal, currency)}</span>
          </div>
          {summary.redeemDiscount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Loyalty Discount</span>
              <span className="font-medium">-{formatCurrency(summary.redeemDiscount, currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>
              Tax ({(summary.taxRate * 100).toFixed(2)}%)
            </span>
            <span className="font-medium">{formatCurrency(summary.tax, currency)}</span>
          </div>
        </div>
        <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
          <span className="text-lg font-semibold text-slate-800">Total Due</span>
          <span className="text-xl sm:text-2xl font-bold text-primary">{formatCurrency(summary.total, currency)}</span>
        </div>
      </div>

      {/* Loyalty redemption */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5" /> Customer Loyalty
          </h3>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${loyaltyStatus.className}`}
              title={loyalty.syncStatus.message || undefined}
            >
              {loyaltyStatus.label}
            </span>
            {loyalty.loyaltyBalance !== null && (
              <span className="text-sm text-slate-500">
                Balance: {loyalty.loyaltyBalance} pts
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <Input
            value={loyalty.customerPhone}
            onChange={(e) => loyalty.onCustomerPhoneChange(e.target.value)}
            placeholder="Customer phone number"
            disabled={loyalty.isLoading}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={loyalty.onLookupCustomer}
              disabled={loyalty.isLoading || !loyalty.customerPhone.trim()}
            >
              {loyalty.isLoading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <><Search className="w-4 h-4 mr-2" /> Lookup</>
              )}
            </Button>
            <Button variant="ghost" onClick={loyalty.onClear} disabled={loyalty.isLoading && !loyalty.customerPhone}>
              Clear
            </Button>
          </div>
        </div>

        {loyalty.error && <p className="text-sm text-red-600">{loyalty.error}</p>}
        {loyalty.customerName && (
          <p className="text-sm text-slate-600">
            Serving <span className="font-medium">{loyalty.customerName}</span>
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="redeem-points">Redeem Points</Label>
          <div className="flex items-center gap-3">
            <Input
              id="redeem-points"
              type="number"
              min={0}
              max={loyalty.maxRedeemablePoints}
              step={1}
              value={loyalty.redeemPoints}
              onChange={(e) => loyalty.onRedeemPointsChange(Number.parseInt(e.target.value, 10) || 0)}
              disabled={loyalty.loyaltyBalance === null || loyalty.loyaltyBalance === 0 || loyalty.isLoading}
              className="sm:max-w-[140px]"
            />
            <div className="text-xs text-slate-500">
              Max {loyalty.maxRedeemablePoints} pts available this sale
            </div>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">Payment Method</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Button
            variant={payment.method === "cash" ? "default" : "outline"}
            className="p-3 sm:p-4 h-auto flex-col min-h-[60px] sm:min-h-[80px]"
            onClick={() => {
              onPaymentMethodChange("cash");
              onUpdatePayment?.({ method: "cash", split: undefined, walletReference: undefined });
            }}
          >
            <Banknote className="w-5 h-5 sm:w-6 sm:h-6 mb-1 sm:mb-2" />
            <span className="text-sm sm:text-base">Cash</span>
          </Button>
          <Button
            variant={payment.method === "card" ? "default" : "outline"}
            className="p-3 sm:p-4 h-auto flex-col min-h-[60px] sm:min-h-[80px]"
            onClick={() => {
              onPaymentMethodChange("card");
              onUpdatePayment?.({ method: "card", split: undefined, walletReference: undefined });
            }}
          >
            <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 mb-1 sm:mb-2" />
            <span className="text-sm sm:text-base">Card</span>
          </Button>
          <Button
            variant={payment.method === "digital" ? "default" : "outline"}
            className="p-3 sm:p-4 h-auto flex-col min-h-[60px] sm:min-h-[80px]"
            onClick={() => {
              onPaymentMethodChange("digital");
              onUpdatePayment?.({ method: "digital", split: undefined });
            }}
          >
            <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 mb-1 sm:mb-2" />
            <span className="text-sm sm:text-base">Mobile Wallet</span>
          </Button>
          <Button
            variant={payment.method === "split" ? "default" : "outline"}
            className="p-3 sm:p-4 h-auto flex-col min-h-[60px] sm:min-h-[80px]"
            onClick={() => {
              const initialSplit: PaymentPortion[] = splitPortions.length
                ? splitPortions
                : [{ method: "card" as PaymentPortion['method'], amount: summary.total }];
              onPaymentMethodChange("split");
              onUpdatePayment?.({ method: "split", split: initialSplit });
            }}
          >
            <Split className="w-5 h-5 sm:w-6 sm:h-6 mb-1 sm:mb-2" />
            <span className="text-sm sm:text-base">Split Payment</span>
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

        {payment.method === "digital" && (
          <div className="space-y-2">
            <Label htmlFor="wallet-reference" className="block text-sm font-medium text-slate-700">
              Wallet Reference
            </Label>
            <Input
              id="wallet-reference"
              value={payment.walletReference || ""}
              onChange={(e) => handleWalletReferenceChange(e.target.value)}
              placeholder="Enter transaction reference"
            />
          </div>
        )}

        {payment.method === "split" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Payment Portions</Label>
              <Button size="sm" variant="outline" onClick={handleAddSplitPortion}>
                Add Portion
              </Button>
            </div>
            <div className="space-y-2">
              {splitPortions.map((portion, idx) => (
                <div key={idx} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
                  <select
                    className="border rounded-md px-2 py-2 text-sm"
                    value={portion.method}
                    onChange={(e) => handleSplitChange(idx, { method: e.target.value as PaymentPortion['method'] })}
                  >
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                    <option value="wallet">Wallet</option>
                  </select>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={portion.amount}
                    onChange={(e) => handleSplitChange(idx, { amount: parseFloat(e.target.value) || 0 })}
                    placeholder="Amount"
                  />
                  <div className="flex items-center gap-2">
                    {portion.method === 'wallet' && (
                      <Input
                        className="text-xs"
                        value={portion.reference || ''}
                        onChange={(e) => handleSplitChange(idx, { reference: e.target.value })}
                        placeholder="Ref"
                      />
                    )}
                    <Button size="icon" variant="ghost" onClick={() => handleRemoveSplitPortion(idx)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-sm text-slate-600">
              Remaining: {formatCurrency(summary.total - splitTotal, currency)}
            </div>
          </div>
        )}
      </div>

      {/* Checkout Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-3">
        <Button
          className="w-full py-3 sm:py-4 text-base sm:text-lg font-semibold min-h-[48px] sm:min-h-[52px]"
          onClick={onCompleteSale}
          disabled={!canCompleteSale || isProcessing}
        >
          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          Complete Sale
        </Button>
        {printers && (
          <div className="space-y-2 border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span className="font-medium flex items-center gap-2">
                <Printer className="w-4 h-4" /> Receipt Printer
              </span>
              {printers.onRefresh && (
                <Button size="icon" variant="ghost" onClick={() => { void printers.onRefresh?.(); }} title="Refresh printers">
                  <RefreshCcw className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="flex-1 border rounded-md px-2 py-1 text-sm"
                value={printers.selectedId}
                onChange={(e) => printers.onSelect?.(e.target.value)}
              >
                {printers.profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.label}</option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                disabled={printers.isPrinting}
                onClick={() => { void printers.onPrint?.(); }}
              >
                {printers.isPrinting ? 'Printing…' : 'Print Last'}
              </Button>
            </div>
            {printers.lastError && (
              <p className="text-xs text-red-600">{printers.lastError}</p>
            )}
          </div>
        )}
        <Button
          variant="outline"
          className="w-full py-3 font-medium min-h-[44px]"
          onClick={onHoldTransaction}
          disabled={summary.itemCount === 0 || isProcessing}
        >
          <Pause className="w-4 h-4 mr-2" />
          Hold Transaction
        </Button>
        {held && held.entries.length > 0 && (
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span className="font-medium">Held Transactions</span>
              <span className="text-xs">{held.entries.length} waiting</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {held.entries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1">
                  <div>
                    <div className="font-medium">{new Date(entry.createdAt).toLocaleTimeString()}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      variant="secondary"
                      onClick={() => held.onResume(entry.id)}
                    >
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      variant="ghost"
                      onClick={() => held.onDiscard(entry.id)}
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
  );
}
