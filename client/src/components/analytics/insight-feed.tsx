import { useQuery } from "@tanstack/react-query";
import { Brain, Lightbulb, Package, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useLocation } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { formatDate } from "@/lib/pos-utils";
import { cn } from "@/lib/utils";
import type { LowStockAlert, Product } from "@shared/schema";

// Extended type that includes product info from the API
interface LowStockAlertWithProduct extends LowStockAlert {
  product?: Product | null;
}

interface AiInsight {
  id: string;
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  actionable: boolean;
  confidence?: number;
  generatedAt: string;
}

interface FeedItem {
  id: string;
  type: "ai" | "alert";
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  timestamp: string;
  tags: string[];
  actionable?: boolean;
}

interface InsightFeedProps {
  storeId: string;
  alerts: LowStockAlertWithProduct[];
  canViewAi: boolean;
  className?: string;
}

const severityRank: Record<FeedItem["severity"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const severityTone: Record<FeedItem["severity"], string> = {
  critical: "border-red-200 bg-red-50 text-red-800",
  high: "border-orange-200 bg-orange-50 text-orange-800",
  medium: "border-yellow-200 bg-yellow-50 text-yellow-800",
  low: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export default function InsightFeed({ storeId, alerts, canViewAi, className }: InsightFeedProps) {
  const [, setLocation] = useLocation();

  const handleTakeAction = (item: FeedItem) => {
    // Navigate based on item type and category
    if (item.type === "alert" || item.tags.includes("Inventory")) {
      setLocation("/inventory");
    } else if (item.tags.includes("revenue") || item.tags.includes("Revenue")) {
      setLocation("/analytics");
    } else {
      setLocation("/analytics");
    }
  };

  const {
    data: aiInsights = [],
    isLoading: aiLoading,
    isError: aiError,
  } = useQuery<AiInsight[]>({
    queryKey: ["/api/ai/insights", storeId],
    enabled: canViewAi && Boolean(storeId),
    queryFn: async () => {
      const response: any = await apiClient.get<any>("/ai/insights", { storeId });
      if (!response?.enabled) {
        return [];
      }
      const raw = Array.isArray(response.insights) ? response.insights : [];
      return raw.map((ins: any, index: number) => ({
        id: ins.id ?? `${index}-${ins.generatedAt ?? Date.now()}`,
        category: ins.category ?? "general",
        priority: (ins.priority ?? "medium").toLowerCase(),
        title: ins.title ?? "AI Insight",
        description: ins.description ?? "",
        actionable: Boolean(ins.actionable ?? false),
        confidence: typeof ins.confidence === "number" ? Math.round(ins.confidence * 100) : undefined,
        generatedAt: ins.generatedAt ?? new Date().toISOString(),
      })) as AiInsight[];
    },
  });

  const feedItems = useMemo<FeedItem[]>(() => {
    const aiItems: FeedItem[] = aiInsights.map((ins) => ({
      id: `ai-${ins.id}`,
      type: "ai",
      title: ins.title,
      description: ins.description,
      severity: (ins.priority ?? "medium") as FeedItem["severity"],
      timestamp: ins.generatedAt,
      tags: ["AI", ins.category],
      actionable: ins.actionable,
    }));

    const alertItems: FeedItem[] = alerts.map((alert) => {
      const stockDelta = (alert.currentStock ?? 0) - (alert.minStockLevel ?? 0);
      let severity: FeedItem["severity"] = "medium";
      if (alert.currentStock === 0) {
        severity = "critical";
      } else if (stockDelta < 0) {
        severity = stockDelta < -5 ? "high" : "medium";
      } else {
        severity = "low";
      }

      const descriptionParts = [
        `Current stock ${alert.currentStock ?? 0}`,
        `Minimum ${alert.minStockLevel ?? 0}`,
      ];
      const reorder = (alert as any)?.reorderPoint;
      if (reorder != null) {
        descriptionParts.push(`Reorder ${reorder}`);
      }

      const productName = alert.product?.name ?? alert.productId?.slice(0, 8) ?? "Unknown";
      return {
        id: `alert-${alert.id}`,
        type: "alert",
        title: `Low stock: ${productName}`,
        description: descriptionParts.join(" • "),
        severity,
        timestamp: (typeof alert.createdAt === "string" ? alert.createdAt : alert.createdAt?.toISOString()) ?? new Date().toISOString(),
        tags: ["Rule", "Inventory"],
        actionable: true,
      } satisfies FeedItem;
    });

    return [...aiItems, ...alertItems]
      .sort((a, b) => {
        const severityDiff = severityRank[b.severity] - severityRank[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      })
      .slice(0, 8);
  }, [aiInsights, alerts]);

  const loading = canViewAi ? aiLoading : false;
  const error = canViewAi ? aiError : false;

  return (
    <Card className={cn("border border-slate-200", className)}>
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-purple-500" />
          Insight Feed
        </CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {canViewAi ? (
            <>
              <Badge variant="outline">AI Insights</Badge>
              <Badge variant="outline">Rule Alerts</Badge>
            </>
          ) : (
            <span>AI narratives available to admins or managers.</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            Loading insights…
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load AI insights. Please try again later.
          </div>
        ) : feedItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
            <Brain className="h-8 w-8 text-muted-foreground/50" />
            <p>No insights or alerts yet. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feedItems.map((item) => {
              const Icon = item.type === "ai" ? Lightbulb : Package;
              const severityClasses = severityTone[item.severity] ?? "border-slate-200 bg-slate-50 text-slate-700";

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-md border p-4 shadow-sm transition hover:shadow", severityClasses,
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{item.title}</span>
                      <Badge variant="outline" className="text-[0.65rem] uppercase tracking-wide">
                        {item.type === "ai" ? "AI" : "Rule"}
                      </Badge>
                      <Badge variant="outline" className="text-[0.65rem] uppercase tracking-wide">
                        {item.severity}
                      </Badge>
                    </div>
                    <span className="text-xs opacity-80">
                      {formatDate(new Date(item.timestamp), "MMM dd, yyyy HH:mm")}
                    </span>
                  </div>
                  <p className="text-sm opacity-90">{item.description}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[0.65rem] uppercase tracking-wide">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    {item.actionable && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-xs"
                        onClick={() => handleTakeAction(item)}
                      >
                        Take action
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {canViewAi ? null : (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-muted-foreground">
            Enable AI analytics in the admin panel to unlock automated narratives and forecasts for this store.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
