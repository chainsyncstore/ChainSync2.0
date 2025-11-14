import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownRight, ArrowUpRight, Loader2, Zap } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiClient } from "@/lib/api-client";
import { formatDate } from "@/lib/pos-utils";
import { cn } from "@/lib/utils";

interface ForecastRecord {
  productId: string;
  productName: string;
  predictedDemand: number;
  confidence: number;
  forecastDate: string;
  trend?: "increasing" | "decreasing" | "stable";
  historicalData?: Array<{ date: string; quantity: number }>;
}

interface ForecastingWidgetProps {
  storeId: string;
  canViewAi: boolean;
  className?: string;
  days?: number;
}

function trendIcon(trend?: string) {
  switch (trend) {
    case "increasing":
      return <ArrowUpRight className="h-4 w-4 text-emerald-600" />;
    case "decreasing":
      return <ArrowDownRight className="h-4 w-4 text-red-500" />;
    default:
      return <Activity className="h-4 w-4 text-slate-500" />;
  }
}

export default function ForecastingWidget({ storeId, canViewAi, className, days = 14 }: ForecastingWidgetProps) {
  const forecastDays = Math.max(1, days);

  const {
    data: forecasts = [],
    isLoading,
    isError,
  } = useQuery<ForecastRecord[]>({
    queryKey: ["/api/ai/forecast", storeId, forecastDays],
    enabled: canViewAi && Boolean(storeId),
    queryFn: async () => {
      const response: any = await apiClient.get<any>("/ai/forecast", {
        storeId,
        days: String(forecastDays),
      });
      if (!response?.enabled) {
        return [];
      }
      const raw = Array.isArray(response.forecasts) ? response.forecasts : [];
      return raw.map((forecast: any): ForecastRecord => ({
        productId: forecast.productId ?? "",
        productName: forecast.productName ?? "Unnamed product",
        predictedDemand: Math.round(forecast.predictedDemand ?? 0),
        confidence: typeof forecast.confidence === "number" ? forecast.confidence : 0.75,
        forecastDate: forecast.forecastDate ?? new Date().toISOString(),
        trend: forecast.trend ?? "stable",
        historicalData: Array.isArray(forecast.historicalData) ? forecast.historicalData : [],
      }));
    },
  });

  const highlight = useMemo(() => {
    if (!forecasts.length) return null;
    return forecasts.slice().sort((a, b) => (b.predictedDemand ?? 0) - (a.predictedDemand ?? 0))[0];
  }, [forecasts]);

  const topForecasts = useMemo(() => {
    return forecasts
      .slice()
      .sort((a, b) => (b.predictedDemand ?? 0) - (a.predictedDemand ?? 0))
      .slice(0, 4);
  }, [forecasts]);

  const increasingCount = useMemo(
    () => forecasts.filter((f) => f.trend === "increasing").length,
    [forecasts],
  );

  const decreasingCount = useMemo(
    () => forecasts.filter((f) => f.trend === "decreasing").length,
    [forecasts],
  );

  const totalPredicted = useMemo(
    () => forecasts.reduce((sum, item) => sum + (item.predictedDemand ?? 0), 0),
    [forecasts],
  );

  if (!canViewAi) {
    return (
      <Card className={cn("border border-slate-200", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Zap className="h-5 w-5 text-purple-500" />
            Forecast Outlook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>AI-powered forecasting is available to admin and manager roles.</p>
          <p>Ask an administrator to enable AI analytics to unlock demand predictions and proactive trend alerts.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={cn("border border-slate-200", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Zap className="h-5 w-5 text-purple-500 animate-pulse" />
            Forecast Outlook
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating forecasts…
        </CardContent>
      </Card>
    );
  }

  if (isError || !forecasts.length || !highlight) {
    return (
      <Card className={cn("border border-slate-200", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Zap className="h-5 w-5 text-purple-500" />
            Forecast Outlook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>No forecast data is available yet for this store.</p>
          <p>Once the model has enough history it will project demand for the next {forecastDays} days.</p>
        </CardContent>
      </Card>
    );
  }

  const highlightConfidence = Math.round((highlight.confidence ?? 0.75) * 100);

  return (
    <Card className={cn("border border-slate-200", className)}>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Zap className="h-5 w-5 text-purple-500" />
            Forecast Outlook
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Projected demand over the next {forecastDays} days
          </p>
        </div>
        <Badge variant="outline" className="text-[0.7rem] uppercase tracking-wide">
          {forecasts.length} products
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border border-purple-200 bg-purple-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-purple-600">Highlight forecast</p>
              <h3 className="text-xl font-semibold text-purple-800">
                {highlight.predictedDemand.toLocaleString()} units
              </h3>
              <p className="text-xs text-purple-700">
                {highlight.productName}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-xs text-purple-600">Trend</p>
                <div className="flex items-center gap-1 text-sm font-medium text-purple-700">
                  {trendIcon(highlight.trend)}
                  <span className="capitalize">{highlight.trend ?? "stable"}</span>
                </div>
              </div>
              <div className="w-24">
                <p className="text-xs text-purple-600">Confidence</p>
                <Progress value={highlightConfidence} className="h-2 bg-purple-200" />
                <p className="mt-1 text-center text-xs text-purple-700">{highlightConfidence}%</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs text-muted-foreground">Total predicted demand</p>
            <p className="text-lg font-semibold">{totalPredicted.toLocaleString()} units</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs text-muted-foreground">Increasing trends</p>
            <p className="text-lg font-semibold text-emerald-600">{increasingCount}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs text-muted-foreground">Declining trends</p>
            <p className="text-lg font-semibold text-red-600">{decreasingCount}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Top forecasted products</span>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              View details
            </Button>
          </div>
          <div className="space-y-2">
            {topForecasts.map((forecast) => {
              const confidencePct = Math.round((forecast.confidence ?? 0.75) * 100);
              return (
                <div
                  key={forecast.productId || forecast.productName}
                  className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {trendIcon(forecast.trend)}
                      <span className="font-medium">{forecast.productName}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {forecast.predictedDemand.toLocaleString()} units
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground">
                    <span>Forecast date: {formatDate(new Date(forecast.forecastDate), "MMM dd")}</span>
                    <span>Confidence: {confidencePct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
