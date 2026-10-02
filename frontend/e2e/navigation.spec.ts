import { expect, test } from '@playwright/test';
import { login } from './helpers.ts';

test.describe('dashboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('shows KPIs and charts on the overview and applies filters', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    for (const label of ['Open issues', 'PRs merged', 'CI pass rate']) {
      await expect(page.getByRole('term').filter({ hasText: label })).toBeVisible();
    }
    for (const title of ['Issues', 'Pull requests', 'CI pass rate']) {
      await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible();
    }
    await expect(page.locator('.recharts-surface').first()).toBeVisible();

    await page.getByRole('button', { name: '7d' }).click();
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByLabel('Repository').selectOption({ label: 'acme/web-app' });
    await expect(page).toHaveURL(/repo=/);
    await expect(page.getByRole('heading', { name: 'Latest reports' })).toBeVisible();
  });

  test('goes from the repository list to a repository and its reports', async ({ page }) => {
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Repositories' })
      .click();
    await expect(page.getByRole('heading', { name: 'Repositories', level: 1 })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(4);

    await page.getByLabel('Status').selectOption('FAILED');
    await expect(page.getByText('No repositories with this status')).toBeVisible();
    await page.getByLabel('Status').selectOption('');

    await page.getByRole('link', { name: 'acme/api-gateway' }).click();
    await expect(page.getByRole('heading', { name: 'acme/api-gateway' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sync now' })).toBeVisible();
    await expect(page.locator('.recharts-surface').first()).toBeVisible();

    await page.getByRole('link', { name: 'Reports for this repository' }).click();
    await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible();
    const items = page.getByRole('main').getByRole('listitem');
    await expect(items.first()).toContainText('acme/api-gateway');

    await items.first().getByRole('link').click();
    await expect(
      page.getByRole('heading', { name: /Weekly report: acme\/api-gateway/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export Markdown' })).toBeVisible();
  });

  test('switches to dark mode', async ({ page }) => {
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});
