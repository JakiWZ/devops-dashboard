import { expect, test } from '@playwright/test';
import { DEMO_USER, login } from './helpers.ts';

test.describe('login flow', () => {
  test('redirects anonymous users to the login page and back after signing in', async ({
    page,
  }) => {
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/login\?from=%2Freports/);
    await page.getByLabel('Email').fill(DEMO_USER.email);
    await page.getByLabel('Password').fill(DEMO_USER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible();
  });

  test('shows an error for wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(DEMO_USER.email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
    await expect(page).toHaveURL(/\/login/);
  });

  test('keeps the session across a reload and ends it on logout', async ({ page }) => {
    await login(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText(DEMO_USER.email)).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('registers a new account', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.com`);
    await page.getByLabel('Password').fill('a-long-password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('No repositories tracked yet')).toBeVisible();
  });
});

test.describe('password reset', () => {
  test('requests a reset link without revealing whether the account exists', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel('Email').fill(DEMO_USER.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If an account exists');
  });

  test('rejects an invalid link and offers a new one', async ({ page }) => {
    await page.goto('/reset-password?token=not-a-real-token');
    await page.getByLabel('New password').fill('a-long-password');
    await page.getByLabel('Confirm password').fill('a-long-password');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid or expired reset token');
    await page.getByRole('link', { name: 'Request a new link' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });
});
