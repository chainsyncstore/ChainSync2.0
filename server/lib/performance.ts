import { Request, Response, NextFunction } from 'express';

interface PerformanceMetrics {
  endpoint: string;
  method: string;
  responseTime: number;
  timestamp: Date;
  statusCode: number;
  userAgent?: string;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 requests

  recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Keep only the last maxMetrics entries
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  getAverageResponseTime(endpoint?: string): number {
    const filteredMetrics = endpoint 
      ? this.metrics.filter(m => m.endpoint === endpoint)
      : this.metrics;
    
    if (filteredMetrics.length === 0) return 0;
    
    const totalTime = filteredMetrics.reduce((sum, m) => sum + m.responseTime, 0);
    return totalTime / filteredMetrics.length;
  }

  getSlowestEndpoints(limit: number = 10): Array<{ endpoint: string; avgResponseTime: number }> {
    const endpointMap = new Map<string, number[]>();
    
    this.metrics.forEach(metric => {
      if (!endpointMap.has(metric.endpoint)) {
        endpointMap.set(metric.endpoint, []);
      }
      endpointMap.get(metric.endpoint)!.push(metric.responseTime);
    });

    const averages = Array.from(endpointMap.entries()).map(([endpoint, times]) => ({
      endpoint,
      avgResponseTime: times.reduce((sum, time) => sum + time, 0) / times.length
    }));

    return averages
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
      .slice(0, limit);
  }

  clearMetrics(): void {
    this.metrics = [];
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Middleware to track API performance
export const performanceMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const originalSend = res.send;

  res.send = function(data: any): Response {
    const responseTime = Date.now() - startTime;
    
    performanceMonitor.recordMetric({
      endpoint: req.path,
      method: req.method,
      responseTime,
      timestamp: new Date(),
      statusCode: res.statusCode,
      userAgent: req.get('User-Agent'),
    });

    return originalSend.call(this, data);
  };

  next();
};

// Database query performance tracking
export const trackQueryPerformance = <T>(queryName: string, queryFn: () => Promise<T>): Promise<T> => {
  const startTime = Date.now();
  
  return queryFn().finally(() => {
    const queryTime = Date.now() - startTime;
    console.log(`Query "${queryName}" took ${queryTime}ms`);
    
    // Log slow queries
    if (queryTime > 1000) {
      console.warn(`Slow query detected: "${queryName}" took ${queryTime}ms`);
    }
  });
};

// Performance monitoring endpoints
export const getPerformanceMetrics = (req: Request, res: Response): void => {
  const metrics = performanceMonitor.getMetrics();
  const averageResponseTime = performanceMonitor.getAverageResponseTime();
  const slowestEndpoints = performanceMonitor.getSlowestEndpoints();
  
  res.json({
    totalRequests: metrics.length,
    averageResponseTime: Math.round(averageResponseTime),
    slowestEndpoints,
    recentMetrics: metrics.slice(-50), // Last 50 requests
  });
};

export const clearPerformanceMetrics = (req: Request, res: Response): void => {
  performanceMonitor.clearMetrics();
  res.json({ message: 'Performance metrics cleared' });
}; 