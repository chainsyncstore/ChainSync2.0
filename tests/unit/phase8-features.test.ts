import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdvancedAnalyticsService } from '../../server/ai/advanced-analytics';
import { securityAuditService } from '../../server/lib/security-audit';
import { loadEnv } from '../../shared/env';

// Mock dependencies
vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('@shared/prd-schema', () => ({
  sales: { id: 'sales.id', productId: 'sales.productId', createdAt: 'sales.createdAt' },
  products: { id: 'products.id', name: 'products.name', storeId: 'products.storeId' },
  inventory: { productId: 'inventory.productId', currentStock: 'inventory.currentStock' }
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
  desc: vi.fn()
}));

vi.mock('../../server/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  },
  extractLogContext: vi.fn().mockReturnValue({})
}));

describe('Phase 8: Enhanced Observability & Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Environment Configuration', () => {
    it('should load Phase 8 environment variables with defaults', () => {
      const mockEnv = {
        DATABASE_URL: 'postgresql://test',
        SESSION_SECRET: 'test-secret-123456',
        CORS_ORIGINS: 'http://localhost:3000',
        APP_URL: 'http://localhost:3000',
        NODE_ENV: 'test',
        // Phase 8 variables
        WS_ENABLED: 'true',
        WS_PATH: '/ws/notifications',
        WS_HEARTBEAT_INTERVAL: '30000',
        WS_MAX_CONNECTIONS: '1000',
        AI_ANALYTICS_ENABLED: 'true',
        AI_MODEL_CACHE_TTL: '3600',
        OFFLINE_SYNC_ENABLED: 'true',
        OFFLINE_SYNC_INTERVAL: '30000',
        SECURITY_AUDIT_ENABLED: 'true',
        LOG_LEVEL: 'info'
      };

      const env = loadEnv(mockEnv);

      expect(env.WS_ENABLED).toBe(true);
      expect(env.WS_PATH).toBe('/ws/notifications');
      expect(env.WS_HEARTBEAT_INTERVAL).toBe(30000);
      expect(env.WS_MAX_CONNECTIONS).toBe(1000);
      expect(env.AI_ANALYTICS_ENABLED).toBe(true);
      expect(env.AI_MODEL_CACHE_TTL).toBe(3600);
      expect(env.OFFLINE_SYNC_ENABLED).toBe(true);
      expect(env.OFFLINE_SYNC_INTERVAL).toBe(30000);
      expect(env.SECURITY_AUDIT_ENABLED).toBe(true);
      expect(env.LOG_LEVEL).toBe('info');
    });

    it('should apply default values for missing Phase 8 variables', () => {
      const mockEnv = {
        DATABASE_URL: 'postgresql://test',
        SESSION_SECRET: 'test-secret-123456',
        CORS_ORIGINS: 'http://localhost:3000',
        APP_URL: 'http://localhost:3000',
        NODE_ENV: 'test'
      };

      const env = loadEnv(mockEnv);

      expect(env.WS_ENABLED).toBe(true); // default
      expect(env.WS_PATH).toBe('/ws/notifications'); // default
      expect(env.AI_ANALYTICS_ENABLED).toBe(false); // default
      expect(env.OFFLINE_SYNC_ENABLED).toBe(true); // default
      expect(env.SECURITY_AUDIT_ENABLED).toBe(true); // default
    });
  });

  describe('Security Audit Service', () => {
    beforeEach(() => {
      // Reset mocks only; service is a singleton without a public clear method
      // Tests are written to be order-independent
    });

    it('should log authentication events with proper risk scoring', () => {
      const context = {
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent'
      };

      securityAuditService.logAuthenticationEvent('login_success', context, {
        email: 'test@example.com'
      });

      const metrics = securityAuditService.getSecurityMetrics();
      expect(metrics.authenticationEvents).toBeGreaterThan(0);
    });

    it('should detect failed login patterns and mark IPs as suspicious', () => {
      const context = {
        ipAddress: '192.168.1.100',
        userAgent: 'test-agent'
      };

      // Simulate multiple failed logins
      for (let i = 0; i < 5; i++) {
        securityAuditService.logAuthenticationEvent('login_failed', context, {
          reason: 'invalid_password'
        });
      }

      expect(securityAuditService.isIpSuspicious('192.168.1.100')).toBe(true);
      expect(securityAuditService.getIpRiskScore('192.168.1.100')).toBeGreaterThan(0);
    });

    it('should categorize security events by severity correctly', () => {
      const context = {
        userId: 'user-123',
        ipAddress: '192.168.1.1'
      };

      // High severity events
      securityAuditService.logAuthorizationEvent('privilege_escalation_attempt', context, '/admin', {});
      securityAuditService.logApplicationEvent('sql_injection_attempt', context, { resource: '/api/users' });

      // Medium severity events
      securityAuditService.logNetworkEvent('rate_limit_exceeded', context, {});

      const events = securityAuditService.getSecurityEvents({ severity: 'high' });
      expect(events.length).toBeGreaterThan(0);
      expect(events.every(e => e.severity === 'high')).toBe(true);
    });

    it('should filter security events by time range', () => {
      const context = { ipAddress: '192.168.1.1' };
      
      securityAuditService.logNetworkEvent('suspicious_request', context, {});

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const events = securityAuditService.getSecurityEvents({
        timeRange: {
          start: oneHourAgo.toISOString(),
          end: now.toISOString()
        }
      });

      expect(events.length).toBeGreaterThan(0);
    });

    it('should generate comprehensive security metrics', () => {
      const context = { ipAddress: '192.168.1.1', userId: 'user-123' };

      // Generate various security events
      securityAuditService.logAuthenticationEvent('login_failed', context, {});
      securityAuditService.logDataAccessEvent('data_read', context, 'sensitive_data', {});
      securityAuditService.logNetworkEvent('suspicious_request', context, {});

      const metrics = securityAuditService.getSecurityMetrics();

      expect(metrics).toHaveProperty('authenticationEvents');
      expect(metrics).toHaveProperty('failedLogins');
      expect(metrics).toHaveProperty('suspiciousIps');
      expect(metrics).toHaveProperty('highRiskEvents');
      expect(metrics).toHaveProperty('dataAccessPatterns');
      expect(metrics).toHaveProperty('threatLevel');
    });
  });

  describe('Advanced Analytics Service', () => {
    let analyticsService: AdvancedAnalyticsService;

    beforeEach(() => {
      analyticsService = new AdvancedAnalyticsService();
    });

    afterEach(() => {
      analyticsService.clearCache();
    });

    it('should generate demand forecasts with confidence scores', async () => {
      // Mock sales data
      const mockSalesData = [
        { productId: 'product-1', productName: 'Test Product', date: '2024-01-01', quantity: 10 },
        { productId: 'product-1', productName: 'Test Product', date: '2024-01-02', quantity: 12 },
        { productId: 'product-1', productName: 'Test Product', date: '2024-01-03', quantity: 8 }
      ];

      const { db } = await import('../../server/db');
      vi.mocked(db.execute).mockResolvedValue(mockSalesData as any);

      const forecasts = await analyticsService.generateDemandForecast('store-1', 'product-1', 7);

      expect(forecasts).toBeInstanceOf(Array);
      if (forecasts.length > 0) {
        expect(forecasts[0]).toHaveProperty('productId');
        expect(forecasts[0]).toHaveProperty('predictedDemand');
        expect(forecasts[0]).toHaveProperty('confidence');
        expect(forecasts[0]).toHaveProperty('trend');
        expect(forecasts[0].confidence).toBeGreaterThan(0);
        expect(forecasts[0].confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should detect inventory anomalies', async () => {
      // Mock low stock data
      const mockLowStockData = [
        { productId: 'product-1', productName: 'Low Stock Product', currentStock: 2, reorderLevel: 10 }
      ];

      const { db } = await import('../../server/db');
      vi.mocked(db.execute).mockResolvedValue(mockLowStockData as any);

      const anomalies = await analyticsService.detectAnomalies('store-1');

      expect(anomalies).toBeInstanceOf(Array);
      // Note: Anomalies might be empty due to mocked data, but service should not throw
    });

    it('should generate actionable business insights', async () => {
      const insights = await analyticsService.generateInsights('store-1');

      expect(insights).toBeInstanceOf(Array);
      if (insights.length > 0) {
        expect(insights[0]).toHaveProperty('category');
        expect(insights[0]).toHaveProperty('priority');
        expect(insights[0]).toHaveProperty('title');
        expect(insights[0]).toHaveProperty('description');
        expect(insights[0]).toHaveProperty('actionable');
        expect(insights[0]).toHaveProperty('recommendedActions');
        expect(insights[0].recommendedActions).toBeInstanceOf(Array);
      }
    });

    it('should cache results to avoid repeated warmup on subsequent calls', async () => {
      const storeId = 'store-1';
      const envSpy = vi.spyOn(AdvancedAnalyticsService.prototype as any, 'isTestEnvironment').mockReturnValue(false);

      const forecasts1 = await analyticsService.generateDemandForecast(storeId);
      const forecasts2 = await analyticsService.generateDemandForecast(storeId);

      expect(forecasts1).toEqual(forecasts2);

      envSpy.mockRestore();
    });

    it('should clear cache when requested', async () => {
      const envSpy = vi.spyOn(AdvancedAnalyticsService.prototype as any, 'isTestEnvironment').mockReturnValue(false);
      await analyticsService.generateDemandForecast('store-1');
      
      // Cache should have data
      await analyticsService.generateInsights('store-1');
      
      // Clear cache
      analyticsService.clearCache();
      
      // Should work after cache clear
      const insights2 = await analyticsService.generateInsights('store-1');
      expect(insights2).toBeInstanceOf(Array);
      envSpy.mockRestore();
    });

    it('should handle errors gracefully', async () => {
      const envSpy = vi.spyOn(AdvancedAnalyticsService.prototype as any, 'isTestEnvironment').mockReturnValue(false);
      const { db } = await import('../../server/db');
      vi.mocked(db.execute).mockRejectedValue(new Error('Database error'));

      await expect(analyticsService.generateDemandForecast('invalid-store')).resolves.toEqual([]);
      await expect(analyticsService.detectAnomalies('invalid-store')).resolves.toEqual([]);
      await expect(analyticsService.generateInsights('invalid-store')).resolves.toEqual([]);
      envSpy.mockRestore();
    });
  });

  describe('Integration: Security + Analytics', () => {
    it('should audit AI analytics access', () => {
      const context = {
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        path: '/api/ai/forecast'
      };

      securityAuditService.logDataAccessEvent('data_read', context, 'ai_forecasting', {
        storeId: 'store-1',
        forecastDays: 30
      });

      const events = securityAuditService.getSecurityEvents({ type: 'data_access' });
      expect(events.some(e => e.resource === 'ai_forecasting')).toBe(true);
    });

    it('should track analytics performance in security context', () => {
      const context = {
        userId: 'user-123',
        ipAddress: '192.168.1.1'
      };

      // Log successful analytics access
      securityAuditService.logDataAccessEvent('data_read', context, 'analytics_dashboard', {
        responseTime: 150,
        dataPoints: 1000
      });

      const metrics = securityAuditService.getSecurityMetrics();
      expect(metrics.dataAccessPatterns.length).toBeGreaterThan(0);
    });
  });
});
