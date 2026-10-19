import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * WCAG 2.1 A/AA scan of a settled page. Next streams metadata and re-resolves it after a server
 * action, so the <title> can be absent for a moment; wait for it before scanning so axe judges
 * the page users actually see (seen once on CI: a transient document-title violation).
 */
export async function a11yViolations(page: Page): Promise<string[]> {
  await expect(page).toHaveTitle(/\S/);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.help}`);
}
