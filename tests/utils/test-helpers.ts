import { vi } from 'vitest';

// Common test data factories
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  password: 'hashed-password',
  firstName: 'Test',
  lastName: 'User',
  phone: '+1234567890',
  isVerified: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockStore = (overrides = {}) => ({
  id: 'test-store-id',
  name: 'Test Store',
  address: '123 Test St',
  city: 'Test City',
  state: 'TS',
  zipCode: '12345',
  phone: '+1234567890',
  email: 'store@example.com',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockProduct = (overrides = {}) => ({
  id: 'test-product-id',
  name: 'Test Product',
  description: 'A test product for testing',
  sku: 'TEST-SKU-001',
  price: 9.99,
  cost: 5.00,
  category: 'Test Category',
  brand: 'Test Brand',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

// Mock functions
export const mockConsole = () => {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info
  };

  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();
  console.info = vi.fn();

  return {
    restore: () => {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
      console.info = originalConsole.info;
    }
  };
};

// Mock fetch
export const mockFetch = (response: any, status = 200) => {
  const mockResponse = {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
    headers: new Headers(),
  };

  global.fetch = vi.fn().mockResolvedValue(mockResponse);
  return global.fetch;
};

// Mock localStorage
export const mockLocalStorage = () => {
  const store: Record<string, string> = {};
  
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach(key => delete store[key]);
      }),
      length: Object.keys(store).length,
      key: vi.fn((index: number) => Object.keys(store)[index] || null)
    },
    writable: true
  });
};

// Mock sessionStorage
export const mockSessionStorage = () => {
  const store: Record<string, string> = {};
  
  Object.defineProperty(window, 'sessionStorage', {
    value: {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach(key => delete store[key]);
      }),
      length: Object.keys(store).length,
      key: vi.fn((index: number) => Object.keys(store)[index] || null)
    },
    writable: true
  });
};

// Wait for async operations
export const waitFor = (condition: () => boolean, timeout = 1000) => {
  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('waitFor timeout'));
      } else {
        setTimeout(check, 10);
      }
    };
    
    check();
  });
};

// Clean up function
export const cleanup = () => {
  vi.clearAllMocks();
  vi.clearAllTimers();
};
