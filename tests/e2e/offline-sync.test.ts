import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, Browser, Page, BrowserContext } from 'playwright';

const runUiE2E = process.env.RUN_UI_E2E === 'true';
const suite = runUiE2E ? describe : describe.skip;

suite('Offline sales sync idempotency (SW) [offline]', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    context = await browser.newContext();
    // Ensure SW allowed in dev/static env for E2E
    await context.addInitScript(() => {
      // @ts-ignore
      (window as any).__E2E_ENABLE_SW = true;
      // Capture SW messages
      // @ts-ignore
      (window as any).__SW_MESSAGES__ = [];
      navigator.serviceWorker?.addEventListener?.('message', (event: MessageEvent) => {
        try {
          // @ts-ignore
          (window as any).__SW_MESSAGES__.push(event.data);
        } catch {}
      });
    });
    page = await context.newPage();
  });

  afterEach(async () => {
    await page.close();
    await context.close();
  });

  it('enqueues while offline, syncs once online, single server acceptance per idempotency key', async () => {
    // Go to app root to initialize SW and helpers
    await page.goto('http://localhost:3000/');

    // Wait for SW registration to be ready
    await page.waitForFunction(async () => {
      try {
        // @ts-ignore
        const reg = await navigator.serviceWorker.ready;
        return !!reg;
      } catch { return false; }
    }, { timeout: 15000 });

    // Go offline
    await context.setOffline(true);

    // Prepare a small sale payload
    const salePayload = {
      storeId: 'store_1',
      subtotal: '10.00',
      tax: '0.00',
      discount: '0.00',
      total: '10.00',
      paymentMethod: 'cash',
      items: [
        { productId: 'product_1', quantity: 1, unitPrice: '10.00', lineDiscount: '0', lineTotal: '10.00' },
      ],
    };

    // Enqueue sale via exposed helper (returns idempotencyKey)
    const idempotencyKey = await page.evaluate(async (payload) => {
      // @ts-ignore
      return await (window as any).enqueueTestSale(payload);
    }, salePayload);
    expect(typeof idempotencyKey).toBe('string');

    // Go back online
    await context.setOffline(false);

    // Trigger SW sync explicitly just in case
    await page.evaluate(() => {
      // @ts-ignore
      navigator.serviceWorker?.ready.then((reg) => {
        try { reg.active?.postMessage({ type: 'TRY_SYNC' }); } catch {}
        // @ts-ignore
        if ('sync' in reg) (reg as any).sync.register('background-sync').catch(()=>{});
      });
    });

    // Wait for SYNC_SALE_OK for this idempotency key
    const swMsg = await page.waitForFunction((key) => {
      // @ts-ignore
      const msgs = (window as any).__SW_MESSAGES__ || [];
      return msgs.find((m: any) => m?.type === 'SYNC_SALE_OK' && m?.data?.idempotencyKey === key) || null;
    }, idempotencyKey, { timeout: 20000 });
    expect(swMsg).toBeTruthy();

    // Verify server accepted once for that key
    const resp = await page.evaluate(async (key) => {
      try {
        const r = await fetch(`http://localhost:5000/__idemp/${encodeURIComponent(key)}`);
        return await r.json();
      } catch (e) {
        return { error: String(e) };
      }
    }, idempotencyKey);

    expect(resp && typeof resp.count === 'number').toBe(true);
    expect(resp.count).toBe(1);
  }, 60000);
});
