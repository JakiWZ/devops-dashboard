import { expect, test } from '@playwright/test';
import { login } from './helpers.ts';

test.describe('notification settings', () => {
  test('saves the preferences and sends a test notification', async ({ page }) => {
    await login(page, '/settings/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

    await page.getByLabel('Email', { exact: true }).check();
    await page.getByLabel('Day', { exact: true }).selectOption('Friday');
    await page.getByLabel('Hour', { exact: true }).selectOption('17:00');
    await page.getByLabel('Time zone', { exact: true }).selectOption('Europe/Rome');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();

    await page.reload();
    await expect(page.getByLabel('Email', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Time zone', { exact: true })).toHaveValue('Europe/Rome');

    // Senza RESEND_API_KEY il backend registra l'email nei log invece di inviarla.
    await page.getByRole('button', { name: 'Send test notification' }).click();
    await expect(page.getByRole('status')).toHaveText('✓ Test notification sent via email.');

    // Ripristina lo stato del seed per gli altri test.
    await page.getByLabel('Email', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();
  });

  test('connects Telegram through the bot link', async ({ page }) => {
    // Il bot vero richiede un token di @BotFather: simuliamo il backend con Telegram configurato.
    let connected = false;
    const settings = () => ({
      preferences: {
        emailEnabled: false,
        telegramEnabled: connected,
        weeklyReport: true,
        ciFailureAlerts: true,
        stalledPrAlerts: true,
        weeklyDay: 1,
        weeklyHour: 8,
        timezone: 'UTC',
      },
      email: { address: 'demo@example.com', configured: false },
      telegram: { configured: true, connected },
    });
    await page.route('**/api/notifications', (route) => route.fulfill({ json: settings() }));
    await page.route('**/api/notifications/telegram/link', (route) =>
      route.fulfill({
        status: 201,
        json: { url: 'https://t.me/devops_bot?start=abc', expiresAt: new Date().toISOString() },
      }),
    );

    await login(page, '/settings/notifications');
    await page.getByRole('button', { name: 'Connect Telegram' }).click();
    await expect(page.getByRole('link', { name: 'Open the bot in Telegram' })).toHaveAttribute(
      'href',
      'https://t.me/devops_bot?start=abc',
    );

    // L'utente preme Start sul bot: al prossimo aggiornamento la pagina lo vede collegato.
    connected = true;
    await expect(page.getByLabel('Telegram', { exact: true })).toBeChecked({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Disconnect Telegram' })).toBeVisible();
  });
});
