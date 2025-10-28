import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Request, type Response } from 'express';
import request from 'supertest';

// Mock redis client to avoid real network connections
vi.mock('redis', () => {
  return {
    createClient: () => ({
      on: (_evt: string, _cb: (...args: any[]) => void) => {},
      connect: async () => {},
    })
  };
});

// Mock connect-redis to supply a recognizable store class
vi.mock('connect-redis', () => {
  const { EventEmitter } = require('events');
  class RedisStoreMock extends EventEmitter {
    client: any;
    prefix?: string;
    constructor(opts: any) {
      super();
      this.client = opts?.client;
      this.prefix = opts?.prefix;
    }
  }
  Object.defineProperty(RedisStoreMock, 'name', { value: 'RedisStore' });
  return { default: RedisStoreMock, __esModule: true } as any;
});

// Import after mocks
import { configureSession } from '../../server/session';

function appWithSession(mw: any) {
  const app = express();
  app.use(mw);
  app.get('/store-type', (req: Request, res: Response) => {
    const name = (req.sessionStore as any)?.constructor?.name || 'Unknown';
    res.json({ name });
  });
  return app;
}

describe('Session store detection', () => {
  it('uses in-memory store when redisUrl is undefined', async () => {
    const app = appWithSession(configureSession(undefined, 'secret-1234567890'));
    const res = await request(app).get('/store-type').expect(200);
    const { name } = res.body;
    expect(typeof name).toBe('string');
    expect(name).toContain('Memory'); // express-session MemoryStore
  });

  it('uses Redis store when redisUrl is provided', async () => {
    const app = appWithSession(configureSession('redis://localhost:6379', 'secret-1234567890'));
    const res = await request(app).get('/store-type').expect(200);
    const { name } = res.body;
    expect(name).toBe('RedisStore');
  });
});
