import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers.ts';

const MODELS = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    reasoning: false,
    contextWindow: 128000,
    cost: { input: 0.28, output: 0.42 },
    releaseDate: '2025-12-01',
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    reasoning: true,
    contextWindow: 128000,
    cost: { input: 0.28, output: 0.42 },
    releaseDate: '2025-12-01',
  },
];

const NO_CREDENTIAL = { credential: null, serverDefault: null, canStoreKeys: true };

/**
 * Il catalogo dei provider arriva dal backend vero (models.dev o snapshot). Le chiamate che
 * contatterebbero il provider o salverebbero una chiave sono intercettate: nessuna chiave reale.
 */
async function mockAi(page: Page, validKey: string) {
  let saved: unknown = null;
  await page.route('**/api/ai/settings', (route) =>
    route.fulfill({ json: saved ?? NO_CREDENTIAL }),
  );
  await page.route('**/api/ai/verify', (route) => {
    const { apiKey } = route.request().postDataJSON() as { apiKey: string };
    return apiKey === validKey
      ? route.fulfill({ json: { valid: true, models: MODELS } })
      : route.fulfill({
          status: 400,
          json: {
            error: { code: 'AI_KEY_INVALID', message: 'The provider rejected this API key' },
          },
        });
  });
  await page.route('**/api/ai/credential', (route) => {
    const body = route.request().postDataJSON() as {
      provider: string;
      model: string;
      apiKey: string;
    };
    saved = {
      ...NO_CREDENTIAL,
      credential: {
        provider: body.provider,
        providerName: 'DeepSeek',
        model: body.model,
        keyLast4: body.apiKey.slice(-4),
        updatedAt: new Date().toISOString(),
      },
    };
    return route.fulfill({ json: saved });
  });
  await page.route('**/api/ai/providers/*/models', (route) =>
    route.fulfill({ json: { models: MODELS } }),
  );
}

test.describe('AI settings', () => {
  test('wrong key can be retried, then a valid key unlocks the models', async ({ page }) => {
    await mockAi(page, 'sk-good-1234');
    await login(page, '/settings/ai');

    await page.getByRole('button', { name: 'Use my own API key' }).click();
    await page.getByLabel('Search providers').fill('deepseek');
    await page
      .getByRole('button', { name: /^DeepSeek/ })
      .first()
      .click();

    const key = page.getByLabel('API key');
    await key.fill('sk-wrong');
    await page.getByRole('button', { name: 'Verify key' }).click();
    await expect(page.getByRole('alert')).toContainText('The provider rejected this API key');
    await expect(key).toHaveValue('');

    await key.fill('sk-good-1234');
    await page.getByRole('button', { name: 'Verify key' }).click();
    await expect(page.getByRole('status')).toContainText('Key accepted');
    await page.getByLabel('Model').selectOption('deepseek-reasoner');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('••••1234')).toBeVisible();
    await expect(page.getByLabel('Model')).toHaveValue('deepseek-reasoner');
  });

  test('back returns to the provider list after a rejected key', async ({ page }) => {
    await mockAi(page, 'sk-good-1234');
    await login(page, '/settings/ai');

    await page.getByRole('button', { name: 'Use my own API key' }).click();
    await page.getByLabel('Search providers').fill('deepseek');
    await page
      .getByRole('button', { name: /^DeepSeek/ })
      .first()
      .click();
    await page.getByLabel('API key').fill('sk-wrong');
    await page.getByRole('button', { name: 'Verify key' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByLabel('Search providers')).toBeVisible();
  });
});
