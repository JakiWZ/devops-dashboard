import { expect, test } from '@playwright/test';
import { login } from './helpers.ts';

test.describe('report generation', () => {
  test('generates a report and opens it', async ({ page }) => {
    // La generazione vera chiama Claude e richiede ANTHROPIC_API_KEY: intercettiamo solo la POST
    // e rispondiamo con un report esistente del seed, letto dal backend vero con la stessa sessione.
    await page.route('**/api/reports', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const { repositoryId } = route.request().postDataJSON() as { repositoryId: string };
      const api = (path: string) => new URL(path, route.request().url()).toString();
      const list = await route.fetch({
        url: api(`/api/reports?repositoryId=${repositoryId}&limit=1`),
        method: 'GET',
        postData: undefined,
      });
      const { reports } = (await list.json()) as { reports: Array<{ id: string }> };
      const detail = await route.fetch({
        url: api(`/api/reports/${reports[0]?.id}`),
        method: 'GET',
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ status: 201, json: await detail.json() });
    });

    await login(page, '/reports');
    // Il filtro dello storico si chiama anch'esso "Repository" ed è nel DOM prima che i
    // repository arrivino: si cerca il selettore dentro la card "New report".
    await page
      .locator('section', { has: page.getByRole('heading', { name: 'New report' }) })
      .getByLabel('Repository')
      .selectOption({ label: 'acme/infra' });
    await page.getByRole('button', { name: 'Generate report' }).click();
    await expect(page.getByRole('button', { name: 'Generating report…' })).toBeDisabled();
    await expect(page).toHaveURL(/\/reports\/[^/]+$/);
    await expect(page.getByRole('heading', { name: 'Weekly report: acme/infra' })).toBeVisible();
  });

  test('shows the server error when generation fails', async ({ page }) => {
    await page.route('**/api/reports', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 503,
            json: {
              error: {
                code: 'AI_NOT_CONFIGURED',
                message: 'AI report generation is not configured',
              },
            },
          })
        : route.fallback(),
    );
    await login(page, '/reports');
    await page.getByRole('button', { name: 'Generate report' }).click();
    await expect(page.getByRole('alert')).toHaveText('AI report generation is not configured');
  });

  test('exports a report as Markdown', async ({ page }) => {
    await login(page, '/reports');
    await page.getByRole('main').getByRole('listitem').first().getByRole('link').click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Markdown' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.md$/);
  });
});
