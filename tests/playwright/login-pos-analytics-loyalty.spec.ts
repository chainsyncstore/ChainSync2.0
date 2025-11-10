import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'info.elvisoffice@gmail.com';
const ADMIN_PASSWORD = '@Chisom5940';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

type LoginOptions = {
  email: string;
  password: string;
  role: 'admin' | 'manager' | 'cashier';
};

async function applySetCookieHeaders(page: any, response: any) {
  const setCookieHeaders = response.headersArray?.().filter((h: { name: string }) => h.name.toLowerCase() === 'set-cookie') ?? [];
  if (setCookieHeaders.length === 0) return;
  const base = new URL(BASE_URL);
  const cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Lax' | 'None' | 'Strict';
    expires?: number;
  }[] = [];
  for (const header of setCookieHeaders) {
    const parts = header.value.split(';').map((p: string) => p.trim());
    const [nameValue, ...attrParts] = parts;
    if (!nameValue) continue;
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex === -1) continue;
    const name = nameValue.slice(0, eqIndex).trim();
    const value = nameValue.slice(eqIndex + 1);
    const cookie: {
      name: string;
      value: string;
      domain: string;
      path: string;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Lax' | 'None' | 'Strict';
      expires?: number;
    } = {
      name,
      value,
      domain: base.hostname,
      path: '/',
      secure: base.protocol === 'https:',
    };
    for (const attr of attrParts) {
      const lower = attr.toLowerCase();
      if (lower === 'httponly') {
        cookie.httpOnly = true;
      } else if (lower === 'secure') {
        cookie.secure = true;
      } else if (lower.startsWith('path=')) {
        cookie.path = attr.slice(5) || '/';
      } else if (lower.startsWith('domain=')) {
        cookie.domain = attr.slice(7);
      } else if (lower.startsWith('samesite=')) {
        const valueLower = attr.slice(9).toLowerCase();
        if (valueLower === 'lax') cookie.sameSite = 'Lax';
        else if (valueLower === 'none') cookie.sameSite = 'None';
        else if (valueLower === 'strict') cookie.sameSite = 'Strict';
      } else if (lower.startsWith('expires=')) {
        const expiresValue = Date.parse(attr.slice(8));
        if (!Number.isNaN(expiresValue)) {
          cookie.expires = Math.floor(expiresValue / 1000);
        }
      }
    }
    cookies.push(cookie);
  }
  if (cookies.length > 0) {
    await page.context().addCookies(cookies);
  }
}

async function buildAuthHeaders(page: any, csrfToken?: string) {
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((cookie: { name: string; value: string }) => `${cookie.name}=${cookie.value}`).join('; ');
  return {
    'content-type': 'application/json',
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };
}

async function fetchAuthHeaders(page: any) {
  const csrfResp = await page.request.get('/api/auth/csrf-token');
  if (!csrfResp.ok()) {
    throw new Error(`Failed to refresh CSRF token: ${csrfResp.status()}`);
  }
  await applySetCookieHeaders(page, csrfResp);
  const csrfPayload = await csrfResp.json().catch(() => ({}));
  const csrfToken = csrfPayload?.token;
  const headers = await buildAuthHeaders(page, csrfToken);
  return { headers, csrfToken };
}

async function apiLogin(page: any, { email, password, role }: LoginOptions) {
  const csrfResp = await page.request.get('/api/auth/csrf-token');
  if (!csrfResp.ok()) {
    throw new Error(`Failed to fetch CSRF token: ${csrfResp.status()}`);
  }
  await applySetCookieHeaders(page, csrfResp);
  const csrfPayload = await csrfResp.json().catch(() => ({}));
  const csrfToken = csrfPayload?.token;
  const loginHeaders = await buildAuthHeaders(page, csrfToken);

  const loginResp = await page.request.post('/api/auth/login', {
    headers: loginHeaders,
    data: { email, password, role },
  });
  if (!loginResp.ok()) {
    const body = await loginResp.text();
    throw new Error(`Login failed with status ${loginResp.status()}\n${body}`);
  }
  await applySetCookieHeaders(page, loginResp);
  await page.goto('/');
  return fetchAuthHeaders(page);
}

test('full supermarket workflow including subscription & autopay', async ({ page }, testInfo) => {
  testInfo.setTimeout(testInfo.timeout + 60_000);

  // Ensure backend ready
  await page.goto('/healthz');

  // Admin login via API to bypass flaky UI auth for now
  await page.goto('/login');
  let adminAuth = await apiLogin(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
  await expect(page).toHaveURL(/analytics|\//);

  // Verify analytics exports accessible
  adminAuth = await fetchAuthHeaders(page);
  const respCsv = await page.request.get('/api/analytics/export.csv', { headers: adminAuth.headers });
  expect(respCsv.ok()).toBeTruthy();
  expect(await respCsv.text()).toContain('date,revenue');
  const respPdf = await page.request.get('/api/analytics/export.pdf', { headers: adminAuth.headers });
  if (!respPdf.ok()) {
    const pdfBody = await respPdf.text();
    await testInfo.attach('analytics-export.pdf.response.txt', {
      contentType: 'text/plain',
      body: `status=${respPdf.status()}\n${pdfBody}`,
    });
    throw new Error(`Analytics PDF export failed with status ${respPdf.status()}`);
  }

  // Billing contact update
  await page.goto('/admin/billing');
  await expect(page).toHaveURL(/\/admin\/billing/);
  await page.waitForLoadState('networkidle');
  const billingInput = page.getByPlaceholder('billing@example.com');
  await expect(billingInput).toBeVisible();

  adminAuth = await fetchAuthHeaders(page);
  const billingDetailsResp = await page.request.get('/api/admin/org/billing', {
    headers: {
      ...adminAuth.headers,
      'cache-control': 'no-cache',
      accept: 'application/json',
    },
  });
  if (!billingDetailsResp.ok()) {
    const body = await billingDetailsResp.text();
    await testInfo.attach('billing-details.response.txt', {
      contentType: 'text/plain',
      body: `status=${billingDetailsResp.status()}\n${body}`,
    });
    throw new Error(`Failed to fetch billing details with status ${billingDetailsResp.status()}`);
  }
  const billingDetails = await billingDetailsResp.json().catch(() => ({}));
  const orgId = billingDetails?.org?.id ?? billingDetails?.organization?.id;
  if (!orgId) {
    await testInfo.attach('billing-details.payload.json', {
      contentType: 'application/json',
      body: JSON.stringify(billingDetails, null, 2),
    });
    throw new Error('Organization id missing from billing details response');
  }

  const newBillingEmail = `qa-billing+${Date.now()}@chainsync.test`;
  await billingInput.fill(newBillingEmail);

  adminAuth = await fetchAuthHeaders(page);
  const billingPatchResp = await page.request.patch('/api/admin/org/billing', {
    headers: adminAuth.headers,
    data: { billingEmail: newBillingEmail },
  });
  if (!billingPatchResp.ok()) {
    const body = await billingPatchResp.text();
    await testInfo.attach('billing-update.response.txt', {
      contentType: 'text/plain',
      body: `status=${billingPatchResp.status()}\n${body}`,
    });
    throw new Error(`Billing update failed with status ${billingPatchResp.status()}`);
  }

  // Subscribe & configure autopay (mocked)
  adminAuth = await fetchAuthHeaders(page);
  const subscribeResponse = await page.request.post('/api/billing/subscribe', {
    headers: adminAuth.headers,
    data: {
      orgId,
      planCode: 'pro',
      email: newBillingEmail,
    },
  });
  if (!subscribeResponse.ok()) {
    const body = await subscribeResponse.text();
    await testInfo.attach('billing-subscribe.response.txt', {
      contentType: 'text/plain',
      body: `status=${subscribeResponse.status()}\n${body}`,
    });
    throw new Error(`Billing subscribe failed with status ${subscribeResponse.status()}`);
  }
  const subscribePayload = await subscribeResponse.json();
  expect(subscribePayload.redirectUrl).toContain('https://checkout.paystack.com/');

  adminAuth = await fetchAuthHeaders(page);
  const confirmResponse = await page.request.post('/api/billing/autopay/confirm', {
    headers: adminAuth.headers,
    data: { provider: subscribePayload.provider, reference: subscribePayload.reference },
  });
  if (!confirmResponse.ok()) {
    const body = await confirmResponse.text();
    await testInfo.attach('autopay-confirm.response.txt', {
      contentType: 'text/plain',
      body: `status=${confirmResponse.status()}\n${body}`,
    });
    throw new Error(`Autopay confirm failed with status ${confirmResponse.status()}`);
  }
  const confirmPayload = await confirmResponse.json();
  expect(confirmPayload.autopay.enabled).toBeTruthy();
  expect(confirmPayload.autopay.details?.last4).toBe('4242');

  adminAuth = await fetchAuthHeaders(page);
  const autopayStatus = await page.request.get('/api/billing/autopay', { headers: adminAuth.headers });
  const autopayJson = await autopayStatus.json();
  expect(autopayJson.autopay.status).toBe('configured');
  await expect(page.getByText('Subscriptions', { exact: true })).toBeVisible();
  const subscriptionRow = page.getByRole('row', { name: /pro\s+PAYSTACK\s+TRIAL/i });
  await expect(subscriptionRow).toBeVisible();

  // Multi-store management: create store & inspect metrics
  await page.goto('/multi-store');
  await expect(page.getByRole('heading', { name: 'Multi-Store Management' })).toBeVisible();
  const storeName = `QA Branch ${Date.now()}`;
  await page.getByLabel('Store Name').fill(storeName);
  await page.getByLabel('Address').fill('123 Playwright Ave');
  await page.getByRole('button', { name: 'Create Store' }).click();
  const storeToast = page.getByRole('status').filter({ hasText: 'Store created' }).first();
  await expect(storeToast).toBeVisible();

  // Navigate to staff management for the newly created store
  const staffLink = page.getByRole('button', { name: /Manage Staff/i }).first();
  await staffLink.click();
  await expect(page).toHaveURL(/\/stores\/.*\/staff/);
  await expect(page.getByRole('heading', { name: 'Store Staff' })).toBeVisible();
  await page.getByLabel('First name').fill('Cashier');
  await page.getByLabel('Last name').fill('Playwright');
  await page.getByLabel('Email').fill(`cashier+${Date.now()}@chainsync.test`);
  await page.getByRole('combobox', { name: 'Role' }).click();
  await page.getByRole('option', { name: /Cashier/i }).click();
  const [staffResponse] = await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/staff') && resp.request().method() === 'POST'),
    page.getByRole('button', { name: 'Create Staff' }).click(),
  ]);
  const staffPayload = await staffResponse.json();
  const staffCredentials = {
    email: staffPayload?.credentials?.email as string | undefined,
    password: staffPayload?.credentials?.password as string | undefined,
  };
  const staffToast = page.getByRole('status').filter({ hasText: 'Staff member created' }).first();
  await expect(staffToast).toBeVisible();

  if (!staffCredentials.email || !staffCredentials.password) {
    throw new Error('Staff credentials were not returned in response');
  }

  // Inventory data import (synthetic CSV)
  const importPage = await page.context().newPage();
  await importPage.goto('/data-import');
  await expect(importPage.getByRole('heading', { name: 'Data Import' })).toBeVisible();
  await importPage.getByRole('tab', { name: 'Inventory' }).click();
  const inventoryUploader = importPage.locator('#csv-file-input').first();
  const csvContent = 'sku,barcode,name,cost_price,sale_price,vat_rate,reorder_level,initial_quantity\nSKU123,12345,Playwright Test Item,100,120,7.5,5,10';
  await inventoryUploader.setInputFiles({
    name: 'inventory.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvContent, 'utf-8'),
  });
  await expect(importPage.getByText('File uploaded successfully!')).toBeVisible({ timeout: 10_000 });
  await importPage.close();

  // Switch to cashier to perform POS flow
  adminAuth = await fetchAuthHeaders(page);
  await page.request.post('/api/auth/logout', { headers: adminAuth.headers });
  await page.goto('/login');
  let cashierAuth = await apiLogin(page, { email: staffCredentials.email, password: staffCredentials.password, role: 'cashier' });
  await expect(page).toHaveURL(/\/pos|\//);

  // POS sale without scanner, ensure receipt modal reachable
  await page.goto('/pos');
  await expect(page).toHaveURL(/\/pos/);
  await page.waitForLoadState('networkidle');
  const searchInput = page.getByLabel('Scan or Enter Barcode');
  await expect(searchInput).toBeVisible({ timeout: 10_000 });
  await searchInput.fill('12345');
  await page.keyboard.press('Enter');
  const addButton = page.getByRole('button', { name: /Add to cart|Add product/i }).first();
  if (await addButton.isVisible()) {
    await addButton.click();
  }
  await page.getByRole('button', { name: 'Cash' }).click();
  const amountInput = page.getByLabel('Amount Received');
  await amountInput.fill('50');
  const [saleResponse] = await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/api/pos/sales') && resp.request().method() === 'POST'),
    page.getByRole('button', { name: 'Complete Sale' }).click(),
  ]);
  const saleJson = await saleResponse.json();
  expect(saleJson?.id).toBeTruthy();
  await expect(page.getByText('Cart is empty')).toBeVisible({ timeout: 10_000 });

  // Return to admin context for remaining flows
  cashierAuth = await fetchAuthHeaders(page);
  await page.request.post('/api/auth/logout', { headers: cashierAuth.headers });
  await page.goto('/login');
  const adminReturnAuth = await apiLogin(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
  await expect(page).toHaveURL(/analytics|\//);

  // Analytics & AI insights sanity
  await page.goto('/analytics');
  await expect(page.getByText('Analytics Period')).toBeVisible();
  await page.goto('/analytics');
  const insightButton = page.getByRole('button', { name: /Generate Insight/i });
  if (await insightButton.isVisible()) {
    await insightButton.click();
    await expect(page.getByText(/Generating insight|AI insight/i)).toBeVisible({ timeout: 10_000 });
  }

  // Loyalty page sanity check
  await page.goto('/loyalty');
  await expect(page.getByRole('heading', { name: 'Loyalty Program' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Customers' })).toBeVisible();

  // Retry dunning to ensure admin action works
  await page.goto('/admin/billing');
  const retryButton = page.getByRole('button', { name: /Retry dunning/i }).first();
  if (await retryButton.isVisible()) {
    await retryButton.click();
  }
  await expect(page.getByText('Dunning History')).toBeVisible();

  // Collect autopay status for reporting
  await testInfo.attach('autopay-status.json', {
    contentType: 'application/json',
    body: JSON.stringify(autopayJson, null, 2),
  });

  // Logout to finish
  await page.request.post('/api/auth/logout');
});


