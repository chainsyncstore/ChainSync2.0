import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cryptoModuleMock, globalCryptoMock } from '../utils/crypto-mocks';

type TrackedCryptoMock = typeof cryptoModuleMock & {
  __reset: () => void;
  __callHistory: Record<string, any[]>;
  __setSeed: (_seed: number) => void;
  __getState: () => {
    seed: number;
    callCounter: number;
    callHistoryLengths: Record<string, number>;
  };
};

const trackedCryptoModuleMock = cryptoModuleMock as unknown as TrackedCryptoMock;
const trackedGlobalCryptoMock = globalCryptoMock as unknown as TrackedCryptoMock;

describe('Crypto Mocks', () => {
  let mockCrypto: TrackedCryptoMock;

  beforeEach(() => {
    mockCrypto = trackedCryptoModuleMock;
    vi.clearAllMocks();
    mockCrypto.__reset();
  });

  describe('randomBytes', () => {
    it('should generate deterministic random bytes', () => {
      const result1 = mockCrypto.randomBytes(32);
      const result2 = mockCrypto.randomBytes(32);
      
      expect(result1.toString()).toBeDefined();
      expect(result1.toString()).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(result1.toString()).toBe(result2.toString()); // Deterministic
    });

    it('should generate different values for different sizes', () => {
      const result1 = mockCrypto.randomBytes(16);
      const result2 = mockCrypto.randomBytes(32);
      
      expect(result1.toString()).not.toBe(result2.toString());
      expect(result1.toString()).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(result2.toString()).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should support different encodings', () => {
      const result = mockCrypto.randomBytes(16);
      
      const hex = result.toString('hex');
      const base64 = result.toString('base64');
      const base64url = result.toString('base64url');
      
      expect(hex).toMatch(/^[0-9a-f]{32}$/);
      expect(base64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(base64url).toMatch(/^[A-Za-z0-9_-]+={0,2}$/);
    });

    it('should track call history', () => {
      mockCrypto.randomBytes(16);
      mockCrypto.randomBytes(32);
      
      expect(mockCrypto.__callHistory.randomBytes).toHaveLength(2);
      expect(mockCrypto.__callHistory.randomBytes[0].size).toBe(16);
      expect(mockCrypto.__callHistory.randomBytes[1].size).toBe(32);
    });
  });

  describe('randomUUID', () => {
    it('should generate unique UUIDs', () => {
      const uuid1 = mockCrypto.randomUUID();
      const uuid2 = mockCrypto.randomUUID();
      
      expect(uuid1).toMatch(/^mocked-uuid-/);
      expect(uuid2).toMatch(/^mocked-uuid-/);
      expect(uuid1).not.toBe(uuid2);
    });

    it('should track call history', () => {
      mockCrypto.randomUUID();
      mockCrypto.randomUUID();
      
      expect(mockCrypto.__callHistory.randomUUID).toHaveLength(2);
    });
  });

  describe('createHash', () => {
    it('should create hash with update and digest', () => {
      const hash = mockCrypto.createHash('sha256');
      const result = hash.update('test-data').digest('hex');
      
      expect(result).toMatch(/^mocked-sha256-hash-test-data$/);
    });

    it('should support different digest encodings', () => {
      const hash = mockCrypto.createHash('md5');
      const data = 'test-data';
      
      const hex = hash.update(data).digest('hex');
      const base64 = hash.update(data).digest('base64');
      
      expect(hex).toMatch(/^mocked-md5-hash-test-data$/);
      expect(base64).toBeDefined();
    });

    it('should track call history', () => {
      mockCrypto.createHash('sha256');
      mockCrypto.createHash('md5');
      
      expect(mockCrypto.__callHistory.createHash).toHaveLength(2);
      expect(mockCrypto.__callHistory.createHash[0].algorithm).toBe('sha256');
      expect(mockCrypto.__callHistory.createHash[1].algorithm).toBe('md5');
    });
  });

  describe('createHmac', () => {
    it('should create HMAC with update and digest', () => {
      const hmac = mockCrypto.createHmac('sha256', 'secret-key');
      const result = hmac.update('test-data').digest('hex');
      
      expect(result).toMatch(/^mocked-sha256-hmac-secret-key-test-data$/);
    });

    it('should track call history', () => {
      mockCrypto.createHmac('sha256', 'key1');
      mockCrypto.createHmac('md5', 'key2');
      
      expect(mockCrypto.__callHistory.createHmac).toHaveLength(2);
      expect(mockCrypto.__callHistory.createHmac[0].algorithm).toBe('sha256');
      expect(mockCrypto.__callHistory.createHmac[0].key).toBe('key1');
    });
  });

  describe('pbkdf2', () => {
    it('should call callback with derived key', async () => {
      return new Promise<void>((resolve) => {
        mockCrypto.pbkdf2('password', 'salt', 1000, 32, 'sha256', (err: any, derivedKey: Buffer) => {
          expect(err).toBeNull();
          expect(derivedKey.toString()).toMatch(/^mocked-pbkdf2-password-salt-1000-32-sha256$/);
          resolve();
        });
      });
    });

    it('should track call history', async () => {
      return new Promise<void>((resolve) => {
        mockCrypto.pbkdf2('password', 'salt', 1000, 32, 'sha256', () => {
          expect(mockCrypto.__callHistory.pbkdf2).toHaveLength(1);
          expect(mockCrypto.__callHistory.pbkdf2[0].password).toBe('password');
          expect(mockCrypto.__callHistory.pbkdf2[0].salt).toBe('salt');
          expect(mockCrypto.__callHistory.pbkdf2[0].iterations).toBe(1000);
          expect(mockCrypto.__callHistory.pbkdf2[0].keylen).toBe(32);
          expect(mockCrypto.__callHistory.pbkdf2[0].digest).toBe('sha256');
          resolve();
        });
      });
    });
  });

  describe('scrypt', () => {
    it('should call callback with derived key', async () => {
      return new Promise<void>((resolve) => {
        mockCrypto.scrypt('password', 'salt', 32, {}, (err: any, derivedKey: Buffer) => {
          expect(err).toBeNull();
          expect(derivedKey.toString()).toMatch(/^mocked-scrypt-password-salt-32$/);
          resolve();
        });
      });
    });

    it('should track call history', async () => {
      return new Promise<void>((resolve) => {
        mockCrypto.scrypt('password', 'salt', 32, { N: 16384 }, () => {
          expect(mockCrypto.__callHistory.scrypt).toHaveLength(1);
          expect(mockCrypto.__callHistory.scrypt[0].password).toBe('password');
          expect(mockCrypto.__callHistory.scrypt[0].salt).toBe('salt');
          expect(mockCrypto.__callHistory.scrypt[0].keylen).toBe(32);
          expect(mockCrypto.__callHistory.scrypt[0].options).toEqual({ N: 16384 });
          resolve();
        });
      });
    });
  });

  describe('randomFill', () => {
    it('should fill buffer with random values', () => {
      const buffer = Buffer.alloc(10);
      const result = mockCrypto.randomFill(buffer, 2, 6);
      
      expect(result).toBe(buffer);
      expect(mockCrypto.__callHistory.randomFill).toHaveLength(1);
      expect(mockCrypto.__callHistory.randomFill[0].buffer).toBe(buffer);
      expect(mockCrypto.__callHistory.randomFill[0].offset).toBe(2);
      expect(mockCrypto.__callHistory.randomFill[0].size).toBe(6);
    });
  });

  describe('randomInt', () => {
    it('should generate random integers within range', () => {
      const result1 = mockCrypto.randomInt(1, 10);
      const result2 = mockCrypto.randomInt(1, 10);
      
      expect(result1).toBeGreaterThanOrEqual(1);
      expect(result1).toBeLessThan(10);
      expect(result2).toBeGreaterThanOrEqual(1);
      expect(result2).toBeLessThan(10);
    });

    it('should track call history', () => {
      mockCrypto.randomInt(1, 10);
      mockCrypto.randomInt(0, 100);
      
      expect(mockCrypto.__callHistory.randomInt).toHaveLength(2);
      expect(mockCrypto.__callHistory.randomInt[0].min).toBe(1);
      expect(mockCrypto.__callHistory.randomInt[0].max).toBe(10);
    });
  });

  describe('getRandomValues', () => {
    it('should fill Uint8Array with random values', () => {
      const array = new Uint8Array(8);
      const result = mockCrypto.getRandomValues(array);
      
      expect(result).toBe(array);
      expect(mockCrypto.__callHistory.getRandomValues).toHaveLength(1);
      expect(mockCrypto.__callHistory.getRandomValues[0].array).toBe(array);
    });
  });

  describe('additional crypto functions', () => {
    it('should provide constants', () => {
      expect(mockCrypto.constants.RSA_PKCS1_PADDING).toBe(1);
      expect(mockCrypto.constants.RSA_PKCS1_OAEP_PADDING).toBe(4);
      expect(mockCrypto.constants.RSA_NO_PADDING).toBe(3);
    });

    it('should provide timingSafeEqual', () => {
      const buffer1 = Buffer.from('test');
      const buffer2 = Buffer.from('test');
      const buffer3 = Buffer.from('different');
      
      expect(mockCrypto.timingSafeEqual(buffer1, buffer2)).toBe(true);
      expect(mockCrypto.timingSafeEqual(buffer1, buffer3)).toBe(false);
    });

    it('should provide verify function', () => {
      expect(mockCrypto.verify('sha256', 'data', 'key', 'valid-signature-data')).toBe(true);
      expect(mockCrypto.verify('sha256', 'data', 'key', 'invalid-signature')).toBe(false);
    });

    it('should provide sign function', () => {
      const signature = mockCrypto.sign('sha256', 'data', 'key');
      expect(signature.toString()).toMatch(/^valid-signature-data-sha256$/);
    });
  });

  describe('reset functionality', () => {
    it('should reset call history and counter', () => {
      mockCrypto.randomBytes(16);
      mockCrypto.randomUUID();
      
      expect(mockCrypto.__callHistory.randomBytes).toHaveLength(1);
      expect(mockCrypto.__callHistory.randomUUID).toHaveLength(1);
      
      mockCrypto.__reset();
      
      expect(mockCrypto.__callHistory.randomBytes).toHaveLength(0);
      expect(mockCrypto.__callHistory.randomUUID).toHaveLength(0);
      
      // Should generate same values for same size (deterministic)
      const result1 = mockCrypto.randomBytes(16);
      const result2 = mockCrypto.randomBytes(16);
      expect(result1.toString()).toBe(result2.toString());
      
      // Should generate different values for different sizes
      const result3 = mockCrypto.randomBytes(32);
      expect(result1.toString()).not.toBe(result3.toString());
    });

    it('should maintain deterministic behavior after reset', () => {
      mockCrypto.__reset();
      
      // Generate same sequence of values
      const result1 = mockCrypto.randomBytes(16);
      const result2 = mockCrypto.randomBytes(16);
      const result3 = mockCrypto.randomBytes(16);
      
      // Reset and generate same sequence again
      mockCrypto.__reset();
      const result1Again = mockCrypto.randomBytes(16);
      const result2Again = mockCrypto.randomBytes(16);
      const result3Again = mockCrypto.randomBytes(16);
      
      expect(result1.toString()).toBe(result1Again.toString());
      expect(result2.toString()).toBe(result2Again.toString());
      expect(result3.toString()).toBe(result3Again.toString());
    });
  });

  describe('seed management', () => {
    it('should allow setting custom seed', () => {
      mockCrypto.__setSeed(999);
      
      const result1 = mockCrypto.randomBytes(16);
      const result2 = mockCrypto.randomBytes(16);
      
      // Reset to default seed
      mockCrypto.__setSeed(12345);
      const result1Default = mockCrypto.randomBytes(16);
      const result2Default = mockCrypto.randomBytes(16);
      
      // Different seeds should produce different results
      expect(result1.toString()).not.toBe(result1Default.toString());
      expect(result2.toString()).not.toBe(result2Default.toString());
    });

    it('should provide state information', () => {
      mockCrypto.__reset();
      mockCrypto.randomBytes(16);
      mockCrypto.randomUUID();
      
      const state = mockCrypto.__getState();
      
      expect(state.seed).toBe(12345);
      expect(state.callCounter).toBe(1); // Only UUID increments counter
      expect(state.callHistoryLengths.randomBytes).toBe(1);
      expect(state.callHistoryLengths.randomUUID).toBe(1);
    });
  });

  describe('module mock exports', () => {
    it('should export cryptoModuleMock with named exports', () => {
      expect(trackedCryptoModuleMock.randomBytes).toBeDefined();
      expect(trackedCryptoModuleMock.randomUUID).toBeDefined();
    });

    it('should export globalCryptoMock', () => {
      expect(trackedGlobalCryptoMock.randomBytes).toBeDefined();
      expect(trackedGlobalCryptoMock.randomUUID).toBeDefined();
      expect(trackedGlobalCryptoMock.getRandomValues).toBeDefined();
    });

    it('should maintain call history across shared instances', () => {
      // Both exports should reference the same mock instance
      expect(trackedCryptoModuleMock).toBe(trackedGlobalCryptoMock);
      
      // Clear any existing history
      trackedCryptoModuleMock.__reset();
      
      // Make calls through one export
      trackedCryptoModuleMock.randomBytes(16);
      trackedCryptoModuleMock.randomUUID();
      
      // Check history through the other export
      expect(trackedGlobalCryptoMock.__callHistory.randomBytes).toHaveLength(1);
      expect(trackedGlobalCryptoMock.__callHistory.randomUUID).toHaveLength(1);
      
      // Make more calls through the other export
      trackedGlobalCryptoMock.randomBytes(32);
      
      // Check history through the first export
      expect(trackedCryptoModuleMock.__callHistory.randomBytes).toHaveLength(2);
      expect(trackedCryptoModuleMock.__callHistory.randomBytes[1].size).toBe(32);
    });
  });
});
