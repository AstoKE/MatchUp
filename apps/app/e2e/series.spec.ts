import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createOnboardedUser,
  createPublishedEvent,
  deleteEventsOf,
  deleteUser,
  getLocalStack,
  PASSWORD,
  uniqueEmail,
  type LocalStack,
} from './support/stack';

/**
 * Phase 11 / M2–M3 (ADR-0032): an organizer turns an event into a weekly series through the screens, makes it the model
 * for the next events, finds the next week already open and marked in My events, and stops the series; the opened week
 * stays. The rules are in pgTAP
 * 44_event_series and the hourly job's races in the integration tests.
 */
const stack: LocalStack | null = getLocalStack();
test.skip(!stack && process.env.REQUIRE_STACK !== '1', 'local Supabase stack is not running');

const createdIds: string[] = [];
test.afterAll(async () => {
  for (const id of createdIds) deleteEventsOf(id);
  if (stack) await Promise.all(createdIds.map((id) => deleteUser(stack, id)));
});

async function expectNoBlocking(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`)).toEqual([]);
}

test('an event becomes a weekly series, opens the next week and is stopped', async ({ page }) => {
  test.setTimeout(120_000);
  if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
  const email = uniqueEmail('series-host');
  createdIds.push((await createOnboardedUser(stack, email, { displayName: 'Seri Sahibi' })).id);
  const title = `E2E seri ${email.slice(12, 20)}`;
  const eventId = await createPublishedEvent(stack, email, title);

  await page.goto('/sign-in');
  await page.getByLabel('E-posta', { exact: true }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('tab', { name: 'Keşfet' })).toBeVisible();

  // 1. Start the series from event management.
  await page.goto(`/e/${eventId}/manage`);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Tekrarla', level: 2 })).toBeVisible();
  await expect(main.getByRole('radio', { name: 'Her hafta' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await main.getByRole('button', { name: 'Tekrarlamayı başlat' }).click();
  await expect(main.getByRole('heading', { name: 'Tekrarlanan etkinlik', level: 2 })).toBeVisible();
  const line = main.getByText(/^Her hafta \S+ \d{2}:\d{2}$/);
  await expect(line).toBeVisible();
  const repeats = (await line.textContent()) ?? '';
  // The event starts in two days, so next week's is within two weeks and opens at once.
  const opened = main.getByRole('link', { name: /etkinliğini aç$/ });
  await expect(opened).toHaveCount(1);
  await expectNoBlocking(page);
  // Phase 11 / M3: this event becomes the model for the events not opened yet.
  await main.getByRole('button', { name: 'Sonraki etkinlikler bunun gibi olsun' }).click();
  await expect(page.getByText('Sonraki etkinlikler bu etkinliğe göre açılacak')).toBeVisible();
  await expect(opened).toHaveCount(1);

  // 2. The next week is an ordinary published event that says it repeats.
  await opened.click();
  await expect(page).not.toHaveURL(new RegExp(`/e/${eventId}`));
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole('main').getByText('Tekrar', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText(repeats, { exact: true })).toBeVisible();
  const nextUrl = page.url();

  // 3. Both are in My events, marked.
  await page.getByRole('tab', { name: 'Etkinliklerim' }).click();
  await page.getByRole('main').getByRole('radio', { name: 'Düzenlediklerim' }).click();
  await expect(page.getByRole('main').getByRole('link', { name: new RegExp(title) })).toHaveCount(
    2,
  );
  await expect(page.getByRole('main').getByText('Tekrarlanan', { exact: true })).toHaveCount(2);

  // 4. Stop it, after a confirmation; the opened week stays, no longer repeating.
  await page.goto(`/e/${eventId}/manage`);
  await main.getByRole('button', { name: 'Seriyi durdur' }).click();
  await expect(main.getByText(/Seri durunca yeni etkinlik açılmaz/)).toBeVisible();
  await main.getByRole('button', { name: 'Durdur', exact: true }).click();
  await expect(main.getByText('Bu seriyi durdurdun; yeni etkinlik açılmıyor.')).toBeVisible();
  await expect(main.getByRole('button', { name: 'Yeniden tekrarla' })).toBeVisible();
  await expectNoBlocking(page);

  await page.goto(nextUrl);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole('main').getByText('Tekrar', { exact: true })).toHaveCount(0);
});
