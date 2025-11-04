import { useQuery } from "@tanstack/react-query";
import { Brain, Zap, AlertTriangle, CheckCircle, Clock, Target, BarChart3, LineChart as LineChartIcon } from "lucide-react";
import { useState, useEffect } from "react";

import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { formatDate } from "@/lib/pos-utils";

import { cn } from "@/lib/utils";

interface ForecastData {
  date: string;
  actualDemand: number;
  predictedDemand: number;
  confidenceLower: number;
  confidenceUpper: number;
  accuracy: number;
}

interface ForecastModel {
  id: string;
  name: string;
  modelType: string;
  accuracy: number;
  lastTrained: string;
  isActive: boolean;
}

interface AiInsight {
  id: string;
  insightType: string;
  title: string;
  description: string;
  severity: string;
  isRead: boolean;
  createdAt: string;
}

interface DemandForecastProps {
  storeId: string;
  className?: string;
}

const FORECAST_PERIODS = [
  { value: "7", label: "Next 7 Days" },
  { value: "14", label: "Next 14 Days" },
  { value: "30", label: "Next 30 Days" },
  { value: "90", label: "Next 90 Days" },
];

const MODEL_TYPES = [
  { value: "linear", label: "Linear Regression", description: "Simple trend-based forecasting" },
  { value: "arima", label: "ARIMA", description: "Advanced time series analysis" },
  { value: "lstm", label: "LSTM Neural Network", description: "Deep learning for complex patterns" },
  { value: "prophet", label: "Prophet", description: "Facebook's forecasting tool" },
  { value: "ensemble", label: "Ensemble", description: "Combined multiple models" },
];

export default function DemandForecast({ storeId, className }: DemandForecastProps) {
  const [forecastPeriod, setForecastPeriod] = useState("30");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [chartType, setChartType] = useState("line");

  // Fetch forecast models from AI status (mocked list via status)
  const { data: models = [] } = useQuery<ForecastModel[]>({
    queryKey: ["/api/ai/status", storeId],
    queryFn: async () => {
      const status: any = await apiClient.get<any>(`/ai/status`);
      const m = status?.models?.forecasting
        ? [{
            id: 'forecasting-default',
            name: 'Ensemble Forecasting',
            modelType: status.models.forecasting.type || 'ensemble',
            accuracy: status.models.forecasting.accuracy || 0.85,
            lastTrained: status.models.forecasting.lastTrained || new Date().toISOString(),
            isActive: true,
          }]
        : [];
      return m as ForecastModel[];
    },
  });

  // Fetch demand forecasts
  const { data: forecastData = [], isLoading } = useQuery<ForecastData[]>({
    queryKey: ["/api/ai/forecast", storeId, forecastPeriod, selectedModel],
    queryFn: async () => {
      const resp: any = await apiClient.get<any>(`/ai/forecast`, {
        storeId,
        days: forecastPeriod,
      });
      // Server returns { enabled, forecasts, metadata }
      const f = Array.isArray(resp?.forecasts) ? resp.forecasts : [];
      // Map to chart-friendly structure if needed
      return f.map((it: any, idx: number) => ({
        date: it.forecastDate || new Date(Date.now() + (idx + 1) * 86400000).toISOString(),
        actualDemand: it.historicalData?.slice(-1)?.[0]?.quantity ?? 0,
        predictedDemand: Math.round(it.predictedDemand || 0),
        confidenceLower: Math.max(0, Math.round((it.predictedDemand || 0) * 0.8)),
        confidenceUpper: Math.round((it.predictedDemand || 0) * 1.2),
        accuracy: Math.round(((it.confidence || 0.8) * 100)),
      })) as ForecastData[];
    },
    enabled: !!storeId,
  });

  // Fetch AI insights
  const { data: insights = [] } = useQuery<AiInsight[]>({
    queryKey: ["/api/ai/insights", storeId],
    queryFn: async () => {
      const resp: any = await apiClient.get<any>(`/ai/insights`, { storeId });
      const raw = Array.isArray(resp?.insights) ? resp.insights : [];
      return raw.map((ins: any, idx: number) => ({
        id: ins.id || `${idx}-${ins.generatedAt || Date.now()}`,
        insightType: ins.category || 'general',
        title: ins.title || 'Insight',
        description: ins.description || '',
        severity: ins.priority || 'medium',
        isRead: false,
        createdAt: ins.generatedAt || new Date().toISOString(),
      })) as AiInsight[];
    },
  });

  // Auto-select first model when models are loaded
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

  const currentModel = models.find(m => m.id === selectedModel);
  const unreadInsights = insights.filter(i => !i.isRead);
  const criticalInsights = insights.filter(i => i.severity === "critical");

  const renderForecastChart = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (forecastData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <Brain className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No forecast data available</p>
            <p className="text-sm">Select a model and period to generate forecasts</p>
          </div>
        </div>
      );
    }

    switch (chartType) {
      case "line":
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => formatDate(new Date(value), "MMM dd")}
              />
              <YAxis domain={[0, 'dataMax + 10']} />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  value,
                  name === 'actualDemand' ? 'Actual Demand' : 
                  name === 'predictedDemand' ? 'Predicted Demand' : 
                  name === 'confidenceLower' ? 'Lower Bound' : 'Upper Bound'
                ]}
                labelFormatter={(label) => formatDate(new Date(label), "MMM dd, yyyy")}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="actualDemand" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={{ fill: "#3B82F6", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
                name="Actual Demand"
              />
              <Line 
                type="monotone" 
                dataKey="predictedDemand" 
                stroke="#10B981" 
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: "#10B981", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
                name="Predicted Demand"
              />
              <Line 
                type="monotone" 
                dataKey="confidenceUpper" 
                stroke="#F59E0B" 
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                name="Confidence Upper"
              />
              <Line 
                type="monotone" 
                dataKey="confidenceLower" 
                stroke="#F59E0B" 
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                name="Confidence Lower"
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case "area":
        return (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => formatDate(new Date(value), "MMM dd")}
              />
              <YAxis domain={[0, 'dataMax + 10']} />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  value,
                  name === 'actualDemand' ? 'Actual Demand' : 'Predicted Demand'
                ]}
                labelFormatter={(label) => formatDate(new Date(label), "MMM dd, yyyy")}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="actualDemand" 
                stackId="1"
                stroke="#3B82F6" 
                fill="#3B82F6" 
                fillOpacity={0.6}
                name="Actual Demand"
              />
              <Area 
                type="monotone" 
                dataKey="predictedDemand" 
                stackId="2"
                stroke="#10B981" 
                fill="#10B981" 
                fillOpacity={0.6}
                name="Predicted Demand"
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      case "bar":
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => formatDate(new Date(value), "MMM dd")}
              />
              <YAxis domain={[0, 'dataMax + 10']} />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  value,
                  name === 'actualDemand' ? 'Actual Demand' : 'Predicted Demand'
                ]}
                labelFormatter={(label) => formatDate(new Date(label), "MMM dd, yyyy")}
              />
              <Legend />
              <Bar dataKey="actualDemand" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Actual Demand" />
              <Bar dataKey="predictedDemand" fill="#10B981" radius={[4, 4, 0, 0]} name="Predicted Demand" />
            </BarChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-red-600 bg-red-50 border-red-200";
      case "high": return "text-orange-600 bg-orange-50 border-orange-200";
      case "medium": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "low": return "text-green-600 bg-green-50 border-green-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
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

  return (
    <div className={cn("space-y-6", className)}>
      {/* AI Insights Alerts */}
      {criticalInsights.length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>{criticalInsights.length} critical AI insights</strong> require immediate attention. 
            <Button variant="link" className="p-0 h-auto text-red-800 underline">
              View insights
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Forecast Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl flex items-center space-x-2">
              <Brain className="w-6 h-6 text-purple-600" />
              <span>AI Demand Forecasting</span>
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Select value={chartType} onValueChange={setChartType}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="line">
                    <div className="flex items-center space-x-2">
                      <LineChartIcon className="w-4 h-4" />
                      <span>Line</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="area">
                    <div className="flex items-center space-x-2">
                      <BarChart3 className="w-4 h-4" />
                      <span>Area</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="bar">
                    <div className="flex items-center space-x-2">
                      <BarChart3 className="w-4 h-4" />
                      <span>Bar</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select value={forecastPeriod} onValueChange={setForecastPeriod}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORECAST_PERIODS.map((period) => (
                    <SelectItem key={period.value} value={period.value}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex items-center space-x-2">
                        <span>{model.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {model.modelType}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Model Performance Summary */}
          {currentModel && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="flex items-center space-x-3 p-3 bg-purple-50 rounded-lg">
                <Brain className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">Model Accuracy</p>
                  <p className="text-lg font-semibold text-purple-600">
                    {((currentModel.accuracy || 0) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
                <Target className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Model Type</p>
                  <p className="text-lg font-semibold text-blue-600">
                    {currentModel.modelType.toUpperCase()}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                <Clock className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Last Trained</p>
                  <p className="text-lg font-semibold text-green-600">
                    {currentModel.lastTrained ? formatDate(new Date(currentModel.lastTrained), "MMM dd") : "Never"}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-3 bg-orange-50 rounded-lg">
                <Zap className="w-8 h-8 text-orange-600" />
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="text-lg font-semibold text-orange-600">
                    {currentModel.isActive ? "Active" : "Inactive"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Forecast Chart */}
          {renderForecastChart()}
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center space-x-2">
            <Zap className="w-6 h-6 text-yellow-600" />
            <span>AI Insights</span>
            {unreadInsights.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadInsights.length} new
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {insights.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Brain className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No AI insights available</p>
              <p className="text-sm">AI will generate insights as it analyzes your data</p>
            </div>
          ) : (
            <div className="space-y-4">
              {insights.slice(0, 5).map((insight) => {
                const Icon = getSeverityIcon(insight.severity);
                return (
                  <div
                    key={insight.id}
                    className={cn(
                      "p-4 rounded-lg border",
                      getSeverityColor(insight.severity),
                      !insight.isRead && "ring-2 ring-blue-200"
                    )}
                  >
                    <div className="flex items-start space-x-3">
                      <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-medium">{insight.title}</h4>
                          <Badge variant="outline" className="text-xs">
                            {insight.insightType}
                          </Badge>
                          {!insight.isRead && (
                            <Badge variant="default" className="text-xs">
                              New
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm mb-2">{insight.description}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            {formatDate(new Date(insight.createdAt), "MMM dd, yyyy")}
                          </span>
                          <Button variant="ghost" size="sm">
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Forecast Models</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODEL_TYPES.map((modelType) => (
              <div key={modelType.value} className="p-4 border rounded-lg hover:border-primary/50 transition-colors">
                <h4 className="font-medium mb-2">{modelType.label}</h4>
                <p className="text-sm text-gray-600 mb-3">{modelType.description}</p>
                <Button variant="outline" size="sm" className="w-full">
                  Train Model
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 