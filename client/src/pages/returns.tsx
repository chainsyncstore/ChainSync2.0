import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import SyncCenter from "@/components/pos/sync-center";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useOfflineSyncIndicator } from "@/hooks/use-offline-sync-indicator";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateTime } from "@/lib/pos-utils";
import type { Store } from "@shared/schema";

type RestockAction = "RESTOCK" | "DISCARD";
type RefundType = "NONE" | "FULL" | "PARTIAL";

interface SaleItemResponse {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
  name: string | null;
  sku: string | null;
  barcode: string | null;
}

interface SaleLookupResponse {
  sale: {
    id: string;
    storeId: string;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    occurredAt: string;
    status: string;
    currency: string;
  };
  items: SaleItemResponse[];
}

interface ReturnDraftState {
  [saleItemId: string]: {
    quantity: number;
    restockAction: RestockAction;
    refundType: RefundType;
    refundAmount: string;
  };
}

/* eslint-disable no-unused-vars */
type DraftEntryUpdater = (entry: ReturnDraftState[string]) => ReturnDraftState[string];
/* eslint-enable no-unused-vars */

export default function ReturnsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const lockedStoreId = user?.role === "cashier" ? user.storeId ?? null : null;
  const [selectedStore, setSelectedStore] = useState<string>(lockedStoreId ?? "");
  const [saleReference, setSaleReference] = useState("");
  const [saleData, setSaleData] = useState<SaleLookupResponse | null>(null);
  const [fetchingSale, setFetchingSale] = useState(false);
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState<ReturnDraftState>({});
  const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);

  const { data: stores = [], isLoading: loadingStores } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  const { queuedCount, escalations, lastSync, handleSyncNow } = useOfflineSyncIndicator();

  useEffect(() => {
    if (lockedStoreId && selectedStore !== lockedStoreId) {
      setSelectedStore(lockedStoreId);
      return;
    }
    if (!lockedStoreId && !selectedStore && stores.length > 0) {
      setSelectedStore(stores[0].id);
    }
  }, [lockedStoreId, selectedStore, stores]);

  useEffect(() => {
    setSaleData(null);
    setDraft({});
  }, [selectedStore]);

  const initializeDraft = (response: SaleLookupResponse) => {
    const next: ReturnDraftState = {};
    response.items.forEach((item) => {
      next[item.id] = {
        quantity: item.quantity,
        restockAction: "RESTOCK",
        refundType: "FULL",
        refundAmount: item.lineTotal.toFixed(2),
      };
    });
    setDraft(next);
  };

  const handleLookupSale = async () => {
    if (!selectedStore) {
      toast({ title: "Select a store", variant: "destructive" });
      return;
    }
    if (!saleReference.trim()) {
      toast({ title: "Enter sale ID or receipt", variant: "destructive" });
      return;
    }
    setFetchingSale(true);
    try {
      const res = await fetch(`/api/pos/sales/${saleReference.trim()}?storeId=${selectedStore}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(String(res.status));
      }
      const payload = (await res.json()) as SaleLookupResponse;
      setSaleData(payload);
      initializeDraft(payload);
      setReason("");
    } catch (error) {
      console.error("Failed to fetch sale", error);
      setSaleData(null);
      setDraft({});
      toast({ title: "Sale not found", description: "Check the sale ID and try again.", variant: "destructive" });
    } finally {
      setFetchingSale(false);
    }
  };

  const handleDraftChange = (saleItemId: string, updater: DraftEntryUpdater) => {
    setDraft((prev) => {
      const current = prev[saleItemId];
      if (!current) return prev;
      return {
        ...prev,
        [saleItemId]: updater(current),
      };
    });
  };

  const computeUnitRefund = (item: SaleItemResponse) => {
    if (!item.quantity) return item.lineTotal;
    return item.lineTotal / item.quantity;
  };

  const computeRefundForItem = (item: SaleItemResponse) => {
    const draftEntry = draft[item.id];
    if (!draftEntry) return 0;
    const unitValue = computeUnitRefund(item);
    const quantity = Math.min(Math.max(draftEntry.quantity, 0), item.quantity);
    if (draftEntry.refundType === "NONE") return 0;
    if (draftEntry.refundType === "FULL") {
      return unitValue * quantity;
    }
    const requested = Number.parseFloat(draftEntry.refundAmount || "0");
    if (!Number.isFinite(requested) || requested < 0) return 0;
    return Math.min(requested, unitValue * quantity);
  };

  const totalRefund = saleData
    ? saleData.items.reduce((sum, item) => sum + computeRefundForItem(item), 0)
    : 0;

  const processReturnMutation = useMutation({
    mutationFn: async () => {
      if (!saleData) throw new Error("No sale selected");
      const itemsPayload = saleData.items
        .map((item) => ({ draftEntry: draft[item.id], item }))
        .filter(({ draftEntry }) => Boolean(draftEntry))
        .map(({ draftEntry, item }) => ({ draftEntry: draftEntry!, item }))
        .filter(({ draftEntry, item }) => draftEntry.quantity > 0 && draftEntry.quantity <= item.quantity)
        .map(({ draftEntry, item }) => ({
          saleItemId: item.id,
          productId: item.productId,
          quantity: Math.min(Math.max(draftEntry.quantity, 0), item.quantity),
          restockAction: draftEntry.restockAction,
          refundType: draftEntry.refundType,
          refundAmount:
            draftEntry.refundType === "PARTIAL"
              ? String(
                  Math.min(Number.parseFloat(draftEntry.refundAmount || "0") || 0, computeUnitRefund(item) * draftEntry.quantity).toFixed(2)
                )
              : String(computeRefundForItem(item).toFixed(2)),
        }));

      if (!itemsPayload.length) {
        throw new Error("No items selected for return");
      }

      const payload = {
        saleId: saleData.sale.id,
        storeId: saleData.sale.storeId,
        reason: reason.trim() || undefined,
        items: itemsPayload,
      };

      const res = await fetch("/api/pos/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`Return failed with status ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Return processed", description: "Inventory and refunds updated." });
      setSaleReference("");
      setSaleData(null);
      setDraft({});
      setReason("");
    },
    onError: (error) => {
      console.error("Return submission failed", error);
      toast({ title: "Return failed", description: "Please verify inputs and try again.", variant: "destructive" });
    },
  });

  const canSubmit = Boolean(
    saleData &&
      saleData.items.some((item) => {
        const entry = draft[item.id];
        return entry && entry.quantity > 0;
      }) &&
      !processReturnMutation.isPending
  );

  const lockedStore = useMemo(() => stores.find((store) => store.id === lockedStoreId) || null, [lockedStoreId, stores]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase text-slate-500">Sync status</p>
          <p className="text-sm text-slate-700">
            {lastSync ? (
              <>
                Last sync attempted {lastSync.attempted} • synced {lastSync.synced}
              </>
            ) : (
              "No sync stats yet"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={queuedCount > 0 ? "secondary" : "outline"} className={queuedCount > 0 ? "bg-amber-100 text-amber-900 border-amber-200" : "text-slate-600"}>
            {queuedCount > 0 ? `${queuedCount} pending sale${queuedCount > 1 ? "s" : ""}` : "Queue clear"}
          </Badge>
          <Button size="sm" variant="outline" onClick={handleSyncNow}>
            Sync now
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsSyncCenterOpen(true)}>
            Open Sync Center
          </Button>
        </div>
      </div>
      {escalations > 0 && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Some queued sales have retried multiple times. Check connection or contact support if this persists.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Product Returns</CardTitle>
          <CardDescription>Look up a sale and capture the return details for audit + inventory sync.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="store">Store</Label>
              {lockedStoreId ? (
                <Input
                  id="store"
                  value={lockedStore?.name || "Current store"}
                  readOnly
                  disabled
                  className="bg-slate-100"
                />
              ) : (
                <Select value={selectedStore} onValueChange={setSelectedStore} disabled={loadingStores}>
                  <SelectTrigger id="store">
                    <SelectValue placeholder={loadingStores ? "Loading stores" : "Select store"} />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="sale">Sale / Receipt ID</Label>
              <div className="flex gap-2">
                <Input
                  id="sale"
                  placeholder="e.g. sale UUID"
                  value={saleReference}
                  onChange={(event) => setSaleReference(event.target.value)}
                />
                <Button onClick={handleLookupSale} disabled={fetchingSale || !selectedStore}>
                  {fetchingSale ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Fetch
                </Button>
              </div>
            </div>
          </div>
          {saleData ? (
            <div className="text-sm text-slate-600">
              Showing sale <span className="font-semibold text-slate-800">{saleData.sale.id}</span>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Use the receipt or sale ID to load details.</div>
          )}
        </CardContent>
      </Card>

      {saleData && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Sale summary</CardTitle>
              <CardDescription>
                Processed {formatDateTime(new Date(saleData.sale.occurredAt))} · Status
                <Badge variant="secondary" className="ml-2 uppercase">
                  {saleData.sale.status}
                </Badge>
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Subtotal</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(saleData.sale.subtotal, saleData.sale.currency as any)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Discount</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(saleData.sale.discount, saleData.sale.currency as any)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Tax</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(saleData.sale.tax, saleData.sale.currency as any)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-base font-semibold text-slate-800">
                  {formatCurrency(saleData.sale.total, saleData.sale.currency as any)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription>Adjust quantities, restock actions, and refund types per line.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-[120px]">Qty to return</TableHead>
                    <TableHead>Restock</TableHead>
                    <TableHead>Refund</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saleData.items.map((item) => {
                    const entry = draft[item.id];
                    if (!entry) return null;
                    const maxQty = item.quantity;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium text-slate-800">{item.name || 'Product'}</div>
                          <div className="text-xs text-slate-500">SKU: {item.sku || '–'}</div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={maxQty}
                            value={entry.quantity}
                            onChange={(event) => {
                              const nextQty = Math.max(0, Math.min(Number(event.target.value) || 0, maxQty));
                              handleDraftChange(item.id, (current) => ({
                                ...current,
                                quantity: nextQty,
                              }));
                            }}
                          />
                          <div className="text-xs text-slate-500 mt-1">Max {maxQty}</div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={entry.restockAction}
                            onValueChange={(value: RestockAction) =>
                              handleDraftChange(item.id, (current) => ({ ...current, restockAction: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="RESTOCK">Restock</SelectItem>
                              <SelectItem value="DISCARD">Discard</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={entry.refundType}
                            onValueChange={(value: RefundType) =>
                              handleDraftChange(item.id, (current) => {
                                const baseAmount = (computeUnitRefund(item) * current.quantity).toFixed(2);
                                if (value === 'FULL') {
                                  return { ...current, refundType: value, refundAmount: baseAmount };
                                }
                                if (value === 'NONE') {
                                  return { ...current, refundType: value, refundAmount: '0.00' };
                                }
                                return { ...current, refundType: value };
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="FULL">Full</SelectItem>
                              <SelectItem value="PARTIAL">Partial</SelectItem>
                              <SelectItem value="NONE">No refund</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {entry.refundType === 'PARTIAL' ? (
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={entry.refundAmount}
                              onChange={(event) =>
                                handleDraftChange(item.id, (current) => ({
                                  ...current,
                                  refundAmount: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            <div className="text-sm font-medium text-slate-800">
                              {formatCurrency(computeRefundForItem(item), saleData.sale.currency as any)}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Finalize return</CardTitle>
              <CardDescription>Confirm refund amounts and capture any notes for the audit log.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reason">Reason / notes</Label>
                <Textarea
                  id="reason"
                  placeholder="Describe why the items were returned"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase text-slate-500">Total refund</p>
                  <p className="text-2xl font-semibold text-slate-900">
                    {formatCurrency(totalRefund, saleData.sale.currency as any)}
                  </p>
                </div>
                <Button
                  className="min-w-[180px]"
                  disabled={!canSubmit}
                  onClick={() => processReturnMutation.mutate()}
                >
                  {processReturnMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Process return
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <SyncCenter open={isSyncCenterOpen} onClose={() => setIsSyncCenterOpen(false)} />
    </div>
  );
}

