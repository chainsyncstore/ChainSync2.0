import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';

// Import after potential env changes in tests
import { configureSession } from '../../server/session';

function buildApp() {
  const app = express();
  // Minimal route that touches the session so Set-Cookie is issued
  app.use(configureSession(undefined, 'test-session-secret-1234567890'));
  app.get('/login-sim', (req: Request, res: Response) => {
    (req.session as any).userId = 'user_1';
    res.json({ ok: true });
  });
  return app;
}

describe('Session cookie flags', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('sets SameSite=Lax and no Secure flag in test/dev', async () => {
    process.env.NODE_ENV = 'test';
    const app = buildApp();

    const res = await request(app)
      .get('/login-sim')
      .set('X-Forwarded-Proto', 'https')
      .expect(200);
    const raw = (res.headers as any)['set-cookie'] as unknown;
    const cookies = Array.isArray(raw) ? raw as string[] : (raw ? [String(raw)] : []);
    expect(Array.isArray(cookies)).toBe(true);
    const sessionCookie = cookies.find(c => c.startsWith('chainsync.sid='));
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie!).toContain('HttpOnly');
    expect(sessionCookie!).toContain('SameSite=Lax');
    expect(sessionCookie!).not.toContain('Secure');
  });

  it('sets Secure flag and SameSite=Lax in production', async () => {
    process.env.NODE_ENV = 'production';
    const app = express();
    // Match production behavior for proxies so Secure works behind LB
    app.set('trust proxy', 1);
    // Force request to be treated as HTTPS for secure cookies in tests
    app.use((req: any, _res, next) => {
      try { if (req && req.socket) req.socket.encrypted = true; } catch {}
      next();
    });
    app.use(configureSession(undefined, 'prod-session-secret-1234567890'));
    app.get('/login-sim', (req: Request, res: Response) => {
      (req.session as any).userId = 'user_prod';
      res.json({ ok: true });
    });

    const res = await request(app)
      .get('/login-sim')
      .set('X-Forwarded-Proto', 'https')
      .expect(200);
    const raw = (res.headers as any)['set-cookie'] as unknown;
    const cookies = Array.isArray(raw) ? raw as string[] : (raw ? [String(raw)] : []);
    expect(Array.isArray(cookies)).toBe(true);
    const sessionCookie = cookies.find(c => c.startsWith('chainsync.sid='));
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie!).toContain('HttpOnly');
    expect(sessionCookie!).toContain('SameSite=Lax');
    expect(sessionCookie!).toContain('Secure');
  });
});
