import { mockEventBody, MOCK_SIGNATURE_HEADER, signMockEvent } from '@valzaya/core';
import { expect, test, type Page } from '@playwright/test';
import { a11yViolations } from './a11y';
import { storeURL } from '../playwright.config';

/** Store mode, in-memory data: bag -> checkout -> mock hosted payment -> order page. */
test.use({ baseURL: storeURL });

// The in-memory backend's non-secret signing key (STOREFRONT_DATA=memory only).
const MEMORY_SECRET = 'memory-checkout-secret-not-secret';

test.beforeEach(async ({ context }) => {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.18.${octet()}.${octet()}` });
});

async function bagWithSet(page: Page, locale: 'en' | 'ar' = 'en') {
  await page.goto(`/${locale}/products/men-linen-set?colour=SAND&size=M`);
  await page.getByTestId('add-to-bag').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/bag$`));
}

async function fillCheckout(page: Page) {
  await page.getByLabel('Email').fill('test@valzaya.test');
  await page.getByLabel('Mobile number').fill('050 123 4567');
  await page.getByLabel('Full name').fill('Test Buyer');
  await page.getByLabel('Building, street').fill('Villa 1, Street 2');
  await page.getByLabel('City').fill('Dubai');
  await page.getByLabel('Emirate').selectOption('dubai');
}

test.describe('checkout', () => {
  test('pay: bag -> checkout -> mock payment -> confirmed order', async ({ page }) => {
    await bagWithSet(page);
    await page.getByTestId('checkout-link').click();
    await expect(page).toHaveURL(/\/en\/checkout$/);
    await expect(page.getByTestId('checkout-total')).toContainText('1,450.00');

    await fillCheckout(page);
    await page.getByLabel('Express delivery').check();
    await expect(page.getByTestId('checkout-total')).toContainText('1,485.00');
    await page.getByTestId('place-order').click();

    await expect(page).toHaveURL(/\/en\/checkout\/mock-pay\/mock_[0-9a-f]{24}\?/);
    await expect(page.getByRole('note')).toContainText('TEST MODE');
    await expect(page.getByTestId('mock-amount')).toContainText('1,485.00');
    await page.getByRole('button', { name: 'Pay (test)' }).click();

    await expect(page).toHaveURL(/\/en\/order\/VZ-\d{6}\?k=[0-9a-f]{32}$/);
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'paid');
    await expect(page.getByTestId('order-status')).toHaveText(
      'Thank you — your order is confirmed.',
    );
    await expect(page.getByTestId('order-total')).toContainText('1,485.00');
    await expect(page.getByTestId('order-line')).toContainText('Men’s Linen Set');

    // The bag was closed by the order; adding again starts a new bag.
    await page.goto('/en/bag');
    await expect(page.getByText('Your bag is empty.')).toBeVisible();
  });

  test('decline: the order is cancelled and nothing is charged', async ({ page }) => {
    await bagWithSet(page);
    await page.goto('/en/checkout');
    await fillCheckout(page);
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('mock-amount')).toContainText('1,450.00');
    await page.getByRole('button', { name: 'Decline (test)' }).click();
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'cancelled');
  });

  test('validation: every missing field is flagged and typed values are kept', async ({ page }) => {
    await bagWithSet(page);
    await page.goto('/en/checkout');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByTestId('place-order').click();
    await expect(page.locator('form').getByRole('alert')).toHaveText(
      'Please check the highlighted fields.',
    );
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Email')).toHaveValue('not-an-email');
    await expect(page.getByText('Enter a valid mobile number.')).toBeVisible();
    await expect(page.getByText('Choose an emirate.')).toBeVisible();
    await expect(page).toHaveURL(/\/en\/checkout$/);
  });

  test('an empty bag cannot check out', async ({ page }) => {
    await page.goto('/en/checkout');
    await expect(page).toHaveURL(/\/en\/bag$/);
  });

  test('order pages need the signed link', async ({ page }) => {
    await bagWithSet(page);
    await page.goto('/en/checkout');
    await fillCheckout(page);
    await page.getByTestId('place-order').click();
    await page.getByRole('button', { name: 'Pay (test)' }).click();
    await expect(page).toHaveURL(/\/en\/order\/VZ-\d{6}\?k=/);
    const url = new URL(page.url());
    expect((await page.goto(url.pathname))?.status()).toBe(404);
    expect((await page.goto(`${url.pathname}?k=${'0'.repeat(32)}`))?.status()).toBe(404);
  });

  test('Arabic checkout is right-to-left and places the order', async ({ page }) => {
    await bagWithSet(page, 'ar');
    await page.goto('/ar/checkout');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('إتمام الشراء');
    await page.getByLabel('البريد الإلكتروني').fill('ar@valzaya.test');
    await page.getByLabel('رقم الهاتف المتحرك').fill('0501234567');
    await page.getByLabel('الاسم الكامل').fill('مشتري تجريبي');
    await page.getByLabel('المبنى، الشارع').fill('فيلا 1');
    await page.getByLabel('المدينة').fill('دبي');
    await page.getByLabel('الإمارة').selectOption('dubai');
    await page.getByTestId('place-order').click();
    await page.getByRole('button', { name: 'ادفع (تجريبي)' }).click();
    await expect(page).toHaveURL(/\/ar\/order\//);
    await expect(page.getByTestId('order-status')).toHaveText('شكرًا لك — تم تأكيد طلبك.');
  });

  test('works without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      // Without JS, smooth scrolling never settles for Playwright's click; the CSS turns it off here.
      reducedMotion: 'reduce',
      baseURL: storeURL,
      extraHTTPHeaders: { 'x-forwarded-for': '198.18.250.77' },
    });
    const page = await context.newPage();
    await bagWithSet(page);
    await page.goto('/en/checkout');
    await fillCheckout(page);
    await page.getByTestId('place-order').click();
    await page.getByRole('button', { name: 'Pay (test)' }).click();
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'paid');
    await context.close();
  });

  test('no axe violations: checkout with errors, mock payment page, order page', async ({
    page,
  }) => {
    await bagWithSet(page);
    await page.goto('/en/checkout');
    expect(await a11yViolations(page)).toEqual([]);
    await page.getByTestId('place-order').click();
    await expect(page.locator('form').getByRole('alert')).toBeVisible();
    expect(await a11yViolations(page)).toEqual([]);
    await fillCheckout(page);
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('mock-amount')).toBeVisible();
    expect(await a11yViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Pay (test)' }).click();
    await expect(page.getByTestId('order-status')).toBeVisible();
    expect(await a11yViolations(page)).toEqual([]);
  });
});

test.describe('payment webhook', () => {
  test('unsigned events are rejected; signed ones are processed once', async ({ request }) => {
    const body = mockEventBody(`mock_${'a'.repeat(24)}`, 'captured');
    const unsigned = await request.post('/api/webhooks/payments/mock', { data: body });
    expect(unsigned.status()).toBe(401);

    const signature = await signMockEvent(MEMORY_SECRET, body);
    const send = () =>
      request.post('/api/webhooks/payments/mock', {
        data: body,
        headers: { [MOCK_SIGNATURE_HEADER]: signature, 'content-type': 'application/json' },
      });
    const first = await send();
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ result: 'unknown_payment' });
    expect(await (await send()).json()).toEqual({ result: 'duplicate' });
  });
});
