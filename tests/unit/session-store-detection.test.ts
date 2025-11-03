import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';

import { describe, expect, it, vi } from 'vitest';

// Import after potential env changes
import { configureSession } from '../../server/session';

// Mock redis client to avoid real network connections
vi.mock('redis', () => ({
  createClient: () => ({
    on: () => undefined,
    connect: async () => undefined
  })
}));

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

describe('Session store detection', () => {
  function buildApp(envOverrides: Record<string, string | undefined>) {
    const app = express();
    app.use(express.json());
    app.use(configureSession(envOverrides?.REDIS_URL, 'secret-1234567890'));
    app.get('/store-type', (req: Request, res: Response) => {
      const name = (req.sessionStore as any)?.constructor?.name || 'Unknown';
      res.json({ name });
    });
    return app;
  }

  it('uses in-memory store when redisUrl is undefined', async () => {
    const app = buildApp({});
    const res = await request(app).get('/store-type').expect(200);
    const { name } = res.body;
    expect(typeof name).toBe('string');
    expect(name).toContain('Memory'); // express-session MemoryStore
  });

  it('uses Redis store when redisUrl is provided', async () => {
    const app = buildApp({ REDIS_URL: 'redis://localhost:6379' });
    const res = await request(app).get('/store-type').expect(200);
    const { name } = res.body;
    expect(name).toBe('RedisStore');
  });

  it('defaults to MemoryStore in development', async () => {
    const app = buildApp({ NODE_ENV: 'development' });
    const res = await request(app).get('/store-type').expect(200);
    const { name } = res.body;
    expect(typeof name).toBe('string');
    expect(name).toContain('Memory'); // express-session MemoryStore
  });
});
