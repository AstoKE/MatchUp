import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
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
 * The redesign's validation (docs/design.md §9 rule 7): the main screens from the smallest phone to a desktop, in both
 * themes. 320 px is also what 200 % browser zoom gives a 640 px window (WCAG 1.4.10 reflow). Checks layout and contrast
 * rules, not pixels: font rendering differs between machines, so stored screenshots would fail for the wrong reasons.
 */
const stack: LocalStack | null = getLocalStack();
test.skip(!stack && process.env.REQUIRE_STACK !== '1', 'local Supabase stack is not running');

const createdIds: string[] = [];
test.afterAll(async () => {
  for (const id of createdIds) deleteEventsOf(id);
  if (stack) await Promise.all(createdIds.map((id) => deleteUser(stack, id)));
});

async function expectSound(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `${where}: no sideways scrolling`).toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  expect(
    blocking.map((v) => `${where}: ${v.id} (${v.nodes.length} nodes)`),
    'no serious accessibility problems',
  ).toEqual([]);
}

/** Scrolled to the end, the page's last control is not under the floating dock. */
async function expectClearOfDock(page: Page, last: Locator) {
  await last.scrollIntoViewIfNeeded();
  await page.getByRole('main').evaluate((main) => {
    for (const el of main.querySelectorAll('*')) el.scrollTop = el.scrollHeight;
  });
  const [item, dock] = await Promise.all([
    last.boundingBox(),
    page.getByRole('tablist').boundingBox(),
  ]);
  expect((item?.y ?? 0) + (item?.height ?? 0)).toBeLessThanOrEqual(dock?.y ?? 0);
}

for (const [label, width, height, colorScheme] of [
  ['smallest phone, dark', 320, 640, 'dark'],
  ['phone, light', 390, 800, 'light'],
  ['tablet, light', 820, 1000, 'light'],
  ['desktop, dark', 1280, 800, 'dark'],
] as const) {
  test(`the main screens hold up: ${label}`, async ({ browser }) => {
    test.setTimeout(120_000);
    if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
    const email = uniqueEmail('responsive');
    createdIds.push((await createOnboardedUser(stack, email, { displayName: 'Ece Yılmaz' })).id);
    const eventId = await createPublishedEvent(stack, email, `Görünüm ${email.slice(11, 19)}`);

    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme,
      locale: 'tr-TR',
    });
    const page = await context.newPage();

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Hangi sahada/, level: 1 })).toBeVisible();
    await expectSound(page, 'Discover, choosing a sport');
    await expectClearOfDock(page, page.getByRole('button', { name: 'Tüm sporlar', exact: true }));
    await page.getByRole('button', { name: 'Tüm sporlar', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Tüm sporlar', exact: true })).toBeChecked();
    await expectSound(page, 'Discover');

    await page.goto('/sign-in');
    await page.getByLabel('E-posta', { exact: true }).fill(email);
    await page.getByLabel('Şifre', { exact: true }).fill(PASSWORD);
    await expectSound(page, 'sign-in');
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page.getByRole('tab', { name: 'Keşfet' })).toBeVisible();

    const screens: [string, string, string][] = [
      ['event', `/e/${eventId}`, 'Etkinliği yönet'],
      ['manage', `/e/${eventId}/manage`, 'Etkinliği yönet'],
      ['create', '/create', 'Etkinlik oluştur'],
      ['my events', '/my-events', 'Etkinliklerim'],
      ['profile', '/profile', 'İlerlemen'],
      ['settings', '/settings', 'Ayarlar'],
      ['notifications', '/notifications', 'Bildirimler'],
    ];
    for (const [name, path, marker] of screens) {
      await page.goto(path);
      await expect(page.getByText(marker).first()).toBeVisible();
      await expectSound(page, name);
    }
    await context.close();
  });
}

test('on a desktop every filter chip can be reached with a mouse, without sideways scrolling', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Tüm sporlar', exact: true }).click();
  // The last sport in the catalog: on one scrolling line it would be out of view.
  const chips = page.getByRole('main').getByRole('radio');
  await expect(chips.last()).toBeVisible();
  await expect(chips.last()).toBeInViewport({ ratio: 1 });
  await context.close();
});
