import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, ShieldAlert, ShieldCheck, Thermometer } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { useAnalyticsScope } from "./analytics-scope-context";

interface StoreHealthWidgetProps {
  className?: string;
}

interface DashboardResponse {
  enabled: boolean;
  dashboard?: {
    summary?: {
      totalProducts?: number;
      criticalAnomalies?: number;
      highPriorityInsights?: number;
      averageConfidence?: number;
    };
    criticalAnomalies?: Array<{ severity: string }>;
    topInsights?: Array<{ title: string; priority: string; actionable: boolean; impact: string }>;
    trends?: {
      demandTrend?: string;
      riskLevel?: string;
      performanceScore?: number;
    };
    metadata?: {
      generatedAt?: string;
    };
  };
}

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

export function StoreHealthWidget({ className }: StoreHealthWidgetProps) {
  const { user } = useAuth();
  const { selectedStoreId } = useAnalyticsScope();

  const canViewAi = Boolean(user?.isAdmin || user?.role === "manager");
  const storeId = selectedStoreId ?? "";

  const { data, isPending, isError } = useQuery<DashboardResponse>({
    queryKey: ["/api/ai/dashboard", storeId],
    enabled: canViewAi && Boolean(storeId),
    queryFn: async () => apiClient.get<DashboardResponse>("/ai/dashboard", { storeId }),
  });
  const dashboard = data?.dashboard;
  const trends = dashboard?.trends ?? {};
  const summary = dashboard?.summary ?? {};

  const performanceScore = Math.min(100, Math.max(0, trends.performanceScore ?? 82));
  const averageConfidence = Math.round((summary.averageConfidence ?? 0.78) * 100);
  const riskLevel = (trends.riskLevel ?? "low").toLowerCase();
  const riskColor = RISK_COLORS[riskLevel] ?? RISK_COLORS.low;
  const demandTrend = trends.demandTrend ?? "stable";

  const healthIndicators = useMemo(
    () => [
      {
        label: "Critical anomalies",
        value: summary.criticalAnomalies ?? 0,
        icon: ShieldAlert,
        tone: summary.criticalAnomalies ? "text-red-600" : "text-slate-500",
      },
      {
        label: "High priority insights",
        value: summary.highPriorityInsights ?? 0,
        icon: Thermometer,
        tone: "text-slate-600",
      },
      {
        label: "Avg. AI confidence",
        value: `${averageConfidence}%`,
        icon: ShieldCheck,
        tone: "text-emerald-600",
      },
    ],
    [summary.criticalAnomalies, summary.highPriorityInsights, averageConfidence],
  );

  if (!canViewAi) {
    return (
      <Card className={cn("border border-dashed border-slate-200 bg-slate-50", className)}>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Store Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Store health insights are available for admin and manager roles.</p>
          <p>Ask an administrator to grant access to AI analytics.</p>
        </CardContent>
      </Card>
    );
  }

  if (!storeId) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Store Health</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select a store to view health metrics.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-sm font-semibold">Store Health</CardTitle>
          <p className="text-xs text-muted-foreground">Live risk and readiness indicators</p>
        </div>
        <Badge variant="outline" className={cn("capitalize border-none", riskColor)}>
          {riskLevel} risk
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? (
          <div className="space-y-3">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
            <Progress value={50} className="h-2" />
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              {[0, 1, 2].map((idx) => (
                <div key={idx} className="space-y-1">
                  <div className="h-3 w-12 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        ) : isError || !dashboard ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-amber-600">
              <ShieldAlert className="h-4 w-4" /> Unable to load health data
            </p>
            <p>AI analytics responded unexpectedly. Try again later.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Overall health score</span>
                <span>{performanceScore}%</span>
              </div>
              <Progress value={performanceScore} className="h-2" />
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              {healthIndicators.map((indicator) => (
                <div key={indicator.label} className="rounded-md border border-slate-100 p-3">
                  <div className="flex items-center gap-1 text-[0.65rem] uppercase tracking-wide text-slate-500">
                    <indicator.icon className={cn("h-3.5 w-3.5", indicator.tone)} />
                    {indicator.label}
                  </div>
                  <div className="mt-2 text-lg font-semibold">{indicator.value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-slate-100 bg-slate-50/60 p-3 text-xs">
              <div className="flex items-center gap-2 font-medium text-slate-700">
                <Activity className="h-3.5 w-3.5" /> Demand trend
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                <span className="capitalize">{demandTrend}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {summary.totalProducts ?? 0} tracked products
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

