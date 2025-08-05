import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { logger, LogLevel, LogContext, requestLogger, extractLogContext } from '@server/lib/logger';

describe('Logger', () => {
  let consoleSpy: any;

  beforeEach(() => {
    // Spy on console.log to capture log output
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Reset environment
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Log Levels', () => {
    it('should log error messages', () => {
      logger.error('Test error message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test error message')
      );
    });

    it('should log warn messages', () => {
      logger.warn('Test warning message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test warning message')
      );
    });

    it('should log info messages', () => {
      logger.info('Test info message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test info message')
      );
    });

    it('should log debug messages when level is debug', () => {
      process.env.LOG_LEVEL = 'debug';
      logger.debug('Test debug message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test debug message')
      );
    });

    it('should not log debug messages when level is info', () => {
      process.env.LOG_LEVEL = 'info';
      logger.debug('Test debug message');
      
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]')
      );
    });

    it('should log trace messages when level is trace', () => {
      process.env.LOG_LEVEL = 'trace';
      logger.trace('Test trace message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TRACE]')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test trace message')
      );
    });
  });

  describe('Log Context', () => {
    it('should include context in log messages', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        ipAddress: '127.0.0.1'
      };

      logger.info('Test message with context', context);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test message with context'),
        expect.stringContaining('"userId":"user123"'),
        expect.stringContaining('"storeId":"store456"'),
        expect.stringContaining('"ipAddress":"127.0.0.1"')
      );
    });

    it('should handle empty context', () => {
      logger.info('Test message without context');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test message without context'),
        ''
      );
    });
  });

  describe('Error Logging', () => {
    it('should log errors with stack traces', () => {
      const error = new Error('Test error');
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456'
      };

      logger.error('Error occurred', context, error);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.stringContaining('Error occurred'),
        expect.stringContaining('"userId":"user123"'),
        expect.stringContaining('Error: Test error'),
        expect.stringContaining('Stack:')
      );
    });

    it('should handle errors without context', () => {
      const error = new Error('Test error');

      logger.error('Error occurred', undefined, error);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.stringContaining('Error occurred'),
        expect.stringContaining('Error: Test error')
      );
    });
  });

  describe('Specialized Logging Methods', () => {
    it('should log authentication events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        ipAddress: '127.0.0.1'
      };

      logger.logAuthEvent('login', context);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.stringContaining('Authentication event: login')
      );
    });

    it('should log transaction events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        transactionId: 'txn789'
      };

      logger.logTransactionEvent('completed', context);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.stringContaining('Transaction event: completed')
      );
    });

    it('should log inventory events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        productId: 'prod789'
      };

      logger.logInventoryEvent('stock_adjusted', context);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.stringContaining('Inventory event: stock_adjusted')
      );
    });

    it('should log payment events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456'
      };

      logger.logPaymentEvent('initiated', context);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.stringContaining('Payment event: initiated')
      );
    });

    it('should log security events', () => {
      const context: LogContext = {
        userId: 'user123',
        storeId: 'store456',
        ipAddress: '192.168.1.100'
      };

      logger.logSecurityEvent('ip_blocked', context);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        expect.stringContaining('Security event: ip_blocked')
      );
    });
  });

  describe('Request Logging', () => {
    it('should log successful requests', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        ip: '127.0.0.1',
        session: { user: { id: 'user123', storeId: 'store456' } },
        get: vi.fn().mockReturnValue('Mozilla/5.0')
      } as any;

      const mockRes = {
        statusCode: 200
      } as any;

      logger.logRequest(mockReq, mockRes, 150);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.stringContaining('HTTP GET /api/test - 200')
      );
    });

    it('should log failed requests as errors', () => {
      const mockReq = {
        method: 'POST',
        path: '/api/test',
        ip: '127.0.0.1',
        session: { user: { id: 'user123', storeId: 'store456' } },
        get: vi.fn().mockReturnValue('Mozilla/5.0')
      } as any;

      const mockRes = {
        statusCode: 500
      } as any;

      logger.logRequest(mockReq, mockRes, 300);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.stringContaining('HTTP POST /api/test - 500')
      );
    });

    it('should include request context in logs', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        ip: '127.0.0.1',
        session: { user: { id: 'user123', storeId: 'store456' } },
        get: vi.fn().mockReturnValue('Mozilla/5.0')
      } as any;

      const mockRes = {
        statusCode: 200
      } as any;

      logger.logRequest(mockReq, mockRes, 150);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.stringContaining('HTTP GET /api/test - 200'),
        expect.stringContaining('"duration":150'),
        expect.stringContaining('"ipAddress":"127.0.0.1"'),
        expect.stringContaining('"userAgent":"Mozilla/5.0"'),
        expect.stringContaining('"userId":"user123"'),
        expect.stringContaining('"storeId":"store456"')
      );
    });
  });

  describe('Production vs Development Logging', () => {
    it('should use structured JSON logging in production', () => {
      process.env.NODE_ENV = 'production';
      
      logger.info('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\{"timestamp":".*","level":"info","message":"Test message"\}$/)
      );
    });

    it('should use pretty console logging in development', () => {
      process.env.NODE_ENV = 'development';
      
      logger.info('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.stringContaining('Test message')
      );
    });
  });

  describe('Utility Functions', () => {
    it('should extract log context from request', () => {
      const mockReq = {
        session: { user: { id: 'user123', storeId: 'store456' } },
        ip: '127.0.0.1',
        get: vi.fn().mockReturnValue('Mozilla/5.0')
      } as any;

      const context = extractLogContext(mockReq, { customField: 'customValue' });
      
      expect(context.userId).toBe('user123');
      expect(context.storeId).toBe('store456');
      expect(context.ipAddress).toBe('127.0.0.1');
      expect(context.userAgent).toBe('Mozilla/5.0');
      expect(context.customField).toBe('customValue');
    });

    it('should handle request without session', () => {
      const mockReq = {
        ip: '127.0.0.1',
        get: vi.fn().mockReturnValue('Mozilla/5.0')
      } as any;

      const context = extractLogContext(mockReq);
      
      expect(context.userId).toBeUndefined();
      expect(context.storeId).toBeUndefined();
      expect(context.ipAddress).toBe('127.0.0.1');
      expect(context.userAgent).toBe('Mozilla/5.0');
    });

    it('should handle request without user agent', () => {
      const mockReq = {
        session: { user: { id: 'user123', storeId: 'store456' } },
        ip: '127.0.0.1',
        get: vi.fn().mockReturnValue(null)
      } as any;

      const context = extractLogContext(mockReq);
      
      expect(context.userId).toBe('user123');
      expect(context.storeId).toBe('store456');
      expect(context.ipAddress).toBe('127.0.0.1');
      expect(context.userAgent).toBeUndefined();
    });
  });

  describe('Log Level Filtering', () => {
    it('should respect LOG_LEVEL environment variable', () => {
      process.env.LOG_LEVEL = 'warn';
      
      logger.info('This should not be logged');
      logger.warn('This should be logged');
      logger.error('This should be logged');
      
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('This should not be logged')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('This should be logged')
      );
    });

    it('should default to INFO level when LOG_LEVEL is not set', () => {
      delete process.env.LOG_LEVEL;
      
      logger.debug('This should not be logged');
      logger.info('This should be logged');
      
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('This should not be logged')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('This should be logged')
      );
    });
  });
}); 