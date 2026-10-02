import { expect, type Page } from '@playwright/test';

/** Utente demo creato dal seed del backend (`npm run db:seed`). */
export const DEMO_USER = { email: 'demo@example.com', password: 'demo-password' };

export async function login(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Email').fill(DEMO_USER.email);
  await page.getByLabel('Password').fill(DEMO_USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
}
