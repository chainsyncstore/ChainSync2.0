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
  signupAttempts: number;
  signupSuccess: number;
  signupDuplicates: number;
  captchaFailures: number;
  csrfFailures: number;
}

class MonitoringService {
  private metrics: Map<string, MetricData[]> = new Map();
  private requestTimes: number[] = [];
  private lastResetTime: number = Date.now();
  private readonly MAX_SAMPLES = 1000;
  private readonly RESET_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  // Throttle alerts per metric to avoid spam
  private lastAlertSent: Map<string, number> = new Map();

  constructor() {
    // Initialize metrics storage
    this.initializeMetrics();
    
    // Reset metrics daily
    setInterval(() => {
      this.resetMetrics();
    }, this.RESET_INTERVAL);
  }

  // Optional webhook alerting if MONITORING_ALERT_WEBHOOK is set
  private async sendAlert(title: string, details: Record<string, any>): Promise<void> {
    const webhook = process.env.MONITORING_ALERT_WEBHOOK;
    if (!webhook) return;

    try {
      const fetchFn: any = (globalThis as any).fetch;
      if (!fetchFn) return; // No fetch available in this runtime

      await fetchFn(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, severity: 'warning', source: 'monitoringService', ...details })
      });
    } catch (err) {
      try {
        logger.error('Failed to send monitoring webhook', err as Error);
      } catch (logError) {
        const fallbackMessage = logError instanceof Error ? logError.message : String(logError);
        process.stderr.write(`Monitoring webhook logging failed: ${fallbackMessage}\n`);
      }
    }
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
      'security_events_total',
      // Signup and security-specific metrics
      'signup_attempts_total',
      'signup_success_total',
      'signup_duplicate_total',
      'captcha_failures_total',
      'csrf_failures_total',
      'db_health_timeouts_total'
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

  private getRecentCount(name: string, windowMs: number): number {
    const now = Date.now();
    const metrics = this.metrics.get(name) || [];
    return metrics.filter(m => new Date(m.timestamp).getTime() > now - windowMs).length;
  }

  private alertIfSpike(name: string, thresholdEnvKey: string, defaultThreshold: number, details: Record<string, string> = {}): void {
    const threshold = Number(process.env[thresholdEnvKey]) || defaultThreshold;
    const count = this.getRecentCount(name, 60 * 1000);
    if (count >= threshold) {
      logger.warn('Spike detected in metric', { metric: name, count, threshold, ...details });

      // Throttle alerts per metric (60s)
      const now = Date.now();
      const last = this.lastAlertSent.get(name) || 0;
      if (now - last >= 60_000) {
        this.lastAlertSent.set(name, now);
        void this.sendAlert('Spike detected in metric', { metric: name, count, threshold, details });
      }
    }
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

  // Signup Monitoring
  recordSignupEvent(event: 'attempt' | 'success' | 'duplicate', context?: LogContext): void {
    const tags: Record<string, string> = {
      event,
      ip_address: context?.ipAddress || 'unknown',
      user_agent: context?.userAgent || 'unknown'
    };

    if (event === 'attempt') {
      this.addMetric('signup_attempts_total', 1, tags);
      this.alertIfSpike('signup_attempts_total', 'ALERT_THRESHOLD_SIGNUP_ATTEMPTS_PER_MINUTE', 100);
    } else if (event === 'success') {
      this.addMetric('signup_success_total', 1, tags);
    } else if (event === 'duplicate') {
      this.addMetric('signup_duplicate_total', 1, tags);
      this.alertIfSpike('signup_duplicate_total', 'ALERT_THRESHOLD_DUPLICATE_SIGNUPS_PER_MINUTE', 10);
    }
  }

  recordCaptchaFailure(context?: LogContext): void {
    const tags: Record<string, string> = {
      ip_address: context?.ipAddress || 'unknown',
      path: context?.path || 'unknown',
      user_agent: context?.userAgent || 'unknown'
    };
    this.addMetric('captcha_failures_total', 1, tags);
    this.alertIfSpike('captcha_failures_total', 'ALERT_THRESHOLD_CAPTCHA_FAILURES_PER_MINUTE', 20);
  }

  recordCsrfFailure(context?: LogContext): void {
    const tags: Record<string, string> = {
      ip_address: context?.ipAddress || 'unknown',
      path: context?.path || 'unknown',
      user_agent: context?.userAgent || 'unknown'
    };
    this.addMetric('csrf_failures_total', 1, tags);
    this.alertIfSpike('csrf_failures_total', 'ALERT_THRESHOLD_CSRF_FAILURES_PER_MINUTE', 10);
  }

  recordDbHealthTimeout(context?: LogContext): void {
    const tags: Record<string, string> = {
      path: context?.path || 'unknown',
      user_agent: context?.userAgent || 'unknown'
    };
    this.addMetric('db_health_timeouts_total', 1, tags);
    this.alertIfSpike('db_health_timeouts_total', 'ALERT_THRESHOLD_DB_TIMEOUTS_PER_MINUTE', 5);
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
      securityEvents: getMetricCount('security_events_total'),
      // Extended business/security metrics
      signupAttempts: getMetricCount('signup_attempts_total'),
      signupSuccess: getMetricCount('signup_success_total'),
      signupDuplicates: getMetricCount('signup_duplicate_total'),
      captchaFailures: getMetricCount('captcha_failures_total'),
      csrfFailures: getMetricCount('csrf_failures_total')
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

// Export the functions that are being imported in routes.ts
export const getPerformanceMetrics = () => monitoringService.getPerformanceMetrics();
export const clearPerformanceMetrics = () => monitoringService.clearMetrics();

// Middleware for automatic request monitoring
export const monitoringMiddleware = (req: Request, res: Response, next: () => void): void => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    monitoringService.recordHttpRequest(req, res, duration);
  });

  next();
}; 