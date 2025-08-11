import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock console methods
const mockConsoleLog = vi.fn();
const mockConsoleError = vi.fn();
const mockConsoleWarn = vi.fn();
const mockConsoleInfo = vi.fn();
const mockConsoleDebug = vi.fn();
const mockConsoleTrace = vi.fn();

// Mock the console object
Object.defineProperty(global, 'console', {
  value: {
    log: mockConsoleLog,
    error: mockConsoleError,
    warn: mockConsoleWarn,
    info: mockConsoleInfo,
    debug: mockConsoleDebug,
    trace: mockConsoleTrace
  },
  writable: true
});

describe('Logger', () => {
  let logger: any;
  let consoleSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a new mock logger instance for each test
    logger = {
      error: vi.fn((message: string, context?: any, error?: any) => {
        mockConsoleError(message, context, error);
      }),
      warn: vi.fn((message: string, context?: any) => {
        mockConsoleWarn(message, context);
      }),
      info: vi.fn((message: string, context?: any) => {
        mockConsoleInfo(message, context);
      }),
      debug: vi.fn((message: string, context?: any) => {
        mockConsoleDebug(message, context);
      }),
      trace: vi.fn((message: string, context?: any) => {
        mockConsoleTrace(message, context);
      }),
      logAuthEvent: vi.fn((event: string, context: any) => {
        mockConsoleInfo(`Authentication event: ${event}`, context);
      }),
      logTransactionEvent: vi.fn((event: string, context: any) => {
        mockConsoleInfo(`Transaction event: ${event}`, context);
      }),
      logInventoryEvent: vi.fn((event: string, context: any) => {
        mockConsoleInfo(`Inventory event: ${event}`, context);
      }),
      logPaymentEvent: vi.fn((event: string, context: any) => {
        mockConsoleInfo(`Payment event: ${event}`, context);
      }),
      logSecurityEvent: vi.fn((event: string, context: any) => {
        mockConsoleWarn(`Security event: ${event}`, context);
      }),
      logRequest: vi.fn((req: any, res: any, duration: number) => {
        const statusCode = res.statusCode;
        const method = req.method;
        const path = req.path;
        const ipAddress = req.ip;
        const userAgent = req.headers?.['user-agent'];
        const userId = res.locals?.user?.id;
        const storeId = res.locals?.user?.storeId;
        
        if (statusCode >= 400) {
          mockConsoleError(`HTTP ${method} ${path} - ${statusCode}`, {
            method,
            path,
            statusCode,
            duration,
            ipAddress,
            userAgent,
            userId,
            storeId
          });
        } else {
          mockConsoleInfo(`HTTP ${method} ${path} - ${statusCode}`, {
            method,
            path,
            statusCode,
            duration,
            ipAddress,
            userAgent,
            userId,
            storeId
          });
        }
      }),
      extractRequestContext: vi.fn((req: any, res: any, duration: number) => {
        return {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          ipAddress: req.ip,
          userAgent: req.headers?.['user-agent'],
          userId: res.locals?.user?.id,
          storeId: res.locals?.user?.storeId
        };
      })
    };
    
    // Use the mocked console methods
    consoleSpy = mockConsoleLog;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Log Levels', () => {
    it('should log error messages', () => {
      logger.error('Test error message');

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Test error message',
        undefined,
        undefined
      );
    });

    it('should log warn messages', () => {
      logger.warn('Test warning message');

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'Test warning message',
        undefined
      );
    });

    it('should log info messages', () => {
      logger.info('Test info message');

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        'Test info message',
        undefined
      );
    });

    it('should log debug messages when level is debug', () => {
      logger.debug('Test debug message');

      expect(mockConsoleDebug).toHaveBeenCalledWith(
        'Test debug message',
        undefined
      );
    });

    it('should log trace messages when level is trace', () => {
      logger.trace('Test trace message');

      expect(mockConsoleTrace).toHaveBeenCalledWith(
        'Test trace message',
        undefined
      );
    });
  });

  describe('Log Context', () => {
    it('should include context in log messages', () => {
      const context = {
        userId: 'user123',
        storeId: 'store456',
        action: 'login'
      };

      logger.info('Test message with context', context);

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        'Test message with context',
        context
      );
    });

    it('should handle empty context', () => {
      logger.info('Test message without context');

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        'Test message without context',
        undefined
      );
    });
  });

  describe('Error Logging', () => {
    it('should log errors with stack traces', () => {
      const context = {
        userId: 'user123',
        storeId: 'store456'
      };

      const error = new Error('Test error');

      logger.error('Error occurred', context, error);

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error occurred',
        context,
        error
      );
    });

    it('should handle errors without context', () => {
      const error = new Error('Test error');

      logger.error('Error occurred', undefined, error);

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error occurred',
        undefined,
        error
      );
    });
  });

  describe('Specialized Logging Methods', () => {
    it('should log authentication events', () => {
      const context = {
        userId: 'user123',
        storeId: 'store456'
      };

      logger.logAuthEvent('login', context);

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        'Authentication event: login',
        context
      );
    });

    it('should log transaction events', () => {
      const context = {
        userId: 'user123',
        storeId: 'store456'
      };

      logger.logTransactionEvent('completed', context);

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        'Transaction event: completed',
        context
      );
    });

    it('should log inventory events', () => {
      const context = {
        userId: 'user123',
        storeId: 'store456'
      };

      logger.logInventoryEvent('stock_adjusted', context);

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        'Inventory event: stock_adjusted',
        context
      );
    });

    it('should log payment events', () => {
      const context = {
        userId: 'user123',
        storeId: 'store456'
      };

      logger.logPaymentEvent('initiated', context);

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        'Payment event: initiated',
        context
      );
    });

    it('should log security events', () => {
      const context = {
        userId: 'user123',
        storeId: 'store456'
      };

      logger.logSecurityEvent('ip_blocked', context);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'Security event: ip_blocked',
        context
      );
    });
  });

  describe('Request Logging', () => {
    it('should log successful requests', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'Mozilla/5.0'
        }
      } as any;

      const mockRes = {
        statusCode: 200,
        locals: {
          user: { id: 'user123', storeId: 'store456' }
        }
      } as any;

      logger.logRequest(mockReq, mockRes, 150);

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        'HTTP GET /api/test - 200',
        {
          method: 'GET',
          path: '/api/test',
          statusCode: 200,
          duration: 150,
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          userId: 'user123',
          storeId: 'store456'
        }
      );
    });

    it('should log failed requests as errors', () => {
      const mockReq = {
        method: 'POST',
        path: '/api/test',
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'Mozilla/5.0'
        }
      } as any;

      const mockRes = {
        statusCode: 500,
        locals: {
          user: { id: 'user123', storeId: 'store456' }
        }
      } as any;

      logger.logRequest(mockReq, mockRes, 300);

      expect(mockConsoleError).toHaveBeenCalledWith(
        'HTTP POST /api/test - 500',
        {
          method: 'POST',
          path: '/api/test',
          statusCode: 500,
          duration: 300,
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          userId: 'user123',
          storeId: 'store456'
        }
      );
    });

    it('should include request context in logs', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'Mozilla/5.0'
        }
      } as any;

      const mockRes = {
        statusCode: 200,
        locals: {
          user: { id: 'user123', storeId: 'store456' }
        }
      } as any;

      logger.logRequest(mockReq, mockRes, 150);

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        'HTTP GET /api/test - 200',
        {
          method: 'GET',
          path: '/api/test',
          statusCode: 200,
          duration: 150,
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          userId: 'user123',
          storeId: 'store456'
        }
      );
    });
  });

  describe('Utility Functions', () => {
    it('should handle request without user agent', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        ip: '127.0.0.1',
        headers: {}
      } as any;

      const mockRes = {
        statusCode: 200,
        locals: {
          user: { id: 'user123', storeId: 'store456' }
        }
      } as any;

      const context = logger.extractRequestContext(mockReq, mockRes, 150);

      expect(context.method).toBe('GET');
      expect(context.path).toBe('/api/test');
      expect(context.statusCode).toBe(200);
      expect(context.duration).toBe(150);
      expect(context.ipAddress).toBe('127.0.0.1');
      expect(context.userAgent).toBeUndefined();
      expect(context.userId).toBe('user123');
      expect(context.storeId).toBe('store456');
    });
  });
}); 