import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createOnboardedUser,
  createPublishedEvent,
  createVerifiedUser,
  deleteEventsOf,
  deleteUser,
  getLocalStack,
  joinApproved,
  PASSWORD,
  requestToJoin,
  revokeLegalConsent,
  uniqueEmail,
  type LocalStack,
} from './support/stack';

/**
 * Phase 7 / M5 (F-33): every route of the app, at a phone width and a desktop width, through axe with the WCAG 2.2 AA
 * tags. The flows elsewhere run axe at their key steps; this makes sure no screen is left out. The admin console has its
 * own axe checks in admin.spec.ts (it needs a second factor).
 */
const stack: LocalStack | null = getLocalStack();
test.skip(!stack && process.env.REQUIRE_STACK !== '1', 'local Supabase stack is not running');

const createdIds: string[] = [];
test.afterAll(async () => {
  for (const id of createdIds) deleteEventsOf(id);
  if (stack) await Promise.all(createdIds.map((id) => deleteUser(stack, id)));
});

const WIDTHS = [
  { name: 'phone', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
] as const;

async function expectNoBlocking(page: Page, route: string) {
  await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 15_000 });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  expect(
    blocking.map(
      (v) => `${route}: ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`,
    ),
  ).toEqual([]);
}

async function signedIn(
  browser: Browser,
  email: string,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    viewport,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  });
  const page = await context.newPage();
  await page.goto('/sign-in');
  await page.getByLabel('E-posta', { exact: true }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('tab', { name: 'Keşfet' })).toBeVisible();
  return page;
}

for (const width of WIDTHS) {
  test.describe(`every route at ${width.name} width`, () => {
    test('guest routes', async ({ browser }) => {
      if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
      const host = uniqueEmail(`a11y-g-${width.name}`);
      createdIds.push(
        (await createOnboardedUser(stack, host, { displayName: 'Erişim Düzenleyen' })).id,
      );
      const eventId = await createPublishedEvent(stack, host, `Erişilebilirlik ${width.name}`);
      const context = await browser.newContext({ viewport: width.viewport, locale: 'tr-TR' });
      const page = await context.newPage();
      // A sport chosen once, so Discover shows its list rather than the first-visit question (that one is in events.spec).
      await page.goto('/');
      await page.getByRole('button', { name: 'Tüm sporlar', exact: true }).click();
      for (const route of [
        '/',
        '/sign-in',
        '/sign-up',
        '/forgot-password',
        '/legal/terms',
        '/legal/privacy',
        `/e/${eventId}`,
      ]) {
        await page.goto(route);
        await expectNoBlocking(page, route);
      }
      await context.close();
    });

    test('an organizer’s routes', async ({ browser }) => {
      test.setTimeout(120_000);
      if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
      const host = uniqueEmail(`a11y-o-${width.name}`);
      const player = uniqueEmail(`a11y-p-${width.name}`);
      createdIds.push(
        (await createOnboardedUser(stack, host, { displayName: 'Erişim Düzenleyen' })).id,
      );
      const playerId = (await createOnboardedUser(stack, player, { displayName: 'Erişim Oyuncu' }))
        .id;
      createdIds.push(playerId);
      const eventId = await createPublishedEvent(stack, host, `Erişilebilirlik ${width.name}`);
      await joinApproved(stack, eventId, player, host);
      const page = await signedIn(browser, host, width.viewport);
      for (const route of [
        '/',
        '/create',
        '/my-events',
        '/notifications',
        '/profile',
        '/settings',
        '/edit-profile',
        '/edit-sports',
        '/delete-account',
        `/e/${eventId}`,
        `/e/${eventId}/manage`,
        `/e/${eventId}/edit`,
        `/e/${eventId}/cancel`,
        `/u/${playerId}`,
      ]) {
        await page.goto(route);
        await expectNoBlocking(page, route);
      }
      await page.context().close();
    });

    test('a player’s request screens, onboarding and the re-consent screen', async ({
      browser,
    }) => {
      test.setTimeout(120_000);
      if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
      const host = uniqueEmail(`a11y-h-${width.name}`);
      const player = uniqueEmail(`a11y-r-${width.name}`);
      createdIds.push((await createOnboardedUser(stack, host)).id);
      const playerId = (await createOnboardedUser(stack, player, { displayName: 'Erişim İsteyen' }))
        .id;
      createdIds.push(playerId);
      const open = await createPublishedEvent(stack, host, `Açık ${width.name}`);
      const asked = await createPublishedEvent(stack, host, `İstenen ${width.name}`);
      await requestToJoin(stack, asked, player);

      const page = await signedIn(browser, player, width.viewport);
      for (const route of [`/e/${open}/join`, `/e/${asked}/requested`]) {
        await page.goto(route);
        await expectNoBlocking(page, route);
      }
      revokeLegalConsent(playerId);
      await page.goto('/consent-update');
      await expectNoBlocking(page, '/consent-update');
      await page.context().close();

      // Someone verified but not onboarded yet.
      const fresh = uniqueEmail(`a11y-n-${width.name}`);
      const freshId = (await createVerifiedUser(stack, fresh)).id;
      createdIds.push(freshId);
      const context = await browser.newContext({ viewport: width.viewport, locale: 'tr-TR' });
      const newcomer = await context.newPage();
      await newcomer.goto('/sign-in');
      await newcomer.getByLabel('E-posta', { exact: true }).fill(fresh);
      await newcomer.getByLabel('Şifre', { exact: true }).fill(PASSWORD);
      await newcomer.getByRole('button', { name: 'Giriş yap' }).click();
      await newcomer.goto('/onboarding');
      await expectNoBlocking(newcomer, '/onboarding');
      await context.close();
    });
  });
}
