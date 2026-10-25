import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createOnboardedUser,
  createVerifiedUser,
  deleteUser,
  getLocalStack,
  PASSWORD,
  uniqueEmail,
  waitForAuthLink,
  type LocalStack,
} from './support/stack';

// These tests need the LOCAL Supabase stack (pnpm db:start). Locally they skip when it is down;
// CI sets REQUIRE_STACK=1 so a missing stack is a failure, never a silent pass.
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

async function fillCredentials(page: Page, email: string, password: string) {
  await page.getByLabel('E-posta', { exact: true }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(password);
}

/** Walks the three onboarding steps in the UI with valid input (Turkish UI, football at the default level). */
async function completeOnboarding(page: Page, displayName: string) {
  await page.getByRole('checkbox', { name: '18 yaşından büyük olduğumu onaylıyorum.' }).click();
  await page
    .getByRole('checkbox', {
      name: "Kullanım Koşulları'nı ve Gizlilik Bildirimi'ni okudum, kabul ediyorum.",
    })
    .click();
  await page.getByRole('button', { name: 'İleri' }).click();
  await page.getByLabel('Görünen ad', { exact: true }).fill(displayName);
  await page.getByRole('button', { name: 'İleri' }).click();
  await page.getByRole('checkbox', { name: 'Futbol', exact: true }).click();
  await page.getByRole('button', { name: 'Bitir' }).click();
}

test.describe('registration and email verification', () => {
  test('sign up → verify via emailed link → signed in → sign out → sign in again', async ({
    page,
  }) => {
    const s = requireStack();
    const email = uniqueEmail('e2e');

    await page.goto('/sign-up');
    await fillCredentials(page, email, PASSWORD);
    await page.getByRole('button', { name: 'Kayıt ol' }).click();

    await expect(page).toHaveURL(/\/verify-email$/);
    await expect(
      page.getByRole('heading', { name: 'E-postanı kontrol et', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(email)).toBeVisible(); // shown from memory, never from the URL
    expect(page.url()).not.toContain(encodeURIComponent(email));

    // Unverified: signing in is refused by the server.
    await page.goto('/sign-in');
    await fillCredentials(page, email, PASSWORD);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page.getByRole('alert')).toContainText('E-posta adresini henüz doğrulamadın');

    // Open the verification link in the SAME browser context (PKCE verifier lives there).
    const link = await waitForAuthLink(s, email);
    await page.goto(link);
    await expect(page).toHaveURL(/localhost:4173\/$/); // callback → home
    expect(page.url()).not.toContain('code=');
    expect(page.url()).not.toContain('access_token');

    // A new account has not onboarded: the profile tab opens the onboarding flow and comes back after it.
    await page.getByRole('tab', { name: 'Profil' }).click();
    await expect(page).toHaveURL(/\/onboarding\?returnTo=%2Fprofile$/);
    await completeOnboarding(page, 'Ayşe Yılmaz');
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText(`${email} olarak giriş yapıldı`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ayşe Yılmaz', level: 1 })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0); // verified: no warning banner

    await page.getByRole('button', { name: 'Çıkış yap' }).click();
    await expect(page).toHaveURL(/localhost:4173\/$/); // signing out lands on the guest home page
    await page.getByRole('tab', { name: 'Profil' }).click();
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fprofile$/);

    // Sign back in; returnTo brings us to the page we originally wanted.
    await fillCredentials(page, email, PASSWORD);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText(`${email} olarak giriş yapıldı`)).toBeVisible();

    // Cleanup via the admin API (look the id up from the email).
    const users = (await (
      await fetch(`${s.apiUrl}/auth/v1/admin/users?per_page=200`, {
        headers: { apikey: s.serviceRoleKey, Authorization: `Bearer ${s.serviceRoleKey}` },
      })
    ).json()) as { users: { id: string; email: string }[] };
    const created = users.users.find((u) => u.email === email);
    if (created) createdIds.push(created.id);
  });

  test('the session persists across a reload and is gone after sign-out', async ({ page }) => {
    const s = requireStack();
    const email = uniqueEmail('persist');
    createdIds.push((await createOnboardedUser(s, email)).id);

    await page.goto('/sign-in');
    await fillCredentials(page, email, PASSWORD);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page.getByRole('tab', { name: 'Keşfet' })).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Etkinliklerim' }).click();
    await expect(page).toHaveURL(/\/my-events$/); // still authenticated after reload

    await page.getByRole('tab', { name: 'Profil' }).click();
    await page.getByRole('button', { name: 'Çıkış yap' }).click();
    await expect(page).toHaveURL(/localhost:4173\/$/);
    await page.reload();
    await page.getByRole('tab', { name: 'Etkinliklerim' }).click();
    await expect(page).toHaveURL(/\/sign-in/); // the session did not survive sign-out
  });
});

test.describe('sign-in failures and validation', () => {
  test('wrong password shows one generic message (no account enumeration)', async ({ page }) => {
    const s = requireStack();
    const email = uniqueEmail('wrongpw');
    createdIds.push((await createVerifiedUser(s, email)).id);

    await page.goto('/sign-in');
    await fillCredentials(page, email, 'definitely-the-wrong-password');
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page.getByRole('alert')).toHaveText('E-posta veya şifre hatalı.');

    await page.getByLabel('E-posta', { exact: true }).fill(uniqueEmail('ghost'));
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page.getByRole('alert')).toHaveText('E-posta veya şifre hatalı.');
  });

  test('client-side validation messages are Turkish and block the request', async ({ page }) => {
    await page.goto('/sign-up');
    await page.getByRole('button', { name: 'Kayıt ol' }).click();
    await expect(page.getByText('Geçerli bir e-posta adresi gir.')).toBeVisible();
    await expect(page.getByText('Şifre en az 10 karakter olmalı.').first()).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test('a malicious returnTo is ignored after sign-in (no open redirect)', async ({ page }) => {
    const s = requireStack();
    const email = uniqueEmail('redirect');
    createdIds.push((await createVerifiedUser(s, email)).id);

    await page.goto('/sign-in?returnTo=https%3A%2F%2Fevil.example%2Fphish');
    await fillCredentials(page, email, PASSWORD);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page).toHaveURL(/localhost:4173\/$/);
  });
});

test.describe('password reset', () => {
  test('request link → set a new password → old password stops working', async ({ page }) => {
    const s = requireStack();
    const email = uniqueEmail('reset');
    createdIds.push((await createOnboardedUser(s, email)).id);
    const newPassword = 'a-brand-new-long-password';

    await page.goto('/forgot-password');
    await page.getByLabel('E-posta', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Sıfırlama bağlantısı gönder' }).click();
    await expect(page.getByText(/şifre sıfırlama bağlantısı gönderildi/)).toBeVisible();

    await page.goto(await waitForAuthLink(s, email));
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel('Yeni şifre', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Şifreyi güncelle' }).click();
    await expect(page.getByText('Şifren güncellendi.')).toBeVisible();

    await page.getByRole('tab', { name: 'Profil' }).click();
    await page.getByRole('button', { name: 'Çıkış yap' }).click();
    await expect(page).toHaveURL(/localhost:4173\/$/);

    await page.goto('/sign-in');
    await fillCredentials(page, email, PASSWORD);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page.getByRole('alert')).toHaveText('E-posta veya şifre hatalı.');
    await fillCredentials(page, email, newPassword);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page).toHaveURL(/localhost:4173\/$/);
  });

  test('an invalid recovery visit explains the problem instead of showing a form', async ({
    page,
  }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: 'Bağlantı geçersiz' })).toBeVisible();
  });
});

test.describe('accessibility of account screens (axe, WCAG 2.2 AA tags)', () => {
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  for (const path of [
    '/sign-in',
    '/sign-up',
    '/forgot-password',
    '/verify-email',
    '/reset-password',
  ]) {
    test(`no serious or critical violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      const blocking = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      );
      expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`)).toEqual([]);
    });
  }
});
