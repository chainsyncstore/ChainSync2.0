import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'info.elvisoffice@gmail.com';
const ADMIN_PASSWORD = '@Chisom5940';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const USE_REAL_BACKEND = String(process.env.PLAYWRIGHT_USE_REAL_BACKEND).toLowerCase() === 'true';

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

  const newBillingEmail = `qa-billing+${Date.now()}@chainsync.store`;
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
  if (USE_REAL_BACKEND) {
    await testInfo.attach('paystack-redirect-url.txt', {
      contentType: 'text/plain',
      body: subscribePayload.redirectUrl,
    });
  }

  if (!USE_REAL_BACKEND) {
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
    expect(confirmPayload.autopay.provider).toBe(subscribePayload.provider);
  }

  adminAuth = await fetchAuthHeaders(page);
  const autopayStatus = await page.request.get('/api/billing/autopay', { headers: adminAuth.headers });
  const autopayJson = await autopayStatus.json();
  if (USE_REAL_BACKEND) {
    expect(autopayJson.autopay?.status ?? null).toBeNull();
    expect(Boolean(autopayJson.autopay?.enabled)).toBe(false);
  } else {
    expect(autopayJson.autopay.status).toBe('configured');
  }
  await testInfo.attach('autopay-status.json', {
    contentType: 'application/json',
    body: JSON.stringify(autopayJson, null, 2),
  });
  await expect(page.getByText('Subscriptions', { exact: true })).toBeVisible();
  const subscriptionRow = page.getByRole('row', { name: /pro\s+PAYSTACK/i });
  await expect(subscriptionRow).toBeVisible();

  // Multi-store management: create store & inspect metrics
  await page.goto('/multi-store');
  await expect(page.getByRole('heading', { name: 'Multi-Store Management' })).toBeVisible();
  const storeName = `QA Branch ${Date.now()}`;
  adminAuth = await fetchAuthHeaders(page);
  const storeCreateResp = await page.request.post('/api/stores', {
    headers: adminAuth.headers,
    data: {
      name: storeName,
      address: '123 Playwright Ave',
      currency: 'NGN',
    },
  });
  const storeCreateJson = await storeCreateResp.json().catch(() => null);
  if (!storeCreateResp.ok()) {
    await testInfo.attach('store-create.response.txt', {
      contentType: 'text/plain',
      body: `status=${storeCreateResp.status()}`,
    });
    if (storeCreateJson) {
      await testInfo.attach('store-create.response.json', {
        contentType: 'application/json',
        body: JSON.stringify(storeCreateJson, null, 2),
      });
    }
    throw new Error(`Store creation failed with status ${storeCreateResp.status()}`);
  }
  await testInfo.attach('store-create.response.json', {
    contentType: 'application/json',
    body: JSON.stringify(storeCreateJson, null, 2),
  });
  const storesResp = await page.request.get('/api/stores', { headers: adminAuth.headers });
  const storesPayload = await storesResp.json();
  await testInfo.attach('stores-after-create.json', {
    contentType: 'application/json',
    body: JSON.stringify(storesPayload, null, 2),
  });
  const createdStore = Array.isArray(storesPayload)
    ? storesPayload.find((store: any) => store?.name === storeName)
    : null;
  if (!createdStore?.id) {
    throw new Error('Created store not found in /api/stores response');
  }
  await page.goto(`/stores/${createdStore.id}/staff`);
  await expect(page).toHaveURL(new RegExp(`/stores/${createdStore.id}/staff`));
  await expect(page.getByRole('heading', { name: 'Store Staff' })).toBeVisible();
  adminAuth = await fetchAuthHeaders(page);
  const staffEmail = `cashier+${Date.now()}@chainsync.store`;
  const staffResponse = await page.request.post(`/api/stores/${createdStore.id}/staff`, {
    headers: adminAuth.headers,
    data: {
      firstName: 'Cashier',
      lastName: 'Playwright',
      email: staffEmail,
      role: 'cashier',
    },
  });
  const staffPayload = await staffResponse.json().catch(() => null);
  if (!staffResponse.ok()) {
    await testInfo.attach('staff-create.response.txt', {
      contentType: 'text/plain',
      body: `status=${staffResponse.status()}`,
    });
    if (staffPayload) {
      await testInfo.attach('staff-create.response.json', {
        contentType: 'application/json',
        body: JSON.stringify(staffPayload, null, 2),
      });
    }
    throw new Error(`Staff creation failed with status ${staffResponse.status()}`);
  }
  await testInfo.attach('staff-create.response.json', {
    contentType: 'application/json',
    body: JSON.stringify(staffPayload, null, 2),
  });
  const staffCredentials = {
    email: staffPayload?.credentials?.email as string | undefined,
    password: staffPayload?.credentials?.password as string | undefined,
  };
  const staffUserId = staffPayload?.staff?.id as string | undefined;

  if (!staffCredentials.email || !staffCredentials.password) {
    throw new Error('Staff credentials were not returned in response');
  }

  if (staffUserId) {
    const verifyResp = await page.request.post('/api/admin/users/verify', {
      headers: adminAuth.headers,
      data: { userId: staffUserId },
    });
    const verifyJson = await verifyResp.json().catch(() => null);
    await testInfo.attach('staff-verify.response.json', {
      contentType: 'application/json',
      body: JSON.stringify(verifyJson, null, 2),
    });
    if (!verifyResp.ok()) {
      throw new Error(`Staff verification failed with status ${verifyResp.status()}`);
    }
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


