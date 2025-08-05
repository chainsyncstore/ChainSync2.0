import { describe, it, expect, beforeEach, vi } from 'vitest';
import { monitoringService, PerformanceMetrics, BusinessMetrics } from '@server/lib/monitoring';
import { LogContext } from '@server/lib/logger';

describe('MonitoringService', () => {
  beforeEach(() => {
    // Clear all metrics before each test
    monitoringService.clearMetrics();
  });

  describe('HTTP Request Monitoring', () => {
    it('should record HTTP requests correctly', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        ip: '127.0.0.1'
      } as any;

      const mockRes = {
        statusCode: 200
      } as any;

      monitoringService.recordHttpRequest(mockReq, mockRes, 150);

      const metrics = monitoringService.getPerformanceMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.averageResponseTime).toBe(150);
    });

    it('should record failed requests correctly', () => {
      const mockReq = {
        method: 'POST',
        path: '/api/test',
        ip: '127.0.0.1'
      } as any;

      const mockRes = {
        statusCode: 500
      } as any;

      monitoringService.recordHttpRequest(mockReq, mockRes, 300);

      const metrics = monitoringService.getPerformanceMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.errorRate).toBe(100);
    });

    it('should calculate response time percentiles correctly', () => {
      const mockReq = { method: 'GET', path: '/api/test', ip: '127.0.0.1' } as any;
      const mockRes = { statusCode: 200 } as any;

      // Record multiple response times
      const responseTimes = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
      responseTimes.forEach(time => {
        monitoringService.recordHttpRequest(mockReq, mockRes, time);
      });

      const metrics = monitoringService.getPerformanceMetrics();
      expect(metrics.p95ResponseTime).toBeGreaterThanOrEqual(450);
      expect(metrics.p99ResponseTime).toBeGreaterThanOrEqual(500);
    });
  });

  describe('Authentication Monitoring', () => {
    it('should record successful login events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        ipAddress: '127.0.0.1'
      };

      monitoringService.recordAuthEvent('login', context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.totalLogins).toBe(1);
    });

    it('should record failed login events', () => {
      const context: LogContext = {
        userId: 'unknown',
        storeId: 'store456',
        ipAddress: '127.0.0.1'
      };

      monitoringService.recordAuthEvent('login_failed', context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.totalLogins).toBe(0); // Only successful logins count
    });

    it('should record logout events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        ipAddress: '127.0.0.1'
      };

      monitoringService.recordAuthEvent('logout', context);

      // Logout events are logged but not counted in business metrics
      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.totalLogins).toBe(0);
    });
  });

  describe('Transaction Monitoring', () => {
    it('should record transaction creation events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        transactionId: 'txn789'
      };

      monitoringService.recordTransactionEvent('created', undefined, context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.totalTransactions).toBe(1);
      expect(metrics.totalRevenue).toBe(0); // No amount for creation
    });

    it('should record completed transactions with revenue', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        transactionId: 'txn789'
      };

      monitoringService.recordTransactionEvent('completed', 150.50, context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.totalTransactions).toBe(1);
      expect(metrics.totalRevenue).toBe(150.50);
    });

    it('should record voided transactions without revenue', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        transactionId: 'txn789'
      };

      monitoringService.recordTransactionEvent('voided', undefined, context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.totalTransactions).toBe(1);
      expect(metrics.totalRevenue).toBe(0); // Voided transactions don't count as revenue
    });
  });

  describe('Inventory Monitoring', () => {
    it('should record inventory update events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        productId: 'prod789'
      };

      monitoringService.recordInventoryEvent('updated', context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.totalProducts).toBe(1);
    });

    it('should record low stock alerts', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        productId: 'prod789'
      };

      monitoringService.recordInventoryEvent('low_stock_alert', context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.lowStockAlerts).toBe(1);
    });
  });

  describe('Payment Monitoring', () => {
    it('should record payment initiation events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456'
      };

      monitoringService.recordPaymentEvent('initiated', 100.00, context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.failedPayments).toBe(0); // Initiated payments don't count as failed
    });

    it('should record successful payment events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456'
      };

      monitoringService.recordPaymentEvent('completed', 100.00, context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.failedPayments).toBe(0);
    });

    it('should record failed payment events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456'
      };

      monitoringService.recordPaymentEvent('failed', 100.00, context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.failedPayments).toBe(1);
    });
  });

  describe('Security Monitoring', () => {
    it('should record security events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        ipAddress: '192.168.1.100'
      };

      monitoringService.recordSecurityEvent('ip_blocked', context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.securityEvents).toBe(1);
    });

    it('should record unauthorized access attempts', () => {
      const context: LogContext = {
        userId: 'unknown',
        storeId: 'store456',
        ipAddress: '192.168.1.100'
      };

      monitoringService.recordSecurityEvent('unauthorized_access', context);

      const metrics = monitoringService.getBusinessMetrics();
      expect(metrics.securityEvents).toBe(1);
    });
  });

  describe('Performance Metrics Calculation', () => {
    it('should calculate correct error rate', () => {
      const mockReq = { method: 'GET', path: '/api/test', ip: '127.0.0.1' } as any;
      
      // Record 10 successful requests
      for (let i = 0; i < 10; i++) {
        const mockRes = { statusCode: 200 } as any;
        monitoringService.recordHttpRequest(mockReq, mockRes, 100);
      }

      // Record 2 failed requests
      for (let i = 0; i < 2; i++) {
        const mockRes = { statusCode: 500 } as any;
        monitoringService.recordHttpRequest(mockReq, mockRes, 200);
      }

      const metrics = monitoringService.getPerformanceMetrics();
      expect(metrics.totalRequests).toBe(12);
      expect(metrics.successfulRequests).toBe(10);
      expect(metrics.failedRequests).toBe(2);
      expect(metrics.errorRate).toBeCloseTo(16.67, 1); // 2/12 * 100
    });

    it('should calculate requests per minute correctly', () => {
      const mockReq = { method: 'GET', path: '/api/test', ip: '127.0.0.1' } as any;
      const mockRes = { statusCode: 200 } as any;

      // Record 5 requests
      for (let i = 0; i < 5; i++) {
        monitoringService.recordHttpRequest(mockReq, mockRes, 100);
      }

      const metrics = monitoringService.getPerformanceMetrics();
      expect(metrics.requestsPerMinute).toBe(5);
    });

    it('should handle empty metrics gracefully', () => {
      const metrics = monitoringService.getPerformanceMetrics();
      
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.averageResponseTime).toBe(0);
      expect(metrics.p95ResponseTime).toBe(0);
      expect(metrics.p99ResponseTime).toBe(0);
      expect(metrics.requestsPerMinute).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });
  });

  describe('Business Metrics Calculation', () => {
    it('should aggregate metrics over time window', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456'
      };

      // Record multiple events
      monitoringService.recordAuthEvent('login', context);
      monitoringService.recordTransactionEvent('completed', 100.00, context);
      monitoringService.recordTransactionEvent('completed', 200.00, context);
      monitoringService.recordInventoryEvent('updated', context);
      monitoringService.recordPaymentEvent('failed', 50.00, context);
      monitoringService.recordSecurityEvent('ip_blocked', context);

      const metrics = monitoringService.getBusinessMetrics();
      
      expect(metrics.totalLogins).toBe(1);
      expect(metrics.totalTransactions).toBe(2);
      expect(metrics.totalRevenue).toBe(300.00);
      expect(metrics.totalProducts).toBe(1);
      expect(metrics.failedPayments).toBe(1);
      expect(metrics.securityEvents).toBe(1);
      expect(metrics.lowStockAlerts).toBe(0);
    });

    it('should handle empty business metrics gracefully', () => {
      const metrics = monitoringService.getBusinessMetrics();
      
      expect(metrics.totalLogins).toBe(0);
      expect(metrics.totalTransactions).toBe(0);
      expect(metrics.totalRevenue).toBe(0);
      expect(metrics.totalProducts).toBe(0);
      expect(metrics.failedPayments).toBe(0);
      expect(metrics.securityEvents).toBe(0);
      expect(metrics.lowStockAlerts).toBe(0);
    });
  });

  describe('Metrics Management', () => {
    it('should clear all metrics', () => {
      const context: LogContext = { userId: 'user123', storeId: 'store456' };
      
      // Record some metrics
      monitoringService.recordAuthEvent('login', context);
      monitoringService.recordTransactionEvent('completed', 100.00, context);

      // Clear metrics
      monitoringService.clearMetrics();

      const performanceMetrics = monitoringService.getPerformanceMetrics();
      const businessMetrics = monitoringService.getBusinessMetrics();

      expect(performanceMetrics.totalRequests).toBe(0);
      expect(businessMetrics.totalLogins).toBe(0);
      expect(businessMetrics.totalTransactions).toBe(0);
    });

    it('should return all metrics for export', () => {
      const context: LogContext = { userId: 'user123', storeId: 'store456' };
      
      // Record some metrics
      monitoringService.recordAuthEvent('login', context);
      monitoringService.recordTransactionEvent('completed', 100.00, context);

      const allMetrics = monitoringService.getAllMetrics();
      
      expect(allMetrics.has('auth_logins_total')).toBe(true);
      expect(allMetrics.has('transactions_total')).toBe(true);
      expect(allMetrics.has('transactions_revenue')).toBe(true);
    });
  });
}); 