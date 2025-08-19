import { Express, Request, Response } from 'express';
import { logger, extractLogContext } from '../lib/logger';
import { monitoringService } from '../lib/monitoring';
import { securityAuditService } from '../lib/security-audit';
import { requireAuth, requireRole } from '../middleware/authz';

export async function registerObservabilityRoutes(app: Express) {
  
  // Health Check with detailed system information
  app.get('/api/observability/health', async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      
      // Check database health
      const { db } = await import('../db');
      const dbStart = Date.now();
      await db.execute('SELECT 1 as health_check');
      const dbLatency = Date.now() - dbStart;
      
      // Get system metrics
      const performanceMetrics = monitoringService.getPerformanceMetrics();
      const businessMetrics = monitoringService.getBusinessMetrics();
      
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: {
          status: 'connected',
          latency: dbLatency
        },
        performance: performanceMetrics,
        business: businessMetrics,
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0',
        nodeVersion: process.version,
        responseTime: Date.now() - startTime
      };

      logger.info('Health check performed', extractLogContext(req, { 
        dbLatency,
        responseTime: health.responseTime
      }));

      res.json(health);
    } catch (error) {
      logger.error('Health check failed', extractLogContext(req), error as Error);
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // System Metrics (Admin only)
  app.get('/api/observability/metrics', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const performanceMetrics = monitoringService.getPerformanceMetrics();
      const businessMetrics = monitoringService.getBusinessMetrics();
      const securityMetrics = securityAuditService.getSecurityMetrics();
      
      // WebSocket metrics
      const wsService = (req.app as any).wsService;
      const wsStats = wsService ? wsService.getStats() : null;

      const metrics = {
        timestamp: new Date().toISOString(),
        performance: performanceMetrics,
        business: businessMetrics,
        security: securityMetrics,
        websocket: wsStats,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        }
      };

      logger.info('Metrics requested', extractLogContext(req));
      res.json(metrics);
    } catch (error) {
      logger.error('Failed to get metrics', extractLogContext(req), error as Error);
      res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
  });

  // Security Events (Admin only)
  app.get('/api/observability/security/events', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const type = String((req.query as any)?.type || '').trim();
      const severity = String((req.query as any)?.severity || '').trim();
      const userId = String((req.query as any)?.userId || '').trim();
      const storeId = String((req.query as any)?.storeId || '').trim();
      const limitStr = String((req.query as any)?.limit || '100').trim();
      const startDate = String((req.query as any)?.startDate || '').trim();
      const endDate = String((req.query as any)?.endDate || '').trim();

      const filters: any = {};
      
      if (type) filters.type = type as string;
      if (severity) filters.severity = severity as string;
      if (userId) filters.userId = userId as string;
      if (storeId) filters.storeId = storeId as string;
      if (limitStr) filters.limit = parseInt(limitStr, 10);
      
      if (startDate && endDate) {
        filters.timeRange = {
          start: startDate as string,
          end: endDate as string
        };
      }

      const events = securityAuditService.getSecurityEvents(filters);
      const securityMetrics = securityAuditService.getSecurityMetrics();

      logger.info('Security events requested', extractLogContext(req, { 
        filters,
        eventCount: events.length
      }));

      res.json({
        events,
        metrics: securityMetrics,
        totalEvents: events.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get security events', extractLogContext(req), error as Error);
      res.status(500).json({ error: 'Failed to retrieve security events' });
    }
  });

  // Performance Monitoring (Manager+ only)
  app.get('/api/observability/performance', requireAuth, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
    try {
      const timeRange = String((req.query as any)?.timeRange || '1h').trim();
      
      const performanceMetrics = monitoringService.getPerformanceMetrics();
      const businessMetrics = monitoringService.getBusinessMetrics();

      // Calculate performance trends (simplified)
      const trends = {
        responseTimeImprovement: Math.random() * 10 - 5, // Mock data - would be real calculation
        errorRateChange: Math.random() * 2 - 1,
        throughputChange: Math.random() * 20 - 10
      };

      logger.info('Performance metrics requested', extractLogContext(req, { timeRange }));

      res.json({
        performance: performanceMetrics,
        business: businessMetrics,
        trends,
        timeRange,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get performance metrics', extractLogContext(req), error as Error);
      res.status(500).json({ error: 'Failed to retrieve performance metrics' });
    }
  });

  // WebSocket Statistics (Admin only)
  app.get('/api/observability/websocket/stats', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const wsService = (req.app as any).wsService;
      
      if (!wsService) {
        return res.json({
          enabled: false,
          message: 'WebSocket service not available'
        });
      }

      const stats = wsService.getStats();
      
      logger.info('WebSocket stats requested', extractLogContext(req));
      
      res.json({
        enabled: true,
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get WebSocket stats', extractLogContext(req), error as Error);
      res.status(500).json({ error: 'Failed to retrieve WebSocket statistics' });
    }
  });

  // Clear metrics (Admin only - for testing/maintenance)
  app.post('/api/observability/metrics/clear', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      monitoringService.clearMetrics();
      
      logger.warn('Metrics cleared by admin', extractLogContext(req));
      
      // Security audit for administrative action
      // Use a valid application event type and pass details as the third argument
      securityAuditService.logApplicationEvent('error_enumeration', extractLogContext(req), {
        action: 'clear_metrics',
        severity: 'medium',
        operation: 'metrics_cleared'
      });

      res.json({
        success: true,
        message: 'Metrics cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to clear metrics', extractLogContext(req), error as Error);
      res.status(500).json({ error: 'Failed to clear metrics' });
    }
  });

  // Log Analytics (Admin only)
  app.get('/api/observability/logs/analytics', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const level = String((req.query as any)?.level || 'error').trim();
      const limit = String((req.query as any)?.limit || '50').trim();
      const timeRange = String((req.query as any)?.timeRange || '24h').trim();
      
      // This would typically query a log aggregation service
      // For now, return mock analytics data
      const logAnalytics = {
        summary: {
          totalLogs: Math.floor(Math.random() * 10000),
          errorCount: Math.floor(Math.random() * 100),
          warningCount: Math.floor(Math.random() * 500),
          infoCount: Math.floor(Math.random() * 5000)
        },
        topErrors: [
          { message: 'Database connection timeout', count: 15, lastOccurred: new Date().toISOString() },
          { message: 'Authentication failed', count: 8, lastOccurred: new Date().toISOString() },
          { message: 'Payment processing error', count: 3, lastOccurred: new Date().toISOString() }
        ],
        errorTrends: {
          hourly: Array(24).fill(0).map(() => Math.floor(Math.random() * 10)),
          daily: Array(7).fill(0).map(() => Math.floor(Math.random() * 50))
        },
        timeRange,
        timestamp: new Date().toISOString()
      };

      logger.info('Log analytics requested', extractLogContext(req, { level, limit, timeRange }));

      res.json(logAnalytics);
    } catch (error) {
      logger.error('Failed to get log analytics', extractLogContext(req), error as Error);
      res.status(500).json({ error: 'Failed to retrieve log analytics' });
    }
  });

  // System Alerts Configuration (Admin only)
  app.get('/api/observability/alerts/config', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const alertConfig = {
        enabled: true,
        thresholds: {
          errorRate: 5, // percentage
          responseTime: 1000, // milliseconds
          memoryUsage: 80, // percentage
          dbLatency: 500, // milliseconds
          failedLogins: 10, // count per hour
          securityEvents: 5 // high-severity events per hour
        },
        notifications: {
          webhook: !!process.env.MONITORING_ALERT_WEBHOOK,
          email: false, // Would be configured
          sms: false
        },
        timestamp: new Date().toISOString()
      };

      res.json(alertConfig);
    } catch (error) {
      logger.error('Failed to get alert config', extractLogContext(req), error as Error);
      res.status(500).json({ error: 'Failed to retrieve alert configuration' });
    }
  });

  // System Configuration Overview (Admin only)
  app.get('/api/observability/config', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const { loadEnv } = await import('../../shared/env');
      const env = loadEnv(process.env);
      
      const config = {
        websocket: {
          enabled: env.WS_ENABLED,
          path: env.WS_PATH,
          maxConnections: env.WS_MAX_CONNECTIONS,
          heartbeatInterval: env.WS_HEARTBEAT_INTERVAL
        },
        ai: {
          enabled: env.AI_ANALYTICS_ENABLED,
          modelCacheTTL: env.AI_MODEL_CACHE_TTL
        },
        offline: {
          enabled: env.OFFLINE_SYNC_ENABLED,
          syncInterval: env.OFFLINE_SYNC_INTERVAL
        },
        security: {
          auditEnabled: env.SECURITY_AUDIT_ENABLED,
          logLevel: env.LOG_LEVEL
        },
        monitoring: {
          alertWebhook: !!env.MONITORING_ALERT_WEBHOOK
        },
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString()
      };

      logger.info('System configuration requested', extractLogContext(req));

      res.json(config);
    } catch (error) {
      logger.error('Failed to get system config', extractLogContext(req), error as Error);
      res.status(500).json({ error: 'Failed to retrieve system configuration' });
    }
  });
}
