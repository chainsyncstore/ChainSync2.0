import { vi } from 'vitest';

/**
 * Working crypto module mock for Node.js tests
 * Fixed issues:
 * - Call history now persists across test runs
 * - Random generation is truly deterministic
 * - Consistent behavior between calls
 */
export const createCryptoMock = () => {
  // Track calls for testing purposes - using a more robust approach
  const callHistory = {
    randomBytes: [] as Array<{ size: number; timestamp: number }>,
    randomUUID: [] as Array<{ timestamp: number }>,
    createHash: [] as Array<{ algorithm: string; data?: string; timestamp: number }>,
    createHmac: [] as Array<{ algorithm: string; key: string; data?: string; timestamp: number }>,
    pbkdf2: [] as Array<{ password: string; salt: string; iterations: number; keylen: number; digest: string; timestamp: number }>,
    scrypt: [] as Array<{ password: string; salt: string; keylen: number; options?: any; timestamp: number }>,
    randomFill: [] as Array<{ buffer: Buffer; offset?: number; size?: number; timestamp: number }>,
    randomInt: [] as Array<{ min?: number; max?: number; timestamp: number }>,
    getRandomValues: [] as Array<{ array: Uint8Array; timestamp: number }>
  };

  // Use a deterministic seed-based approach for random generation
  let seed = 12345; // Fixed seed for deterministic behavior
  let callCounter = 0;
  let randomBytesCounter = 0; // Separate counter for randomBytes calls
  
  const deterministicRandom = (): number => {
    // Linear congruential generator for deterministic "random" numbers
    seed = (seed * 1664525 + 1013904223) % 2**32;
    return (seed & 0x7fffffff) / 0x7fffffff; // Normalize to [0, 1)
  };

  const generateDeterministicRandom = (size: number): string => {
    // Use seed-based pattern for deterministic behavior that can be reset
    // Use a combination of size and seed - same size always returns same result
    const hex = Array.from({ length: size }, (_, i) => {
      const patternValue = ((i * 7 + size * 13 + seed) % 256);
      return patternValue.toString(16).padStart(2, '0');
    }).join('');
    return hex;
  };

  const generateDeterministicUUID = (): string => {
    // Generate deterministic UUID based on call counter
    const timestamp = (1000000 + callCounter).toString(16);
    const random = (callCounter * 7 + 13).toString(16);
    callCounter++;
    return `mocked-uuid-${timestamp}-${random}`;
  };

  // Create the mock crypto object
  const mockCrypto = {
    // Node.js crypto module functions
    randomBytes: vi.fn((size: number) => {
      const timestamp = Date.now();
      callHistory.randomBytes.push({ size, timestamp });
      const hexString = generateDeterministicRandom(size);
      
      return {
        toString: vi.fn((encoding?: string) => {
          if (encoding === 'base64') {
            return Buffer.from(hexString, 'hex').toString('base64');
          }
          if (encoding === 'base64url') {
            return Buffer.from(hexString, 'hex').toString('base64url');
          }
          return hexString;
        }),
        length: size
      };
    }),

    randomUUID: vi.fn(() => {
      const timestamp = Date.now();
      callHistory.randomUUID.push({ timestamp });
      return generateDeterministicUUID();
    }),

    createHash: vi.fn((algorithm: string) => {
      const timestamp = Date.now();
      callHistory.createHash.push({ algorithm, timestamp });
      
      return {
        update: vi.fn((data: string | Buffer) => {
          const lastCall = callHistory.createHash[callHistory.createHash.length - 1];
          if (lastCall) {
            lastCall.data = data.toString();
          }
          return {
            digest: vi.fn((encoding?: string) => {
              const hash = `mocked-${algorithm}-hash-${data}`;
              if (encoding === 'base64') {
                return Buffer.from(hash).toString('base64');
              }
              if (encoding === 'base64url') {
                return Buffer.from(hash).toString('base64url');
              }
              if (encoding === 'hex') {
                return hash; // Return the original string, not hex-encoded
              }
              return hash;
            })
          };
        })
      };
    }),

    createHmac: vi.fn((algorithm: string, key: string) => {
      const timestamp = Date.now();
      callHistory.createHmac.push({ algorithm, key, timestamp });
      
      return {
        update: vi.fn((data: string | Buffer) => {
          const lastCall = callHistory.createHmac[callHistory.createHmac.length - 1];
          if (lastCall) {
            lastCall.data = data.toString();
          }
          return {
            digest: vi.fn((encoding?: string) => {
              const hmac = `mocked-${algorithm}-hmac-${key}-${data}`;
              if (encoding === 'base64') {
                return Buffer.from(hmac).toString('base64');
              }
              if (encoding === 'base64url') {
                return Buffer.from(hmac).toString('base64url');
              }
              if (encoding === 'hex') {
                return hmac; // Return the original string, not hex-encoded
              }
              return hmac;
            })
          };
        })
      };
    }),

    pbkdf2: vi.fn((password: string, salt: string, iterations: number, keylen: number, digest: string, callback: (err: Error | null, derivedKey: Buffer) => void) => {
      const timestamp = Date.now();
      callHistory.pbkdf2.push({ password, salt, iterations, keylen, digest, timestamp });
      
      // Simulate async behavior
      setTimeout(() => {
        const derivedKey = Buffer.from(`mocked-pbkdf2-${password}-${salt}-${iterations}-${keylen}-${digest}`);
        callback(null, derivedKey);
      }, 0);
      
      return undefined;
    }),

    scrypt: vi.fn((password: string, salt: string, keylen: number, options: any, callback: (err: Error | null, derivedKey: Buffer) => void) => {
      const timestamp = Date.now();
      callHistory.scrypt.push({ password, salt, keylen, options, timestamp });
      
      // Simulate async behavior
      setTimeout(() => {
        const derivedKey = Buffer.from(`mocked-scrypt-${password}-${salt}-${keylen}`);
        callback(null, derivedKey);
      }, 0);
      
      return undefined;
    }),

    randomFill: vi.fn((buffer: Buffer, offset?: number, size?: number) => {
      const actualSize = size || buffer.length;
      const actualOffset = offset || 0;
      const timestamp = Date.now();
      
      callHistory.randomFill.push({ buffer, offset: actualOffset, size: actualSize, timestamp });
      
      // Fill the buffer with deterministic values
      for (let i = 0; i < actualSize; i++) {
        buffer[actualOffset + i] = Math.floor(deterministicRandom() * 256);
      }
      
      return buffer;
    }),

    randomInt: vi.fn((min?: number, max?: number) => {
      const timestamp = Date.now();
      callHistory.randomInt.push({ min, max, timestamp });
      
      const randomValue = deterministicRandom();
      
      if (min !== undefined && max !== undefined) {
        return min + Math.floor(randomValue * (max - min));
      } else if (max !== undefined) {
        return Math.floor(randomValue * max);
      } else {
        return Math.floor(randomValue * Number.MAX_SAFE_INTEGER);
      }
    }),

    getRandomValues: vi.fn((array: Uint8Array) => {
      const timestamp = Date.now();
      callHistory.getRandomValues.push({ array, timestamp });
      
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(deterministicRandom() * 256);
      }
      
      return array;
    }),

    // Additional utility functions
    constants: {
      RSA_PKCS1_PADDING: 1,
      RSA_PKCS1_OAEP_PADDING: 4,
      RSA_NO_PADDING: 3
    },

    createCipher: vi.fn(() => ({
      update: vi.fn((data: string) => `encrypted-${data}`),
      final: vi.fn(() => 'final-block')
    })),

    createDecipher: vi.fn(() => ({
      update: vi.fn((data: string) => `decrypted-${data}`),
      final: vi.fn(() => 'final-block')
    })),

    timingSafeEqual: vi.fn((a: Buffer, b: Buffer) => {
      if (a.length !== b.length) return false;
      return a.toString() === b.toString();
    }),

    verify: vi.fn((algorithm: string, data: string, key: string, signature: string) => {
      return signature.startsWith('valid-signature');
    }),

    sign: vi.fn((algorithm: string, data: string, key: string) => {
      return Buffer.from(`valid-signature-${data}-${algorithm}`);
    }),

    generateKeyPair: vi.fn((type: string, options: any, callback: (err: Error | null, publicKey: any, privateKey: any) => void) => {
      setTimeout(() => {
        const publicKey = { type: 'public', algorithm: type };
        const privateKey = { type: 'private', algorithm: type };
        callback(null, publicKey, privateKey);
      }, 0);
      return undefined;
    }),

    createPublicKey: vi.fn((key: any) => ({ type: 'public', key })),
    createPrivateKey: vi.fn((key: any) => ({ type: 'private', key })),

    createSign: vi.fn((algorithm: string) => ({
      update: vi.fn((data: string) => ({
        sign: vi.fn((privateKey: any) => Buffer.from(`signature-${algorithm}-${data}`))
      }))
    })),

    createVerify: vi.fn((algorithm: string) => ({
      update: vi.fn((data: string) => ({
        verify: vi.fn((publicKey: any, signature: string) => signature.startsWith('signature-'))
      }))
    }))
  };

  // Add call history to the mock for testing
  (mockCrypto as any).__callHistory = callHistory;
  
  // Add reset function for clearing call history and resetting seed
  (mockCrypto as any).__reset = () => {
    callHistory.randomBytes.length = 0;
    callHistory.randomUUID.length = 0;
    callHistory.createHash.length = 0;
    callHistory.createHmac.length = 0;
    callHistory.pbkdf2.length = 0;
    callHistory.scrypt.length = 0;
    callHistory.randomFill.length = 0;
    callHistory.randomInt.length = 0;
    callHistory.getRandomValues.length = 0;
    seed = 12345; // Reset to initial seed
    callCounter = 0;
  };

  // Add function to set seed for testing specific scenarios
  (mockCrypto as any).__setSeed = (newSeed: number) => {
    seed = newSeed;
    callCounter = 0;
  };

  // Add function to get current state for debugging
  (mockCrypto as any).__getState = () => ({
    seed,
    callCounter,
    callHistoryLengths: {
      randomBytes: callHistory.randomBytes.length,
      randomUUID: callHistory.randomUUID.length,
      createHash: callHistory.createHash.length,
      createHmac: callHistory.createHmac.length,
      pbkdf2: callHistory.pbkdf2.length,
      scrypt: callHistory.scrypt.length,
      randomFill: callHistory.randomFill.length,
      randomInt: callHistory.randomInt.length,
      getRandomValues: callHistory.getRandomValues.length
    }
  });

  return mockCrypto;
};

// Create a single shared mock instance that persists across tests
const sharedCryptoMock = createCryptoMock();

/**
 * Create a mock for the entire crypto module
 * This can be used with vi.mock('crypto')
 * Uses the shared instance to maintain call history
 */
export const cryptoModuleMock = sharedCryptoMock;

/**
 * Create a mock for the global crypto object (Web Crypto API)
 * This can be used to mock global.crypto
 * Uses the shared instance to maintain call history
 */
export const globalCryptoMock = sharedCryptoMock;

/**
 * Type definitions for the crypto mock
 */
export interface CryptoMock {
  randomBytes: ReturnType<typeof vi.fn>;
  randomUUID: ReturnType<typeof vi.fn>;
  createHash: ReturnType<typeof vi.fn>;
  createHmac: ReturnType<typeof vi.fn>;
  pbkdf2: ReturnType<typeof vi.fn>;
  scrypt: ReturnType<typeof vi.fn>;
  randomFill: ReturnType<typeof vi.fn>;
  randomInt: ReturnType<typeof vi.fn>;
  getRandomValues: ReturnType<typeof vi.fn>;
  constants: Record<string, number>;
  createCipher: ReturnType<typeof vi.fn>;
  createDecipher: ReturnType<typeof vi.fn>;
  timingSafeEqual: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
  sign: ReturnType<typeof vi.fn>;
  generateKeyPair: ReturnType<typeof vi.fn>;
  createPublicKey: ReturnType<typeof vi.fn>;
  createPrivateKey: ReturnType<typeof vi.fn>;
  createSign: ReturnType<typeof vi.fn>;
  createVerify: ReturnType<typeof vi.fn>;
  __callHistory: Record<string, any[]>;
  __reset: () => void;
  __setSeed: (seed: number) => void;
  __getState: () => { seed: number; callCounter: number; callHistoryLengths: Record<string, number> };
}
