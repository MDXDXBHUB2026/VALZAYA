import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const scan = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations.map((v) => `${v.id}: ${v.help}`);

/**
 * WCAG 2.1 A/AA violations on a settled page. Next.js can drop <title> for a moment while a
 * server action re-renders, so a scan can land mid-update; re-scan for up to 5s and return the
 * last result. A violation that persists is still reported.
 */
export async function a11yViolations(page: Page): Promise<string[]> {
  await expect(page).toHaveTitle(/\S/);
  let violations: string[] = [];
  await expect
    .poll(async () => (violations = await scan(page)), { timeout: 5_000, intervals: [250] })
    .toEqual([])
    .catch(() => undefined);
  return violations;
}
