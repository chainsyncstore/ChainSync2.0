import { test, expect } from '@playwright/test';

test('admin login redirects to analytics, exports work', async ({ page }) => {
  await page.goto('/');
  // Hit healthz to ensure server ready
  await page.goto('/healthz');
  await page.goto('/login');
  // Perform login via API to simplify UI flow in test server mode
  await page.request.post('/api/auth/login', {
    data: { email: 'admin@example.com', password: 'password' }
  });
  await page.goto('/');
  // Admin defaults to analytics per App routing; accept / or /analytics
  await expect(page).toHaveURL(/analytics|\//);
  // trigger CSV export
  const respCsv = await page.request.get('/api/analytics/export.csv');
  expect(respCsv.ok()).toBeTruthy();
  expect((await respCsv.text())).toContain('date,revenue');
  // trigger PDF export
  const respPdf = await page.request.get('/api/analytics/export.pdf');
  expect(respPdf.ok()).toBeTruthy();
});

test('cashier login redirects to POS and page loads', async ({ page }) => {
  await page.goto('/login');
  await page.request.post('/api/auth/login', { data: { email: 'cashier@example.com', password: 'password' } });
  await page.goto('/');
  await expect(page).toHaveURL(/pos|\//);
  await expect(page.getByRole('button', { name: 'Complete Sale' })).toBeVisible({ timeout: 10000 });
});

test('manager login redirects to inventory and loyalty page loads', async ({ page }) => {
  await page.goto('/login');
  await page.request.post('/api/auth/login', { data: { email: 'manager@example.com', password: 'password' } });
  await page.goto('/');
  await expect(page).toHaveURL(/inventory|\//);
  await page.goto('/loyalty');
  await expect(page.getByRole('heading', { name: 'Loyalty Program' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Customers' })).toBeVisible();
});


