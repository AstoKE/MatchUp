import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createOnboardedUser,
  createVerifiedUser,
  deleteUser,
  getLocalStack,
  PASSWORD,
  revokeLegalConsent,
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

const adultBox = (page: Page) =>
  page.getByRole('checkbox', { name: '18 yaşından büyük olduğumu onaylıyorum.' });
const termsBox = (page: Page) =>
  page.getByRole('checkbox', {
    name: "Kullanım Koşulları'nı ve Gizlilik Bildirimi'ni okudum, kabul ediyorum.",
  });
const next = (page: Page) => page.getByRole('button', { name: 'İleri' });

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoBlocking(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  const blocking = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`)).toEqual([]);
}

test.describe('onboarding gate', () => {
  test('guests are sent to sign-in; an account that has not onboarded is sent to onboarding', async ({
    page,
  }) => {
    const s = requireStack();
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fonboarding$/);

    const email = uniqueEmail('gate');
    createdIds.push((await createVerifiedUser(s, email)).id);
    await signIn(page, email);
    await page.getByRole('tab', { name: 'Etkinliklerim' }).click();
    await expect(page).toHaveURL(/\/onboarding\?returnTo=%2Fmy-events$/);
    await expect(
      page.getByRole('heading', { name: 'Profilini oluşturalım', level: 1 }),
    ).toBeVisible();
  });

  test('18+, terms, name and sport are each required, with Turkish messages, before anything is saved', async ({
    page,
  }) => {
    const s = requireStack();
    const email = uniqueEmail('rules');
    createdIds.push((await createVerifiedUser(s, email)).id);
    await signIn(page, email);
    await page.goto('/onboarding');

    await expect(page.getByText(/henüz bir avukat tarafından incelenmemiş/)).toBeVisible(); // draft notice
    await next(page).click();
    await expect(page.getByText(/18 yaşından büyük olmalısın/)).toBeVisible();
    await expect(
      page.getByText(/Kullanım Koşulları ve Gizlilik Bildirimi'ni kabul etmelisin/),
    ).toBeVisible();

    await adultBox(page).click();
    await termsBox(page).click();
    await next(page).click();
    await next(page).click(); // empty name
    await expect(page.getByText('En az 2 karakter kullan.')).toBeVisible();
    await page.getByLabel('Görünen ad', { exact: true }).fill('Al');
    await expect(page.getByText('En az 2 karakter kullan.')).toHaveCount(0); // message goes away while fixing
    await next(page).click();
    await page.getByRole('button', { name: 'Bitir' }).click(); // no sport
    await expect(page.getByText('En az bir spor seç.')).toBeVisible();

    // Level moves in half steps and positions are limited to three.
    await page.getByRole('checkbox', { name: 'Futbol', exact: true }).click();
    await page.getByRole('button', { name: 'Seviyeyi yükselt' }).click();
    await expect(page.getByText('Seviye 3.5')).toBeVisible();
    for (const name of ['Kaleci', 'Defans', 'Orta saha']) {
      await page.getByRole('checkbox', { name, exact: true }).click();
    }
    await expect(page.getByRole('checkbox', { name: 'Forvet', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Bitir' }).click();
    await expect(page).toHaveURL(/localhost:4173\/$/); // returnTo was the home page
    await page.getByRole('tab', { name: 'Profil' }).click();
    await expect(page.getByText('Futbol · Seviye 3.5')).toBeVisible();
    await expect(page.getByText('Kaleci, Defans, Orta saha')).toBeVisible();
  });

  test('an onboarded user who opens /onboarding again is simply sent on', async ({ page }) => {
    const s = requireStack();
    const email = uniqueEmail('again');
    createdIds.push((await createOnboardedUser(s, email)).id);
    await signIn(page, email);
    await page.goto('/onboarding?returnTo=%2Fmy-events');
    await expect(page).toHaveURL(/\/my-events$/);
  });

  test('an onboarded user with an outdated acceptance must re-consent, then returns to the page', async ({
    page,
  }) => {
    const s = requireStack();
    const email = uniqueEmail('reconsent');
    const user = await createOnboardedUser(s, email);
    createdIds.push(user.id);
    revokeLegalConsent(user.id);
    await signIn(page, email);

    await page.getByRole('tab', { name: 'Profil' }).click();
    await expect(page).toHaveURL(/\/consent-update\?returnTo=%2Fprofile$/);
    await expect(
      page.getByRole('heading', { name: 'Koşullarımız güncellendi', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(1); // no second 18+ or marketing question
    await expectNoBlocking(page);

    await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
    await expect(page.getByText(/kabul etmelisin/)).toBeVisible();
    await page
      .getByRole('checkbox', {
        name: "Güncellenen Kullanım Koşulları'nı ve Gizlilik Bildirimi'ni okudum, kabul ediyorum.",
      })
      .click();
    await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'E2E Kullanıcı', level: 1 })).toBeVisible();
  });
});

test.describe('profile screens', () => {
  test('edit profile, edit sports and settings persist and show on the profile', async ({
    page,
  }) => {
    const s = requireStack();
    const email = uniqueEmail('edit');
    createdIds.push((await createOnboardedUser(s, email, { displayName: 'Eski Ad' })).id);
    await signIn(page, email);
    await page.getByRole('tab', { name: 'Profil' }).click();
    await expect(page.getByRole('heading', { name: 'Eski Ad', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Profili düzenle' }).click();
    await page.getByLabel('Görünen ad', { exact: true }).fill('Yeni Ad');
    await page.getByLabel('Hakkında', { exact: true }).fill('Hafta sonları halı saha.');
    await page.getByRole('button', { name: /^İl: / }).click();
    await page.getByRole('radio', { name: 'Ankara' }).click();
    await page.getByRole('button', { name: /^İlçe: / }).click();
    await page.getByRole('radio', { name: 'Çankaya' }).click();
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByRole('heading', { name: 'Yeni Ad', level: 1 })).toBeVisible();
    await expect(page.getByText('Çankaya, Ankara')).toBeVisible();
    await expect(page.getByText('Hafta sonları halı saha.')).toBeVisible();

    await page.getByRole('button', { name: 'Sporları düzenle' }).click();
    await page.getByRole('checkbox', { name: 'Tenis', exact: true }).click();
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Tenis · Seviye 3')).toBeVisible();
    await expect(page.getByText('Futbol · Seviye 3')).toBeVisible();

    await page.getByRole('button', { name: 'Ayarlar' }).click();
    await page.getByRole('radio', { name: 'Herkes' }).click();
    await page.getByRole('button', { name: 'Kaydet' }).first().click();
    await expect(page.getByText('Kaydedildi.').last()).toBeVisible(); // earlier saves may still show a toast

    await page.reload(); // everything came from the server, not from memory
    await expect(page.getByRole('radio', { name: 'Herkes' })).toBeChecked();
  });

  test('the in-app language choice applies at once and survives a reload', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Tekrar hoş geldin' })).toBeVisible();
    await page.getByRole('radio', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'English' })).toBeChecked();
  });
});

test.describe('accessibility of onboarding, legal and profile screens (axe, WCAG 2.2 AA tags)', () => {
  for (const path of ['/legal/terms', '/legal/privacy']) {
    test(`no serious or critical violations on ${path} (guest)`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoBlocking(page);
    });
  }

  test('no serious or critical violations on every onboarding step', async ({ page }) => {
    const s = requireStack();
    const email = uniqueEmail('axe-onboarding');
    createdIds.push((await createVerifiedUser(s, email)).id);
    await signIn(page, email);
    await page.goto('/onboarding');
    await expect(page.getByText('Başlamadan önce')).toBeVisible();
    await expectNoBlocking(page);

    await adultBox(page).click();
    await termsBox(page).click();
    await next(page).click();
    await expect(page.getByText('Seni tanıyalım')).toBeVisible();
    await page.getByRole('button', { name: /^İl: / }).click(); // open the select as well
    await expectNoBlocking(page);

    await page.getByLabel('Görünen ad', { exact: true }).fill('Axe Test');
    await next(page).click();
    await page.getByRole('checkbox', { name: 'Futbol', exact: true }).click();
    await expect(page.getByText('Seviye 3')).toBeVisible();
    await expectNoBlocking(page);
  });

  for (const path of ['/profile', '/edit-profile', '/edit-sports', '/settings']) {
    test(`no serious or critical violations on ${path} (onboarded user)`, async ({ page }) => {
      const s = requireStack();
      const email = uniqueEmail('axe-profile');
      createdIds.push((await createOnboardedUser(s, email)).id);
      await signIn(page, email);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoBlocking(page);
    });
  }
});
