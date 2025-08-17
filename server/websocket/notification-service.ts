import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { logger } from '../lib/logger';
import { db } from '../db';
import { notifications, websocketConnections } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { securityAuditService } from '../lib/security-audit';
import { monitoringService } from '../lib/monitoring';
import { loadEnv } from '../../shared/env';

export interface NotificationEvent {
  type: 'inventory_alert' | 'sales_update' | 'system_alert' | 'ai_insight' | 'low_stock' | 'payment_alert' | 'user_activity';
  storeId: string;
  userId?: string;
  title: string;
  message: string;
  data?: any;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface WebSocketMessage {
  type: 'notification' | 'ping' | 'pong' | 'auth' | 'subscribe' | 'unsubscribe' | 'event';
  data?: any;
  timestamp: number;
}

export interface AuthenticatedConnection {
  ws: WebSocket;
  userId: string;
  storeId: string;
  connectionId: string;
  subscriptions: Set<string>;
}

export class NotificationService {
  private wss: WebSocketServer;
  private connections: Map<string, AuthenticatedConnection> = new Map();
  private channels: Map<string, Set<string>> = new Map(); // channel -> connectionIds
  private config: any;

  constructor(server: Server) {
    // Load Phase 8 configuration
    this.config = loadEnv(process.env);
    
    if (!this.config.WS_ENABLED) {
      logger.info('WebSocket service disabled by configuration');
      return;
    }

    this.wss = new WebSocketServer({ 
      server,
      path: this.config.WS_PATH,
      clientTracking: true,
      maxPayload: 16 * 1024, // 16KB max message size
      perMessageDeflate: true // Enable compression
    });
    
    this.setupWebSocketServer();
    this.startHeartbeat();
    this.setupConnectionLimiter();
    
    logger.info('WebSocket notification service initialized', {
      path: this.config.WS_PATH,
      maxConnections: this.config.WS_MAX_CONNECTIONS,
      heartbeatInterval: this.config.WS_HEARTBEAT_INTERVAL
    });
  }

  private setupConnectionLimiter() {
    // Check connection limits
    setInterval(() => {
      const connectionCount = this.connections.size;
      if (connectionCount > this.config.WS_MAX_CONNECTIONS) {
        logger.warn('WebSocket connection limit exceeded', { 
          current: connectionCount, 
          limit: this.config.WS_MAX_CONNECTIONS 
        });
        // Close oldest connections
        const connectionsToClose = connectionCount - this.config.WS_MAX_CONNECTIONS;
        const connectionIds = Array.from(this.connections.keys()).slice(0, connectionsToClose);
        connectionIds.forEach(id => this.handleDisconnection(id));
      }
    }, 30000); // Check every 30 seconds
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const connectionId = this.generateConnectionId();
      const clientIp = request.socket.remoteAddress || 'unknown';
      
      // Security audit for new connection
      securityAuditService.logNetworkEvent('suspicious_request', {
        ipAddress: clientIp,
        userAgent: request.headers['user-agent'],
        path: request.url
      }, { connectionType: 'websocket' });
      
      // Check if IP is suspicious
      if (securityAuditService.isIpSuspicious(clientIp)) {
        logger.warn('WebSocket connection from suspicious IP', { connectionId, clientIp });
        ws.close(1008, 'Access denied');
        return;
      }
      
      logger.info('WebSocket connection established', { 
        connectionId, 
        clientIp,
        totalConnections: this.connections.size + 1
      });

      // Set up connection event handlers
      ws.on('message', (data: Buffer) => {
        this.handleMessage(ws, connectionId, data);
      });

      ws.on('close', () => {
        this.handleDisconnection(connectionId);
      });

      ws.on('error', (error) => {
        const err = error as unknown as { message?: string };
        logger.error('WebSocket error', { connectionId, error: err?.message || 'unknown' });
        this.handleDisconnection(connectionId);
      });

      // Send initial connection message
      this.sendMessage(ws, {
        type: 'notification',
        data: { message: 'Connected to notification service' },
        timestamp: Date.now()
      });
    });

    logger.info('WebSocket notification service started');
  }

  private async handleMessage(ws: WebSocket, connectionId: string, data: Buffer) {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'auth':
          await this.handleAuthentication(ws, connectionId, message.data);
          break;
        case 'subscribe':
          await this.handleSubscription(connectionId, message.data);
          break;
        case 'unsubscribe':
          await this.handleUnsubscription(connectionId, message.data);
          break;
        case 'ping':
          this.sendMessage(ws, { type: 'pong', timestamp: Date.now() });
          break;
        default:
          logger.warn('Unknown message type', { connectionId, type: message.type });
      }
    } catch (error) {
      const err = error as unknown as { message?: string };
      logger.error('Error handling WebSocket message', { connectionId, error: err?.message || 'unknown' });
      this.sendError(ws, 'Invalid message format');
    }
  }

  private async handleAuthentication(ws: WebSocket, connectionId: string, authData: any) {
    try {
      if (!authData.token) {
        this.sendError(ws, 'Authentication token required');
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(authData.token, process.env.SESSION_SECRET!) as any;
      const userId = decoded.userId;
      const storeId = authData.storeId || decoded.storeId || '';

      if (!userId) {
        this.sendError(ws, 'Invalid token payload');
        return;
      }

      // Store authenticated connection
      const connection: AuthenticatedConnection = {
        ws,
        userId,
        storeId,
        connectionId,
        subscriptions: new Set()
      };

      this.connections.set(connectionId, connection);

      // Track connection in database
      await this.trackConnection(connectionId, userId, storeId, authData.userAgent, authData.ipAddress);

      // Subscribe to default channels
      if (storeId) {
        await this.handleSubscription(connectionId, { channel: `store:${storeId}` });
      }
      await this.handleSubscription(connectionId, { channel: `user:${userId}` });

      this.sendMessage(ws, {
        type: 'notification',
        data: { message: 'Authentication successful' },
        timestamp: Date.now()
      });

      logger.info('WebSocket authentication successful', { connectionId, userId, storeId });
    } catch (error) {
      const err = error as unknown as { message?: string };
      logger.error('Authentication failed', { connectionId, error: err?.message || 'unknown' });
      this.sendError(ws, 'Authentication failed');
    }
  }

  private async handleSubscription(connectionId: string, data: any) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn('Subscription attempt for unknown connection', { connectionId });
      return;
    }

    const channel = data.channel;
    if (!channel) {
      logger.warn('Subscription attempt without channel', { connectionId });
      return;
    }

    // Add to connection subscriptions
    connection.subscriptions.add(channel);

    // Add to channel subscribers
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(connectionId);

    logger.info('Channel subscription added', { connectionId, channel });
  }

  private async handleUnsubscription(connectionId: string, data: any) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const channel = data.channel;
    if (!channel) return;

    // Remove from connection subscriptions
    connection.subscriptions.delete(channel);

    // Remove from channel subscribers
    const channelSubscribers = this.channels.get(channel);
    if (channelSubscribers) {
      channelSubscribers.delete(connectionId);
      if (channelSubscribers.size === 0) {
        this.channels.delete(channel);
      }
    }

    logger.info('Channel subscription removed', { connectionId, channel });
  }

  private async handleDisconnection(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from all channels
    connection.subscriptions.forEach(channel => {
      const channelSubscribers = this.channels.get(channel);
      if (channelSubscribers) {
        channelSubscribers.delete(connectionId);
        if (channelSubscribers.size === 0) {
          this.channels.delete(channel);
        }
      }
    });

    // Remove connection
    this.connections.delete(connectionId);

    // Update database
    await this.untrackConnection(connectionId);

    logger.info('WebSocket connection closed', { connectionId });
  }

  public async broadcastNotification(event: NotificationEvent) {
    try {
      // Store notification in database
      const notification = await db.insert(notifications).values({
        type: event.type,
        storeId: event.storeId,
        userId: event.userId,
        title: event.title,
        message: event.message,
        data: event.data ? JSON.stringify(event.data) : undefined,
        priority: event.priority
      } as unknown as typeof notifications.$inferInsert).returning();

      // Determine target channels
      const channels = new Set<string>();
      
      // Store channel
      channels.add(`store:${event.storeId}`);
      
      // User-specific channel if specified
      if (event.userId) {
        channels.add(`user:${event.userId}`);
      }
      
      // Priority-based channels
      if (event.priority === 'critical') {
        channels.add(`critical:${event.storeId}`);
      }

      // Broadcast to all subscribers
      const message: WebSocketMessage = {
        type: 'notification',
        data: {
          id: notification[0].id,
          type: event.type,
          title: event.title,
          message: event.message,
          data: event.data,
          priority: event.priority,
          timestamp: new Date().toISOString()
        },
        timestamp: Date.now()
      };

      let deliveredCount = 0;
      channels.forEach(channel => {
        const subscribers = this.channels.get(channel);
        if (subscribers) {
          subscribers.forEach(connectionId => {
            const connection = this.connections.get(connectionId);
            if (connection && connection.ws.readyState === WebSocket.OPEN) {
              this.sendMessage(connection.ws, message);
              deliveredCount++;
            }
          });
        }
      });

      logger.info('Notification broadcasted', {
        notificationId: notification[0].id,
        channels: Array.from(channels),
        deliveredCount,
        totalSubscribers: this.connections.size
      });

      return notification[0];
    } catch (error) {
      const err = error as unknown as { message?: string };
      logger.error('Error broadcasting notification', { error: err?.message || 'unknown', event });
      throw error;
    }
  }

  // Lightweight channel publish for app-domain events
  public async publish(channel: string, payload: any) {
    const subscribers = this.channels.get(channel);
    if (!subscribers) return;
    const message: WebSocketMessage = {
      type: 'event',
      data: payload,
      timestamp: Date.now()
    };
    subscribers.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection && connection.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(connection.ws, message);
      }
    });
  }

  public async sendToUser(userId: string, event: NotificationEvent) {
    const userConnections = Array.from(this.connections.values())
      .filter(conn => conn.userId === userId);

    const message: WebSocketMessage = {
      type: 'notification',
      data: {
        type: event.type,
        title: event.title,
        message: event.message,
        data: event.data,
        priority: event.priority,
        timestamp: new Date().toISOString()
      },
      timestamp: Date.now()
    };

    userConnections.forEach(connection => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(connection.ws, message);
      }
    });

    logger.info('Notification sent to user', { userId, connections: userConnections.length });
  }

  public async sendToStore(storeId: string, event: NotificationEvent) {
    const storeConnections = Array.from(this.connections.values())
      .filter(conn => conn.storeId === storeId);

    const message: WebSocketMessage = {
      type: 'notification',
      data: {
        type: event.type,
        title: event.title,
        message: event.message,
        data: event.data,
        priority: event.priority,
        timestamp: new Date().toISOString()
      },
      timestamp: Date.now()
    };

    storeConnections.forEach(connection => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(connection.ws, message);
      }
    });

    logger.info('Notification sent to store', { storeId, connections: storeConnections.length });
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string) {
    this.sendMessage(ws, {
      type: 'notification',
      data: { error },
      timestamp: Date.now()
    });
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private async trackConnection(connectionId: string, userId: string, storeId: string, userAgent?: string, ipAddress?: string) {
    try {
      await db.insert(websocketConnections).values({
        connectionId,
        userId,
        storeId,
        userAgent,
        ipAddress: ipAddress ? ipAddress as any : null,
        isActive: true,
        connectedAt: new Date(),
        lastActivity: new Date()
      } as unknown as typeof websocketConnections.$inferInsert);
    } catch (error) {
      const err = error as unknown as { message?: string };
      logger.error('Error tracking connection', { connectionId, error: err?.message || 'unknown' });
    }
  }

  private async untrackConnection(connectionId: string) {
    try {
      await db.update(websocketConnections)
        .set({
          isActive: false as any,
          disconnectedAt: new Date()
        } as any)
        .where(eq(websocketConnections.connectionId, connectionId));
    } catch (error) {
      const err = error as unknown as { message?: string };
      logger.error('Error untracking connection', { connectionId, error: err?.message || 'unknown' });
    }
  }

  private startHeartbeat() {
    setInterval(() => {
      const message: WebSocketMessage = {
        type: 'ping',
        timestamp: Date.now()
      };

      this.connections.forEach(connection => {
        if (connection.ws.readyState === WebSocket.OPEN) {
          this.sendMessage(connection.ws, message);
        }
      });
    }, 30000); // 30 seconds
  }

  // Statistics and monitoring
  public getStats() {
    const totalConnections = this.connections.size;
    const totalClients = this.wss.clients.size;
    const channelCount = this.channels.size;
    
    // Calculate connection health
    let healthyConnections = 0;
    this.connections.forEach(connection => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        healthyConnections++;
      }
    });

    // Get channel statistics
    const channelStats = Array.from(this.channels.entries()).map(([channel, connectionIds]) => ({
      channel,
      subscriberCount: connectionIds.size
    }));

    return {
      connections: {
        total: totalConnections,
        healthy: healthyConnections,
        clients: totalClients,
        healthRate: totalConnections > 0 ? (healthyConnections / totalConnections) * 100 : 100
      },
      channels: {
        total: channelCount,
        details: channelStats
      },
      config: {
        enabled: this.config?.WS_ENABLED || false,
        path: this.config?.WS_PATH || '/ws/notifications',
        maxConnections: this.config?.WS_MAX_CONNECTIONS || 1000,
        heartbeatInterval: this.config?.WS_HEARTBEAT_INTERVAL || 30000
      },
      timestamp: new Date().toISOString()
    };
  }

  // Get connection details (admin only)
  getConnectionDetails() {
    return Array.from(this.connections.entries()).map(([connectionId, connection]) => ({
      connectionId,
      userId: connection.userId,
      storeId: connection.storeId,
      subscriptions: Array.from(connection.subscriptions),
      isHealthy: connection.ws.readyState === WebSocket.OPEN,
      readyState: connection.ws.readyState
    }));
  }

  public close() {
    this.wss.close();
    logger.info('WebSocket notification service stopped');
  }
} 