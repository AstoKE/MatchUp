import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  createOnboardedUser,
  deleteUser,
  getLocalStack,
  PASSWORD,
  uniqueEmail,
} from './support/stack';

// Phase 8 (ADR-0029): the phone is verified through Supabase Auth's own phone change. The local stack texts nothing: it
// has fixed codes for +90 555 000 00 01–80 (supabase/config.toml); this file uses 40–59, the integration tests 10–19.
const stack = getLocalStack();
test.skip(!stack && process.env.REQUIRE_STACK !== '1', 'local Supabase stack is not running');
const created: string[] = [];
test.afterAll(async () => {
  if (stack) await Promise.all(created.map((id) => deleteUser(stack, id)));
});

test('a person verifies their phone from Settings with the texted code', async ({ page }) => {
  if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
  const email = uniqueEmail('phone');
  created.push((await createOnboardedUser(stack, email)).id);
  await page.goto('/sign-in');
  await page.getByLabel('E-posta', { exact: true }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('tab', { name: 'Keşfet' })).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByText('Telefonun henüz doğrulanmadı.')).toBeVisible();
  await page.getByRole('button', { name: 'Telefonu doğrula' }).click();
  await expect(page.getByRole('heading', { name: 'Telefonunu doğrula', level: 1 })).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
    [],
  );

  // A landline is refused before anything is sent.
  await page.getByLabel('Cep telefonu', { exact: true }).fill('0312 123 45 67');
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  await expect(page.getByText(/Geçerli bir Türkiye cep numarası gir/)).toBeVisible();

  const n = String(40 + Math.floor(Math.random() * 20));
  await page.getByLabel('Cep telefonu', { exact: true }).fill(`0555 000 00 ${n}`);
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  await expect(
    page.getByText(`+90 555 *** ** ${n} numarasına 6 haneli bir kod gönderdik.`),
  ).toBeVisible();
  await page.getByLabel('Doğrulama kodu', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Doğrula' }).click();
  await expect(page.getByText(/Kod hatalı ya da süresi dolmuş/)).toBeVisible();
  await page.getByLabel('Doğrulama kodu', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Doğrula' }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText(`Doğrulandı: +90 555 *** ** ${n}`)).toBeVisible();
});
