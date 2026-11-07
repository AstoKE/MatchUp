import { AxeBuilder } from '@axe-core/playwright';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  createOnboardedUser,
  deleteUser,
  getLocalStack,
  PASSWORD,
  uniqueEmail,
  type LocalStack,
} from './support/stack';

// Phase 8 / M3 on the web: the avatar beside the province, changing the drawing, and an own photo that is cropped,
// resized and stripped of its EXIF (location included) before it leaves the browser.
const stack: LocalStack | null = getLocalStack();
test.skip(!stack && process.env.REQUIRE_STACK !== '1', 'local Supabase stack is not running');
const created: string[] = [];
test.afterAll(async () => {
  if (stack) await Promise.all(created.map((id) => deleteUser(stack, id)));
});

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

/** The picture inside the header's profile link (React Native Web draws an image as a background and an <img>). */
const headerImage = (page: Page) =>
  page.getByRole('link', { name: 'Profil', exact: true }).locator('img');

test('a drawing, then an own photo, shown beside the province', async ({ page }) => {
  test.setTimeout(90_000);
  if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
  const email = uniqueEmail('avatar');
  created.push((await createOnboardedUser(stack, email, { displayName: 'Elif Yıldız' })).id);
  await signIn(page, email);

  // No drawing yet (an account from before Phase 8): the header shows a person icon, no picture.
  await page.goto('/');
  await page.getByRole('button', { name: 'Tüm sporlar', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Profil', exact: true })).toBeVisible();
  await expect(headerImage(page)).toHaveCount(0);

  // Choose a drawing from the profile.
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Avatarı değiştir' }).click();
  await expect(page.getByRole('radio', { name: 'Harfler', checked: true })).toBeVisible();
  await expectNoBlocking(page);
  await page.getByRole('radio', { name: 'Tenis, kız karakter' }).click();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole('tab', { name: 'Keşfet' }).click();
  await expect(headerImage(page)).toHaveAttribute('src', /f-tennis/);

  // Upload a photo: a 900 × 600 JPEG carrying GPS coordinates.
  await page.goto('/avatar');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Fotoğraf yükle' }).click();
  await (await chooser).setFiles(join(__dirname, 'fixtures', 'photo.jpg'));
  await expect(page.getByText('Fotoğrafın yüklendi.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Fotoğrafı kaldır' })).toBeVisible();

  await page.goto('/');
  const photo = headerImage(page);
  await expect(photo).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/avatars\//);
  const src = (await photo.getAttribute('src'))!;
  const stored = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const text = Array.from(bytes.slice(0, 4096), (b) => String.fromCharCode(b)).join('');
    return {
      width: image.width,
      height: image.height,
      size: bytes.length,
      exif: text.includes('Exif'),
    };
  }, src);
  // Cropped square, 512 px, well under the 1 MB limit, and no EXIF block left.
  expect(stored).toMatchObject({ width: 512, height: 512, exif: false });
  expect(stored.size).toBeLessThan(1_048_576);

  // Remove it: the drawing comes back.
  await page.goto('/avatar');
  await page.getByRole('button', { name: 'Fotoğrafı kaldır' }).click();
  await expect(page.getByText('Fotoğrafın kaldırıldı.')).toBeVisible();
  await page.goto('/');
  await expect(headerImage(page)).toHaveAttribute('src', /f-tennis/);
});
