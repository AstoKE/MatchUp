import { expect, test } from '@playwright/test';
import {
  createOnboardedUser,
  deleteUser,
  getLocalStack,
  PASSWORD,
  uniqueEmail,
} from './support/stack';

// Phase 8 / M4 (ADR-0028): the web has no push in the MVP. No question pops up, and Settings says where to turn it on.
const stack = getLocalStack();
test.skip(!stack && process.env.REQUIRE_STACK !== '1', 'local Supabase stack is not running');
const created: string[] = [];
test.afterAll(async () => {
  if (stack) await Promise.all(created.map((id) => deleteUser(stack, id)));
});

test('the web never asks about push and points to the phone app', async ({ page }) => {
  if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
  const email = uniqueEmail('push-web');
  created.push((await createOnboardedUser(stack, email)).id);
  await page.goto('/sign-in');
  await page.getByLabel('E-posta', { exact: true }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('tab', { name: 'Keşfet' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Bildirimler' })).toHaveCount(0);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Bildirimler', level: 2 })).toBeVisible();
  await expect(page.getByText(/Bildirimler telefondaki uygulamada çalışır/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Test bildirimi gönder' })).toHaveCount(0);
});
