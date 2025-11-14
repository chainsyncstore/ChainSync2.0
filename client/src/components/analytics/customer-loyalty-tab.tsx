import {
  ArrowDownRight,
  ArrowUpRight,
  HeartHandshake,
  RefreshCcw,
  Sparkles,
  Users,
  UserPlus,
} from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, formatDate } from "@/lib/pos-utils";
import { cn } from "@/lib/utils";
import type { Money } from "@shared/lib/currency";

interface CustomerInsights {
  totalCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
}

interface CustomerLoyaltyTabProps {
  insights: CustomerInsights;
  previousInsights: CustomerInsights | null;
  averageTransactionValue: Money;
  previousAverageTransactionValue: Money | null;
  transactions: number;
  previousTransactions: number | null;
  effectiveRange: { start: Date; end: Date };
}

type DeltaInfo = {
  label: string;
  positive?: boolean;
  negative?: boolean;
};

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

export default function CustomerLoyaltyTab({
  insights,
  previousInsights,
  averageTransactionValue,
  previousAverageTransactionValue,
  transactions,
  previousTransactions,
  effectiveRange,
}: CustomerLoyaltyTabProps) {
  const totals = useMemo(() => {
    const total = Math.max(insights.totalCustomers, 0);
    const newCustomers = Math.max(insights.newCustomers, 0);
    const repeatCustomers = Math.max(insights.repeatCustomers, 0);
    const shareNew = total > 0 ? (newCustomers / total) * 100 : 0;
    const shareRepeat = total > 0 ? (repeatCustomers / total) * 100 : 0;
    const retentionRate = shareRepeat;
    const previousRetentionRate = previousInsights && previousInsights.totalCustomers > 0
      ? (previousInsights.repeatCustomers / previousInsights.totalCustomers) * 100
      : null;

    const transactionsPerCustomer = total > 0 ? transactions / total : 0;
    const previousTransactionsPerCustomer = previousInsights && previousInsights.totalCustomers > 0
      ? (previousTransactions ?? 0) / previousInsights.totalCustomers
      : null;

    return {
      total,
      newCustomers,
      repeatCustomers,
      shareNew,
      shareRepeat,
      retentionRate,
      previousRetentionRate,
      transactionsPerCustomer,
      previousTransactionsPerCustomer,
    };
  }, [insights, previousInsights, transactions, previousTransactions]);

  const totalDelta = computeDelta(insights.totalCustomers, previousInsights?.totalCustomers ?? null);
  const newDelta = computeDelta(insights.newCustomers, previousInsights?.newCustomers ?? null);
  const repeatDelta = computeDelta(insights.repeatCustomers, previousInsights?.repeatCustomers ?? null);
  const retentionDelta = computeDelta(totals.retentionRate, totals.previousRetentionRate);
  const spendDelta = computeDelta(averageTransactionValue.amount, previousAverageTransactionValue?.amount ?? null);
  const engagementDelta = computeDelta(
    totals.transactionsPerCustomer,
    totals.previousTransactionsPerCustomer,
  );

  const loyaltySegments = useMemo(() => (
    [
      {
        key: "new",
        label: "New customers",
        count: totals.newCustomers,
        share: totals.shareNew,
        tone: "bg-sky-100 text-sky-700 border-sky-200",
      },
      {
        key: "repeat",
        label: "Repeat customers",
        count: totals.repeatCustomers,
        share: totals.shareRepeat,
        tone: "bg-emerald-100 text-emerald-700 border-emerald-200",
      },
    ]
  ), [totals.newCustomers, totals.repeatCustomers, totals.shareNew, totals.shareRepeat]);

  const rangeLabel = `${formatDate(effectiveRange.start)} – ${formatDate(effectiveRange.end)}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border border-slate-200">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Total customers</span>
              <Users className="h-4 w-4" />
            </div>
            <div className="text-2xl font-semibold">{totals.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{rangeLabel}</p>
          </CardHeader>
          {totalDelta ? (
            <CardContent className="pt-0">
              <DeltaPill delta={totalDelta} />
            </CardContent>
          ) : null}
        </Card>

        <Card className="border border-slate-200">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>New this period</span>
              <UserPlus className="h-4 w-4" />
            </div>
            <div className="text-2xl font-semibold">{totals.newCustomers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{totals.shareNew.toFixed(1)}% of customer base</p>
          </CardHeader>
          {newDelta ? (
            <CardContent className="pt-0">
              <DeltaPill delta={newDelta} />
            </CardContent>
          ) : null}
        </Card>

        <Card className="border border-slate-200">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Loyal customers</span>
              <HeartHandshake className="h-4 w-4" />
            </div>
            <div className="text-2xl font-semibold">{totals.repeatCustomers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{totals.shareRepeat.toFixed(1)}% returning</p>
          </CardHeader>
          {repeatDelta ? (
            <CardContent className="pt-0">
              <DeltaPill delta={repeatDelta} />
            </CardContent>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border border-slate-200">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Retention trend</CardTitle>
              <p className="text-sm text-muted-foreground">Repeat customers divided by total customers</p>
            </div>
            <Badge variant="outline" className="text-xs">
              {totals.retentionRate.toFixed(1)}%
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Progress value={totals.retentionRate} />
              <p className="mt-2 text-xs text-muted-foreground">
                {totals.retentionRate.toFixed(1)}% returning vs {totals.shareNew.toFixed(1)}% new customers
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Change vs prior period</span>
                {retentionDelta ? <DeltaPill delta={retentionDelta} /> : <span className="text-xs text-muted-foreground">No prior data</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200">
          <CardHeader>
            <CardTitle>Loyalty segments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {loyaltySegments.map((segment) => (
              <div key={segment.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>{segment.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {segment.count.toLocaleString()} • {segment.share.toFixed(1)}%
                  </span>
                </div>
                <div className={cn("rounded-md border bg-white p-2", segment.tone)}>
                  <Progress value={segment.share} className="h-2 bg-transparent" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200">
        <CardHeader>
          <CardTitle>Engagement & spend</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            icon={RefreshCcw}
            title="Transactions per customer"
            value={totals.transactionsPerCustomer.toFixed(2)}
            delta={engagementDelta}
            description="Average tickets handled per customer"
          />
          <MetricTile
            icon={Sparkles}
            title="Avg. order value"
            value={formatCurrency(averageTransactionValue)}
            delta={spendDelta}
            description="Spend per transaction"
          />
          <MetricTile
            icon={ArrowUpRight}
            title="Customer growth"
            value={((insights.totalCustomers - (previousInsights?.totalCustomers ?? 0)) || 0).toLocaleString()}
            delta={computeDelta(insights.totalCustomers, previousInsights?.totalCustomers ?? null)}
            description="Net change vs prior period"
          />
          <MetricTile
            icon={ArrowDownRight}
            title="Churn risk"
            value={`${(100 - totals.retentionRate).toFixed(1)}%`}
            description="Share of customers not yet returning"
          />
        </CardContent>
      </Card>
    </div>
  );
}

interface DeltaPillProps {
  delta: DeltaInfo;
}

function DeltaPill({ delta }: DeltaPillProps) {
  const color = delta.positive ? "text-emerald-600" : delta.negative ? "text-red-600" : "text-muted-foreground";
  const Icon = delta.positive ? ArrowUpRight : delta.negative ? ArrowDownRight : undefined;
  return (
    <div className={cn("inline-flex items-center gap-1 text-xs font-medium", color)}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      <span>{delta.label}</span>
    </div>
  );
}

interface MetricTileProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  value: string;
  description?: string;
  delta?: DeltaInfo;
}

function MetricTile({ icon: Icon, title, value, description, delta }: MetricTileProps) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{title}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
      {delta ? <DeltaPill delta={delta} /> : null}
      {description ? <p className="mt-2 text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}
