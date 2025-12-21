import { Loader2, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { post } from "@/lib/api-client";
import { formatCurrency } from "@/lib/pos-utils";
import { cn } from "@/lib/utils";
import type { Money } from "@shared/lib/currency";
import type { Product } from "@shared/schema";

import { useAnalyticsScope } from "./analytics-scope-context";
import ComprehensiveReportGenerator from "./comprehensive-report-generator";

interface DailySalesSummary {
  transactions: number;
  revenue: Money;
  refunds: Money;
  refundCount: number;
  netRevenue: Money;
}

const makeMoney = (amount: number, currency: Money["currency"]): Money => ({ amount, currency });

interface PopularProductItem {
  product: Product;
  salesCount: number;
  price: Money;
  total: Money;
  normalized?: {
    price: Money;
    total: Money;
  };
}

interface SalesPerformanceTabProps {
  chart: ReactNode;
  currentOverview: DailySalesSummary;
  previousOverview: DailySalesSummary | null;
  averageTransactionValue: Money;
  previousAverageTransactionValue: Money | null;
  displayRevenue: Money;
  displayCost: Money;
  displayProfit: Money;
  profitMargin: number;
  popularProducts: PopularProductItem[];
  effectiveRange: { start: Date; end: Date };
  normalizeCurrency: boolean;
}

interface DeltaInfo {
  label: string;
  positive?: boolean;
  negative?: boolean;
}

function computeDelta(current: number, previous?: number | null): DeltaInfo | undefined {
  if (previous === undefined || previous === null) {
    return undefined;
  }
  if (previous === 0) {
    if (current === 0) {
      return { label: "0% vs prior" };
    }
    return {
      label: `${current > 0 ? "+" : ""}100% vs prior`,
      positive: current > 0,
      negative: current < 0,
    };
  }
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(change)) {
    return undefined;
  }
  return {
    label: `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs prior`,
    positive: change > 0,
    negative: change < 0,
  };
}

export default function SalesPerformanceTab({
  chart,
  currentOverview,
  previousOverview,
  averageTransactionValue,
  previousAverageTransactionValue,
  displayRevenue,
  displayCost,
  displayProfit,
  profitMargin,
  popularProducts,
  effectiveRange,
  normalizeCurrency,
}: SalesPerformanceTabProps) {
  const {
    selectedStoreId,
    displayCurrency,
    resolvedCurrency,
  } = useAnalyticsScope();
  const storeId = selectedStoreId ?? "";

  const { toast } = useToast();
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isEmailingCsv, setIsEmailingCsv] = useState(false);

  const revenueDelta = computeDelta(
    currentOverview.revenue.amount,
    previousOverview?.revenue.amount,
  );
  const transactionDelta = computeDelta(
    currentOverview.transactions,
    previousOverview?.transactions,
  );
  const averageOrderDelta = computeDelta(
    averageTransactionValue.amount,
    previousAverageTransactionValue?.amount ?? null,
  );

  const currencyBadge = displayCurrency === "native" ? "Native" : resolvedCurrency;

  const handleExport = async (type: "csv" | "pdf") => {
    if (!storeId) {
      toast({
        title: "No store selected",
        description: "Select a store before exporting analytics.",
        variant: "destructive",
      });
      return;
    }

    const setExporting = type === "csv" ? setIsExportingCsv : setIsExportingPdf;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("interval", "day");
      params.set("store_id", storeId);
      params.set("date_from", effectiveRange.start.toISOString());
      params.set("date_to", effectiveRange.end.toISOString());
      params.set("normalize_currency", normalizeCurrency ? "true" : "false");
      if (normalizeCurrency) {
        params.set("target_currency", resolvedCurrency);
      }

      const endpoint = type === "csv" ? "/api/analytics/export.csv" : "/api/analytics/export.pdf";
      const response = await fetch(`${endpoint}?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to export ${type.toUpperCase()}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = type === "csv" ? "sales-performance.csv" : "sales-performance.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toast({
        title: "Export ready",
        description: type === "csv" ? "Sales performance CSV downloaded." : "Sales performance PDF downloaded.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Export failed",
        description: "We couldn't generate that export. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleEmailCsv = async () => {
    if (!storeId) {
      toast({
        title: "No store selected",
        description: "Select a store before emailing analytics.",
        variant: "destructive",
      });
      return;
    }

    setIsEmailingCsv(true);
    try {
      const payload = {
        interval: "day",
        storeId,
        dateFrom: effectiveRange.start.toISOString(),
        dateTo: effectiveRange.end.toISOString(),
      };

      await post<unknown>("/analytics/export.email", payload);

      toast({
        title: "Email sent",
        description: "Your analytics CSV export will arrive in your inbox shortly.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Email failed",
        description: "We couldn't email that export. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsEmailingCsv(false);
    }
  };

  const topProducts = useMemo(() => popularProducts.slice(0, 3), [popularProducts]);

  const comparisonCards = [
    {
      key: "revenue",
      title: "Revenue",
      value: formatCurrency(currentOverview.revenue),
      delta: revenueDelta,
      caption: `Net ${formatCurrency(currentOverview.netRevenue)} • ${currentOverview.transactions.toLocaleString()} txns`,
      currencyBadge,
    },
    {
      key: "refunds",
      title: "Refunds",
      value: formatCurrency(currentOverview.refunds ?? makeMoney(0, currentOverview.revenue.currency)),
      delta: computeDelta(currentOverview.refunds?.amount ?? 0, previousOverview?.refunds?.amount ?? 0),
      caption: `${currentOverview.refundCount.toLocaleString()} refund${currentOverview.refundCount === 1 ? "" : "s"}`,
      currencyBadge,
      icon: RotateCcw,
    },
    {
      key: "transactions",
      title: "Transactions",
      value: currentOverview.transactions.toLocaleString(),
      delta: transactionDelta,
      caption: previousOverview ? `${previousOverview.transactions.toLocaleString()} previous` : undefined,
    },
    {
      key: "average-order",
      title: "Avg. Order Value",
      value: formatCurrency(averageTransactionValue),
      delta: averageOrderDelta,
      caption: previousAverageTransactionValue
        ? `Prev ${formatCurrency(previousAverageTransactionValue)}`
        : undefined,
      currencyBadge,
    },
  ];

  return (
    <div className="space-y-6">
      {chart}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {comparisonCards.map((card) => (
          <Card key={card.key} className="border border-slate-200">
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                {card.currencyBadge ? (
                  <Badge variant="secondary" className="text-xs">
                    {card.currencyBadge}
                  </Badge>
                ) : null}
              </div>
              <div className="text-2xl font-semibold tracking-tight">{card.value}</div>
              {card.caption ? (
                <p className="text-xs text-muted-foreground">{card.caption}</p>
              ) : null}
            </CardHeader>
            {card.delta ? (
              <CardContent>
                <div
                  className={cn(
                    "flex items-center gap-2 text-sm font-medium",
                    card.delta.positive ? "text-emerald-600" : card.delta.negative ? "text-red-600" : "text-muted-foreground",
                  )}
                >
                  {card.delta.positive ? <TrendingUp className="h-4 w-4" /> : null}
                  {card.delta.negative ? <TrendingDown className="h-4 w-4" /> : null}
                  <span>{card.delta.label}</span>
                </div>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>

      <Card className="border border-slate-200">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Exports</CardTitle>
            <p className="text-sm text-muted-foreground">
              Download scoped analytics with the current store, date range, and currency settings.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{currencyBadge}</Badge>
            <span>
              {new Date(effectiveRange.start).toLocaleDateString()} – {new Date(effectiveRange.end).toLocaleDateString()}
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            disabled={isExportingCsv}
            onClick={() => handleExport("csv")}
            className="min-w-[140px]"
          >
            {isExportingCsv ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Export CSV
          </Button>
          <Button
            variant="outline"
            disabled={isExportingPdf}
            onClick={() => handleExport("pdf")}
            className="min-w-[140px]"
          >
            {isExportingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Export PDF
          </Button>
          <Button
            variant="outline"
            disabled={isEmailingCsv}
            onClick={handleEmailCsv}
            className="min-w-[140px]"
          >
            {isEmailingCsv ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Email CSV
          </Button>
          <ComprehensiveReportGenerator
            effectiveRange={effectiveRange}
            normalizeCurrency={normalizeCurrency}
            storeId={selectedStoreId}
            currency={resolvedCurrency}
          />
          <p className="text-xs text-muted-foreground">
            Exports include multi-currency normalization when enabled.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border border-slate-200">
          <CardHeader>
            <CardTitle>Profitability Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Revenue</span>
              <span className="font-semibold text-emerald-600">{formatCurrency(displayRevenue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cost</span>
              <span className="font-semibold text-red-500">{formatCurrency(displayCost)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Refunds</span>
              <span className="font-semibold text-amber-600">{formatCurrency(currentOverview.refunds)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Net Revenue</span>
              <span className="font-semibold text-slate-900">{formatCurrency(currentOverview.netRevenue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Net Profit</span>
              <span className={cn("font-semibold", displayProfit.amount >= 0 ? "text-emerald-600" : "text-red-600")}>
                {formatCurrency(displayProfit)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Profit Margin</span>
              <span>{profitMargin.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Top Performing Products</CardTitle>
            <Badge variant="outline">Top {topProducts.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {topProducts.length === 0 ? (
              <p className="text-muted-foreground">No sales recorded for this period.</p>
            ) : (
              topProducts.map((item) => (
                <div key={item.product.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.normalized?.price ?? item.price)} • {item.salesCount} sold
                    </p>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatCurrency(item.normalized?.total ?? item.total)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
