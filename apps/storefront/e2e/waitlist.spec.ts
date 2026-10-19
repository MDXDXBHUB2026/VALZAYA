import { expect, test, type Page } from '@playwright/test';
import { a11yViolations } from './a11y';

let seq = 0;
const unique = () =>
  `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Each test is its own "client" so per-IP rate limits never leak between tests. */
const randomIp = () =>
  `198.51.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() });
});

async function fill(
  page: Page,
  opts: { email?: string; phone?: string; emailConsent?: boolean; waConsent?: boolean },
) {
  if (opts.email !== undefined) await page.getByLabel('Email', { exact: true }).fill(opts.email);
  if (opts.phone !== undefined) await page.getByLabel('WhatsApp number').fill(opts.phone);
  if (opts.emailConsent) await page.getByLabel(/Email me about Valzaya drops/).check();
  if (opts.waConsent) await page.getByLabel(/Message me on WhatsApp/).check();
}

const submit = (page: Page) =>
  page.locator('#join').getByRole('button', { name: 'Join the waitlist' }).click();

test.describe('waitlist sign-up (English)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en');
  });

  test('email only: joins, shows queue position and a personal referral link', async ({ page }) => {
    await fill(page, { email: `e-${unique()}@example.com`, emailConsent: true });
    await submit(page);
    await expect(page.getByRole('heading', { name: 'You’re on the list.' })).toBeFocused();
    await expect(page.getByTestId('queue-position')).toHaveText(
      /You are #\d+ on the waitlist for Drop 01\./,
    );
    await expect(page.getByTestId('referral-url')).toHaveValue(/\/en\?ref=[0-9A-F]{10}$/);
    await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/\?text=/,
    );
  });

  test('WhatsApp only, UAE national format', async ({ page }) => {
    const local = `05${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    await fill(page, { phone: local, waConsent: true });
    await submit(page);
    await expect(page.getByTestId('queue-position')).toBeVisible();
  });

  test('email and WhatsApp together', async ({ page }) => {
    await fill(page, {
      email: `both-${unique()}@example.com`,
      phone: `+44 7700 ${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
      emailConsent: true,
      waConsent: true,
    });
    await submit(page);
    await expect(page.getByTestId('queue-position')).toBeVisible();
  });

  test('requires a contact', async ({ page }) => {
    await submit(page);
    await expect(page.locator('#join').getByRole('alert')).toContainText(
      'Enter an email address or a WhatsApp number.',
    );
  });

  test('requires explicit consent per channel and keeps what was typed', async ({ page }) => {
    const email = `noconsent-${unique()}@example.com`;
    await fill(page, { email, phone: '0501234567' });
    await submit(page);
    const alert = page.locator('#join').getByRole('alert');
    await expect(alert).toContainText('Tick the box so we may email you.');
    await expect(alert).toContainText('Tick the box so we may message you on WhatsApp.');
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
    await expect(page.getByLabel('WhatsApp number')).toHaveValue('0501234567');
    await expect(page.getByLabel(/Email me about Valzaya drops/)).not.toBeChecked();
  });

  test('consent boxes start unticked', async ({ page }) => {
    await expect(page.getByLabel(/Email me about Valzaya drops/)).not.toBeChecked();
    await expect(page.getByLabel(/Message me on WhatsApp/)).not.toBeChecked();
  });

  test('rejects an invalid email and phone', async ({ page }) => {
    await fill(page, { email: 'not-an-email', phone: '12', emailConsent: true, waConsent: true });
    await submit(page);
    await expect(page.locator('#join').getByRole('alert')).toContainText(
      'Enter a valid email address.',
    );
    await expect(page.locator('#join').getByRole('alert')).toContainText('Enter a valid number');
    await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  });

  test('repeat sign-up gets the generic reply, without position or link', async ({ page }) => {
    const email = `dup-${unique()}@example.com`;
    await fill(page, { email, emailConsent: true });
    await submit(page);
    await expect(page.getByTestId('queue-position')).toBeVisible();

    await page.goto('/en');
    await fill(page, { email: email.toUpperCase(), emailConsent: true });
    await submit(page);
    await expect(
      page.getByRole('heading', { name: 'Thank you — you’re on the list.' }),
    ).toBeVisible();
    await expect(page.getByTestId('queue-position')).toHaveCount(0);
    await expect(page.getByTestId('referral-url')).toHaveCount(0);
  });

  test('honeypot: bots get the generic reply and nothing is stored', async ({ page }) => {
    const email = `bot-${unique()}@example.com`;
    await fill(page, { email, emailConsent: true });
    await page.locator('input[name="website"]').fill('https://spam.example', { force: true });
    await submit(page);
    await expect(
      page.getByRole('heading', { name: 'Thank you — you’re on the list.' }),
    ).toBeVisible();

    // Nothing was stored: the same email can still join for real.
    await page.goto('/en');
    await fill(page, { email, emailConsent: true });
    await submit(page);
    await expect(page.getByTestId('queue-position')).toBeVisible();
  });

  test('rate limit: the 6th sign-up from one IP within 10 minutes is refused', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.goto('/en');
      await fill(page, { email: `rl-${i}-${unique()}@example.com`, emailConsent: true });
      await submit(page);
      await expect(page.getByTestId('queue-position')).toBeVisible();
    }
    await page.goto('/en');
    await fill(page, { email: `rl-6-${unique()}@example.com`, emailConsent: true });
    await submit(page);
    await expect(page.locator('#join').getByRole('alert')).toContainText('Too many attempts.');
  });

  test('referral link carries the code into the next sign-up', async ({ page }) => {
    await fill(page, { email: `ref-${unique()}@example.com`, emailConsent: true });
    await submit(page);
    const url = await page.getByTestId('referral-url').inputValue();
    const code = new URL(url).searchParams.get('ref');
    expect(code).toMatch(/^[0-9A-F]{10}$/);

    await page.goto(`/en?ref=${code}`);
    await expect(page.locator('input[name="ref"]')).toHaveValue(code!);
    await fill(page, { email: `friend-${unique()}@example.com`, emailConsent: true });
    await submit(page);
    await expect(page.getByTestId('queue-position')).toBeVisible();
  });

  test('a malformed ref is ignored', async ({ page }) => {
    await page.goto('/en?ref=<script>');
    await expect(page.locator('input[name="ref"]')).toHaveCount(0);
  });

  test('countdown and privacy link render', async ({ page }) => {
    await expect(page.getByTestId('countdown')).toBeVisible();
    await expect(page.locator('time')).toHaveAttribute('datetime', /2026-11-19/);
    await page.getByRole('link', { name: 'Privacy notice' }).first().click();
    await expect(page).toHaveURL(/\/en\/privacy$/);
    await expect(page.getByText('PENDING LEGAL REVIEW')).toBeVisible();
  });
});

test.describe('language and RTL', () => {
  test('Arabic page is right-to-left with Arabic copy', async ({ page }) => {
    await page.goto('/ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('كتان يُصنع على مهل.');
    // Phone and email stay left-to-right inside the RTL layout.
    await expect(page.getByLabel('رقم واتساب')).toHaveAttribute('dir', 'ltr');
  });

  test('Arabic sign-up works end to end', async ({ page }) => {
    await page.goto('/ar');
    await page.getByLabel('البريد الإلكتروني').fill(`ar-${unique()}@example.com`);
    await page.getByLabel(/أوافق على تلقي رسائل بريد إلكتروني/).check();
    await page.locator('#join').getByRole('button', { name: 'انضم إلى قائمة الانتظار' }).click();
    await expect(page.getByTestId('queue-position')).toContainText('ترتيبك رقم');
    await expect(page.getByTestId('referral-url')).toHaveValue(/\/ar\?ref=[0-9A-F]{10}$/);
  });

  test('toggle switches language, keeps ?ref, and the choice persists', async ({ page }) => {
    await page.goto('/en?ref=ABCDEF0123');
    await page.getByTestId('language-toggle').click();
    await expect(page).toHaveURL(/\/ar\?ref=ABCDEF0123$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.goto('/');
    await expect(page).toHaveURL(/\/ar$/);
  });

  test('first visit follows Accept-Language', async ({ browser }) => {
    const context = await browser.newContext({
      locale: 'ar-AE',
      extraHTTPHeaders: { 'accept-language': 'ar-AE,ar;q=0.9' },
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/ar$/);
    await context.close();
  });
});

test.describe('accessibility (axe, WCAG 2.1 A/AA)', () => {
  for (const path of ['/en', '/ar', '/en/privacy']) {
    test(`no violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      expect(await a11yViolations(page)).toEqual([]);
    });
  }

  test('no violations with validation errors showing', async ({ page }) => {
    await page.goto('/en');
    await submit(page);
    await expect(page.locator('#join').getByRole('alert')).toBeVisible();
    expect(await a11yViolations(page)).toEqual([]);
  });
});
