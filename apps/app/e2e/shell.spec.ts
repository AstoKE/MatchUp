import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('tablist').first();

test.describe('guest browsing (D-09)', () => {
  test('opens Discover without an account and shows the Turkish-first UI', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Keşfet', level: 1 })).toBeVisible();
    await expect(page.getByText('Ankara', { exact: true })).toBeVisible();
    // The list depends on what the database holds; the filters appear once Discover has loaded.
    await page.getByRole('button', { name: 'Tüm sporlar', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Bugün' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  });

  test('shows the four MVP destinations with accessible names', async ({ page }) => {
    await page.goto('/');
    for (const name of ['Keşfet', 'Etkinliklerim', 'Oluştur', 'Profil']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
    await expect(page.getByRole('tab')).toHaveCount(4);
    await expect(page.getByRole('tab', { name: 'Topluluk' })).toHaveCount(0);
  });

  test('English is used when the browser language is English', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Discover', level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await context.close();
  });
});

test.describe('protected routes', () => {
  test('a guest tapping My Events is sent to sign-in with a return path', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Etkinliklerim' }).click();
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fmy-events$/);
  });

  test('direct deep link to a protected route also redirects', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fprofile$/);
  });
});

test.describe('deep links and errors', () => {
  test('an event deep link to an unknown event shows the honest not-found state', async ({
    page,
  }) => {
    await page.goto('/e/00000000-0000-0000-0000-000000000000');
    await expect(page.getByRole('heading', { name: 'Aradığın içerik bulunamadı.' })).toBeVisible();
  });

  test('unknown routes show not-found with a way home', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Aradığın içerik bulunamadı.' })).toBeVisible();
    await page.getByRole('button', { name: 'Keşfet' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('responsive navigation', () => {
  const cases = [
    { name: 'compact (375px): bottom tab bar', width: 375, height: 800, position: 'bottom' },
    { name: 'medium (800px): left rail', width: 800, height: 800, position: 'left' },
    { name: 'expanded (1280px): left rail', width: 1280, height: 800, position: 'left' },
  ] as const;

  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await page.setViewportSize({ width: c.width, height: c.height });
      await page.goto('/');
      await expect(page.getByRole('tab', { name: 'Keşfet' })).toBeVisible();
      const box = await nav(page).boundingBox();
      expect(box).not.toBeNull();
      if (c.position === 'bottom') {
        expect(box!.y).toBeGreaterThan(c.height / 2);
        expect(box!.width).toBeGreaterThan(c.width * 0.9);
      } else {
        expect(box!.x).toBeLessThan(40);
        expect(box!.width).toBeLessThan(c.width / 2);
        expect(box!.height).toBeGreaterThan(c.height / 2);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, 'no horizontal page scroll').toBe(false);
    });
  }
});

test.describe('keyboard and landmarks', () => {
  test('skip link is the first tab stop and moves focus to the main landmark', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible(); // SPA rendered before we use the keyboard
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'İçeriğe geç' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main').first()).toBeFocused();
  });

  test('tabs are reachable and activatable with the keyboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Keşfet' }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tab', { name: 'Etkinliklerim' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/sign-in/);
  });

  test('exactly one visible main landmark on a page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main')).toHaveCount(1);
  });
});

test.describe('accessibility (axe, WCAG 2.2 AA tags)', () => {
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  for (const path of ['/', '/e/abc', '/does-not-exist']) {
    test(`no serious or critical violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      const blocking = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      );
      expect(
        blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`),
        'blocking axe violations',
      ).toEqual([]);
    });
  }
});
