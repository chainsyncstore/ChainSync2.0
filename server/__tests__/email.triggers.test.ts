import { eq } from 'drizzle-orm';
import request from 'supertest';
import { users } from '@shared/schema';
import { db } from '../db';
import { sendEmail } from '../email';
import app from '../index'; // Updated to import from index.ts

// Add jest types for globals
/// <reference types="jest" />

jest.mock('../email', () => ({
  ...jest.requireActual('../email'),
  sendEmail: jest.fn(async () => true),
}));

const testUser = {
  firstName: 'Test',
  lastName: 'User',
  email: 'testuser@example.com',
  password: 'TestPass123!',
  companyName: 'TestCo',
  tier: 'basic',
  location: 'nigeria',
};

describe('Email Triggers', () => {
  let agent: request.Agent;
  let userId: string;

  beforeAll(async () => {
    agent = request.agent(app);
    await db.delete(users).where(eq(users.email, testUser.email));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, testUser.email));
  });

  it('sends welcome and verification emails on signup', async () => {
    const res = await agent.post('/api/auth/signup').send(testUser);
    expect(res.status).toBe(201);
    expect(sendEmail).toHaveBeenCalled();
    userId = res.body.user.id;
  });

  it('sends password reset email', async () => {
    const res = await agent.post('/api/auth/request-password-reset').send({ email: testUser.email });
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalled();
  });

  it('sends password reset success email', async () => {
    // Simulate password reset token
    const token = 'dummy-token';
    jest.spyOn(require('jsonwebtoken'), 'verify').mockReturnValue({ id: userId, email: testUser.email });
    const res = await agent.post('/api/auth/reset-password').send({ token, password: 'NewPass123!' });
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalled();
  });

  it('sends password change alert email', async () => {
    // Login first
    await agent.post('/api/auth/login').send({ email: testUser.email, password: 'NewPass123!' });
    const res = await agent.post('/api/auth/change-password').send({ oldPassword: 'NewPass123!', newPassword: 'ChangedPass123!' });
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalled();
  });

  it('sends account deletion email', async () => {
    // Login again
    await agent.post('/api/auth/login').send({ email: testUser.email, password: 'ChangedPass123!' });
    const res = await agent.post('/api/auth/delete-account').send();
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalled();
  });
});
