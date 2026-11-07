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

const stack: LocalStack | null = getLocalStack();
const created: string[] = [];
test.afterAll(async () => {
  if (stack) await Promise.all(created.map((id) => deleteUser(stack, id)));
});

const axe = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
};

// Phase 8 / M2: the wheel picker is our own component, so its web behaviour (mouse wheel, keyboard,
// a click on an option, settling on a row) is proven here rather than assumed.
test('the date wheel of Discover works with a mouse wheel, the keyboard and a click', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tüm sporlar', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Tarih seç' }).click();
  const wheel = page.getByRole('slider', { name: 'Tarih' });
  await expect(wheel).toHaveAttribute('aria-valuetext', 'Bugün');
  await expect(wheel).toHaveAttribute('aria-valuenow', '0');

  // Three rows down with the mouse wheel: it settles on the third day after today.
  await wheel.hover();
  await page.mouse.wheel(0, 44 * 3);
  await expect(wheel).toHaveAttribute('aria-valuenow', '3');

  // The keyboard: one step up, then back to the start.
  await wheel.focus();
  await page.keyboard.press('ArrowUp');
  await expect(wheel).toHaveAttribute('aria-valuenow', '2');
  await page.keyboard.press('Home');
  await expect(wheel).toHaveAttribute('aria-valuetext', 'Bugün');

  // A click on the row below the band picks tomorrow.
  await wheel.getByText('Yarın', { exact: true }).click();
  await expect(wheel).toHaveAttribute('aria-valuetext', 'Yarın');

  await axe(page);

  await page.getByRole('button', { name: 'Bu günü göster' }).click();
  await expect(page.getByRole('checkbox', { name: /^Tarih: / })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('checkbox', { name: 'Yarın' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
});

test('the event form sets its start with the date and time wheels', async ({ page }) => {
  test.skip(!stack && process.env.REQUIRE_STACK !== '1', 'local Supabase stack is not running');
  if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
  const email = uniqueEmail('wheels');
  created.push((await createOnboardedUser(stack, email)).id);
  await page.goto('/sign-in');
  await page.getByLabel('E-posta', { exact: true }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.getByRole('tab', { name: 'Oluştur' }).click();
  await page.getByRole('button', { name: /^Spor:/ }).click();
  await page.getByRole('radio', { name: 'Futbol', exact: true }).click();
  await page.getByRole('button', { name: 'İleri' }).click();

  const date = page.getByRole('slider', { name: 'Tarih' });
  const hour = page.getByRole('slider', { name: 'Saat' });
  const minute = page.getByRole('slider', { name: 'Dakika' });
  // A new event starts tomorrow at 19:00.
  await expect(date).toHaveAttribute('aria-valuetext', 'Yarın');
  await expect(hour).toHaveAttribute('aria-valuetext', '19');
  await expect(minute).toHaveAttribute('aria-valuetext', '00');

  await hour.focus();
  await page.keyboard.press('ArrowDown');
  await expect(hour).toHaveAttribute('aria-valuetext', '20');
  await minute.hover();
  await page.mouse.wheel(0, 44 * 6);
  await expect(minute).toHaveAttribute('aria-valuetext', '30');
  // The quick day chips and the wheel are one choice.
  await page.getByRole('checkbox', { name: 'Bugün' }).click();
  await expect(date).toHaveAttribute('aria-valuetext', 'Bugün');
  await page.getByRole('checkbox', { name: 'Yarın' }).click();
  await expect(date).toHaveAttribute('aria-valuetext', 'Yarın');
  await axe(page);

  // The review step shows what the wheels chose.
  await page.getByRole('button', { name: 'İleri' }).click();
  await page.getByRole('button', { name: /^İlçe:/ }).click();
  await page.getByRole('radio', { name: 'Çankaya', exact: true }).click();
  await page.getByLabel('Yer', { exact: true }).fill('ODTÜ Halı Saha 2');
  await page.getByRole('button', { name: 'İleri' }).click();
  await page.getByLabel('Başlık', { exact: true }).fill('Tekerlek maçı');
  await page.getByRole('button', { name: 'İleri' }).click();
  await expect(page.getByText(/ 20:30$/)).toBeVisible();
});
