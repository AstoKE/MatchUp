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

// Needs the LOCAL Supabase stack; CI sets REQUIRE_STACK=1 so a missing stack fails instead of skipping.
const stack: LocalStack | null = getLocalStack();
test.skip(!stack && process.env.REQUIRE_STACK !== '1', 'local Supabase stack is not running');

const createdIds: string[] = [];
test.afterAll(async () => {
  for (const id of createdIds) deleteEventsOf(id);
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

async function choose(page: Page, select: RegExp, option: string) {
  await page.getByRole('button', { name: select }).click();
  await page.getByRole('radio', { name: option, exact: true }).click();
}

test.describe('organizing an event (Phase 3 / M2)', () => {
  test('create → publish → see it → edit → guests see it → cancel', async ({ page }) => {
    const s = requireStack();
    const email = uniqueEmail('organizer');
    createdIds.push((await createOnboardedUser(s, email)).id);
    await signIn(page, email);

    await page.getByRole('tab', { name: 'Oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Etkinlik oluştur', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'İleri' }).click();
    await expect(page.getByText('Bir spor seç.')).toBeVisible();
    await expectNoBlocking(page);

    await choose(page, /^Spor:/, 'Futbol');
    await expect(page.getByRole('button', { name: /^Format: 5v5/ })).toBeVisible();
    await page.getByLabel('Başlık', { exact: true }).fill('E2E perşembe maçı');
    await page.getByRole('button', { name: 'İleri' }).click();

    await expect(page.getByRole('heading', { name: 'Ne zaman, nerede?' })).toBeVisible();
    await choose(page, /^İlçe:/, 'Çankaya');
    await page.getByLabel('Yer', { exact: true }).fill('ODTÜ Halı Saha 2');
    await page.getByLabel('Açık adres (isteğe bağlı)', { exact: true }).fill('Üniversiteler Mh. 1');
    await expectNoBlocking(page);
    await page.getByRole('button', { name: 'İleri' }).click();

    await expect(page.getByRole('heading', { name: 'Kimler, kaç kişi?' })).toBeVisible();
    await page.getByRole('button', { name: 'Kontenjanı artır' }).click();
    await expect(page.getByText('11 kişi', { exact: true })).toBeVisible();
    await expectNoBlocking(page);
    await page.getByRole('button', { name: 'Yayınla' }).click();

    await expect(page).toHaveURL(/\/e\/[0-9a-f-]{36}$/);
    const eventUrl = page.url();
    await expect(page.getByRole('heading', { name: 'E2E perşembe maçı', level: 1 })).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByText('Futbol · 5v5', { exact: true })).toBeVisible();
    await expect(main.getByText('Yayında', { exact: true })).toBeVisible();
    // The main navigation stays available on the event page (it is not a dead end).
    for (const name of ['Keşfet', 'Etkinliklerim', 'Oluştur', 'Profil']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
    await expect(page.getByRole('tab')).toHaveCount(4);
    await expect(main.getByText('1/11 kişi')).toBeVisible();
    await expect(main.getByText('Çankaya · ODTÜ Halı Saha 2 · Üniversiteler Mh. 1')).toBeVisible();
    await expectNoBlocking(page);

    await page.getByRole('button', { name: 'Düzenle' }).click();
    await expect(
      page.getByText('Yayınlandıktan sonra spor, format ve oynama durumu değiştirilemez.'),
    ).toBeVisible();
    await page.getByLabel('Başlık', { exact: true }).fill('E2E cuma maçı');
    await page.getByRole('button', { name: 'İleri' }).click();
    await page.getByRole('button', { name: 'İleri' }).click();
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect(page.getByRole('heading', { name: 'E2E cuma maçı', level: 1 })).toBeVisible();

    // A guest sees the public event, but not the private street address.
    const guest = await page.context().browser()!.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(eventUrl);
    await expect(guestPage.getByRole('heading', { name: 'E2E cuma maçı', level: 1 })).toBeVisible();
    await expect(guestPage.getByText('Çankaya · ODTÜ Halı Saha 2', { exact: true })).toBeVisible();
    await expect(guestPage.getByText(/Üniversiteler/)).toHaveCount(0);
    await expect(guestPage.getByRole('button', { name: 'Düzenle' })).toHaveCount(0);
    await guest.close();

    await page.getByRole('button', { name: 'Etkinliği iptal et' }).click();
    await expect(page.getByRole('heading', { name: 'Etkinliği iptal et', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Etkinliği iptal et' }).click();
    await expect(page.getByText('Bir sebep seç.')).toBeVisible();
    await expectNoBlocking(page);
    await choose(page, /^Sebep:/, 'Hava durumu');
    await page
      .getByLabel('Katılımcılara mesaj (isteğe bağlı)', { exact: true })
      .fill('Yağmur bekleniyor');
    await page.getByRole('button', { name: 'Etkinliği iptal et' }).click();
    await expect(page.getByText('İptal sebebi: Hava durumu — Yağmur bekleniyor')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Düzenle' })).toHaveCount(0);
  });
});

test.describe('discovering events (Phase 3 / M3)', () => {
  test('a guest finds a published event, filters it away and opens it', async ({ page }) => {
    const s = requireStack();
    const email = uniqueEmail('discover');
    createdIds.push((await createOnboardedUser(s, email, { displayName: 'Ayşe Düzenleyen' })).id);
    const title = `E2E keşif ${email.slice(9, 17)}`;
    const eventId = await createPublishedEvent(s, email, title);

    await page.goto('/');
    const card = page.getByRole('link', { name: new RegExp(title) });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Çankaya · ODTÜ Halı Saha 2');
    await expect(card).toContainText('1/12 kişi');
    await expect(card).toContainText('Ayşe Düzenleyen düzenliyor');
    await expectNoBlocking(page);

    // A sport the event is not in hides it and says why; clearing the filter brings it back.
    await page.getByRole('checkbox', { name: 'Tenis', exact: true }).click();
    await expect(page.getByText('Bu filtrelere uyan etkinlik yok')).toBeVisible();
    await expect(card).toHaveCount(0);
    await page.getByRole('button', { name: 'Filtreleri temizle' }).first().click();
    await expect(card).toBeVisible();

    await card.click();
    await expect(page).toHaveURL(new RegExp(`/e/${eventId}$`));
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    const detail = page.getByRole('main');
    await expect(detail.getByText('1/12 kişi', { exact: true })).toBeVisible();
    await expect(detail.getByText('11 yer kaldı')).toBeVisible();
    await expectNoBlocking(page);

    // From the event page the guest can go back to the list and use the navigation.
    await page.getByRole('button', { name: 'Geri' }).click();
    await expect(page.getByRole('heading', { name: 'Keşfet', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: new RegExp(title) }).click();
    await page.getByRole('tab', { name: 'Keşfet' }).click();
    await expect(page.getByRole('heading', { name: 'Keşfet', level: 1 })).toBeVisible();
  });
});

test.describe('My Events (Phase 3 / M3b)', () => {
  test('the organizer finds their draft and published event; someone else does not', async ({
    page,
    browser,
  }) => {
    const s = requireStack();
    const email = uniqueEmail('mine');
    createdIds.push((await createOnboardedUser(s, email)).id);
    const tag = email.slice(5, 13);
    await createPublishedEvent(s, email, `E2E yayında ${tag}`);
    await createPublishedEvent(s, email, `E2E taslak ${tag}`, { publish: false });

    await signIn(page, email);
    await page.getByRole('tab', { name: 'Etkinliklerim' }).click();
    await expect(page.getByRole('heading', { name: 'Etkinliklerim', level: 1 })).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: new RegExp(`E2E yayında ${tag}`) })).toBeVisible();
    const draft = main.getByRole('link', { name: new RegExp(`E2E taslak ${tag}`) });
    await expect(draft).toBeVisible();
    await expect(draft).toContainText('Taslak');
    await expectNoBlocking(page);

    // The other tabs are empty for an organizer who has not asked to join anything.
    await main.getByRole('radio', { name: 'Bekleyen' }).click();
    await expect(main.getByText('Bekleyen isteğin yok')).toBeVisible();
    await main.getByRole('radio', { name: 'Düzenlediklerim' }).click();
    await draft.click();
    await expect(page).toHaveURL(/\/e\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { name: new RegExp(`E2E taslak ${tag}`), level: 1 }),
    ).toBeVisible();

    const strangerEmail = uniqueEmail('stranger');
    createdIds.push((await createOnboardedUser(s, strangerEmail)).id);
    const context = await browser.newContext();
    const stranger = await context.newPage();
    await signIn(stranger, strangerEmail);
    await stranger.getByRole('tab', { name: 'Etkinliklerim' }).click();
    await expect(stranger.getByText('Düzenlediğin etkinlik yok')).toBeVisible();
    await expect(stranger.getByRole('main').getByText(new RegExp(`E2E .* ${tag}`))).toHaveCount(0);
    await context.close();
  });
});
