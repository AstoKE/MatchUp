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
 * Phase 7 / M5 (F-33): the main path with the keyboard only (no mouse, no clicks): sign in, choose a sport on Discover,
 * open an event and send a join request. Every step moves focus with Tab and acts with Enter or Space, and the focused
 * element is always visible.
 */
const stack: LocalStack | null = getLocalStack();
test.skip(!stack && process.env.REQUIRE_STACK !== '1', 'local Supabase stack is not running');

const createdIds: string[] = [];
test.afterAll(async () => {
  for (const id of createdIds) deleteEventsOf(id);
  if (stack) await Promise.all(createdIds.map((id) => deleteUser(stack, id)));
});

/** Presses Tab until the focused element has this accessible name (at most `limit` times). */
async function tabTo(page: Page, name: RegExp, limit = 60) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return '';
      const labelledBy = el.getAttribute('aria-labelledby');
      const byId = labelledBy ? document.getElementById(labelledBy)?.textContent : null;
      return el.getAttribute('aria-label') ?? byId ?? el.innerText ?? '';
    });
    if (name.test(label.trim())) {
      // The focused element is on screen.
      await expect(page.locator(':focus')).toBeInViewport();
      return;
    }
  }
  throw new Error(`Tab never reached ${name}`);
}

test('sign in, choose a sport, open an event and ask to join, with the keyboard only', async ({
  page,
}) => {
  if (!stack) throw new Error('REQUIRE_STACK=1 but the local Supabase stack is not running');
  const host = uniqueEmail('kbd-host');
  const player = uniqueEmail('kbd-player');
  createdIds.push((await createOnboardedUser(stack, host)).id);
  createdIds.push((await createOnboardedUser(stack, player, { displayName: 'Klavye Oyuncu' })).id);
  const title = `Klavye maçı ${host.slice(9, 17)}`;
  await createPublishedEvent(stack, host, title);

  await page.goto('/sign-in');
  // Tabbing starts once the page is there.
  await expect(page.getByLabel('E-posta', { exact: true })).toBeVisible();
  await tabTo(page, /^E-posta$/);
  await page.keyboard.type(player);
  await tabTo(page, /^Şifre$/);
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Keşfet' })).toBeVisible();

  // The first visit asks for a sport.
  await expect(page.getByRole('heading', { name: /Hangi sahada/ })).toBeVisible();
  await tabTo(page, /^Futbol$/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();

  await tabTo(page, new RegExp(title));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Katılım isteği gönder' })).toBeVisible();
  await tabTo(page, /^Katılım isteği gönder$/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'İstek gönder' })).toBeVisible();
  await tabTo(page, /^İstek gönder$/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'İsteğin gönderildi', level: 1 })).toBeVisible();
});
