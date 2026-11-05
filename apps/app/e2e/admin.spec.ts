import { AxeBuilder } from '@axe-core/playwright';
import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  createOnboardedUser,
  createPublishedEvent,
  deleteEventsOf,
  deleteUser,
  getLocalStack,
  makeAdmin,
  PASSWORD,
  reportAs,
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

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** RFC 6238: the six digits an authenticator app shows for this secret. */
function totp(secret: string, at = Date.now()) {
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) {
    bits += BASE32.indexOf(ch).toString(2).padStart(5, '0');
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
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
  expect(
    blocking.map(
      (v) => `${v.id}: ${v.help} (${v.nodes.length} nodes) ${v.nodes[0]?.html.slice(0, 160)}`,
    ),
  ).toEqual([]);
}

/** An administrator who has set up an authenticator and is in the console; returns the secret to answer it again. */
async function enterConsole(page: Page, email: string) {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'İkinci doğrulamayı kur' })).toBeVisible();
  const secret = (await page.getByTestId('totp-secret').innerText()).trim();
  await page.getByLabel('6 haneli kod').fill(totp(secret));
  await page.getByRole('button', { name: 'Doğrula' }).click();
  await expect(page.getByRole('heading', { name: 'Yönetim', level: 1 })).toBeVisible();
  return secret;
}

async function setup(label: string) {
  const s = requireStack();
  const adminEmail = uniqueEmail(`${label}-admin`);
  const organizerEmail = uniqueEmail(`${label}-org`);
  const organizerName = `Düzenleyen ${organizerEmail.slice(-20, -14)}`;
  const reporterEmail = uniqueEmail(`${label}-rep`);
  const boss = await createOnboardedUser(s, adminEmail, { displayName: 'Yönetici Ada' });
  const organizer = await createOnboardedUser(s, organizerEmail, {
    displayName: organizerName,
  });
  await createOnboardedUser(s, reporterEmail, { displayName: 'Bildiren Ece' });
  createdIds.push(boss.id, organizer.id);
  makeAdmin(boss.id);
  const title = `Yönetim ${label} ${organizerEmail.slice(-20, -14)}`;
  const eventId = await createPublishedEvent(s, organizerEmail, title);
  return {
    s,
    organizerName,
    adminEmail,
    organizerEmail,
    reporterEmail,
    organizerId: organizer.id,
    eventId,
    title,
  };
}

test.describe('the administration console', () => {
  test('is not there for a guest or an ordinary player', async ({ page }) => {
    const s = requireStack();
    const email = uniqueEmail('plain');
    createdIds.push((await createOnboardedUser(s, email)).id);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fadmin$/);

    await signIn(page, email);
    await page.getByRole('tab', { name: 'Profil' }).click();
    await expect(page.getByRole('button', { name: 'Çıkış yap' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yönetim', exact: true })).toHaveCount(0);
    await page.goto('/admin');
    await expect(page.getByText('Aradığın içerik bulunamadı.')).toBeVisible();
    await expect(page.getByRole('heading', { name: /doğrulama/i })).toHaveCount(0);
  });

  test('an administrator sets up the second step, answers it again later, and decides a report in three taps', async ({
    browser,
    page,
  }) => {
    test.setTimeout(120_000);
    const t = await setup('queue');
    await reportAs(t.s, t.reporterEmail, { type: 'EVENT', id: t.eventId }, 'FAKE_EVENT');

    await signIn(page, t.adminEmail);
    await page.getByRole('tab', { name: 'Profil' }).click();
    await page.getByRole('button', { name: 'Yönetim', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'İkinci doğrulamayı kur' })).toBeVisible();
    await expectNoBlocking(page);
    const secret = (await page.getByTestId('totp-secret').innerText()).trim();

    // A wrong code is refused and says so; the right one opens the console.
    await page.getByLabel('6 haneli kod').fill('000000');
    await page.getByRole('button', { name: 'Doğrula' }).click();
    await expect(page.getByText(/Kod yanlış ya da süresi dolmuş/)).toBeVisible();
    await page.getByLabel('6 haneli kod').fill(totp(secret));
    await page.getByRole('button', { name: 'Doğrula' }).click();
    await expect(page.getByRole('heading', { name: 'Yönetim', level: 1 })).toBeVisible();
    await expectNoBlocking(page);

    // Three taps from the list to a decision: open the report, dismiss, confirm.
    await page.getByRole('button', { name: new RegExp(`Etkinlik · ${t.title}`) }).click();
    await expect(page.getByText('Deneme bildirimi')).toBeVisible();
    await expectNoBlocking(page);
    await page.getByRole('button', { name: 'Reddet' }).click();
    await page.getByRole('button', { name: 'Evet', exact: true }).click();
    await expect(page.getByText('Karar kaydedildi.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: new RegExp(`Etkinlik · ${t.title}`) }),
    ).toHaveCount(0);

    // The reporter is thanked, and told nothing of what was decided.
    const reporter = await (await browser.newContext()).newPage();
    await signIn(reporter, t.reporterEmail);
    await reporter.goto('/notifications');
    await expect(reporter.getByText('Bildirimini inceledik. Teşekkürler.')).toBeVisible();
    await reporter.context().close();

    await page.getByRole('radio', { name: 'Kayıt', exact: true }).click();
    await expect(page.getByText('Bildirim kapatıldı').first()).toBeVisible();
    await expect(page.getByText(/^Yönetici Ada · /).first()).toBeVisible();

    // A new sign-in starts at the first factor again: the console asks for the code, and does not set up another.
    await page.getByRole('radio', { name: 'Bildirimler', exact: true }).click();
    await page.context().clearCookies();
    await page.evaluate(() => globalThis.localStorage.clear());
    await signIn(page, t.adminEmail);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'İkinci doğrulama', level: 1 })).toBeVisible();
    await page.getByLabel('6 haneli kod').fill(totp(secret, Date.now() + 30_000));
    await page.getByRole('button', { name: 'Doğrula' }).click();
    await expect(page.getByRole('heading', { name: 'Yönetim', level: 1 })).toBeVisible();
  });

  test('suspends a person and closes the report, and the person can no longer act', async ({
    browser,
    page,
  }) => {
    test.setTimeout(120_000);
    const t = await setup('suspend');
    await reportAs(t.s, t.reporterEmail, { type: 'USER', id: t.organizerId }, 'HARASSMENT');

    await signIn(page, t.adminEmail);
    await enterConsole(page, t.adminEmail);
    await page
      .getByRole('button', { name: new RegExp(`Kişi · ${t.organizerName}.*Taciz`) })
      .click();
    const suspend = page.getByRole('button', { name: 'Askıya al ve kapat' });
    await expect(suspend).toBeDisabled();
    await page.getByLabel('Karar notu').fill('Tekrarlanan taciz');
    await suspend.click();
    await page.getByRole('button', { name: 'Evet', exact: true }).click();
    await expect(page.getByText('Karar kaydedildi.')).toBeVisible();

    await page.getByRole('radio', { name: 'Kişiler', exact: true }).click();
    await page.getByLabel('Kişi ara').fill(t.organizerName);
    await page.getByRole('button', { name: 'Ara', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`${t.organizerName} · Askıda`) }).click();
    await expect(page.getByText('Durum: Askıda')).toBeVisible();
    await expect(page.getByText('Tekrarlanan taciz').first()).toBeVisible();
    await expectNoBlocking(page);

    // The suspended person is refused on the server, whatever the screen shows.
    const base = { apikey: t.s.anonKey, 'content-type': 'application/json' };
    const signed = await fetch(`${t.s.apiUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: base,
      body: JSON.stringify({ email: t.organizerEmail, password: PASSWORD }),
    });
    const { access_token: token } = (await signed.json()) as { access_token: string };
    const refused = await fetch(`${t.s.apiUrl}/rest/v1/rpc/request_join`, {
      method: 'POST',
      headers: { ...base, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ p_event_id: t.eventId }),
    });
    expect(((await refused.json()) as { message: string }).message).toBe('ACCOUNT_RESTRICTED');

    // And the app tells them that, and only that.
    const suspended = await (await browser.newContext()).newPage();
    await signIn(suspended, t.organizerEmail);
    await suspended.getByRole('tab', { name: 'Profil' }).click();
    await expect(suspended.getByText('Hesabın askıya alındı')).toBeVisible();
    await expect(suspended.getByRole('button', { name: 'Çıkış yap' })).toBeVisible();
    await expectNoBlocking(suspended);
    await suspended.context().close();
  });
});
