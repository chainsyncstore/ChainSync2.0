import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { helmetConfig } from '../../server/middleware/security';

function expectAllIncluded(haystack: string, needles: string[]) {
  const missing = needles.filter((n) => !haystack.includes(n));
  if (missing.length) {
    // Provide helpful diff on failure
    throw new Error(`CSP header missing expected entries: ${missing.join(', ')}\n\nHeader:\n${haystack}`);
  }
}

describe('CSP policy', () => {
  it('includes payment and captcha provider domains in relevant directives', async () => {
    const app = express();
    app.use(helmetConfig);
    app.get('/', (_req, res) => res.send('ok'));

    const res = await request(app).get('/').expect(200);
    const csp = String(res.headers['content-security-policy'] || '');

    expect(csp.length).toBeGreaterThan(0);

    // script-src must allow SDKs
    expect(csp).toContain('script-src');
    expectAllIncluded(csp, [
      'https://js.paystack.co',
      'https://checkout.flutterwave.com',
      'https://www.google.com',
      'https://www.gstatic.com',
      'https://www.recaptcha.net',
      'https://js.hcaptcha.com',
      'https://hcaptcha.com',
    ]);

    // connect-src must allow APIs
    expect(csp).toContain('connect-src');
    expectAllIncluded(csp, [
      'https://api.paystack.co',
      'https://api.flutterwave.com',
      'https://hcaptcha.com',
      'https://www.google.com',
      'https://www.gstatic.com',
      'https://www.recaptcha.net',
    ]);

    // frame-src must allow hosted iframes/popups
    expect(csp).toContain('frame-src');
    expectAllIncluded(csp, [
      'https://*.paystack.co',
      'https://*.flutterwave.com',
      'https://ravemodal.flwv.io',
      'https://www.google.com',
      'https://www.recaptcha.net',
      'https://hcaptcha.com',
      'https://*.hcaptcha.com',
    ]);

    // form-action allows provider redirects
    expect(csp).toContain('form-action');
    expectAllIncluded(csp, [
      'https://*.paystack.co',
      'https://*.flutterwave.com',
    ]);

    // img-src allows https and data URIs for logos/badges
    expect(csp).toContain("img-src");
    expectAllIncluded(csp, [
      'img-src',
      'https:',
      'data:',
    ]);
  });
});
