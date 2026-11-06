import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createOnboardedUser,
  createPublishedEvent,
  deleteEventsOf,
  deleteUser,
  getLocalStack,
  PASSWORD,
  startEvent,
  uniqueEmail,
  type LocalStack,
} from './support/stack';

/**
 * Phase 7 / M1 (ROADMAP F-35): the whole life of one event in one flow, through the screens, with three people. The
 * details of each step are tested in events.spec.ts; this proves the steps fit together: request → approve → full →
 * waitlist → a player leaves → the waitlisted player is approved → the event starts → attendance → reviews → the past.
 */
const stack: LocalStack | null = getLocalStack();
test.skip(!stack && process.env.REQUIRE_STACK !== '1', 'local Supabase stack is not running');

const createdIds: string[] = [];
test.afterAll(async () => {
  for (const id of createdIds) deleteEventsOf(id);
  if (stack) await Promise.all(createdIds.map((id) => deleteUser(stack, id)));
});

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/sign-in');
  await page.getByLabel('E-posta', { exact: true }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('tab', { name: 'Keşfet' })).toBeVisible();
  return page;
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

test('the life of an event: request, full, waitlist, leave, promote, attendance, review', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
  const hostEmail = uniqueEmail('life-host');
  const aEmail = uniqueEmail('life-a');
  const bEmail = uniqueEmail('life-b');
  createdIds.push((await createOnboardedUser(stack, hostEmail, { displayName: 'Ev Sahibi' })).id);
  createdIds.push((await createOnboardedUser(stack, aEmail, { displayName: 'Ayla Oyuncu' })).id);
  createdIds.push((await createOnboardedUser(stack, bEmail, { displayName: 'Bora Oyuncu' })).id);
  // Tennis singles: two places, one of them the organizer's, so one player fills it.
  const title = `E2E yaşam döngüsü ${hostEmail.slice(10, 18)}`;
  const eventId = await createPublishedEvent(stack, hostEmail, title, {
    sportSlug: 'tennis',
    formatSlug: 'singles',
    capacity: 2,
  });

  // 1. Ayla asks to join; the organizer approves; the event is full.
  const a = await signedIn(browser, aEmail);
  await a.goto(`/e/${eventId}`);
  await a.getByRole('main').getByRole('button', { name: 'Katılım isteği gönder' }).click();
  await a.getByRole('button', { name: 'İstek gönder' }).click();
  await expect(a.getByRole('heading', { name: 'İsteğin gönderildi', level: 1 })).toBeVisible();

  const host = await signedIn(browser, hostEmail);
  await host.goto(`/e/${eventId}/manage`);
  const manage = host.getByRole('main');
  await expect(manage.getByText('Ayla Oyuncu')).toBeVisible();
  await manage.getByRole('button', { name: 'Onayla' }).click();
  await expect(manage.getByText('2/2 kişi', { exact: true })).toBeVisible();

  // 2. Bora finds it full and goes onto the waitlist.
  const b = await signedIn(browser, bEmail);
  await b.goto(`/e/${eventId}`);
  await expect(b.getByRole('main').getByText('Dolu', { exact: true })).toBeVisible();
  await b.getByRole('main').getByRole('button', { name: 'Yedek listeye başvur' }).click();
  // On the request screen of a full event the confirming button says the same.
  await expect(b.getByRole('heading', { name: 'Katılım isteğini onayla', level: 1 })).toBeVisible();
  await b.getByRole('button', { name: 'Yedek listeye başvur' }).last().click();
  await expect(b.getByRole('heading', { name: 'Yedek listeye başvurdun', level: 1 })).toBeVisible();
  await b.getByRole('button', { name: 'Etkinliği görüntüle' }).click();
  await expect(b.getByRole('main').getByText('Yedek listedesin', { exact: true })).toBeVisible();

  // 3. Ayla leaves; the organizer approves Bora from the waitlist.
  await a.goto(`/e/${eventId}`);
  await a.getByRole('main').getByRole('button', { name: 'Etkinlikten ayrıl' }).click();
  await expect(
    a.getByRole('main').getByRole('button', { name: 'Katılım isteği gönder' }),
  ).toBeVisible();

  await host.reload();
  await expect(manage.getByText('Yedek liste (1)')).toBeVisible();
  await expect(manage.getByText('Bora Oyuncu')).toBeVisible();
  await manage.getByRole('button', { name: 'Onayla' }).click();
  await expect(manage.getByText('2/2 kişi', { exact: true })).toBeVisible();
  await expectNoBlocking(host);

  await b.reload();
  await expect(b.getByRole('main').getByText('Katılım onaylandı', { exact: true })).toBeVisible();

  // 4. The event starts; the organizer confirms attendance.
  startEvent(eventId);
  await host.goto(`/e/${eventId}/manage`);
  await expect(manage.getByRole('heading', { name: 'Yoklama', level: 2 })).toBeVisible();
  await manage
    .getByRole('radiogroup', { name: 'Bora Oyuncu' })
    .getByRole('radio', { name: 'Geldi' })
    .click();
  await manage.getByRole('button', { name: 'Yoklamayı kesinleştir' }).click();
  await manage.getByRole('button', { name: 'Evet, kesinleştir' }).click();
  await expect(manage.getByText('Bora Oyuncu: Geldi')).toBeVisible();

  // 5. Bora reviews the organizer, double-blind.
  await b.goto(`/e/${eventId}`);
  await expect(b.getByText('Geldin olarak işaretlendin.')).toBeVisible();
  await expect(b.getByRole('heading', { name: 'Değerlendirme', level: 2 })).toBeVisible();
  await b.getByRole('radiogroup', { name: 'Ev Sahibi' }).getByRole('radio', { name: '4' }).click();
  await b.getByRole('button', { name: /Değerlendirmeleri gönder/ }).click();
  await expect(b.getByText('Ev Sahibi: değerlendirildi')).toBeVisible();
  await expectNoBlocking(b);

  // 6. It is in Bora's past events; Ayla, who left, has no attendance or review there.
  await b.getByRole('tab', { name: 'Etkinliklerim' }).click();
  await b.getByRole('main').getByRole('radio', { name: 'Geçmiş' }).click();
  await expect(b.getByRole('main').getByRole('link', { name: new RegExp(title) })).toBeVisible();
  await a.goto(`/e/${eventId}`);
  await expect(a.getByRole('heading', { name: 'Değerlendirme', level: 2 })).toHaveCount(0);

  for (const page of [a, b, host]) await page.context().close();
});
