import { expect, test, type Page } from '@playwright/test';
import { a11yViolations } from './a11y';
import { storeURL } from '../playwright.config';

/** Store mode on the second server; every test is a fresh browser context, so a fresh bag. */
test.use({ baseURL: storeURL });

// Each test is its own "client" so the per-IP bag rate limit never leaks between tests.
test.beforeEach(async ({ context }) => {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.${octet()}.${octet()}` });
});

async function addSetM(page: Page) {
  await page.goto('/en/products/men-linen-set?colour=SAND&size=M');
  await page.getByTestId('add-to-bag').click();
  await expect(page).toHaveURL(/\/en\/bag$/);
}

test.describe('bag', () => {
  test('add to bag: line, VAT-inclusive total, VAT line and header count', async ({ page }) => {
    await addSetM(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bag');
    await expect(page.getByTestId('bag-line')).toHaveCount(1);
    await expect(page.getByTestId('bag-line')).toContainText('Men’s Linen Set');
    await expect(page.getByTestId('bag-line')).toContainText('Sand · M');
    await expect(page.getByTestId('bag-total')).toContainText('1,450.00');
    // 1,450.00 inclusive of 5% VAT -> VAT 69.05
    await expect(page.getByTestId('bag-vat')).toContainText('69.05');
    await expect(page.getByTestId('bag-link')).toHaveText('Bag (1)');
  });

  test('adding the same size again adds to the line', async ({ page }) => {
    await addSetM(page);
    await addSetM(page);
    await expect(page.getByTestId('bag-line')).toHaveCount(1);
    await expect(page.getByLabel('Quantity')).toHaveValue('2');
    await expect(page.getByTestId('bag-total')).toContainText('2,900.00');
    await expect(page.getByTestId('bag-link')).toHaveText('Bag (2)');
  });

  test('update quantity, then remove', async ({ page }) => {
    await addSetM(page);
    await page.getByLabel('Quantity').selectOption('3');
    await page.getByRole('button', { name: 'Update Men’s Linen Set' }).click();
    await expect(page.getByTestId('bag-total')).toContainText('4,350.00');
    await expect(page.getByTestId('bag-link')).toHaveText('Bag (3)');

    await page.getByRole('button', { name: 'Remove Men’s Linen Set' }).click();
    await expect(page.getByText('Your bag is empty.')).toBeVisible();
    await expect(page.getByTestId('bag-link')).toHaveText('Bag (0)');
  });

  test('two products: totals add up', async ({ page }) => {
    await addSetM(page);
    await page.goto('/en/products/linen-scarf');
    await page.getByTestId('add-to-bag').click();
    await expect(page.getByTestId('bag-line')).toHaveCount(2);
    await expect(page.getByTestId('bag-total')).toContainText('1,745.00');
  });

  test('a size must be chosen first; sold-out sizes cannot be added', async ({ page }) => {
    await page.goto('/en/products/men-linen-set?colour=SAND');
    await expect(page.getByTestId('add-to-bag')).toBeDisabled();
    await expect(page.getByTestId('add-to-bag')).toHaveText('Select a size to add to bag');
    await page.goto('/en/products/men-linen-set?colour=SAND&size=XXL');
    await expect(page.getByTestId('stock-badge')).toHaveText('Sold out');
    await expect(page.getByTestId('add-to-bag')).toHaveCount(0);
  });

  test('a tampered variant is refused with a message, not an error page', async ({ page }) => {
    await page.goto('/en/products/men-linen-set?colour=SAND&size=M');
    await page.locator('input[name="variantId"]').evaluate((el) => {
      (el as HTMLInputElement).value = 'no-such-variant';
    });
    await page.getByTestId('add-to-bag').click();
    await expect(page).toHaveURL(/bag=unavailable/);
    await expect(page.locator('#add').getByRole('alert')).toHaveText(
      'This item is no longer available.',
    );
  });

  test('the bag cookie is httpOnly and holds only an opaque token', async ({ page, context }) => {
    await addSetM(page);
    const cookie = (await context.cookies()).find((c) => c.name === 'vz_bag');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test('empty bag', async ({ page }) => {
    await page.goto('/en/bag');
    await expect(page.getByText('Your bag is empty.')).toBeVisible();
    await expect(page.getByTestId('bag-link')).toHaveText('Bag (0)');
  });

  test('Arabic bag is right-to-left with Arabic labels', async ({ page }) => {
    await page.goto('/ar/products/men-linen-set?colour=OLIVE&size=M');
    await page.getByTestId('add-to-bag').click();
    await expect(page).toHaveURL(/\/ar\/bag$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الحقيبة');
    await expect(page.getByTestId('bag-line')).toContainText('طقم كتان رجالي');
    await expect(page.getByTestId('bag-link')).toHaveText('الحقيبة (1)');
  });

  test('works without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL: storeURL,
      extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.77' },
    });
    const page = await context.newPage();
    await addSetM(page);
    await expect(page.getByTestId('bag-total')).toContainText('1,450.00');
    await page.getByLabel('Quantity').selectOption('2');
    await page.getByRole('button', { name: 'Update Men’s Linen Set' }).click();
    await expect(page.getByTestId('bag-total')).toContainText('2,900.00');
    await context.close();
  });

  test('no axe violations on a bag with items, and on an empty bag', async ({ page }) => {
    await addSetM(page);
    expect(await a11yViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Remove Men’s Linen Set' }).click();
    await expect(page.getByText('Your bag is empty.')).toBeVisible();
    expect(await a11yViolations(page)).toEqual([]);
  });
});

test.describe('waitlist mode hides the bag', () => {
  test.use({ baseURL: undefined });
  test('bag route redirects to the waitlist while the store is closed', async ({ page }) => {
    await page.goto('/en/bag');
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('#join')).toBeVisible();
  });
});
