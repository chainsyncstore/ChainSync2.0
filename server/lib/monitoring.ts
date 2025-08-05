import { Request, Response } from 'express';
import { logger, LogContext } from './logger';

export interface MetricData {
  name: string;
  value: number;
  timestamp: string;
  tags: Record<string, string>;
}

export interface PerformanceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerMinute: number;
  errorRate: number;
}

export interface BusinessMetrics {
  totalLogins: number;
  totalTransactions: number;
  totalRevenue: number;
  totalProducts: number;
  lowStockAlerts: number;
  failedPayments: number;
  securityEvents: number;
}

class MonitoringService {
  private metrics: Map<string, MetricData[]> = new Map();
  private requestTimes: number[] = [];
  private lastResetTime: number = Date.now();
  private readonly MAX_SAMPLES = 1000;
  private readonly RESET_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Initialize metrics storage
    this.initializeMetrics();
    
    // Reset metrics daily
    setInterval(() => {
      this.resetMetrics();
    }, this.RESET_INTERVAL);
  }

  private initializeMetrics(): void {
    const metricNames = [
      'http_requests_total',
      'http_requests_duration',
      'http_requests_errors',
      'auth_logins_total',
      'auth_logins_failed',
      'transactions_total',
      'transactions_revenue',
      'inventory_updates_total',
      'inventory_low_stock_alerts',
      'payments_total',
      'payments_failed',
      'security_events_total'
    ];

    metricNames.forEach(name => {
      this.metrics.set(name, []);
    });
  }

  private addMetric(name: string, value: number, tags: Record<string, string> = {}): void {
    const metricData: MetricData = {
      name,
      value,
      timestamp: new Date().toISOString(),
      tags
    };

    const existingMetrics = this.metrics.get(name) || [];
    existingMetrics.push(metricData);

    // Keep only the last MAX_SAMPLES
    if (existingMetrics.length > this.MAX_SAMPLES) {
      existingMetrics.splice(0, existingMetrics.length - this.MAX_SAMPLES);
    }

    this.metrics.set(name, existingMetrics);
  }

  private resetMetrics(): void {
    this.metrics.clear();
    this.requestTimes = [];
    this.lastResetTime = Date.now();
    this.initializeMetrics();
    logger.info('Metrics reset completed');
  }

  // HTTP Request Monitoring
  recordHttpRequest(req: Request, res: Response, duration: number): void {
    const tags: Record<string, string> = {
      method: req.method,
      path: req.path,
      status_code: res.statusCode.toString(),
      status_class: Math.floor(res.statusCode / 100).toString() + 'xx'
    };

    this.addMetric('http_requests_total', 1, tags);
    this.addMetric('http_requests_duration', duration, tags);

    if (res.statusCode >= 400) {
      this.addMetric('http_requests_errors', 1, tags);
    }

    // Store response time for percentile calculations
    this.requestTimes.push(duration);
    if (this.requestTimes.length > this.MAX_SAMPLES) {
      this.requestTimes.shift();
    }
  }

  // Authentication Monitoring
  recordAuthEvent(event: 'login' | 'login_failed' | 'logout', context: LogContext): void {
    const tags: Record<string, string> = {
      event,
      store_id: context.storeId || 'unknown',
      user_id: context.userId || 'unknown'
    };

    if (event === 'login') {
      this.addMetric('auth_logins_total', 1, tags);
    } else if (event === 'login_failed') {
      this.addMetric('auth_logins_failed', 1, tags);
    }
  }

  // Transaction Monitoring
  recordTransactionEvent(event: 'created' | 'completed' | 'voided', amount?: number, context?: LogContext): void {
    const tags: Record<string, string> = {
      event,
      store_id: context?.storeId || 'unknown',
      user_id: context?.userId || 'unknown'
    };

    this.addMetric('transactions_total', 1, tags);

    if (event === 'completed' && amount) {
      this.addMetric('transactions_revenue', amount, tags);
    }
  }

  // Inventory Monitoring
  recordInventoryEvent(event: 'updated' | 'low_stock_alert', context?: LogContext): void {
    const tags: Record<string, string> = {
      event,
      store_id: context?.storeId || 'unknown',
      product_id: context?.productId || 'unknown'
    };

    if (event === 'updated') {
      this.addMetric('inventory_updates_total', 1, tags);
    } else if (event === 'low_stock_alert') {
      this.addMetric('inventory_low_stock_alerts', 1, tags);
    }
  }

  // Payment Monitoring
  recordPaymentEvent(event: 'initiated' | 'completed' | 'failed', amount?: number, context?: LogContext): void {
    const tags: Record<string, string> = {
      event,
      store_id: context?.storeId || 'unknown',
      user_id: context?.userId || 'unknown'
    };

    this.addMetric('payments_total', 1, tags);

    if (event === 'failed') {
      this.addMetric('payments_failed', 1, tags);
    }
  }

  // Security Monitoring
  recordSecurityEvent(event: 'ip_blocked' | 'unauthorized_access' | 'suspicious_activity', context?: LogContext): void {
    const tags: Record<string, string> = {
      event,
      ip_address: context?.ipAddress || 'unknown',
      store_id: context?.storeId || 'unknown'
    };

    this.addMetric('security_events_total', 1, tags);
  }

  // Performance Metrics Calculation
  getPerformanceMetrics(): PerformanceMetrics {
    const now = Date.now();
    const timeWindow = 60 * 1000; // 1 minute
    const recentMetrics = Array.from(this.metrics.entries())
      .filter(([name]) => name === 'http_requests_total')
      .flatMap(([, metrics]) => metrics)
      .filter(metric => new Date(metric.timestamp).getTime() > now - timeWindow);

    const totalRequests = recentMetrics.length;
    const successfulRequests = recentMetrics.filter(m => m.tags.status_class === '2xx').length;
    const failedRequests = recentMetrics.filter(m => m.tags.status_class !== '2xx').length;

    const responseTimes = this.requestTimes
      .filter(time => time > now - timeWindow)
      .sort((a, b) => a - b);

    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;

    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);

    const p95ResponseTime = responseTimes[p95Index] || 0;
    const p99ResponseTime = responseTimes[p99Index] || 0;

    const requestsPerMinute = totalRequests;
    const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      requestsPerMinute,
      errorRate
    };
  }

  // Business Metrics Calculation
  getBusinessMetrics(): BusinessMetrics {
    const now = Date.now();
    const timeWindow = 24 * 60 * 60 * 1000; // 24 hours

    const getMetricCount = (name: string): number => {
      const metrics = this.metrics.get(name) || [];
      return metrics.filter(m => new Date(m.timestamp).getTime() > now - timeWindow).length;
    };

    const getMetricSum = (name: string): number => {
      const metrics = this.metrics.get(name) || [];
      return metrics
        .filter(m => new Date(m.timestamp).getTime() > now - timeWindow)
        .reduce((sum, m) => sum + m.value, 0);
    };

    return {
      totalLogins: getMetricCount('auth_logins_total'),
      totalTransactions: getMetricCount('transactions_total'),
      totalRevenue: getMetricSum('transactions_revenue'),
      totalProducts: getMetricCount('inventory_updates_total'),
      lowStockAlerts: getMetricCount('inventory_low_stock_alerts'),
      failedPayments: getMetricCount('payments_failed'),
      securityEvents: getMetricCount('security_events_total')
    };
  }

  // Get all metrics for export
  getAllMetrics(): Map<string, MetricData[]> {
    return new Map(this.metrics);
  }

  // Clear all metrics
  clearMetrics(): void {
    this.resetMetrics();
  }
}

export const monitoringService = new MonitoringService();

// Middleware for automatic request monitoring
export const monitoringMiddleware = (req: Request, res: Response, next: () => void): void => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    monitoringService.recordHttpRequest(req, res, duration);
  });

  next();
}; 