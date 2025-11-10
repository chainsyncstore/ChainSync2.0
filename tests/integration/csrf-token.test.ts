import express, { type Express } from 'express';
import session from 'express-session';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerRoutes } from '../../server/routes';

describe('CSRF Token Endpoint', () => {
  let app: Express;
  let server: any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false, cookie: { secure: false } }));
    await registerRoutes(app as any);
    server = app.listen(0);
  });

  afterAll(async () => {
    if (server) server.close();
  });

  it('returns a token and sets X-CSRF-Token header', async () => {
    const res = await request(server).get('/api/auth/csrf-token').expect(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.headers['x-csrf-token']).toBe(res.body.token);
  });

  it('sets a csrf-token cookie', async () => {
    const res = await request(server).get('/api/auth/csrf-token').expect(200);
    const rawSetCookie = res.headers['set-cookie'];
    const cookies = Array.isArray(rawSetCookie) ? rawSetCookie : rawSetCookie ? [rawSetCookie] : [];
    const hasCsrfCookie = cookies.some((c) => c.toLowerCase().startsWith('csrf-token='));
    expect(hasCsrfCookie).toBe(true);
  });
});
