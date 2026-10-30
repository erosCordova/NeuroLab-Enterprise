import {test, expect} from '@playwright/test';

test('Despliegue: el bundle conectado y la API se sirven desde el mismo origen', async ({page, request}) => {
  const health = await request.get('/api/v1/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({status: 'ok', database: 'postgresql', training: 'browser-tensorflowjs (not server)'});
  const home = await request.get('/');
  const csp = home.headers()['content-security-policy-report-only'];
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'Iniciar sesión', exact: true})).toBeVisible();
  const script = page.locator('script[type="module"][src]').first();
  const scriptURL = new URL(await script.getAttribute('src'), page.url());
  expect(scriptURL.origin).toBe(new URL(page.url()).origin);
  expect((await request.get(scriptURL.href)).ok()).toBe(true);
  expect((await request.get('/.env')).status()).toBe(404);
  expect((await request.get('/api/v1/no-existe')).status()).toBe(404);
});
