import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Brain, Zap, AlertTriangle, CheckCircle, Clock, TrendingUp, TrendingDown, Target, Lightbulb, BarChart3, Users, Package, DollarSign } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/pos-utils";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface AiInsight {
  id: string;
  insightType: string;
  title: string;
  description: string;
  severity: string;
  data: any;
  isRead: boolean;
  isActioned: boolean;
  createdAt: string;
  actionedAt?: string;
}

interface InsightSummary {
  total: number;
  unread: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  byType: Record<string, number>;
}

interface AiInsightsProps {
  storeId: string;
  className?: string;
}

const INSIGHT_TYPES = [
  { value: "all", label: "All Insights", icon: Brain },
  { value: "trend", label: "Trends", icon: TrendingUp },
  { value: "anomaly", label: "Anomalies", icon: AlertTriangle },
  { value: "recommendation", label: "Recommendations", icon: Lightbulb },
  { value: "pattern", label: "Patterns", icon: BarChart3 },
];

const SEVERITY_LEVELS = [
  { value: "all", label: "All Severities" },
  { value: "critical", label: "Critical", color: "text-red-600 bg-red-50 border-red-200" },
  { value: "high", label: "High", color: "text-orange-600 bg-orange-50 border-orange-200" },
  { value: "medium", label: "Medium", color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  { value: "low", label: "Low", color: "text-green-600 bg-green-50 border-green-200" },
];

export default function AiInsights({ storeId, className }: AiInsightsProps) {
  const [selectedType, setSelectedType] = useState("all");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch AI insights
  const { data: insights = [], isLoading } = useQuery<AiInsight[]>({
    queryKey: ["/api/stores", storeId, "ai/insights"],
    queryFn: () => apiRequest("GET", `/api/stores/${storeId}/ai/insights`).then(res => res.json()),
  });

  // Calculate summary statistics
  const summary: InsightSummary = {
    total: insights.length,
    unread: insights.filter(i => !i.isRead).length,
    critical: insights.filter(i => i.severity === "critical").length,
    high: insights.filter(i => i.severity === "high").length,
    medium: insights.filter(i => i.severity === "medium").length,
    low: insights.filter(i => i.severity === "low").length,
    byType: insights.reduce((acc, insight) => {
      acc[insight.insightType] = (acc[insight.insightType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  // Filter insights based on selected criteria
  const filteredInsights = insights.filter(insight => {
    const typeMatch = selectedType === "all" || insight.insightType === selectedType;
    const severityMatch = selectedSeverity === "all" || insight.severity === selectedSeverity;
    return typeMatch && severityMatch;
  });

  const getSeverityColor = (severity: string) => {
    const level = SEVERITY_LEVELS.find(l => l.value === severity);
    return level?.color || "text-gray-600 bg-gray-50 border-gray-200";
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return AlertTriangle;
      case "high": return AlertTriangle;
      case "medium": return Clock;
      case "low": return CheckCircle;
      default: return Clock;
    }
  };

  const getInsightIcon = (type: string) => {
    const insightType = INSIGHT_TYPES.find(t => t.value === type);
    return insightType?.icon || Brain;
  };

  const markAsRead = async (insightId: string) => {
    await apiRequest("PATCH", `/api/stores/${storeId}/ai/insights/${insightId}`, {
      isRead: true,
    });
  };

  const markAsActioned = async (insightId: string) => {
    await apiRequest("PATCH", `/api/stores/${storeId}/ai/insights/${insightId}`, {
      isActioned: true,
      actionedAt: new Date().toISOString(),
    });
  };

  const renderInsightCard = (insight: AiInsight) => {
    const Icon = getSeverityIcon(insight.severity);
    const TypeIcon = getInsightIcon(insight.insightType);

    return (
      <div
        key={insight.id}
        className={cn(
          "p-4 rounded-lg border transition-all",
          getSeverityColor(insight.severity),
          !insight.isRead && "ring-2 ring-blue-200",
          insight.isActioned && "opacity-75"
        )}
      >
        <div className="flex items-start space-x-3">
          <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h4 className="font-medium">{insight.title}</h4>
              <Badge variant="outline" className="text-xs">
                <TypeIcon className="w-3 h-3 mr-1" />
                {insight.insightType}
              </Badge>
              <Badge 
                variant={insight.severity === "critical" ? "destructive" : "secondary"}
                className="text-xs"
              >
                {insight.severity}
              </Badge>
              {!insight.isRead && (
                <Badge variant="default" className="text-xs">
                  New
                </Badge>
              )}
              {insight.isActioned && (
                <Badge variant="outline" className="text-xs">
                  Actioned
                </Badge>
              )}
            </div>
            <p className="text-sm mb-3">{insight.description}</p>
            
            {/* Insight Data Visualization */}
            {insight.data && (
              <div className="mb-3 p-3 bg-white/50 rounded border">
                <h5 className="text-sm font-medium mb-2">Data Analysis</h5>
                {insight.data.impact && (
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-xs text-gray-600">Impact:</span>
                    <Badge 
                      variant={insight.data.impact > 0 ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {insight.data.impact > 0 ? "+" : ""}{insight.data.impact}%
                    </Badge>
                  </div>
                )}
                {insight.data.confidence && (
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Confidence</span>
                      <span>{insight.data.confidence}%</span>
                    </div>
                    <Progress value={insight.data.confidence} className="h-2" />
                  </div>
                )}
                {insight.data.recommendations && (
                  <div className="text-xs">
                    <span className="text-gray-600">Recommendations:</span>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      {insight.data.recommendations.map((rec: string, idx: number) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {formatDate(new Date(insight.createdAt), "MMM dd, yyyy HH:mm")}
              </span>
              <div className="flex items-center space-x-2">
                {!insight.isRead && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => markAsRead(insight.id)}
                  >
                    Mark Read
                  </Button>
                )}
                {!insight.isActioned && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => markAsActioned(insight.id)}
                  >
                    Mark Actioned
                  </Button>
                )}
                <Button variant="ghost" size="sm">
                  View Details
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Critical Alerts */}
      {summary.critical > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>{summary.critical} critical insights</strong> require immediate attention. 
            Review and take action on these high-priority recommendations.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="insights">All Insights</TabsTrigger>
          <TabsTrigger value="actions">Action Items</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Insights</CardTitle>
                <Brain className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.total}</div>
                <p className="text-xs text-muted-foreground">
                  {summary.unread} unread
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Critical</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{summary.critical}</div>
                <p className="text-xs text-muted-foreground">
                  Requires immediate action
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Priority</CardTitle>
                <TrendingUp className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{summary.high}</div>
                <p className="text-xs text-muted-foreground">
                  Review within 24 hours
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Actioned</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {insights.filter(i => i.isActioned).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Completed actions
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Insight Types Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Insights by Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {INSIGHT_TYPES.slice(1).map((type) => {
                  const Icon = type.icon;
                  const count = summary.byType[type.value] || 0;
                  return (
                    <div key={type.value} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <Icon className="w-8 h-8 text-blue-600" />
                      <div>
                        <p className="text-sm text-gray-600">{type.label}</p>
                        <p className="text-lg font-semibold">{count}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recent Critical Insights */}
          {summary.critical > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Critical Insights</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {insights
                    .filter(i => i.severity === "critical")
                    .slice(0, 3)
                    .map(renderInsightCard)}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filter Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">Type:</span>
                  <select 
                    value={selectedType} 
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    {INSIGHT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">Severity:</span>
                  <select 
                    value={selectedSeverity} 
                    onChange={(e) => setSelectedSeverity(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    {SEVERITY_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Insights List */}
          <Card>
            <CardHeader>
              <CardTitle>
                {filteredInsights.length} Insights
                {selectedType !== "all" && ` (${selectedType})`}
                {selectedSeverity !== "all" && ` (${selectedSeverity})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredInsights.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Brain className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No insights match your filters</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredInsights.map(renderInsightCard)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-6">
          {/* Action Items Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Action Items Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600 mb-2">
                    {insights.filter(i => i.severity === "critical" && !i.isActioned).length}
                  </div>
                  <p className="text-sm text-gray-600">Critical Actions</p>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600 mb-2">
                    {insights.filter(i => i.severity === "high" && !i.isActioned).length}
                  </div>
                  <p className="text-sm text-gray-600">High Priority</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 mb-2">
                    {insights.filter(i => i.isActioned).length}
                  </div>
                  <p className="text-sm text-gray-600">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Pending Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {insights
                  .filter(i => !i.isActioned && (i.severity === "critical" || i.severity === "high"))
                  .map(renderInsightCard)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 