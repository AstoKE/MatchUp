import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createOnboardedUser,
  createPublishedEvent,
  deleteEventsOf,
  deleteUser,
  finalizeAllPresent,
  getLocalStack,
  joinApproved,
  PASSWORD,
  setFootballRating,
  startEvent,
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
    await page.getByRole('radio', { name: 'Açık hava', exact: true }).click();
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
    await expect(main.getByText('Açık hava', { exact: true })).toBeVisible();
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
    await expect(card).toContainText('11 yer kaldı');
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
    await expect(detail.getByText('Ayşe Düzenleyen')).toBeVisible();
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

test.describe('joining an event (Phase 3 / M4)', () => {
  async function userPage(browser: Browser, email: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, email);
    return { page, context };
  }

  test('request → organizer is notified and approves → player is in; withdraw; auto-approve', async ({
    browser,
  }) => {
    const s = requireStack();
    const organizerEmail = uniqueEmail('host');
    const playerEmail = uniqueEmail('player');
    createdIds.push((await createOnboardedUser(s, organizerEmail)).id);
    createdIds.push(
      (await createOnboardedUser(s, playerEmail, { displayName: 'Deniz Oyuncu' })).id,
    );
    const tag = organizerEmail.slice(5, 13);
    const title = `E2E katılım ${tag}`;
    const eventId = await createPublishedEvent(s, organizerEmail, title);

    // The player asks to join, with a message.
    const player = await userPage(browser, playerEmail);
    await player.page.goto(`/e/${eventId}`);
    const detail = player.page.getByRole('main');
    await detail.getByRole('button', { name: 'Katılım isteği gönder' }).click();
    await detail.getByLabel('Organizatöre mesaj (isteğe bağlı)').fill('Orta saha oynarım');
    await expectNoBlocking(player.page);
    await detail.getByRole('button', { name: 'İsteği gönder' }).click();
    await expect(detail.getByText('Onay bekleniyor', { exact: true })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'İsteği geri çek' })).toBeVisible();

    // The organizer sees the unread notification, the request, and approves it.
    const host = await userPage(browser, organizerEmail);
    await host.page.getByRole('tab', { name: 'Etkinliklerim' }).click();
    const hostMain = host.page.getByRole('main');
    await expect(hostMain.getByRole('button', { name: 'Bildirimler, 1 okunmamış' })).toBeVisible();
    await host.page.goto(`/e/${eventId}`);
    await expect(hostMain.getByText('Deniz Oyuncu')).toBeVisible();
    await expect(hostMain.getByText('Orta saha oynarım')).toBeVisible();
    await expect(hostMain.getByRole('button', { name: 'Katılım isteği gönder' })).toHaveCount(0);
    await expectNoBlocking(host.page);
    await hostMain.getByRole('button', { name: 'Onayla' }).click();
    await expect(hostMain.getByText('Onaylı oyuncu (1)')).toBeVisible();
    await expect(hostMain.getByText('2/12 kişi', { exact: true })).toBeVisible();

    // The player is in, sees it in My Events, and has a notification.
    await player.page.reload();
    await expect(
      player.page.getByRole('main').getByText('Katılım onaylandı', { exact: true }),
    ).toBeVisible();
    await player.page.getByRole('tab', { name: 'Etkinliklerim' }).click();
    await player.page.getByRole('main').getByRole('radio', { name: 'Onaylı' }).click();
    await expect(
      player.page.getByRole('main').getByRole('link', { name: new RegExp(title) }),
    ).toBeVisible();
    await player.page
      .getByRole('main')
      .getByRole('button', { name: /^Bildirimler/ })
      .click();
    await expect(player.page.getByRole('heading', { name: 'Bildirimler', level: 1 })).toBeVisible();
    await expect(
      player.page.getByRole('main').getByText(`${title} için isteğin onaylandı.`),
    ).toBeVisible();
    await expectNoBlocking(player.page);

    // Withdrawing frees the spot again.
    await player.page.goto(`/e/${eventId}`);
    await player.page.getByRole('main').getByRole('button', { name: 'Etkinlikten ayrıl' }).click();
    await expect(
      player.page.getByRole('main').getByRole('button', { name: 'Katılım isteği gönder' }),
    ).toBeVisible();

    // An auto-approve event admits the player at once.
    const autoTitle = `E2E otomatik ${tag}`;
    const autoId = await createPublishedEvent(s, organizerEmail, autoTitle, { autoApprove: true });
    await player.page.goto(`/e/${autoId}`);
    const auto = player.page.getByRole('main');
    await auto.getByRole('button', { name: 'Katılım isteği gönder' }).click();
    await auto.getByRole('button', { name: 'İsteği gönder' }).click();
    await expect(auto.getByText('Katılım onaylandı', { exact: true })).toBeVisible();

    await player.context.close();
    await host.context.close();
  });
});

test.describe('Discover for a signed-in player (UI tour)', () => {
  test('opens on the profile sports, groups by day, and clearing shows everything', async ({
    page,
  }) => {
    const s = requireStack();
    const hostEmail = uniqueEmail('dayhost');
    const playerEmail = uniqueEmail('dayplayer');
    createdIds.push((await createOnboardedUser(s, hostEmail)).id);
    createdIds.push((await createOnboardedUser(s, playerEmail)).id);
    const title = `E2E gün ${hostEmail.slice(8, 16)}`;
    await createPublishedEvent(s, hostEmail, title);

    // createOnboardedUser gives every user football, so the football event is on their own sports.
    await signIn(page, playerEmail);
    const main = page.getByRole('main');
    await expect(main.getByText(/Profilindeki sporlar gösteriliyor/)).toBeVisible();
    await expect(main.getByRole('checkbox', { name: 'Futbol', exact: true })).toBeChecked();
    const card = main.getByRole('link', { name: new RegExp(title) });
    await expect(card).toBeVisible();
    // The row sits under a day heading and shows only the time.
    await expect(main.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(card).toContainText(/\d{2}:\d{2}/);
    await expectNoBlocking(page);

    await main.getByRole('button', { name: 'Filtreleri temizle' }).first().click();
    await expect(main.getByText(/Profilindeki sporlar gösteriliyor/)).toHaveCount(0);
    await expect(main.getByRole('checkbox', { name: 'Futbol', exact: true })).not.toBeChecked();
    await expect(card).toBeVisible();
  });

  test('on a phone the events come first and the filters open on request', async ({ page }) => {
    const s = requireStack();
    const hostEmail = uniqueEmail('phonehost');
    createdIds.push((await createOnboardedUser(s, hostEmail)).id);
    const title = `E2E telefon ${hostEmail.slice(10, 18)}`;
    await createPublishedEvent(s, hostEmail, title);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const main = page.getByRole('main');
    const card = main.getByRole('link', { name: new RegExp(title) });
    await expect(card).toBeVisible();
    // The first event card is on the first screen, not pushed below a wall of filter chips.
    // (Other tests publish events too, so check the first card of the list, whoever's it is.)
    const box = await main.getByRole('listitem').first().boundingBox();
    expect(box?.y ?? Infinity).toBeLessThan(844);
    // The frequent filters stay on one line; the rest open in a dialog.
    const chip = main.getByRole('checkbox', { name: 'Tenis', exact: true });
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    await expect(main.getByRole('button', { name: 'Filtreler (1)', exact: true })).toBeVisible();
    await main.getByRole('button', { name: 'Filtreleri temizle' }).first().click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await main.getByRole('button', { name: 'Filtreler', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Filtreler' });
    await expect(dialog).toBeVisible();
    // One named dialog, active at once: an inactive React Native Web modal has aria-modal without a role, no focus trap and no Escape.
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.locator('[aria-modal="true"]:not([role])')).toHaveCount(0);
    await expectNoBlocking(page);
    await dialog.getByRole('checkbox', { name: 'Akşam', exact: true }).click();
    await expectNoBlocking(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Filtreler (1)', exact: true })).toBeVisible();
    await expectNoBlocking(page);
  });
});

test.describe('Sport icons and the pinned join action (UI tour)', () => {
  test('cards and the event page show the sport icon; on a phone the join button stays on screen', async ({
    page,
  }) => {
    const s = requireStack();
    const hostEmail = uniqueEmail('iconhost');
    const playerEmail = uniqueEmail('iconplayer');
    createdIds.push((await createOnboardedUser(s, hostEmail)).id);
    createdIds.push((await createOnboardedUser(s, playerEmail)).id);
    const title = `E2E ikon ${hostEmail.slice(9, 17)}`;
    const eventId = await createPublishedEvent(s, hostEmail, title);

    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, playerEmail);
    const main = page.getByRole('main');
    const card = main.getByRole('link', { name: new RegExp(title) });
    await expect(card.locator('[data-testid="sport-icon-football"]')).toBeVisible();
    await expectNoBlocking(page);

    await card.click();
    await expect(page).toHaveURL(new RegExp(`/e/${eventId}$`));
    const detail = page.getByRole('main');
    await expect(detail.locator('[data-testid="sport-icon-football"]').first()).toBeVisible();

    // The action is pinned: it is on the first screen and still there after scrolling to the end.
    const join = detail.getByRole('button', { name: 'Katılım isteği gönder' });
    await expect(join).toBeInViewport({ ratio: 1 });
    await detail.getByText('Çankaya · ODTÜ Halı Saha 2').scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 2000);
    await expect(join).toBeInViewport({ ratio: 1 });
    await expectNoBlocking(page);

    // The request form opens inside the pinned area and still works.
    await join.click();
    await detail.getByLabel('Organizatöre mesaj (isteğe bağlı)').fill('Pinned form');
    await detail.getByRole('button', { name: 'İsteği gönder' }).click();
    await expect(detail.getByText('Onay bekleniyor', { exact: true })).toBeVisible();
  });
});

test.describe('invite-only events and the page for other viewers (Phase 3 completion)', () => {
  test('only the shared link opens an invite-only event; the roster shows once approved', async ({
    browser,
    page,
  }) => {
    const s = requireStack();
    const hostEmail = uniqueEmail('invhost');
    const playerEmail = uniqueEmail('invplayer');
    createdIds.push(
      (await createOnboardedUser(s, hostEmail, { displayName: 'Ayşe Düzenleyen' })).id,
    );
    createdIds.push(
      (await createOnboardedUser(s, playerEmail, { displayName: 'Deniz Oyuncu' })).id,
    );
    const title = `E2E davetli ${hostEmail.slice(8, 16)}`;
    const eventId = await createPublishedEvent(s, hostEmail, title, { inviteOnly: true });

    // Without the link the event does not exist.
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(`/e/${eventId}`);
    await expect(guestPage.getByText('Aradığın içerik bulunamadı.')).toBeVisible();

    // The organizer finds the link on the page, with the organizer's name and no roster yet.
    await signIn(page, hostEmail);
    await page.goto(`/e/${eventId}`);
    const hostMain = page.getByRole('main');
    await expect(hostMain.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(hostMain.getByRole('heading', { name: 'Davet bağlantısı' })).toBeVisible();
    const link = (
      await hostMain
        .getByText(/\/e\/.*\?invite=/)
        .first()
        .innerText()
    ).trim();
    expect(link).toContain(`/e/${eventId}?invite=`);
    await expectNoBlocking(page);

    // With the link a guest sees the event (not the secret address) and is asked to sign in to join.
    const path = link.slice(link.indexOf('/e/'));
    await guestPage.goto(path);
    const guestMain = guestPage.getByRole('main');
    await expect(guestMain.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(guestMain.getByText('Ayşe Düzenleyen')).toBeVisible();
    await expect(
      guestMain.getByRole('button', { name: 'Giriş yap ve katılım iste' }),
    ).toBeVisible();
    await guest.close();

    // A player with the link asks; the organizer approves; the player then sees the roster.
    const player = await browser.newContext();
    const playerPage = await player.newPage();
    await signIn(playerPage, playerEmail);
    await playerPage.goto(path);
    const playerMain = playerPage.getByRole('main');
    await playerMain.getByRole('button', { name: 'Katılım isteği gönder' }).click();
    await playerMain.getByRole('button', { name: 'İsteği gönder' }).click();
    await expect(playerMain.getByText('Onay bekleniyor', { exact: true })).toBeVisible();
    await expect(playerMain.getByText(/^Katılanlar/)).toHaveCount(0);

    await page.reload();
    await hostMain.getByRole('button', { name: 'Onayla' }).click();
    await expect(hostMain.getByText('Onaylı oyuncu (1)')).toBeVisible();

    await playerPage.goto(`/e/${eventId}`);
    await expect(playerMain.getByText('Katılım onaylandı', { exact: true })).toBeVisible();
    await expect(playerMain.getByText('Katılanlar (1)')).toBeVisible();
    await expect(playerMain.getByText('Deniz Oyuncu', { exact: true })).toBeVisible();
    await expectNoBlocking(playerPage);
    await player.close();
  });
});

test.describe('attendance (Phase 5 / M5a)', () => {
  test('organizer marks and finalizes; a marked-absent player disputes; a stranger sees nothing', async ({
    browser,
  }) => {
    const s = requireStack();
    const organizerEmail = uniqueEmail('att-org');
    const presentEmail = uniqueEmail('att-present');
    const absentEmail = uniqueEmail('att-absent');
    const strangerEmail = uniqueEmail('att-stranger');
    createdIds.push((await createOnboardedUser(s, organizerEmail)).id);
    for (const [email, displayName] of [
      [presentEmail, 'Gelen Oyuncu'],
      [absentEmail, 'Gelmeyen Oyuncu'],
      [strangerEmail, 'Yabancı'],
    ] as const) {
      createdIds.push((await createOnboardedUser(s, email, { displayName })).id);
    }
    const eventId = await createPublishedEvent(s, organizerEmail, 'Yoklama maçı');
    await joinApproved(s, eventId, presentEmail, organizerEmail);
    await joinApproved(s, eventId, absentEmail, organizerEmail);

    const open = async (email: string) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await signIn(page, email);
      await page.goto(`/e/${eventId}`);
      return { context, page };
    };

    // Before the start there is no attendance section at all.
    const early = await open(organizerEmail);
    await expect(early.page.getByRole('heading', { name: 'Yoklama maçı', level: 1 })).toBeVisible();
    await expect(early.page.getByRole('heading', { name: 'Yoklama', level: 2 })).toHaveCount(0);
    await early.context.close();

    startEvent(eventId);

    const organizer = await open(organizerEmail);
    const page = organizer.page;
    await expect(page.getByRole('heading', { name: 'Yoklama', level: 2 })).toBeVisible();
    const present = page.getByRole('radiogroup', { name: 'Gelen Oyuncu' });
    const absent = page.getByRole('radiogroup', { name: 'Gelmeyen Oyuncu' });
    await present.getByRole('radio', { name: 'Geldi' }).click();
    await expect(present.getByRole('radio', { name: 'Geldi' })).toBeChecked();
    await absent.getByRole('radio', { name: 'Gelmedi' }).click();
    await expect(absent.getByRole('radio', { name: 'Gelmedi' })).toBeChecked();
    await expectNoBlocking(page);
    await page.getByRole('button', { name: 'Yoklamayı kesinleştir' }).click();
    await page.getByRole('button', { name: 'Evet, kesinleştir' }).click();
    await expect(page.getByText('Gelmeyen Oyuncu: Gelmedi')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Geldi' })).toHaveCount(0);
    await organizer.context.close();

    const good = await open(presentEmail);
    await expect(good.page.getByText('Geldin olarak işaretlendin.')).toBeVisible();
    await expect(good.page.getByRole('button', { name: 'İtiraz et' })).toHaveCount(0);
    await good.context.close();

    const disputing = await open(absentEmail);
    await expect(disputing.page.getByText('Gelmedin olarak işaretlendin.')).toBeVisible();
    await disputing.page.getByRole('button', { name: 'İtiraz et' }).click();
    await disputing.page.getByLabel('Neden yanlış?').fill('Oradaydım, kaleciydim');
    await expectNoBlocking(disputing.page);
    await disputing.page.getByRole('button', { name: 'İtirazı gönder' }).click();
    await expect(disputing.page.getByText(/İtirazın inceleniyor/)).toBeVisible();
    await disputing.context.close();

    // A completed event does not exist for a stranger at all.
    const stranger = await open(strangerEmail);
    await expect(stranger.page.getByText('Aradığın içerik bulunamadı.')).toBeVisible();
    await expect(stranger.page.getByText('Katılımın')).toHaveCount(0);
    await stranger.context.close();
  });
});

test.describe('reviews (Phase 5 / M5b)', () => {
  test('a player reviews someone, sees it done, and the reviewee sees no sign of it', async ({
    page,
    browser,
  }) => {
    const s = requireStack();
    const organizerEmail = uniqueEmail('rev-org');
    const reviewerEmail = uniqueEmail('rev-a');
    const revieweeEmail = uniqueEmail('rev-b');
    createdIds.push(
      (await createOnboardedUser(s, organizerEmail, { displayName: 'Düzenleyen' })).id,
    );
    createdIds.push((await createOnboardedUser(s, reviewerEmail, { displayName: 'Yorumcu' })).id);
    createdIds.push(
      (await createOnboardedUser(s, revieweeEmail, { displayName: 'Yorumlanan' })).id,
    );
    const eventId = await createPublishedEvent(s, organizerEmail, 'Değerlendirme maçı');
    await joinApproved(s, eventId, reviewerEmail, organizerEmail);
    await joinApproved(s, eventId, revieweeEmail, organizerEmail);
    await finalizeAllPresent(s, eventId, organizerEmail);

    await signIn(page, reviewerEmail);
    await page.goto(`/e/${eventId}`);
    await expect(page.getByRole('heading', { name: 'Değerlendirme', level: 2 })).toBeVisible();
    const send = page.getByRole('button', { name: /Değerlendirmeleri gönder/ });
    await expect(send).toBeDisabled();
    const group = page.getByRole('radiogroup', { name: 'Yorumlanan' });
    await group.getByRole('radio', { name: '4' }).click();
    await page.getByRole('checkbox', { name: 'Yorumlanan centilmendi' }).click();
    await expectNoBlocking(page);
    await send.click();
    await expect(page.getByText('Yorumlanan: değerlendirildi')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Düzenleyen' })).toBeVisible();

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, revieweeEmail);
    await otherPage.goto(`/e/${eventId}`);
    await expect(otherPage.getByRole('radiogroup', { name: 'Yorumcu' })).toBeVisible();
    await expect(otherPage.getByText(/değerlendirildi/)).toHaveCount(0);
    await other.close();
  });
});

test.describe('progress on the profile (Phase 5 / M5c)', () => {
  test('a new player sees the empty states; after a game: level, badge and a provisional rating', async ({
    page,
  }) => {
    const s = requireStack();
    const organizerEmail = uniqueEmail('prog-org');
    const playerEmail = uniqueEmail('prog-a');
    const otherEmail = uniqueEmail('prog-b');
    createdIds.push((await createOnboardedUser(s, organizerEmail)).id);
    const player = await createOnboardedUser(s, playerEmail);
    createdIds.push(player.id);
    createdIds.push((await createOnboardedUser(s, otherEmail)).id);

    await signIn(page, playerEmail);
    await page.goto('/profile');
    await expect(page.getByText('Seviye 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Yeni oyuncu')).toBeVisible();
    await expect(page.getByText(/Henüz puanın yok/)).toBeVisible();
    await expect(page.getByText(/Henüz rozetin yok/)).toBeVisible();
    await expectNoBlocking(page);

    const eventId = await createPublishedEvent(s, organizerEmail, 'İlerleme maçı');
    await joinApproved(s, eventId, playerEmail, organizerEmail);
    await joinApproved(s, eventId, otherEmail, organizerEmail);
    await finalizeAllPresent(s, eventId, organizerEmail);
    setFootballRating(player.id, 3.33, 0.33333);

    await page.reload();
    // 50 attended + 30 first in sport + 50 FIRST_MATCH = 130 XP.
    await expect(page.getByText('Seviye 2', { exact: true })).toBeVisible();
    await expect(page.getByText(/130 XP/)).toBeVisible();
    await expect(page.getByText('İlk Maç', { exact: true })).toBeVisible();
    await expect(page.getByText('Futbol: 3,3')).toBeVisible();
    await expect(page.getByText(/Geçici: .*Kendi tahminin: 3,0/)).toBeVisible();
    await expect(page.getByText('Yeni oyuncu')).toBeVisible(); // one signal, below the three to show a percentage
    await expectNoBlocking(page);
  });
});

test.describe('the whole lifecycle (F-35)', () => {
  test('request → approve → full → waitlist → a player leaves → promote → attendance → notified → review → profile', async ({
    browser,
  }) => {
    test.setTimeout(120_000); // four signed-in browsers through a whole event
    const s = requireStack();
    const tag = uniqueEmail('x').slice(2, 10);
    const title = `Yaşam döngüsü ${tag}`;
    const emails = {
      host: uniqueEmail('life-host'),
      ada: uniqueEmail('life-ada'),
      bora: uniqueEmail('life-bora'),
      cem: uniqueEmail('life-cem'),
    };
    createdIds.push((await createOnboardedUser(s, emails.host, { displayName: 'Evsahibi' })).id);
    createdIds.push((await createOnboardedUser(s, emails.ada, { displayName: 'Ada' })).id);
    createdIds.push((await createOnboardedUser(s, emails.bora, { displayName: 'Bora' })).id);
    createdIds.push((await createOnboardedUser(s, emails.cem, { displayName: 'Cem' })).id);
    // Room for the organizer, who plays, and two players.
    const eventId = await createPublishedEvent(s, emails.host, title, {
      capacity: 3,
      sportSlug: 'running',
      formatSlug: 'group-run',
    });

    const open = async (email: string) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await signIn(page, email);
      await page.goto(`/e/${eventId}`);
      return { page, main: page.getByRole('main'), context };
    };
    const ada = await open(emails.ada);
    const bora = await open(emails.bora);
    const cem = await open(emails.cem);
    const host = await open(emails.host);

    // Two requests, two approvals: the event is full.
    for (const player of [ada, bora]) {
      await player.main.getByRole('button', { name: 'Katılım isteği gönder' }).click();
      await player.main.getByRole('button', { name: 'İsteği gönder' }).click();
      await expect(player.main.getByText('Onay bekleniyor', { exact: true })).toBeVisible();
    }
    await host.page.reload();
    await host.main.getByRole('button', { name: 'Onayla' }).first().click();
    await expect(host.main.getByText('2/3 kişi', { exact: true })).toBeVisible();
    await host.main.getByRole('button', { name: 'Onayla' }).first().click();
    await expect(host.main.getByText('3/3 kişi', { exact: true })).toBeVisible();

    // The third player can only join the waitlist.
    await cem.page.reload();
    // The form's send button keeps the waitlist wording.
    await cem.main.getByRole('button', { name: 'Yedek listeye başvur' }).click();
    await cem.main.getByLabel('Organizatöre mesaj (isteğe bağlı)').fill('Yer açılırsa gelirim');
    await cem.main.getByRole('button', { name: 'Yedek listeye başvur' }).click();
    await expect(cem.main.getByText('Yedek listedesin', { exact: true })).toBeVisible();

    // A player leaves; the organizer promotes the waitlisted one by an explicit tap.
    await bora.page.reload();
    await bora.main.getByRole('button', { name: 'Etkinlikten ayrıl' }).click();
    await expect(bora.main.getByRole('button', { name: 'Katılım isteği gönder' })).toBeVisible();
    await host.page.reload();
    await expect(host.main.getByText('2/3 kişi', { exact: true })).toBeVisible();
    await host.main.getByRole('button', { name: 'Onayla' }).click();
    await expect(host.main.getByText('3/3 kişi', { exact: true })).toBeVisible();

    // The game happens: attendance, then final.
    startEvent(eventId);
    await host.page.reload();
    for (const name of ['Ada', 'Cem']) {
      const row = host.main.getByRole('radiogroup', { name });
      await row.getByRole('radio', { name: 'Geldi' }).click();
      await expect(row.getByRole('radio', { name: 'Geldi' })).toBeChecked();
    }
    await host.main.getByRole('button', { name: 'Yoklamayı kesinleştir' }).click();
    await host.main.getByRole('button', { name: 'Evet, kesinleştir' }).click();
    await expect(host.main.getByText('Ada: Geldi')).toBeVisible();
    await expect(host.page.getByRole('status').first()).toBeVisible();

    // The player is told, follows the notification and reviews.
    await ada.page.goto('/notifications');
    await expect(ada.main.getByText(new RegExp(`${title} için yoklama kesinleşti`))).toBeVisible();
    await expectNoBlocking(ada.page);
    await ada.page.goto(`/e/${eventId}`);
    await expect(ada.main.getByText('Geldin olarak işaretlendin.')).toBeVisible();
    await ada.main
      .getByRole('radiogroup', { name: 'Cem' })
      .getByRole('radio', { name: '5' })
      .click();
    await ada.main.getByRole('button', { name: /Değerlendirmeleri gönder/ }).click();
    await expect(ada.main.getByText('Cem: değerlendirildi')).toBeVisible();

    // Bora left before the game: no attendance section, no review, no XP.
    await bora.page.goto('/profile');
    await expect(bora.page.getByText('Seviye 1', { exact: true })).toBeVisible();
    await expect(bora.page.getByText(/^0 XP/)).toBeVisible();

    // The player's progress: 50 attended + 30 first in sport + 50 FIRST_MATCH.
    await ada.page.goto('/profile');
    await expect(ada.page.getByText('Seviye 2', { exact: true })).toBeVisible();
    await expect(ada.page.getByText(/^130 XP/)).toBeVisible();
    await expect(ada.page.getByText('İlk Maç', { exact: true })).toBeVisible();

    for (const session of [ada, bora, cem, host]) await session.context.close();
  });
});
