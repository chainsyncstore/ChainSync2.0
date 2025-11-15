import { test, expect } from '@playwright/test';
import type { APIResponse } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://chainsync.store';
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'info.elvisoffice@gmail.com';
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '@Chisom5940';
const CASHIER_EMAIL = process.env.PLAYWRIGHT_CASHIER_EMAIL ?? 'info.elvisarinze@gmail.com';
const CASHIER_PASSWORD = process.env.PLAYWRIGHT_CASHIER_PASSWORD ?? '@Chisom5940';

const POS_PAGE_URL = '/pos';
const RETURNS_PAGE_URL = '/returns';

interface LoginOptions {
  email: string;
  password: string;
  role: 'admin' | 'manager' | 'cashier';
}

declare global {
  interface Window {
    __chainsyncE2E?: boolean;
    __offlineQueueTestHarness?: {
      listQueuedSales: () => Promise<any[]>;
      clearQueuedSales: () => Promise<void>;
      simulateProcessOnce: () => Promise<void>;
    };
  }
}

async function applySetCookieHeaders(page: any, response: APIResponse) {
  const headers = response.headersArray();
  const setCookieHeaders = headers.filter((header) => header.name.toLowerCase() === 'set-cookie');
  if (setCookieHeaders.length === 0) return;
  const base = new URL(BASE_URL);
  const cookies: any[] = [];
  for (const header of setCookieHeaders) {
    const parts = header.value.split(';').map((part: string) => part.trim());
    const [nameValue, ...attrParts] = parts;
    const [name, value = ''] = nameValue.split('=');
    if (!name) continue;
    const cookie: any = {
      name,
      value,
      domain: base.hostname,
      path: '/',
      secure: base.protocol === 'https:',
    };
    for (const attr of attrParts) {
      const lower = attr.toLowerCase();
      if (lower === 'httponly') cookie.httpOnly = true;
      else if (lower === 'secure') cookie.secure = true;
      else if (lower.startsWith('path=')) cookie.path = attr.slice(5) || '/';
      else if (lower.startsWith('domain=')) cookie.domain = attr.slice(7);
      else if (lower.startsWith('samesite=')) {
        const valueLower = attr.slice(9).toLowerCase();
        cookie.sameSite = valueLower === 'none' ? 'None' : valueLower === 'strict' ? 'Strict' : 'Lax';
      } else if (lower.startsWith('expires=')) {
        const expiresValue = Date.parse(attr.slice(8));
        if (!Number.isNaN(expiresValue)) cookie.expires = Math.floor(expiresValue / 1000);
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
    throw new Error(`Failed to fetch CSRF token: ${csrfResp.status()}`);
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
    throw new Error(`Login failed with status ${loginResp.status()} :: ${body}`);
  }

  await applySetCookieHeaders(page, loginResp);
  await page.goto('/');
  return fetchAuthHeaders(page);
}

async function loginAsCashier(page: any) {
  await page.goto('/login');
  await apiLogin(page, { email: CASHIER_EMAIL, password: CASHIER_PASSWORD, role: 'cashier' });
  await page.goto(POS_PAGE_URL);
  await expect(page).toHaveURL(/\/pos/);
}

async function loginAsAdmin(page: any) {
  await page.goto('/login');
  await apiLogin(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
}

async function enableE2EHarness(page: any) {
  await page.addInitScript(() => {
    (window as any).__chainsyncE2E = true;
  });
  await page.evaluate(() => {
    (window as any).__chainsyncE2E = true;
  });
}

async function clearOfflineQueue(page: any) {
  await page.evaluate(async () => {
    if (window.__offlineQueueTestHarness?.clearQueuedSales) {
      await window.__offlineQueueTestHarness.clearQueuedSales();
    }
  });
}

async function processOfflineQueue(page: any) {
  await page.evaluate(async () => {
    if (window.__offlineQueueTestHarness?.simulateProcessOnce) {
      await window.__offlineQueueTestHarness.simulateProcessOnce();
    }
  });
}

async function getQueuedSalesCount(page: any) {
  return page.evaluate(async () => {
    if (window.__offlineQueueTestHarness?.listQueuedSales) {
      const queued = await window.__offlineQueueTestHarness.listQueuedSales();
      return queued.length;
    }
    return 0;
  });
}

async function setReturnQuantity(page: any, itemId: string, value: string) {
  await page.locator(`[data-testid="return-qty-${itemId}"]`).fill(value);
}

async function selectRestockAction(page: any, itemId: string, value: string) {
  await page.locator(`[data-testid="restock-trigger-${itemId}"]`).click();
  await page.getByRole('option', { name: new RegExp(value, 'i') }).click();
}

async function selectRefundType(page: any, itemId: string, value: string) {
  await page.locator(`[data-testid="refund-trigger-${itemId}"]`).click();
  await page.getByRole('option', { name: new RegExp(value, 'i') }).click();
}

async function setPartialRefundAmount(page: any, itemId: string, value: string) {
  await page.locator(`[data-testid="refund-amount-${itemId}"]`).fill(value);
}

async function ensureScannerReady(page: any) {
  const activateButton = page.getByRole('button', { name: /Activate Scanner/i });
  if (await activateButton.isVisible()) {
    await activateButton.click();
  }
  await expect(page.getByText(/Scanner Active/i)).toBeVisible({ timeout: 5000 });
}

async function simulateBarcodeScan(page: any, barcode: string) {
  await ensureScannerReady(page);
  for (const char of barcode.split('')) {
    await page.keyboard.press(char);
  }
  await page.keyboard.press('Enter');
}

async function fillCashPayment(page: any, amount: string | number) {
  await page.getByRole('button', { name: /^Cash$/i }).click();
  const amountInput = page.getByLabel('Amount Received');
  await amountInput.fill(String(amount));
}

async function completeSale(page: any) {
  const completeButton = page.getByRole('button', { name: /Complete Sale/i });
  await expect(completeButton).toBeEnabled();
  await completeButton.click();
}

async function waitForToast(page: any, text: string) {
  await expect(page.getByText(text, { exact: false })).toBeVisible({ timeout: 10_000 });
}

async function openSyncCenter(page: any) {
  await page.getByRole('button', { name: /View/i }).click();
  await expect(page.getByText('Sync Center')).toBeVisible();
}

async function addProductViaBarcodeMock(page: any, barcode: string, productOverrides?: Partial<{ id: string; name: string; price: number; barcode: string }>) {
  const mockProduct = {
    id: productOverrides?.id ?? `prod-${barcode}`,
    name: productOverrides?.name ?? `Mock Product ${barcode}`,
    barcode,
    price: productOverrides?.price ?? 25,
  };

  const routeUrl = new RegExp(`/api/products/barcode/${barcode}$`);
  await page.route(routeUrl, async (route: any) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ ...mockProduct, salePrice: mockProduct.price, productId: mockProduct.id }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  await simulateBarcodeScan(page, barcode);
  await page.unroute(routeUrl);
  return mockProduct;
}

test.describe.serial('POS offline, peripherals, and returns flows', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EHarness(page);
    await loginAsCashier(page);
    await page.waitForLoadState('networkidle');
    await clearOfflineQueue(page);
  });

  test('scanner events add products and surface errors on lookup miss', async ({ page }) => {
    const barcode = 'QA123456';
    const product = await addProductViaBarcodeMock(page, barcode, { name: 'Scanner Success Item', price: 42 });

    await expect(page.getByText(product.name)).toBeVisible({ timeout: 5000 });

    const failingBarcode = 'FAIL404';
    const failRoute = new RegExp(`/api/products/barcode/${failingBarcode}$`);
    await page.route(failRoute, (route: any) => route.fulfill({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }));
    await simulateBarcodeScan(page, failingBarcode);
    await waitForToast(page, 'Product Not Found');
    await page.unroute(failRoute);
  });

  test('offline queue captures failed sales and exposes sync controls', async ({ page }) => {
    const product = await addProductViaBarcodeMock(page, 'OFFLINE001', { price: 50 });
    await fillCashPayment(page, 50);

    let saleAttempts = 0;
    await page.route('**/api/pos/sales', async (route: any) => {
      saleAttempts += 1;
      if (saleAttempts === 1) {
        await route.fulfill({ status: 500, body: JSON.stringify({ error: 'Simulated failure' }), headers: { 'Content-Type': 'application/json' } });
        return;
      }
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ id: `sale-${Date.now()}`, total: String(product.price), receiptNumber: `POS-${Date.now()}` }),
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await completeSale(page);
    await waitForToast(page, 'Sale queued offline');
    await expect(page.getByText(/pending sale/i)).toBeVisible({ timeout: 10000 });
    await expect(await getQueuedSalesCount(page)).toBeGreaterThan(0);

    await openSyncCenter(page);
    await expect(page.getByText(/Queued sales/i)).toBeVisible();
    await page.getByRole('button', { name: /Close/i }).click();

    // Allow the second attempt to succeed
    await completeSale(page);
    await waitForToast(page, 'Sale Completed');
    await expect(page.getByText(/Queue clear/i)).toBeVisible({ timeout: 10000 });
    await expect(await getQueuedSalesCount(page)).toBe(0);
    await page.unroute('**/api/pos/sales');
  });

  test('returns page submits partial refund payloads and handles validation errors', async ({ page }) => {
    await page.goto(RETURNS_PAGE_URL);
    await expect(page).toHaveURL(/\/returns/);

    const storePayload = [
      { id: 'store-returns', name: 'Returns HQ', currency: 'USD' },
    ];
    await page.route('**/api/stores', (route: any) => route.fulfill({ status: 200, body: JSON.stringify(storePayload), headers: { 'Content-Type': 'application/json' } }));

    const saleLookupResponse = {
      sale: {
        id: 'sale-returns-1',
        storeId: storePayload[0].id,
        occurredAt: new Date().toISOString(),
        status: 'COMPLETED',
        subtotal: '100.00',
        discount: '0',
        tax: '0',
        total: '100.00',
        currency: 'USD',
      },
      items: [
        { id: 'item-1', productId: 'prod-1', name: 'Returnable A', quantity: 2, lineTotal: 60, sku: 'SKU-A' },
        { id: 'item-2', productId: 'prod-2', name: 'Returnable B', quantity: 1, lineTotal: 40, sku: 'SKU-B' },
      ],
    };

    await page.route('**/api/pos/sales/**', (route: any) => route.fulfill({ status: 200, body: JSON.stringify(saleLookupResponse), headers: { 'Content-Type': 'application/json' } }));

    await page.getByLabel(/Sale \/ Receipt ID/i).fill('sale-returns-1');
    await page.getByRole('button', { name: /Fetch/i }).click();
    await expect(page.getByText('sale-returns-1')).toBeVisible({ timeout: 5000 });

    await setReturnQuantity(page, 'item-1', '1');
    await setReturnQuantity(page, 'item-2', '0');
    await selectRestockAction(page, 'item-1', 'Restock');
    await selectRefundType(page, 'item-1', 'Partial');
    await setPartialRefundAmount(page, 'item-1', '15');

    const submitRoute = '**/api/pos/returns';
    await page.route(submitRoute, async (route: any) => {
      const payload = await route.request().postDataJSON();
      await route.fulfill({ status: 200, body: JSON.stringify({ id: 'ret-1', ...payload }), headers: { 'Content-Type': 'application/json' } });
      await expect(payload.items[0].refundAmount).toBe('15.00');
      await expect(payload.items[0].restockAction).toBe('RESTOCK');
    });

    await page.getByRole('button', { name: /Process Return/i }).click();
    await waitForToast(page, 'Return processed');
    await page.unroute(submitRoute);
  });

  test('reconnection sync auto-processes queued sale once network recovers', async ({ page }) => {
    const product = await addProductViaBarcodeMock(page, 'RECONNECT1', { price: 30 });
    await fillCashPayment(page, 30);

    await page.route('**/api/pos/sales', (route: any) => route.abort('failed'));
    await completeSale(page);
    await waitForToast(page, 'Sale queued offline');
    await expect(page.getByText(/pending sale/i)).toBeVisible();
    await page.unroute('**/api/pos/sales');

    await page.route('**/api/pos/sales', (route: any) => route.fulfill({ status: 200, body: JSON.stringify({ id: 'sale-reconnected', total: String(product.price) }), headers: { 'Content-Type': 'application/json' } }));
    await processOfflineQueue(page);
    await processOfflineQueue(page);
    await waitForToast(page, 'Offline queue cleared');
    await expect(await getQueuedSalesCount(page)).toBe(0);
    await page.unroute('**/api/pos/sales');
  });

  test('receipt printing surfaces printer adapter errors', async ({ page }) => {
    const product = await addProductViaBarcodeMock(page, 'PRINT123', { price: 55 });
    await fillCashPayment(page, 55);

    let shouldFail = true;
    await page.route('**/api/pos/sales', (route: any) => route.fulfill({ status: 200, body: JSON.stringify({ id: `print-${Date.now()}`, total: String(product.price) }), headers: { 'Content-Type': 'application/json' } }));

    await page.route('**/printer/mock', async (route: any) => {
      if (shouldFail) {
        await route.fulfill({ status: 500, body: JSON.stringify({ error: 'Printer offline' }), headers: { 'Content-Type': 'application/json' } });
        return;
      }
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true }), headers: { 'Content-Type': 'application/json' } });
    });

    await completeSale(page);
    await waitForToast(page, 'Printer error');
    shouldFail = false;
    await page.getByRole('button', { name: /Print Last Receipt/i }).click();
    await waitForToast(page, 'Receipt sent');
  });
});
