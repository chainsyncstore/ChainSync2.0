import { db } from '../db';
import { forecastModels as aiModels, aiInsights, transactions, transactionItems, products, inventory } from '@shared/schema';
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { OpenAIService } from '../openai/service';

export interface ForecastingModel {
  id: string;
  name: string;
  type: 'linear' | 'arima' | 'prophet' | 'lstm' | 'ensemble' | 'xgboost' | 'random_forest';
  parameters: Record<string, any>;
  accuracy: number;
  lastTrained: Date;
  isActive: boolean;
}

export interface ForecastResult {
  date: string;
  predictedValue: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
}

export interface AnomalyDetection {
  timestamp: Date;
  metric: string;
  value: number;
  expectedValue: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface AIInsight {
  id: string;
  type: 'forecast' | 'anomaly' | 'recommendation' | 'trend' | 'pattern' | 'optimization';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  data: any;
  actionable: boolean;
  confidence: number;
}

export class AdvancedAnalyticsService {
  private openaiService: OpenAIService;

  constructor() {
    this.openaiService = new OpenAIService();
  }

  /**
   * Generate demand forecast using multiple models
   */
  async generateDemandForecast(
    storeId: string,
    productId?: string,
    days: number = 30,
    modelType?: string
  ): Promise<ForecastResult[]> {
    try {
      // Get historical sales data
      const salesData = await this.getHistoricalSalesData(storeId, productId, 90);
      
      if (salesData.length < 30) {
        throw new Error('Insufficient historical data for forecasting');
      }

      // Get active models
      const models = await this.getActiveModels(storeId, modelType);
      
      if (models.length === 0) {
        // Create default model if none exist
        const defaultModel = await this.createDefaultModel(storeId);
        models.push(defaultModel);
      }

      // Generate forecasts using each model
      const forecasts: ForecastResult[][] = [];
      
      for (const model of models) {
        const forecast = await this.generateForecastWithModel(model, salesData, days);
        forecasts.push(forecast);
      }

      // Combine forecasts using ensemble method
      const ensembleForecast = this.combineForecasts(forecasts);
      
      // Store forecast insights
      await this.storeForecastInsight(storeId, ensembleForecast, productId);

      return ensembleForecast;
    } catch (error) {
      const anyErr = error as any;
      logger.error('Error generating demand forecast', {
        storeId,
        productId,
        error: anyErr?.message
      });
      throw error;
    }
  }

  /**
   * Detect anomalies in sales and inventory data
   */
  async detectAnomalies(storeId: string): Promise<AnomalyDetection[]> {
    try {
      const anomalies: AnomalyDetection[] = [];

      // Sales anomalies
      const salesAnomalies = await this.detectSalesAnomalies(storeId);
      anomalies.push(...salesAnomalies);

      // Inventory anomalies
      const inventoryAnomalies = await this.detectInventoryAnomalies(storeId);
      anomalies.push(...inventoryAnomalies);

      // Product performance anomalies
      const productAnomalies = await this.detectProductAnomalies(storeId);
      anomalies.push(...productAnomalies);

      // Store insights for significant anomalies
      for (const anomaly of anomalies) {
        if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
          await this.storeAnomalyInsight(storeId, anomaly);
        }
      }

      return anomalies;
    } catch (error) {
      const anyErr = error as any;
      logger.error('Error detecting anomalies', {
        storeId,
        error: anyErr?.message
      });
      throw error;
    }
  }

  /**
   * Generate business insights and recommendations
   */
  async generateInsights(storeId: string): Promise<AIInsight[]> {
    try {
      const insights: AIInsight[] = [];

      // Sales trend insights
      const salesInsights = await this.analyzeSalesTrends(storeId);
      insights.push(...salesInsights);

      // Inventory optimization insights
      const inventoryInsights = await this.analyzeInventoryOptimization(storeId);
      insights.push(...inventoryInsights);

      // Product performance insights
      const productInsights = await this.analyzeProductPerformance(storeId);
      insights.push(...productInsights);

      // Customer behavior insights
      const customerInsights = await this.analyzeCustomerBehavior(storeId);
      insights.push(...customerInsights);

      // Store insights in database
      for (const insight of insights) {
        await this.storeInsight(storeId, insight);
      }

      return insights;
    } catch (error) {
      const anyErr = error as any;
      logger.error('Error generating insights', {
        storeId,
        error: anyErr?.message
      });
      throw error;
    }
  }

  /**
   * Get historical sales data
   */
  private async getHistoricalSalesData(
    storeId: string,
    productId?: string,
    days: number = 90
  ): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let query: any = db.select({
      date: transactions.createdAt,
      total: transactions.total,
      items: transactionItems.quantity
    })
    .from(transactions)
    .leftJoin(transactionItems, eq(transactions.id, transactionItems.transactionId))
    .where(
      and(
        eq(transactions.storeId, storeId),
        gte(transactions.createdAt, startDate)
      )
    );

    if (productId) {
      query = query.where(eq(transactionItems.productId, productId));
    }

    const results = await (query as any).orderBy(asc(transactions.createdAt));

    // Aggregate daily sales
    const dailySales = new Map<string, { total: number; quantity: number; count: number }>();
    
    results.forEach((row: any) => {
      const date = (row.date as Date).toISOString().split('T')[0];
      const current = dailySales.get(date) || { total: 0, quantity: 0, count: 0 };
      
      current.total += parseFloat(String(row.total || '0'));
      current.quantity += parseInt(String(row.items || '0'));
      current.count += 1;
      
      dailySales.set(date, current);
    });

    return Array.from(dailySales.entries()).map(([date, data]) => ({
      date,
      sales: data.total,
      quantity: data.quantity,
      transactions: data.count
    }));
  }

  /**
   * Get active forecasting models
   */
  private async getActiveModels(storeId: string, modelType?: string): Promise<ForecastingModel[]> {
    let query: any = db.select()
      .from(aiModels)
      .where(
        and(
          eq(aiModels.storeId, storeId),
          eq(aiModels.isActive, true)
        )
      );

    if (modelType) {
      query = (query as any).where(eq(aiModels.modelType, modelType));
    }

    return await (query as any).orderBy(desc(aiModels.accuracy));
  }

  /**
   * Create default forecasting model
   */
  private async createDefaultModel(storeId: string): Promise<ForecastingModel> {
    const model = await db.insert(aiModels).values({
      storeId,
      name: 'Default Linear Model',
      description: 'Simple linear regression for basic forecasting',
      modelType: 'linear',
      parameters: JSON.stringify({ windowSize: 7, seasonality: false }),
      accuracy: '0.75',
      isActive: true,
    } as unknown as typeof aiModels.$inferInsert).returning();

    return model[0] as unknown as ForecastingModel;
  }

  /**
   * Generate forecast using specific model
   */
  private async generateForecastWithModel(
    model: ForecastingModel,
    salesData: any[],
    days: number
  ): Promise<ForecastResult[]> {
    switch (model.type) {
      case 'linear':
        return this.linearRegressionForecast(salesData, days);
      case 'prophet':
        return this.prophetForecast(salesData, days);
      case 'ensemble':
        return this.ensembleForecast(salesData, days);
      default:
        return this.linearRegressionForecast(salesData, days);
    }
  }

  /**
   * Linear regression forecasting
   */
  private linearRegressionForecast(salesData: any[], days: number): ForecastResult[] {
    const n = salesData.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = salesData.map(d => d.sales);

    // Calculate linear regression coefficients
    const { slope, intercept } = this.calculateLinearRegression(x, y);

    // Generate forecasts
    const forecasts: ForecastResult[] = [];
    const lastDate = new Date(salesData[salesData.length - 1].date);

    for (let i = 1; i <= days; i++) {
      const forecastDate = new Date(lastDate);
      forecastDate.setDate(forecastDate.getDate() + i);

      const predictedValue = slope * (n + i) + intercept;
      const confidence = Math.max(0.5, 1 - (i * 0.02)); // Decreasing confidence over time

      forecasts.push({
        date: forecastDate.toISOString().split('T')[0],
        predictedValue: Math.max(0, predictedValue),
        confidence,
        lowerBound: Math.max(0, predictedValue * (1 - 0.2)),
        upperBound: predictedValue * (1 + 0.2)
      });
    }

    return forecasts;
  }

  /**
   * Prophet-style forecasting (simplified)
   */
  private prophetForecast(salesData: any[], days: number): ForecastResult[] {
    // Simplified Prophet implementation
    // In production, this would use the actual Prophet library
    
    const forecasts: ForecastResult[] = [];
    const lastDate = new Date(salesData[salesData.length - 1].date);
    
    // Calculate trend and seasonality
    const trend = this.calculateTrend(salesData);
    const seasonality = this.calculateSeasonality(salesData);

    for (let i = 1; i <= days; i++) {
      const forecastDate = new Date(lastDate);
      forecastDate.setDate(forecastDate.getDate() + i);

      const dayOfWeek = forecastDate.getDay();
      const seasonalFactor = seasonality[dayOfWeek] || 1;
      
      const predictedValue = trend * seasonalFactor;
      const confidence = Math.max(0.6, 1 - (i * 0.015));

      forecasts.push({
        date: forecastDate.toISOString().split('T')[0],
        predictedValue: Math.max(0, predictedValue),
        confidence,
        lowerBound: Math.max(0, predictedValue * (1 - 0.15)),
        upperBound: predictedValue * (1 + 0.15)
      });
    }

    return forecasts;
  }

  /**
   * Ensemble forecasting
   */
  private ensembleForecast(salesData: any[], days: number): ForecastResult[] {
    // Combine multiple forecasting methods
    const linearForecast = this.linearRegressionForecast(salesData, days);
    const prophetForecast = this.prophetForecast(salesData, days);

    return linearForecast.map((linear, i) => {
      const prophet = prophetForecast[i];
      const ensembleValue = (linear.predictedValue + prophet.predictedValue) / 2;
      const ensembleConfidence = (linear.confidence + prophet.confidence) / 2;

      return {
        date: linear.date,
        predictedValue: ensembleValue,
        confidence: ensembleConfidence,
        lowerBound: Math.min(linear.lowerBound, prophet.lowerBound),
        upperBound: Math.max(linear.upperBound, prophet.upperBound)
      };
    });
  }

  /**
   * Combine multiple model forecasts
   */
  private combineForecasts(forecasts: ForecastResult[][]): ForecastResult[] {
    if (forecasts.length === 0) return [];
    if (forecasts.length === 1) return forecasts[0];

    const combined: ForecastResult[] = [];
    const numModels = forecasts.length;

    // Use the first forecast as template for dates
    const template = forecasts[0];

    template.forEach((_, index) => {
      let totalValue = 0;
      let totalConfidence = 0;
      let minLower = Infinity;
      let maxUpper = 0;

      forecasts.forEach(forecast => {
        if (forecast[index]) {
          totalValue += forecast[index].predictedValue;
          totalConfidence += forecast[index].confidence;
          minLower = Math.min(minLower, forecast[index].lowerBound);
          maxUpper = Math.max(maxUpper, forecast[index].upperBound);
        }
      });

      combined.push({
        date: template[index].date,
        predictedValue: totalValue / numModels,
        confidence: totalConfidence / numModels,
        lowerBound: minLower,
        upperBound: maxUpper
      });
    });

    return combined;
  }

  /**
   * Detect sales anomalies
   */
  private async detectSalesAnomalies(storeId: string): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    
    // Get recent sales data
    const recentSales = await this.getHistoricalSalesData(storeId, undefined, 30);
    
    if (recentSales.length < 7) return anomalies;

    // Calculate moving average and standard deviation
    const windowSize = 7;
    const movingAverages = this.calculateMovingAverage(recentSales.map(d => d.sales), windowSize);
    const standardDeviations = this.calculateStandardDeviation(recentSales.map(d => d.sales), windowSize);

    // Detect anomalies
    for (let i = windowSize; i < recentSales.length; i++) {
      const currentValue = recentSales[i].sales;
      const expectedValue = movingAverages[i - windowSize];
      const stdDev = standardDeviations[i - windowSize];
      const deviation = Math.abs(currentValue - expectedValue) / stdDev;

      if (deviation > 2.0) { // 2 standard deviations
        const severity = deviation > 3.0 ? 'critical' : deviation > 2.5 ? 'high' : 'medium';
        
        anomalies.push({
          timestamp: new Date(recentSales[i].date),
          metric: 'daily_sales',
          value: currentValue,
          expectedValue,
          deviation,
          severity,
          description: `Sales ${currentValue > expectedValue ? 'spike' : 'drop'} detected`
        });
      }
    }

    return anomalies;
  }

  /**
   * Detect inventory anomalies
   */
  private async detectInventoryAnomalies(storeId: string): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];

    // Get current inventory levels
    const inventoryData = await db.select({
      productId: inventory.productId,
      quantity: inventory.quantity,
      minStockLevel: inventory.minStockLevel,
      maxStockLevel: inventory.maxStockLevel
    })
    .from(inventory)
    .where(eq(inventory.storeId, storeId));

    // Check for stockouts and overstock
    inventoryData.forEach((item: any) => {
      if (item.quantity === 0) {
        anomalies.push({
          timestamp: new Date(),
          metric: 'inventory_stockout',
          value: item.quantity,
          expectedValue: item.minStockLevel,
          deviation: 1.0,
          severity: 'critical',
          description: `Product ${item.productId} is out of stock`
        });
      } else if (item.maxStockLevel && item.quantity > item.maxStockLevel * 1.5) {
        anomalies.push({
          timestamp: new Date(),
          metric: 'inventory_overstock',
          value: item.quantity,
          expectedValue: item.maxStockLevel as number,
          deviation: item.maxStockLevel ? (item.quantity - item.maxStockLevel) / item.maxStockLevel : 0,
          severity: 'medium',
          description: `Product ${item.productId} is overstocked`
        });
      }
    });

    return anomalies;
  }

  /**
   * Detect product performance anomalies
   */
  private async detectProductAnomalies(storeId: string): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];

    // Get product sales data
    const productSales = await db.select({
      productId: transactionItems.productId,
      quantity: transactionItems.quantity,
      price: transactionItems.totalPrice
    })
    .from(transactionItems)
    .leftJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.storeId, storeId),
        gte(transactions.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      )
    );

    // Group by product and analyze
    const productStats = new Map<string, { total: number; count: number; avgPrice: number }>();
    
    productSales.forEach((sale: any) => {
      const current = productStats.get(sale.productId) || { total: 0, count: 0, avgPrice: 0 };
      current.total += parseInt(String(sale.quantity));
      current.count += 1;
      current.avgPrice = parseFloat(String(sale.price));
      productStats.set(sale.productId, current);
    });

    // Detect unusual product performance
    const avgSales = Array.from(productStats.values()).reduce((sum, stat) => sum + stat.total, 0) / productStats.size;
    const stdDev = this.calculateStandardDeviation(Array.from(productStats.values()).map(stat => stat.total), 1)[0];

    productStats.forEach((stats, productId) => {
      const deviation = Math.abs(stats.total - avgSales) / stdDev;
      
      if (deviation > 2.0) {
        const severity = deviation > 3.0 ? 'high' : 'medium';
        
        anomalies.push({
          timestamp: new Date(),
          metric: 'product_performance',
          value: stats.total,
          expectedValue: avgSales,
          deviation,
          severity,
          description: `Product ${productId} has ${stats.total > avgSales ? 'unusually high' : 'unusually low'} sales`
        });
      }
    });

    return anomalies;
  }

  /**
   * Analyze sales trends
   */
  private async analyzeSalesTrends(storeId: string): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];
    
    // Get sales data for trend analysis
    const salesData = await this.getHistoricalSalesData(storeId, undefined, 90);
    
    if (salesData.length < 30) return insights;

    // Calculate trend
    const trend = this.calculateTrend(salesData.map(d => d.sales));
    const trendDirection = trend > 0 ? 'increasing' : 'decreasing';
    const trendStrength = Math.abs(trend);

    if (trendStrength > 0.1) {
      insights.push({
        id: `trend_${Date.now()}`,
        type: 'trend',
        severity: trendStrength > 0.2 ? 'high' : 'medium',
        title: `Sales ${trendDirection} trend detected`,
        description: `Sales are ${trendDirection} at a rate of ${(trend * 100).toFixed(1)}% per day`,
        data: { trend, direction: trendDirection, strength: trendStrength },
        actionable: true,
        confidence: 0.85
      });
    }

    return insights;
  }

  /**
   * Analyze inventory optimization opportunities
   */
  private async analyzeInventoryOptimization(storeId: string): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];

    // Get inventory and sales data
    const inventoryData = await db.select()
      .from(inventory)
      .where(eq(inventory.storeId, storeId));

    for (const item of inventoryData) {
      // Calculate optimal stock levels based on sales velocity
      const salesVelocity = await this.calculateSalesVelocity(storeId, item.productId);
      const optimalLevel = salesVelocity * 7; // 7 days of stock

      if (item.quantity < optimalLevel * 0.5) {
        insights.push({
          id: `inventory_${item.id}`,
          type: 'optimization',
          severity: 'high',
          title: 'Low stock level detected',
          description: `Product ${item.productId} should be restocked. Current: ${item.quantity}, Recommended: ${Math.ceil(optimalLevel)}`,
          data: { currentLevel: item.quantity, recommendedLevel: optimalLevel, productId: item.productId },
          actionable: true,
          confidence: 0.9
        });
      }
    }

    return insights;
  }

  /**
   * Analyze product performance
   */
  private async analyzeProductPerformance(storeId: string): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];

    // Get top and bottom performing products
    const productPerformance = await db.select({
      productId: transactionItems.productId,
      totalSales: sql`SUM(${transactionItems.quantity})`,
      totalRevenue: sql`SUM(${transactionItems.quantity} * ${transactionItems.totalPrice})`
    })
    .from(transactionItems)
    .leftJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.storeId, storeId),
        gte(transactions.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      )
    )
    .groupBy(transactionItems.productId)
    .orderBy(desc(sql`SUM(${transactionItems.quantity})`));

    if (productPerformance.length > 0) {
      const topProduct = productPerformance[0];
      const bottomProduct = productPerformance[productPerformance.length - 1];

      insights.push({
        id: `performance_${Date.now()}`,
        type: 'recommendation',
        severity: 'medium',
        title: 'Product performance insights',
        description: `Top performer: ${topProduct.productId} (${topProduct.totalSales} units), Consider promoting ${bottomProduct.productId}`,
        data: { topProduct, bottomProduct },
        actionable: true,
        confidence: 0.8
      });
    }

    return insights;
  }

  /**
   * Analyze customer behavior
   */
  private async analyzeCustomerBehavior(storeId: string): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];

    // Analyze transaction patterns
    const transactionPatterns = await db.select({
      hour: sql`EXTRACT(HOUR FROM ${transactions.createdAt})`,
      count: sql`COUNT(*)`
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.storeId, storeId),
        gte(transactions.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      )
    )
    .groupBy(sql`EXTRACT(HOUR FROM ${transactions.createdAt})`)
    .orderBy(desc(sql`COUNT(*)`));

    if (transactionPatterns.length > 0) {
      const peakHour = transactionPatterns[0];
      
      insights.push({
        id: `behavior_${Date.now()}`,
        type: 'pattern',
        severity: 'low',
        title: 'Peak business hours identified',
        description: `Peak activity occurs at ${peakHour.hour}:00 with ${peakHour.count} transactions`,
        data: { peakHour, patterns: transactionPatterns },
        actionable: true,
        confidence: 0.9
      });
    }

    return insights;
  }

  /**
   * Store forecast insight
   */
  private async storeForecastInsight(storeId: string, forecast: ForecastResult[], productId?: string) {
    const insight: AIInsight = {
      id: `forecast_${Date.now()}`,
      type: 'forecast',
      severity: 'medium',
      title: 'Demand forecast generated',
      description: `Forecast for next ${forecast.length} days generated${productId ? ` for product ${productId}` : ''}`,
      data: { forecast, productId },
      actionable: true,
      confidence: 0.8
    };

    await this.storeInsight(storeId, insight);
  }

  /**
   * Store anomaly insight
   */
  private async storeAnomalyInsight(storeId: string, anomaly: AnomalyDetection) {
    const insight: AIInsight = {
      id: `anomaly_${Date.now()}`,
      type: 'anomaly',
      severity: anomaly.severity,
      title: `Anomaly detected: ${anomaly.metric}`,
      description: anomaly.description,
      data: anomaly,
      actionable: true,
      confidence: 0.9
    };

    await this.storeInsight(storeId, insight);
  }

  /**
   * Store insight in database
   */
  private async storeInsight(storeId: string, insight: AIInsight) {
    await db.insert(aiInsights).values({
      storeId,
      insightType: insight.type,
      severity: insight.severity,
      title: insight.title,
      description: insight.description,
      data: JSON.stringify(insight.data),
      actionable: insight.actionable,
      confidenceScore: String(insight.confidence)
    } as unknown as typeof aiInsights.$inferInsert);
  }

  // Utility methods
  private calculateLinearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  private calculateTrend(data: number[]): number {
    const n = data.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const { slope } = this.calculateLinearRegression(x, data);
    return slope;
  }

  private calculateSeasonality(data: any[]): number[] {
    const seasonality = new Array(7).fill(0);
    const counts = new Array(7).fill(0);

    data.forEach((item, index) => {
      const date = new Date(item.date);
      const dayOfWeek = date.getDay();
      seasonality[dayOfWeek] += item.sales;
      counts[dayOfWeek]++;
    });

    return seasonality.map((sum, i) => counts[i] > 0 ? sum / counts[i] : 1);
  }

  private calculateMovingAverage(data: number[], windowSize: number): number[] {
    const result: number[] = [];
    
    for (let i = windowSize - 1; i < data.length; i++) {
      const sum = data.slice(i - windowSize + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / windowSize);
    }
    
    return result;
  }

  private calculateStandardDeviation(data: number[], windowSize: number): number[] {
    const result: number[] = [];
    
    for (let i = windowSize - 1; i < data.length; i++) {
      const window = data.slice(i - windowSize + 1, i + 1);
      const mean = window.reduce((a, b) => a + b, 0) / windowSize;
      const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowSize;
      result.push(Math.sqrt(variance));
    }
    
    return result;
  }

  private async calculateSalesVelocity(storeId: string, productId: string): Promise<number> {
    const salesData = await this.getHistoricalSalesData(storeId, productId, 7);
    const totalSales = salesData.reduce((sum, day) => sum + day.quantity, 0);
    return totalSales / 7; // Daily average
  }
} 