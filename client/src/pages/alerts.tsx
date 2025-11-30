import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, InfoIcon, Loader2, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime } from "@/lib/pos-utils";
import type { AlertsOverviewResponse, StoreAlertDetail, StoreAlertsResponse } from "@shared/types/alerts";

const severityStyles = {
  critical: {
    badge: "bg-red-100 text-red-800 border-red-200",
    pill: "bg-red-50 text-red-700",
  },
  warning: {
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    pill: "bg-amber-50 text-amber-700",
  },
  info: {
    badge: "bg-slate-100 text-slate-800 border-slate-200",
    pill: "bg-slate-50 text-slate-600",
  },
} as const;

const summaryDefaults = { lowStock: 0, outOfStock: 0, overstocked: 0, total: 0 };

export default function Alerts() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);
  const managerStoreId = !isAdmin ? user?.storeId ?? null : null;

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  const overviewQuery = useQuery<AlertsOverviewResponse>({
    queryKey: ["/api/alerts/overview"],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch("/api/alerts/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load alerts overview");
      return res.json();
    },
  });

  const storeIdForDetail = isAdmin ? selectedStoreId : managerStoreId;

  const detailQuery = useQuery<StoreAlertsResponse>({
    queryKey: ["/api/alerts/stores", storeIdForDetail],
    enabled: Boolean(storeIdForDetail),
    queryFn: async () => {
      if (!storeIdForDetail) throw new Error("Missing store context");
      const res = await fetch(`/api/alerts/stores/${storeIdForDetail}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load store alerts");
      return res.json();
    },
  });

  const storeOptions = useMemo(() => (isAdmin ? overviewQuery.data?.stores ?? [] : []), [isAdmin, overviewQuery.data]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!storeOptions.length) {
      setSelectedStoreId(null);
      return;
    }
    const exists = storeOptions.some((store) => store.storeId === selectedStoreId);
    if (!exists) {
      setSelectedStoreId(storeOptions[0].storeId);
    }
  }, [isAdmin, storeOptions, selectedStoreId]);

  const detail = detailQuery.data ?? null;
  const stats = detail?.stats ?? summaryDefaults;
  const alerts = detail?.alerts ?? [];
  const storeName = detail?.storeName ?? (isAdmin ? "Select a store" : "Assigned store");

  const renderStoreSnapshot = () => {
    if (!isAdmin) return null;
    return (
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Organization Alerts Snapshot</CardTitle>
          <p className="text-sm text-muted-foreground">
            {overviewQuery.isLoading
              ? "Loading snapshot..."
              : overviewQuery.data?.totals.total
                ? `${overviewQuery.data.totals.total.toLocaleString()} active alerts across ${overviewQuery.data.totals.storesWithAlerts} store(s).`
                : "No active alerts across your organization."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-muted-foreground">Select a store</div>
            <Select
              value={selectedStoreId ?? undefined}
              onValueChange={(value) => setSelectedStoreId(value)}
              disabled={!storeOptions.length}
            >
              <SelectTrigger className="w-full sm:w-60">
                <SelectValue placeholder={storeOptions.length ? "Choose store" : "No stores with alerts"} />
              </SelectTrigger>
              <SelectContent>
                {storeOptions.map((store) => (
                  <SelectItem key={store.storeId} value={store.storeId}>
                    {store.storeName} ({store.total})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {overviewQuery.isLoading && !storeOptions.length ? (
              <div className="col-span-full flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading stores...
              </div>
            ) : storeOptions.length ? (
              storeOptions.map((store) => {
                const isActive = store.storeId === selectedStoreId;
                return (
                  <button
                    key={store.storeId}
                    type="button"
                    onClick={() => setSelectedStoreId(store.storeId)}
                    className={`rounded-lg border p-4 text-left transition hover:border-primary ${
                      isActive ? 'border-primary bg-primary/5' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{store.storeName}</p>
                        <p className="text-xs text-muted-foreground">{store.currency}</p>
                      </div>
                      <Badge variant={isActive ? 'default' : 'secondary'}>{store.total}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[0.65rem]">
                      <div>
                        <p className="font-semibold text-red-600">{store.outOfStock}</p>
                        <p className="text-muted-foreground">Out</p>
                      </div>
                      <div>
                        <p className="font-semibold text-amber-600">{store.lowStock}</p>
                        <p className="text-muted-foreground">Low</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-600">{store.overstocked}</p>
                        <p className="text-muted-foreground">Over</p>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="col-span-full rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                All stores are healthy.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderStoreAlerts = () => {
    if (!storeIdForDetail) {
      return (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {isAdmin ? "Select a store to view its alerts." : "Your account is not assigned to a store."}
          </CardContent>
        </Card>
      );
    }

    if (detailQuery.isLoading) {
      return (
        <Card>
          <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading alerts…
          </CardContent>
        </Card>
      );
    }

    if (detailQuery.isError) {
      return (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            Failed to load alerts. Please retry.
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            <CardTitle>{storeName}</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            {stats.total ? `${stats.total.toLocaleString()} active alert${stats.total === 1 ? '' : 's'}` : 'All clear'}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Total" value={stats.total} description="Active alerts" icon={<AlertTriangle className="h-4 w-4" />} />
            <SummaryCard label="Out of Stock" value={stats.outOfStock} description="Need immediate restock" accent="text-red-600" />
            <SummaryCard label="Low Stock" value={stats.lowStock} description="Below threshold" accent="text-amber-600" />
            <SummaryCard label="Overstocked" value={stats.overstocked} description="Above max" accent="text-slate-600" />
          </div>

          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <CheckCircle className="h-10 w-10 text-emerald-500" />
              Inventory levels look healthy.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md bg-slate-50 p-3 text-sm text-muted-foreground">
                <InfoIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                Alerts resolve automatically once stock moves back within configured thresholds.
              </div>
              {alerts.map((storeAlert) => (
                <AlertListItem
                  key={`${storeAlert.productId}-${storeAlert.alertId}`}
                  alertItem={storeAlert}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {renderStoreSnapshot()}
      {renderStoreAlerts()}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
  accent,
  icon,
}: {
  label: string;
  value: number;
  description: string;
  accent?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
        {label}
        {icon}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${accent ?? 'text-slate-900'}`}>{value}</div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function AlertListItem({
  alertItem,
}: {
  alertItem: StoreAlertDetail;
}) {
  const severity = severityStyles[alertItem.severity] ?? severityStyles.info;

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold">{alertItem.product?.name ?? "Unnamed product"}</p>
            <Badge className={severity.badge} variant="outline">
              {alertItem.status.replace(/_/g, " ")}
            </Badge>
            <Badge className={severity.pill} variant="outline">
              {alertItem.severity}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">SKU/Barcode: {alertItem.product?.barcode ?? "N/A"}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-muted-foreground sm:grid-cols-4">
            <div>
              <p className="font-medium text-slate-900">{alertItem.quantity}</p>
              <p>On hand</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">{alertItem.minStockLevel ?? '—'}</p>
              <p>Min level</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">{alertItem.maxStockLevel ?? '—'}</p>
              <p>Max level</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {alertItem.alertCreatedAt ? formatDateTime(new Date(alertItem.alertCreatedAt)) : '—'}
              </p>
              <p>Created</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
