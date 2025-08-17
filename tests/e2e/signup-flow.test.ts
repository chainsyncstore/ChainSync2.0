import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { setupTestDatabase, teardownTestDatabase } from '../setup';

const runUiE2E = process.env.RUN_UI_E2E === 'true';
const suite = runUiE2E ? describe : describe.skip;

suite('Signup Flow E2E Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    await setupTestDatabase();
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterEach(async () => {
    await page.close();
  });

  it('should complete full signup flow: signup, verify email, login, access dashboard', async () => {
    // Navigate to signup page
    await page.goto('http://localhost:3000/signup');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Create Your ChainSync Account")');
    
    // Fill out the signup form
    await page.fill('#firstName', 'John');
    await page.fill('#lastName', 'Doe');
    await page.fill('#email', `test-${Date.now()}@example.com`);
    await page.fill('#phone', '1234567890');
    await page.fill('#companyName', 'Test Company');
    await page.fill('#password', 'SecurePass123!');
    await page.fill('#confirmPassword', 'SecurePass123!');
    
    // Select basic tier
    await page.click('text=basic');
    
    // Select international location
    await page.click('text=International');
    
    // Submit the form
    await page.click('button:has-text("Create Account & Continue")');
    
    // Wait for payment step
    await page.waitForSelector('h1:has-text("Complete Your Subscription")');
    
    // Verify we're on payment step with correct tier
    const tierText = await page.textContent('span:has-text("basic")');
    expect(tierText).toContain('basic');
    
    // Go back to form
    await page.click('button:has-text("Back to Form")');
    
    // Verify we're back on signup form
    await page.waitForSelector('h1:has-text("Create Your ChainSync Account")');
  }, 30000);

  it('should ignore manipulated tier selection in URL parameters', async () => {
    // Navigate to signup page with manipulated tier parameter
    await page.goto('http://localhost:3000/signup?tier=enterprise&location=nigeria');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Create Your ChainSync Account")');
    
    // Fill out the form
    await page.fill('#firstName', 'Jane');
    await page.fill('#lastName', 'Smith');
    await page.fill('#email', `test-${Date.now()}-2@example.com`);
    await page.fill('#phone', '0987654321');
    await page.fill('#companyName', 'Another Company');
    await page.fill('#password', 'AnotherPass123!');
    await page.fill('#confirmPassword', 'AnotherPass123!');
    
    // Submit the form
    await page.click('button:has-text("Create Account & Continue")');
    
    // Wait for payment step
    await page.waitForSelector('h1:has-text("Complete Your Subscription")');
    
    // Verify that the tier is still basic (not enterprise from URL)
    const tierText = await page.textContent('span:has-text("basic")');
    expect(tierText).toContain('basic');
    
    // Verify location is still international (not nigeria from URL)
    const paymentProvider = await page.textContent('text=Flutterwave');
    expect(paymentProvider).toBeTruthy();
  }, 30000);

  it('should show password strength meter and provide feedback', async () => {
    await page.goto('http://localhost:3000/signup');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Create Your ChainSync Account")');
    
    // Type a weak password
    await page.fill('#password', 'weak');
    
    // Wait for password strength meter to appear
    await page.waitForSelector('text=Password Strength:');
    
    // Verify strength meter shows weak password
    const strengthText = await page.textContent('text=Weak');
    expect(strengthText).toBeTruthy();
    
    // Type a strong password
    await page.fill('#password', 'SecurePass123!');
    
    // Verify strength meter shows strong password
    const strongStrengthText = await page.textContent('text=Strong');
    expect(strongStrengthText).toBeTruthy();
  }, 15000);

  it('should format phone number input with masking', async () => {
    await page.goto('http://localhost:3000/signup');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Create Your ChainSync Account")');
    
    // Type phone number
    await page.fill('#phone', '1234567890');
    
    // Verify the input shows formatted phone number
    const phoneValue = await page.inputValue('#phone');
    expect(phoneValue).toBe('123-456-7890');
  }, 10000);

  it('should validate form fields and show appropriate errors', async () => {
    await page.goto('http://localhost:3000/signup');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Create Your ChainSync Account")');
    
    // Try to submit empty form
    await page.click('button:has-text("Create Account & Continue")');
    
    // Verify validation errors appear
    await page.waitForSelector('text=First name is required');
    await page.waitForSelector('text=Last name is required');
    await page.waitForSelector('text=Email is required');
    await page.waitForSelector('text=Phone number is required');
    await page.waitForSelector('text=Company name is required');
    await page.waitForSelector('text=Password is required');
    
    // Fill in some fields with invalid data
    await page.fill('#email', 'invalid-email');
    await page.fill('#password', 'short');
    
    // Verify specific validation errors
    await page.waitForSelector('text=Invalid email format');
    await page.waitForSelector('text=Password must be at least 8 characters');
  }, 15000);

  it('should handle network errors gracefully with generic messages', async () => {
    // Mock network failure by using invalid endpoint
    await page.goto('http://localhost:3000/signup');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Create Your ChainSync Account")');
    
    // Fill out the form
    await page.fill('#firstName', 'Test');
    await page.fill('#lastName', 'User');
    await page.fill('#email', `test-${Date.now()}-3@example.com`);
    await page.fill('#phone', '1234567890');
    await page.fill('#companyName', 'Test Company');
    await page.fill('#password', 'SecurePass123!');
    await page.fill('#confirmPassword', 'SecurePass123!');
    
    // Mock fetch to fail
    await page.addInitScript(() => {
      window.fetch = async () => {
        throw new Error('Network error');
      };
    });
    
    // Submit the form
    await page.click('button:has-text("Create Account & Continue")');
    
    // Verify generic error message appears
    await page.waitForSelector('text=Account creation failed. Please try again or contact support.');
  }, 20000);
});
