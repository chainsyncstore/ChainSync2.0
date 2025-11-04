import { Request, Response } from 'express';
import { logger, LogContext } from './logger';
import { monitoringService } from './monitoring';

export interface SecurityEvent {
  type: 'authentication' | 'authorization' | 'data_access' | 'configuration' | 'network' | 'application';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  timestamp: string;
  userId?: string;
  storeId?: string;
  ipAddress?: string;
  userAgent?: string;
  action: string;
  resource?: string;
  details: Record<string, any>;
  riskScore: number; // 0-100
}

export interface SecurityMetrics {
  authenticationEvents: number;
  failedLogins: number;
  suspiciousIps: string[];
  highRiskEvents: number;
  dataAccessPatterns: { userId: string; accessCount: number; riskScore: number }[];
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
}

class SecurityAuditService {
  private securityEvents: SecurityEvent[] = [];
  private ipRiskScores: Map<string, number> = new Map();
  private userActivityPatterns: Map<string, { actions: string[]; timestamps: number[] }> = new Map();
  private suspiciousIps: Set<string> = new Set();
  private readonly MAX_EVENTS = 10000;
  private readonly RISK_THRESHOLD_MEDIUM = 30;
  private readonly RISK_THRESHOLD_HIGH = 60;
  private readonly RISK_THRESHOLD_CRITICAL = 80;

  constructor() {
    // Clean up old events daily
    setInterval(() => {
      this.cleanupOldEvents();
    }, 24 * 60 * 60 * 1000);
  }

  // Log various types of security events
  logAuthenticationEvent(event: 'login_success' | 'login_failed' | 'logout' | 'session_expired' | 'mfa_challenge' | 'mfa_success' | 'mfa_failed', context: LogContext, details: Record<string, any> = {}): void {
    const riskScore = this.calculateAuthenticationRisk(event, context, details);
    
    this.addSecurityEvent({
      type: 'authentication',
      severity: this.getSeverityFromRisk(riskScore),
      source: 'auth_system',
      timestamp: new Date().toISOString(),
      userId: context.userId,
      storeId: context.storeId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      action: event,
      details: {
        ...details,
        sessionId: context.requestId
      },
      riskScore
    });

    // Update monitoring metrics
    if (event === 'login_failed') {
      monitoringService.recordSecurityEvent('unauthorized_access', context);
    }

    // Check for suspicious patterns
    this.analyzeAuthenticationPattern(context, event);
  }

  logAuthorizationEvent(event: 'access_granted' | 'access_denied' | 'privilege_escalation_attempt' | 'role_violation', context: LogContext, resource: string, details: Record<string, any> = {}): void {
    const riskScore = this.calculateAuthorizationRisk(event, context, resource, details);
    
    this.addSecurityEvent({
      type: 'authorization',
      severity: this.getSeverityFromRisk(riskScore),
      source: 'authz_system',
      timestamp: new Date().toISOString(),
      userId: context.userId,
      storeId: context.storeId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      action: event,
      resource,
      details,
      riskScore
    });

    if (event === 'access_denied' || event === 'privilege_escalation_attempt') {
      monitoringService.recordSecurityEvent('unauthorized_access', context);
    }
  }

  logDataAccessEvent(event: 'data_read' | 'data_write' | 'data_delete' | 'bulk_operation' | 'sensitive_data_access', context: LogContext, resource: string, details: Record<string, any> = {}): void {
    const riskScore = this.calculateDataAccessRisk(event, context, resource, details);
    
    this.addSecurityEvent({
      type: 'data_access',
      severity: this.getSeverityFromRisk(riskScore),
      source: 'data_layer',
      timestamp: new Date().toISOString(),
      userId: context.userId,
      storeId: context.storeId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      action: event,
      resource,
      details: {
        ...details,
        recordCount: details.recordCount || 1
      },
      riskScore
    });

    // Track user data access patterns
    this.updateUserActivityPattern(context.userId, event);
  }

  logNetworkEvent(event: 'suspicious_request' | 'rate_limit_exceeded' | 'ip_blocked' | 'unusual_location' | 'tor_access', context: LogContext, details: Record<string, any> = {}): void {
    const riskScore = this.calculateNetworkRisk(event, context, details);
    
    this.addSecurityEvent({
      type: 'network',
      severity: this.getSeverityFromRisk(riskScore),
      source: 'network_layer',
      timestamp: new Date().toISOString(),
      userId: context.userId,
      storeId: context.storeId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      action: event,
      details,
      riskScore
    });

    // Update IP risk scores
    if (context.ipAddress) {
      this.updateIpRiskScore(context.ipAddress, riskScore);
    }

    monitoringService.recordSecurityEvent('suspicious_activity', context);
  }

  logApplicationEvent(event: 'input_validation_failed' | 'csrf_violation' | 'xss_attempt' | 'sql_injection_attempt' | 'file_upload_suspicious' | 'error_enumeration', context: LogContext, details: Record<string, any> = {}): void {
    const riskScore = this.calculateApplicationRisk(event, context, details);
    
    this.addSecurityEvent({
      type: 'application',
      severity: this.getSeverityFromRisk(riskScore),
      source: 'application',
      timestamp: new Date().toISOString(),
      userId: context.userId,
      storeId: context.storeId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      action: event,
      details,
      riskScore
    });

    monitoringService.recordSecurityEvent('suspicious_activity', context);
  }

  // Risk calculation methods
  private calculateAuthenticationRisk(event: string, context: LogContext, details: Record<string, any>): number {
    let risk = 0;

    // Base risk by event type
    switch (event) {
      case 'login_failed': risk += 20; break;
      case 'mfa_failed': risk += 30; break;
      case 'session_expired': risk += 5; break;
      default: risk += 0;
    }

    // IP-based risk
    if (context.ipAddress) {
      const ipRisk = this.ipRiskScores.get(context.ipAddress) || 0;
      risk += ipRisk * 0.3;
    }

    // Time-based risk (unusual hours)
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      risk += 10;
    }

    // Failed attempt frequency
    if (details.consecutiveFailures && details.consecutiveFailures > 3) {
      risk += Math.min(details.consecutiveFailures * 5, 40);
    }

    return Math.min(risk, 100);
  }

  private calculateAuthorizationRisk(event: string, context: LogContext, resource: string, details: Record<string, any>): number {
    void context;
    void details;
    let risk = 0;

    // Base risk by event type
    switch (event) {
      case 'access_denied': risk += 25; break;
      case 'privilege_escalation_attempt': risk += 70; break;
      case 'role_violation': risk += 50; break;
      default: risk += 0;
    }

    // Resource sensitivity
    if (resource.includes('admin') || resource.includes('billing') || resource.includes('user')) {
      risk += 10;
    }

    return Math.min(risk, 100);
  }

  private calculateDataAccessRisk(event: string, context: LogContext, resource: string, details: Record<string, any>): number {
    let risk = 0;

    // Base risk by operation
    switch (event) {
      case 'data_delete': risk += 30; break;
      case 'bulk_operation': risk += 40; break;
      case 'sensitive_data_access': risk += 50; break;
      default: risk += 5;
    }

    // Volume-based risk
    const recordCount = details.recordCount || 1;
    if (recordCount > 100) risk += 20;
    if (recordCount > 1000) risk += 30;

    // Time-based access patterns
    const userId = context.userId;
    if (userId) {
      const pattern = this.userActivityPatterns.get(userId);
      if (pattern && pattern.actions.length > 50) {
        risk += 15; // High activity user
      }
    }

    return Math.min(risk, 100);
  }

  private calculateNetworkRisk(event: string, context: LogContext, details: Record<string, any>): number {
    void context;
    void details;
    let risk = 0;

    // Base risk by event type
    switch (event) {
      case 'rate_limit_exceeded': risk += 30; break;
      case 'ip_blocked': risk += 60; break;
      case 'tor_access': risk += 80; break;
      case 'unusual_location': risk += 40; break;
      default: risk += 20;
    }

    return Math.min(risk, 100);
  }

  private calculateApplicationRisk(event: string, context: LogContext, details: Record<string, any>): number {
    void context;
    void details;
    let risk = 0;

    // Base risk by event type
    switch (event) {
      case 'sql_injection_attempt': risk += 75; break;
      case 'xss_attempt': risk += 70; break;
      case 'csrf_violation': risk += 60; break;
      case 'file_upload_suspicious': risk += 50; break;
      default: risk += 30;
    }

    return Math.min(risk, 100);
  }

  private getSeverityFromRisk(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= this.RISK_THRESHOLD_CRITICAL) return 'critical';
    if (riskScore >= this.RISK_THRESHOLD_HIGH) return 'high';
    if (riskScore >= this.RISK_THRESHOLD_MEDIUM) return 'medium';
    return 'low';
  }

  private addSecurityEvent(event: SecurityEvent): void {
    this.securityEvents.push(event);

    // Keep only recent events
    if (this.securityEvents.length > this.MAX_EVENTS) {
      this.securityEvents = this.securityEvents.slice(-this.MAX_EVENTS);
    }

    // Log high-risk events immediately
    if (event.severity === 'high' || event.severity === 'critical') {
      logger.warn(`High-risk security event detected: ${event.action}`, {
        userId: event.userId,
        storeId: event.storeId,
        ipAddress: event.ipAddress,
        riskScore: event.riskScore,
        details: event.details
      });
    }

    // Send webhook alerts for critical events
    if (event.severity === 'critical') {
      void this.sendWebhookAlert(event);
    }
  }

  private analyzeAuthenticationPattern(context: LogContext, event: string): void {
    if (!context.ipAddress) return;

    // Track failed logins per IP
    if (event === 'login_failed') {
      const currentRisk = this.ipRiskScores.get(context.ipAddress) || 0;
      const newRisk = Math.min(currentRisk + 10, 100);
      this.ipRiskScores.set(context.ipAddress, newRisk);

      // Mark IP as suspicious after multiple failures
      if (newRisk >= 50) {
        this.suspiciousIps.add(context.ipAddress);
      }
    } else if (event === 'login_success') {
      // Reduce risk score on successful login
      const currentRisk = this.ipRiskScores.get(context.ipAddress) || 0;
      this.ipRiskScores.set(context.ipAddress, Math.max(currentRisk - 5, 0));
    }
  }

  private updateUserActivityPattern(userId?: string, action?: string): void {
    if (!userId || !action) return;

    const pattern = this.userActivityPatterns.get(userId) || { actions: [], timestamps: [] };
    pattern.actions.push(action);
    pattern.timestamps.push(Date.now());

    // Keep only last 100 actions
    if (pattern.actions.length > 100) {
      pattern.actions = pattern.actions.slice(-100);
      pattern.timestamps = pattern.timestamps.slice(-100);
    }

    this.userActivityPatterns.set(userId, pattern);
  }

  private updateIpRiskScore(ipAddress: string, additionalRisk: number): void {
    const currentRisk = this.ipRiskScores.get(ipAddress) || 0;
    const newRisk = Math.min(currentRisk + additionalRisk * 0.1, 100);
    this.ipRiskScores.set(ipAddress, newRisk);

    if (newRisk > 70) {
      this.suspiciousIps.add(ipAddress);
    }
  }

  private async sendWebhookAlert(event: SecurityEvent): Promise<void> {
    const webhookUrl = process.env.MONITORING_ALERT_WEBHOOK;
    if (!webhookUrl) return;

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert: 'Critical Security Event',
          event,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        })
      });

      if (!response.ok) {
        logger.error('Failed to send security webhook alert', { status: response.status });
      }
    } catch (error) {
      logger.error('Error sending security webhook alert', {}, error as Error);
    }
  }

  private cleanupOldEvents(): void {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    this.securityEvents = this.securityEvents.filter(event => 
      new Date(event.timestamp).getTime() > oneDayAgo
    );

    // Cleanup old IP risk scores (reset weekly)
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    for (const [ip, lastUpdate] of this.ipRiskScores.entries()) {
      if (lastUpdate < oneWeekAgo) {
        this.ipRiskScores.delete(ip);
        this.suspiciousIps.delete(ip);
      }
    }

    logger.info('Security audit cleanup completed', {
      eventsRetained: this.securityEvents.length,
      trackedIps: this.ipRiskScores.size
    });
  }

  // Public methods for querying security data
  getSecurityMetrics(): SecurityMetrics {
    const now = Date.now();
    const last24Hours = now - (24 * 60 * 60 * 1000);
    
    const recentEvents = this.securityEvents.filter(event => 
      new Date(event.timestamp).getTime() > last24Hours
    );

    const authEvents = recentEvents.filter(e => e.type === 'authentication').length;
    const failedLogins = recentEvents.filter(e => 
      e.type === 'authentication' && e.action === 'login_failed'
    ).length;
    
    const highRiskEvents = recentEvents.filter(e => 
      e.severity === 'high' || e.severity === 'critical'
    ).length;

    // Calculate overall threat level
    let threatLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (highRiskEvents > 10) threatLevel = 'critical';
    else if (highRiskEvents > 5) threatLevel = 'high';
    else if (highRiskEvents > 2) threatLevel = 'medium';

    // Data access patterns
    const userAccessMap = new Map<string, { count: number; risk: number }>();
    recentEvents.filter(e => e.type === 'data_access' && e.userId).forEach(event => {
      const existing = userAccessMap.get(event.userId!) || { count: 0, risk: 0 };
      userAccessMap.set(event.userId!, {
        count: existing.count + 1,
        risk: Math.max(existing.risk, event.riskScore)
      });
    });

    const dataAccessPatterns = Array.from(userAccessMap.entries()).map(([userId, data]) => ({
      userId,
      accessCount: data.count,
      riskScore: data.risk
    }));

    return {
      authenticationEvents: authEvents,
      failedLogins,
      suspiciousIps: Array.from(this.suspiciousIps),
      highRiskEvents,
      dataAccessPatterns,
      threatLevel
    };
  }

  getSecurityEvents(filters: {
    type?: SecurityEvent['type'];
    severity?: SecurityEvent['severity'];
    userId?: string;
    storeId?: string;
    timeRange?: { start: string; end: string };
    limit?: number;
  } = {}): SecurityEvent[] {
    let events = [...this.securityEvents];

    // Apply filters
    if (filters.type) {
      events = events.filter(e => e.type === filters.type);
    }
    if (filters.severity) {
      events = events.filter(e => e.severity === filters.severity);
    }
    if (filters.userId) {
      events = events.filter(e => e.userId === filters.userId);
    }
    if (filters.storeId) {
      events = events.filter(e => e.storeId === filters.storeId);
    }
    if (filters.timeRange) {
      const start = new Date(filters.timeRange.start).getTime();
      const end = new Date(filters.timeRange.end).getTime();
      events = events.filter(e => {
        const eventTime = new Date(e.timestamp).getTime();
        return eventTime >= start && eventTime <= end;
      });
    }

    // Sort by timestamp (newest first) and limit
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (filters.limit) {
      events = events.slice(0, filters.limit);
    }

    return events;
  }

  isIpSuspicious(ipAddress: string): boolean {
    return this.suspiciousIps.has(ipAddress);
  }

  getIpRiskScore(ipAddress: string): number {
    return this.ipRiskScores.get(ipAddress) || 0;
  }
}

// Export singleton instance
export const securityAuditService = new SecurityAuditService();

// Middleware for automatic security logging
export const securityAuditMiddleware = (req: Request, res: Response, next: () => void): void => {
  const originalSend = res.send;

  res.send = function(data: any) {
    // Log suspicious responses
    if (res.statusCode === 401 || res.statusCode === 403) {
      const context: LogContext = {
        userId: (req.session as any)?.user?.id,
        storeId: (req.session as any)?.user?.storeId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        path: req.path
      };

      if (res.statusCode === 401) {
        securityAuditService.logAuthenticationEvent('login_failed', context, {
          path: req.path,
          method: req.method
        });
      } else if (res.statusCode === 403) {
        securityAuditService.logAuthorizationEvent('access_denied', context, req.path, {
          method: req.method
        });
      }
    }

    return originalSend.call(this, data);
  };

  next();
};
