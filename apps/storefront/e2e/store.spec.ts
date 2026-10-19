import { expect, test } from '@playwright/test';
import { a11yViolations } from './a11y';
import { storeURL } from '../playwright.config';

/** Store mode (STOREFRONT_STORE_OPEN=true) on the second server; fixtures mirror seed.sql. */
test.use({ baseURL: storeURL });

test.describe('store mode: catalogue', () => {
  test('home shows the drop and its products instead of the waitlist', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByRole('link', { name: 'Shop Drop 01' })).toBeVisible();
    await expect(page.getByTestId('product-card')).toHaveCount(4);
    await expect(page.locator('#join')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link')).toHaveText([
      'Men',
      'Women',
      'Drop 01',
    ]);
  });

  test('men and women collections include unisex styles', async ({ page }) => {
    await page.goto('/en/collections/men');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Men');
    await expect(page.getByTestId('product-card')).toHaveText([
      /Men’s Linen Set/,
      /Linen Shirt/,
      /Linen Scarf/,
    ]);
    await page.goto('/en/collections/women');
    await expect(page.getByTestId('product-card')).toHaveText([
      /Women’s Linen Co-ord/,
      /Linen Shirt/,
      /Linen Scarf/,
    ]);
  });

  test('unknown collection and product are 404', async ({ page }) => {
    expect((await page.goto('/en/collections/kids'))?.status()).toBe(404);
    expect((await page.goto('/en/products/nope'))?.status()).toBe(404);
  });

  test('product page: price with VAT note, colour and size selection, stock badge', async ({
    page,
  }) => {
    await page.goto('/en/products/men-linen-set');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Men’s Linen Set');
    await expect(page.getByTestId('price')).toContainText('1,450.00');
    await expect(page.getByText('Price includes 5% VAT.')).toBeVisible();
    await expect(page.getByTestId('drop-units')).toHaveText('60 of 60 pieces left in Drop 01');
    await expect(page.getByTestId('stock-badge')).toHaveText('Select a size to see delivery.');

    await page.getByRole('link', { name: 'M', exact: true }).click();
    await expect(page).toHaveURL(/colour=SAND&size=M$/);
    await expect(page.getByTestId('stock-badge')).toHaveText('Ships in 2 days');

    await page.getByRole('link', { name: 'Olive' }).click();
    await expect(page).toHaveURL(/colour=OLIVE&size=M$/);
    await expect(page.getByRole('heading', { name: 'Colour: Olive' })).toBeVisible();
  });

  test('sold-out size is labelled and marked sold out', async ({ page }) => {
    await page.goto('/en/products/men-linen-set?colour=SAND');
    const xxl = page.getByRole('link', { name: 'XXL — sold out' });
    await expect(xxl).toBeVisible();
    await xxl.click();
    await expect(page.getByTestId('stock-badge')).toHaveText('Sold out');
  });

  test('pre-order variant shows its ship-by date', async ({ page }) => {
    await page.goto('/en/products/linen-shirt?colour=SAND&size=L');
    await expect(page.getByTestId('stock-badge')).toHaveText(
      'Pre-order — ships by 15 December 2026',
    );
  });

  test('one-size product needs no size choice; no size guide', async ({ page }) => {
    await page.goto('/en/products/linen-scarf');
    await expect(page.getByTestId('stock-badge')).toHaveText('Ships in 2 days');
    await expect(page.getByText('Size guide', { exact: true })).toHaveCount(0);
  });

  test('size guide and fabric/care', async ({ page }) => {
    await page.goto('/en/products/women-linen-co-ord');
    await page.getByText('Size guide', { exact: true }).click();
    await expect(page.getByRole('row', { name: /^M 100 84 74$/ })).toBeVisible();
    await expect(page.getByText('100% linen')).toBeVisible();
    await expect(page.getByText('United Arab Emirates')).toBeVisible();
  });

  test('product JSON-LD lists one offer per variant in AED', async ({ page }) => {
    await page.goto('/en/products/linen-scarf');
    const raw = await page.locator('script[type="application/ld+json"]').textContent();
    const data = JSON.parse(raw!);
    expect(data['@type']).toBe('Product');
    expect(data.offers).toHaveLength(2);
    expect(data.offers[0]).toMatchObject({ priceCurrency: 'AED', price: '295.00' });
  });

  test('Arabic product page is RTL with Arabic names and prices', async ({ page }) => {
    await page.goto('/ar/products/men-linen-set?colour=OLIVE&size=M');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('طقم كتان رجالي');
    await expect(page.getByTestId('stock-badge')).toHaveText('يُشحن خلال يومين');
    await expect(page.getByTestId('drop-units')).toHaveText(
      'تبقّى 60 من أصل 60 قطعة في الإصدار 01',
    );
    // Language toggle keeps the selected variant.
    await expect(page.getByTestId('language-toggle')).toHaveAttribute(
      'href',
      '/en/products/men-linen-set?colour=OLIVE&size=M',
    );
  });

  for (const path of [
    '/en',
    '/en/collections/men',
    '/en/products/men-linen-set?colour=SAND&size=M',
    '/ar/products/linen-shirt',
  ]) {
    test(`no axe violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      expect(await a11yViolations(page)).toEqual([]);
    });
  }
});

test.describe('waitlist mode hides the store', () => {
  test.use({ baseURL: undefined });
  test('catalogue routes redirect to the waitlist while the store is closed', async ({
    page,
    baseURL,
  }) => {
    expect(baseURL).not.toBe(storeURL);
    await page.goto('/en/products/men-linen-set');
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('#join')).toBeVisible();
    await page.goto('/en/collections/men');
    await expect(page).toHaveURL(/\/en$/);
  });
});
