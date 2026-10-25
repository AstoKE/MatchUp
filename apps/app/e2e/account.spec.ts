import { readFile } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createOnboardedUser,
  deleteUser,
  getLocalStack,
  PASSWORD,
  uniqueEmail,
  type LocalStack,
} from './support/stack';

// Needs the LOCAL Supabase stack; CI sets REQUIRE_STACK=1 so a missing stack fails instead of skipping.
const stack: LocalStack | null = getLocalStack();
test.skip(!stack && process.env.REQUIRE_STACK !== '1', 'local Supabase stack is not running');

const createdIds: string[] = [];
test.afterAll(async () => {
  if (stack) await Promise.all(createdIds.map((id) => deleteUser(stack, id)));
});

function requireStack(): LocalStack {
  if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
  return stack;
}

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('E-posta', { exact: true }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('tab', { name: 'Keşfet' })).toBeVisible();
}

async function expectNoBlocking(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`)).toEqual([]);
}

test.describe('account data rights (export, deletion with grace period)', () => {
  test('download my data: a JSON file with exactly my account', async ({ page }) => {
    const s = requireStack();
    const email = uniqueEmail('export');
    const user = await createOnboardedUser(s, email, { displayName: 'Dışa Aktaran' });
    createdIds.push(user.id);
    await signIn(page, email);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Hesap', level: 2 })).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Verilerimi indir' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/-data-\d{4}-\d{2}-\d{2}\.json$/);
    const doc = JSON.parse(await readFile((await file.path())!, 'utf8')) as {
      account: { user_id: string; email: string };
      profile: { display_name: string };
    };
    expect(doc.account).toMatchObject({ user_id: user.id, email });
    expect(doc.profile.display_name).toBe('Dışa Aktaran');
    await expect(page.getByText('Verilerin hazır.')).toBeVisible();

    await page.getByRole('button', { name: 'Verilerimi indir' }).click();
    await expect(page.getByText(/son 24 saat içinde zaten indirdin/)).toBeVisible();
  });

  test('request deletion with the password, get locked to the pending screen, then cancel', async ({
    page,
  }) => {
    const s = requireStack();
    const email = uniqueEmail('delete');
    const user = await createOnboardedUser(s, email, { displayName: 'Silen Kişi' });
    createdIds.push(user.id);
    await signIn(page, email);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Hesabımı sil' }).click();
    await expect(page.getByRole('heading', { name: 'Hesabını sil', level: 1 })).toBeVisible();
    await expectNoBlocking(page);

    await page.getByRole('button', { name: 'Hesabımı silmeyi talep et' }).click();
    await expect(page.getByText('Şifreni gir.')).toBeVisible();
    await page.getByLabel('Şifren', { exact: true }).fill('not-my-password');
    await page.getByRole('button', { name: 'Hesabımı silmeyi talep et' }).click();
    await expect(page.getByText('E-posta veya şifre hatalı.')).toBeVisible();

    await page.getByLabel('Şifren', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Hesabımı silmeyi talep et' }).click();
    await expect(page).toHaveURL(/\/account-deletion$/);
    await expect(page.getByRole('heading', { name: 'Hesabın silinecek', level: 1 })).toBeVisible();
    await expect(page.getByText(/tarihinde kalıcı olarak silinecek/)).toBeVisible();
    await expectNoBlocking(page);

    // Every account screen now leads here (this screen has no tab bar: nothing else to do meanwhile).
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/account-deletion$/);

    await page.getByRole('button', { name: 'Silme talebini iptal et' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'Silen Kişi', level: 1 })).toBeVisible();
  });
});
