import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { registerRoutes } from '../server/routes.js';
import { storage } from '../server/storage.js';

async function debugAuth() {
  console.log('Starting auth debug test...');
  
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
  
  // Create app
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(session({
    secret: 'test-secret-that-is-long-enough',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  }));
  
  // Register routes
  await registerRoutes(app);
  
  // Create test user
  console.log('Creating test user...');
  const testUser = await storage.createUser({
    username: 'debuguser@example.com',
    password: 'StrongPass123!',
    email: 'debuguser@example.com',
    firstName: 'Debug',
    lastName: 'User',
    phone: '+1234567890',
    companyName: 'Debug Company',
    role: 'cashier',
    tier: 'basic',
    location: 'international',
    isActive: true,
    emailVerified: true
  });
  
  console.log('Created user:', {
    id: testUser.id,
    email: testUser.email,
    isActive: testUser.isActive,
    emailVerified: testUser.emailVerified,
    failedLoginAttempts: testUser.failedLoginAttempts,
    lockedUntil: testUser.lockedUntil
  });
  
  // Try to login
  console.log('Attempting login...');
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'debuguser@example.com',
      password: 'StrongPass123!'
    });
    
  console.log('Login response:', {
    status: loginResponse.status,
    body: loginResponse.body,
    headers: Object.keys(loginResponse.headers)
  });
  
  const sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
  console.log('Session cookie:', sessionCookie ? 'Present' : 'Missing');
  
  // Test auth endpoint
  console.log('Testing /api/auth/me endpoint...');
  const meResponse = await request(app)
    .get('/api/auth/me')
    .set('Cookie', sessionCookie);
    
  console.log('/api/auth/me response:', {
    status: meResponse.status,
    body: meResponse.body
  });
  
  // Clean up
  await storage.clear();
  
  process.exit(0);
}

debugAuth().catch(err => {
  console.error('Debug test failed:', err);
  process.exit(1);
});
